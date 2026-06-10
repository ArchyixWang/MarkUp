from __future__ import annotations

import re

from fastapi import Request, UploadFile

from app.core.database import MongoDatabase
from app.core.errors import AppError, ErrorCode
from app.models.production import Question
from app.models.upload import UploadedFile
from app.services.audit_service import write_audit_log
from app.services.file_storage import read_storage_file, write_storage_file
from app.services.membership_service import assert_dataset_storage_capacity
from app.services.production_service import assert_production_switch_enabled

MAX_UPLOAD_BYTES = 1024 * 1024 * 1024
MAX_AGENT_AVATAR_BYTES = 2 * 1024 * 1024
ALLOWED_CATEGORIES = {"image", "document", "dataset", "template", "verification", "media", "other"}
PROFILE_AVATAR_CONTENT_TYPES = {"image/jpeg", "image/png", "image/gif"}
PROFILE_MATERIAL_CONTENT_TYPES = {"image/jpeg", "image/png", "image/gif", "application/pdf"}
TEAM_DOCUMENT_CONTENT_TYPES = {"application/pdf"}
DANGEROUS_UPLOAD_EXTENSIONS = {"bat", "cmd", "com", "dll", "exe", "htm", "html", "js", "msi", "ps1", "scr", "sh", "svg", "vbs", "xhtml"}
DANGEROUS_UPLOAD_CONTENT_TYPES = {
    "application/octet-stream",
    "application/ecmascript",
    "application/javascript",
    "application/xhtml+xml",
    "application/x-msdownload",
    "application/x-msdos-program",
    "application/x-msi",
    "application/x-javascript",
    "application/x-sh",
    "application/x-shellscript",
    "image/svg+xml",
    "text/ecmascript",
    "text/html",
    "text/javascript",
}
SAFE_MEDIA_UPLOAD_EXTENSIONS = {
    "aac",
    "avi",
    "flac",
    "gif",
    "jpeg",
    "jpg",
    "m4a",
    "m4v",
    "mkv",
    "mov",
    "mp3",
    "mp4",
    "ogg",
    "opus",
    "png",
    "wav",
    "webm",
    "webp",
    "3gp",
}


async def create_upload(
    db: MongoDatabase,
    *,
    team_id: str,
    owner_id: str,
    file: UploadFile,
    category: str,
    request: Request,
) -> dict:
    assert_production_switch_enabled(db, "upload")
    normalized_category = category if category in ALLOWED_CATEGORIES else "other"
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise AppError(ErrorCode.VALIDATION_RANGE, "单文件最大 1GB")
    if is_team_storage_upload(team_id):
        assert_dataset_storage_capacity(db, team_id, incoming_bytes=len(content))
    filename = safe_filename(file.filename or "upload.bin")
    if is_dangerous_upload(filename, raw_upload_content_type(file.content_type)):
        raise AppError(ErrorCode.VALIDATION_RANGE, "不支持上传可执行文件")
    content_type = normalize_upload_content_type(filename, file.content_type)
    if is_dangerous_upload(filename, content_type):
        raise AppError(ErrorCode.VALIDATION_RANGE, "不支持上传可执行文件")
    if not team_id.startswith("profile:") and normalized_category == "image" and not is_allowed_image_upload(filename, content_type):
        raise AppError(ErrorCode.VALIDATION_RANGE, "图片上传仅支持匹配的 JPG、PNG 或 GIF 文件")
    if not team_id.startswith("profile:") and normalized_category in {"document", "verification"} and not is_allowed_team_document(filename, content_type):
        raise AppError(ErrorCode.VALIDATION_RANGE, "文档上传仅支持匹配的 PDF 文件")
    if team_id.startswith("profile:") and not is_allowed_profile_avatar(filename, content_type):
        raise AppError(ErrorCode.VALIDATION_RANGE, "个人头像仅支持 JPG、PNG 或 GIF")
    item = UploadedFile(
        team_id=team_id,
        owner_id=owner_id,
        filename=filename,
        content_type=content_type,
        category=normalized_category,
        size=len(content),
        storage="filesystem",
        path="",
        url="",
    )
    item.path = write_storage_file(storage_path_for_upload(item, filename), content)
    item.url = f"/api/v1/uploads/{item.id}/public" if is_public_avatar_upload(item) else f"/api/v1/uploads/{item.id}/download"
    db.add(item)
    write_audit_log(
        db,
        entity_type="upload",
        entity_id=item.id,
        action="file_uploaded",
        operator_id=owner_id,
        team_id=team_id,
        changes={"filename": filename, "category": normalized_category, "size": len(content)},
        request=request,
    )
    db.commit()
    return upload_payload(item)


def is_team_storage_upload(team_id: str) -> bool:
    return not team_id.startswith(("profile:", "agent:"))


