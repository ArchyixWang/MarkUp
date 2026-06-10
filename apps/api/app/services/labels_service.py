from __future__ import annotations

import base64
import json
import re
from datetime import datetime, timedelta
from math import ceil

from fastapi import Request

from app.core.database import MongoDatabase
from app.core.errors import AppError, ErrorCode
from app.core.security import generate_object_id, now_utc
from app.domains.rbac import TeamRole, role_value
from app.models.audit import AuditLog
from app.models.profile import Certification
from app.models.production import Question, Submission, Task, TaskClaimBundle
from app.models.team import Team, TeamMember
from app.models.upload import UploadedFile
from app.models.user import User, UserProfile
from app.services.production_service import compact_ai_generation_payload, get_task_bound_template_version, normalize_template_schema, question_payload, run_platform_provider_messages_generation, strip_json_fence, sync_task_question_stats, task_ai_readiness, task_payload, task_question_query, template_components, validate_template_answers
from app.services.audit_service import write_audit_log
from app.services.notification_dispatcher import notify_submission_submitted
from app.services.profile_service import REPUTATION_CLAIM_MIN_SCORE, REPUTATION_DEDUCTION_MULTIPLIER, adjust_reputation, ensure_reputation_wallet

DEFAULT_BUNDLES = [50, 100, 200]
KNOWN_QUALIFICATIONS = {"law", "medical", "finance", "code", "autonomous_driving", "audio", "fact_check"}
ABANDON_RATES = {"easy": 0.02, "medium": 0.05, "hard": 0.1}
LABELING_AI_ASSIST_RESULT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["answers", "explanation", "field_explanations", "image_annotations"],
    "properties": {
        "answers": {
            "type": "object",
            "description": "按模板答案字段 field 输出的建议答案。",
            "additionalProperties": True,
        },
        "explanation": {
            "type": "string",
            "description": "整体判断依据和不确定性说明。",
        },
        "field_explanations": {
            "type": "object",
            "description": "按字段 field 输出的单项答案依据。",
            "additionalProperties": {"type": "string"},
        },
        "image_annotations": {
            "type": "array",
            "description": "可选图片区域建议，坐标均为 0-1 归一化值。",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["source_id", "label", "shape", "x", "y", "width", "height"],
                "properties": {
                    "source_id": {"type": "string"},
                    "label": {"type": "string"},
                    "shape": {"type": "string", "enum": ["circle", "rect"]},
                    "x": {"type": "number", "minimum": 0, "maximum": 1},
                    "y": {"type": "number", "minimum": 0, "maximum": 1},
                    "width": {"type": "number", "minimum": 0, "maximum": 1},
                    "height": {"type": "number", "minimum": 0, "maximum": 1},
                },
            },
        },
    },
}


def list_public_tasks(
    db: MongoDatabase,
    *,
    current_user: object | None = None,
    keyword: str | None = None,
    category: str | None = None,
    difficulty: str | None = None,
    qualification_required: str | None = None,
    status: str | None = None,
    team_verified: bool | None = None,
    tag: str | None = None,
    unit_range: str | None = None,
    deadline_range: str | None = None,
    quick_filter: str | None = None,
    team_scope: str | None = None,
    sort: str = "recommended",
    page: int = 1,
    page_size: int = 6,
) -> dict:
    tasks = [marketplace_task_payload(db, task) for task in db.find(Task, {"status": "published"})]
    filtered = [
        task
        for task in tasks
        if is_task_visible_in_labeling_market(db, task, current_user, team_scope)
        and matches_task(task, keyword, category, difficulty, qualification_required, status, team_verified, tag, unit_range, deadline_range, quick_filter, team_scope, current_user)
    ]
    filtered = sort_tasks(filtered, sort)
    total = len(filtered)
    safe_page_size = page_size if page_size in {6, 12, 24} else 6
    total_pages = max(1, ceil(total / safe_page_size))
    safe_page = min(max(page, 1), total_pages)
    start = (safe_page - 1) * safe_page_size
    return {
        "items": [public_marketplace_item(item) for item in filtered[start : start + safe_page_size]],
        "pagination": {"page": safe_page, "page_size": safe_page_size, "total": total, "total_pages": total_pages},
    }


def matches_task(
    task: dict,
    keyword: str | None,
    category: str | None,
    difficulty: str | None,
    qualification_required: str | None,
    status: str | None,
    team_verified: bool | None,
    tag: str | None,
    unit_range: str | None,
    deadline_range: str | None,
    quick_filter: str | None,
    team_scope: str | None,
    current_user: object | None,
) -> bool:
    if keyword:
        haystack = " ".join([task["task_id"], task["title"], task["description"], task.get("owner_team_name") or "", " ".join(task["tags"])]).lower()
        if keyword.lower() not in haystack:
            return False
    if category and task["category"] != category:
        return False
    if difficulty and task["difficulty"] != difficulty:
        return False
    if qualification_required and task["qualification_required"] != qualification_required:
        return False
    if status and task["status"] != status:
        return False
    if team_verified is not None and task["team_verified"] is not team_verified:
        return False
    if tag and tag not in task["tags"]:
        return False
    if unit_range and not matches_unit_range(task["unit_points"], unit_range):
        return False
    if deadline_range and not matches_deadline_range(task["deadline"], deadline_range):
        return False
    if quick_filter and quick_filter != "all" and not matches_quick_filter(task, quick_filter):
        return False
    return True


def sort_tasks(tasks: list[dict], sort: str) -> list[dict]:
    if sort == "unitDesc":
        return sorted(tasks, key=lambda item: item["unit_points"], reverse=True)
    if sort == "deadlineAsc":
        return sorted(tasks, key=lambda item: item["deadline"] or "9999-12-31")
    if sort == "newest":
        return sorted(tasks, key=lambda item: item["published_at"], reverse=True)
    if sort == "availableDesc":
        return sorted(tasks, key=lambda item: item["available_items"], reverse=True)
    priority_order = {"recommended": 0, "urgent": 1, "new": 2, "standard": 3}
    return sorted(tasks, key=lambda item: (priority_order.get(item["priority"], 9), -item["unit_points"], item["deadline"] or "9999-12-31"))


def matches_unit_range(unit_points: int, unit_range: str) -> bool:
    if unit_range == "under3":
        return unit_points < 3
    if unit_range == "3to5":
        return 3 <= unit_points <= 5
    if unit_range == "6plus":
        return unit_points >= 6
    return True


def matches_deadline_range(deadline: str | None, deadline_range: str) -> bool:
    days = days_until(deadline)
    if days is None:
        return deadline_range == "later"
    if deadline_range == "within7":
        return days <= 7
    if deadline_range == "within14":
        return days <= 14
    if deadline_range == "later":
        return days > 14
    return True


def matches_quick_filter(task: dict, quick_filter: str) -> bool:
    if quick_filter == "recommended":
        return is_recommended_marketplace_task(task)
    if quick_filter == "highReward":
        return task["unit_points"] >= 6
    if quick_filter == "deadlineSoon":
        days = days_until(task["deadline"])
        return days is not None and days <= 7
    if quick_filter == "easyStart":
        return task["difficulty"] == "easy" and task["qualification_required"] == "none"
    if quick_filter == "new":
        return task["priority"] == "new"
    return True


def is_recommended_marketplace_task(task: dict) -> bool:
    if task.get("status") != "open" or int(task.get("available_items") or 0) <= 0:
        return False
    if task.get("priority") == "recommended":
        return True
    days = days_until(task.get("deadline"))
    return (
        int(task.get("unit_points") or 0) >= 6
        or task.get("difficulty") == "easy"
        or (days is not None and days <= 7)
        or int(task.get("available_items") or 0) >= 20
    )


def matches_team_scope(task: dict, current_user: object | None) -> bool:
    team_id = getattr(current_user, "team_id", None)
    team_role = getattr(current_user, "team_role", None)
    user_id = getattr(current_user, "user_id", None)
    if not team_id or team_role != "labeler":
        return False
    return (
        task.get("team_id") == team_id
        and task.get("distribution") == "quota_grab"
        and is_targeted_internal_labeler({"target_labeler_ids": task.get("_target_labeler_ids") or []}, user_id)
    )


def user_is_active_task_team_labeler_by_ids(db: MongoDatabase, team_id: str | None, user_id: str | None) -> bool:
    if not team_id or not user_id:
        return False
    member = db.find_one(TeamMember, {"team_id": team_id, "user_id": user_id, "status": "active"})
    return bool(
        member
        and role_value(member.team_role) == TeamRole.LABELER.value
        and not member.is_system_member
    )


def is_task_visible_in_labeling_market(db: MongoDatabase, task: dict, current_user: object | None, team_scope: str | None) -> bool:
    distribution = task.get("distribution") or "first_come_all"
    if distribution == "assigned_link":
        return False
    if getattr(current_user, "team_role", None) == "labeler" and getattr(current_user, "team_id", None):
        return matches_team_scope(task, current_user)
    if distribution == "quota_grab":
        return team_scope == "mine" and matches_team_scope(task, current_user)
    if user_is_active_task_team_labeler_by_ids(db, task.get("team_id"), getattr(current_user, "user_id", None)):
        return False
    return team_scope != "mine"


def current_user_can_claim_team_flow_task(task: Task, current_user: object | None) -> bool:
    return (
        getattr(current_user, "team_id", None) == task.team_id
        and getattr(current_user, "team_role", None) == "labeler"
        and is_targeted_internal_labeler(getattr(task, "assignment", {}) or {}, getattr(current_user, "user_id", None))
    )


def user_is_active_task_team_labeler(db: MongoDatabase, task: Task, user_id: str | None) -> bool:
    return user_is_active_task_team_labeler_by_ids(db, task.team_id, user_id)


def ensure_task_claim_distribution_access(db: MongoDatabase, task: Task, current_user: object | None, user_id: str | None = None) -> None:
    distribution = task.distribution or "first_come_all"
    current_user_id = user_id or getattr(current_user, "user_id", None)
    is_current_request_team_labeler = bool(getattr(current_user, "team_id", None)) and getattr(current_user, "team_role", None) == "labeler"
    is_task_team_labeler = is_current_request_team_labeler or user_is_active_task_team_labeler(db, task, current_user_id)
    if is_task_team_labeler:
        if distribution != "quota_grab" or not current_user_can_claim_team_flow_task(task, current_user):
            raise AppError(ErrorCode.NOT_FOUND, "任务不存在")
        return
    if distribution == "quota_grab":
        raise AppError(ErrorCode.NOT_FOUND, "任务不存在")


def internal_target_labeler_ids(assignment: dict | None) -> list[str]:
    raw_ids = (assignment or {}).get("target_labeler_ids")
    if not isinstance(raw_ids, list):
        return []
    return [str(item) for item in raw_ids if str(item).strip()]


def is_targeted_internal_labeler(assignment: dict | None, user_id: str | None) -> bool:
    target_ids = internal_target_labeler_ids(assignment)
    return not target_ids or bool(user_id and user_id in target_ids)


def public_marketplace_item(task: dict) -> dict:
    return {key: value for key, value in task.items() if not key.startswith("_")}


