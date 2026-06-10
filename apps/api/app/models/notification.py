from dataclasses import dataclass, field
from datetime import datetime

from app.models.base import MongoDocument, utcnow


@dataclass
class Notification(MongoDocument):
    collection_name = "notifications"
    team_id: str = ""
    title: str = ""
    content: str = ""
    notification_type: str = "team"
    priority: str = "normal"
    target_type: str = "team"
    target_roles: list[str] = field(default_factory=list)
    target_user_ids: list[str] = field(default_factory=list)
    related_entity_type: str | None = None
    related_entity_id: str | None = None
    event_key: str | None = None
    action_url: str | None = None
    metadata: dict = field(default_factory=dict)
    sender_id: str | None = None
    sender_name: str | None = None
    status: str = "unread"
    read_by: list[str] = field(default_factory=list)
    handled_by: list[str] = field(default_factory=list)
    starred_by: list[str] = field(default_factory=list)
    deleted_for: list[str] = field(default_factory=list)
    revoked_by: str | None = None
    revoked_at: datetime | None = None
    deleted_by: str | None = None
    deleted_at: datetime | None = None
    email_enabled: bool = False
    in_app_enabled: bool = True
    expire_at: datetime | None = None
    created_at: datetime = field(default_factory=utcnow)
    updated_at: datetime = field(default_factory=utcnow)