async def create_profile_material_upload(
    db: MongoDatabase,
    *,
    owner_id: str,
    file: UploadFile,
    category: str,
    request: Request,
) -> dict:
    normalized_category = category if category in {"verification", "document", "image"} else "verification"
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise AppError(ErrorCode.VALIDATION_RANGE, "单文件最大 1GB")
    filename = safe_filename(file.filename or "material.bin")
    if is_dangerous_upload(filename, raw_upload_content_type(file.content_type)):
        raise AppError(ErrorCode.VALIDATION_RANGE, "不支持上传可执行文件")
    content_type = normalize_upload_content_type(filename, file.content_type)
    if not is_allowed_profile_material(filename, content_type):
        raise AppError(ErrorCode.VALIDATION_RANGE, "证明材料仅支持图片或 PDF")
    item = UploadedFile(
        team_id=f"profile:{owner_id}",
        owner_id=owner_id,
        filename=filename,
        content_type=content_type,
        category=normalized_category,
        size=len(content),
        storage="filesystem",
        path="",
        url="",
    )
    item.path = write_storage_file(storage_path_for_upload(item, filename, prefix="profile-materials"), content)
    item.url = f"/api/v1/profile/certifications/materials/{item.id}/download"
    db.add(item)
    write_audit_log(
        db,
        entity_type="upload",
        entity_id=item.id,
        action="profile_material_uploaded",
        operator_id=owner_id,
        changes={"filename": filename, "category": normalized_category, "size": len(content)},
        request=request,
    )
    db.commit()
    return upload_payload(item)


async def create_team_agent_avatar_upload(
    db: MongoDatabase,
    *,
    team_id: str,
    owner_id: str,
    file: UploadFile,
    request: Request,
) -> dict:
    content = await file.read()
    if len(content) > MAX_AGENT_AVATAR_BYTES:
        raise AppError(ErrorCode.VALIDATION_RANGE, "Agent 澶村儚鏈€澶?2MB")
    assert_dataset_storage_capacity(db, team_id, incoming_bytes=len(content))
    filename = safe_filename(file.filename or "agent-avatar.png")
    if is_dangerous_upload(filename, raw_upload_content_type(file.content_type)):
        raise AppError(ErrorCode.VALIDATION_RANGE, "不支持上传可执行文件")
    content_type = normalize_upload_content_type(filename, file.content_type)
    if not is_allowed_profile_avatar(filename, content_type):
        raise AppError(ErrorCode.VALIDATION_RANGE, "Agent 澶村儚浠呮敮鎸?JPG銆丳NG 鎴?GIF")
    item = UploadedFile(
        team_id=f"agent:{team_id}",
        owner_id=owner_id,
        filename=filename,
        content_type=content_type,
        category="image",
        size=len(content),
        storage="filesystem",
        path="",
        url="",
    )
    item.path = write_storage_file(storage_path_for_upload(item, filename, prefix="agent-avatars"), content)
    item.url = f"/api/v1/uploads/{item.id}/public"
    db.add(item)
    write_audit_log(
        db,
        entity_type="system_agent",
        entity_id=team_id,
        action="system_agent_avatar_uploaded",
        operator_id=owner_id,
        team_id=team_id,
        changes={"filename": filename, "size": len(content), "content_type": content_type},
        request=request,
    )
    db.commit()
    return upload_payload(item)


def get_uploaded_file(db: MongoDatabase, *, team_id: str, file_id: str) -> UploadedFile:
    item = db.get(UploadedFile, file_id)
    allowed_team_ids = {team_id}
    if team_id and not team_id.startswith("profile:"):
        allowed_team_ids.add(f"agent:{team_id}")
    if not item or item.team_id not in allowed_team_ids:
        raise AppError(ErrorCode.NOT_FOUND, "文件不存在")
    return item


def user_can_access_upload_from_assigned_question(
    db: MongoDatabase,
    *,
    user_id: str,
    file_id: str,
    team_id: str | None = None,
) -> bool:
    item = db.get(UploadedFile, file_id)
    if not item or item.team_id.startswith(("profile:", "agent:")):
        return False
    if team_id and item.team_id != team_id:
        return False
    for question in db.find(Question, {"team_id": item.team_id, "assigned_to": user_id}):
        if question.status not in {"claimed", "submitted", "rejected"}:
            continue
        if content_references_uploaded_file(question.content, item.id):
            return True
    return False


def content_references_uploaded_file(value: object, file_id: str) -> bool:
    if isinstance(value, str):
        return value == file_id or re.search(rf"/uploads/{re.escape(file_id)}(?:/|$)", value) is not None
    if isinstance(value, list):
        return any(content_references_uploaded_file(item, file_id) for item in value)
    if isinstance(value, dict):
        if any(str(value.get(key) or "") == file_id for key in ("file_id", "fileId", "upload_id", "uploadId")):
            return True
        if str(value.get("source") or "") == "uploaded_file" and str(value.get("id") or "") == file_id:
            return True
        return any(content_references_uploaded_file(item, file_id) for item in value.values())
    return False