def claim_task_bundle(db: MongoDatabase, *, task_id: str, user: User, current_user: object | None = None, bundle_size: int, agreement_accepted: bool = False, request: Request) -> dict:
    task = db.get(Task, task_id)
    if not task or task.status != "published":
        raise AppError(ErrorCode.NOT_FOUND, "task not found")
    ensure_task_claim_distribution_access(db, task, current_user, user.id)
    reputation_wallet = ensure_reputation_wallet(db, user.id)
    if reputation_wallet.score < REPUTATION_CLAIM_MIN_SCORE:
        raise AppError(ErrorCode.BUSINESS_RULE, "因您的信誉分过低，接取任务失败，请信誉分大于等于80分后再重新接取任务", {"score": reputation_wallet.score, "claim_min_score": REPUTATION_CLAIM_MIN_SCORE})
    remaining_days = days_until(task.deadline)
    if remaining_days is not None and remaining_days < 0:
        raise AppError(ErrorCode.STATE_CONFLICT, "任务已关闭")
    if has_active_assignment_for_task(db, task, user.id):
        raise AppError(ErrorCode.CLAIM_LIMIT, "该任务仍有未完成题目，请完成后再继续领取")
    qualification = check_task_qualification(db, task_id=task_id, user=user, current_user=current_user)
    if not qualification["eligible"]:
        raise AppError(ErrorCode.BUSINESS_RULE, "不满足任务领取资质", qualification)
    agreement_config = getattr(task, "agreement_config", {}) or {}
    if agreement_config.get("required") and not agreement_accepted:
        raise AppError(ErrorCode.BUSINESS_RULE, "领取任务前必须阅读并同意任务用户协议", {"agreement_required": True})
    available_questions = db.find(Question, task_question_query(task, {"status": "pending", "assigned_to": None}), sort=[("row_index", 1)])
    available_count = len(available_questions)
    if available_count <= 0:
        raise AppError(ErrorCode.QUOTA_FULL, "可领取题目数量不足", {"available_items": available_count})
    if bundle_size <= 0:
        raise AppError(ErrorCode.VALIDATION_RANGE, "领取数量不可用", {"bundle_options": effective_bundle_options(task, available_count)})
    bundle_options = effective_bundle_options(task, available_count)
    if bundle_options and bundle_size not in set(bundle_options):
        raise AppError(ErrorCode.VALIDATION_RANGE, "领取数量不可用", {"bundle_options": bundle_options})
    if bundle_size > available_count:
        raise AppError(ErrorCode.QUOTA_FULL, "领取数量超过可用题目数量", {"available_items": available_count})
    if len(available_questions) < bundle_size:
        raise AppError(ErrorCode.QUOTA_FULL, "可领取题目数量不足", {"available_items": len(available_questions)})
    now = now_utc().replace(tzinfo=None)
    claim_config = getattr(task, "claim_config", {}) or {}
    completion_hours = int(claim_config.get("completion_hours") or 0)
    claim_due_at = now + timedelta(hours=completion_hours) if completion_hours > 0 else None
    claimed = available_questions[:bundle_size]
    bundle_id = generate_object_id()
    claim_bundle = TaskClaimBundle(
        id=bundle_id,
        team_id=task.team_id,
        task_id=task.id,
        labeler_id=user.id,
        question_ids=[question.id for question in claimed],
        bundle_size=bundle_size,
        reward_points_total=unit_points(task) * bundle_size,
        status="claimed",
        claim_due_at=claim_due_at,
        updated_at=now,
    )
    db.add(claim_bundle)
    for question in claimed:
        question.status = "claimed"
        question.assigned_to = user.id
        question.claim_bundle_id = bundle_id
        question.claim_due_at = claim_due_at
        question.updated_at = now
        db.save(question)
        submission = find_or_create_submission(db, task, question, user.id, claim_bundle_id=bundle_id)
        submission.status = submission.status or "draft"
        submission.updated_at = now
        db.save(submission)
    sync_task_question_stats(db, task)
    write_audit_log(
        db,
        entity_type="task",
        entity_id=task_id,
        action="task_bundle_claimed",
        operator_id=user.id,
        team_id=task.team_id,
        changes={
            "bundle_id": bundle_id,
            "bundle_size": bundle_size,
            "agreement_accepted": agreement_accepted,
            "claim_due_at": claim_due_at.isoformat() if claim_due_at else None,
        },
        request=request,
    )
    db.commit()
    return {"task_id": task_id, "bundle_id": bundle_id, "bundle_size": bundle_size, "claimed_items": bundle_size, "remaining_items": available_item_count(db, task)}


def check_task_qualification(db: MongoDatabase, *, task_id: str, user: User, current_user: object | None = None) -> dict:
    task = db.get(Task, task_id)
    if not task or task.status != "published":
        raise AppError(ErrorCode.NOT_FOUND, "task not found")
    ensure_task_claim_distribution_access(db, task, current_user, user.id)
    domain = qualification_required(task)
    completed_tasks = completed_submission_count(db, user.id)
    accuracy_rate = approved_accuracy_rate(db, user.id)
    min_completed_tasks = int(task.qualification_rules.get("min_completed_tasks") or 0)
    min_accuracy_rate = int(task.qualification_rules.get("min_accuracy_rate") or 0)
    has_active_claim = has_active_assignment_for_task(db, task, user.id)
    checks = [
        {
            "key": "domain",
            "label": "领域资质",
            "required": domain,
            "actual": "approved" if domain == "none" or has_domain_qualification(db, user.id, domain) else "missing",
            "passed": domain == "none" or has_domain_qualification(db, user.id, domain),
            "message": "无需领域资质" if domain == "none" else f"需要 {domain} 领域资质",
        },
        {
            "key": "completed_tasks",
            "label": "完成任务数",
            "required": min_completed_tasks,
            "actual": completed_tasks,
            "passed": completed_tasks >= min_completed_tasks,
            "message": f"至少完成 {min_completed_tasks} 条已通过标注" if min_completed_tasks else "无完成量门槛",
        },
        {
            "key": "accuracy_rate",
            "label": "历史准确率",
            "required": min_accuracy_rate,
            "actual": accuracy_rate,
            "passed": accuracy_rate >= min_accuracy_rate,
            "message": f"历史通过率需达到 {min_accuracy_rate}%" if min_accuracy_rate else "无准确率门槛",
        },
        {
            "key": "active_task",
            "label": "当前任务领取状态",
            "required": "no_active_claim",
            "actual": "active_claim" if has_active_claim else "available",
            "passed": not has_active_claim,
            "message": "该任务仍有未完成题目，请完成后再继续领取" if has_active_claim else "当前可继续领取该任务",
        },
    ]
    failed = [item for item in checks if not item["passed"]]
    return {
        "task_id": task_id,
        "eligible": len(failed) == 0,
        "qualification_required": domain,
        "checks": checks,
        "failed_checks": failed,
        "summary": "满足领取条件" if not failed else "；".join(item["message"] for item in failed),
    }


def has_active_assignment_for_task(db: MongoDatabase, task: Task, user_id: str) -> bool:
    assigned_questions = db.find(Question, task_question_query(task, {"assigned_to": user_id}))
    submissions = db.find(Submission, {"team_id": task.team_id, "task_id": task.id, "labeler_id": user_id})
    if not submissions:
        return any(question.status in {"claimed", "submitted", "rejected"} for question in assigned_questions)
    assigned_question_ids = {question.id for question in assigned_questions if question.status in {"claimed", "submitted", "rejected"}}
    question_cache: dict[str, Question | None] = {}
    for submission in submissions:
        question = question_cache.get(submission.question_id)
        if submission.question_id not in question_cache:
            question = db.get(Question, submission.question_id) if submission.question_id else None
            question_cache[submission.question_id] = question
        assigned_question_ids.discard(submission.question_id)
        if not is_claim_cycle_finished(question, submission, user_id):
            return True
    return bool(assigned_question_ids)


def is_claim_cycle_finished(question: Question | None, submission: Submission, user_id: str) -> bool:
    if submission.status in {"abandoned", "approved"}:
        return True
    if submission.status == "rejected":
        if question and question.assigned_to == user_id and question.status in {"claimed", "rejected", "submitted"}:
            return False
        return submission.current_round >= 3
    if question and question.assigned_to == user_id and question.status in {"claimed", "submitted", "rejected"}:
        return False
    return submission.status not in {"draft", "submitted"}


def get_labeling_workbench(db: MongoDatabase, *, task_id: str, user_id: str) -> dict:
    task = require_claimed_task(db, task_id, user_id)
    assigned_questions = [
        question
        for question in db.find(Question, task_question_query(task, {"assigned_to": user_id}), sort=[("row_index", 1)])
        if question.status in {"claimed", "submitted", "rejected"}
    ]
    abandoned_questions = []
    assigned_ids = {question.id for question in assigned_questions}
    for submission in db.find(Submission, {"team_id": task.team_id, "task_id": task.id, "labeler_id": user_id, "status": "abandoned"}):
        question = db.get(Question, submission.question_id) if submission.question_id else None
        if question and question.id not in assigned_ids:
            abandoned_questions.append(question)
    questions = sorted([*assigned_questions, *abandoned_questions], key=lambda item: item.row_index)
    if not questions:
        raise AppError(ErrorCode.NOT_FOUND, "尚未领取该任务题目")
    template_version = require_bound_template_version(db, task)
    submissions = submissions_by_question(db, task, user_id)
    current_question = next((question for question in questions if effective_labeler_question_status(question, submissions.get(question.id)) in {"claimed", "draft", "rejected"}), questions[0])
    return {
        "task": public_labeling_task_payload(task),
        "template": {
            "template_id": task.template_id,
            "template_version_id": task.template_version_id,
            "version": template_version.version,
            "schema": template_version.schema,
        },
        "questions": [labeling_question_summary(question, submissions.get(question.id)) for question in questions],
        "current_question": labeling_question_detail(current_question, submissions.get(current_question.id), template_version.schema),
        "progress": labeling_progress(questions, submissions, task=task, user_id=user_id, db=db),
    }

def list_labeler_tasks(db: MongoDatabase, *, user_id: str) -> dict:
    apply_overdue_labeling_penalties(db, user_id=user_id)
    submissions = db.find(Submission, {"labeler_id": user_id})
    submissions_by_question_id = {submission.question_id: submission for submission in submissions}
    question_by_id: dict[str, Question] = {}
    for question in db.find(Question, {"assigned_to": user_id}, sort=[("updated_at", -1)]):
        submission = submissions_by_question_id.get(question.id)
        if is_labeler_active_question(question, submission):
            question_by_id[question.id] = question
    for submission in submissions:
        question = db.get(Question, submission.question_id) if submission.question_id else None
        if question and is_labeler_recoverable_question(question, submission, user_id):
            question_by_id[question.id] = question

    task_questions: dict[str, list[Question]] = {}
    for question in question_by_id.values():
        task_questions.setdefault(question.task_id, []).append(question)

    items = []
    for task_id, assigned_questions in task_questions.items():
        task = db.get(Task, task_id)
        if not task or task.status not in {"published", "paused", "finished"}:
            continue
        ordered_questions = sorted(assigned_questions, key=lambda item: item.row_index)
        first_active_question = next((question for question in ordered_questions if effective_labeler_question_status(question, submissions_by_question_id.get(question.id)) in {"claimed", "draft", "rejected"}), ordered_questions[0] if ordered_questions else None)
        latest_at = latest_question_activity(ordered_questions, submissions_by_question_id)
        progress = labeling_progress(ordered_questions, submissions_by_question_id, task=task, user_id=user_id, db=db)
        has_rejected_questions = task_has_rejected_question(ordered_questions, submissions_by_question_id)
        if task.status == "finished" and not has_rejected_questions:
            continue
        if has_rejected_questions:
            progress = {**progress, "rejected": max(progress["rejected"], 1)}
        task_confirmed = task_submission_confirmed(ordered_questions, submissions_by_question_id)
        if task_confirmed and not has_rejected_questions:
            continue
        items.append(
            {
                "task": public_labeling_task_payload(task),
                "progress": progress,
                "latest_question_id": first_active_question.id if first_active_question else None,
                "last_updated_at": isoformat_or_none(latest_at),
                "task_submitted": task_confirmed,
                "needs_revision": has_rejected_questions,
            }
        )

    items.sort(key=lambda item: item["last_updated_at"] or "", reverse=True)
    return {
        "items": items,
        "summary": {
            "total_tasks": len(items),
            "active_tasks": len([item for item in items if item["progress"]["remaining"] > 0]),
            "submitted_questions": sum(item["progress"]["submitted"] for item in items),
            "pending_questions": sum(item["progress"]["remaining"] for item in items),
            "rejected_questions": sum(item["progress"]["rejected"] for item in items),
        },
    }


