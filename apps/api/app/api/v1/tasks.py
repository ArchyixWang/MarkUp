import json
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import Response

from app.api.deps import CurrentUser, get_current_user, require_permissions
from app.core.database import MongoDatabase, get_db
from app.core.errors import AppError, ErrorCode
from app.core.responses import success_response
from app.schemas.production import AiReviewInputGenerateRequest, AiReviewMatrixGenerateRequest, CopyTaskRequest, CreateTaskRequest, RequestTaskAssistanceRequest, TaskDifficultyEvaluateRequest, TaskQuestionBatchCreateRequest, TaskQuestionBatchDeleteRequest, TaskQuestionUpdateRequest, TransferTaskOwnerRequest, UpdateInternalLabelersRequest, UpdateTaskRequest, UpdateTaskStatusRequest
from app.services.production_service import (
    batch_create_task_questions,
    batch_delete_task_questions,
    change_task_status,
    copy_task,
    create_task,
    delete_task,
    delete_task_question,
    export_tasks,
    export_task_questions,
    evaluate_task_difficulty,
    generate_ai_review_input_prompt,
    generate_ai_review_matrix,
    get_assigned_task,
    get_task,
    get_task_question,
    get_task_readiness,
    get_task_stats,
    import_task_questions,
    list_task_questions,
    list_tasks,
    publish_task,
    transfer_task_owner,
    request_task_assistance,
    update_task_internal_labelers,
    update_task_question,
    update_task,
)

router = APIRouter()


def require_team_id(current: CurrentUser) -> str:
    if not current.team_id:
        raise AppError(ErrorCode.PERMISSION_DENIED, "缺少企业上下文")
    return current.team_id


