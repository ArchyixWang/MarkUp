from dataclasses import dataclass, field
from datetime import datetime

from app.models.base import MongoDocument, utcnow


@dataclass
class AiReviewJob(MongoDocument):
    collection_name = "ai_review_jobs"
    team_id: str = ""
    task_id: str = ""
    submission_id: str = ""
    question_id: str = ""
    labeler_id: str = ""
    prompt: str | None = None
    dimensions: list[dict] = field(default_factory=list)
    status: str = "pending"
    retry_count: int = 0
    result: dict = field(default_factory=dict)
    error: str | None = None
    idempotency_key: str = ""
    created_at: datetime = field(default_factory=utcnow)
    updated_at: datetime = field(default_factory=utcnow)
