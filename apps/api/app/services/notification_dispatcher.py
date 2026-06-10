from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

from fastapi import Request

from app.core.database import MongoDatabase
from app.core.errors import AppError
from app.models.ai_review import AiReviewJob
from app.models.notification import Notification
from app.models.production import Question, Submission, Task
from app.models.team import TeamMember
from app.services.audit_service import write_audit_log
from app.services.notification_service import notification_payload, preview_recipients

SYSTEM_SENDER_NAME = "MarkUp 系统"
TEAM_OPERATOR_ROLES = ["team_admin", "owner"]
REVIEW_OPERATOR_ROLES = ["team_admin", "owner", "reviewer"]


def workspace_url(page: str, **params: Any) -> str:
    query = {"page": page, **{key: value for key, value in params.items() if value is not None and value != ""}}
    return f"/workspace?{urlencode(query)}"


def emit_notification(
    db: MongoDatabase,
    *,
    event_key: str,
    team_id: str,
    notification_type: str,
    title: str,
    content: str,
    target_type: str = "role",
    target_roles: list[str] | None = None,
    target_user_ids: list[str] | None = None,
    related_entity_type: str | None = None,
    related_entity_id: str | None = None,
    action_url: str | None = None,
    metadata: dict[str, Any] | None = None,
    priority: str = "normal",
    actor_id: str | None = None,
    request: Request | None = None,
) -> dict:
    if not team_id:
        return {"emitted": False, "reason": "missing_team_id", "event_key": event_key}

    existing = db.find_one(Notification, {"team_id": team_id, "event_key": event_key})
    if existing:
        return {
            "emitted": False,
            "reason": "duplicate",
            "event_key": event_key,
            "notification_id": existing.id,
        }

    try:
        recipients = preview_recipients(
            db,
            team_id,
            target_type,
            target_roles or [],
            target_user_ids or [],
            related_entity_id=related_entity_id,
        )
    except AppError as exc:
        return {"emitted": False, "reason": exc.code, "event_key": event_key}

    if recipients["total"] <= 0:
        return {"emitted": False, "reason": "no_recipients", "event_key": event_key}

    notification = Notification(
        team_id=team_id,
        event_key=event_key,
        title=title[:120],
        content=content[:4000],
        notification_type=notification_type,
        priority=priority,
        target_type=target_type,
        target_roles=target_roles or [],
        target_user_ids=recipients["user_ids"] if target_type in {"member", "task"} else [],
        related_entity_type=related_entity_type,
        related_entity_id=related_entity_id,
        action_url=action_url,
        metadata=metadata or {},
        sender_id=actor_id,
        sender_name=SYSTEM_SENDER_NAME,
        in_app_enabled=True,
        email_enabled=False,
    )
    db.add(notification)
    write_audit_log(
        db,
        entity_type="notification",
        entity_id=notification.id,
        action="system_notification_emitted",
        operator_id=actor_id,
        team_id=team_id,
        changes={
            "event_key": event_key,
            "notification_type": notification_type,
            "target_type": target_type,
            "recipients": recipients["total"],
            "related_entity_type": related_entity_type,
            "related_entity_id": related_entity_id,
            "action_url": action_url,
        },
        request=request,
    )
    return {
        "emitted": True,
        "event_key": event_key,
        "notification_id": notification.id,
        "recipients": recipients,
        "notification": notification_payload(notification, current_user_id=actor_id or "", recipient_summary=recipients),
    }


def notify_task_publish_requested(db: MongoDatabase, *, task: Task, actor_id: str, request: Request | None = None) -> dict:
    return emit_notification(
        db,
        event_key=f"task:{task.id}:publish-requested",
        team_id=task.team_id,
        notification_type="task",
        title="任务发布申请待审核",
        content=f"任务「{task.title}」已提交发布申请，请企业管理员审核。",
        target_type="role",
        target_roles=["team_admin"],
        related_entity_type="task",
        related_entity_id=task.id,
        action_url=workspace_url("task-management", task_id=task.id),
        metadata={"task_title": task.title, "status": task.status, "quota": task.quota},
        actor_id=actor_id,
        request=request,
    )


def notify_task_published(db: MongoDatabase, *, task: Task, actor_id: str | None, request: Request | None = None) -> dict:
    return emit_notification(
        db,
        event_key=f"task:{task.id}:published:operators",
        team_id=task.team_id,
        notification_type="task",
        title="任务已发布",
        content=f"任务「{task.title}」已发布，标注与审核流程可以开始。",
        target_type="role",
        target_roles=REVIEW_OPERATOR_ROLES,
        related_entity_type="task",
        related_entity_id=task.id,
        action_url=workspace_url("task-management", task_id=task.id),
        metadata={"task_title": task.title, "status": task.status, "quota": task.quota},
        actor_id=actor_id,
        request=request,
    )


def notify_task_status_changed(
    db: MongoDatabase,
    *,
    task: Task,
    previous_status: str,
    action: str,
    actor_id: str,
    request: Request | None = None,
) -> dict:
    labels = {
        "approve": "任务发布审核通过",
        "pause": "任务已暂停",
        "resume": "任务已恢复",
        "finish": "任务已关闭",
    }
    priority = "important" if action in {"pause", "finish"} else "normal"
    return emit_notification(
        db,
        event_key=f"task:{task.id}:status:{previous_status}:{task.status}",
        team_id=task.team_id,
        notification_type="task",
        title=labels.get(action, "任务状态已更新"),
        content=f"任务「{task.title}」状态已从 {previous_status} 更新为 {task.status}。",
        target_type="task",
        related_entity_type="task",
        related_entity_id=task.id,
        action_url=workspace_url("task-management", task_id=task.id),
        metadata={"task_title": task.title, "from": previous_status, "to": task.status, "action": action},
        priority=priority,
        actor_id=actor_id,
        request=request,
    )


