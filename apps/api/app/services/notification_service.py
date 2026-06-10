from datetime import datetime

from fastapi import Request

from app.core.database import MongoDatabase
from app.core.errors import AppError, ErrorCode
from app.core.security import now_utc
from app.models.notification import Notification
from app.models.production import Question, Submission, Task
from app.models.team import Team, TeamMember
from app.models.user import User
from app.services.audit_service import write_audit_log


NOTIFICATION_TYPE_LABELS = {
    "system": "系统公告",
    "task": "任务提醒",
    "review": "审核提醒",
    "export": "导出提醒",
    "points": "积分提醒",
    "security": "安全提醒",
    "organization": "企业通知",
}
ENTERPRISE_BROADCAST_ROLES = {"team_admin", "owner", "reviewer"}
HANDLEABLE_TYPES = {"task", "review", "export", "points", "security", "system"}


def create_notification(
    db: MongoDatabase,
    *,
    team_id: str,
    payload: dict,
    sender_id: str,
    sender_name: str,
    request: Request,
) -> dict:
    recipients = preview_recipients(
        db,
        team_id,
        payload.get("target_type") or "team",
        payload.get("target_roles") or [],
        payload.get("target_user_ids") or [],
        related_entity_id=payload.get("related_entity_id"),
    )
    if recipients["total"] == 0:
        raise AppError(ErrorCode.BUSINESS_RULE, "分发对象为空")
    target_type = payload.get("target_type") or "team"
    notification = Notification(
        team_id=team_id,
        title=payload["title"],
        content=payload["content"],
        notification_type=_normalize_notification_type(payload.get("notification_type") or "organization"),
        priority=payload.get("priority") or "normal",
        target_type=target_type,
        target_roles=payload.get("target_roles") or [],
        target_user_ids=recipients["user_ids"] if target_type in {"member", "task"} else [],
        related_entity_type=payload.get("related_entity_type"),
        related_entity_id=payload.get("related_entity_id"),
        action_url=payload.get("action_url"),
        metadata=payload.get("metadata") or {},
        sender_id=sender_id,
        sender_name=sender_name,
        email_enabled=bool(payload.get("email_enabled")),
        in_app_enabled=payload.get("in_app_enabled") is not False,
        expire_at=_parse_datetime(payload.get("expire_at")),
    )
    db.add(notification)
    write_audit_log(
        db,
        entity_type="notification",
        entity_id=notification.id,
        action="notification_created",
        operator_id=sender_id,
        team_id=team_id,
        changes={"title": notification.title, "target_type": notification.target_type, "recipients": recipients["total"]},
        request=request,
    )
    db.commit()
    return notification_payload(notification, current_user_id=sender_id, recipient_summary=recipients)


