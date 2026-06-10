from dataclasses import dataclass, field
from datetime import datetime

from app.models.base import MongoDocument, utcnow


@dataclass
class Team(MongoDocument):
    collection_name = "teams"
    company_name: str = ""
    industry: str | None = None
    contact_phone: str | None = None
    description: str | None = None
    logo_url: str | None = None
    website: str | None = None
    address: str | None = None
    owner_user_id: str | None = None
    status: str = "active"
    verification_status: str = "unverified"
    legal_name: str | None = None
    registration_number: str | None = None
    verification_contact: str | None = None
    verification_phone: str | None = None
    verification_materials: list[str] = field(default_factory=list)
    verification_review_comment: str | None = None
    verification_submitted_at: datetime | None = None
    billing_info: dict | None = None
    mailing_info: dict | None = None
    membership_plan: str = "free"
    membership_status: str = "active"
    membership_started_at: datetime | None = None
    membership_expires_at: datetime | None = None
    membership_next_plan: str | None = None
    membership_last_paid_at: datetime | None = None
    created_at: datetime = field(default_factory=utcnow)
    updated_at: datetime = field(default_factory=utcnow)


@dataclass
class TeamMember(MongoDocument):
    collection_name = "team_members"
    team_id: str = ""
    user_id: str = ""
    team_role: str = ""
    is_system_member: bool = False
    permissions: list[str] = field(default_factory=list)
    permissions_customized: bool = False
    assigned_review_tasks: list[str] = field(default_factory=list)
    status: str = "active"
    joined_at: datetime = field(default_factory=utcnow)


@dataclass
class TeamInvitation(MongoDocument):
    collection_name = "team_invitations"
    team_id: str = ""
    invite_mode: str | None = None
    email: str | None = None
    team_role: str = ""
    permissions: list[str] = field(default_factory=list)
    permissions_customized: bool = False
    assigned_review_tasks: list[str] = field(default_factory=list)
    invite_code_hash: str = ""
    message: str | None = None
    status: str = "pending"
    expire_at: datetime = field(default_factory=utcnow)
    responded_at: datetime | None = None
    revoked_by: str | None = None
    revoked_at: datetime | None = None
    created_by: str = ""
    created_at: datetime = field(default_factory=utcnow)
