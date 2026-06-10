from __future__ import annotations

import shutil
import subprocess
from collections.abc import Iterator
from datetime import timedelta
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4

from fastapi import BackgroundTasks, Request
from fastapi.responses import Response, StreamingResponse
from jose import JWTError, jwt

from app.core.config import settings
from app.core.database import MongoDatabase, get_database
from app.core.errors import AppError, ErrorCode
from app.core.security import ALGORITHM, now_utc
from app.models.upload import UploadedFile
from app.services.file_storage import resolve_storage_path, storage_relative_path
from app.services.membership_service import assert_dataset_storage_capacity
from app.services.upload_service import get_uploaded_file, safe_storage_path_segment

VIDEO_PREVIEW_STATUSES = {"not_required", "pending", "processing", "ready", "failed", "not_configured"}
NATIVE_VIDEO_CONTENT_TYPES = {"video/mp4", "video/webm", "video/ogg", "video/ogv", "video/3gpp", "video/x-m4v"}
UNSUPPORTED_PREVIEW_CONTENT_TYPES = {"video/avi", "video/x-msvideo", "video/msvideo", "video/x-matroska", "video/quicktime"}
VIDEO_EXTENSIONS = {".mp4", ".m4v", ".webm", ".ogv", ".ogg", ".3gp", ".avi", ".mkv", ".mov"}
PLAYBACK_TOKEN_TTL_MINUTES = 10
CHUNK_SIZE = 1024 * 1024


def ensure_video_preview(
    db: MongoDatabase,
    *,
    team_id: str,
    file_id: str,
    background_tasks: BackgroundTasks,
    request: Request,
) -> dict:
    item = get_uploaded_file(db, team_id=team_id, file_id=file_id)
    if not is_video_upload(item):
        raise AppError(ErrorCode.VALIDATION_FORMAT, "文件不是视频")
    if is_native_browser_video(item):
        return video_preview_payload(item, "not_required", playback_url=signed_playback_url(request, item, "original"))
    if item.preview_status == "ready" and item.preview_path:
        return video_preview_payload(item, "ready", playback_url=signed_playback_url(request, item, "preview"))
    if item.preview_status == "processing" and not preview_processing_is_stale(item):
        return video_preview_payload(item, "processing")
    tool_error = video_preview_tooling_error()
    if tool_error:
        item.preview_status = "not_configured"
        item.preview_error = tool_error
        item.preview_updated_at = now_utc().replace(tzinfo=None)
        db.save(item)
        db.commit()
        return video_preview_payload(item, "not_configured")

    item.preview_status = "processing"
    item.preview_error = ""
    item.preview_updated_at = now_utc().replace(tzinfo=None)
    db.save(item)
    db.commit()
    background_tasks.add_task(process_video_preview_background, file_id)
    return video_preview_payload(item, "processing")


def video_preview_status(db: MongoDatabase, *, team_id: str, file_id: str, request: Request) -> dict:
    item = get_uploaded_file(db, team_id=team_id, file_id=file_id)
    if not is_video_upload(item):
        raise AppError(ErrorCode.VALIDATION_FORMAT, "文件不是视频")
    if is_native_browser_video(item):
        return video_preview_payload(item, "not_required", playback_url=signed_playback_url(request, item, "original"))
    if item.preview_status == "ready" and item.preview_path:
        return video_preview_payload(item, "ready", playback_url=signed_playback_url(request, item, "preview"))
    status = item.preview_status if item.preview_status in VIDEO_PREVIEW_STATUSES else "pending"
    if status == "processing" and preview_processing_is_stale(item):
        mark_preview_failed(db, item, "transcode_interrupted")
        status = "failed"
    return video_preview_payload(item, status)


def preview_processing_is_stale(item: UploadedFile) -> bool:
    updated_at = item.preview_updated_at
    if not updated_at:
        return True
    age = now_utc().replace(tzinfo=None) - updated_at
    stale_after = max(60, min(int(settings.video_preview_timeout_seconds or 600), 300))
    return age.total_seconds() > stale_after