def list_notifications(
    db: MongoDatabase,
    *,
    team_id: str,
    current_user_id: str,
    notification_type: str | None = None,
    status: str | None = None,
    keyword: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    query: dict = {"team_id": team_id, "deleted_at": None}
    if notification_type and notification_type != "all":
        query["notification_type"] = {"$in": _notification_type_filter_values(notification_type)}
    items = db.find(Notification, query, sort=[("created_at", -1)])
    if status and status != "all":
        items = [item for item in items if _visible_status(item, current_user_id) == status]
    if keyword:
        lowered = keyword.lower()
        items = [item for item in items if lowered in item.title.lower() or lowered in item.content.lower() or lowered in (item.sender_name or "").lower()]
    safe_page_size = min(max(page_size, 1), 100)
    safe_page = max(page, 1)
    start = (safe_page - 1) * safe_page_size
    sliced = items[start : start + safe_page_size]
    return {
        "items": [notification_payload(item, current_user_id=current_user_id) for item in sliced],
        "summary": notification_summary(items, current_user_id),
        "type_options": notification_type_options(items, current_user_id),
        "pagination": {
            "page": safe_page,
            "page_size": safe_page_size,
            "total": len(items),
            "total_pages": max((len(items) + safe_page_size - 1) // safe_page_size, 1),
        },
    }


def list_my_notifications(
    db: MongoDatabase,
    *,
    current_user_id: str,
    notification_type: str | None = None,
    status: str | None = None,
    keyword: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    memberships = db.find(TeamMember, {"user_id": current_user_id, "status": "active"})
    membership_by_team = {member.team_id: member for member in memberships}
    if not membership_by_team:
        return _notification_page([], current_user_id=current_user_id, page=page, page_size=page_size)

    items = db.find(Notification, {"team_id": {"$in": list(membership_by_team)}, "deleted_at": None}, sort=[("created_at", -1)])
    visible_items = [
        item
        for item in items
        if _is_visible_to_user(item, current_user_id=current_user_id, member=membership_by_team.get(item.team_id))
    ]
    before_type_filter = list(visible_items)
    if notification_type and notification_type != "all":
        accepted_types = set(_notification_type_filter_values(notification_type))
        visible_items = [item for item in visible_items if item.notification_type in accepted_types or _normalize_notification_type(item.notification_type) in accepted_types]
    if status and status != "all":
        visible_items = [item for item in visible_items if _visible_status(item, current_user_id) == status]
    if keyword:
        lowered = keyword.lower()
        visible_items = [
            item
            for item in visible_items
            if lowered in item.title.lower()
            or lowered in item.content.lower()
            or lowered in (item.sender_name or "").lower()
        ]
    return _notification_page(visible_items, current_user_id=current_user_id, page=page, page_size=page_size, db=db, type_source=before_type_filter)


def revoke_notification(
    db: MongoDatabase,
    *,
    team_id: str,
    notification_id: str,
    operator_id: str,
    request: Request,
    reason: str | None = None,
) -> dict:
    notification = db.get(Notification, notification_id)
    if not notification or notification.deleted_at:
        raise AppError(ErrorCode.NOT_FOUND, "通知不存在")
    if notification.team_id != team_id:
        raise AppError(ErrorCode.NOT_FOUND, "通知不存在")
    if _normalize_notification_type(notification.notification_type) != "organization":
        raise AppError(ErrorCode.BUSINESS_RULE, "仅企业通知支持撤回")
    if notification.status == "revoked":
        raise AppError(ErrorCode.STATE_CONFLICT, "通知已撤回")
    notification.status = "revoked"
    notification.revoked_by = operator_id
    notification.revoked_at = datetime.utcnow()
    notification.updated_at = datetime.utcnow()
    db.save(notification)
    write_audit_log(
        db,
        entity_type="notification",
        entity_id=notification.id,
        action="notification_revoked",
        operator_id=operator_id,
        team_id=notification.team_id,
        changes={"title": notification.title, "reason": reason},
        request=request,
    )
    db.commit()
    return notification_payload(notification, current_user_id=operator_id)


def delete_notification(db: MongoDatabase, *, team_id: str, notification_id: str, operator_id: str, request: Request) -> dict:
    notification = db.get(Notification, notification_id)
    if not notification or notification.deleted_at:
        raise AppError(ErrorCode.NOT_FOUND, "通知不存在")
    if notification.team_id != team_id:
        raise AppError(ErrorCode.NOT_FOUND, "通知不存在")
    if _normalize_notification_type(notification.notification_type) != "organization":
        raise AppError(ErrorCode.BUSINESS_RULE, "仅企业通知支持删除")
    notification.deleted_by = operator_id
    notification.deleted_at = datetime.utcnow()
    notification.updated_at = datetime.utcnow()
    db.save(notification)
    write_audit_log(
        db,
        entity_type="notification",
        entity_id=notification.id,
        action="notification_deleted",
        operator_id=operator_id,
        team_id=notification.team_id,
        changes={"title": notification.title},
        request=request,
    )
    db.commit()
    return {"notification_id": notification.id, "deleted": True}


def preview_recipients(
    db: MongoDatabase,
    team_id: str,
    target_type: str,
    target_roles: list[str],
    target_user_ids: list[str],
    *,
    related_entity_id: str | None = None,
) -> dict:
    if target_type == "task" and not related_entity_id:
        raise AppError(ErrorCode.BUSINESS_RULE, "任务通知必须指定任务 ID")
    members = db.find(TeamMember, {"team_id": team_id, "status": "active"})
    human_members = [member for member in members if _is_human_recipient(member)]
    selected = [member for member in human_members if member.team_role in ENTERPRISE_BROADCAST_ROLES]
    if target_type == "role":
        selected = [member for member in human_members if member.team_role in set(target_roles)]
    elif target_type == "member":
        selected = [member for member in human_members if member.user_id in set(target_user_ids)]
    elif target_type == "task":
        selected = task_notification_members(db, team_id=team_id, task_id=related_entity_id, members=members)
    role_counts: dict[str, int] = {}
    for member in selected:
        role_counts[member.team_role] = role_counts.get(member.team_role, 0) + 1
    return {"total": len(selected), "role_counts": role_counts, "user_ids": [member.user_id for member in selected], "related_entity_id": related_entity_id}


def task_notification_members(db: MongoDatabase, *, team_id: str, task_id: str | None, members: list[TeamMember]) -> list[TeamMember]:
    if not task_id:
        return []
    task = db.get(Task, task_id)
    if not task or task.team_id != team_id:
        return []
    participant_ids = {task.owner_id, *(task.reviewer_ids or [])}
    for question in db.find(Question, {"team_id": team_id, "task_id": task.id}):
        if question.assigned_to:
            participant_ids.add(question.assigned_to)
    for submission in db.find(Submission, {"team_id": team_id, "task_id": task.id}):
        if submission.labeler_id:
            participant_ids.add(submission.labeler_id)
    return [member for member in members if member.user_id in participant_ids and not member.is_system_member]


def update_notification_state(db: MongoDatabase, *, notification_id: str, user_id: str, status: str, team_id: str | None = None, request: Request | None = None) -> dict:
    notification = db.get(Notification, notification_id)
    if not notification:
        raise AppError(ErrorCode.NOT_FOUND, "通知不存在")
    if team_id is None or notification.team_id != team_id:
        raise AppError(ErrorCode.PERMISSION_DENIED, "无权限访问该企业")
    member = db.find_one(TeamMember, {"team_id": notification.team_id, "user_id": user_id, "status": "active"})
    if not _is_visible_to_user(notification, current_user_id=user_id, member=member):
        raise AppError(ErrorCode.NOT_FOUND, "通知不存在")
    ensure_notification_state_mutable(notification, user_id=user_id, action=status)
    before = _state_snapshot(notification, user_id)
    _apply_notification_state(notification, user_id=user_id, status=status)
    after = _state_snapshot(notification, user_id)
    db.save(notification)
    if after != before:
        write_audit_log(
            db,
            entity_type="notification",
            entity_id=notification.id,
            action=_notification_state_action_name(status),
            operator_id=user_id,
            team_id=notification.team_id,
            changes={
                "title": notification.title,
                "status": status,
                "before": {"read": before[0], "handled": before[1], "starred": before[2], "deleted": before[3]},
                "after": {"read": after[0], "handled": after[1], "starred": after[2], "deleted": after[3]},
            },
            request=request,
        )
    db.commit()
    return notification_payload(notification, current_user_id=user_id)


def update_my_notification_state(db: MongoDatabase, *, notification_id: str, user_id: str, status: str, request: Request | None = None) -> dict:
    notification = _get_visible_notification(db, notification_id=notification_id, user_id=user_id)
    ensure_notification_state_mutable(notification, user_id=user_id, action=status)
    before = _state_snapshot(notification, user_id)
    _apply_notification_state(notification, user_id=user_id, status=status)
    after = _state_snapshot(notification, user_id)
    db.save(notification)
    if after != before:
        write_audit_log(
            db,
            entity_type="notification",
            entity_id=notification.id,
            action=_notification_state_action_name(status),
            operator_id=user_id,
            team_id=notification.team_id,
            changes={
                "title": notification.title,
                "status": status,
                "before": {"read": before[0], "handled": before[1], "starred": before[2], "deleted": before[3]},
                "after": {"read": after[0], "handled": after[1], "starred": after[2], "deleted": after[3]},
            },
            request=request,
        )
    db.commit()
    return notification_payload(notification, current_user_id=user_id, source_team_name=_team_name(db, notification.team_id))


def batch_update_my_notification_state(db: MongoDatabase, *, notification_ids: list[str], user_id: str, action: str, request: Request | None = None) -> dict:
    unique_ids = list(dict.fromkeys(notification_ids))
    items: list[dict] = []
    updated_count = 0
    skipped_count = 0
    affected_team_ids: set[str] = set()
    for notification_id in unique_ids:
        try:
            notification = _get_visible_notification(db, notification_id=notification_id, user_id=user_id)
        except AppError:
            skipped_count += 1
            items.append({"notification_id": notification_id, "updated": False, "reason": "not_visible"})
            continue
        try:
            ensure_notification_state_mutable(notification, user_id=user_id, action=action)
        except AppError:
            skipped_count += 1
            items.append({"notification_id": notification_id, "updated": False, "reason": "terminal_status"})
            continue
        before = _state_snapshot(notification, user_id)
        _apply_notification_state(notification, user_id=user_id, status=action)
        after = _state_snapshot(notification, user_id)
        if after == before:
            skipped_count += 1
            items.append({"notification_id": notification_id, "updated": False, "reason": "unchanged"})
            continue
        db.save(notification)
        if notification.team_id:
            affected_team_ids.add(notification.team_id)
        updated_count += 1
        items.append({"notification_id": notification_id, "updated": True, "status": _visible_status(notification, user_id)})
    for team_id in affected_team_ids:
        write_audit_log(
            db,
            entity_type="notification",
            entity_id=team_id,
            action=f"{_notification_state_action_name(action)}_batch",
            operator_id=user_id,
            team_id=team_id,
            changes={
                "action": action,
                "updated_count": updated_count,
                "skipped_count": skipped_count,
                "notification_ids": unique_ids[:20],
            },
            request=request,
        )
    db.commit()
    return {"updated_count": updated_count, "skipped_count": skipped_count, "items": items}


def mark_all_read(db: MongoDatabase, *, team_id: str, user_id: str, request: Request | None = None) -> dict:
    member = db.find_one(TeamMember, {"team_id": team_id, "user_id": user_id, "status": "active"})
    items = db.find(Notification, {"team_id": team_id, "deleted_at": None})
    changed = 0
    for item in items:
        if not _is_visible_to_user(item, current_user_id=user_id, member=member):
            continue
        if _visible_status(item, user_id) != "unread":
            continue
        if user_id not in item.read_by:
            item.read_by.append(user_id)
            item.updated_at = datetime.utcnow()
            db.save(item)
            changed += 1
    write_audit_log(
        db,
        entity_type="notification",
        entity_id=team_id,
        action="notification_mark_all_read",
        operator_id=user_id,
        team_id=team_id,
        changes={"updated_count": changed},
        request=request,
    )
    db.commit()
    return {"updated": changed}


def mark_all_my_notifications_read(db: MongoDatabase, *, user_id: str, request: Request | None = None) -> dict:
    memberships = db.find(TeamMember, {"user_id": user_id, "status": "active"})
    membership_by_team = {member.team_id: member for member in memberships}
    if not membership_by_team:
        return {"updated": 0}
    items = db.find(Notification, {"team_id": {"$in": list(membership_by_team)}, "deleted_at": None})
    changed = 0
    changed_by_team: dict[str, int] = {}
    for item in items:
        if not _is_visible_to_user(item, current_user_id=user_id, member=membership_by_team.get(item.team_id)):
            continue
        if _visible_status(item, user_id) != "unread":
            continue
        if user_id not in item.read_by:
            item.read_by.append(user_id)
            item.updated_at = datetime.utcnow()
            db.save(item)
            changed += 1
            changed_by_team[item.team_id] = changed_by_team.get(item.team_id, 0) + 1
    for team_id, updated_count in changed_by_team.items():
        write_audit_log(
            db,
            entity_type="notification",
            entity_id=team_id,
            action="notification_mark_all_read",
            operator_id=user_id,
            team_id=team_id,
            changes={"updated_count": updated_count, "scope": "my_notifications"},
            request=request,
        )
    db.commit()
    return {"updated": changed}


def notification_summary(items: list[Notification], current_user_id: str) -> dict:
    normalized_types = [_normalize_notification_type(item.notification_type) for item in items]
    return {
        "total": len(items),
        "unread": sum(1 for item in items if _visible_status(item, current_user_id) == "unread"),
        "starred": sum(1 for item in items if current_user_id in item.starred_by),
        "organization": normalized_types.count("organization"),
        "team": normalized_types.count("organization"),
        "task": normalized_types.count("task"),
        "review": normalized_types.count("review"),
        "export": normalized_types.count("export"),
        "points": normalized_types.count("points"),
        "security": normalized_types.count("security"),
        "system": normalized_types.count("system"),
    }


def notification_payload(
    notification: Notification,
    *,
    current_user_id: str,
    recipient_summary: dict | None = None,
    source_team_name: str | None = None,
) -> dict:
    return {
        "notification_id": notification.id,
        "team_id": notification.team_id,
        "title": notification.title,
        "content": notification.content,
        "notification_type": _normalize_notification_type(notification.notification_type),
        "priority": notification.priority,
        "target_type": notification.target_type,
        "target_roles": notification.target_roles,
        "target_user_ids": _public_target_user_ids(notification),
        "related_entity_type": notification.related_entity_type,
        "related_entity_id": notification.related_entity_id,
        "event_key": notification.event_key,
        "action_url": notification.action_url,
        "metadata": notification.metadata or {},
        "sender_id": notification.sender_id,
        "sender_name": notification.sender_name,
        "source_team_name": source_team_name,
        "status": _visible_status(notification, current_user_id),
        "is_read": current_user_id in notification.read_by,
        "is_handled": current_user_id in notification.handled_by,
        "is_starred": current_user_id in notification.starred_by,
        "is_deleted": current_user_id in notification.deleted_for,
        "is_revoked": notification.status == "revoked",
        "read_count": len(notification.read_by),
        "handled_count": len(notification.handled_by),
        "email_enabled": notification.email_enabled,
        "in_app_enabled": notification.in_app_enabled,
        "recipient_summary": recipient_summary,
        "expire_at": notification.expire_at.isoformat() if notification.expire_at else None,
        "revoked_at": notification.revoked_at.isoformat() if notification.revoked_at else None,
        "revoked_by": notification.revoked_by,
        "created_at": notification.created_at.isoformat() if notification.created_at else None,
    }


def _notification_page(
    items: list[Notification],
    *,
    current_user_id: str,
    page: int,
    page_size: int,
    db: MongoDatabase | None = None,
    type_source: list[Notification] | None = None,
) -> dict:
    safe_page_size = min(max(page_size, 1), 100)
    safe_page = max(page, 1)
    start = (safe_page - 1) * safe_page_size
    sliced = items[start : start + safe_page_size]
    return {
        "items": [
            notification_payload(item, current_user_id=current_user_id, source_team_name=_team_name(db, item.team_id) if db else None)
            for item in sliced
        ],
        "summary": notification_summary(items, current_user_id),
        "type_options": notification_type_options(type_source if type_source is not None else items, current_user_id),
        "pagination": {
            "page": safe_page,
            "page_size": safe_page_size,
            "total": len(items),
            "total_pages": max((len(items) + safe_page_size - 1) // safe_page_size, 1),
        },
    }


def _get_visible_notification(db: MongoDatabase, *, notification_id: str, user_id: str) -> Notification:
    notification = db.get(Notification, notification_id)
    if not notification or notification.deleted_at:
        raise AppError(ErrorCode.NOT_FOUND, "通知不存在")
    if user_id in notification.deleted_for:
        raise AppError(ErrorCode.NOT_FOUND, "通知不存在")
    member = db.find_one(TeamMember, {"team_id": notification.team_id, "user_id": user_id, "status": "active"})
    if not _is_visible_to_user(notification, current_user_id=user_id, member=member):
        raise AppError(ErrorCode.NOT_FOUND, "通知不存在")
    return notification


def _is_visible_to_user(notification: Notification, *, current_user_id: str, member: TeamMember | None) -> bool:
    if notification.deleted_at or current_user_id in notification.deleted_for:
        return False
    if not notification.in_app_enabled:
        return False
    if not notification.team_id or not member or member.team_id != notification.team_id:
        return False
    if not _is_human_recipient(member):
        return False
    if notification.target_type == "team":
        return member.team_role in ENTERPRISE_BROADCAST_ROLES
    if notification.target_type == "role":
        return member.team_role in set(notification.target_roles)
    if notification.target_type == "member":
        return current_user_id in notification.target_user_ids
    if notification.target_type == "task":
        return current_user_id in set(notification.target_user_ids or [])
    return False


def _apply_notification_state(notification: Notification, *, user_id: str, status: str) -> None:
    if status == "read" and user_id not in notification.read_by:
        notification.read_by.append(user_id)
    if status == "unread":
        notification.read_by = [item for item in notification.read_by if item != user_id]
        notification.handled_by = [item for item in notification.handled_by if item != user_id]
    if status == "handled":
        if user_id not in notification.read_by:
            notification.read_by.append(user_id)
        if user_id not in notification.handled_by:
            notification.handled_by.append(user_id)
    if status == "unhandled":
        notification.handled_by = [item for item in notification.handled_by if item != user_id]
    if status == "star" and user_id not in notification.starred_by:
        notification.starred_by.append(user_id)
    if status == "unstar":
        notification.starred_by = [item for item in notification.starred_by if item != user_id]
    if status == "delete" and user_id not in notification.deleted_for:
        notification.deleted_for.append(user_id)
    notification.updated_at = datetime.utcnow()


def ensure_notification_state_mutable(notification: Notification, *, user_id: str, action: str) -> None:
    if action == "delete":
        return
    if _visible_status(notification, user_id) in {"expired", "revoked"}:
        raise AppError(ErrorCode.STATE_CONFLICT, "当前通知状态不允许更新")


def _team_name(db: MongoDatabase | None, team_id: str) -> str | None:
    if db is None or not team_id:
        return None
    team = db.get(Team, team_id)
    return team.company_name if team else None


def _visible_status(notification: Notification, user_id: str) -> str:
    if user_id in notification.deleted_for:
        return "deleted"
    if notification.status == "revoked":
        return "revoked"
    if _is_expired(notification):
        return "expired"
    if user_id in notification.handled_by:
        return "handled"
    if user_id in notification.read_by:
        return "read"
    return notification.status


def _is_expired(notification: Notification) -> bool:
    return bool(notification.expire_at and notification.expire_at <= now_utc().replace(tzinfo=None))


def _is_human_recipient(member: TeamMember) -> bool:
    return not member.is_system_member and member.team_role != "agent"


def _public_target_user_ids(notification: Notification) -> list[str]:
    if notification.target_type in {"member", "task"}:
        return notification.target_user_ids
    return []


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError as exc:
        raise AppError(ErrorCode.VALIDATION_FORMAT, "过期时间格式不正确") from exc


def _normalize_notification_type(value: str | None) -> str:
    if value == "team":
        return "organization"
    if value in NOTIFICATION_TYPE_LABELS:
        return value
    return "system"


def _notification_type_filter_values(value: str) -> list[str]:
    normalized = _normalize_notification_type(value)
    if normalized == "organization":
        return ["organization", "team"]
    return [normalized]


def notification_type_options(items: list[Notification], current_user_id: str) -> list[dict]:
    grouped: dict[str, dict[str, int]] = {}
    for item in items:
        key = _normalize_notification_type(item.notification_type)
        if key not in grouped:
            grouped[key] = {"count": 0, "unread_count": 0}
        grouped[key]["count"] += 1
        if _visible_status(item, current_user_id) == "unread":
            grouped[key]["unread_count"] += 1
    return [
        {
            "key": key,
            "label": NOTIFICATION_TYPE_LABELS.get(key, key),
            "count": grouped[key]["count"],
            "unread_count": grouped[key]["unread_count"],
        }
        for key in NOTIFICATION_TYPE_LABELS
        if key in grouped
    ]


def _state_snapshot(notification: Notification, user_id: str) -> tuple[bool, bool, bool, bool]:
    return (
        user_id in notification.read_by,
        user_id in notification.handled_by,
        user_id in notification.starred_by,
        user_id in notification.deleted_for,
    )


def _notification_state_action_name(status: str) -> str:
    return {
        "read": "notification_marked_read",
        "unread": "notification_marked_unread",
        "handled": "notification_marked_handled",
        "unhandled": "notification_marked_unhandled",
        "star": "notification_starred",
        "unstar": "notification_unstarred",
        "delete": "notification_deleted_for_user",
    }.get(status, f"notification_state_changed_{status}")
