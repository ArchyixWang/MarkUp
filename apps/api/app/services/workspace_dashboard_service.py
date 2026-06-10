from __future__ import annotations

from collections import Counter
from datetime import datetime
from typing import Any

from app.api.deps import CurrentUser
from app.core.database import MongoDatabase
from app.core.errors import AppError, ErrorCode
from app.core.responses import utc_now_iso
from app.domains.rbac import TeamRole, role_value
from app.models.ai_review import AiReviewJob
from app.models.audit import AuditLog
from app.models.export import ExportJob
from app.models.notification import Notification
from app.models.production import Task
from app.models.resource import AiProviderConfig
from app.models.team import Team
from app.services.audit_service import audit_log_payload
from app.services.export_service import export_job_payload
from app.services.membership_service import membership_payload
from app.services.notification_service import notification_payload
from app.services.resource_service import team_ai_wallet_payload, team_points_budget_payload
from app.services.team_service import team_detail


ENTERPRISE_BROADCAST_ROLES = {TeamRole.TEAM_ADMIN.value, TeamRole.OWNER.value, TeamRole.REVIEWER.value}
PRODUCTION_ROLES = {TeamRole.TEAM_ADMIN.value, TeamRole.OWNER.value}
REVIEW_ROLES = {TeamRole.TEAM_ADMIN.value, TeamRole.OWNER.value, TeamRole.REVIEWER.value}


def workspace_dashboard_payload(db: MongoDatabase, *, team_id: str, current: CurrentUser) -> dict:
    if not db.get(Team, team_id):
        raise AppError(ErrorCode.NOT_FOUND, "资源不存在")

    viewer_role = role_value(current.team_role) or "member"
    permissions = set(current.permissions)
    tasks = _visible_tasks(db, team_id=team_id, current=current)
    production = _production_summary(tasks)
    review = _review_summary(db, team_id=team_id, current=current)
    ai = _ai_summary(db, team_id)
    exports = _export_summary(db, team_id=team_id, current=current)
    resources = _resources_summary(db, team_id)
    governance = _governance_summary(db, team_id=team_id, current=current, permissions=permissions)

    return {
        "team": _team_summary(db, team_id),
        "viewer_role": viewer_role,
        "summary_cards": _summary_cards(production, review, ai, exports, resources),
        "todo_items": _todo_items(viewer_role, production, review, ai, exports, resources, governance),
        "production": production,
        "review": review,
        "ai": ai,
        "exports": exports,
        "resources": resources,
        "governance": governance,
        "shortcuts": _shortcuts(viewer_role),
        "generated_at": utc_now_iso(),
    }


def _team_summary(db: MongoDatabase, team_id: str) -> dict:
    detail = team_detail(db, team_id)
    membership = detail.get("membership") or membership_payload(db, team_id)
    return {
        "team_id": detail["team_id"],
        "company_name": detail["company_name"],
        "status": detail.get("status"),
        "verification_status": detail.get("verification_status"),
        "member_count": detail.get("member_count", 0),
        "member_stats": detail.get("member_stats") or {},
        "membership": {
            "current_plan": membership.get("current_plan"),
            "effective_plan": membership.get("effective_plan"),
            "status": membership.get("status"),
            "expires_at": membership.get("expires_at"),
            "next_plan": membership.get("next_plan"),
        },
    }


def _visible_tasks(db: MongoDatabase, *, team_id: str, current: CurrentUser) -> list[Task]:
    viewer_role = role_value(current.team_role)
    permissions = set(current.permissions)
    if viewer_role in PRODUCTION_ROLES or "task:manage" in permissions:
        return db.find(Task, {"team_id": team_id}, sort=[("updated_at", -1)])
    if viewer_role == TeamRole.REVIEWER.value:
        return db.find(Task, {"team_id": team_id, "reviewer_ids": current.user_id}, sort=[("updated_at", -1)])
    return []


