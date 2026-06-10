from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response

from app.api.deps import CurrentUser, require_permissions
from app.core.database import MongoDatabase, get_db
from app.core.errors import AppError, ErrorCode
from app.core.responses import success_response
from app.schemas.export import CreateExportRequest
from app.services.export_service import cancel_export_job, create_export_job, download_export_job, get_export_job, list_export_jobs

router = APIRouter()


def require_team_id(current: CurrentUser) -> str:
    if not current.team_id:
        raise AppError(ErrorCode.PERMISSION_DENIED, "缺少企业上下文")
    return current.team_id


@router.post("")
def create_export_route(payload: CreateExportRequest, request: Request, current: CurrentUser = Depends(require_permissions("task:manage")), db: MongoDatabase = Depends(get_db)) -> dict:
    data = create_export_job(db, team_id=require_team_id(current), operator_id=current.user_id, payload=payload.model_dump(), request=request)
    return success_response(data, "导出任务已创建", request)


@router.get("")
def list_export_route(
    request: Request,
    task_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current: CurrentUser = Depends(require_permissions("task:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = list_export_jobs(db, team_id=require_team_id(current), task_id=task_id, status=status, page=page, page_size=page_size)
    return success_response(data, "success", request)


@router.get("/{export_id}")
def get_export_route(export_id: str, request: Request, current: CurrentUser = Depends(require_permissions("task:manage")), db: MongoDatabase = Depends(get_db)) -> dict:
    return success_response(get_export_job(db, team_id=require_team_id(current), export_id=export_id), "success", request)


@router.get("/{export_id}/download")
def download_export_route(export_id: str, request: Request, current: CurrentUser = Depends(require_permissions("task:manage")), db: MongoDatabase = Depends(get_db)) -> Response:
    filename, media_type, body = download_export_job(db, team_id=require_team_id(current), export_id=export_id, operator_id=current.user_id, request=request)
    ascii_filename = filename.encode("ascii", "ignore").decode("ascii") or "export"
    return Response(content=body, media_type=media_type, headers={"Content-Disposition": f"attachment; filename=\"{ascii_filename}\"; filename*=UTF-8''{quote(filename)}"})


@router.delete("/{export_id}")
def cancel_export_route(export_id: str, request: Request, current: CurrentUser = Depends(require_permissions("task:manage")), db: MongoDatabase = Depends(get_db)) -> dict:
    return success_response(cancel_export_job(db, team_id=require_team_id(current), export_id=export_id, operator_id=current.user_id, request=request), "导出任务已取消", request)
