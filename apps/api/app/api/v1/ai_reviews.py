from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request

from app.api.deps import CurrentUser, require_permissions
from app.core.database import MongoDatabase, get_db
from app.core.responses import success_response
from app.schemas.ai_reviews import BatchTriggerAiReviewRequest
from app.services.ai_reviews_service import (
    batch_trigger_ai_review,
    get_ai_review_job,
    get_ai_review_task_submissions,
    list_ai_review_jobs,
    list_ai_review_task_overviews,
    retry_ai_review_job,
    process_ai_review_job_background,
    should_process_ai_review_job_payload,
    trigger_ai_review,
)

router = APIRouter()


@router.get("/tasks")
def list_ai_review_tasks(
    request: Request,
    task_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
    current: CurrentUser = Depends(require_permissions("submission:view")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = list_ai_review_jobs(db, current=current, task_id=task_id, status=status)
    return success_response(data, "success", request)


@router.get("/task-overviews")
def list_ai_review_task_overview_items(
    request: Request,
    keyword: str | None = Query(default=None),
    task_status: str | None = Query(default=None),
    ai_status: str | None = Query(default=None),
    provider_id: str | None = Query(default=None),
    only_anomalies: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current: CurrentUser = Depends(require_permissions("submission:view")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = list_ai_review_task_overviews(
        db,
        current=current,
        keyword=keyword,
        task_status=task_status,
        ai_status=ai_status,
        provider_id=provider_id,
        only_anomalies=only_anomalies,
        page=page,
        page_size=page_size,
    )
    return success_response(data, "success", request)


@router.get("/task-overviews/{task_id}/submissions")
def list_ai_review_task_submission_items(
    task_id: str,
    request: Request,
    status: str | None = Query(default=None),
    suggestion: str | None = Query(default=None),
    keyword: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current: CurrentUser = Depends(require_permissions("submission:view")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = get_ai_review_task_submissions(
        db,
        task_id=task_id,
        current=current,
        status=status,
        suggestion=suggestion,
        keyword=keyword,
        page=page,
        page_size=page_size,
    )
    return success_response(data, "success", request)


@router.get("/tasks/{job_id}")
def get_ai_review_task(
    job_id: str,
    request: Request,
    current: CurrentUser = Depends(require_permissions("submission:view")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = get_ai_review_job(db, job_id=job_id, current=current)
    return success_response(data, "success", request)


@router.post("/tasks/{job_id}/retry")
def retry_ai_review_task(
    job_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    current: CurrentUser = Depends(require_permissions("submission:view")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = retry_ai_review_job(db, job_id=job_id, current=current, request=request)
    if should_process_ai_review_job_payload(data):
        background_tasks.add_task(process_ai_review_job_background, data["job_id"], request)
    return success_response(data, "ai review requeued", request)


@router.post("/submissions/{submission_id}/trigger")
def trigger_submission_ai_review(
    submission_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    current: CurrentUser = Depends(require_permissions("submission:view")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = trigger_ai_review(db, submission_id=submission_id, current=current, request=request)
    if should_process_ai_review_job_payload(data):
        background_tasks.add_task(process_ai_review_job_background, data["job_id"], request)
    return success_response(data, "ai review triggered", request)


@router.post("/batch-trigger")
def trigger_batch_ai_review(
    payload: BatchTriggerAiReviewRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    current: CurrentUser = Depends(require_permissions("submission:view")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = batch_trigger_ai_review(db, submission_ids=payload.submission_ids, current=current, request=request)
    for item in data.get("results", []):
        job = item.get("job") if isinstance(item, dict) else None
        if should_process_ai_review_job_payload(job):
            background_tasks.add_task(process_ai_review_job_background, job["job_id"], request)
    return success_response(data, "ai review batch triggered", request)
