from __future__ import annotations

from fastapi import Request

from app.api.deps import CurrentUser
from app.core.database import MongoDatabase
from app.core.errors import AppError, ErrorCode
from app.core.security import now_utc
from app.domains.rbac import TeamRole
from app.models.audit import AuditLog
from app.models.ai_review import AiReviewJob
from app.models.production import AnnotationTemplate, Question, Submission, Task
from app.models.team import TeamMember
from app.models.user import User, UserProfile
from app.services.audit_service import write_audit_log
from app.services.ai_reviews_service import ai_review_job_payload
from app.services.labels_service import submission_payload, unit_points
from app.services.notification_dispatcher import notify_review_decision
from app.services.profile_service import (
    deduct_reputation_for_final_reject,
    reward_reputation_for_approved_submission,
    settle_claim_bundle_points,
    settle_submission_points,
)
from app.services.platform_service import record_platform_commission_income
from app.services.production_service import effective_template_schema, get_task_bound_template_version, question_payload, sync_task_question_stats, task_payload, validate_template_answers
from app.services.resource_service import (
    ensure_team_points_available_for_spend,
    platform_service_fee_points,
    record_team_platform_fee_spend,
    record_team_points_spend,
)

REVIEW_VISIBLE_SUBMISSION_STATUSES = {"submitted", "approved", "rejected"}


def require_review_team_scope(current: CurrentUser) -> str:
    if not current.team_id:
        raise AppError(ErrorCode.PERMISSION_DENIED, "人工审核接口必须携带当前企业作用域")
    return current.team_id


def user_display_name(db: MongoDatabase, user_id: str | None) -> str | None:
    if not user_id:
        return None
    profile = db.find_one(UserProfile, {"user_id": user_id})
    user = db.get(User, user_id)
    return (
        (profile.real_name if profile else None)
        or (profile.display_name if profile else None)
        or (user.username if user else None)
        or (user.email if user else None)
    )


def list_review_queue(
    db: MongoDatabase,
    *,
    current: CurrentUser,
    task_id: str | None = None,
    reviewer_id: str | None = None,
    assigned_only: bool = True,
    ai_suggestion: str | None = None,
    status_filter: str = "submitted",
    stage_filter: str | None = None,
    keyword: str | None = None,
) -> dict:
    require_review_team_scope(current)
    if status_filter == "processed":
        submissions = db.find(Submission, {}, sort=[("updated_at", -1)])
        submissions = [submission for submission in submissions if submission.status in {"approved", "rejected"}]
    elif status_filter == "all":
        submissions = db.find(Submission, {}, sort=[("updated_at", -1)])
    else:
        submissions = db.find(Submission, {"status": "submitted"}, sort=[("updated_at", -1)])
    items = []
    for submission in submissions:
        task = db.get(Task, submission.task_id)
        question = db.get(Question, submission.question_id)
        if not task or not question:
            continue
        if not review_submission_scope_matches(submission, task, question):
            continue
        if task_id and task.id != task_id:
            continue
        if reviewer_id and not review_task_matches_reviewer_filter(db, task, reviewer_id):
            continue
        if not review_stage_matches(submission.current_round, stage_filter):
            continue
        if not can_read_review_submission(db, current, task, submission, assigned_only=assigned_only):
            continue
        if not (submission.submitted_at or submission.task_submitted_at):
            continue
        ai_review = latest_ai_review_payload(db, submission.id)
        item = review_queue_item(db, task, question, submission, ai_review=ai_review)
        if ai_suggestion and item["ai_suggestion"] != ai_suggestion:
            continue
        if keyword and not review_queue_item_matches_keyword(item, keyword):
            continue
        items.append(item)
    return {"items": items, "summary": review_queue_summary(items)}


def review_stage_matches(current_round: int, stage_filter: str | None) -> bool:
    if not stage_filter or stage_filter == "all_stages":
        return True
    if stage_filter == "initial_review":
        return current_round <= 1
    if stage_filter == "re_review":
        return current_round == 2
    if stage_filter == "final_review":
        return current_round >= 3
    return True


