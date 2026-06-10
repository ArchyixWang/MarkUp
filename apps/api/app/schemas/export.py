from typing import Any

from pydantic import BaseModel, Field


class CreateExportRequest(BaseModel):
    task_id: str = Field(min_length=1, max_length=64)
    format: str = Field(default="jsonl", pattern="^(json|jsonl|csv|excel|xlsx)$")
    filters: dict[str, Any] = Field(default_factory=dict)
    fields_config: dict[str, Any] = Field(default_factory=dict)
    include_review_records: bool = False