def get_labeling_question(db: MongoDatabase, *, question_id: str, user_id: str) -> dict:
    question = require_labeler_question(db, question_id, user_id, allow_abandoned=True)
    task = db.get(Task, question.task_id)
    if not task:
        raise AppError(ErrorCode.NOT_FOUND, "任务不存在")
    template_version = require_bound_template_version(db, task)
    submission = find_submission(db, question.id, user_id)
    return labeling_question_detail(question, submission, template_version.schema)


def get_question_rejection_detail(db: MongoDatabase, *, question_id: str, user_id: str) -> dict:
    question = require_labeler_question(db, question_id, user_id)
    submission = find_submission(db, question.id, user_id)
    if not submission:
        raise AppError(ErrorCode.NOT_FOUND, "提交不存在")
    logs = db.find(AuditLog, {"team_id": submission.team_id, "entity_type": "review", "entity_id": submission.id, "action": "submission_reviewed"}, sort=[("created_at", -1)])
    rejection_logs = [
        log
        for log in logs
        if (log.changes or {}).get("decision") in {"rejected", "revise"}
    ]
    latest = rejection_logs[0] if rejection_logs else None
    items = [rejection_history_item(log) for log in rejection_logs]
    return {
        "question_id": question.id,
        "submission_id": submission.id,
        "task_id": submission.task_id,
        "status": submission.status,
        "current_round": submission.current_round,
        "latest": rejection_history_item(latest) if latest else None,
        "history": items,
        "ai_review": None,
    }


def get_labeler_contributions(db: MongoDatabase, *, user_id: str) -> dict:
    questions = db.find(Question, {"assigned_to": user_id})
    submissions = db.find(Submission, {"labeler_id": user_id}, sort=[("updated_at", -1)])
    submitted = [item for item in submissions if item.status == "submitted"]
    approved = [item for item in submissions if item.status == "approved"]
    rejected = [item for item in submissions if item.status == "rejected"]
    earned_points = sum(submission_unit_points(db, item) for item in approved)
    estimated_points = sum(submission_unit_points(db, item) for item in submissions if item.status in {"submitted", "approved"})
    review_task_items = labeler_review_task_items(db, user_id=user_id, questions=questions, submissions=submissions)
    return {
        "summary": {
            "claimed_questions": len(questions),
            "pending_questions": len([item for item in questions if item.status in {"claimed", "rejected"}]),
            "total_submissions": len(submissions),
            "submitted": len(submitted),
            "approved": len(approved),
            "rejected": len(rejected),
            "accuracy_rate": approved_accuracy_rate(db, user_id),
            "earned_points": earned_points,
            "estimated_points": estimated_points,
        },
        "recent_items": review_task_items[:10],
    }


def save_question_draft(db: MongoDatabase, *, question_id: str, user_id: str, answers: dict, request: Request) -> dict:
    question = require_labeler_question(db, question_id, user_id)
    task = db.get(Task, question.task_id)
    submission = find_submission(db, question.id, user_id)
    is_revision_draft = bool(submission and submission.current_round > 1 and submission.status == "draft" and question.status == "claimed")
    if not task or (task.status not in {"published", "paused", "finished"} and question.status != "rejected" and not is_revision_draft):
        raise AppError(ErrorCode.STATE_CONFLICT, "当前任务状态不允许保存草稿")
    if question.status == "submitted" or (submission and submission.status == "submitted"):
        raise AppError(ErrorCode.STATE_CONFLICT, "当前题目已提交，等待审核后才能修改草稿")
    if submission and submission.status == "abandoned":
        raise AppError(ErrorCode.STATE_CONFLICT, "当前题目已放弃，不能继续编辑")
    submission = submission or find_or_create_submission(db, task, question, user_id)
    now = now_utc().replace(tzinfo=None)
    submission.draft = dict(answers)
    if submission.status == "draft":
        submission.answers = dict(answers)
    if submission.status == "rejected" or question.status == "rejected":
        submission.status = "draft"
        submission.answers = dict(answers)
        submission.task_submitted_at = None
        question.status = "claimed"
        question.updated_at = now
        db.save(question)
    submission.updated_at = now
    db.save(submission)
    write_audit_log(db, entity_type="submission", entity_id=submission.id, action="submission_draft_saved", operator_id=user_id, team_id=task.team_id, changes={"question_id": question.id}, request=request)
    db.commit()
    payload = submission_payload(submission, question=question, task=task)
    payload["ai_review_job"] = None
    return payload


def generate_labeling_ai_assist(db: MongoDatabase, *, question_id: str, user_id: str, request: Request, custom_prompt: str | None = None, component_id: str | None = None) -> dict:
    question = require_labeler_question(db, question_id, user_id)
    task = db.get(Task, question.task_id)
    if not task:
        raise AppError(ErrorCode.NOT_FOUND, "任务不存在")
    if question.status == "submitted":
        raise AppError(ErrorCode.STATE_CONFLICT, "当前题目已提交，不能继续使用 AI 辅助")
    submission = find_submission(db, question.id, user_id)
    if submission and submission.status in {"submitted", "approved", "abandoned"}:
        raise AppError(ErrorCode.STATE_CONFLICT, "当前题目状态不允许使用 AI 辅助")
    template_version = require_bound_template_version(db, task)
    components = template_components(template_version.schema)
    if not any(component.get("type") == "LLMComponent" for component in components):
        raise AppError(ErrorCode.BUSINESS_RULE, "当前模板未启用 LLM 辅助")
    llm_component, provider_id = resolve_labeling_ai_component_provider(components, component_id=component_id)
    allowance = labeling_ai_assist_allowance(db, task, user_id)
    if allowance["limit"] <= 0 or allowance["remaining"] <= 0:
        raise AppError(ErrorCode.BUSINESS_RULE, "AI 辅助次数已用尽", {"assist_usage": allowance})
    answer_components = answer_template_components(template_version.schema)
    if not answer_components:
        raise AppError(ErrorCode.BUSINESS_RULE, "当前模板没有可生成的答案字段")
    media_assets = extract_question_media_assets(db, task.team_id, question.content or {}, template_version.schema)
    custom_prompt = (custom_prompt or "").strip()[:2000]
    current_answers = (submission.draft or submission.answers) if submission else {}
    messages = build_labeling_ai_assist_messages(task, question, template_version.schema, answer_components, media_assets, custom_prompt=custom_prompt, current_answers=current_answers)
    generated = run_platform_provider_messages_generation(
        db,
        team_id=task.team_id,
        messages=messages,
        operation_type="labeling_ai_assist",
        operator_id=user_id,
        request=request,
        task_id=task.id,
        source_id=question.id,
        max_tokens=1200,
        structured_output_schema=LABELING_AI_ASSIST_RESULT_SCHEMA,
        provider_id=provider_id,
    )
    parsed = parse_labeling_ai_assist_result(str(generated.get("content") or ""))
    answers = normalize_labeling_ai_answers(parsed.get("answers"), answer_components)
    field_explanations = normalize_field_explanations(parsed.get("field_explanations"), answer_components)
    annotated_images = build_annotated_images(parsed.get("image_annotations"), media_assets)
    explanation = str(parsed.get("explanation") or "已根据当前题目数据和模板字段生成答案草稿，请人工核对后再提交。")[:1200]
    write_audit_log(
        db,
        entity_type="question",
        entity_id=question.id,
        action="labeling_ai_assist_generated",
        operator_id=user_id,
        team_id=task.team_id,
        changes={
            "agent_actor": "MarkUp Agent",
            "operation_type": "labeling_ai_assist",
            "task_id": task.id,
            "answer_fields": list(answers.keys()),
            "answer_field_count": len(answers),
            "media_count": len(media_assets),
            "annotated_image_count": len(annotated_images),
            "custom_prompt": bool(custom_prompt),
            "provider_id": generated.get("provider_id"),
            "model": generated.get("model"),
            "request_id": generated.get("request_id"),
            "tokens": generated.get("tokens"),
            "cost": generated.get("cost"),
            "assist_limit": allowance["limit"],
            "assist_used_before": allowance["used"],
        },
        request=request,
    )
    db.commit()
    updated_allowance = {**allowance, "used": allowance["used"] + 1, "remaining": max(allowance["limit"] - allowance["used"] - 1, 0)}
    return {
        "question_id": question.id,
        "answers": answers,
        "explanation": explanation,
        "field_explanations": field_explanations,
        "annotated_images": annotated_images,
        "assist_usage": updated_allowance,
        "provider_id": generated.get("provider_id"),
        "model": generated.get("model"),
        "request_id": generated.get("request_id"),
        "latency_ms": generated.get("latency_ms"),
        "tokens": generated.get("tokens"),
        "cost": generated.get("cost"),
    }