def get_review_submission_detail(db: MongoDatabase, *, submission_id: str, current: CurrentUser, assigned_only: bool = True) -> dict:
    submission, task, question = require_review_submission_for_read(db, submission_id, current, assigned_only=assigned_only)
    question_data = question_payload(question, db=db)
    bound_version = get_task_bound_template_version(db, task)
    if bound_version:
        question_data["template_schema"] = bound_version.schema
    else:
        template = db.find_one_by_id(AnnotationTemplate, task.template_id) if task.template_id else None
        if template:
            question_data["template_schema"] = effective_template_schema(template, db)
    return {
        "submission": submission_payload(submission, question=question, task=task),
        "task": task_payload(task, db=db),
        "question": question_data,
        "review_context": {
            "current_round": submission.current_round,
            "decision_options": ["approved", "rejected", "revise"],
            "comment_required_for": ["rejected", "revise"],
            "question_context": build_review_question_context(task, question_data),
        },
        "ai_review": latest_ai_review_payload(db, submission.id),
    }


def build_review_question_context(task: Task, question_data: dict) -> dict:
    content = question_data.get("content") if isinstance(question_data.get("content"), dict) else {}
    media = content.get("media") if isinstance(content.get("media"), list) else []
    derived_context = content.get("derived_context") if isinstance(content.get("derived_context"), dict) else {}
    text_fields = {
        key: str(value)
        for key, value in content.items()
        if key not in {"media", "attachments", "derived_context", "_bindings"} and not isinstance(value, (dict, list))
    }
    return {
        "task": {
            "title": task.title,
            "category": task.category,
            "tags": task.tags or [],
        },
        "sample": {
            "row_index": question_data.get("row_index"),
            "text_fields": text_fields,
            "media": media,
            "attachments": content.get("attachments") if isinstance(content.get("attachments"), list) else [],
            "derived_context": derived_context,
        },
        "text_fallback": {
            "fields": text_fields,
            "ocr_text": derived_context.get("ocr_text"),
            "asr_text": derived_context.get("asr_text"),
            "caption": derived_context.get("caption"),
            "summary": derived_context.get("summary"),
            "media_index": [
                {"id": item.get("id"), "type": item.get("type"), "role": item.get("role"), "field": item.get("field"), "name": item.get("name")}
                for item in media
                if isinstance(item, dict)
            ],
        },
    }


def review_stats(db: MongoDatabase, *, current: CurrentUser, assigned_only: bool = True) -> dict:
    require_review_team_scope(current)
    visible_submissions = visible_review_submissions(db, current=current, assigned_only=assigned_only)
    by_status: dict[str, int] = {}
    by_task: dict[str, int] = {}
    for submission, task, _question in visible_submissions:
        by_status[submission.status] = by_status.get(submission.status, 0) + 1
        by_task[task.id] = by_task.get(task.id, 0) + 1
    pending = by_status.get("submitted", 0)
    completed = by_status.get("approved", 0) + by_status.get("rejected", 0)
    return {
        "pending": pending,
        "completed": completed,
        "approved": by_status.get("approved", 0),
        "rejected": by_status.get("rejected", 0),
        "total_visible": len(visible_submissions),
        "task_count": len(by_task),
        "by_status": by_status,
    }


def batch_submit_review_decision(db: MongoDatabase, *, current: CurrentUser, payload: dict, request: Request) -> dict:
    submission_ids = payload["submission_ids"]
    decision_payload = {"decision": payload["decision"], "comment": payload.get("comment")}
    if "revised_answers" in payload:
        decision_payload["revised_answers"] = payload.get("revised_answers")
    results = []
    success_count = 0
    failed_count = 0
    for submission_id in submission_ids:
        try:
            detail = submit_review_decision(db, submission_id=submission_id, current=current, payload=decision_payload, request=request)
            results.append({"submission_id": submission_id, "status": "success", "submission": detail["submission"]})
            success_count += 1
        except AppError as exc:
            results.append({"submission_id": submission_id, "status": "failed", "code": exc.code, "message": exc.message})
            failed_count += 1
    write_audit_log(
        db,
        entity_type="review",
        entity_id=current.team_id or "batch",
        action="submission_reviewed_batch",
        operator_id=current.user_id,
        team_id=current.team_id,
        changes={
            "decision": payload["decision"],
            "total": len(submission_ids),
            "success_count": success_count,
            "failed_count": failed_count,
            "submission_ids": submission_ids[:20],
        },
        request=request,
    )
    db.commit()
    return {
        "decision": payload["decision"],
        "total": len(submission_ids),
        "success_count": success_count,
        "failed_count": failed_count,
        "results": results,
    }


