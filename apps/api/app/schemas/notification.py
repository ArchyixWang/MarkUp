from pydantic import BaseModel, Field, field_validator


class NotificationCreateRequest(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    content: str = Field(min_length=1, max_length=4000)
    notification_type: str = Field(default="organization", pattern="^(system|team|task|review|export|points|security|organization)$")
    priority: str = Field(default="normal", pattern="^(normal|important|urgent)$")
    target_type: str = Field(default="team", pattern="^(team|role|member|task)$")
    target_roles: list[str] = Field(default_factory=list)
    target_user_ids: list[str] = Field(default_factory=list)
    related_entity_type: str | None = Field(default=None, max_length=60)
    related_entity_id: str | None = Field(default=None, max_length=64)
    action_url: str | None = Field(default=None, max_length=300)
    metadata: dict = Field(default_factory=dict)
    email_enabled: bool = False
    in_app_enabled: bool = True
    expire_at: str | None = Field(default=None, max_length=40)

    @field_validator("target_roles")
    @classmethod
    def validate_target_roles(cls, value: list[str]) -> list[str]:
        allowed = {"team_admin", "owner", "reviewer", "agent", "labeler"}
        invalid = [item for item in value if item not in allowed]
        if invalid:
            raise ValueError("分发角色无效")
        return value


class NotificationStateUpdate(BaseModel):
    status: str | None = Field(default=None, pattern="^(read|handled)$")
    action: str | None = Field(default=None, pattern="^(read|unread|handled|unhandled|star|unstar|delete)$")

    def resolved_action(self) -> str:
        return self.action or self.status or "read"


class NotificationBatchStateUpdate(BaseModel):
    notification_ids: list[str] = Field(min_length=1, max_length=100)
    action: str = Field(pattern="^(read|unread|handled|unhandled|star|unstar|delete)$")


class NotificationRevokeRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=400)
