from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request

from app.api.deps import CurrentUser, get_optional_current_user, require_permissions
from app.core.database import MongoDatabase, get_db
from app.core.responses import success_response
from app.schemas.labels import ClaimTaskBundleRequest, LabelingAiAssistPreviewRequest, LabelingAiAssistRequest, SaveQuestionDraftRequest, SubmitQuestionRequest
from app.services.labels_service import (
    abandon_labeling_question,
    check_task_qualification,
    claim_task_bundle,
    complete_labeling_task,
    generate_labeling_ai_assist,
    generate_labeling_ai_assist_preview,
    get_labeler_contributions,
    get_labeling_question,
    get_labeling_workbench,
    get_question_rejection_detail,
    list_labeler_tasks,
    list_public_tasks,
    save_question_draft,
    submit_question_answers,
)
from app.services.ai_reviews_service import process_ai_review_job_background, should_process_ai_review_job_payload

router = APIRouter()


@router.get("/tasks")
def list_tasks(
    request: Request,
    keyword: str | None = Query(default=None),
    category: str | None = Query(default=None),
    difficulty: str | None = Query(default=None),
    qualification_required: str | None = Query(default=None),
    status: str | None = Query(default=None),
    team_verified: bool | None = Query(default=None),
    tag: str | None = Query(default=None),
    unit_range: str | None = Query(default=None),
    deadline_range: str | None = Query(default=None),
    quick_filter: str | None = Query(default=None),
    team_scope: str | None = Query(default=None),
    sort: str = Query(default="recommended"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=6, ge=1, le=24),
    current: CurrentUser | None = Depends(get_optional_current_user),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = list_public_tasks(
        db,
        current_user=current,
        keyword=keyword,
        category=category,
        difficulty=difficulty,
        qualification_required=qualification_required,
        status=status,
        team_verified=team_verified,
        tag=tag,
        unit_range=unit_range,
        deadline_range=deadline_range,
        quick_filter=quick_filter,
        team_scope=team_scope,
        sort=sort,
        page=page,
        page_size=page_size,
    )
    return success_response(data, "success", request)


@router.post("/tasks/{task_id}/claim")
def claim_task(
    task_id: str,
    payload: ClaimTaskBundleRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("label:read")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = claim_task_bundle(db, task_id=task_id, user=current.user, current_user=current, bundle_size=payload.bundle_size, agreement_accepted=payload.agreement_accepted, request=request)
    return success_response(data, "task bundle claimed", request)


@router.get("/tasks/{task_id}/qualification-check")
def check_qualification(
    task_id: str,
    request: Request,
    current: CurrentUser = Depends(require_permissions("label:read")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = check_task_qualification(db, task_id=task_id, user=current.user, current_user=current)
    return success_response(data, "success", request)


@router.post("/tasks/{task_id}/complete")
def complete_task(
    task_id: str,
    request: Request,
    current: CurrentUser = Depends(require_permissions("submission:submit")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = complete_labeling_task(db, task_id=task_id, user_id=current.user_id, request=request)
    return success_response(data, "task submitted for review", request)


@router.get("/my-tasks")
def list_my_tasks(
    request: Request,
    current: CurrentUser = Depends(require_permissions("label:read")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = list_labeler_tasks(db, user_id=current.user_id)
    return success_response(data, "success", request)


@router.get("/workbench/{task_id}")
def get_workbench(
    task_id: str,
    request: Request,
    current: CurrentUser = Depends(require_permissions("label:read")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = get_labeling_workbench(db, task_id=task_id, user_id=current.user_id)
    return success_response(data, "success", request)


@router.get("/contributions")
def get_contributions(
    request: Request,
    current: CurrentUser = Depends(require_permissions("label:read")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = get_labeler_contributions(db, user_id=current.user_id)
    return success_response(data, "success", request)


@router.get("/questions/{question_id}")
def get_question(
    question_id: str,
    request: Request,
    current: CurrentUser = Depends(require_permissions("label:read")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = get_labeling_question(db, question_id=question_id, user_id=current.user_id)
    return success_response(data, "success", request)


@router.get("/questions/{question_id}/rejection")
def get_question_rejection(
    question_id: str,
    request: Request,
    current: CurrentUser = Depends(require_permissions("label:read")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = get_question_rejection_detail(db, question_id=question_id, user_id=current.user_id)
    return success_response(data, "success", request)


@router.post("/questions/{question_id}/llm-assist")
@router.post("/questions/{question_id}/ai-assist")
def run_question_ai_assist(
    question_id: str,
    payload: LabelingAiAssistRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("label:write")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = generate_labeling_ai_assist(db, question_id=question_id, user_id=current.user_id, request=request, custom_prompt=payload.prompt, component_id=payload.component_id)
    return success_response(data, "ai assist generated", request)


@router.post("/llm-assist/preview")
def run_preview_ai_assist(
    payload: LabelingAiAssistPreviewRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("task:read")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = generate_labeling_ai_assist_preview(
        db,
        team_id=current.team_id,
        user_id=current.user_id,
        schema=payload.template_schema,
        content=payload.content,
        answers=payload.answers,
        request=request,
        custom_prompt=payload.prompt,
        component_id=payload.component_id,
    )
    return success_response(data, "ai assist preview generated", request)


@router.put("/questions/{question_id}/draft")
def save_draft(
    question_id: str,
    payload: SaveQuestionDraftRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("label:write")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = save_question_draft(db, question_id=question_id, user_id=current.user_id, answers=payload.answers, request=request)
    return success_response(data, "draft saved", request)


@router.post("/questions/{question_id}/submit")
def submit_question(
    question_id: str,
    payload: SubmitQuestionRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    current: CurrentUser = Depends(require_permissions("submission:submit")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = submit_question_answers(db, question_id=question_id, user_id=current.user_id, answers=payload.answers, request=request)
    if should_process_ai_review_job_payload(data.get("ai_review_job")):
        background_tasks.add_task(process_ai_review_job_background, data["ai_review_job"]["job_id"], request)
    return success_response(data, "question submitted", request)


@router.post("/questions/{question_id}/abandon")
def abandon_question(
    question_id: str,
    request: Request,
    current: CurrentUser = Depends(require_permissions("label:write")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = abandon_labeling_question(db, question_id=question_id, user_id=current.user_id, request=request)
    return success_response(data, "question abandoned", request)
