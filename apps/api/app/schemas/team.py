from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.auth import (
    DISPLAY_NAME_MAX_LENGTH,
    USERNAME_MAX_LENGTH,
    USERNAME_MIN_LENGTH,
    validate_display_name_value,
    validate_password_strength,
    validate_username_value,
)
from app.schemas.resource import BudgetRequestApprove, BudgetRequestCreate


class AddMemberRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=64)
    team_role: str = Field(pattern="^(team_admin|owner|reviewer|labeler)$")
    permissions: list[str] | None = None
    assigned_review_tasks: list[str] = Field(default_factory=list)


class CreateTeamRequest(BaseModel):
    company_name: str = Field(min_length=2, max_length=120)
    industry: str | None = Field(default=None, max_length=80)
    contact_phone: str | None = Field(default=None, max_length=32)
    description: str | None = Field(default=None, max_length=1000)
    logo_url: str | None = Field(default=None, max_length=500)
    website: str | None = Field(default=None, max_length=255)
    address: str | None = Field(default=None, max_length=255)
    billing_info: "BillingInfoPayload | None" = None
    mailing_info: "MailingInfoPayload | None" = None


class BillingInfoPayload(BaseModel):
    invoice_type: str | None = Field(default=None, max_length=32)
    invoice_title: str | None = Field(default=None, max_length=120)
    tax_number: str | None = Field(default=None, max_length=64)
    invoice_address: str | None = Field(default=None, max_length=255)
    invoice_phone: str | None = Field(default=None, max_length=32)
    bank_name: str | None = Field(default=None, max_length=120)
    bank_account: str | None = Field(default=None, max_length=64)
    invoice_email: EmailStr | None = None
    invoice_remark: str | None = Field(default=None, max_length=500)


class MailingInfoPayload(BaseModel):
    recipient_name: str | None = Field(default=None, max_length=80)
    recipient_phone: str | None = Field(default=None, max_length=32)
    region: str | None = Field(default=None, max_length=120)
    detail_address: str | None = Field(default=None, max_length=255)
    postal_code: str | None = Field(default=None, max_length=20)
    address_alias: str | None = Field(default=None, max_length=80)
    is_default: bool | None = None


class UpdateTeamRequest(BaseModel):
    company_name: str | None = Field(default=None, min_length=2, max_length=120)
    industry: str | None = Field(default=None, max_length=80)
    contact_phone: str | None = Field(default=None, max_length=32)
    description: str | None = Field(default=None, max_length=1000)
    logo_url: str | None = Field(default=None, max_length=500)
    website: str | None = Field(default=None, max_length=255)
    address: str | None = Field(default=None, max_length=255)
    status: str | None = Field(default=None, pattern="^(active|disabled)$")
    billing_info: BillingInfoPayload | None = None
    mailing_info: MailingInfoPayload | None = None


class AgentSettingsUpdateRequest(BaseModel):
    display_name: str = Field(default="Agent", min_length=1, max_length=80)
    avatar: str = Field(min_length=1, max_length=500)
    preset_avatar_key: str | None = Field(default=None, max_length=64)


class SubmitTeamVerificationRequest(BaseModel):
    legal_name: str = Field(min_length=2, max_length=120)
    registration_number: str = Field(min_length=4, max_length=64)
    verification_contact: str = Field(min_length=2, max_length=80)
    verification_phone: str = Field(min_length=5, max_length=32)
    verification_materials: list[str] = Field(default_factory=list, max_length=10)

    @field_validator("verification_materials")
    @classmethod
    def validate_materials(cls, value: list[str]) -> list[str]:
        cleaned = [item.strip() for item in value if item and item.strip()]
        if not cleaned:
            raise ValueError("请至少提供一份认证材料 URL")
        if any(len(item) > 500 for item in cleaned):
            raise ValueError("认证材料 URL 不能超过 500 字")
        return cleaned


class CreateMemberAccountRequest(BaseModel):
    username: str = Field(min_length=USERNAME_MIN_LENGTH, max_length=USERNAME_MAX_LENGTH)
    display_name: str = Field(min_length=1, max_length=DISPLAY_NAME_MAX_LENGTH)
    email: EmailStr
    password: str = Field(min_length=8, max_length=64)
    team_role: str = Field(pattern="^(team_admin|owner|reviewer|labeler)$")
    permissions: list[str] | None = None
    assigned_review_tasks: list[str] = Field(default_factory=list)
    send_email: bool = False

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        return validate_username_value(value)

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, value: str) -> str:
        return validate_display_name_value(value)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return validate_password_strength(value)


class ImportMemberRow(BaseModel):
    email: EmailStr
    team_role: str = Field(pattern="^(team_admin|owner|reviewer|agent|labeler)$")
    username: str | None = None
    display_name: str | None = None
    password: str | None = Field(default=None, min_length=8, max_length=64)
    assigned_review_tasks: list[str] = Field(default_factory=list)

    @field_validator("password")
    @classmethod
    def validate_row_password(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        return validate_password_strength(value)


class ImportMembersRequest(BaseModel):
    rows: list[ImportMemberRow] = Field(min_length=1, max_length=100)
    default_password: str | None = Field(default=None, min_length=8, max_length=64)
    send_email: bool = False

    @field_validator("default_password")
    @classmethod
    def validate_default_password(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        return validate_password_strength(value)


class InviteMemberRequest(BaseModel):
    invite_mode: str = Field(default="email", pattern="^(email|code)$")
    email: EmailStr | None = None
    team_role: str = Field(pattern="^(team_admin|owner|reviewer|labeler)$")
    permissions: list[str] | None = None
    assigned_review_tasks: list[str] = Field(default_factory=list)
    message: str | None = Field(default=None, max_length=500)
    expire_hours: int = Field(default=72, ge=1, le=720)

    @field_validator("email")
    @classmethod
    def validate_email_for_mode(cls, value: EmailStr | None, info) -> EmailStr | None:
        invite_mode = info.data.get("invite_mode", "email")
        if invite_mode == "email" and value is None:
            raise ValueError("使用邮箱邀请时必须填写邮箱")
        return value


class RespondInvitationRequest(BaseModel):
    action: str = Field(pattern="^(accept|reject)$")
    message: str | None = Field(default=None, max_length=500)


class ResendInvitationRequest(BaseModel):
    message: str | None = Field(default=None, max_length=500)
    expire_hours: int = Field(default=72, ge=1, le=720)


class RevokeInvitationRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class UpdateMemberRequest(BaseModel):
    team_role: str | None = Field(default=None, pattern="^(team_admin|owner|reviewer|labeler)$")
    permissions: list[str] | None = None
    assigned_review_tasks: list[str] | None = None
    status: str | None = Field(default=None, pattern="^(active|disabled)$")


class BatchUpdateMemberRoleRequest(BaseModel):
    user_ids: list[str] = Field(min_length=1, max_length=100)
    team_role: str = Field(pattern="^(team_admin|owner|reviewer|labeler)$")


class MemberSecurityReminderRequest(BaseModel):
    user_ids: list[str] = Field(min_length=1, max_length=100)
    title: str = Field(default="账号安全提醒", min_length=2, max_length=120)
    content: str = Field(
        default="请尽快检查账号安全设置，开启双重验证并确认邮箱和联系方式。",
        min_length=1,
        max_length=1000,
    )


class MembershipSubscribeRequest(BaseModel):
    target_plan: str = Field(pattern="^(free|basic|pro|enterprise)$")
    payment_password: str | None = Field(default=None, min_length=6, max_length=64)