def generate_labeling_ai_assist_preview(
    db: MongoDatabase,
    *,
    team_id: str | None,
    user_id: str,
    schema: dict,
    content: dict,
    answers: dict,
    request: Request,
    custom_prompt: str | None = None,
    component_id: str | None = None,
) -> dict:
    if not team_id:
        raise AppError(ErrorCode.PERMISSION_DENIED, "AI 辅助预览需要指定团队上下文")
    normalized_schema = normalize_template_schema(schema)
    components = template_components(normalized_schema)
    if not any(component.get("type") == "LLMComponent" for component in components):
        raise AppError(ErrorCode.BUSINESS_RULE, "当前模板没有 LLM 辅助组件")
    _llm_component, provider_id = resolve_labeling_ai_component_provider(components, component_id=component_id)
    answer_components = answer_template_components(normalized_schema)
    if not answer_components:
        raise AppError(ErrorCode.BUSINESS_RULE, "当前模板没有可供 AI 辅助使用的答案字段")
    safe_content = content if isinstance(content, dict) else {}
    safe_answers = answers if isinstance(answers, dict) else {}
    preview_task = Task(
        team_id=team_id,
        owner_id=user_id,
        title="Renderer Preview",
        description="Template renderer preview AI assist",
        status="draft",
        category="preview",
        difficulty="medium",
    )
    preview_question = Question(
        team_id=team_id,
        task_id="renderer-preview",
        content=safe_content,
        status="claimed",
        assigned_to=user_id,
    )
    media_assets = extract_question_media_assets(db, team_id, safe_content, normalized_schema)
    custom_prompt = (custom_prompt or "").strip()[:2000]
    messages = build_labeling_ai_assist_messages(
        preview_task,
        preview_question,
        normalized_schema,
        answer_components,
        media_assets,
        custom_prompt=custom_prompt,
        current_answers=safe_answers,
    )
    generated = run_platform_provider_messages_generation(
        db,
        team_id=team_id,
        messages=messages,
        operation_type="labeling_ai_assist_preview",
        operator_id=user_id,
        request=request,
        task_id=None,
        source_id="renderer-preview",
        max_tokens=1200,
        structured_output_schema=LABELING_AI_ASSIST_RESULT_SCHEMA,
        provider_id=provider_id,
        charge_ai_resource=False,
    )
    parsed = parse_labeling_ai_assist_result(str(generated.get("content") or ""))
    normalized_answers = normalize_labeling_ai_answers(parsed.get("answers"), answer_components)
    field_explanations = normalize_field_explanations(parsed.get("field_explanations"), answer_components)
    annotated_images = build_annotated_images(parsed.get("image_annotations"), media_assets)
    explanation = str(parsed.get("explanation") or "AI generated preview suggestions; please verify before publishing or labeling.")[:1200]
    db.commit()
    return {
        "question_id": "renderer-preview",
        "answers": normalized_answers,
        "explanation": explanation,
        "field_explanations": field_explanations,
        "annotated_images": annotated_images,
        "assist_usage": None,
        "provider_id": generated.get("provider_id"),
        "model": generated.get("model"),
        "request_id": generated.get("request_id"),
        "latency_ms": generated.get("latency_ms"),
        "tokens": generated.get("tokens"),
        "cost": generated.get("cost"),
    }


def submit_question_answers(db: MongoDatabase, *, question_id: str, user_id: str, answers: dict, request: Request) -> dict:
    question = require_labeler_question(db, question_id, user_id)
    task = db.get(Task, question.task_id)
    existing_submission = find_submission(db, question.id, user_id)
    is_revision_draft = bool(existing_submission and existing_submission.current_round > 1 and existing_submission.status in {"draft", "rejected"} and question.status in {"claimed", "rejected"})
    if not task or (task.status not in {"published", "paused", "finished"} and question.status != "rejected" and not is_revision_draft):
        raise AppError(ErrorCode.STATE_CONFLICT, "当前任务状态不允许提交")
    if question.status == "submitted" or (existing_submission and existing_submission.status == "submitted"):
        raise AppError(ErrorCode.STATE_CONFLICT, "当前题目已提交，等待审核后才能再次提交")
    if existing_submission and existing_submission.status == "abandoned":
        raise AppError(ErrorCode.STATE_CONFLICT, "当前题目已放弃，不能继续提交")
    template_version = require_bound_template_version(db, task)
    validation = validate_template_answers(template_version.schema, answers, question.content)
    if not validation["valid"]:
        raise AppError(ErrorCode.BUSINESS_RULE, "答案校验未通过", validation)
    if task.ai_config.get("enabled"):
        ai_ready, _ai_pass_message, ai_block_message = task_ai_readiness(db, task.team_id, task)
        if not ai_ready:
            raise AppError(ErrorCode.BUSINESS_RULE, "AI 预审配置未就绪", {"task_id": task.id, "reason": ai_block_message})
    submission = existing_submission or find_or_create_submission(db, task, question, user_id)
    now = now_utc().replace(tzinfo=None)
    submission.answers = dict(answers)
    submission.draft = dict(answers)
    submission.status = "submitted"
    submission.validation_result = validation
    submission.submitted_at = now
    submission.task_submitted_at = None
    submission.updated_at = now
    db.save(submission)

    if question.status != "submitted":
        question.status = "submitted"
        question.updated_at = now
        db.save(question)
    sync_task_question_stats(db, task)
    ai_review_job = None
    if task.ai_config.get("enabled"):
        from app.services.ai_reviews_service import maybe_enqueue_ai_review_for_submission

        ai_review_job = maybe_enqueue_ai_review_for_submission(db, task=task, question=question, submission=submission, request=request)
    write_audit_log(
        db,
        entity_type="submission",
        entity_id=submission.id,
        action="submission_submitted",
        operator_id=user_id,
        team_id=task.team_id,
        changes={"question_id": question.id, "task_id": task.id, "validation_summary": validation.get("summary", {}), "ai_review_job": ai_review_job},
        request=request,
    )
    db.commit()
    payload = submission_payload(submission, question=question, task=task)
    payload["ai_review_job"] = ai_review_job
    return payload


def abandon_labeling_question(db: MongoDatabase, *, question_id: str, user_id: str, request: Request) -> dict:
    question = require_labeler_question(db, question_id, user_id)
    task = db.get(Task, question.task_id)
    if not task:
        raise AppError(ErrorCode.NOT_FOUND, "任务不存在")
    now = now_utc().replace(tzinfo=None)
    submission = find_or_create_submission(db, task, question, user_id)
    if submission.status in {"submitted", "approved"} or question.status == "submitted":
        raise AppError(ErrorCode.STATE_CONFLICT, "已提交或已通过题目不能放弃")
    assigned_questions = [item for item in db.find(Question, task_question_query(task, {"assigned_to": user_id})) if item.status in {"claimed", "submitted", "rejected"}]
    submissions = submissions_by_question(db, task, user_id)
    question_by_id = {item.id: item for item in assigned_questions}
    for item in submissions.values():
        related_question = db.get(Question, item.question_id) if item.question_id else None
        if related_question and related_question.task_id == task.id and item.status == "abandoned":
            question_by_id[related_question.id] = related_question
    total_for_allowance = max(len(question_by_id), 1)
    limit = abandon_limit_for_task(task, total_for_allowance)
    used = len([item for item in submissions.values() if item.status == "abandoned" and item.question_id != question.id])
    over_free_limit = used >= limit

    previous_question_status = question.status
    previous_submission_status = submission.status
    submission.status = "abandoned"
    submission.task_submitted_at = None
    submission.abandoned_at = now
    submission.updated_at = now
    db.save(submission)

    question.status = "pending" if task_is_open_for_reclaim(task, now) else "closed"
    question.assigned_to = None
    question.claim_due_at = None
    question.updated_at = now
    db.save(question)
    sync_task_question_stats(db, task)
    reputation_adjustment = None
    if over_free_limit:
        reputation_adjustment = adjust_reputation(
            db,
            user_id=user_id,
            change=-REPUTATION_DEDUCTION_MULTIPLIER,
            reason=f"任务「{task.title}」超出免费放弃次数后放弃题目",
            source_type="abandon_over_limit",
            source_id=submission.id,
            metadata={"task_id": task.id, "question_id": question.id, "task_title": task.title, "abandon_limit": limit, "abandon_used_before": used},
        )
    write_audit_log(
        db,
        entity_type="submission",
        entity_id=submission.id,
        action="submission_abandoned",
        operator_id=user_id,
        team_id=task.team_id,
        changes={
            "question_id": question.id,
            "task_id": task.id,
            "question_status": {"from": previous_question_status, "to": question.status},
            "submission_status": {"from": previous_submission_status, "to": submission.status},
            "abandon_limit": limit,
            "abandon_used": used + 1,
            "reputation_adjustment": reputation_adjustment,
        },
        request=request,
    )
    notify_submission_submitted(db, task=task, question=question, submission=submission, request=request)
    db.commit()
    return {
        "question": abandoned_labeling_question_detail(question, submission),
        "progress": labeling_progress(list(question_by_id.values()), {**submissions, question.id: submission}, task=task, user_id=user_id, db=db),
        "remaining_items": available_item_count(db, task),
        "reputation_adjustment": reputation_adjustment,
    }


def complete_labeling_task(db: MongoDatabase, *, task_id: str, user_id: str, request: Request) -> dict:
    task = require_claimed_task(db, task_id, user_id)
    assigned_for_user = db.find(Question, task_question_query(task, {"assigned_to": user_id}))
    questions = [question for question in sorted(assigned_for_user, key=lambda item: item.row_index) if question.status in {"claimed", "submitted", "rejected"}]
    if not questions:
        raise AppError(ErrorCode.NOT_FOUND, "尚未领取该任务题目")
    submissions = submissions_by_question(db, task, user_id)
    has_revision_questions = any(
        question.status == "rejected" or ((submission := submissions.get(question.id)) and submission.current_round > 1)
        for question in questions
    )
    if task.status not in {"published", "paused", "finished"} and not has_revision_questions:
        raise AppError(ErrorCode.STATE_CONFLICT, "当前任务状态不允许提交完成")
    missing_questions = [
        question
        for question in questions
        if not (submission := submissions.get(question.id)) or submission.status not in {"submitted", "approved", "abandoned"}
    ]
    if missing_questions:
        raise AppError(
            ErrorCode.STATE_CONFLICT,
            "还有未提交题目，请先完成全部题目",
            {"missing_question_ids": [question.id for question in missing_questions], "missing_count": len(missing_questions)},
        )
    now = now_utc().replace(tzinfo=None)
    for question in questions:
        submission = submissions.get(question.id)
        if not submission:
            continue
        submission.task_submitted_at = submission.task_submitted_at or now
        submission.updated_at = now
        db.save(submission)
    write_audit_log(
        db,
        entity_type="task",
        entity_id=task.id,
        action="labeling_task_completed",
        operator_id=user_id,
        team_id=task.team_id,
        changes={"question_count": len(questions)},
        request=request,
    )
    db.commit()
    refreshed_submissions = db.find(Submission, {"task_id": task.id, "labeler_id": user_id})
    items = labeler_review_task_items(db, user_id=user_id, questions=questions, submissions=refreshed_submissions)
    return items[0] if items else {"task_id": task.id, "task_title": task.title, "status": "submitted"}




def apply_overdue_labeling_penalties(db: MongoDatabase, *, user_id: str) -> set[str]:
    now = now_utc().replace(tzinfo=None)
    assigned_questions = db.find(Question, {"assigned_to": user_id})
    submissions_by_id = {submission.question_id: submission for submission in db.find(Submission, {"labeler_id": user_id})}
    overdue: list[Question] = []
    for question in assigned_questions:
        due_at = parsed_datetime(question.claim_due_at)
        if not due_at or due_at >= now:
            continue
        status = effective_labeler_question_status(question, submissions_by_id.get(question.id))
        if status in {"submitted", "approved"}:
            continue
        overdue.append(question)
    if not overdue:
        return set()

    grouped: dict[str, list[Question]] = {}
    for question in overdue:
        grouped.setdefault(question.task_id, []).append(question)

    changed = False
    released_ids: set[str] = set()
    for task_id, questions in grouped.items():
        task = db.get(Task, task_id)
        if not task:
            continue
        deduction = len(questions) * REPUTATION_DEDUCTION_MULTIPLIER
        adjust_reputation(
            db,
            user_id=user_id,
            change=-deduction,
            reason=f"任务「{task.title}」超时未完成 {len(questions)} 题",
            source_type="labeling_timeout",
            source_id=f"{user_id}:{task.id}:{min((isoformat_or_none(question.claim_due_at) or '') for question in questions)}",
            metadata={"task_id": task.id, "task_title": task.title, "question_count": len(questions)},
        )
        task_open = task_is_open_for_reclaim(task, now)
        for question in questions:
            submission = submissions_by_id.get(question.id)
            if submission and submission.status not in {"approved", "submitted"}:
                submission.status = "draft"
                submission.task_submitted_at = None
                submission.updated_at = now
                db.save(submission)
            question.status = "pending" if task_open else "closed"
            question.assigned_to = None
            question.claim_due_at = None
            question.updated_at = now
            db.save(question)
            changed = True
            released_ids.add(question.id)
        sync_task_question_stats(db, task)
    if changed:
        db.commit()
    return released_ids


