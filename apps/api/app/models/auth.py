from dataclasses import dataclass, field
from datetime import datetime

from app.models.base import MongoDocument, utcnow


@dataclass
class EmailVerification(MongoDocument):
    collection_name = "email_verifications"
    email: str = ""
    purpose: str = ""
    code_hash: str = ""
    attempts: int = 0
    consumed: bool = False
    expire_at: datetime = field(default_factory=utcnow)
    created_at: datetime = field(default_factory=utcnow)


@dataclass
class RefreshSession(MongoDocument):
    collection_name = "refresh_sessions"
    user_id: str = ""
    jti_hash: str = ""
    revoked: bool = False
    replaced_by_hash: str | None = None
    user_agent: str | None = None
    ip_address: str | None = None
    expire_at: datetime = field(default_factory=utcnow)
    created_at: datetime = field(default_factory=utcnow)


@dataclass
class OAuthState(MongoDocument):
    collection_name = "oauth_states"
    provider: str = ""
    intent: str = "login"
    state_hash: str = ""
    code_verifier: str | None = None
    redirect_after_login: str | None = None
    consumed: bool = False
    expire_at: datetime = field(default_factory=utcnow)
    created_at: datetime = field(default_factory=utcnow)


@dataclass
class OAuthIdentity(MongoDocument):
    collection_name = "oauth_identities"
    user_id: str = ""
    provider: str = ""
    provider_user_id: str = ""
    provider_username: str | None = None
    provider_email: str | None = None
    email_verified_by_provider: bool = False
    created_at: datetime = field(default_factory=utcnow)
    updated_at: datetime = field(default_factory=utcnow)
