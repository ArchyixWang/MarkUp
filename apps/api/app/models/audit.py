from dataclasses import dataclass, field
from datetime import datetime

from app.models.base import MongoDocument, utcnow


@dataclass
class AuditLog(MongoDocument):
    collection_name = "audit_logs"
    team_id: str | None = None
    entity_type: str = ""
    entity_id: str = ""
    action: str = ""
    operator_id: str | None = None
    request_id: str | None = None
    changes: dict | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    created_at: datetime = field(default_factory=utcnow)