def process_video_preview_background(file_id: str) -> None:
    db = get_database()
    item = db.get(UploadedFile, file_id)
    if not item or not is_video_upload(item) or is_native_browser_video(item):
        return
    if item.preview_status == "ready" and item.preview_path:
        return
    ffmpeg = configured_ffmpeg_path()
    if not ffmpeg:
        mark_preview_failed(db, item, "ffmpeg_not_configured", status="not_configured")
        return
    ffprobe = configured_ffprobe_path()
    if not ffprobe:
        mark_preview_failed(db, item, "ffprobe_not_configured", status="not_configured")
        return
    temp_path: Path | None = None
    try:
        source_path = resolve_storage_path(item.path, must_exist=True)
        target_rel = f"video-previews/{safe_storage_path_segment(item.team_id)}/{item.id}.mp4"
        temp_rel = f"video-previews/{safe_storage_path_segment(item.team_id)}/{item.id}.{uuid4().hex}.tmp.mp4"
        target_path = resolve_storage_path(target_rel, must_exist=False)
        temp_path = resolve_storage_path(temp_rel, must_exist=False)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        if temp_path.exists():
            temp_path.unlink()

        subprocess.run(ffprobe_command(ffprobe, source_path), check=True, capture_output=True, timeout=settings.video_preview_timeout_seconds)
        command = ffmpeg_command(ffmpeg, source_path, temp_path)
        subprocess.run(command, check=True, capture_output=True, timeout=settings.video_preview_timeout_seconds)
        if not temp_path.exists() or temp_path.stat().st_size <= 0:
            raise RuntimeError("empty_preview")
        preview_size = temp_path.stat().st_size
        assert_dataset_storage_capacity(db, item.team_id, incoming_bytes=preview_size)
        temp_path.replace(target_path)
        item.preview_status = "ready"
        item.preview_path = storage_relative_path(target_path)
        item.preview_content_type = "video/mp4"
        item.preview_size = preview_size
        item.preview_error = ""
        item.preview_updated_at = now_utc().replace(tzinfo=None)
        db.save(item)
        db.commit()
    except AppError as exc:
        if temp_path:
            cleanup_path(temp_path)
        mark_preview_failed(db, item, "quota_exceeded" if exc.code == ErrorCode.BUSINESS_RULE else "source_missing")
    except (OSError, RuntimeError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        if temp_path:
            cleanup_path(temp_path)
        mark_preview_failed(db, item, "transcode_failed")


def ffmpeg_command(ffmpeg: str, source_path: Path, output_path: Path) -> list[str]:
    max_width = max(320, int(settings.video_preview_max_width or 1280))
    scale_filter = f"scale=trunc(min({max_width}\\,iw)/2)*2:-2"
    return [
        ffmpeg,
        "-y",
        "-i",
        str(source_path),
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-vf",
        scale_filter,
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        str(output_path),
    ]


def ffprobe_command(ffprobe: str, source_path: Path) -> list[str]:
    return [
        ffprobe,
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_type,width,height",
        "-of",
        "json",
        str(source_path),
    ]


def playback_response(db: MongoDatabase, *, file_id: str, token: str, range_header: str | None) -> Response | StreamingResponse:
    payload = decode_playback_token(token)
    if payload.get("sub") != file_id or payload.get("typ") != "media_playback":
        raise AppError(ErrorCode.PERMISSION_DENIED, "播放凭证无效")
    item = db.get(UploadedFile, file_id)
    if not item or item.team_id != payload.get("team_id"):
        raise AppError(ErrorCode.NOT_FOUND, "文件不存在")
    variant = str(payload.get("variant") or "original")
    if variant == "preview":
        if item.preview_status != "ready" or not item.preview_path:
            raise AppError(ErrorCode.NOT_FOUND, "视频预览不存在")
        return storage_streaming_response(
            item.preview_path,
            content_type=item.preview_content_type or "video/mp4",
            filename=f"{Path(item.filename).stem or item.id}.preview.mp4",
            range_header=range_header,
        )
    return storage_streaming_response(item.path, content_type=item.content_type, filename=item.filename, range_header=range_header)


def storage_streaming_response(relative_path: str, *, content_type: str, filename: str, range_header: str | None) -> Response | StreamingResponse:
    path = resolve_storage_path(relative_path, must_exist=True)
    file_size = path.stat().st_size
    start, end, partial = parse_range_header(range_header, file_size)
    if start >= file_size:
        return Response(status_code=416, headers={"Content-Range": f"bytes */{file_size}", "Accept-Ranges": "bytes"})
    length = end - start + 1
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(length),
        "Content-Disposition": f"inline; filename=\"{ascii_filename(filename)}\"; filename*=UTF-8''{quote(filename)}",
    }
    status_code = 206 if partial else 200
    if partial:
        headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
    return StreamingResponse(file_iterator(path, start, end), status_code=status_code, media_type=content_type, headers=headers)


