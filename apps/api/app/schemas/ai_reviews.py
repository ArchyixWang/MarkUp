from pydantic import BaseModel, Field


class BatchTriggerAiReviewRequest(BaseModel):
    submission_ids: list[str] = Field(min_length=1, max_length=100)