def review_submission_history(db: MongoDatabase, *, submission_id: str, current: CurrentUser, assigned_only: bool = True) -> dict:
    submission, task, question = require_review_submission_for_read(db, submission_id, current, assigned_only=assigned_only)
    logs = db.find(AuditLog, {"team_id": submission.team_id, "entity_type": "review", "entity_id": submission.id, "action": "submission_reviewed"}, sort=[("created_at", 1)])
    items = []
    for index, log in enumerate(logs, start=1):
        changes = log.changes or {}
        items.append(
            {
                "history_id": log.id,
                "round": changes.get("round") or index,
                "stage": changes.get("stage") or "manual_review",
                "decision": changes.get("decision"),
                "comment": changes.get("comment"),
                "operator_id": log.operator_id,
                "operator_name": user_display_name(db, log.operator_id),
                "action": log.action,
                "created_at": log.created_at.isoformat() if log.created_at else None,
                "changes": changes,
            }
        )
    return {
        "submission_id": submission.id,
        "task_id": task.id,
        "question_id": question.id,
        "items": items,
        "summary": {"total": len(items), "current_round": submission.current_round},
    }


def review_submission_diff(db: MongoDatabase, *, submission_id: str, current: CurrentUser, assigned_only: bool = True) -> dict:
    submission, task, question = require_review_submission_for_read(db, submission_id, current, assigned_only=assigned_only)
    before = submission.draft or {}
    after = submission.answers or {}
    fields = sorted(set(before.keys()) | set(after.keys()))
    items = []
    for field in fields:
        previous_value = before.get(field)
        current_value = after.get(field)
        if previous_value == current_value:
            change_type = "unchanged"
        elif field not in before:
            change_type = "added"
        elif field not in after:
            change_type = "removed"
        else:
            change_type = "changed"
        items.append(
            {
                "field": field,
                "change_type": change_type,
                "previous_value": previous_value,
                "current_value": current_value,
            }
        )
    return {
        "submission_id": submission.id,
        "task_id": task.id,
        "question_id": question.id,
        "base": "draft",
        "target": "answers",
        "items": items,
        "summary": {
            "changed": len([item for item in items if item["change_type"] != "unchanged"]),
            "unchanged": len([item for item in items if item["change_type"] == "unchanged"]),
        },
    }


