from dataclasses import dataclass, field
from datetime import datetime

from app.models.base import MongoDocument, utcnow


@dataclass
class UploadedFile(MongoDocument):
    collection_name = "uploaded_files"
    team_id: str = ""
    owner_id: str = ""
    filename: str = ""
    content_type: str = "application/octet-stream"
    category: str = "document"
    size: int = 0
    storage: str = "filesystem"
    path: str = ""
    url: str = ""
    preview_status: str = ""
    preview_path: str = ""
    preview_content_type: str = ""
    preview_size: int = 0
    preview_error: str = ""
    preview_updated_at: datetime | None = None
    created_at: datetime = field(default_factory=utcnow)