def notify_submission_submitted(db: MongoDatabase, *, task: Task, question: Question, submission: Submission, request: Request | None = None) -> dict:
    reviewer_ids = review_recipient_ids(db, task)
    return emit_notification(
        db,
        event_key=f"submission:{submission.id}:submitted:r{submission.current_round}",
        team_id=task.team_id,
        notification_type="review",
        title="有新的提交待审核",
        content=f"任务「{task.title}」有新的标注提交进入审核队列。",
        target_type="member",
        target_user_ids=reviewer_ids,
        related_entity_type="submission",
        related_entity_id=submission.id,
        action_url=workspace_url("manual-review", task_id=task.id, submission_id=submission.id),
        metadata={"task_id": task.id, "task_title": task.title, "question_id": question.id, "round": submission.current_round},
        actor_id=submission.labeler_id,
        request=request,
    )


def notify_ai_review_job_processed(db: MongoDatabase, *, task: Task, job: AiReviewJob, released_to_review: bool, request: Request | None = None) -> dict:
    failed = job.status == "failed"
    return emit_notification(
        db,
        event_key=f"ai-review:{job.id}:processed:{job.status}:r{job.retry_count}",
        team_id=task.team_id,
        notification_type="review",
        title="AI 预审失败" if failed else "AI 预审完成",
        content=f"任务「{task.title}」的一条提交 AI 预审{'失败' if failed else '已完成'}，{'已转入人工审核。' if released_to_review else '请查看详情。'}",
        target_type="member",
        target_user_ids=review_recipient_ids(db, task),
        related_entity_type="ai_review",
        related_entity_id=job.id,
        action_url=workspace_url("ai-review-task", task_id=task.id, job_id=job.id),
        metadata={"task_id": task.id, "submission_id": job.submission_id, "status": job.status, "error": job.error, "released_to_review": released_to_review},
        priority="important" if failed else "normal",
        actor_id=None,
        request=request,
    )


def notify_review_decision(
    db: MongoDatabase,
    *,
    task: Task,
    question: Question,
    submission: Submission,
    decision: str,
    reviewer_id: str,
    points_settlement: dict | None,
    request: Request | None = None,
) -> dict:
    decision_label = {"approved": "审核通过", "rejected": "审核驳回", "revise": "审核修订通过"}.get(decision, "审核完成")
    return emit_notification(
        db,
        event_key=f"submission:{submission.id}:reviewed:r{submission.current_round}:{decision}",
        team_id=task.team_id,
        notification_type="task",
        title=decision_label,
        content=f"你在任务「{task.title}」中的一条提交已{decision_label}。",
        target_type="member",
        target_user_ids=[submission.labeler_id],
        related_entity_type="submission",
        related_entity_id=submission.id,
        action_url=workspace_url("labeler-questions", task_id=task.id, submission_id=submission.id),
        metadata={"task_id": task.id, "task_title": task.title, "question_id": question.id, "decision": decision, "points_settlement": points_settlement},
        priority="important" if decision == "rejected" else "normal",
        actor_id=reviewer_id,
        request=request,
    )


def notify_export_completed(db: MongoDatabase, *, team_id: str, task: Task, export_id: str, operator_id: str, row_count: int, request: Request | None = None) -> dict:
    return emit_notification(
        db,
        event_key=f"export:{export_id}:completed",
        team_id=team_id,
        notification_type="export",
        title="数据导出已完成",
        content=f"任务「{task.title}」的导出文件已生成，共包含 {row_count} 条记录。",
        target_type="member",
        target_user_ids=list(dict.fromkeys([operator_id, task.owner_id, *team_role_user_ids(db, team_id, TEAM_OPERATOR_ROLES)])),
        related_entity_type="export",
        related_entity_id=export_id,
        action_url=workspace_url("export-center", task_id=task.id, export_id=export_id),
        metadata={"task_id": task.id, "task_title": task.title, "row_count": row_count, "status": "completed"},
        actor_id=operator_id,
        request=request,
    )


def notify_team_security_event(
    db: MongoDatabase,
    *,
    team_id: str,
    event_key: str,
    title: str,
    content: str,
    target_user_ids: list[str] | None = None,
    actor_id: str | None,
    related_entity_type: str = "team_member",
    related_entity_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    request: Request | None = None,
) -> dict:
    return emit_notification(
        db,
        event_key=event_key,
        team_id=team_id,
        notification_type="security",
        title=title,
        content=content,
        target_type="member" if target_user_ids else "role",
        target_roles=None if target_user_ids else TEAM_OPERATOR_ROLES,
        target_user_ids=target_user_ids,
        related_entity_type=related_entity_type,
        related_entity_id=related_entity_id,
        action_url=workspace_url("people-management"),
        metadata=metadata or {},
        priority="important",
        actor_id=actor_id,
        request=request,
    )


def review_recipient_ids(db: MongoDatabase, task: Task) -> list[str]:
    ids = {task.owner_id, *team_role_user_ids(db, task.team_id, ["team_admin"])}
    ids.update(task.reviewer_ids or [])
    for member in db.find(TeamMember, {"team_id": task.team_id, "team_role": "reviewer", "status": "active"}):
        if not member.is_system_member and (not member.assigned_review_tasks or task.id in set(member.assigned_review_tasks)):
            ids.add(member.user_id)
    return [item for item in ids if item]


def team_role_user_ids(db: MongoDatabase, team_id: str, roles: list[str]) -> list[str]:
    role_set = set(roles)
    members = db.find(TeamMember, {"team_id": team_id, "status": "active"})
    return [member.user_id for member in members if member.team_role in role_set and not member.is_system_member and member.team_role != "agent"]
