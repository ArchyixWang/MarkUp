from __future__ import annotations

from collections import Counter
from typing import Any

from app.api.deps import CurrentUser
from app.core.database import MongoDatabase
from app.core.errors import AppError, ErrorCode
from app.core.responses import utc_now_iso
from app.domains.rbac import TeamRole, role_value
from app.models.notification import Notification
from app.models.production import Question, Submission, Task
from app.models.profile import Certification, PointsLedger
from app.models.team import Team, TeamMember
from app.models.user import User
from app.services.labels_service import get_labeler_contributions, list_labeler_tasks, list_public_tasks
from app.services.notification_service import notification_payload
from app.services.profile_service import (
    ensure_profile,
    ensure_reputation_wallet,
    ensure_wallet,
    labeler_account_payload,
    labeler_basic_info_status,
    points_payload,
    reputation_payload,
)
from app.services.team_service import team_detail


def team_labeler_dashboard_payload(db: MongoDatabase, *, team_id: str, current: CurrentUser) -> dict:
    team = db.get(Team, team_id)
    if not team:
        raise AppError(ErrorCode.NOT_FOUND, "资源不存在")
    if current.team_id != team_id or role_value(current.team_role) != TeamRole.LABELER.value:
        raise AppError(ErrorCode.PERMISSION_DENIED, "无权限访问该企业项目看板")

    active_tasks = _active_labeler_tasks(db, user_id=current.user_id, team_id=team_id)
    contributions = _scoped_contributions(db, user_id=current.user_id, team_id=team_id)
    progress_summary = _progress_summary(active_tasks)
    contribution_summary = contributions["summary"]
    quality = _quality_summary(contribution_summary)
    notifications = _visible_team_labeler_notifications(db, current=current, team_id=team_id)[:5]

    return {
        "viewer_role": "team_labeler",
        "team": _team_labeler_team_summary(db, team_id),
        "profile": _profile_summary(db, current.user),
        "summary_cards": [
            {"key": "company_tasks", "label": "公司项目", "value": len(active_tasks), "status": "processing", "hint": f"待处理 {progress_summary['pending_questions']} 题"},
            {"key": "pending_questions", "label": "待标注题目", "value": progress_summary["pending_questions"], "status": "warning" if progress_summary["pending_questions"] else "success", "hint": f"已提交 {progress_summary['submitted_questions']}"},
            {"key": "revision_questions", "label": "待修改题目", "value": progress_summary["rejected_questions"], "status": "error" if progress_summary["rejected_questions"] else "success"},
            {"key": "submitted", "label": "待审核提交", "value": contribution_summary.get("submitted", 0), "status": "processing"},
            {"key": "approved", "label": "已通过", "value": contribution_summary.get("approved", 0), "status": "success", "hint": f"通过率 {quality['approval_rate']}%"},
            {"key": "rework_rate", "label": "返工率", "value": f"{quality['rework_rate']}%", "status": "warning" if quality["rework_rate"] else "success"},
        ],
        "todo_items": _team_labeler_todos(progress_summary, contribution_summary),
        "labeling": {
            **progress_summary,
            "status_distribution": _task_progress_distribution(active_tasks),
            "submission_distribution": _submission_distribution(contributions["recent_items"]),
        },
        "quality": quality,
        "recent_tasks": active_tasks[:5],
        "recent_records": contributions["recent_items"][:8],
        "notifications": [notification_payload(item, current_user_id=current.user_id) for item in notifications],
        "shortcuts": [
            {"key": "continue", "label": "继续公司项目", "target_page": "labeler-tasks", "kind": "primary"},
            {"key": "history", "label": "查看项目历史", "target_page": "labeler-questions", "kind": "default"},
            {"key": "announcements", "label": "企业公告", "target_page": "announcements", "kind": "default"},
            {"key": "profile", "label": "个人资料", "target_page": "account-profile", "kind": "default"},
        ],
        "generated_at": utc_now_iso(),
    }


