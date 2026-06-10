from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.production import TemplateSchemaPayload


class TemplateAssistantAttachment(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=255)
    url: str | None = Field(default=None, max_length=1000)
    type: str | None = Field(default=None, max_length=120)


class TemplateAssistantPosition(BaseModel):
    type: Literal["append", "prepend", "before", "after"] = "append"
    fieldId: str | None = Field(default=None, max_length=120)
    tabId: str | None = Field(default=None, max_length=120)


class TemplateAssistantChange(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    type: Literal[
        "create_field",
        "delete_field",
        "update_field",
        "reorder_field",
        "update_options",
        "update_validation",
        "create_quality_rule",
    ]
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    targetFieldId: str | None = Field(default=None, max_length=120)
    targetFieldName: str | None = Field(default=None, max_length=120)
    position: TemplateAssistantPosition | None = None
    before: Any = None
    after: Any = None
    selected: bool = True
    expanded: bool = False


class TemplateAssistantChatRequest(BaseModel):
    provider_id: str | None = Field(default=None, max_length=64)
    workspace_id: str = Field(min_length=1, max_length=64)
    template_id: str | None = Field(default=None, max_length=64)
    template_name: str | None = Field(default=None, max_length=120)
    template_description: str | None = Field(default=None, max_length=1000)
    current_template: TemplateSchemaPayload
    reference_dataset: dict[str, Any] | None = None
    message: str = Field(min_length=1, max_length=2000)
    attachments: list[TemplateAssistantAttachment] = Field(default_factory=list, max_length=10)
    conversation_id: str | None = Field(default=None, max_length=120)

    @field_validator("workspace_id")
    @classmethod
    def normalize_workspace_id(cls, value: str) -> str:
        return value.strip()


class TemplateAssistantProviderMeta(BaseModel):
    provider_id: str | None = None
    route_name: str | None = None
    model: str | None = None


class TemplateAssistantUsage(BaseModel):
    points: float | None = None
    tokens: int | None = None


class TemplateAssistantChatResponse(BaseModel):
    conversation_id: str
    message: str
    reasoning: str | None = None
    changes: list[TemplateAssistantChange] = Field(default_factory=list)
    usage: TemplateAssistantUsage | None = None
    suggestions: list[str] = Field(default_factory=list)
    provider: TemplateAssistantProviderMeta | None = None
    fallback: Literal["mock", "provider_parse_failed"] | None = None