def _production_summary(tasks: list[Task]) -> dict:
    status_counts = Counter(task.status for task in tasks)
    question_stats = Counter({"total": 0, "claimed": 0, "submitted": 0, "approved": 0, "rejected": 0})
    for task in tasks:
        stats = task.stats or {}
        question_stats["total"] += _to_int(stats.get("total", task.quota))
        question_stats["claimed"] += _to_int(stats.get("claimed"))
        question_stats["submitted"] += _to_int(stats.get("submitted"))
        question_stats["approved"] += _to_int(stats.get("approved"))
        question_stats["rejected"] += _to_int(stats.get("rejected"))

    recent_tasks = sorted(tasks, key=lambda item: item.updated_at or item.created_at or datetime.min, reverse=True)[:5]
    return {
        "tasks": {
            "total": len(tasks),
            "draft": status_counts.get("draft", 0),
            "pending_review": status_counts.get("pending_review", 0),
            "published": status_counts.get("published", 0),
            "paused": status_counts.get("paused", 0),
            "finished": status_counts.get("finished", 0),
        },
        "questions": dict(question_stats),
        "recent_tasks": [_task_dashboard_item(task) for task in recent_tasks],
    }


def _task_dashboard_item(task: Task) -> dict:
    stats = task.stats or {}
    total = _to_int(stats.get("total", task.quota))
    approved = _to_int(stats.get("approved"))
    submitted = _to_int(stats.get("submitted"))
    return {
        "task_id": task.id,
        "title": task.title,
        "status": task.status,
        "owner_id": task.owner_id,
        "question_total": total,
        "claimed": _to_int(stats.get("claimed")),
        "submitted": submitted,
        "approved": approved,
        "rejected": _to_int(stats.get("rejected")),
        "progress_percent": round((approved / total) * 100) if total else 0,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
    }


def _review_summary(db: MongoDatabase, *, team_id: str, current: CurrentUser) -> dict:
    viewer_role = role_value(current.team_role)
    if viewer_role not in REVIEW_ROLES and "submission:view" not in set(current.permissions):
        return _empty_review_summary()

    query: dict[str, Any] = {"team_id": team_id}
    if viewer_role == TeamRole.REVIEWER.value:
        assigned_task_ids = [task.id for task in db.find(Task, {"team_id": team_id, "reviewer_ids": current.user_id})]
        if not assigned_task_ids:
            return _empty_review_summary()
        query["task_id"] = {"$in": assigned_task_ids}

    by_status: Counter[str] = Counter()
    task_ids: set[str] = set()
    for item in db.collection("submissions").find(query):
        status = str(item.get("status") or "")
        by_status[status] += 1
        if item.get("task_id"):
            task_ids.add(str(item["task_id"]))
    return {
        "pending": by_status.get("submitted", 0),
        "completed": by_status.get("approved", 0) + by_status.get("rejected", 0),
        "approved": by_status.get("approved", 0),
        "rejected": by_status.get("rejected", 0),
        "total_visible": sum(by_status.values()),
        "task_count": len(task_ids),
        "by_status": dict(by_status),
    }


def _empty_review_summary() -> dict:
    return {"pending": 0, "completed": 0, "approved": 0, "rejected": 0, "total_visible": 0, "task_count": 0, "by_status": {}}


def _ai_summary(db: MongoDatabase, team_id: str) -> dict:
    jobs = db.find(AiReviewJob, {"team_id": team_id}, sort=[("updated_at", -1)])
    by_status = Counter(job.status for job in jobs)
    providers = db.find(AiProviderConfig, {"$or": [{"team_id": team_id}, {"scope": "platform"}]})
    enabled_providers = [item for item in providers if item.status == "enabled"]
    platform_providers = [item for item in providers if item.scope == "platform"]
    return {
        "jobs": {
            "total": len(jobs),
            "pending": by_status.get("pending", 0),
            "processing": by_status.get("processing", 0),
            "completed": by_status.get("completed", 0),
            "failed": by_status.get("failed", 0),
            "by_status": dict(by_status),
        },
        "wallet": team_ai_wallet_payload(db, team_id),
        "providers": {
            "total": len(providers),
            "enabled": len(enabled_providers),
            "platform_shared": len(platform_providers),
            "team_owned": len([item for item in providers if item.team_id == team_id]),
        },
        "recent_jobs": [_ai_job_item(job) for job in jobs[:5]],
    }