@router.get("")
def list_task_route(
    request: Request,
    status: str | None = Query(default=None),
    keyword: str | None = Query(default=None),
    owner_id: str | None = Query(default=None),
    reviewer_id: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    category: str | None = Query(default=None),
    difficulty: str | None = Query(default=None),
    current: CurrentUser = Depends(require_permissions("task:read")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    return success_response(
        list_tasks(
            db,
            require_team_id(current),
            {
                "status": status,
                "keyword": keyword,
                "owner_id": owner_id,
                "reviewer_id": reviewer_id,
                "tag": tag,
                "category": category,
                "difficulty": difficulty,
            },
        ),
        "success",
        request,
    )


@router.get("/export")
def export_task_list_route(
    request: Request,
    format: str | None = Query(default="csv"),
    status: str | None = Query(default=None),
    keyword: str | None = Query(default=None),
    owner_id: str | None = Query(default=None),
    reviewer_id: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    category: str | None = Query(default=None),
    difficulty: str | None = Query(default=None),
    current: CurrentUser = Depends(require_permissions("task:read")),
    db: MongoDatabase = Depends(get_db),
) -> Response:
    filename, media_type, body = export_tasks(
        db,
        require_team_id(current),
        {
            "status": status,
            "keyword": keyword,
            "owner_id": owner_id,
            "reviewer_id": reviewer_id,
            "tag": tag,
            "category": category,
            "difficulty": difficulty,
        },
        format,
    )
    ascii_filename = filename.encode("ascii", "ignore").decode("ascii") or "tasks"
    return Response(content=body, media_type=media_type, headers={"Content-Disposition": f"attachment; filename=\"{ascii_filename}\"; filename*=UTF-8''{quote(filename)}"})


@router.post("")
def create_task_route(payload: CreateTaskRequest, request: Request, current: CurrentUser = Depends(require_permissions("task:create")), db: MongoDatabase = Depends(get_db)) -> dict:
    data = create_task(db, team_id=require_team_id(current), owner_id=current.user_id, payload=payload.model_dump(), request=request)
    return success_response(data, "任务草稿已创建", request)


@router.post("/ai-review/input/generate")
def generate_ai_review_input_route(payload: AiReviewInputGenerateRequest, request: Request, current: CurrentUser = Depends(require_permissions("task:manage")), db: MongoDatabase = Depends(get_db)) -> dict:
    data = generate_ai_review_input_prompt(db, team_id=require_team_id(current), operator_id=current.user_id, payload=payload.model_dump(), request=request)
    return success_response(data, "AI 字段说明已生成", request)


@router.post("/ai-review/matrix/generate")
def generate_ai_review_matrix_route(payload: AiReviewMatrixGenerateRequest, request: Request, current: CurrentUser = Depends(require_permissions("task:manage")), db: MongoDatabase = Depends(get_db)) -> dict:
    data = generate_ai_review_matrix(db, team_id=require_team_id(current), operator_id=current.user_id, payload=payload.model_dump(), request=request)
    return success_response(data, "AI 评分矩阵已生成", request)


@router.post("/difficulty/evaluate")
def evaluate_task_difficulty_route(payload: TaskDifficultyEvaluateRequest, request: Request, current: CurrentUser = Depends(require_permissions("task:manage")), db: MongoDatabase = Depends(get_db)) -> dict:
    data = evaluate_task_difficulty(db, team_id=require_team_id(current), operator_id=current.user_id, payload=payload.model_dump(), request=request)
    return success_response(data, "任务难度已评估", request)


@router.get("/assigned/{code}")
def get_assigned_task_route(code: str, request: Request, current: CurrentUser = Depends(get_current_user), db: MongoDatabase = Depends(get_db)) -> dict:
    return success_response(get_assigned_task(db, code, current.user_id), "success", request)


@router.get("/{task_id}")
def get_task_route(task_id: str, request: Request, current: CurrentUser = Depends(require_permissions("task:read")), db: MongoDatabase = Depends(get_db)) -> dict:
    return success_response(get_task(db, require_team_id(current), task_id), "success", request)


@router.get("/{task_id}/questions")
def list_task_questions_route(
    task_id: str,
    request: Request,
    status: str | None = Query(default=None),
    assigned_to: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current: CurrentUser = Depends(require_permissions("task:read")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = list_task_questions(db, require_team_id(current), task_id, status=status, assigned_to=assigned_to, page=page, page_size=page_size)
    return success_response(data, "success", request)


@router.post("/{task_id}/questions/batch")
def batch_create_task_questions_route(task_id: str, payload: TaskQuestionBatchCreateRequest, request: Request, current: CurrentUser = Depends(require_permissions("task:manage")), db: MongoDatabase = Depends(get_db)) -> dict:
    data = batch_create_task_questions(db, team_id=require_team_id(current), task_id=task_id, items=payload.items, operator_id=current.user_id, request=request)
    return success_response(data, "题目已批量创建", request)


@router.post("/{task_id}/questions/import")
async def import_task_questions_route(
    task_id: str,
    request: Request,
    file: UploadFile = File(...),
    column_mapping: str | None = Form(default=None),
    replace_existing: bool = Form(default=False),
    current: CurrentUser = Depends(require_permissions("task:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    mapping_payload = None
    if column_mapping:
        try:
            mapping_payload = json.loads(column_mapping)
        except json.JSONDecodeError as exc:
            raise AppError(ErrorCode.VALIDATION_FORMAT, "字段映射必须是合法 JSON") from exc
        if not isinstance(mapping_payload, dict):
            raise AppError(ErrorCode.VALIDATION_FORMAT, "字段映射必须是对象")
    data = import_task_questions(
        db,
        team_id=require_team_id(current),
        task_id=task_id,
        filename=file.filename or "questions.json",
        content=await file.read(),
        column_mapping=mapping_payload,
        replace_existing=replace_existing,
        operator_id=current.user_id,
        request=request,
    )
    return success_response(data, "题目导入成功", request)


@router.get("/{task_id}/questions/export")
def export_task_questions_route(task_id: str, format: str | None = None, current: CurrentUser = Depends(require_permissions("task:read")), db: MongoDatabase = Depends(get_db)) -> Response:
    filename, media_type, body = export_task_questions(db, require_team_id(current), task_id, format)
    ascii_filename = filename.encode("ascii", "ignore").decode("ascii") or "questions"
    return Response(content=body, media_type=media_type, headers={"Content-Disposition": f"attachment; filename=\"{ascii_filename}\"; filename*=UTF-8''{quote(filename)}"})


@router.get("/{task_id}/questions/{question_id}")
def get_task_question_route(task_id: str, question_id: str, request: Request, current: CurrentUser = Depends(require_permissions("task:read")), db: MongoDatabase = Depends(get_db)) -> dict:
    return success_response(get_task_question(db, require_team_id(current), task_id, question_id), "success", request)


@router.put("/{task_id}/questions/{question_id}")
def update_task_question_route(task_id: str, question_id: str, payload: TaskQuestionUpdateRequest, request: Request, current: CurrentUser = Depends(require_permissions("task:manage")), db: MongoDatabase = Depends(get_db)) -> dict:
    data = update_task_question(db, team_id=require_team_id(current), task_id=task_id, question_id=question_id, payload=payload.model_dump(exclude_unset=True), operator_id=current.user_id, request=request)
    return success_response(data, "题目已更新", request)


@router.delete("/{task_id}/questions/batch")
def batch_delete_task_questions_route(task_id: str, payload: TaskQuestionBatchDeleteRequest, request: Request, current: CurrentUser = Depends(require_permissions("task:manage")), db: MongoDatabase = Depends(get_db)) -> dict:
    data = batch_delete_task_questions(db, team_id=require_team_id(current), task_id=task_id, question_ids=payload.question_ids, operator_id=current.user_id, request=request)
    return success_response(data, "题目已批量删除", request)


@router.delete("/{task_id}/questions/{question_id}")
def delete_task_question_route(task_id: str, question_id: str, request: Request, current: CurrentUser = Depends(require_permissions("task:manage")), db: MongoDatabase = Depends(get_db)) -> dict:
    delete_task_question(db, team_id=require_team_id(current), task_id=task_id, question_id=question_id, operator_id=current.user_id, request=request)
    return success_response(None, "题目已删除", request)


@router.put("/{task_id}")
def update_task_route(task_id: str, payload: UpdateTaskRequest, request: Request, current: CurrentUser = Depends(require_permissions("task:manage")), db: MongoDatabase = Depends(get_db)) -> dict:
    data = update_task(db, team_id=require_team_id(current), task_id=task_id, payload=payload.model_dump(exclude_unset=True), operator_id=current.user_id, request=request)
    return success_response(data, "任务已更新", request)


@router.post("/{task_id}/publish")
def publish_task_route(task_id: str, request: Request, current: CurrentUser = Depends(require_permissions("task:manage")), db: MongoDatabase = Depends(get_db)) -> dict:
    data = publish_task(db, team_id=require_team_id(current), task_id=task_id, operator_id=current.user_id, operator_role=current.team_role or current.user.global_role, request=request)
    return success_response(data, "任务发布成功", request)


@router.post("/{task_id}/status")
def update_task_status_route(task_id: str, payload: UpdateTaskStatusRequest, request: Request, current: CurrentUser = Depends(require_permissions("task:manage")), db: MongoDatabase = Depends(get_db)) -> dict:
    data = change_task_status(db, team_id=require_team_id(current), task_id=task_id, action=payload.action, operator_id=current.user_id, operator_role=current.team_role or current.user.global_role, request=request)
    return success_response(data, "任务状态已更新", request)


@router.post("/{task_id}/owner-transfer")
def transfer_task_owner_route(task_id: str, payload: TransferTaskOwnerRequest, request: Request, current: CurrentUser = Depends(require_permissions("task:manage")), db: MongoDatabase = Depends(get_db)) -> dict:
    data = transfer_task_owner(
        db,
        team_id=require_team_id(current),
        task_id=task_id,
        target_owner_id=payload.target_owner_id,
        reason=payload.reason,
        operator_id=current.user_id,
        request=request,
    )
    return success_response(data, "任务负责人已转交", request)


@router.put("/{task_id}/internal-labelers")
def update_task_internal_labelers_route(task_id: str, payload: UpdateInternalLabelersRequest, request: Request, current: CurrentUser = Depends(require_permissions("task:manage")), db: MongoDatabase = Depends(get_db)) -> dict:
    data = update_task_internal_labelers(
        db,
        team_id=require_team_id(current),
        task_id=task_id,
        target_labeler_ids=payload.target_labeler_ids,
        target_labeler_allocations=[item.model_dump() for item in payload.target_labeler_allocations],
        operator_id=current.user_id,
        request=request,
    )
    return success_response(data, "企业内 Labeler 分配已更新", request)


@router.post("/{task_id}/request-assistance")
def request_task_assistance_route(task_id: str, payload: RequestTaskAssistanceRequest, request: Request, current: CurrentUser = Depends(require_permissions("submission:view")), db: MongoDatabase = Depends(get_db)) -> dict:
    data = request_task_assistance(
        db,
        team_id=require_team_id(current),
        task_id=task_id,
        target_reviewer_id=payload.target_reviewer_id,
        submission_ids=payload.submission_ids,
        reason=payload.reason,
        operator_id=current.user_id,
        operator_role=current.team_role or current.user.global_role,
        operator_permissions=current.permissions,
        request=request,
    )
    return success_response(data, "请求协助已提交", request)


@router.post("/{task_id}/copy")
def copy_task_route(task_id: str, payload: CopyTaskRequest, request: Request, current: CurrentUser = Depends(require_permissions("task:create")), db: MongoDatabase = Depends(get_db)) -> dict:
    data = copy_task(
        db,
        team_id=require_team_id(current),
        task_id=task_id,
        operator_id=current.user_id,
        title=payload.title,
        request=request,
    )
    return success_response(data, "任务副本已创建", request)


@router.delete("/{task_id}")
def delete_task_route(task_id: str, request: Request, current: CurrentUser = Depends(require_permissions("task:manage")), db: MongoDatabase = Depends(get_db)) -> dict:
    delete_task(db, team_id=require_team_id(current), task_id=task_id, operator_id=current.user_id, request=request)
    return success_response(None, "任务已删除", request)


@router.get("/{task_id}/stats")
def get_task_stats_route(task_id: str, request: Request, current: CurrentUser = Depends(require_permissions("task:read")), db: MongoDatabase = Depends(get_db)) -> dict:
    return success_response(get_task_stats(db, require_team_id(current), task_id), "success", request)


@router.get("/{task_id}/readiness")
def get_task_readiness_route(task_id: str, request: Request, current: CurrentUser = Depends(require_permissions("task:read")), db: MongoDatabase = Depends(get_db)) -> dict:
    return success_response(get_task_readiness(db, require_team_id(current), task_id), "success", request)