def submit_review_decision(db: MongoDatabase, *, submission_id: str, current: CurrentUser, payload: dict, request: Request) -> dict:
    submission, task, question = require_review_submission(db, submission_id, current)
    if submission.status != "submitted":
        raise AppError(ErrorCode.STATE_CONFLICT, "提交不在待审核状态")
    decision = payload["decision"]
    comment = (payload.get("comment") or "").strip()
    if decision in {"rejected", "revise"} and not comment:
        raise AppError(ErrorCode.VALIDATION_REQUIRED, "打回或要求修改必须填写原因")
    revised_answers = payload.get("revised_answers")
    if decision == "revise" and not isinstance(revised_answers, dict):
        raise AppError(ErrorCode.VALIDATION_REQUIRED, "直接修订必须提交修订后的标注答案")

    revision_validation = None
    if decision == "revise":
        bound_version = get_task_bound_template_version(db, task)
        if bound_version:
            revision_validation = validate_template_answers(bound_version.schema, revised_answers, question.content)
            if not revision_validation["valid"]:
                raise AppError(ErrorCode.BUSINESS_RULE, "修订后的答案未通过模板校验", revision_validation)

    is_final_reject = decision == "rejected" and submission.current_round >= 3
    next_status = "rejected" if decision == "rejected" else "approved"
    now = now_utc().replace(tzinfo=None)
    review_round = submission.current_round
    previous_submission_status = submission.status
    previous_question_status = question.status
    previous_answers = dict(submission.answers or {})
    if decision == "revise":
        submission.answers = revised_answers
        submission.validation_result = revision_validation or submission.validation_result
    submission.status = next_status
    if decision == "rejected" and not is_final_reject:
        submission.task_submitted_at = None
    submission.updated_at = now
    if decision == "rejected" and not is_final_reject:
        submission.current_round += 1
    db.save(submission)

    if is_final_reject:
        question.status = "pending" if task_is_open_for_reclaim(task, now) else "closed"
        question.assigned_to = None
        question.claim_due_at = None
    else:
        question.status = next_status
    question.updated_at = now
    db.save(question)

    sync_task_question_stats(db, task)
    points_settlement = None
    platform_commission = None
    reputation_adjustment = None
    if is_final_reject:
        reputation_adjustment = deduct_reputation_for_final_reject(db, user_id=submission.labeler_id, submission_id=submission.id, task_id=task.id, question_id=question.id, task_title=task.title)
    if decision == "approved" and not getattr(submission, "claim_bundle_id", None):
        reward_points = review_reward_points(task)
        service_fee_points = platform_service_fee_points(db, reward_points)
        ensure_team_points_available_for_spend(db, team_id=task.team_id, amount=reward_points + service_fee_points)
        points_settlement = settle_submission_points(
            db,
            user_id=submission.labeler_id,
            change=reward_points,
            reason=f"任务「{task.title}」标注审核{'修订入库' if decision == 'revise' else '通过'}",
            source_type="submission_review",
            source_id=submission.id,
        )
        if points_settlement and points_settlement.get("created"):
            record_team_points_spend(
                db,
                team_id=task.team_id,
                amount=reward_points,
                source_id=submission.id,
                operator_id=current.user_id,
                request=request,
            )
            record_team_platform_fee_spend(
                db,
                team_id=task.team_id,
                amount=service_fee_points,
                source_id=submission.id,
                operator_id=current.user_id,
                request=request,
            )
            platform_commission = record_platform_commission_income(
                db,
                submission_id=submission.id,
                team_id=task.team_id,
                task_id=task.id,
                labeler_id=submission.labeler_id,
                reward_points=reward_points,
                operator_id=current.user_id,
            )
            reputation_adjustment = reward_reputation_for_approved_submission(db, user_id=submission.labeler_id)
    elif decision == "approved":
        reputation_adjustment = reward_reputation_for_approved_submission(db, user_id=submission.labeler_id)

    claim_bundle_id = str(getattr(submission, "claim_bundle_id", "") or "").strip()
    if claim_bundle_id and decision in {"approved", "rejected"}:
        bundle_settlement = settle_claim_bundle_points(
            db,
            claim_bundle_id=claim_bundle_id,
            operator_id=current.user_id,
            request=request,
        )
        if bundle_settlement is not None:
            points_settlement = {
                "mode": "bundle",
                "bundle_id": claim_bundle_id,
                **bundle_settlement,
            }
    write_audit_log(
        db,
        entity_type="review",
        entity_id=submission.id,
        action="submission_reviewed",
        operator_id=current.user_id,
        team_id=task.team_id,
        changes={
            "decision": decision,
            "comment": comment,
            "round": review_round,
            "stage": "manual_review",
            "task_id": task.id,
            "question_id": question.id,
            "revised_answers": {"from": previous_answers, "to": revised_answers} if decision == "revise" else None,
            "points_settlement": points_settlement,
            "platform_commission": platform_commission,
            "reputation_adjustment": reputation_adjustment,
            "submission_status": {"from": previous_submission_status, "to": submission.status},
            "question_status": {"from": previous_question_status, "to": question.status},
        },
        request=request,
    )
    notify_review_decision(
        db,
        task=task,
        question=question,
        submission=submission,
        decision=decision,
        reviewer_id=current.user_id,
        points_settlement=points_settlement,
        request=request,
    )
    db.commit()
    return get_review_submission_detail(db, submission_id=submission.id, current=current)