def _ai_job_item(job: AiReviewJob) -> dict:
    return {
        "job_id": job.id,
        "task_id": job.task_id,
        "submission_id": job.submission_id,
        "status": job.status,
        "error": job.error,
        "updated_at": job.updated_at.isoformat() if job.updated_at else None,
    }


def _export_summary(db: MongoDatabase, *, team_id: str, current: CurrentUser) -> dict:
    if "task:manage" not in set(current.permissions):
        return _empty_export_summary()
    jobs = db.find(ExportJob, {"team_id": team_id}, sort=[("updated_at", -1)])
    by_status = Counter(job.status for job in jobs)
    return {
        "total": len(jobs),
        "pending": by_status.get("pending", 0),
        "processing": by_status.get("processing", 0),
        "completed": by_status.get("completed", 0),
        "failed": by_status.get("failed", 0),
        "cancelled": by_status.get("cancelled", 0),
        "recent_exports": [export_job_payload(job) for job in jobs[:5]],
    }


def _empty_export_summary() -> dict:
    return {"total": 0, "pending": 0, "processing": 0, "completed": 0, "failed": 0, "cancelled": 0, "recent_exports": []}


def _resources_summary(db: MongoDatabase, team_id: str) -> dict:
    return {
        "points_wallet": team_points_budget_payload(db, team_id),
        "membership": membership_payload(db, team_id),
    }


def _governance_summary(db: MongoDatabase, *, team_id: str, current: CurrentUser, permissions: set[str]) -> dict:
    notifications = _visible_notifications(db, team_id=team_id, current=current)[:5]
    audit_logs: list[dict] = []
    if "team:manage" in permissions:
        recent_logs = db.find(AuditLog, {"team_id": team_id}, sort=[("created_at", -1)])[:5]
        audit_logs = [audit_log_payload(log, db=db) for log in recent_logs]
    return {
        "notifications": [notification_payload(item, current_user_id=current.user_id) for item in notifications],
        "audit_logs": audit_logs,
    }


def _visible_notifications(db: MongoDatabase, *, team_id: str, current: CurrentUser) -> list[Notification]:
    items = db.find(Notification, {"team_id": team_id}, sort=[("created_at", -1)])
    return [item for item in items if _notification_visible_to_current(item, current)]


def _notification_visible_to_current(notification: Notification, current: CurrentUser) -> bool:
    if current.user_id in notification.deleted_for or notification.status in {"deleted", "revoked"}:
        return False
    team_role = role_value(current.team_role)
    if notification.target_type == "team":
        return team_role in ENTERPRISE_BROADCAST_ROLES
    if notification.target_type == "role":
        return team_role in {role_value(item) for item in notification.target_roles}
    if notification.target_type == "member":
        return current.user_id in set(notification.target_user_ids or [])
    if notification.target_type == "task":
        return team_role in REVIEW_ROLES or current.user_id in set(notification.target_user_ids or [])
    return current.user_id in set(notification.target_user_ids or [])


