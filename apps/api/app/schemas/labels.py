from typing import Any

from pydantic import BaseModel, Field


class ClaimTaskBundleRequest(BaseModel):
    bundle_size: int = Field(ge=1, le=100000)
    agreement_accepted: bool = False


class SaveQuestionDraftRequest(BaseModel):
    answers: dict[str, Any] = Field(default_factory=dict)


class SubmitQuestionRequest(BaseModel):
    answers: dict[str, Any] = Field(default_factory=dict)


class LabelingAiAssistRequest(BaseModel):
    prompt: str | None = Field(default=None, max_length=2000)
    component_id: str | None = Field(default=None, max_length=120)


class LabelingAiAssistPreviewRequest(BaseModel):
    template_schema: dict[str, Any] = Field(default_factory=dict, alias="schema")
    content: dict[str, Any] = Field(default_factory=dict)
    answers: dict[str, Any] = Field(default_factory=dict)
    prompt: str | None = Field(default=None, max_length=2000)
    component_id: str | None = Field(default=None, max_length=120)