def visible_review_submissions(db: MongoDatabase, *, current: CurrentUser, assigned_only: bool = True) -> list[tuple[Submission, Task, Question]]:
    submissions = db.find(Submission, {}, sort=[("updated_at", -1)])
    visible = []
    for submission in submissions:
        if not is_review_visible_submission(submission):
            continue
        task = db.get(Task, submission.task_id)
        question = db.get(Question, submission.question_id)
        if not task or not question:
            continue
        if not review_submission_scope_matches(submission, task, question):
            continue
        if can_read_review_submission(db, current, task, submission, assigned_only=assigned_only):
            visible.append((submission, task, question))
    return visible


def require_review_submission(db: MongoDatabase, submission_id: str, current: CurrentUser) -> tuple[Submission, Task, Question]:
    require_review_team_scope(current)
    submission = db.get(Submission, submission_id)
    if not submission:
        raise AppError(ErrorCode.NOT_FOUND, "提交不存在")
    task = db.get(Task, submission.task_id)
    question = db.get(Question, submission.question_id)
    if task and question and not review_submission_scope_matches(submission, task, question):
        raise AppError(ErrorCode.NOT_FOUND, "提交不存在")
    if not task or not question:
        raise AppError(ErrorCode.NOT_FOUND, "提交关联任务或题目不存在")
    if not can_submit_review_task(db, current, task):
        raise AppError(ErrorCode.PERMISSION_DENIED, "只有当前任务分配的 Reviewer 可以提交审核结果")
    return submission, task, question


def require_review_submission_for_read(db: MongoDatabase, submission_id: str, current: CurrentUser, assigned_only: bool = True) -> tuple[Submission, Task, Question]:
    require_review_team_scope(current)
    submission = db.get(Submission, submission_id)
    if not submission:
        raise AppError(ErrorCode.NOT_FOUND, "提交不存在")
    task = db.get(Task, submission.task_id)
    question = db.get(Question, submission.question_id)
    if task and question and not review_submission_scope_matches(submission, task, question):
        raise AppError(ErrorCode.NOT_FOUND, "提交不存在")
    if not task or not question:
        raise AppError(ErrorCode.NOT_FOUND, "提交关联任务或题目不存在")
    if not is_review_visible_submission(submission):
        raise AppError(ErrorCode.NOT_FOUND, "提交不存在")
    if not can_read_review_submission(db, current, task, submission, assigned_only=assigned_only):
        raise AppError(ErrorCode.PERMISSION_DENIED, "无权限查看该提交")
    return submission, task, question


def review_submission_scope_matches(submission: Submission, task: Task, question: Question) -> bool:
    return (
        submission.team_id == task.team_id
        and question.team_id == task.team_id
        and submission.task_id == task.id
        and question.task_id == task.id
        and submission.question_id == question.id
    )


def is_review_visible_submission(submission: Submission) -> bool:
    return submission.status in REVIEW_VISIBLE_SUBMISSION_STATUSES


def can_read_review_task(db: MongoDatabase, current: CurrentUser, task: Task, *, assigned_only: bool) -> bool:
    if not current.team_id or task.team_id != current.team_id:
        return False
    if review_task_assigned_to_current_user(db, current, task):
        return True
    if current.team_role == TeamRole.REVIEWER.value and review_task_open_to_team_reviewers(db, current, task):
        return True
    if not assigned_only and current.team_role in {TeamRole.OWNER.value, TeamRole.TEAM_ADMIN.value}:
        return True
    return False


def can_read_review_submission(db: MongoDatabase, current: CurrentUser, task: Task, submission: Submission, *, assigned_only: bool) -> bool:
    if not can_read_review_task(db, current, task, assigned_only=assigned_only):
        return False
    if current.team_role != TeamRole.REVIEWER.value or review_task_assigned_to_current_user(db, current, task):
        return True
    member = db.find_one(TeamMember, {"team_id": task.team_id, "user_id": current.user_id, "team_role": TeamRole.REVIEWER.value, "status": "active"})
    if member and "review:submit" not in set(member.permissions or []) and submission.submitted_at:
        return False
    return True


