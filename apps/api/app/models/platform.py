from dataclasses import dataclass, field
from datetime import datetime

from app.models.base import MongoDocument, utcnow


@dataclass
class PlatformSetting(MongoDocument):
    collection_name = "platform_settings"
    key: str = ""
    value: dict = field(default_factory=dict)
    updated_by: str | None = None
    created_at: datetime = field(default_factory=utcnow)
    updated_at: datetime = field(default_factory=utcnow)


@dataclass
class PlatformFinanceLedger(MongoDocument):
    collection_name = "platform_finance_ledger"
    transaction_type: str = "commission_income"
    source_type: str | None = None
    source_id: str | None = None
    team_id: str | None = None
    task_id: str | None = None
    labeler_id: str | None = None
    reward_points: int = 0
    commission_rate_bps: int = 1000
    amount_points: int = 0
    status: str = "completed"
    note: str | None = None
    meta: dict = field(default_factory=dict)
    operator_id: str | None = None
    created_at: datetime = field(default_factory=utcnow)
    updated_at: datetime = field(default_factory=utcnow)


@dataclass
class PlatformPaymentRequest(MongoDocument):
    collection_name = "platform_payment_requests"
    request_type: str = "team_withdraw"
    owner_type: str = "team"
    owner_id: str = ""
    owner_name: str | None = None
    amount_points: int = 0
    payout_method: str | None = None
    account_name: str | None = None
    account_no: str | None = None
    bank_name: str | None = None
    note: str | None = None
    status: str = "pending"
    reviewer_id: str | None = None
    review_comment: str | None = None
    reviewed_at: datetime | None = None
    source_type: str | None = None
    source_id: str | None = None
    created_by: str | None = None
    created_at: datetime = field(default_factory=utcnow)
    updated_at: datetime = field(default_factory=utcnow)
