from dataclasses import dataclass, field
from datetime import datetime

from app.models.base import MongoDocument, utcnow


@dataclass
class Certification(MongoDocument):
    collection_name = "certifications"
    user_id: str = ""
    cert_category: str = ""
    cert_type: str = ""
    cert_name: str = ""
    status: str = "pending_review"
    provider: str | None = None
    submitted_data: dict = field(default_factory=dict)
    documents: list[dict] = field(default_factory=list)
    reviewer_notes: str | None = None
    verified_at: datetime | None = None
    expires_at: datetime | None = None
    created_at: datetime = field(default_factory=utcnow)
    updated_at: datetime = field(default_factory=utcnow)


@dataclass
class PointsWallet(MongoDocument):
    collection_name = "points_wallets"
    user_id: str = ""
    total_points: int = 0
    available_points: int = 0
    level: str = "bronze"
    updated_at: datetime = field(default_factory=utcnow)


@dataclass
class PointsLedger(MongoDocument):
    collection_name = "points_ledger"
    user_id: str = ""
    change: int = 0
    reason: str = ""
    source_type: str | None = None
    source_id: str | None = None
    balance_after: int = 0
    created_at: datetime = field(default_factory=utcnow)


@dataclass
class ReputationWallet(MongoDocument):
    collection_name = "reputation_wallets"
    user_id: str = ""
    score: int = 100
    last_recovered_at: datetime = field(default_factory=utcnow)
    updated_at: datetime = field(default_factory=utcnow)


@dataclass
class ReputationLedger(MongoDocument):
    collection_name = "reputation_ledger"
    user_id: str = ""
    change: int = 0
    reason: str = ""
    source_type: str | None = None
    source_id: str | None = None
    balance_after: int = 100
    metadata: dict = field(default_factory=dict)
    appeal_status: str | None = None
    created_at: datetime = field(default_factory=utcnow)


@dataclass
class ReputationAppeal(MongoDocument):
    collection_name = "reputation_appeals"
    user_id: str = ""
    ledger_id: str = ""
    reason: str = ""
    status: str = "pending"
    reviewer_id: str | None = None
    reviewer_notes: str | None = None
    created_at: datetime = field(default_factory=utcnow)
    updated_at: datetime = field(default_factory=utcnow)
