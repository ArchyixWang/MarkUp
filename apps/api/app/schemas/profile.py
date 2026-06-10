from pydantic import BaseModel, Field


class UpdateMyProfileRequest(BaseModel):
    avatar: str | None = Field(default=None, max_length=500)
    display_name: str | None = Field(default=None, max_length=80)
    real_name: str | None = Field(default=None, max_length=80)
    gender: str | None = Field(default=None, max_length=32)
    birthday: str | None = Field(default=None, max_length=32)
    profession: str | None = Field(default=None, max_length=120)
    work_years: str | None = Field(default=None, max_length=80)
    bio: str | None = Field(default=None, max_length=1000)
    phone: str | None = Field(default=None, max_length=32)
    location: str | None = Field(default=None, max_length=120)
    education_summary: str | None = Field(default=None, max_length=255)
    education_school: str | None = Field(default=None, max_length=120)
    education_report_mode: str | None = Field(default=None, pattern="^(chsi|manual)$")
    education_report_documents: list[dict] | None = None
    expertise_tags: list[str] | None = None
    notification_settings: dict | None = None


class SubmitDomainCertificationRequest(BaseModel):
    domain: str = Field(min_length=2, max_length=64)
    industry: str | None = Field(default=None, max_length=64)
    evidence_type: str | None = Field(default=None, max_length=64)
    cert_name: str = Field(min_length=2, max_length=120)
    real_name: str = Field(min_length=2, max_length=80)
    title: str | None = Field(default=None, max_length=120)
    organization: str | None = Field(default=None, max_length=120)
    display_type: str | None = Field(default=None, pattern="^(detail|fuzzy)$")
    registration_number: str | None = Field(default=None, max_length=120)
    agreement_accepted: bool | None = None
    description: str | None = Field(default=None, max_length=1000)
    supplement_documents: list[dict] = Field(default_factory=list)
    documents: list[dict] = Field(default_factory=list, min_length=1)


class SubmitEducationCertificationRequest(BaseModel):
    real_name: str = Field(min_length=2, max_length=80)
    education_level: str = Field(pattern="^(associate|bachelor|master|doctor|other)$")
    school: str = Field(min_length=2, max_length=120)
    major: str | None = Field(default=None, max_length=120)
    graduation_year: int | None = Field(default=None, ge=1950, le=2100)
    degree: str | None = Field(default=None, max_length=80)
    documents: list[dict] = Field(min_length=1)


class ReviewCertificationRequest(BaseModel):
    decision: str = Field(pattern="^(approved|rejected)$")
    reviewer_notes: str | None = Field(default=None, max_length=1000)
    expires_at: str | None = None


class AddPointsRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=64)
    change: int
    reason: str = Field(min_length=1, max_length=120)
    source_type: str | None = Field(default=None, max_length=64)
    source_id: str | None = Field(default=None, max_length=64)


class PointsWithdrawRequest(BaseModel):
    amount: int = Field(gt=0, le=9_000_000_000_000_000)
    payout_method: str = Field(pattern="^(wechat|alipay|bank_transfer)$")
    account_name: str | None = Field(default=None, max_length=120)
    account_no: str = Field(min_length=1, max_length=120)
    bank_name: str | None = Field(default=None, max_length=120)
    note: str | None = Field(default=None, max_length=300)


class ReputationAppealRequest(BaseModel):
    ledger_id: str = Field(min_length=1, max_length=64)
    reason: str = Field(min_length=5, max_length=1000)
