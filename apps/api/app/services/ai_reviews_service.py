from __future__ import annotations

import json
from threading import BoundedSemaphore

from fastapi import Request

from app.api.deps import CurrentUser
from app.core.database import MongoDatabase, get_database
from app.core.errors import AppError, ErrorCode
from app.core.security import now_utc
from app.domains.rbac import TeamRole
from app.models.ai_review import AiReviewJob
from app.models.production import Question, Submission, Task
from app.models.resource import AiProviderConfig
from app.models.team import TeamMember
from app.services.audit_service import write_audit_log
from app.services.labels_service import extract_question_media_assets
from app.services.production_service import (
    compact_ai_generation_payload,
    get_task_bound_template_version,
    run_platform_provider_messages_generation,
    strip_json_fence,
)
from app.services.notification_dispatcher import notify_ai_review_job_processed

AI_REVIEW_STATUSES = {"pending", "processing", "completed", "failed"}
AI_REVIEW_SUGGESTIONS = {"pass", "reject", "manual"}
AI_REVIEW_VISIBLE_SUBMISSION_STATUSES = {"submitted", "approved", "rejected"}
AI_REVIEW_VISIBLE_TASK_STATUSES = {"published"}
AI_REVIEW_CONCURRENCY_LIMIT = 3
AI_REVIEW_EXECUTION_SEMAPHORE = BoundedSemaphore(AI_REVIEW_CONCURRENCY_LIMIT)
AI_REVIEW_RESULT_SCHEMA = {
    "type": "object",
    "additionalProperties": True,
    "required": ["decision", "total_score", "reason", "dimension_scores", "risk_flags"],
    "properties": {
        "decision": {"type": "string", "enum": ["pass", "reject", "manual"]},
        "total_score": {"type": "number", "minimum": 0, "maximum": 100},
        "reason": {"type": "string"},
        "dimension_scores": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": True,
                    "required": ["dimension", "score", "comment", "reason"],
                    "properties": {
                        "dimension": {"type": "string"},
                        "score": {"type": "number", "minimum": 0, "maximum": 100},
                        "comment": {"type": "string"},
                        "reason": {"type": "string"},
                    },
                },
            },
        "risk_flags": {"type": "array", "items": {"type": "string"}},
        "suggested_actions": {"type": "array", "items": {"type": "string"}},
    },
}


def require_ai_review_team_scope(current: CurrentUser) -> str:
    if not current.team_id:
        raise AppError(ErrorCode.PERMISSION_DENIED, "璇锋寚瀹氬洟闃熶綔鐢ㄥ煙")
    return current.team_id


def list_ai_review_jobs(
    db: MongoDatabase,
    *,
    current: CurrentUser,
    task_id: str | None = None,
    status: str | None = None,
) -> dict:
    team_id = require_ai_review_team_scope(current)
    query: dict = {"team_id": team_id}
    if task_id:
        query["task_id"] = task_id
    if status:
        query["status"] = status
    jobs = [
        job
        for job in db.find(AiReviewJob, query, sort=[("created_at", -1)])
        if can_access_ai_review_job(db, current, job) and ai_review_job_task_enabled(db, job)
    ]
    return {"items": [ai_review_job_payload(job) for job in jobs], "summary": ai_review_summary(jobs)}