def personal_labeler_dashboard_payload(db: MongoDatabase, *, current: CurrentUser) -> dict:
    if role_value(current.user.global_role) != "labeler":
        raise AppError(ErrorCode.PERMISSION_DENIED, "仅个人标注员可访问个人标注看板")

    tasks = list_labeler_tasks(db, user_id=current.user_id)
    contributions = get_labeler_contributions(db, user_id=current.user_id)
    points = points_payload(db, current.user)
    reputation = reputation_payload(db, current.user)
    profile = ensure_profile(db, current.user)
    certifications = db.find(Certification, {"user_id": current.user_id}, sort=[("created_at", -1)])
    profile_summary = _profile_summary(db, current.user)
    account = labeler_account_payload(profile, certifications, ensure_wallet(db, current.user_id))
    recommended = list_public_tasks(db, quick_filter="recommended", sort="recommended", page=1, page_size=6)
    progress_summary = _progress_summary(tasks["items"])
    contribution_summary = contributions["summary"]
    quality = _quality_summary(contribution_summary)

    return {
        "viewer_role": "personal_labeler",
        "profile": {**profile_summary, "labeler_account": account},
        "summary_cards": [
            {"key": "active_tasks", "label": "已领取任务", "value": tasks["summary"].get("total_tasks", 0), "status": "processing", "hint": f"进行中 {tasks['summary'].get('active_tasks', 0)}"},
            {"key": "pending_questions", "label": "待标注", "value": progress_summary["pending_questions"], "status": "warning" if progress_summary["pending_questions"] else "success"},
            {"key": "submitted", "label": "待审核", "value": contribution_summary.get("submitted", 0), "status": "processing"},
            {"key": "approved", "label": "已通过", "value": contribution_summary.get("approved", 0), "status": "success", "hint": f"通过率 {quality['approval_rate']}%"},
            {"key": "points", "label": "可用积分", "value": points["wallet"].get("available_points", 0), "status": "success", "hint": f"本月收益 {points['overview'].get('month_points', 0)}"},
            {"key": "reputation", "label": "信誉分", "value": reputation["wallet"].get("score", 100), "status": "warning" if reputation["wallet"].get("score", 100) < 80 else "success"},
        ],
        "todo_items": _personal_labeler_todos(profile_summary, account, progress_summary, contribution_summary),
        "labeling": {
            **progress_summary,
            "status_distribution": _task_progress_distribution(tasks["items"]),
            "submission_distribution": _submission_distribution(contributions["recent_items"]),
        },
        "quality": quality,
        "points": {"wallet": points["wallet"], "overview": points["overview"], "recent_items": points["items"][:5]},
        "certifications": {"summary": account.get("certifications") or {}, "items": [certification_dashboard_item(item) for item in certifications[:5]]},
        "recent_tasks": tasks["items"][:5],
        "recent_records": contributions["recent_items"][:8],
        "recommended_tasks": recommended["items"][:5],
        "shortcuts": [
            {"key": "continue", "label": "继续标注", "target_page": "labeler-tasks", "kind": "primary"},
            {"key": "task-square", "label": "去任务广场", "target_url": "/tasks", "kind": "default"},
            {"key": "points", "label": "积分管理", "target_page": "account-points", "kind": "default"},
            {"key": "certifications", "label": "资质认证", "target_page": "account-certifications", "kind": "default"},
        ],
        "generated_at": utc_now_iso(),
    }


def _active_labeler_tasks(db: MongoDatabase, *, user_id: str, team_id: str) -> list[dict]:
    payload = list_labeler_tasks(db, user_id=user_id)
    return [item for item in payload["items"] if _task_team_id(db, item.get("task", {}).get("task_id")) == team_id]


def _scoped_contributions(db: MongoDatabase, *, user_id: str, team_id: str) -> dict:
    payload = get_labeler_contributions(db, user_id=user_id)
    items = [item for item in payload["recent_items"] if _task_team_id(db, item.get("task_id")) == team_id]
    submitted = sum(1 for item in items if item.get("status") == "submitted")
    approved = sum(1 for item in items if item.get("status") == "approved")
    rejected = sum(1 for item in items if item.get("status") == "rejected")
    total = len(items)
    return {
        "summary": {
            "claimed_questions": sum(((item.get("progress") or {}).get("total") or 0) for item in items),
            "pending_questions": sum(((item.get("progress") or {}).get("remaining") or 0) for item in items),
            "total_submissions": total,
            "submitted": submitted,
            "approved": approved,
            "rejected": rejected,
            "accuracy_rate": round((approved / (approved + rejected)) * 100) if approved + rejected else 0,
            "earned_points": 0,
            "estimated_points": 0,
        },
        "recent_items": items,
    }


def _task_team_id(db: MongoDatabase, task_id: str | None) -> str | None:
    task = db.get(Task, task_id) if task_id else None
    return task.team_id if task else None


def _progress_summary(items: list[dict]) -> dict:
    return {
        "total_tasks": len(items),
        "active_tasks": sum(1 for item in items if (item.get("progress") or {}).get("remaining", 0) > 0),
        "total_questions": sum(((item.get("progress") or {}).get("total") or 0) for item in items),
        "pending_questions": sum(((item.get("progress") or {}).get("remaining") or 0) for item in items),
        "submitted_questions": sum(((item.get("progress") or {}).get("submitted") or 0) for item in items),
        "approved_questions": sum(((item.get("progress") or {}).get("approved") or 0) for item in items),
        "rejected_questions": sum(((item.get("progress") or {}).get("rejected") or 0) for item in items),
        "completion_percent": _percent(
            sum(((item.get("progress") or {}).get("submitted") or 0) + ((item.get("progress") or {}).get("approved") or 0) for item in items),
            sum(((item.get("progress") or {}).get("total") or 0) for item in items),
        ),
    }


