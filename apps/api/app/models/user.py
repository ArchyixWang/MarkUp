from dataclasses import dataclass, field
from datetime import datetime

from app.models.base import MongoDocument, utcnow


@dataclass
class User(MongoDocument):
    collection_name = "users"
    username: str = ""
    email: str | None = None
    password_hash: str | None = None
    global_role: str = "labeler"
    status: str = "active"
    avatar: str | None = None
    email_verified: bool = False
    created_at: datetime = field(default_factory=utcnow)
    updated_at: datetime = field(default_factory=utcnow)


@dataclass
class UserProfile(MongoDocument):
    collection_name = "user_profiles"
    user_id: str = ""
    display_name: str | None = None
    real_name: str | None = None
    gender: str | None = None
    birthday: str | None = None
    profession: str | None = None
    work_years: str | None = None
    bio: str | None = None
    phone: str | None = None
    location: str | None = None
    education_summary: str | None = None
    education_school: str | None = None
    education_report_mode: str | None = None
    education_report_documents: list[dict] = field(default_factory=list)
    expertise_tags: list[str] = field(default_factory=list)
    notification_settings: dict = field(default_factory=dict)
    created_at: datetime = field(default_factory=utcnow)
    updated_at: datetime = field(default_factory=utcnow)
