import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.core.config import settings
from app.core.database import MongoDatabase, get_db
from app.schemas.platform_agent import PlatformAgentChatRequest
from app.services.platform_agent_service import is_rate_limited, platform_agent_events, platform_agent_status

router = APIRouter()


def _error_stream(message: str, code: int):
    yield f"event: error\ndata: {json.dumps({'message': message, 'code': code}, ensure_ascii=False)}\n\n"


@router.post("/chat/stream")
def chat_stream(payload: PlatformAgentChatRequest, request: Request, db: MongoDatabase = Depends(get_db)) -> StreamingResponse:
    client = request.client.host if request.client else "unknown"
    if not settings.platform_agent_enabled:
        return StreamingResponse(_error_stream("平台问答 AI 已停用", 503), media_type="text/event-stream", status_code=503)
    if is_rate_limited(client):
        return StreamingResponse(_error_stream("请求过于频繁，请稍后再试", 429), media_type="text/event-stream", status_code=429)
    return StreamingResponse(platform_agent_events(db, payload, request), media_type="text/event-stream")


@router.get("/status")
def get_status(db: MongoDatabase = Depends(get_db)) -> dict:
    return platform_agent_status(db)