def _quality_summary(summary: dict) -> dict:
    approved = int(summary.get("approved") or 0)
    rejected = int(summary.get("rejected") or 0)
    submitted = int(summary.get("submitted") or 0)
    reviewed = approved + rejected
    return {
        "approval_rate": _percent(approved, reviewed),
        "rework_rate": _percent(rejected, reviewed),
        "pending_review": submitted,
        "reviewed": reviewed,
        "accuracy_rate": int(summary.get("accuracy_rate") or 0),
    }


def _task_progress_distribution(items: list[dict]) -> list[dict]:
    buckets = Counter()
    for item in items:
        progress = item.get("progress") or {}
        if progress.get("rejected", 0) > 0 or item.get("needs_revision"):
            buckets["待修改"] += 1
        elif progress.get("remaining", 0) > 0:
            buckets["进行中"] += 1
        elif item.get("task_submitted"):
            buckets["已交付"] += 1
        else:
            buckets["待处理"] += 1
    return [{"label": label, "value": value} for label, value in buckets.items()]


def _submission_distribution(items: list[dict]) -> list[dict]:
    labels = {"submitted": "待审核", "approved": "已通过", "rejected": "已打回", "finished": "已完成"}
    counts = Counter(labels.get(str(item.get("status") or ""), str(item.get("status") or "其他")) for item in items)
    return [{"label": label, "value": value} for label, value in counts.items()]


def _team_labeler_todos(progress: dict, summary: dict) -> list[dict]:
    items = []
    if progress["rejected_questions"]:
        items.append({"key": "revision", "type": "error", "title": "有题目需要修改", "count": progress["rejected_questions"], "target_page": "labeler-tasks"})
    if progress["pending_questions"]:
        items.append({"key": "pending", "type": "warning", "title": "公司项目待标注", "count": progress["pending_questions"], "target_page": "labeler-tasks"})
    if summary.get("submitted", 0):
        items.append({"key": "reviewing", "type": "info", "title": "提交等待企业审核", "count": summary["submitted"], "target_page": "labeler-questions"})
    return items


def _personal_labeler_todos(profile: dict, account: dict, progress: dict, summary: dict) -> list[dict]:
    items = []
    if profile.get("basic_info_status") not in {"approved", "pending_review"}:
        items.append({"key": "basic_info", "type": "warning", "title": "完善基础信息后可接取更多任务", "count": 1, "target_page": "account-profile"})
    if progress["rejected_questions"]:
        items.append({"key": "revision", "type": "error", "title": "有打回题目待修改", "count": progress["rejected_questions"], "target_page": "labeler-tasks"})
    if progress["pending_questions"]:
        items.append({"key": "pending", "type": "warning", "title": "继续已领取任务", "count": progress["pending_questions"], "target_page": "labeler-tasks"})
    cert_summary = account.get("certifications") or {}
    if not cert_summary.get("approved_count"):
        items.append({"key": "certification", "type": "info", "title": "补充资质认证提升可接任务范围", "count": 1, "target_page": "account-certifications"})
    if summary.get("submitted", 0):
        items.append({"key": "reviewing", "type": "info", "title": "提交等待审核", "count": summary["submitted"], "target_page": "labeler-questions"})
    return items


def _profile_summary(db: MongoDatabase, user: User) -> dict:
    profile = ensure_profile(db, user)
    reputation = ensure_reputation_wallet(db, user.id)
    return {
        "user_id": user.id,
        "username": user.username,
        "display_name": profile.display_name or user.username,
        "avatar": user.avatar,
        "email": user.email,
        "basic_info_status": labeler_basic_info_status(db, profile),
        "reputation_score": reputation.score,
    }


def _team_labeler_team_summary(db: MongoDatabase, team_id: str) -> dict:
    detail = team_detail(db, team_id)
    return {
        "team_id": detail["team_id"],
        "company_name": detail["company_name"],
        "status": detail.get("status"),
        "verification_status": detail.get("verification_status"),
    }


def _visible_team_labeler_notifications(db: MongoDatabase, *, current: CurrentUser, team_id: str) -> list[Notification]:
    notifications = db.find(Notification, {"team_id": team_id}, sort=[("created_at", -1)])
    items = []
    for item in notifications:
        if item.deleted_at or current.user_id in item.deleted_for or item.status in {"deleted", "revoked"}:
            continue
        target_roles = {role_value(role) for role in (item.target_roles or [])}
        if item.target_type == "member" and current.user_id in set(item.target_user_ids or []):
            items.append(item)
        elif item.target_type == "role" and TeamRole.LABELER.value in target_roles:
            items.append(item)
        elif item.target_type == "task" and current.user_id in set(item.target_user_ids or []):
            items.append(item)
    return items


def certification_dashboard_item(item: Certification) -> dict:
    return {
        "certification_id": item.id,
        "cert_category": item.cert_category,
        "cert_type": item.cert_type,
        "cert_name": item.cert_name,
        "status": item.status,
        "reviewer_notes": item.reviewer_notes,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


def _percent(value: int | float, total: int | float) -> int:
    if not total:
        return 0
    return round((float(value) / float(total)) * 100)
