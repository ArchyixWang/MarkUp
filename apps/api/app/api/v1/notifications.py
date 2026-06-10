from fastapi import APIRouter, Depends, Query, Request

from app.api.deps import CurrentUser, require_any_permissions, require_permissions
from app.api.v1.teams import ensure_team_scope
from app.core.database import MongoDatabase, get_db
from app.core.responses import success_response
from app.schemas.notification import NotificationBatchStateUpdate, NotificationCreateRequest, NotificationRevokeRequest, NotificationStateUpdate
from app.services.notification_service import (
    batch_update_my_notification_state,
    create_notification,
    delete_notification,
    list_my_notifications,
    list_notifications,
    mark_all_my_notifications_read,
    mark_all_read,
    preview_recipients,
    revoke_notification,
    update_my_notification_state,
    update_notification_state,
)

router = APIRouter()
manage_notifications = require_any_permissions("task:manage", "member:invite")


@router.get("/my")
def list_my_notifications_route(
    request: Request,
    notification_type: str | None = Query(default=None),
    status: str | None = Query(default=None),
    keyword: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current: CurrentUser = Depends(require_permissions()),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = list_my_notifications(db, current_user_id=current.user_id, notification_type=notification_type, status=status, keyword=keyword, page=page, page_size=page_size)
    return success_response(data, "success", request)


@router.post("/my/mark-all-read")
def mark_all_my_notifications_read_route(
    request: Request,
    current: CurrentUser = Depends(require_permissions()),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    return success_response(mark_all_my_notifications_read(db, user_id=current.user_id, request=request), "通知已全部标为已读", request)


@router.post("/my/batch-state")
def batch_update_my_notification_state_route(
    payload: NotificationBatchStateUpdate,
    request: Request,
    current: CurrentUser = Depends(require_permissions()),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = batch_update_my_notification_state(db, notification_ids=payload.notification_ids, user_id=current.user_id, action=payload.action, request=request)
    return success_response(data, "通知状态已批量更新", request)


@router.post("/my/{notification_id}/state")
def update_my_notification_state_route(
    notification_id: str,
    payload: NotificationStateUpdate,
    request: Request,
    current: CurrentUser = Depends(require_permissions()),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = update_my_notification_state(db, notification_id=notification_id, user_id=current.user_id, status=payload.resolved_action(), request=request)
    return success_response(data, "通知状态已更新", request)


@router.get("")
def list_notifications_route(
    request: Request,
    team_id: str = Query(min_length=1),
    notification_type: str | None = Query(default=None),
    status: str | None = Query(default=None),
    keyword: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current: CurrentUser = Depends(manage_notifications),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    data = list_notifications(db, team_id=team_id, current_user_id=current.user_id, notification_type=notification_type, status=status, keyword=keyword, page=page, page_size=page_size)
    return success_response(data, "success", request)


@router.post("")
def create_notification_route(
    payload: NotificationCreateRequest,
    request: Request,
    team_id: str = Query(min_length=1),
    current: CurrentUser = Depends(manage_notifications),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    data = create_notification(db, team_id=team_id, payload=payload.model_dump(), sender_id=current.user_id, sender_name=current.user.username, request=request)
    return success_response(data, "通知已发送", request)


@router.get("/preview")
def preview_notification_recipients_route(
    request: Request,
    team_id: str = Query(min_length=1),
    target_type: str = Query(default="team"),
    target_roles: list[str] = Query(default=[]),
    target_user_ids: list[str] = Query(default=[]),
    related_entity_id: str | None = Query(default=None),
    current: CurrentUser = Depends(manage_notifications),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    return success_response(preview_recipients(db, team_id, target_type, target_roles, target_user_ids, related_entity_id=related_entity_id), "success", request)


@router.post("/mark-all-read")
def mark_all_read_route(
    request: Request,
    team_id: str = Query(min_length=1),
    current: CurrentUser = Depends(require_permissions("team:read")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    return success_response(mark_all_read(db, team_id=team_id, user_id=current.user_id, request=request), "通知已全部标为已读", request)


@router.post("/{notification_id}/state")
def update_notification_state_route(
    notification_id: str,
    payload: NotificationStateUpdate,
    request: Request,
    current: CurrentUser = Depends(require_permissions("team:read")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = update_notification_state(db, notification_id=notification_id, user_id=current.user_id, status=payload.resolved_action(), team_id=current.team_id, request=request)
    return success_response(data, "通知状态已更新", request)


@router.post("/{notification_id}/revoke")
def revoke_notification_route(
    notification_id: str,
    payload: NotificationRevokeRequest,
    request: Request,
    team_id: str = Query(min_length=1),
    current: CurrentUser = Depends(manage_notifications),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    data = revoke_notification(db, team_id=team_id, notification_id=notification_id, operator_id=current.user_id, reason=payload.reason, request=request)
    return success_response(data, "通知已撤回", request)


@router.delete("/{notification_id}")
def delete_notification_route(
    notification_id: str,
    request: Request,
    team_id: str = Query(min_length=1),
    current: CurrentUser = Depends(manage_notifications),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    data = delete_notification(db, team_id=team_id, notification_id=notification_id, operator_id=current.user_id, request=request)
    return success_response(data, "通知已删除", request)
