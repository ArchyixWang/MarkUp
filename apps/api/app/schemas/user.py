from pydantic import BaseModel, Field


class UpdateUserRequest(BaseModel):
    role: str | None = Field(default=None, pattern="^(platform_admin|admin|user|labeler|reviewer)$")
    status: str | None = Field(default=None, pattern="^(active|disabled)$")