def can_submit_review_task(db: MongoDatabase, current: CurrentUser, task: Task) -> bool:
    if not current.team_id or task.team_id != current.team_id:
        return False
    if current.team_role != TeamRole.REVIEWER.value:
        return False
    return review_task_assigned_to_current_user(db, current, task) or review_task_open_to_team_reviewers(db, current, task)


def review_task_assigned_to_current_user(db: MongoDatabase, current: CurrentUser, task: Task) -> bool:
    if current.user_id in set(task.reviewer_ids or []):
        return True
    member = db.find_one(TeamMember, {"team_id": task.team_id, "user_id": current.user_id, "status": "active"})
    return bool(member and current.team_role == TeamRole.REVIEWER.value and task.id in set(member.assigned_review_tasks or []))


def review_task_open_to_team_reviewers(db: MongoDatabase, current: CurrentUser, task: Task) -> bool:
    if task.reviewer_ids:
        return False
    if db.find_one(TeamMember, {"team_id": task.team_id, "team_role": TeamRole.REVIEWER.value, "status": "active", "assigned_review_tasks": task.id}):
        return False
    return bool(db.find_one(TeamMember, {"team_id": task.team_id, "user_id": current.user_id, "team_role": TeamRole.REVIEWER.value, "status": "active"}))


def review_task_matches_reviewer_filter(db: MongoDatabase, task: Task, reviewer_id: str) -> bool:
    if reviewer_id in set(task.reviewer_ids or []):
        return True
    member = db.find_one(TeamMember, {"team_id": task.team_id, "user_id": reviewer_id, "status": "active"})
    if member and task.id in set(member.assigned_review_tasks or []):
        return True
    if task.reviewer_ids:
        return False
    if db.find_one(TeamMember, {"team_id": task.team_id, "team_role": TeamRole.REVIEWER.value, "status": "active", "assigned_review_tasks": task.id}):
        return False
    return bool(member and member.team_role == TeamRole.REVIEWER.value)


def review_reward_points(task: Task) -> int:
    return unit_points(task)


def task_is_open_for_reclaim(task: Task, now) -> bool:
    if task.status != "published":
        return False
    deadline_mode = (getattr(task, "claim_config", {}) or {}).get("deadline_mode")
    if deadline_mode == "long_term":
        return True
    return not task.deadline or task.deadline[:10] >= now.date().isoformat()


def latest_ai_review_payload(db: MongoDatabase, submission_id: str) -> dict | None:
    job = db.find_one(AiReviewJob, {"submission_id": submission_id}, sort=[("created_at", -1)])
    return ai_review_job_payload(job) if job else None


def review_queue_item(db: MongoDatabase, task: Task, question: Question, submission: Submission, *, ai_review: dict | None = None) -> dict:
    title, summary = question_title_and_summary(question.content or {})
    ai_summary = ai_review_summary_payload(ai_review)
    responsible_reviewers = review_task_responsible_reviewers(db, task)
    return {
        "submission_id": submission.id,
        "task_id": task.id,
        "task_title": task.title,
        "question_id": question.id,
        "row_index": question.row_index,
        "labeler_id": submission.labeler_id,
        "labeler_name": user_display_name(db, submission.labeler_id) or submission.labeler_id,
        "status": submission.status,
        "current_round": submission.current_round,
        "title": title,
        "summary": summary,
        "tags": task.tags or [],
        "responsible_reviewers": responsible_reviewers,
        "responsible_reviewer_ids": [item["user_id"] for item in responsible_reviewers],
        "responsible_reviewer_names": [item["display_name"] for item in responsible_reviewers],
        "ai_review": ai_review,
        "ai_status": ai_review.get("status") if ai_review else None,
        "ai_score": ai_summary["score"],
        "ai_suggestion": ai_summary["suggestion"],
        "ai_reason": ai_summary["reason"],
        "risk_flags": ai_summary["risk_flags"],
        "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else None,
        "updated_at": submission.updated_at.isoformat() if submission.updated_at else None,
    }