def list_ai_review_task_overviews(
    db: MongoDatabase,
    *,
    current: CurrentUser,
    keyword: str | None = None,
    task_status: str | None = None,
    ai_status: str | None = None,
    provider_id: str | None = None,
    only_anomalies: bool = False,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    team_id = require_ai_review_team_scope(current)
    tasks = [
        task
        for task in db.find(Task, {"team_id": team_id}, sort=[("updated_at", -1)])
        if is_ai_review_visible_task(task) and can_access_ai_review_task(db, current, task)
    ]
    jobs = [
        job
        for job in db.find(AiReviewJob, {"team_id": team_id}, sort=[("updated_at", -1)])
        if can_access_ai_review_job(db, current, job) and ai_review_job_task_enabled(db, job)
    ]
    submissions = db.find(Submission, {"team_id": team_id})
    questions = db.find(Question, {"team_id": team_id})
    jobs_by_task = group_by(jobs, "task_id")
    submissions_by_task = group_by(submissions, "task_id")
    questions_by_task = group_by(questions, "task_id")
    keyword_text = (keyword or "").strip().lower()
    filtered: list[dict] = []
    for task in tasks:
        if task_status and task.status != task_status:
            continue
        ai_config = getattr(task, "ai_config", {}) or {}
        if provider_id and str(ai_config.get("provider_id") or "") != provider_id:
            continue
        provider = db.get(AiProviderConfig, str(ai_config.get("provider_id") or "")) if ai_config.get("provider_id") else None
        item = ai_review_task_overview_payload(
            task,
            jobs=jobs_by_task.get(task.id, []),
            submissions=submissions_by_task.get(task.id, []),
            questions=questions_by_task.get(task.id, []),
            provider=provider,
        )
        if ai_status and item["status_counts"].get(ai_status, 0) <= 0:
            continue
        if only_anomalies and item["failed_count"] <= 0 and item["manual_count"] <= 0:
            continue
        if keyword_text and keyword_text not in task.title.lower() and keyword_text not in task.id.lower():
            continue
        filtered.append(item)
    filtered.sort(key=lambda item: item.get("last_activity_at") or item.get("updated_at") or "", reverse=True)
    total = len(filtered)
    safe_page_size = max(1, min(page_size, 100))
    safe_page = max(1, page)
    start = (safe_page - 1) * safe_page_size
    end = start + safe_page_size
    return {
        "items": filtered[start:end],
        "summary": ai_review_task_overview_summary(filtered),
        "pagination": pagination(total, safe_page, safe_page_size),
    }


def get_ai_review_task_submissions(
    db: MongoDatabase,
    *,
    task_id: str,
    current: CurrentUser,
    status: str | None = None,
    suggestion: str | None = None,
    keyword: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    team_id = require_ai_review_team_scope(current)
    task = db.get(Task, task_id)
    if not task or task.team_id != team_id or not is_ai_review_visible_task(task) or not can_access_ai_review_task(db, current, task):
        raise AppError(ErrorCode.NOT_FOUND, "AI 预审任务不存在")
    submissions = db.find(Submission, {"team_id": team_id, "task_id": task_id}, sort=[("updated_at", -1)])
    questions = {question.id: question for question in db.find(Question, {"team_id": team_id, "task_id": task_id})}
    jobs = db.find(AiReviewJob, {"team_id": team_id, "task_id": task_id}, sort=[("updated_at", -1)])
    ai_config = getattr(task, "ai_config", {}) or {}
    provider = db.get(AiProviderConfig, str(ai_config.get("provider_id") or "")) if ai_config.get("provider_id") else None
    latest_job_by_submission = latest_ai_job_by_submission(jobs)
    keyword_text = (keyword or "").strip().lower()
    rows: list[dict] = []
    for submission in submissions:
        question = questions.get(submission.question_id)
        if not is_ai_review_visible_submission(submission) or not question or not ai_review_submission_scope_matches(submission, task, question):
            continue
        job = latest_job_by_submission.get(submission.id)
        row = ai_review_submission_payload(submission, question, job)
        if status and row["ai_status"] != status:
            continue
        if suggestion and row["ai_suggestion"] != suggestion:
            continue
        if keyword_text and not ai_review_submission_matches_keyword(row, keyword_text):
            continue
        rows.append(row)
    total = len(rows)
    safe_page_size = max(1, min(page_size, 100))
    safe_page = max(1, page)
    start = (safe_page - 1) * safe_page_size
    end = start + safe_page_size
    visible_jobs = list(latest_job_by_submission.values())
    return {
        "task": ai_review_task_overview_payload(
            task,
            jobs=jobs,
            submissions=submissions,
            questions=list(questions.values()),
            provider=provider,
        ),
        "items": rows[start:end],
        "summary": ai_review_submission_summary(rows, visible_jobs),
        "pagination": pagination(total, safe_page, safe_page_size),
    }


def get_ai_review_job(db: MongoDatabase, *, job_id: str, current: CurrentUser) -> dict:
    require_ai_review_team_scope(current)
    job = db.get(AiReviewJob, job_id)
    if not job or not can_access_ai_review_job(db, current, job):
        raise AppError(ErrorCode.NOT_FOUND, "AI 预审任务不存在")
    return ai_review_job_payload(job)


def trigger_ai_review(db: MongoDatabase, *, submission_id: str, current: CurrentUser, request: Request | None = None) -> dict:
    require_ai_review_team_scope(current)
    submission = db.get(Submission, submission_id)
    if not submission:
        raise AppError(ErrorCode.NOT_FOUND, "提交不存在")
    task = db.get(Task, submission.task_id)
    question = db.get(Question, submission.question_id)
    if task and question and (not ai_review_submission_scope_matches(submission, task, question) or not is_ai_review_enabled(task)):
        raise AppError(ErrorCode.NOT_FOUND, "AI 预审提交不存在")
    if not task or not question:
        raise AppError(ErrorCode.NOT_FOUND, "提交关联任务或题目不存在")
    if not can_access_ai_review_task(db, current, task):
        raise AppError(ErrorCode.PERMISSION_DENIED, "无权限触发该 AI 预审")
    return ensure_ai_review_job(db, task=task, question=question, submission=submission, operator_id=current.user_id, request=request)


def retry_ai_review_job(db: MongoDatabase, *, job_id: str, current: CurrentUser, request: Request | None = None) -> dict:
    require_ai_review_team_scope(current)
    job = db.get(AiReviewJob, job_id)
    if not job or not can_access_ai_review_job(db, current, job):
        raise AppError(ErrorCode.NOT_FOUND, "AI 预审任务不存在")
    if job.status not in {"failed", "completed"}:
        raise AppError(ErrorCode.STATE_CONFLICT, "只有失败或已完成的 AI 预审任务可以重新入队")
    task, _question, submission = require_current_ai_review_job_submission(db, job)
    now = now_utc().replace(tzinfo=None)
    old_status = job.status
    job.status = "pending"
    job.error = None
    job.updated_at = now
    db.save(job)
    write_audit_log(
        db,
        entity_type="ai_review",
        entity_id=job.id,
        action="ai_review_job_requeued",
        operator_id=current.user_id,
        team_id=job.team_id,
        changes={"from": old_status, "to": job.status, "task_id": task.id, "submission_id": submission.id},
        request=request,
    )
    db.commit()
    return ai_review_job_payload(job)


def batch_trigger_ai_review(db: MongoDatabase, *, submission_ids: list[str], current: CurrentUser, request: Request | None = None) -> dict:
    require_ai_review_team_scope(current)
    results = []
    success_count = 0
    failed_count = 0
    for submission_id in submission_ids:
        try:
            job = trigger_ai_review(db, submission_id=submission_id, current=current, request=request)
            results.append({"submission_id": submission_id, "status": "success", "job": job})
            success_count += 1
        except AppError as exc:
            results.append({"submission_id": submission_id, "status": "failed", "code": exc.code, "message": exc.message})
            failed_count += 1
    write_audit_log(
        db,
        entity_type="ai_review",
        entity_id=current.team_id or "batch",
        action="ai_review_batch_triggered",
        operator_id=current.user_id,
        team_id=current.team_id,
        changes={
            "total": len(submission_ids),
            "success_count": success_count,
            "failed_count": failed_count,
            "submission_ids": submission_ids[:20],
        },
        request=request,
    )
    db.commit()
    return {"total": len(submission_ids), "success_count": success_count, "failed_count": failed_count, "results": results}


def ensure_ai_review_job(
    db: MongoDatabase,
    *,
    task: Task,
    question: Question,
    submission: Submission,
    operator_id: str | None,
    request: Request | None = None,
) -> dict:
    if not ai_review_submission_scope_matches(submission, task, question) or not is_ai_review_enabled(task):
        raise AppError(ErrorCode.NOT_FOUND, "AI 预审提交不存在")
    if submission.status != "submitted":
        raise AppError(ErrorCode.STATE_CONFLICT, "AI 预审只能为已提交答案创建任务")
    now = now_utc().replace(tzinfo=None)
    idempotency_key = ai_review_idempotency_key(submission.id, submission.current_round)
    existing = db.find_one(AiReviewJob, {"idempotency_key": idempotency_key})
    if existing:
        return ai_review_job_payload(existing)
    job = AiReviewJob(
        team_id=task.team_id,
        task_id=task.id,
        submission_id=submission.id,
        question_id=question.id,
        labeler_id=submission.labeler_id,
        prompt=task.ai_config.get("prompt"),
        dimensions=task.ai_config.get("dimensions") or [],
        status="pending",
        idempotency_key=idempotency_key,
        created_at=now,
        updated_at=now,
    )
    db.add(job)
    write_audit_log(
        db,
        entity_type="ai_review",
        entity_id=job.id,
        action="ai_review_job_created",
        operator_id=operator_id,
        team_id=task.team_id,
        changes={"task_id": task.id, "question_id": question.id, "submission_id": submission.id, "status": job.status},
        request=request,
    )
    db.commit()
    return ai_review_job_payload(job)


def maybe_enqueue_ai_review_for_submission(db: MongoDatabase, *, task: Task, question: Question, submission: Submission, request: Request | None = None) -> dict | None:
    if not is_ai_review_enabled(task):
        return None
    return ensure_ai_review_job(db, task=task, question=question, submission=submission, operator_id=None, request=request)


def is_ai_review_enabled(task: Task) -> bool:
    return bool((getattr(task, "ai_config", {}) or {}).get("enabled"))


def is_ai_review_visible_task(task: Task) -> bool:
    return is_ai_review_enabled(task) and task.status in AI_REVIEW_VISIBLE_TASK_STATUSES


def ai_review_submission_scope_matches(submission: Submission, task: Task, question: Question) -> bool:
    return (
        submission.team_id == task.team_id
        and question.team_id == task.team_id
        and submission.task_id == task.id
        and question.task_id == task.id
        and submission.question_id == question.id
    )


def is_ai_review_visible_submission(submission: Submission) -> bool:
    return submission.status in AI_REVIEW_VISIBLE_SUBMISSION_STATUSES


def ai_review_job_task_enabled(db: MongoDatabase, job: AiReviewJob) -> bool:
    task = db.get(Task, job.task_id)
    return bool(task and is_ai_review_visible_task(task))


def can_access_ai_review_job(db: MongoDatabase, current: CurrentUser, job: AiReviewJob) -> bool:
    task = db.get(Task, job.task_id)
    return bool(task and can_access_ai_review_task(db, current, task))


def can_access_ai_review_task(db: MongoDatabase, current: CurrentUser, task: Task) -> bool:
    if not current.team_id or task.team_id != current.team_id:
        return False
    if current.team_role in {TeamRole.TEAM_ADMIN.value, TeamRole.OWNER.value}:
        return True
    if current.team_role == TeamRole.REVIEWER.value:
        if current.user_id in set(task.reviewer_ids or []):
            return True
        member = db.find_one(TeamMember, {"team_id": task.team_id, "user_id": current.user_id, "status": "active"})
        return bool(member and task.id in set(member.assigned_review_tasks or []))
    if current.team_role == TeamRole.AGENT.value and "submission:view" in current.permissions:
        return True
    return "task:manage" in current.permissions or "submission:view" in current.permissions


def process_next_ai_review_job(db: MongoDatabase, *, request: Request | None = None) -> dict | None:
    jobs = db.find(AiReviewJob, {"status": "pending"}, sort=[("created_at", 1)])
    if not jobs:
        return None
    return process_ai_review_job(db, job_id=jobs[0].id, request=request)


def process_ai_review_job(db: MongoDatabase, *, job_id: str, request: Request | None = None) -> dict:
    job = db.get(AiReviewJob, job_id)
    if not job:
        raise AppError(ErrorCode.NOT_FOUND, "AI 预审任务不存在")
    if job.status not in {"pending", "failed"}:
        raise AppError(ErrorCode.STATE_CONFLICT, "当前 AI 预审任务状态不允许执行")
    task, question, submission = require_current_ai_review_job_submission(db, job)

    AI_REVIEW_EXECUTION_SEMAPHORE.acquire()
    try:
        return _process_ai_review_job_locked(db, job=job, task=task, question=question, submission=submission, request=request)
    finally:
        AI_REVIEW_EXECUTION_SEMAPHORE.release()


def _process_ai_review_job_locked(
    db: MongoDatabase,
    *,
    job: AiReviewJob,
    task: Task,
    question: Question,
    submission: Submission,
    request: Request | None = None,
) -> dict:
    now = now_utc().replace(tzinfo=None)
    job.status = "processing"
    job.error = None
    job.updated_at = now
    db.save(job)
    db.commit()

    generated: dict = {}
    try:
        if not is_ai_review_enabled(task):
            raise AppError(ErrorCode.BUSINESS_RULE, "当前任务未启用 AI 预审", {"task_id": task.id})
        provider_id = str(task.ai_config.get("provider_id") or "").strip()
        if not provider_id:
            raise AppError(ErrorCode.BUSINESS_RULE, "当前任务未配置 AI 预审 Provider", {"task_id": task.id})
        prompt = build_ai_review_execution_prompt(task, question, submission, job)
        prompt = f"{prompt}\nStructured output JSON schema:\n{json.dumps(AI_REVIEW_RESULT_SCHEMA, ensure_ascii=False)}"
        messages = build_ai_review_execution_messages(db, task, question, submission, prompt)
        generated = run_platform_provider_messages_generation(
            db,
            team_id=task.team_id,
            messages=messages,
            provider_id=provider_id,
            model=task.ai_config.get("model"),
            operation_type="ai_review_execute",
            operator_id=job.labeler_id or task.owner_id or "system",
            request=request,
            task_id=task.id,
            source_id=job.id,
            max_tokens=4096,
        )
        result = normalize_ai_review_result(generated.get("content") or "")
        result.update({key: generated.get(key) for key in ("provider_id", "model", "request_id", "latency_ms", "tokens", "cost") if generated.get(key) is not None})
        job.status = "completed"
        job.result = result
        job.error = None
    except Exception as exc:
        job.status = "failed"
        job.error = ai_review_error_message(exc)
        job.retry_count += 1
    job.updated_at = now_utc().replace(tzinfo=None)
    db.save(job)
    released_to_review = release_ai_review_submission_for_manual_review(db, job=job, submission=submission, request=request)
    review_result = job.result if isinstance(job.result, dict) else {}
    write_audit_log(
        db,
        entity_type="ai_review",
        entity_id=job.id,
        action="ai_review_job_processed",
        operator_id=None,
        team_id=job.team_id,
        changes={
            "agent_actor": "MarkUp Agent",
            "task_id": job.task_id,
            "question_id": job.question_id,
            "submission_id": job.submission_id,
            "status": job.status,
            "retry_count": job.retry_count,
            "released_to_review": released_to_review,
            "ai_suggestion": ai_review_suggestion(job),
            "total_score": review_result.get("total_score"),
            "risk_flags": review_result.get("risk_flags") or [],
            "provider_id": generated.get("provider_id") or review_result.get("provider_id"),
            "model": generated.get("model") or review_result.get("model"),
            "request_id": generated.get("request_id") or review_result.get("request_id"),
            "tokens": generated.get("tokens") or review_result.get("tokens"),
            "cost": generated.get("cost") or review_result.get("cost"),
            "error": job.error,
        },
        request=request,
    )
    if job.status == "failed":
        notify_ai_review_job_processed(db, task=task, job=job, released_to_review=released_to_review, request=request)
    db.commit()
    return ai_review_job_payload(job)


def process_ai_review_job_background(job_id: str, request: Request | None = None) -> None:
    db = get_database()
    try:
        process_ai_review_job(db, job_id=job_id, request=request)
    except AppError:
        return


def release_ai_review_submission_for_manual_review(
    db: MongoDatabase,
    *,
    job: AiReviewJob,
    submission: Submission,
    request: Request | None = None,
) -> bool:
    if submission.status != "submitted" or submission.task_submitted_at:
        return False
    now = now_utc().replace(tzinfo=None)
    submission.task_submitted_at = now
    submission.updated_at = now
    db.save(submission)
    write_audit_log(
        db,
        entity_type="submission",
        entity_id=submission.id,
        action="ai_review_submission_released_to_review",
        operator_id=None,
        team_id=submission.team_id,
        changes={
            "agent_actor": "MarkUp Agent",
            "job_id": job.id,
            "task_id": submission.task_id,
            "question_id": submission.question_id,
            "ai_status": job.status,
            "ai_suggestion": ai_review_suggestion(job),
        },
        request=request,
    )
    return True


def require_current_ai_review_job_submission(db: MongoDatabase, job: AiReviewJob) -> tuple[Task, Question, Submission]:
    task = db.get(Task, job.task_id)
    question = db.get(Question, job.question_id)
    submission = db.get(Submission, job.submission_id)
    if not task or not question or not submission:
        raise AppError(ErrorCode.NOT_FOUND, "AI 预审任务数据不存在")
    if not is_ai_review_enabled(task):
        raise AppError(ErrorCode.NOT_FOUND, "AI 预审任务不存在")
    if not ai_review_job_scope_matches(job, task, question, submission):
        raise AppError(ErrorCode.NOT_FOUND, "AI 预审任务不存在")
    if submission.status != "submitted":
        raise AppError(ErrorCode.STATE_CONFLICT, "AI 预审任务只能处理已提交答案")
    expected_key = ai_review_idempotency_key(submission.id, submission.current_round)
    if job.idempotency_key != expected_key:
        raise AppError(ErrorCode.STATE_CONFLICT, "AI 预审任务轮次已过期")
    return task, question, submission


def ai_review_job_scope_matches(job: AiReviewJob, task: Task, question: Question, submission: Submission) -> bool:
    return (
        job.team_id == task.team_id
        and job.task_id == task.id
        and job.question_id == question.id
        and job.submission_id == submission.id
        and ai_review_submission_scope_matches(submission, task, question)
    )


def should_process_ai_review_job_payload(job: dict | None) -> bool:
    return bool(job and job.get("job_id") and job.get("status") in {"pending", "failed"})


def ai_review_idempotency_key(submission_id: str, current_round: int | None = None) -> str:
    if current_round and current_round > 1:
        return f"submission:{submission_id}:round:{current_round}:ai-review"
    return f"submission:{submission_id}:ai-review"


def ai_review_job_payload(job: AiReviewJob) -> dict:
    return {
        "job_id": job.id,
        "team_id": job.team_id,
        "task_id": job.task_id,
        "submission_id": job.submission_id,
        "question_id": job.question_id,
        "labeler_id": job.labeler_id,
        "prompt": job.prompt,
        "dimensions": job.dimensions,
        "status": job.status,
        "retry_count": job.retry_count,
        "result": job.result,
        "error": job.error,
        "idempotency_key": job.idempotency_key,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "updated_at": job.updated_at.isoformat() if job.updated_at else None,
    }


def ai_review_summary(jobs: list[AiReviewJob]) -> dict:
    by_status: dict[str, int] = {}
    for job in jobs:
        by_status[job.status] = by_status.get(job.status, 0) + 1
    return {
        "total": len(jobs),
        "by_status": by_status,
        "pending": by_status.get("pending", 0),
        "processing": by_status.get("processing", 0),
        "failed": by_status.get("failed", 0),
        "concurrency": ai_review_concurrency_payload(jobs),
    }


def ai_review_task_overview_payload(task: Task, *, jobs: list[AiReviewJob], submissions: list[Submission], questions: list[Question], provider: AiProviderConfig | None = None) -> dict:
    status_counts = status_count(jobs)
    suggestion_counts = suggestion_count(jobs)
    ai_config = getattr(task, "ai_config", {}) or {}
    submitted_count = len([item for item in submissions if item.status in {"submitted", "approved", "rejected"}])
    total_questions = len(questions) or int((task.stats or {}).get("total") or 0)
    job_count = len(jobs)
    latest_job = max(jobs, key=lambda item: item.updated_at or item.created_at, default=None)
    last_activity = latest_job.updated_at if latest_job else (task.updated_at or task.created_at)
    provider_name = (
        getattr(provider, "route_name", None)
        or ai_config.get("provider_name")
        or ai_config.get("route_name")
        or ai_config.get("provider_id")
    )
    return {
        "task_id": task.id,
        "team_id": task.team_id,
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "owner_id": task.owner_id,
        "ai_enabled": bool(ai_config.get("enabled")),
        "provider_id": ai_config.get("provider_id"),
        "provider_name": provider_name,
        "model": ai_config.get("model"),
        "total_questions": total_questions,
        "submission_total": len(submissions),
        "submitted_count": submitted_count,
        "job_total": job_count,
        "coverage_rate": round(job_count / submitted_count, 4) if submitted_count else 0,
        "status_counts": status_counts,
        "suggestion_counts": suggestion_counts,
        "pending_count": status_counts.get("pending", 0),
        "processing_count": status_counts.get("processing", 0),
        "completed_count": status_counts.get("completed", 0),
        "failed_count": status_counts.get("failed", 0),
        "manual_count": suggestion_counts.get("manual", 0),
        "last_activity_at": last_activity.isoformat() if last_activity else None,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
    }


def ai_review_submission_payload(submission: Submission, question: Question | None, job: AiReviewJob | None) -> dict:
    suggestion = ai_review_suggestion(job) if job else None
    return {
        "submission_id": submission.id,
        "task_id": submission.task_id,
        "question_id": submission.question_id,
        "labeler_id": submission.labeler_id,
        "submission_status": submission.status,
        "question_status": question.status if question else None,
        "ai_job": ai_review_job_payload(job) if job else None,
        "ai_status": job.status if job else "not_created",
        "ai_suggestion": suggestion,
        "ai_score": ai_review_score(job),
        "ai_reason": ai_review_reason(job),
        "error": job.error if job else None,
        "retry_count": job.retry_count if job else 0,
        "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else None,
        "updated_at": (job.updated_at if job else submission.updated_at).isoformat() if (job.updated_at if job else submission.updated_at) else None,
    }


def ai_review_task_overview_summary(items: list[dict]) -> dict:
    status_counts: dict[str, int] = {}
    suggestion_counts: dict[str, int] = {}
    for item in items:
        merge_counts(status_counts, item.get("status_counts") or {})
        merge_counts(suggestion_counts, item.get("suggestion_counts") or {})
    return {
        "task_total": len(items),
        "ai_enabled": len([item for item in items if item.get("ai_enabled")]),
        "job_total": sum(int(item.get("job_total") or 0) for item in items),
        "pending": status_counts.get("pending", 0),
        "processing": status_counts.get("processing", 0),
        "completed": status_counts.get("completed", 0),
        "failed": status_counts.get("failed", 0),
        "manual": suggestion_counts.get("manual", 0),
        "status_counts": status_counts,
        "suggestion_counts": suggestion_counts,
        "concurrency": ai_review_concurrency_payload_from_counts(status_counts),
    }


def ai_review_submission_summary(rows: list[dict], jobs: list[AiReviewJob]) -> dict:
    return {
        "submission_total": len(rows),
        "job_total": len(jobs),
        "status_counts": status_count(jobs),
        "suggestion_counts": suggestion_count(jobs),
        "concurrency": ai_review_concurrency_payload(jobs),
    }


def ai_review_concurrency_payload(jobs: list[AiReviewJob]) -> dict:
    return ai_review_concurrency_payload_from_counts(status_count(jobs))


def ai_review_concurrency_payload_from_counts(status_counts: dict) -> dict:
    processing = int(status_counts.get("processing") or 0)
    return {
        "limit": AI_REVIEW_CONCURRENCY_LIMIT,
        "processing": processing,
        "available": max(AI_REVIEW_CONCURRENCY_LIMIT - processing, 0),
        "queued": int(status_counts.get("pending") or 0),
    }


def latest_ai_job_by_submission(jobs: list[AiReviewJob]) -> dict[str, AiReviewJob]:
    result: dict[str, AiReviewJob] = {}
    for job in jobs:
        existing = result.get(job.submission_id)
        if not existing or (job.updated_at or job.created_at) > (existing.updated_at or existing.created_at):
            result[job.submission_id] = job
    return result


def status_count(jobs: list[AiReviewJob]) -> dict[str, int]:
    counts = {status: 0 for status in AI_REVIEW_STATUSES}
    for job in jobs:
        counts[job.status] = counts.get(job.status, 0) + 1
    return counts


def suggestion_count(jobs: list[AiReviewJob]) -> dict[str, int]:
    counts = {suggestion: 0 for suggestion in AI_REVIEW_SUGGESTIONS}
    for job in jobs:
        suggestion = ai_review_suggestion(job)
        if suggestion:
            counts[suggestion] = counts.get(suggestion, 0) + 1
    return counts


def ai_review_suggestion(job: AiReviewJob | None) -> str | None:
    if not job or not job.result:
        return None
    raw = str(
        job.result.get("ai_suggestion")
        or job.result.get("suggestion")
        or job.result.get("decision")
        or job.result.get("recommendation")
        or job.result.get("review_result")
        or ""
    ).lower()
    if any(token in raw for token in ["pass", "approve", "approved", "accept", "accepted", "通过", "建议通过"]):
        return "pass"
    if any(token in raw for token in ["reject", "rejected", "revise", "fail", "failed", "打回", "未通过", "建议未通过"]):
        return "reject"
    if raw:
        return "manual"
    return None


def ai_review_score(job: AiReviewJob | None) -> int | float | str | None:
    if not job or not job.result:
        return None
    return job.result.get("total_score") or job.result.get("score") or job.result.get("ai_score") or job.result.get("final_score")


def ai_review_reason(job: AiReviewJob | None) -> str | None:
    if not job or not job.result:
        return None
    value = job.result.get("reason") or job.result.get("comment") or job.result.get("summary")
    return str(value) if value is not None else None


def build_ai_review_execution_prompt(task: Task, question: Question, submission: Submission, job: AiReviewJob) -> str:
    ai_config = getattr(task, "ai_config", {}) or {}
    dimensions = job.dimensions or ai_config.get("review_matrix") or ai_config.get("dimensions") or []
    return "\n".join(
        [
            "你是 MarkUp 数据平台的 AI 预审 Agent。",
            "请只基于任务配置、题目数据、媒体内容和标注员答案做质量预审，输出合法 JSON，不要 Markdown、不要代码块、不要解释性前后缀。",
            'JSON 格式固定为：{"decision":"pass|reject|manual","total_score":0,"reason":"简短理由","dimension_scores":[{"dimension":"维度","score":0,"comment":"说明","reason":"该维度得分原因"}],"risk_flags":[]}',
            "decision 只能表达 AI 建议，不代表最终人工审核结论。",
            "dimension_scores 每个维度都必须给出非空 reason；reason 需要说明该维度为什么得到当前分数。",
            "如果题目包含图片、音频或视频，必须优先分析媒体本身；若当前 Provider 无法读取某项媒体，请在 reason 或 risk_flags 中明确说明对应媒体 source_id。",
            f"任务信息：{json.dumps(compact_ai_generation_payload({'title': task.title, 'description': task.description, 'ai_config': ai_config}), ensure_ascii=False)}",
            f"评分维度：{json.dumps(compact_ai_generation_payload(dimensions), ensure_ascii=False)}",
            f"题目数据：{json.dumps(compact_ai_generation_payload(question.content or {}), ensure_ascii=False)}",
            f"标注答案：{json.dumps(compact_ai_generation_payload(submission.answers or {}), ensure_ascii=False)}",
        ]
    )


def build_ai_review_execution_messages(db: MongoDatabase, task: Task, question: Question, submission: Submission, prompt: str) -> list[dict]:
    template_version = get_task_bound_template_version(db, task)
    schema = template_version.schema if template_version else {}
    media_assets = extract_question_media_assets(db, task.team_id, question.content or {}, schema)
    content_parts: list[dict] = [{"type": "text", "text": prompt}]
    for asset in media_assets:
        url = str(asset.get("url") or "")
        media_type = str(asset.get("type") or "")
        label = str(asset.get("label") or asset.get("source_id") or media_type or "媒体")
        if media_type == "image" and url:
            content_parts.append({"type": "image_url", "image_url": {"url": url}, "label": label})
        elif media_type == "audio" and url:
            content_parts.append({"type": "audio_url", "audio_url": {"url": url}, "label": label})
        elif media_type == "video" and url:
            content_parts.append({"type": "video_url", "video_url": {"url": url}, "label": label})
    if media_assets:
        content_parts.append({"type": "text", "text": f"媒体资源索引：{json.dumps(compact_ai_generation_payload(media_assets), ensure_ascii=False)}"})
    return [{"role": "user", "content": content_parts}]


def normalize_ai_review_result(content: str) -> dict:
    try:
        parsed = json.loads(strip_json_fence(content))
    except json.JSONDecodeError as exc:
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, "AI 返回的预审结果不是合法 JSON", {"raw": content[:1000]}) from exc
    if not isinstance(parsed, dict):
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, "AI 返回的预审结果结构不正确")
    raw_decision = parsed.get("decision") or parsed.get("ai_suggestion") or parsed.get("suggestion")
    if raw_decision is None:
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, "AI 预审结果缺少 decision")
    decision = str(raw_decision).lower()
    if decision in {"approved", "approve", "accept"}:
        decision = "pass"
    if decision in {"rejected", "revise", "fail", "failed"}:
        decision = "reject"
    if decision not in AI_REVIEW_SUGGESTIONS:
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, "AI 预审结果的 decision 不合法", {"decision": decision})
    if not isinstance(parsed.get("dimension_scores"), list):
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, "AI 预审结果的 dimension_scores 必须是数组")
    parsed["dimension_scores"] = normalize_ai_review_dimension_scores(parsed.get("dimension_scores"), str(parsed.get("reason") or ""))
    if not isinstance(parsed.get("risk_flags"), list):
        parsed["risk_flags"] = []
    if parsed.get("reason") is None:
        parsed["reason"] = ""
    parsed["decision"] = decision
    parsed["ai_suggestion"] = decision
    return parsed