def marketplace_task_payload(db: MongoDatabase, task: Task) -> dict:
    team = db.get(Team, task.team_id) if task.team_id else None
    qualification = qualification_required(task)
    published_at = task.published_at or task.created_at
    available_items = available_item_count(db, task)
    return {
        "task_id": task.id,
        "title": task.title,
        "category": task.category if task.category in {"text", "image", "audio", "multimodal"} else "multimodal",
        "description": task.description,
        "unit_points": unit_points(task),
        "bundle_options": effective_bundle_options(task, available_items),
        "available_items": available_items,
        "deadline": None if ((getattr(task, "claim_config", {}) or {}).get("deadline_mode") == "long_term") else task.deadline,
        "deadline_mode": (getattr(task, "claim_config", {}) or {}).get("deadline_mode") or ("date" if task.deadline else "long_term"),
        "completion_hours": (getattr(task, "claim_config", {}) or {}).get("completion_hours"),
        "difficulty": task.difficulty if task.difficulty in {"easy", "medium", "hard"} else "medium",
        "tags": task.tags,
        "status": marketplace_status(task, db),
        "owner_team_name": team.company_name if team else None,
        "team_id": task.team_id,
        "distribution": task.distribution,
        "_target_labeler_ids": internal_target_labeler_ids(getattr(task, "assignment", {}) or {}),
        "estimated_minutes": int(task.reward_rule.get("estimated_minutes") or max(10, min(120, len(task.column_mapping or {}) * 10 + 20))),
        "published_at": published_at.date().isoformat() if isinstance(published_at, datetime) else str(published_at),
        "priority": task.reward_rule.get("priority") or infer_priority(task),
        "team_verified": bool(team and team.status == "active"),
        "deliverable": task.reward_rule.get("deliverable") or "按任务模板完成标注并提交审核。",
        "qualification_required": qualification,
        "review_notes": task.qualification_rules.get("notes") or "提交后由发布企业按任务规则复核。",
        "agreement_config": public_agreement_config(getattr(task, "agreement_config", {}) or {}),
    }


def public_agreement_config(config: dict) -> dict:
    text = str(config.get("text") or "")
    return {
        "required": bool(config.get("required")),
        "use_default_template": bool(config.get("use_default_template")),
        "text": text[:4000],
        "file_name": config.get("file_name"),
    }


def has_domain_qualification(db: MongoDatabase, user_id: str, domain: str) -> bool:
    if domain == "none":
        return True
    now = now_utc().replace(tzinfo=None)
    certifications = db.find(Certification, {"user_id": user_id, "status": "approved"})
    if any(
        cert.cert_type == domain and (cert.expires_at is None or cert.expires_at.replace(tzinfo=None) >= now)
        for cert in certifications
    ):
        return True
    profile = db.find_one(UserProfile, {"user_id": user_id})
    tags = {normalize_qualification_tag(tag) for tag in (profile.expertise_tags if profile else [])}
    return domain in tags


def normalize_qualification_tag(value: str) -> str:
    aliases = {
        "法律": "law",
        "法务": "law",
        "医疗": "medical",
        "医学": "medical",
        "金融": "finance",
        "财经": "finance",
        "代码": "code",
        "编程": "code",
        "自动驾驶": "autonomous_driving",
        "语音": "audio",
        "音频": "audio",
        "事实核查": "fact_check",
    }
    lowered = str(value).strip().lower()
    return aliases.get(lowered, lowered)


def completed_submission_count(db: MongoDatabase, user_id: str) -> int:
    return len(db.find(Submission, {"labeler_id": user_id, "status": "approved"}))


def approved_accuracy_rate(db: MongoDatabase, user_id: str) -> int:
    reviewed = db.find(Submission, {"labeler_id": user_id})
    approved = len([item for item in reviewed if item.status == "approved"])
    rejected = len([item for item in reviewed if item.status == "rejected"])
    total_reviewed = approved + rejected
    if total_reviewed == 0:
        return 0
    return round((approved / total_reviewed) * 100)


def unit_points(task: Task) -> int:
    reward_rule = task.reward_rule or {}
    if reward_rule.get("mode") == "task":
        total_points = max(0, int(reward_rule.get("total_points") or 0))
        stats_total = (task.stats or {}).get("total")
        quantity = stats_total if isinstance(stats_total, int) else getattr(task, "quota", 0)
        quantity = max(0, int(quantity or 0))
        if total_points <= 0 or quantity <= 0:
            return 0
        return total_points // quantity
    return int(reward_rule.get("points_per_item") or reward_rule.get("unit_points") or 1)


def bundle_options(task: Task) -> list[int]:
    raw_options = task.reward_rule.get("bundle_options") or task.reward_rule.get("bundles") or DEFAULT_BUNDLES
    options = sorted({int(option) for option in raw_options if int(option) > 0})
    return options or DEFAULT_BUNDLES


def effective_bundle_options(task: Task, available_count: int) -> list[int]:
    options = [option for option in bundle_options(task) if option <= available_count]
    if available_count > 0 and not options:
        options = [available_count]
    return options


def qualification_required(task: Task) -> str:
    for cert in task.required_certs:
        if cert in KNOWN_QUALIFICATIONS:
            return cert
        if cert == "legal":
            return "law"
    qualification = task.qualification_rules.get("qualification_required")
    return qualification if qualification in KNOWN_QUALIFICATIONS else "none"


def available_item_count(db: MongoDatabase, task: Task) -> int:
    return len(db.find(Question, task_question_query(task, {"status": "pending", "assigned_to": None})))


def marketplace_status(task: Task, db: MongoDatabase) -> str:
    if available_item_count(db, task) <= 0:
        return "closed"
    days = days_until(task.deadline)
    if days is not None and days < 0:
        return "closed"
    return "open"


def infer_priority(task: Task) -> str:
    if task.published_at and (now_utc().replace(tzinfo=None) - task.published_at).days <= 3:
        return "new"
    days = days_until(task.deadline)
    if days is not None and days <= 3:
        return "urgent"
    if unit_points(task) >= 6:
        return "recommended"
    return "standard"


def days_until(deadline: str | None) -> int | None:
    if not deadline:
        return None
    try:
        target = datetime.fromisoformat(deadline[:10])
    except ValueError:
        return None
    today = now_utc().replace(tzinfo=None, hour=0, minute=0, second=0, microsecond=0)
    return (target - today).days


def default_deadline() -> str:
    return now_utc().replace(tzinfo=None).date().isoformat()


def task_is_open_for_reclaim(task: Task, now: datetime) -> bool:
    if task.status != "published":
        return False
    deadline_mode = (getattr(task, "claim_config", {}) or {}).get("deadline_mode")
    if deadline_mode == "long_term":
        return True
    return not task.deadline or task.deadline[:10] >= now.date().isoformat()


def require_claimed_task(db: MongoDatabase, task_id: str, user_id: str) -> Task:
    apply_overdue_labeling_penalties(db, user_id=user_id)
    task = db.get(Task, task_id)
    if not task or task.status not in {"published", "paused", "finished"}:
        raise AppError(ErrorCode.NOT_FOUND, "任务不存在")
    has_assigned_question = db.find_one(Question, task_question_query(task, {"assigned_to": user_id}))
    has_abandoned_submission = db.find_one(Submission, {"team_id": task.team_id, "task_id": task.id, "labeler_id": user_id, "status": "abandoned"})
    if not has_assigned_question and not has_abandoned_submission:
        raise AppError(ErrorCode.NOT_FOUND, "尚未领取该任务题目")
    return task


def require_labeler_question(db: MongoDatabase, question_id: str, user_id: str, *, allow_abandoned: bool = False) -> Question:
    released_ids = apply_overdue_labeling_penalties(db, user_id=user_id)
    if question_id in released_ids:
        raise AppError(ErrorCode.STATE_CONFLICT, "题目已超过领取后完成时限，已从当前批注任务中移除")
    question = db.get(Question, question_id)
    submission = find_submission(db, question_id, user_id) if question else None
    if not question or (question.assigned_to != user_id and not (allow_abandoned and submission and submission.status == "abandoned")):
        raise AppError(ErrorCode.NOT_FOUND, "题目不存在或尚未领取")
    if allow_abandoned and submission and submission.status == "abandoned":
        return question
    if question.status not in {"claimed", "submitted", "rejected"}:
        raise AppError(ErrorCode.STATE_CONFLICT, "当前题目状态不允许作答")
    return question


def require_bound_template_version(db: MongoDatabase, task: Task):
    template_version = get_task_bound_template_version(db, task)
    if not template_version:
        raise AppError(ErrorCode.NOT_FOUND, "任务绑定的模板版本不存在")
    return template_version


def find_submission(db: MongoDatabase, question_id: str, user_id: str) -> Submission | None:
    return db.find_one(Submission, {"question_id": question_id, "labeler_id": user_id})


def find_or_create_submission(db: MongoDatabase, task: Task, question: Question, user_id: str, claim_bundle_id: str | None = None) -> Submission:
    submission = find_submission(db, question.id, user_id)
    if submission:
        if claim_bundle_id and submission.claim_bundle_id != claim_bundle_id:
            submission.claim_bundle_id = claim_bundle_id
            submission.updated_at = now_utc().replace(tzinfo=None)
            db.save(submission)
        return submission
    submission = Submission(
        team_id=task.team_id,
        task_id=task.id,
        question_id=question.id,
        labeler_id=user_id,
        claim_bundle_id=claim_bundle_id,
        template_id=task.template_id,
        template_version_id=task.template_version_id,
    )
    db.add(submission)
    return submission


def submissions_by_question(db: MongoDatabase, task: Task, user_id: str) -> dict[str, Submission]:
    submissions = db.find(Submission, {"team_id": task.team_id, "task_id": task.id, "labeler_id": user_id})
    return {submission.question_id: submission for submission in submissions}


NON_ANSWER_TEMPLATE_COMPONENT_TYPES = {"ShowItem", "LLMComponent", "GroupContainer"}


