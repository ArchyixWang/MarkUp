from pydantic import BaseModel, Field


class BudgetRequestCreate(BaseModel):
    amount: int = Field(gt=0, le=10_000_000)
    purpose: str = Field(min_length=1, max_length=80)
    related_task_id: str | None = Field(default=None, max_length=64)
    valid_until: str | None = Field(default=None, max_length=64)
    description: str = Field(min_length=1, max_length=500)


class BudgetRequestApprove(BaseModel):
    decision: str = Field(pattern="^(approved|rejected)$")
    approved_amount: int | None = Field(default=None, gt=0, le=10_000_000)
    comment: str | None = Field(default=None, max_length=500)


class BudgetLimitUpdate(BaseModel):
    total_limit: int = Field(ge=0, le=100_000_000)


class BudgetAlertUpdate(BaseModel):
    enabled: bool = True
    threshold: int = Field(default=80, ge=1, le=100)


class PointsBudgetRecharge(BaseModel):
    amount: int = Field(gt=0, le=9_000_000_000_000_000)
    payment_method: str = Field(pattern="^(wechat|alipay|bank_transfer)$")


class PointsBudgetWithdraw(BaseModel):
    amount: int = Field(gt=0, le=9_000_000_000_000_000)
    payout_method: str = Field(pattern="^(wechat|alipay|bank_transfer)$")
    account_name: str | None = Field(default=None, max_length=120)
    account_no: str = Field(min_length=1, max_length=120)
    bank_name: str | None = Field(default=None, max_length=120)
    note: str | None = Field(default=None, max_length=300)
    payment_password: str = Field(pattern="^\\d{6}$")


class PointsBudgetAlertUpdate(BaseModel):
    enabled: bool = True
    threshold: int = Field(default=1000, ge=1, le=9_000_000_000_000_000)


class AiWalletRechargeRequest(BaseModel):
    amount: float = Field(gt=0, le=9_000_000_000_000_000)
    payment_method: str = Field(pattern="^(wechat|alipay|bank_transfer)$")


class AiWalletTransferInRequest(BaseModel):
    amount: int = Field(gt=0, le=9_000_000_000_000_000)
    payment_password: str = Field(pattern="^\\d{6}$")


class TeamPointsPaymentPasswordStatus(BaseModel):
    is_set: bool
    updated_at: str | None = None
    updated_by: str | None = None


class TeamPointsPaymentPasswordSet(BaseModel):
    new_password: str = Field(pattern="^\\d{6}$")
    confirm_password: str = Field(pattern="^\\d{6}$")


class TeamPointsPaymentPasswordChange(BaseModel):
    current_password: str = Field(pattern="^\\d{6}$")
    new_password: str = Field(pattern="^\\d{6}$")
    confirm_password: str = Field(pattern="^\\d{6}$")


class TeamPointsPaymentPasswordReset(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    email_code: str = Field(min_length=6, max_length=8)
    new_password: str = Field(pattern="^\\d{6}$")
    confirm_password: str = Field(pattern="^\\d{6}$")


class AiProviderConfigCreate(BaseModel):
    route_name: str = Field(min_length=1, max_length=120)
    provider_kind: str = Field(min_length=1, max_length=80)
    protocol_profile: str | None = Field(default=None, min_length=1, max_length=80)
    scope: str = Field(default="team", pattern="^(team|platform)$")
    is_platform_default: bool = False
    team_id: str | None = Field(default=None, max_length=64)
    api_base: str | None = Field(default=None, max_length=255)
    api_key: str | None = Field(default=None, max_length=500)
    model_id: str = Field(min_length=1, max_length=120)
    capabilities: list[str] = Field(default_factory=list)
    transport_modes: list[str] = Field(default_factory=list)
    supports_streaming: bool | None = None
    capability_profile: dict = Field(default_factory=dict)
    runtime_config: dict = Field(default_factory=dict)
    pricing: dict
    status: str = Field(default="enabled", pattern="^(enabled|disabled|missing)$")
    remark: str | None = Field(default=None, max_length=500)


class AiProviderConfigUpdate(BaseModel):
    route_name: str | None = Field(default=None, min_length=1, max_length=120)
    provider_kind: str | None = Field(default=None, min_length=1, max_length=80)
    protocol_profile: str | None = Field(default=None, min_length=1, max_length=80)
    is_platform_default: bool | None = None
    api_base: str | None = Field(default=None, max_length=255)
    api_key: str | None = Field(default=None, max_length=500)
    model_id: str | None = Field(default=None, min_length=1, max_length=120)
    capabilities: list[str] | None = None
    transport_modes: list[str] | None = None
    supports_streaming: bool | None = None
    capability_profile: dict | None = None
    runtime_config: dict | None = None
    pricing: dict | None = None
    status: str | None = Field(default=None, pattern="^(enabled|disabled|missing)$")
    remark: str | None = Field(default=None, max_length=500)


class AiProviderConfigStatusUpdate(BaseModel):
    status: str = Field(pattern="^(enabled|disabled|missing)$")


class AiEstimateRequest(BaseModel):
    provider_id: str | None = Field(default=None, max_length=64)
    model: str | None = Field(default=None, max_length=120)
    prompt_chars: int = Field(default=0, ge=0, le=1_000_000)
    completion_chars: int = Field(default=0, ge=0, le=1_000_000)
    cache_hit_chars: int = Field(default=0, ge=0, le=1_000_000)


class AiProviderConfigTestRequest(BaseModel):
    message: str = Field(default="ping", max_length=500)


class AiProviderConfigDraftTestRequest(BaseModel):
    route_name: str = Field(min_length=1, max_length=120)
    provider_kind: str = Field(min_length=1, max_length=80)
    protocol_profile: str | None = Field(default=None, min_length=1, max_length=80)
    scope: str = Field(default="team", pattern="^(team|platform)$")
    team_id: str | None = Field(default=None, max_length=64)
    api_base: str | None = Field(default=None, max_length=255)
    api_key: str | None = Field(default=None, max_length=500)
    model_id: str = Field(min_length=1, max_length=120)
    capabilities: list[str] = Field(default_factory=list)
    transport_modes: list[str] = Field(default_factory=list)
    supports_streaming: bool | None = None
    capability_profile: dict = Field(default_factory=dict)
    runtime_config: dict = Field(default_factory=dict)
    message: str = Field(default="ping", max_length=500)