def normalize_ai_review_dimension_scores(items: object, fallback_reason: str) -> list[dict]:
    if not isinstance(items, list):
        return []
    normalized: list[dict] = []
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        reason = item.get("reason") or item.get("comment") or item.get("explanation") or item.get("summary") or fallback_reason
        comment = item.get("comment") or item.get("reason") or reason
        normalized.append({
            **item,
            "dimension": str(item.get("dimension") or f"维度 {index + 1}"),
            "score": item.get("score", 0),
            "comment": str(comment or "未给出具体说明")[:1000],
            "reason": str(reason or "未给出具体原因")[:1000],
        })
    return normalized


def ai_review_error_message(exc: Exception) -> str:
    if isinstance(exc, AppError):
        return exc.message
    return str(exc)[:1000]


def ai_review_submission_matches_keyword(row: dict, keyword: str) -> bool:
    return any(keyword in str(row.get(key) or "").lower() for key in ["submission_id", "question_id", "labeler_id", "ai_reason", "error"])


def group_by(items: list, field: str) -> dict[str, list]:
    grouped: dict[str, list] = {}
    for item in items:
        key = getattr(item, field, None)
        if key is None:
            continue
        grouped.setdefault(key, []).append(item)
    return grouped


def merge_counts(target: dict[str, int], source: dict) -> None:
    for key, value in source.items():
        target[str(key)] = target.get(str(key), 0) + int(value or 0)


def pagination(total: int, page: int, page_size: int) -> dict:
    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }
