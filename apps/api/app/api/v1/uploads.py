from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Header, Query, Request, UploadFile
from fastapi.responses import Response

from app.api.deps import CurrentUser, get_current_user
from app.core.database import MongoDatabase, get_db
from app.core.errors import AppError, ErrorCode
from app.core.responses import success_response
from app.models.upload import UploadedFile
from app.services.upload_service import create_upload, get_public_avatar_file, get_uploaded_file, uploaded_file_bytes, user_can_access_upload_from_assigned_question
from app.services.video_preview_service import ensure_video_preview, playback_response, video_preview_status

router = APIRouter()


def require_team_id(current: CurrentUser) -> str:
    if not current.team_id:
        raise AppError(ErrorCode.PERMISSION_DENIED, "缺少企业上下文")
    return current.team_id


def resolve_upload_read_team_id(db: MongoDatabase, current: CurrentUser, file_id: str, *, allow_profile: bool = True) -> str:
    if current.team_id:
        if "task:read" in set(current.team_permissions or []):
            return current.team_id
        if labeler_can_read_assigned_upload(db, current, file_id, team_id=current.team_id):
            return current.team_id
        raise AppError(ErrorCode.PERMISSION_DENIED, "无权限访问")

    if labeler_can_read_assigned_upload(db, current, file_id, team_id=None):
        upload = db.get(UploadedFile, file_id)
        if upload:
            return upload.team_id

    if allow_profile:
        return f"profile:{current.user_id}"
    raise AppError(ErrorCode.PERMISSION_DENIED, "缺少企业上下文")


def labeler_can_read_assigned_upload(db: MongoDatabase, current: CurrentUser, file_id: str, *, team_id: str | None) -> bool:
    if "label:read" not in set(current.permissions):
        return False
    return user_can_access_upload_from_assigned_question(db, user_id=current.user_id, file_id=file_id, team_id=team_id)


@router.post("")
async def upload_file_route(
    request: Request,
    file: UploadFile = File(...),
    category: str = Form(default="document"),
    current: CurrentUser = Depends(get_current_user),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    if current.team_id:
        if "task:manage" not in set(current.team_permissions or []):
            raise AppError(ErrorCode.PERMISSION_DENIED, "无权限访问")
        team_id = current.team_id
    else:
        if category != "image":
            raise AppError(ErrorCode.PERMISSION_DENIED, "缺少企业上下文")
        team_id = f"profile:{current.user_id}"
    data = await create_upload(db, team_id=team_id, owner_id=current.user_id, file=file, category=category, request=request)
    return success_response(data, "文件已上传", request)


@router.get("/{file_id}/download")
def download_file_route(
    file_id: str,
    current: CurrentUser = Depends(get_current_user),
    db: MongoDatabase = Depends(get_db),
) -> Response:
    team_id = resolve_upload_read_team_id(db, current, file_id)
    item = get_uploaded_file(db, team_id=team_id, file_id=file_id)
    body = uploaded_file_bytes(item)
    ascii_filename = item.filename.encode("ascii", "ignore").decode("ascii") or "upload"
    return Response(
        content=body,
        media_type=item.content_type,
        headers={"Content-Disposition": f"attachment; filename=\"{ascii_filename}\"; filename*=UTF-8''{quote(item.filename)}"},
    )


@router.post("/{file_id}/video-preview")
def create_video_preview_route(
    file_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    current: CurrentUser = Depends(get_current_user),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    team_id = resolve_upload_read_team_id(db, current, file_id, allow_profile=False)
    data = ensure_video_preview(db, team_id=team_id, file_id=file_id, background_tasks=background_tasks, request=request)
    return success_response(data, "视频预览状态已更新", request)


@router.get("/{file_id}/video-preview/status")
def video_preview_status_route(
    file_id: str,
    request: Request,
    current: CurrentUser = Depends(get_current_user),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    team_id = resolve_upload_read_team_id(db, current, file_id, allow_profile=False)
    data = video_preview_status(db, team_id=team_id, file_id=file_id, request=request)
    return success_response(data, "视频预览状态", request)


@router.get("/{file_id}/playback", name="playback_file_route", response_model=None)
def playback_file_route(
    file_id: str,
    token: str = Query(...),
    range_header: str | None = Header(default=None, alias="Range"),
    db: MongoDatabase = Depends(get_db),
) -> Response:
    return playback_response(db, file_id=file_id, token=token, range_header=range_header)


@router.get("/{file_id}/public")
def public_avatar_file_route(file_id: str, db: MongoDatabase = Depends(get_db)) -> Response:
    item = get_public_avatar_file(db, file_id=file_id)
    body = uploaded_file_bytes(item)
    ascii_filename = item.filename.encode("ascii", "ignore").decode("ascii") or "avatar"
    return Response(
        content=body,
        media_type=item.content_type,
        headers={"Content-Disposition": f"inline; filename=\"{ascii_filename}\"; filename*=UTF-8''{quote(item.filename)}"},
    )