def review_task_responsible_reviewers(db: MongoDatabase, task: Task) -> list[dict]:
    reviewer_ids = list(dict.fromkeys(task.reviewer_ids or []))
    members = db.find(TeamMember, {"team_id": task.team_id, "team_role": TeamRole.REVIEWER.value, "status": "active"})
    for member in members:
        if task.id in set(member.assigned_review_tasks or []) and member.user_id not in reviewer_ids:
            reviewer_ids.append(member.user_id)
    if not reviewer_ids:
        reviewer_ids = [member.user_id for member in members]

    reviewers: list[dict] = []
    for reviewer_id in reviewer_ids:
        user = db.get(User, reviewer_id)
        member = next((item for item in members if item.user_id == reviewer_id), None)
        display_name = user_display_name(db, reviewer_id) or reviewer_id
        reviewers.append(
            {
                "user_id": reviewer_id,
                "display_name": display_name,
                "email": getattr(user, "email", None),
                "assignment_type": (
                    "assigned_task"
                    if member and task.id in set(member.assigned_review_tasks or [])
                    else "task_reviewer"
                    if task.reviewer_ids
                    else "team_reviewer_pool"
                ),
            }
        )
    return reviewers


def review_queue_summary(items: list[dict]) -> dict:
    ai_suggestions = {"pass": 0, "reject": 0, "manual": 0}
    for item in items:
        suggestion = item.get("ai_suggestion") or "manual"
        ai_suggestions[suggestion if suggestion in ai_suggestions else "manual"] += 1
    return {
        "pending": len(items),
        "rounds": sorted({item["current_round"] for item in items}),
        "tasks": len({item["task_id"] for item in items}),
        "ai_suggestions": ai_suggestions,
    }


def review_queue_item_matches_keyword(item: dict, keyword: str) -> bool:
    text = keyword.strip().lower()
    if not text:
        return True
    fields = [
        item.get("submission_id"),
        item.get("task_title"),
        item.get("labeler_id"),
        item.get("labeler_name"),
        item.get("title"),
        item.get("summary"),
        item.get("ai_reason"),
        " ".join(item.get("tags") or []),
        " ".join(item.get("risk_flags") or []),
    ]
    return any(text in str(field or "").lower() for field in fields)


def question_title_and_summary(content: dict) -> tuple[str, str]:
    if not content:
        return "未命名题目", "暂无题目内容"
    title_keys = ("title", "cleaned_title", "name", "question", "text", "content")
    summary_keys = ("summary", "abstract", "description", "body", "text", "content")
    title = next((str(content[key]) for key in title_keys if content.get(key)), "")
    summary = next((str(content[key]) for key in summary_keys if content.get(key) and str(content[key]) != title), "")
    if not title:
        first_key = next(iter(content.keys()))
        title = f"{first_key}: {str(content[first_key])[:80]}"
    if not summary:
        summary = ", ".join(f"{key}: {value}" for key, value in list(content.items())[:3])
    return title[:120], summary[:240]


def ai_review_summary_payload(ai_review: dict | None) -> dict:
    result = (ai_review or {}).get("result") or {}
    raw_decision = str(result.get("decision") or result.get("suggestion") or "").lower()
    if raw_decision in {"pass", "approved", "approve", "suggest_pass", "建议通过"}:
        suggestion = "pass"
    elif raw_decision in {"reject", "rejected", "revise", "suggest_reject", "建议打回"}:
        suggestion = "reject"
    else:
        suggestion = "manual"
    score = result.get("score") or result.get("total_score") or result.get("overall_score")
    reason = result.get("reason") or result.get("comment") or result.get("summary")
    risk_flags = result.get("risk_flags") or result.get("flags") or []
    if isinstance(risk_flags, str):
        risk_flags = [risk_flags]
    if not isinstance(risk_flags, list):
        risk_flags = []
    return {"suggestion": suggestion, "score": score, "reason": reason, "risk_flags": risk_flags}
