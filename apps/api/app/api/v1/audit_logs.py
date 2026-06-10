from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response

from app.api.deps import CurrentUser, require_permissions
from app.api.v1.teams import ensure_team_scope
from app.core.database import MongoDatabase, get_db
from app.core.errors import AppError, ErrorCode
from app.core.responses import success_response
from app.services.audit_service import export_audit_logs, get_audit_log, list_audit_logs

router = APIRouter()


@router.get("")
def list_audit_logs_route(
    request: Request,
    team_id: str | None = Query(default=None),
    entity_type: str | None = Query(default=None),
    entity_id: str | None = Query(default=None),
    action: str | None = Query(default=None),
    operator_id: str | None = Query(default=None),
    keyword: str | None = Query(default=None),
    risk_level: str | None = Query(default=None),
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current: CurrentUser = Depends(require_permissions("team:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    scoped_team_id = team_id
    if scoped_team_id:
        ensure_team_scope(current, scoped_team_id)
    elif current.team_id:
        scoped_team_id = current.team_id
    else:
        raise AppError(ErrorCode.PERMISSION_DENIED, "缺少企业上下文")
    data = list_audit_logs(
        db,
        team_id=scoped_team_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        operator_id=operator_id,
        keyword=keyword,
        risk_level=risk_level,
        start_date=start_date,
        end_date=end_date,
        page=page,
        page_size=page_size,
    )
    return success_response(data, "success", request)


@router.get("/export")
def export_audit_logs_route(
    request: Request,
    team_id: str = Query(min_length=1),
    export_format: str = Query(default="csv", pattern="^(csv|json)$"),
    entity_type: str | None = Query(default=None),
    entity_id: str | None = Query(default=None),
    action: str | None = Query(default=None),
    operator_id: str | None = Query(default=None),
    keyword: str | None = Query(default=None),
    risk_level: str | None = Query(default=None),
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    current: CurrentUser = Depends(require_permissions("team:manage")),
    db: MongoDatabase = Depends(get_db),
) -> Response:
    ensure_team_scope(current, team_id)
    data = export_audit_logs(
        db,
        team_id=team_id,
        operator_id=current.user_id,
        request=request,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        target_operator_id=operator_id,
        keyword=keyword,
        risk_level=risk_level,
        start_date=start_date,
        end_date=end_date,
        export_format=export_format,
    )
    return Response(
        content=data["content"],
        media_type=data["media_type"],
        headers={"Content-Disposition": f'attachment; filename="{data["filename"]}"', "X-Export-Count": str(data["count"])},
    )


@router.get("/{log_id}")
def get_audit_log_route(log_id: str, request: Request, current: CurrentUser = Depends(require_permissions("team:manage")), db: MongoDatabase = Depends(get_db)) -> dict:
    data = get_audit_log(db, log_id)
    if not data.get("team_id"):
        raise AppError(ErrorCode.NOT_FOUND, "操作日志不存在")
    ensure_team_scope(current, data["team_id"])
    return success_response(data, "success", request)
