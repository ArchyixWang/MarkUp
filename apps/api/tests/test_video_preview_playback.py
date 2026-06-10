import os
from datetime import datetime
from pathlib import Path

os.environ.setdefault("SECRET_KEY", "test-secret-key-with-strong-length")
os.environ.setdefault("MONGODB_URL", "mongomock://localhost")
os.environ.setdefault("MONGODB_DATABASE", "markup_test")

from fastapi.testclient import TestClient

from app.core.database import get_database, reset_database
from app.core.errors import AppError, ErrorCode
from app.core.security import generate_object_id
from app.models.auth import RefreshSession
from app.models.production import Question, Task
from app.models.team import Team, TeamMember
from app.models.upload import UploadedFile
from app.models.user import User
from app.main import app
from app.services import auth_service
from app.services.file_storage import resolve_storage_path, write_storage_file
from app.services import video_preview_service

client = TestClient(app)


def setup_function() -> None:
    reset_database()


def access_token(user: User) -> str:
    db = get_database()
    session = RefreshSession(
        user_id=user.id,
        jti_hash=f"video-preview-{generate_object_id()}",
        expire_at=datetime(2030, 1, 1),
    )
    db.add(session)
    db.commit()
    return auth_service.create_access_token(user.id, {"role": user.global_role, "sid": session.id})


