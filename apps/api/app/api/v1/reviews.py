from fastapi import APIRouter, Depends, Query, Request

from app.api.deps import CurrentUser, require_permissions
from app.core.database import MongoDatabase, get_db
from app.core.responses import success_response
from app.schemas.reviews import BatchReviewSubmissionRequest, ReviewSubmissionRequest
from app.services.reviews_service import (
    batch_submit_review_decision,
    get_review_submission_detail,
    list_review_queue,
    review_stats,
    review_submission_diff,
    review_submission_history,
    submit_review_decision,
)

router = APIRouter()


@router.get("/queue")
def review_queue(
    request: Request,
    task_id: str | None = Query(default=None),
    reviewer_id: str | None = Query(default=None),
    ai_suggestion: str | None = Query(default=None, pattern="^(pass|reject|manual)$"),
    status: str = Query(default="submitted", pattern="^(submitted|processed|all)$"),
    stage: str | None = Query(default=None, pattern="^(all_stages|initial_review|re_review|final_review)$"),
    keyword: str | None = Query(default=None),
    assigned_only: bool = Query(default=True),
    current: CurrentUser = Depends(require_permissions("submission:view")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = list_review_queue(
        db,
        current=current,
        task_id=task_id,
        reviewer_id=reviewer_id,
        assigned_only=assigned_only,
        ai_suggestion=ai_suggestion,
        status_filter=status,
        stage_filter=stage,
        keyword=keyword,
    )
    return success_response(data, "success", request)


@router.get("/stats")
def review_queue_stats(
    request: Request,
    assigned_only: bool = Query(default=True),
    current: CurrentUser = Depends(require_permissions("submission:view")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = review_stats(db, current=current, assigned_only=assigned_only)
    return success_response(data, "success", request)


@router.get("/submissions/{submission_id}")
def review_submission_detail(
    submission_id: str,
    request: Request,
    assigned_only: bool = Query(default=True),
    current: CurrentUser = Depends(require_permissions("submission:view")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = get_review_submission_detail(db, submission_id=submission_id, current=current, assigned_only=assigned_only)
    return success_response(data, "success", request)


@router.get("/submissions/{submission_id}/history")
def review_submission_history_endpoint(
    submission_id: str,
    request: Request,
    assigned_only: bool = Query(default=True),
    current: CurrentUser = Depends(require_permissions("submission:view")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = review_submission_history(db, submission_id=submission_id, current=current, assigned_only=assigned_only)
    return success_response(data, "success", request)


@router.get("/submissions/{submission_id}/diff")
def review_submission_diff_endpoint(
    submission_id: str,
    request: Request,
    assigned_only: bool = Query(default=True),
    current: CurrentUser = Depends(require_permissions("submission:view")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = review_submission_diff(db, submission_id=submission_id, current=current, assigned_only=assigned_only)
    return success_response(data, "success", request)


@router.post("/submissions/batch")
def review_submissions_batch(
    payload: BatchReviewSubmissionRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("review:submit")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = batch_submit_review_decision(db, current=current, payload=payload.model_dump(), request=request)
    return success_response(data, "batch review submitted", request)


@router.post("/submissions/{submission_id}")
def review_submission(
    submission_id: str,
    payload: ReviewSubmissionRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("review:submit")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = submit_review_decision(db, submission_id=submission_id, current=current, payload=payload.model_dump(), request=request)
    return success_response(data, "review submitted", request)
