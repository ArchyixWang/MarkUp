from pydantic import BaseModel, Field


class PlatformAgentHistoryMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=4000)


class PlatformAgentChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    conversation_id: str | None = Field(default=None, max_length=80)
    history: list[PlatformAgentHistoryMessage] = Field(default_factory=list, max_length=12)