def setup_team_with_video(*, filename: str = "clip.avi", content_type: str = "video/x-msvideo", body: bytes = b"source-video") -> tuple[Team, User, UploadedFile, dict[str, str]]:
    db = get_database()
    team = Team(company_name=f"Video Preview Team {generate_object_id()}", owner_user_id="owner")
    owner = User(username=f"videopreview{generate_object_id()}", email=f"video-{generate_object_id()}@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    path = write_storage_file(f"uploads/{team.id}/{generate_object_id()}-{filename}", body)
    upload = UploadedFile(
        team_id=team.id,
        owner_id=owner.id,
        filename=filename,
        content_type=content_type,
        category="media",
        size=len(body),
        storage="filesystem",
        path=path,
        url="",
    )
    upload.url = f"/api/v1/uploads/{upload.id}/download"
    db.add(upload)
    db.commit()
    headers = {"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id}
    return team, owner, upload, headers


def test_video_preview_reports_not_configured_when_ffmpeg_missing(monkeypatch) -> None:
    _team, _owner, upload, headers = setup_team_with_video()
    monkeypatch.setattr(video_preview_service, "configured_ffmpeg_path", lambda: "")
    monkeypatch.setattr(video_preview_service, "configured_ffprobe_path", lambda: "ffprobe")

    response = client.post(f"/api/v1/uploads/{upload.id}/video-preview", headers=headers)

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "not_configured"
    assert data["preview_error"] == "ffmpeg_not_configured"


def test_video_preview_reports_not_configured_when_ffprobe_missing(monkeypatch) -> None:
    _team, _owner, upload, headers = setup_team_with_video()
    monkeypatch.setattr(video_preview_service, "configured_ffmpeg_path", lambda: "ffmpeg")
    monkeypatch.setattr(video_preview_service, "configured_ffprobe_path", lambda: "")

    response = client.post(f"/api/v1/uploads/{upload.id}/video-preview", headers=headers)

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "not_configured"
    assert data["preview_error"] == "ffprobe_not_configured"


def test_video_preview_transcodes_and_streams_range(monkeypatch) -> None:
    _team, _owner, upload, headers = setup_team_with_video()
    monkeypatch.setattr(video_preview_service, "configured_ffmpeg_path", lambda: "ffmpeg")
    monkeypatch.setattr(video_preview_service, "configured_ffprobe_path", lambda: "ffprobe")

    def fake_run(command, **_kwargs):
        if "-show_entries" in command:
            return None
        Path(command[-1]).write_bytes(b"mp4-preview-content")
        return None

    monkeypatch.setattr(video_preview_service.subprocess, "run", fake_run)

    response = client.post(f"/api/v1/uploads/{upload.id}/video-preview", headers=headers)
    assert response.status_code == 200

    status = client.get(f"/api/v1/uploads/{upload.id}/video-preview/status", headers=headers)
    assert status.status_code == 200
    data = status.json()["data"]
    assert data["status"] == "ready"
    assert data["playback_url"]

    playback_path = data["playback_url"].split("http://testserver/api/v1", 1)[-1]
    ranged = client.get(f"/api/v1{playback_path}", headers={"Range": "bytes=0-2"})
    assert ranged.status_code == 206
    assert ranged.headers["accept-ranges"] == "bytes"
    assert ranged.headers["content-range"] == "bytes 0-2/19"
    assert ranged.content == b"mp4"


def test_video_preview_quota_failure_marks_failed_and_cleans_temp(monkeypatch) -> None:
    _team, _owner, upload, headers = setup_team_with_video()
    monkeypatch.setattr(video_preview_service, "configured_ffmpeg_path", lambda: "ffmpeg")
    monkeypatch.setattr(video_preview_service, "configured_ffprobe_path", lambda: "ffprobe")

    temp_paths: list[Path] = []

    def fake_run(command, **_kwargs):
        if "-show_entries" in command:
            return None
        output = Path(command[-1])
        temp_paths.append(output)
        output.write_bytes(b"too-large-preview")
        return None

    def reject_capacity(*_args, **_kwargs):
        raise AppError(ErrorCode.BUSINESS_RULE, "Membership dataset storage limit exceeded")

    monkeypatch.setattr(video_preview_service.subprocess, "run", fake_run)
    monkeypatch.setattr(video_preview_service, "assert_dataset_storage_capacity", reject_capacity)

    response = client.post(f"/api/v1/uploads/{upload.id}/video-preview", headers=headers)
    assert response.status_code == 200

    status = client.get(f"/api/v1/uploads/{upload.id}/video-preview/status", headers=headers)
    data = status.json()["data"]
    assert data["status"] == "failed"
    assert data["preview_error"] == "quota_exceeded"
    assert temp_paths and not temp_paths[0].exists()


def test_native_mp4_uses_original_signed_playback_with_range() -> None:
    _team, _owner, upload, headers = setup_team_with_video(filename="clip.mp4", content_type="video/mp4", body=b"mp4-original")

    response = client.post(f"/api/v1/uploads/{upload.id}/video-preview", headers=headers)

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "not_required"
    playback_path = data["playback_url"].split("http://testserver/api/v1", 1)[-1]
    ranged = client.get(f"/api/v1{playback_path}", headers={"Range": "bytes=4-11"})
    assert ranged.status_code == 206
    assert ranged.content == b"original"


def test_labeler_can_preview_only_assigned_question_upload() -> None:
    team, owner, upload, _headers = setup_team_with_video(filename="assigned.mp4", content_type="video/mp4", body=b"assigned-video")
    db = get_database()
    labeler = User(username=f"previewlabeler{generate_object_id()}", email=f"preview-labeler-{generate_object_id()}@example.com", global_role="labeler", email_verified=True)
    task = Task(team_id=team.id, owner_id=owner.id, title="Video labeling", status="published", quota=1)
    question = Question(
        team_id=team.id,
        task_id=task.id,
        row_index=0,
        assigned_to=labeler.id,
        status="claimed",
        content={
            "media": [
                {
                    "type": "video",
                    "field": "video_url",
                    "url": upload.url,
                    "file_id": upload.id,
                    "name": upload.filename,
                }
            ]
        },
    )
    other_path = write_storage_file(f"uploads/{team.id}/{generate_object_id()}-other.mp4", b"other-video")
    other_upload = UploadedFile(
        team_id=team.id,
        owner_id=owner.id,
        filename="other.mp4",
        content_type="video/mp4",
        category="media",
        size=len(b"other-video"),
        storage="filesystem",
        path=other_path,
    )
    other_upload.url = f"/api/v1/uploads/{other_upload.id}/download"
    db.add(labeler)
    db.add(TeamMember(team_id=team.id, user_id=labeler.id, team_role="labeler"))
    db.add(task)
    db.add(question)
    db.add(other_upload)
    db.commit()
    headers = {"Authorization": f"Bearer {access_token(labeler)}", "X-Team-ID": team.id}

    allowed = client.post(f"/api/v1/uploads/{upload.id}/video-preview", headers=headers)
    blocked = client.post(f"/api/v1/uploads/{other_upload.id}/video-preview", headers=headers)
    download = client.get(upload.url, headers=headers)

    assert allowed.status_code == 200
    assert allowed.json()["data"]["status"] == "not_required"
    assert allowed.json()["data"]["playback_url"]
    assert download.status_code == 200
    assert download.content == b"assigned-video"
    assert blocked.status_code == 403
