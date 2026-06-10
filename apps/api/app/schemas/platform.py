from pydantic import BaseModel, Field, field_validator


class PlatformPaymentReviewRequest(BaseModel):
    decision: str = Field(pattern="^(approved|rejected)$")
    comment: str | None = Field(default=None, max_length=1000)


class PlatformTeamVerificationReviewRequest(BaseModel):
    decision: str = Field(pattern="^(approved|rejected)$")
    comment: str | None = Field(default=None, max_length=1000)


class PlatformReputationAppealReviewRequest(BaseModel):
    decision: str = Field(pattern="^(approved|rejected)$")
    reviewer_notes: str | None = Field(default=None, max_length=1000)


class PlatformCommissionSettingUpdate(BaseModel):
    commission_rate_bps: int = Field(ge=0, le=10_000)


class PlatformAgentEmbeddingSettingUpdate(BaseModel):
    api_base: str | None = Field(default=None, max_length=500)
    api_key: str | None = Field(default=None, max_length=2000)
    model: str = Field(default="text-embedding-3-small", min_length=1, max_length=200)

    @field_validator("api_base", "api_key", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: object) -> object:
        if isinstance(value, str):
            normalized = value.strip()
            return normalized or None
        return value

    @field_validator("model")
    @classmethod
    def validate_model(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Embedding 模型不能为空")
        return normalized