def get_public_avatar_file(db: MongoDatabase, *, file_id: str) -> UploadedFile:
    item = db.get(UploadedFile, file_id)
    if not item or not is_public_avatar_upload(item):
        raise AppError(ErrorCode.NOT_FOUND, "文件不存在")
    return item


def get_profile_material_file(db: MongoDatabase, *, file_id: str, requester_id: str, permissions: list[str]) -> UploadedFile:
    item = db.get(UploadedFile, file_id)
    if not item or not item.team_id.startswith("profile:"):
        raise AppError(ErrorCode.NOT_FOUND, "文件不存在")
    if item.owner_id != requester_id and "certification:review" not in permissions and "platform:manage" not in permissions:
        raise AppError(ErrorCode.PERMISSION_DENIED, "无权限访问该文件")
    return item


def upload_payload(item: UploadedFile) -> dict:
    return {
        "file_id": item.id,
        "team_id": item.team_id,
        "filename": item.filename,
        "content_type": item.content_type,
        "category": item.category,
        "size": item.size,
        "url": item.url,
        "preview_status": item.preview_status or None,
        "preview_content_type": item.preview_content_type or None,
        "preview_size": item.preview_size or 0,
        "preview_error": item.preview_error or None,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


def uploaded_file_bytes(item: UploadedFile) -> bytes:
    if item.storage == "filesystem" and item.path:
        return read_storage_file(item.path)
    return b""


def is_public_avatar_upload(item: UploadedFile) -> bool:
    return item.category == "image" and item.content_type.startswith("image/") and (item.team_id.startswith("profile:") or item.team_id.startswith("agent:"))


def storage_path_for_upload(item: UploadedFile, filename: str, *, prefix: str = "uploads") -> str:
    suffix = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    safe_suffix = re.sub(r"[^a-z0-9]+", "", suffix)[:16] or "bin"
    return f"{prefix}/{safe_storage_path_segment(item.team_id)}/{item.id}.{safe_suffix}"


def safe_storage_path_segment(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("._-")[:160] or "unknown"


def safe_filename(value: str) -> str:
    filename = value.rsplit("/", 1)[-1].rsplit("\\", 1)[-1].strip() or "upload.bin"
    filename = re.sub(r"[^A-Za-z0-9._-]+", "_", filename)
    return filename[:160] or "upload.bin"


def normalize_upload_content_type(filename: str, content_type: str | None) -> str:
    inferred = infer_content_type(filename)
    normalized = raw_upload_content_type(content_type)
    if not normalized or normalized == "application/octet-stream":
        return inferred
    return normalized


def raw_upload_content_type(content_type: str | None) -> str:
    return (content_type or "").split(";", 1)[0].strip().lower()


def is_allowed_profile_avatar(filename: str, content_type: str) -> bool:
    inferred_content_type = infer_content_type(filename)
    return content_type in PROFILE_AVATAR_CONTENT_TYPES and content_type == inferred_content_type


def is_allowed_profile_material(filename: str, content_type: str) -> bool:
    inferred_content_type = infer_content_type(filename)
    return content_type in PROFILE_MATERIAL_CONTENT_TYPES and content_type == inferred_content_type


def is_allowed_image_upload(filename: str, content_type: str) -> bool:
    inferred_content_type = infer_content_type(filename)
    return content_type in PROFILE_AVATAR_CONTENT_TYPES and content_type == inferred_content_type


def is_allowed_team_document(filename: str, content_type: str) -> bool:
    inferred_content_type = infer_content_type(filename)
    return content_type in TEAM_DOCUMENT_CONTENT_TYPES and content_type == inferred_content_type


def is_dangerous_upload(filename: str, content_type: str) -> bool:
    suffix = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    normalized_content_type = content_type.split(";", 1)[0].strip().lower()
    if normalized_content_type == "application/octet-stream" and suffix in SAFE_MEDIA_UPLOAD_EXTENSIONS:
        return False
    return suffix in DANGEROUS_UPLOAD_EXTENSIONS or normalized_content_type in DANGEROUS_UPLOAD_CONTENT_TYPES


def infer_content_type(filename: str) -> str:
    suffix = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if suffix in {"jpg", "jpeg"}:
        return "image/jpeg"
    if suffix == "png":
        return "image/png"
    if suffix == "gif":
        return "image/gif"
    if suffix == "mp3":
        return "audio/mpeg"
    if suffix == "wav":
        return "audio/wav"
    if suffix == "m4a":
        return "audio/mp4"
    if suffix == "ogg":
        return "audio/ogg"
    if suffix == "mp4":
        return "video/mp4"
    if suffix == "mov":
        return "video/quicktime"
    if suffix == "webm":
        return "video/webm"
    if suffix == "m4v":
        return "video/x-m4v"
    if suffix == "avi":
        return "video/x-msvideo"
    if suffix == "mkv":
        return "video/x-matroska"
    if suffix == "3gp":
        return "video/3gpp"
    if suffix == "pdf":
        return "application/pdf"
    if suffix == "csv":
        return "text/csv"
    if suffix == "json":
        return "application/json"
    return "application/octet-stream"