def resolve_labeling_ai_component_provider(components: list[dict], *, component_id: str | None = None) -> tuple[dict, str]:
    llm_components = [component for component in components if component.get("type") == "LLMComponent"]
    if not llm_components:
        raise AppError(ErrorCode.BUSINESS_RULE, "当前模板没有 LLM 辅助组件")
    selected: dict | None = None
    lookup = str(component_id or "").strip()
    if lookup:
        selected = next((component for component in llm_components if lookup in {str(component.get("id") or ""), str(component.get("field") or "")}), None)
        if not selected:
            raise AppError(ErrorCode.BUSINESS_RULE, "选择的 LLM 组件不在当前模板中", {"component_id": lookup})
    elif len(llm_components) == 1:
        selected = llm_components[0]
    else:
        raise AppError(ErrorCode.BUSINESS_RULE, "请指定要运行的 LLM 组件")
    config = selected.get("config") if isinstance(selected.get("config"), dict) else {}
    provider_id = str(config.get("provider_id") or "").strip()
    if not provider_id:
        raise AppError(
            ErrorCode.BUSINESS_RULE,
            "运行前请先为该 LLM 组件选择 AI Provider",
            {"component_id": selected.get("id"), "field": selected.get("field")},
        )
    return selected, provider_id


def answer_template_components(schema: dict) -> list[dict]:
    return [component for component in template_components(schema) if component.get("type") not in NON_ANSWER_TEMPLATE_COMPONENT_TYPES]


def build_labeling_ai_assist_prompt(task: Task, question: Question, schema: dict, answer_components: list[dict]) -> str:
    return build_labeling_ai_assist_text(task, question, schema, answer_components, [], custom_prompt="", current_answers={})


def build_labeling_ai_assist_messages(task: Task, question: Question, schema: dict, answer_components: list[dict], media_assets: list[dict], *, custom_prompt: str = "", current_answers: dict | None = None) -> list[dict]:
    text = build_labeling_ai_assist_text(task, question, schema, answer_components, media_assets, custom_prompt=custom_prompt, current_answers=current_answers)
    content_parts: list[dict] = [{"type": "text", "text": text}]
    for asset in media_assets:
        url = str(asset.get("url") or "")
        media_type = str(asset.get("type") or "")
        label = str(asset.get("label") or asset.get("source_id") or media_type or "媒体")
        if media_type == "image" and url:
            content_parts.append({"type": "image_url", "image_url": {"url": url}, "label": label})
            continue
        if media_type == "audio" and url:
            content_parts.append({"type": "audio_url", "audio_url": {"url": url}, "label": label})
            continue
        if media_type == "video" and url:
            content_parts.append({"type": "video_url", "video_url": {"url": url}, "label": label})
    return [{"role": "user", "content": content_parts}]


def build_labeling_ai_assist_text(task: Task, question: Question, schema: dict, answer_components: list[dict], media_assets: list[dict], *, custom_prompt: str = "", current_answers: dict | None = None) -> str:
    show_components = [component for component in template_components(schema) if component.get("type") == "ShowItem"]
    answer_context = [
        {
            "field": component.get("field"),
            "label": component.get("label"),
            "type": component.get("type"),
            "required": bool(component.get("required")),
            "options": [
                {"value": option.get("value"), "label": option.get("label")}
                for option in component.get("options", [])
                if isinstance(option, dict)
            ],
            "config": compact_ai_generation_payload(component.get("config") if isinstance(component.get("config"), dict) else {}),
        }
        for component in answer_components
    ]
    show_context = [
        {
            "label": component.get("label"),
            "field": component.get("field"),
            "content_field": (component.get("config") or {}).get("content_field") if isinstance(component.get("config"), dict) else None,
        }
        for component in show_components
    ]
    safe_task = {
        "title": task.title,
        "description": task.description,
        "category": task.category,
        "difficulty": task.difficulty,
        "tags": task.tags or [],
        "current_answers": compact_ai_generation_payload(current_answers or {}),
    }
    return "\n".join(
        [
            "你是 MarkUp 数据标注平台的批注员答题辅助 Agent。",
            "请只基于当前题目数据、任务信息和模板字段生成答案草稿，并给出简洁解释；不要编造输入中不存在的事实。",
            "必须只返回合法 JSON，不要 Markdown、不要代码块、不要解释性前后缀。",
            "JSON 格式固定为：",
            '{"answers":{"字段key":"答案或答案数组"},"explanation":"整体判断解释","field_explanations":{"字段key":"该字段答案依据"},"image_annotations":[{"source_id":"图片媒体source_id","label":"圈画说明","shape":"circle|rect","x":0.5,"y":0.5,"width":0.2,"height":0.2}]}',
            "",
            "答案规则：",
            "1. 单选字段必须返回选项 value；如果你更容易判断选项 label，也要转换为对应 value。",
            "2. 多选/标签字段必须返回 value 数组。",
            "3. 文本、富文本、JSON 字段按字段类型返回可直接填入的内容；无法判断时给出最合理答案并在解释中说明不确定性。",
            "4. 上传类字段无法由 AI 上传文件，可返回空数组或空字符串，并在字段解释中说明原因。",
            "5. answers 必须尽量覆盖所有答案字段。",
            "6. 如果题目包含图片且需要指出可疑区域、目标物或错误位置，请在 image_annotations 返回归一化坐标：x/y 为中心点 0-1，width/height 为区域宽高 0-1；不要返回像素坐标。",
            "7. 如果题目包含图片、音频或视频，必须优先分析媒体本身，再结合题干和模板说明生成答案。",
            "8. 音频任务需要关注语音内容、背景音、情绪、噪声、说话人线索和时间线索；视频任务需要关注画面、动作、文字、时序变化、声音和关键帧线索。",
            "9. 如果模型或 Provider 无法直接读取某个媒体，请在 explanation 中明确说明无法读取的媒体 source_id，并仅基于可见文本谨慎作答。",
            "10. 如果批注员提供了额外指令，请在不违反以上 JSON 输出、字段类型和事实约束的前提下优先满足。",
            "",
            f"批注员额外指令：{custom_prompt or '无'}",
            f"任务信息：{json.dumps(compact_ai_generation_payload(safe_task), ensure_ascii=False)}",
            f"当前题目完整数据：{json.dumps(compact_ai_generation_payload(question.content or {}), ensure_ascii=False)}",
            f"模板展示字段：{json.dumps(compact_ai_generation_payload(show_context), ensure_ascii=False)}",
            f"需要生成的答案字段：{json.dumps(compact_ai_generation_payload(answer_context), ensure_ascii=False)}",
            f"媒体资源索引：{json.dumps(compact_ai_generation_payload(media_assets), ensure_ascii=False)}",
        ]
    )


def parse_labeling_ai_assist_result(content: str) -> dict:
    text = strip_json_fence(content)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, "AI 返回的答案不是合法 JSON", {"raw": text[:1000]}) from exc
    if not isinstance(parsed, dict):
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, "AI 返回的答案结构不正确")
    validate_labeling_ai_assist_result(parsed)
    return parsed


def validate_labeling_ai_assist_result(parsed: dict) -> None:
    if not isinstance(parsed.get("answers"), dict):
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, "AI 返回缺少 answers 对象")
    if not isinstance(parsed.get("explanation"), str):
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, "AI 返回缺少 explanation 字符串")
    if not isinstance(parsed.get("field_explanations"), dict):
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, "AI 返回的 field_explanations 结构不正确")
    if not isinstance(parsed.get("image_annotations"), list):
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, "AI 返回的 image_annotations 结构不正确")
    for item in parsed["image_annotations"]:
        if not isinstance(item, dict):
            raise AppError(ErrorCode.THIRD_PARTY_ERROR, "AI 返回的图片标注结构不正确")
        if not str(item.get("source_id") or "").strip():
            raise AppError(ErrorCode.THIRD_PARTY_ERROR, "AI 返回的图片标注缺少 source_id")
        if not str(item.get("label") or "").strip():
            raise AppError(ErrorCode.THIRD_PARTY_ERROR, "AI 返回的图片标注缺少 label")
        if item.get("shape") not in {"circle", "rect"}:
            raise AppError(ErrorCode.THIRD_PARTY_ERROR, "AI 返回的图片标注 shape 不正确")
        for key in ("x", "y", "width", "height"):
            value = item.get(key)
            if not isinstance(value, (int, float)) or value < 0 or value > 1:
                raise AppError(ErrorCode.THIRD_PARTY_ERROR, "AI 返回的图片标注坐标不正确", {"field": key})


def normalize_labeling_ai_answers(raw_answers: object, components: list[dict]) -> dict[str, object]:
    if not isinstance(raw_answers, dict):
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, "AI 返回缺少 answers 对象")
    normalized: dict[str, object] = {}
    for component in components:
        field = str(component.get("field") or "")
        if not field:
            continue
        raw_value = raw_answers.get(field)
        if raw_value is None:
            raw_value = raw_answers.get(str(component.get("label") or ""))
        normalized[field] = normalize_labeling_ai_answer(component, raw_value)
    return normalized


def normalize_labeling_ai_answer(component: dict, value: object) -> object:
    component_type = component.get("type")
    if component_type == "SingleSelect":
        return normalize_option_value(component, value)
    if component_type in {"MultiSelect", "TagSelect"}:
        raw_items = value if isinstance(value, list) else ([] if value in (None, "") else [value])
        return [item for item in [normalize_option_value(component, current) for current in raw_items] if item]
    if component_type == "JsonEditor":
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return value
        return value if value is not None else {}
    if component_type in {"FileUpload", "ImageUpload", "AudioUpload", "VideoUpload"}:
        return value if isinstance(value, list) else []
    if component_type == "ImageMaskAnnotation":
        return value if isinstance(value, dict) else {"annotations": []}
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def normalize_option_value(component: dict, value: object) -> str:
    text = ""
    if isinstance(value, dict):
        text = str(value.get("value") or value.get("label") or "")
    else:
        text = str(value or "")
    options = [option for option in component.get("options", []) if isinstance(option, dict)]
    for option in options:
        if text == str(option.get("value") or ""):
            return str(option.get("value") or "")
    for option in options:
        if text == str(option.get("label") or ""):
            return str(option.get("value") or "")
    return text


def normalize_field_explanations(raw: object, components: list[dict]) -> dict[str, str]:
    if not isinstance(raw, dict):
        return {}
    fields = {str(component.get("field") or "") for component in components}
    return {str(key): str(value)[:500] for key, value in raw.items() if str(key) in fields and value is not None}


def extract_question_media_assets(db: MongoDatabase, team_id: str, content: dict, schema: dict) -> list[dict]:
    structured_media = content.get("media") if isinstance(content, dict) else None
    if isinstance(structured_media, list):
        assets = []
        for index, item in enumerate(structured_media):
            if not isinstance(item, dict):
                continue
            file_id = str(item.get("file_id") or "")
            url = str(item.get("url") or file_id or "")
            media_type = str(item.get("type") or item.get("media_type") or infer_labeling_media_type(url) or "")
            if not url or media_type not in {"image", "audio", "video"}:
                continue
            resolved = resolve_labeling_media_url(db, team_id, url, media_type, file_id=file_id)
            assets.append({
                "source_id": str(item.get("id") or f"media_{index + 1}"),
                "field": str(item.get("field") or ""),
                "label": str(item.get("name") or item.get("field") or f"媒体 {index + 1}"),
                "type": media_type,
                "role": item.get("role"),
                "url": resolved["url"],
                "original_url": url,
                "mime_type": resolved.get("mime_type") or item.get("mime_type") or item.get("content_type"),
                "file_id": resolved.get("file_id") or file_id or item.get("file_id"),
                "status": item.get("status") or "ready",
            })
        if assets:
            return assets[:8]
    show_components = [component for component in template_components(schema) if component.get("type") == "ShowItem"]
    label_by_field: dict[str, str] = {}
    for component in show_components:
        config = component.get("config") if isinstance(component.get("config"), dict) else {}
        for key in [config.get("content_field"), component.get("field"), component.get("id")]:
            if key:
                label_by_field[str(key)] = str(component.get("label") or key)
    assets: list[dict] = []
    seen_urls: set[str] = set()
    for key, value in (content or {}).items():
        for url in media_urls_from_value(value):
            if url in seen_urls:
                continue
            media_type = infer_labeling_media_type(url)
            if not media_type:
                media_type = infer_labeling_upload_media_type(db, team_id, url)
            if not media_type:
                continue
            resolved = resolve_labeling_media_url(db, team_id, url, media_type)
            seen_urls.add(url)
            assets.append({
                "source_id": f"media_{len(assets) + 1}",
                "field": str(key),
                "label": label_by_field.get(str(key), str(key)),
                "type": media_type,
                "url": resolved["url"],
                "original_url": url,
                "mime_type": resolved.get("mime_type"),
                "file_id": resolved.get("file_id"),
            })
    return assets[:8]


