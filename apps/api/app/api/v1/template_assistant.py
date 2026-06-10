from fastapi import APIRouter, Depends, Request

from app.api.deps import CurrentUser, require_permissions
from app.api.v1.teams import ensure_team_scope
from app.core.database import MongoDatabase, get_db
from app.core.responses import success_response
from app.schemas.template_assistant import TemplateAssistantChatRequest
from app.services.template_assistant_service import chat_with_template_assistant

router = APIRouter()


@router.post("/template-assistant/chat")
def post_template_assistant_chat(
    payload: TemplateAssistantChatRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("task:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, payload.workspace_id)
    data = chat_with_template_assistant(
        db,
        team_id=payload.workspace_id,
        operator_id=current.user_id,
        payload=payload,
        request=request,
    )
    return success_response(data, "模板 AI 助手已生成变更方案", request)
