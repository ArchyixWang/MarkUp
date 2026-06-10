from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class TaskPublishAssistantAttachment(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=255)
    url: str | None = Field(default=None, max_length=1000)
    type: str | None = Field(default=None, max_length=120)


class TaskPublishAssistantChange(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    type: Literal[
        "update_basic_info",
        "update_template_dataset",
        "update_field_mapping",
        "update_distribution",
        "update_reward",
        "update_ai_review",
        "update_human_review",
        "update_agreement",
        "fix_readiness_blocker",
        "update_publish_check",
    ]
    step: Literal[
        "basic_info",
        "template_dataset",
        "distribution_reward",
        "ai_review",
        "human_review",
        "agreement",
        "readiness_check",
    ]
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    before: Any = None
    after: Any = None
    riskLevel: Literal["low", "medium", "high"] = "low"
    dependencies: list[str] = Field(default_factory=list, max_length=12)
    selected: bool = True
    expanded: bool = False


class TaskPublishAssistantChatRequest(BaseModel):
    provider_id: str | None = Field(default=None, max_length=64)
    workspace_id: str = Field(min_length=1, max_length=64)
    team_id: str | None = Field(default=None, max_length=64)
    draft_task_id: str | None = Field(default=None, max_length=64)
    current_task_draft: dict[str, Any] = Field(default_factory=dict)
    message: str = Field(min_length=1, max_length=2000)
    attachments: list[TaskPublishAssistantAttachment] = Field(default_factory=list, max_length=10)
    conversation_id: str | None = Field(default=None, max_length=120)

    @field_validator("workspace_id")
    @classmethod
    def normalize_workspace_id(cls, value: str) -> str:
        return value.strip()


class TaskPublishAssistantProviderMeta(BaseModel):
    provider_id: str | None = None
    route_name: str | None = None
    model: str | None = None


class TaskPublishAssistantUsage(BaseModel):
    points: float | None = None
    tokens: int | None = None


class TaskPublishAssistantPreview(BaseModel):
    blockers: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    canPublish: bool = False


class TaskPublishAssistantCostPreview(BaseModel):
    labelerRewardPoints: float | None = None
    estimatedEnterpriseCost: float | None = None
    platformFee: float | None = None
    rowCount: int | None = None


class TaskPublishAssistantChatResponse(BaseModel):
    conversation_id: str
    message: str
    reasoning: str | None = None
    changes: list[TaskPublishAssistantChange] = Field(default_factory=list)
    usage: TaskPublishAssistantUsage | None = None
    suggestions: list[str] = Field(default_factory=list)
    readiness_preview: TaskPublishAssistantPreview | None = None
    cost_preview: TaskPublishAssistantCostPreview | None = None
    provider: TaskPublishAssistantProviderMeta | None = None
    fallback: Literal["mock", "provider_parse_failed"] | None = None