def resolve_labeling_media_url(db: MongoDatabase, team_id: str, url: str, media_type: str, *, file_id: str = "") -> dict:
    normalized_url = str(url or "").strip()
    resolved_file_id = file_id or upload_file_id_from_url(normalized_url)
    if resolved_file_id:
        item = db.get(UploadedFile, resolved_file_id)
        if item and item.team_id == team_id:
            content_type = item.content_type or labeling_media_fallback_mime_type(media_type, item.filename or normalized_url)
            return {
                "url": item.url or f"/api/v1/uploads/{item.id}/download",
                "mime_type": content_type,
                "file_id": item.id,
            }
    return {"url": normalized_url, "mime_type": labeling_media_fallback_mime_type(media_type, normalized_url), "file_id": resolved_file_id or None}


def upload_file_id_from_url(url: str) -> str:
    value = str(url or "").strip()
    if not value:
        return ""
    match = re.search(r"/api/v1/uploads/([^/?#]+)/(?:download|playback|public)", value)
    if match:
        return match.group(1)
    if re.fullmatch(r"[a-fA-F0-9]{24}", value):
        return value
    return ""


def infer_labeling_upload_media_type(db: MongoDatabase, team_id: str, url: str) -> str | None:
    file_id = upload_file_id_from_url(url)
    if not file_id:
        return None
    item = db.get(UploadedFile, file_id)
    if not item or item.team_id != team_id:
        return None
    return labeling_media_type_from_mime(item.content_type) or infer_labeling_media_type(item.filename or "")


def labeling_media_type_from_mime(mime_type: str | None) -> str | None:
    value = str(mime_type or "").strip().lower()
    if value.startswith("image/"):
        return "image"
    if value.startswith("audio/"):
        return "audio"
    if value.startswith("video/"):
        return "video"
    return None


def labeling_media_fallback_mime_type(media_type: str, filename_or_url: str = "") -> str:
    lowered = str(filename_or_url or "").lower().split("?", 1)[0]
    if media_type == "image":
        if lowered.endswith(".png"):
            return "image/png"
        if lowered.endswith((".jpg", ".jpeg")):
            return "image/jpeg"
        if lowered.endswith(".webp"):
            return "image/webp"
        if lowered.endswith(".gif"):
            return "image/gif"
        return "image/*"
    if media_type == "audio":
        if lowered.endswith(".wav"):
            return "audio/wav"
        if lowered.endswith(".mp3"):
            return "audio/mpeg"
        if lowered.endswith(".ogg"):
            return "audio/ogg"
        if lowered.endswith(".flac"):
            return "audio/flac"
        return "audio/*"
    if media_type == "video":
        if lowered.endswith(".avi"):
            return "video/x-msvideo"
        if lowered.endswith(".mp4"):
            return "video/mp4"
        if lowered.endswith(".mov"):
            return "video/quicktime"
        if lowered.endswith(".webm"):
            return "video/webm"
        if lowered.endswith(".mkv"):
            return "video/x-matroska"
        return "video/*"
    return "application/octet-stream"


def media_urls_from_value(value: object) -> list[str]:
    if isinstance(value, str):
        return [value.strip()] if value.strip() else []
    if isinstance(value, dict):
        urls = []
        for key in ("url", "src", "href", "data_url", "preview_url", "file_id"):
            current = value.get(key)
            if isinstance(current, str) and current.strip():
                urls.append(current.strip())
        return urls
    if isinstance(value, list):
        urls: list[str] = []
        for item in value:
            urls.extend(media_urls_from_value(item))
        return urls
    return []


def infer_labeling_media_type(url: str) -> str | None:
    lowered = url.lower().split("?", 1)[0]
    if lowered.startswith("data:image") or re.search(r"\.(png|jpe?g|gif|webp|bmp|svg)$", lowered):
        return "image"
    if lowered.startswith("data:audio") or re.search(r"\.(mp3|wav|m4a|ogg|aac|flac|opus)$", lowered):
        return "audio"
    if lowered.startswith("data:video") or re.search(r"\.(mp4|mov|webm|avi|mkv|m4v|3gp)$", lowered):
        return "video"
    return None


def build_annotated_images(raw_annotations: object, media_assets: list[dict]) -> list[dict]:
    if not isinstance(raw_annotations, list):
        return []
    image_assets = {str(asset.get("source_id")): asset for asset in media_assets if asset.get("type") == "image"}
    grouped: dict[str, list[dict]] = {}
    for item in raw_annotations:
        if not isinstance(item, dict):
            continue
        source_id = str(item.get("source_id") or "")
        if source_id not in image_assets:
            continue
        grouped.setdefault(source_id, []).append(item)
    return [
        {
            "source_id": source_id,
            "label": str(image_assets[source_id].get("label") or source_id),
            "original_url": image_assets[source_id].get("url"),
            "annotated_url": annotated_image_svg_data_url(str(image_assets[source_id].get("url") or ""), annotations),
            "annotations": [normalize_image_annotation(item) for item in annotations],
        }
        for source_id, annotations in grouped.items()
    ]


def normalize_image_annotation(item: dict) -> dict:
    shape = str(item.get("shape") or "circle").lower()
    if shape not in {"circle", "rect"}:
        shape = "circle"
    return {
        "label": str(item.get("label") or "AI 标注")[:120],
        "shape": shape,
        "x": clamp_float(item.get("x"), 0.5),
        "y": clamp_float(item.get("y"), 0.5),
        "width": clamp_float(item.get("width"), 0.22),
        "height": clamp_float(item.get("height"), 0.22),
    }


def annotated_image_svg_data_url(image_url: str, annotations: list[dict]) -> str:
    shapes: list[str] = []
    for raw in annotations[:12]:
        item = normalize_image_annotation(raw)
        x = item["x"] * 100
        y = item["y"] * 100
        width = max(3.0, item["width"] * 100)
        height = max(3.0, item["height"] * 100)
        label = escape_svg_text(item["label"])
        if item["shape"] == "rect":
            shapes.append(f'<rect x="{x - width / 2:.3f}%" y="{y - height / 2:.3f}%" width="{width:.3f}%" height="{height:.3f}%" fill="none" stroke="#ef4444" stroke-width="4" rx="8" />')
        else:
            shapes.append(f'<ellipse cx="{x:.3f}%" cy="{y:.3f}%" rx="{width / 2:.3f}%" ry="{height / 2:.3f}%" fill="none" stroke="#ef4444" stroke-width="4" />')
        shapes.append(f'<text x="{min(96, x + width / 2 + 1):.3f}%" y="{max(4, y - height / 2):.3f}%" fill="#ef4444" font-size="18" font-weight="700">{label}</text>')
    safe_url = escape_svg_attr(image_url)
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">'
        f'<image href="{safe_url}" x="0" y="0" width="1000" height="1000" preserveAspectRatio="xMidYMid meet" />'
        + "".join(shapes)
        + "</svg>"
    )
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode("utf-8")).decode("ascii")


