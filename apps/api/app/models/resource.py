from dataclasses import dataclass, field
from datetime import datetime
from app.models.base import MongoDocument, utcnow


@dataclass
class TeamBudget(MongoDocument):
    collection_name = "team_budgets"
    team_id: str = ""
    total_limit: int = 0
    used: int = 0
    alert_enabled: bool = False
    alert_threshold: int = 80
    updated_at: datetime = field(default_factory=utcnow)


@dataclass
class TeamPointsBudget(MongoDocument):
    collection_name = "team_points_budgets"
    team_id: str = ""
    total_points: int = 0
    current_balance: int = 0
    spent_points_total: int = 0
    alert_enabled: bool = False
    alert_threshold: int = 80
    payment_password_hash: str | None = None
    payment_password_updated_at: datetime | None = None
    payment_password_updated_by: str | None = None
    updated_at: datetime = field(default_factory=utcnow)


@dataclass
class TeamPointsWalletLedger(MongoDocument):
    collection_name = "team_points_wallet_ledger"
    team_id: str = ""
    transaction_type: str = "recharge"
    direction: str = "in"
    amount: int = 0
    balance_after: int = 0
    status: str = "completed"
    note: str = ""
    payment_method: str | None = None
    source_type: str | None = None
    source_id: str | None = None
    reference_no: str | None = None
    operator_id: str | None = None
    meta: dict = field(default_factory=dict)
    created_at: datetime = field(default_factory=utcnow)
    updated_at: datetime = field(default_factory=utcnow)


@dataclass
class TeamAiWallet(MongoDocument):
    collection_name = "team_ai_wallets"
    team_id: str = ""
    balance_points: float = 0.0
    updated_at: datetime = field(default_factory=utcnow)


@dataclass
class TeamAiWalletLedger(MongoDocument):
    collection_name = "team_ai_wallet_ledger"
    team_id: str = ""
    transaction_type: str = "recharge"
    direction: str = "credit"
    amount_points: float = 0.0
    balance_after: float = 0.0
    provider_id: str | None = None
    route_name: str | None = None
    source_type: str | None = None
    source_id: str | None = None
    request_id: str | None = None
    payment_method: str | None = None
    meta: dict = field(default_factory=dict)
    created_at: datetime = field(default_factory=utcnow)
    updated_at: datetime = field(default_factory=utcnow)


@dataclass
class BudgetRequest(MongoDocument):
    collection_name = "budget_requests"
    team_id: str = ""
    requester_id: str = ""
    amount: int = 0
    purpose: str = ""
    related_task_id: str | None = None
    valid_until: str | None = None
    description: str = ""
    status: str = "pending"
    approved_amount: int | None = None
    approver_id: str | None = None
    approval_comment: str | None = None
    created_at: datetime = field(default_factory=utcnow)
    updated_at: datetime = field(default_factory=utcnow)


@dataclass
class AiProviderConfig(MongoDocument):
    collection_name = "ai_provider_configs"
    team_id: str | None = None
    route_name: str = ""
    provider_kind: str = ""
    provider: str = ""
    scope: str = "team"
    is_platform_default: bool = False
    api_base: str | None = None
    encrypted_api_key: str | None = None
    api_key_configured: bool = False
    model_id: str = ""
    default_model: str = ""
    models: list[str] = field(default_factory=list)
    pricing: dict = field(default_factory=dict)
    capabilities: list[str] = field(default_factory=list)
    protocol_profile: str | None = None
    transport_modes: list[str] = field(default_factory=list)
    supports_streaming: bool | None = None
    capability_profile: dict = field(default_factory=dict)
    runtime_config: dict = field(default_factory=dict)
    status: str = "enabled"
    remark: str | None = None
    last_test_status: str | None = None
    last_test_at: datetime | None = None
    last_test_latency_ms: int | None = None
    last_test_error: str | None = None
    last_request_id: str | None = None
    created_by: str | None = None
    created_at: datetime = field(default_factory=utcnow)
    updated_at: datetime = field(default_factory=utcnow)


@dataclass
class AiCallLog(MongoDocument):
    collection_name = "ai_call_logs"
    team_id: str = ""
    task_id: str | None = None
    user_id: str | None = None
    provider_id: str | None = None
    route_name: str | None = None
    operation_type: str = "test_connection"
    provider: str = ""
    model: str = ""
    tokens: int = 0
    cost: float = 0.0
    billable: bool = False
    charged_points: float = 0.0
    source_type: str | None = None
    source_id: str | None = None
    latency_ms: int = 0
    status: str = "success"
    error: str | None = None
    request_id: str | None = None
    meta: dict = field(default_factory=dict)
    created_at: datetime = field(default_factory=utcnow)