def parse_range_header(range_header: str | None, file_size: int) -> tuple[int, int, bool]:
    if not range_header or not range_header.startswith("bytes="):
        return 0, max(file_size - 1, 0), False
    spec = range_header.removeprefix("bytes=").split(",", 1)[0].strip()
    if "-" not in spec:
        return 0, max(file_size - 1, 0), False
    start_text, end_text = spec.split("-", 1)
    try:
        if not start_text:
            suffix_length = max(0, int(end_text))
            start = max(file_size - suffix_length, 0)
            end = max(file_size - 1, 0)
        else:
            start = max(0, int(start_text))
            end = min(int(end_text), file_size - 1) if end_text else max(file_size - 1, 0)
    except ValueError:
        return 0, max(file_size - 1, 0), False
    if end < start:
        end = start
    return start, end, True


def file_iterator(path: Path, start: int, end: int) -> Iterator[bytes]:
    with path.open("rb") as handle:
        handle.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            chunk = handle.read(min(CHUNK_SIZE, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


def signed_playback_url(request: Request, item: UploadedFile, variant: str) -> str:
    token = create_playback_token(item, variant)
    return str(request.url_for("playback_file_route", file_id=item.id).include_query_params(token=token))


def create_playback_token(item: UploadedFile, variant: str) -> str:
    now = now_utc()
    return jwt.encode(
        {
            "sub": item.id,
            "typ": "media_playback",
            "team_id": item.team_id,
            "variant": variant,
            "exp": now + timedelta(minutes=PLAYBACK_TOKEN_TTL_MINUTES),
            "iat": now,
        },
        settings.secret_key,
        algorithm=ALGORITHM,
    )


def decode_playback_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise AppError(ErrorCode.PERMISSION_DENIED, "播放凭证无效") from exc


def video_preview_payload(item: UploadedFile, status: str, *, playback_url: str | None = None) -> dict:
    payload = {
        "file_id": item.id,
        "status": status,
        "content_type": item.content_type,
        "preview_content_type": item.preview_content_type or None,
        "preview_size": item.preview_size or 0,
        "preview_error": item.preview_error or None,
        "updated_at": item.preview_updated_at.isoformat() if item.preview_updated_at else None,
    }
    if playback_url:
        payload["playback_url"] = playback_url
    return payload


def mark_preview_failed(db: MongoDatabase, item: UploadedFile, error: str, *, status: str = "failed") -> None:
    item.preview_status = status
    item.preview_error = error
    item.preview_updated_at = now_utc().replace(tzinfo=None)
    db.save(item)
    db.commit()


def cleanup_path(path: Path) -> None:
    try:
        if path.exists():
            path.unlink()
    except OSError:
        return


def configured_ffmpeg_path() -> str:
    return configured_executable_path(settings.ffmpeg_path, "ffmpeg")


def configured_ffprobe_path() -> str:
    return configured_executable_path(settings.ffprobe_path, "ffprobe")


def video_preview_tooling_error() -> str:
    if not configured_ffmpeg_path():
        return "ffmpeg_not_configured"
    if not configured_ffprobe_path():
        return "ffprobe_not_configured"
    return ""


def configured_executable_path(configured: str | None, fallback_name: str) -> str:
    value = (configured or "").strip()
    if value:
        return shutil.which(value) or ""
    return shutil.which(fallback_name) or ""


def is_video_upload(item: UploadedFile) -> bool:
    content_type = (item.content_type or "").split(";", 1)[0].strip().lower()
    return content_type.startswith("video/") or Path(item.filename or "").suffix.lower() in VIDEO_EXTENSIONS


def is_native_browser_video(item: UploadedFile) -> bool:
    content_type = (item.content_type or "").split(";", 1)[0].strip().lower()
    suffix = Path(item.filename or "").suffix.lower()
    if content_type in NATIVE_VIDEO_CONTENT_TYPES:
        return True
    if content_type in UNSUPPORTED_PREVIEW_CONTENT_TYPES:
        return False
    return suffix in {".mp4", ".m4v", ".webm", ".ogv", ".ogg", ".3gp"}


def ascii_filename(filename: str) -> str:
    return filename.encode("ascii", "ignore").decode("ascii") or "video"
