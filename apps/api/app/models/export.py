from dataclasses import dataclass, field
from datetime import datetime

from app.models.base import MongoDocument, utcnow


@dataclass
class ExportJob(MongoDocument):
    collection_name = "export_jobs"
    team_id: str = ""
    task_id: str = ""
    created_by: str = ""
    export_format: str = "jsonl"
    filters: dict = field(default_factory=dict)
    fields_config: dict = field(default_factory=dict)
    include_review_records: bool = False
    status: str = "pending"
    progress: int = 0
    filename: str = ""
    media_type: str = "application/octet-stream"
    storage: str = "filesystem"
    path: str = ""
    file_size: int = 0
    error: str | None = None
    download_count: int = 0
    created_at: datetime = field(default_factory=utcnow)
    updated_at: datetime = field(default_factory=utcnow)
    completed_at: datetime | None = None