def _summary_cards(production: dict, review: dict, ai: dict, exports: dict, resources: dict) -> list[dict]:
    membership = resources.get("membership") or {}
    usage = membership.get("usage") or {}
    limits = membership.get("limits") or {}
    available_points = resources["points_wallet"].get("available_points", 0)
    member_limit = limits.get("members", 0)
    return [
        {
            "key": "active_tasks",
            "label": "活跃任务",
            "value": production["tasks"]["published"] + production["tasks"]["paused"] + production["tasks"]["pending_review"],
            "status": "processing",
            "hint": f"总任务 {production['tasks']['total']}",
        },
        {
            "key": "review_pending",
            "label": "待人工审核",
            "value": review.get("pending", 0),
            "status": "warning" if review.get("pending", 0) else "success",
            "hint": f"已处理 {review.get('completed', 0)}",
        },
        {
            "key": "ai_pending",
            "label": "AI 预审队列",
            "value": ai["jobs"]["pending"] + ai["jobs"]["processing"],
            "status": "warning" if ai["jobs"]["failed"] else "processing",
            "hint": f"失败 {ai['jobs']['failed']}",
        },
        {
            "key": "exports",
            "label": "导出任务",
            "value": exports.get("completed", 0),
            "status": "error" if exports.get("failed", 0) else "success",
            "hint": f"失败 {exports.get('failed', 0)}",
        },
        {
            "key": "points",
            "label": "企业可用积分",
            "value": available_points,
            "status": "warning" if available_points <= 0 else "success",
            "hint": f"预扣 {resources['points_wallet'].get('reserved_points', 0)}",
        },
        {
            "key": "members",
            "label": "成员额度",
            "value": usage.get("members", 0),
            "status": "error" if member_limit and usage.get("members", 0) > member_limit else "success",
            "hint": f"上限 {member_limit}",
        },
    ]


def _todo_items(viewer_role: str, production: dict, review: dict, ai: dict, exports: dict, resources: dict, governance: dict) -> list[dict]:
    items: list[dict] = []
    if viewer_role in PRODUCTION_ROLES and production["tasks"]["pending_review"]:
        items.append({"key": "task_review", "type": "warning", "title": "任务待发布审核", "count": production["tasks"]["pending_review"], "target_page": "task-management"})
    if viewer_role in REVIEW_ROLES and review.get("pending", 0):
        items.append({"key": "manual_review", "type": "warning", "title": "待人工审核提交", "count": review["pending"], "target_page": "manual-review"})
    if ai["jobs"]["failed"]:
        items.append({"key": "ai_failed", "type": "error", "title": "AI 预审异常", "count": ai["jobs"]["failed"], "target_page": "ai-review"})
    if exports.get("failed", 0):
        items.append({"key": "export_failed", "type": "error", "title": "导出任务失败", "count": exports["failed"], "target_page": "task-management"})
    if resources["points_wallet"].get("available_points", 0) <= 0:
        items.append({"key": "points_low", "type": "warning", "title": "企业可用积分不足", "count": 1, "target_page": "resource-config"})
    if resources["membership"].get("over_limit_items"):
        items.append({"key": "membership_over_limit", "type": "error", "title": "会员额度已超限", "count": len(resources["membership"]["over_limit_items"]), "target_page": "resource-config"})
    return items


def _shortcuts(viewer_role: str) -> list[dict]:
    if viewer_role == TeamRole.REVIEWER.value:
        return [
            {"key": "manual-review", "label": "进入人工审核", "target_page": "manual-review", "kind": "primary"},
            {"key": "announcements", "label": "查看公告通知", "target_page": "announcements", "kind": "default"},
        ]
    if viewer_role == TeamRole.AGENT.value:
        return [
            {"key": "resource-config", "label": "查看 AI 资源", "target_page": "resource-config", "kind": "primary"},
            {"key": "operation-logs", "label": "查看操作日志", "target_page": "operation-logs", "kind": "default"},
        ]
    if viewer_role == TeamRole.OWNER.value:
        return [
            {"key": "task-management", "label": "进入任务管理", "target_page": "task-management", "kind": "primary"},
            {"key": "datasets", "label": "导入数据集", "target_page": "datasets", "kind": "default"},
            {"key": "templates", "label": "搭建模板", "target_page": "templates", "kind": "default"},
        ]
    return [
        {"key": "task-management", "label": "进入任务管理", "target_page": "task-management", "kind": "primary"},
        {"key": "people-management", "label": "管理成员", "target_page": "people-management", "kind": "default"},
        {"key": "resource-config", "label": "查看资源配置", "target_page": "resource-config", "kind": "default"},
    ]


def _to_int(value: Any) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0