def clamp_float(value: object, fallback: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = fallback
    return max(0.0, min(1.0, number))


def escape_svg_attr(value: str) -> str:
    return value.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")


def escape_svg_text(value: str) -> str:
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def public_labeling_task_payload(task: Task) -> dict:
    return {
        "task_id": task.id,
        "title": task.title,
        "description": task.description,
        "rich_content": task.rich_content,
        "tags": task.tags or [],
        "status": task.status,
        "category": task.category,
        "difficulty": task.difficulty,
        "deadline": task.deadline,
        "reward_rule": task.reward_rule or {},
        "template_id": task.template_id,
        "template_version_id": task.template_version_id,
        "component_bindings": getattr(task, "component_bindings", {}) or {},
        "stats": task.stats or {},
    }


def labeling_question_summary(question: Question, submission: Submission | None) -> dict:
    return {
        "question_id": question.id,
        "row_index": question.row_index,
        "status": question.status,
        "submission_status": submission.status if submission else None,
        "updated_at": isoformat_or_none(question.updated_at),
    }


def labeling_question_detail(question: Question, submission: Submission | None, schema: dict) -> dict:
    payload = question_payload(question)
    payload["submission"] = submission_payload(submission, question=question) if submission else None
    payload["template_schema"] = schema
    return payload


def abandoned_labeling_question_detail(question: Question, submission: Submission) -> dict:
    payload = question_payload(question)
    payload["submission"] = submission_payload(submission, question=question)
    return payload


def submission_payload(submission: Submission | None, *, question: Question | None = None, task: Task | None = None) -> dict:
    if not submission:
        return {}
    return {
        "submission_id": submission.id,
        "team_id": submission.team_id,
        "task_id": submission.task_id,
        "question_id": submission.question_id,
        "labeler_id": submission.labeler_id,
        "template_id": submission.template_id,
        "template_version_id": submission.template_version_id,
        "answers": submission.answers,
        "draft": submission.draft,
        "status": submission.status,
        "current_round": submission.current_round,
        "validation_result": submission.validation_result,
        "submitted_at": isoformat_or_none(submission.submitted_at),
        "task_submitted_at": isoformat_or_none(submission.task_submitted_at),
        "abandoned_at": isoformat_or_none(submission.abandoned_at),
        "created_at": isoformat_or_none(submission.created_at),
        "updated_at": isoformat_or_none(submission.updated_at),
        "question": question_payload(question, include_content=False) if question else None,
        "task": public_labeling_task_payload(task) if task else None,
    }


def effective_labeler_question_status(question: Question, submission: Submission | None) -> str:
    if submission and submission.status in {"rejected", "submitted", "approved", "draft", "abandoned"}:
        if submission.status == "draft" and question.status == "submitted":
            return question.status
        return submission.status
    return question.status


def is_labeler_active_question(question: Question, submission: Submission | None) -> bool:
    return effective_labeler_question_status(question, submission) in {"claimed", "draft", "submitted", "rejected"}


def is_labeler_recoverable_question(question: Question, submission: Submission | None, user_id: str) -> bool:
    if question.assigned_to == user_id and is_labeler_active_question(question, submission):
        return True
    if not submission or submission.labeler_id != user_id:
        return False
    if submission.status != "rejected":
        return False
    if submission.current_round >= 3 and question.assigned_to is None and question.status == "pending":
        return False
    return question.status in {"claimed", "submitted", "rejected", "pending"}


def is_labeler_contribution_question(question: Question, submission: Submission | None, user_id: str) -> bool:
    if question.assigned_to == user_id:
        return True
    if not submission or submission.labeler_id != user_id:
        return False
    return submission.status in {"submitted", "approved", "rejected"} or bool(submission.task_submitted_at)


def submission_unit_points(db: MongoDatabase, submission: Submission) -> int:
    task = db.get(Task, submission.task_id) if submission.task_id else None
    return unit_points(task) if task else 0


def labeler_review_task_items(db: MongoDatabase, *, user_id: str, questions: list[Question], submissions: list[Submission]) -> list[dict]:
    submissions_by_question_id = {submission.question_id: submission for submission in submissions}
    question_by_id = {question.id: question for question in questions}
    for submission in submissions:
        if submission.question_id in question_by_id:
            continue
        question = db.get(Question, submission.question_id) if submission.question_id else None
        if question and question.task_id == submission.task_id and is_labeler_contribution_question(question, submission, user_id):
            question_by_id[question.id] = question

    grouped: dict[str, list[Question]] = {}
    for question in question_by_id.values():
        grouped.setdefault(question.task_id, []).append(question)

    items: list[dict] = []
    for task_id, task_questions in grouped.items():
        task = db.get(Task, task_id)
        if not task or task.status not in {"published", "paused", "finished"}:
            continue
        progress = labeling_progress(task_questions, submissions_by_question_id, task=task, user_id=user_id, db=db)
        task_submissions = [submissions_by_question_id.get(question.id) for question in task_questions]
        task_submissions = [submission for submission in task_submissions if submission is not None]
        has_rejected_submission = task_has_rejected_question(task_questions, submissions_by_question_id)
        if progress["total"] == 0 or not task_submissions:
            continue
        if not has_rejected_submission and not task_submission_confirmed(task_questions, submissions_by_question_id):
            continue
        status_counts = {
            "submitted": len([submission for submission in task_submissions if submission.status == "submitted"]),
            "approved": len([submission for submission in task_submissions if submission.status == "approved"]),
            "rejected": len([question for question in task_questions if effective_labeler_question_status(question, submissions_by_question_id.get(question.id)) == "rejected"]),
        }
        if has_rejected_submission and status_counts["rejected"] == 0:
            status_counts["rejected"] = 1
        latest_at = max((submission.updated_at for submission in task_submissions if submission.updated_at), default=None)
        items.append(
            {
                "submission_id": f"task:{task.id}:{user_id}",
                "task_id": task.id,
                "task_title": task.title,
                "question_id": "",
                "row_index": None,
                "status": labeler_review_task_status(status_counts, len(task_submissions), task.status),
                "unit_points": unit_points(task),
                "submitted_at": isoformat_or_none(min((submission.submitted_at for submission in task_submissions if submission.submitted_at), default=None)),
                "updated_at": isoformat_or_none(latest_at),
                "progress": progress,
                "status_counts": status_counts,
                "questions": labeler_review_question_items(sorted(task_questions, key=lambda item: item.row_index), submissions_by_question_id),
            }
        )

    items.sort(key=lambda item: item["updated_at"] or "", reverse=True)
    return items


def task_submission_confirmed(questions: list[Question], submissions_by_question_id: dict[str, Submission]) -> bool:
    if not questions:
        return False
    for question in questions:
        submission = submissions_by_question_id.get(question.id)
        if effective_labeler_question_status(question, submission) == "rejected":
            return False
        if not submission or not submission.task_submitted_at:
            return False
    return True


def task_has_rejected_question(questions: list[Question], submissions_by_question_id: dict[str, Submission]) -> bool:
    return any(effective_labeler_question_status(question, submissions_by_question_id.get(question.id)) == "rejected" for question in questions)


def labeler_review_question_items(questions: list[Question], submissions_by_question_id: dict[str, Submission]) -> list[dict]:
    items = []
    for question in questions:
        submission = submissions_by_question_id.get(question.id)
        items.append(
            {
                "question_id": question.id,
                "row_index": question.row_index,
                "status": submission.status if submission else question.status,
                "question_status": question.status,
                "content_summary": labeler_question_content_summary(question),
                "submitted_at": isoformat_or_none(submission.submitted_at if submission else None),
                "updated_at": isoformat_or_none((submission.updated_at if submission else None) or question.updated_at),
            }
        )
    return items


def labeler_question_content_summary(question: Question) -> str:
    content = question.content or {}
    preferred_keys = ("show_title", "title", "question", "text", "content", "prompt", "原始标题", "题目")
    for key in preferred_keys:
        value = content.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()[:80]
    for value in content.values():
        if isinstance(value, str) and value.strip():
            return value.strip()[:80]
    return f"题目 #{question.row_index + 1}"


def labeler_review_task_status(status_counts: dict[str, int], total: int, task_status: str | None = None) -> str:
    if task_status == "finished":
        return "finished"
    if status_counts["rejected"] > 0:
        return "rejected"
    if status_counts["approved"] == total:
        return "approved"
    return "submitted"


def contribution_item_payload(db: MongoDatabase, submission: Submission) -> dict:
    task = db.get(Task, submission.task_id) if submission.task_id else None
    question = db.get(Question, submission.question_id) if submission.question_id else None
    return {
        "submission_id": submission.id,
        "task_id": submission.task_id,
        "task_title": task.title if task else "未知任务",
        "question_id": submission.question_id,
        "row_index": question.row_index if question else None,
        "status": submission.status,
        "unit_points": submission_unit_points(db, submission),
        "submitted_at": isoformat_or_none(submission.submitted_at),
        "updated_at": isoformat_or_none(submission.updated_at),
    }


def rejection_history_item(log: AuditLog | None) -> dict | None:
    if not log:
        return None
    changes = log.changes or {}
    return {
        "review_id": log.id,
        "round": changes.get("round"),
        "stage": changes.get("stage") or "manual_review",
        "decision": changes.get("decision"),
        "comment": changes.get("comment"),
        "reviewer_id": log.operator_id,
        "created_at": isoformat_or_none(log.created_at),
        "changes": changes,
    }


def abandon_limit_for_task(task: Task, total: int) -> int:
    if total <= 0:
        return 0
    difficulty = normalize_task_difficulty(task.difficulty)
    return max(1, ceil(total * ABANDON_RATES[difficulty]))


def labeling_ai_assist_percent_for_task(task: Task | None) -> int:
    if not task:
        return 5
    claim_config = getattr(task, "claim_config", {}) or {}
    ai_config = getattr(task, "ai_config", {}) or {}
    try:
        raw_value = claim_config.get("labeling_ai_assist_percent")
        if raw_value is None:
            raw_value = ai_config.get("labeler_assist_ratio")
        value = int(raw_value if raw_value is not None else 5)
    except (TypeError, ValueError):
        value = 5
    return max(0, min(value, 100))


def labeling_ai_assist_allowance(db: MongoDatabase, task: Task, user_id: str, total: int | None = None) -> dict:
    if total is None:
        assigned_question_ids = {
            question.id
            for question in db.find(Question, task_question_query(task, {"assigned_to": user_id}))
            if question.status in {"claimed", "submitted", "rejected"}
        }
        submission_question_ids = {
            submission.question_id
            for submission in db.find(Submission, {"task_id": task.id, "labeler_id": user_id})
            if submission.question_id and submission.status in {"draft", "submitted", "approved", "rejected", "abandoned"}
        }
        total = len(assigned_question_ids | submission_question_ids)
    percent = labeling_ai_assist_percent_for_task(task)
    limit = ceil(max(total, 0) * percent / 100) if total > 0 and percent > 0 else 0
    used_logs = db.find(
        AuditLog,
        {
            "team_id": task.team_id,
            "entity_type": "question",
            "action": "labeling_ai_assist_generated",
            "operator_id": user_id,
        },
    )
    used = len([
        log for log in used_logs
        if (log.changes or {}).get("task_id") == task.id
    ])
    return {
        "percent": percent,
        "limit": limit,
        "used": used,
        "remaining": max(limit - used, 0),
    }


def labeling_ai_assist_total_for_progress(questions: list[Question], submissions_by_question_id: dict[str, Submission]) -> int:
    question_ids = {question.id for question in questions}
    question_ids.update(
        submission.question_id
        for submission in submissions_by_question_id.values()
        if submission.question_id and submission.status in {"draft", "submitted", "approved", "rejected", "abandoned"}
    )
    return len(question_ids)


def normalize_task_difficulty(value: str | None) -> str:
    normalized = str(value or "").strip().lower()
    aliases = {
        "simple": "easy",
        "low": "easy",
        "简单": "easy",
        "easy": "easy",
        "normal": "medium",
        "moderate": "medium",
        "中等": "medium",
        "medium": "medium",
        "difficult": "hard",
        "高": "hard",
        "困难": "hard",
        "hard": "hard",
    }
    return aliases.get(normalized, "medium")


def labeling_progress(questions: list[Question], submissions_by_question_id: dict[str, Submission] | None = None, *, task: Task | None = None, user_id: str | None = None, db: MongoDatabase | None = None) -> dict:
    submissions_by_question_id = submissions_by_question_id or {}
    total = len(questions)
    submitted = len([question for question in questions if effective_labeler_question_status(question, submissions_by_question_id.get(question.id)) in {"submitted", "approved"}])
    rejected = len([question for question in questions if effective_labeler_question_status(question, submissions_by_question_id.get(question.id)) == "rejected"])
    abandoned = len([question for question in questions if effective_labeler_question_status(question, submissions_by_question_id.get(question.id)) == "abandoned"])
    abandon_limit = abandon_limit_for_task(task, total) if task else 0
    ai_assist_total = labeling_ai_assist_total_for_progress(questions, submissions_by_question_id)
    ai_assist_usage = labeling_ai_assist_allowance(db, task, user_id, total=ai_assist_total) if task and user_id and db else {"percent": labeling_ai_assist_percent_for_task(task), "limit": 0, "used": 0, "remaining": 0}
    return {
        "total": total,
        "submitted": submitted,
        "rejected": rejected,
        "abandoned": abandoned,
        "remaining": max(total - submitted - abandoned, 0),
        "percent": int((submitted / total) * 100) if total else 0,
        "abandon_limit": abandon_limit,
        "abandon_used": abandoned,
        "abandon_remaining": max(abandon_limit - abandoned, 0),
        "ai_assist_percent": ai_assist_usage["percent"],
        "ai_assist_limit": ai_assist_usage["limit"],
        "ai_assist_used": ai_assist_usage["used"],
        "ai_assist_remaining": ai_assist_usage["remaining"],
    }


def latest_question_activity(questions: list[Question], submissions: dict[str, Submission]):
    dates = [parsed_datetime(question.updated_at) for question in questions if parsed_datetime(question.updated_at)]
    dates.extend(parsed_datetime(submission.updated_at) for question in questions if (submission := submissions.get(question.id)) and parsed_datetime(submission.updated_at))
    return max(dates) if dates else None


def parsed_datetime(value) -> datetime | None:
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    if isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            return None
    return None


def isoformat_or_none(value) -> str | None:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, str):
        return value
    return None
