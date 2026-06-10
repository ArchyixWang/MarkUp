from fastapi import APIRouter, Depends, Request

from app.api.deps import CurrentUser, require_permissions
from app.api.v1.teams import ensure_team_scope
from app.core.database import MongoDatabase, get_db
from app.core.responses import success_response
from app.schemas.task_publish_assistant import TaskPublishAssistantChatRequest
from app.services.task_publish_assistant_service import chat_with_task_publish_assistant

router = APIRouter()


@router.post("/task-publish-assistant/chat")
def post_task_publish_assistant_chat(
    payload: TaskPublishAssistantChatRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("task:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, payload.workspace_id)
    data = chat_with_task_publish_assistant(
        db,
        team_id=payload.workspace_id,
        operator_id=current.user_id,
        payload=payload,
        request=request,
    )
    return success_response(data, "任务发布 AI 助手已生成变更方案", request)
