import re
import unicodedata

from pydantic import BaseModel, EmailStr, Field, field_validator

USERNAME_PATTERN = re.compile(r"^[a-z][a-z0-9_]{3,31}$")
USERNAME_MIN_LENGTH = 4
USERNAME_MAX_LENGTH = 32
DISPLAY_NAME_MAX_LENGTH = 32


def validate_password_strength(value: str) -> str:
    has_lower = any(ch.islower() for ch in value)
    has_upper = any(ch.isupper() for ch in value)
    has_digit = any(ch.isdigit() for ch in value)
    has_symbol = any(not ch.isalnum() for ch in value)
    if sum([has_lower or has_upper, has_digit, has_symbol]) < 3:
        raise ValueError("密码必须包含字母、数字和特殊字符中的至少三类")
    if not (has_lower and has_upper):
        raise ValueError("密码必须同时包含大小写字母")
    return value


def validate_username_value(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError("登录账号不能为空")
    if normalized != value:
        raise ValueError("登录账号不能包含首尾空格")
    if normalized.lower() != normalized:
        raise ValueError("登录账号只能使用小写字母")
    if not USERNAME_PATTERN.fullmatch(normalized):
        raise ValueError("登录账号需为 4-32 位，字母开头，仅支持小写字母、数字和下划线")
    return normalized


def validate_display_name_value(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError("显示名不能为空")
    if len(normalized) > DISPLAY_NAME_MAX_LENGTH:
        raise ValueError("显示名不能超过 32 个字符")
    if any(unicodedata.category(ch).startswith("C") for ch in normalized):
        raise ValueError("显示名不能包含控制字符")
    return normalized


class SendEmailCodeRequest(BaseModel):
    email: EmailStr
    purpose: str = Field(pattern="^(register|bind_email|reset_password|team_payment_password_reset)$")


class ConfirmEmailRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=8)
    purpose: str = Field(pattern="^(register|bind_email|reset_password|team_payment_password_reset)$")


class RegisterRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=DISPLAY_NAME_MAX_LENGTH)
    username: str = Field(min_length=USERNAME_MIN_LENGTH, max_length=USERNAME_MAX_LENGTH)
    email: EmailStr
    password: str = Field(min_length=8, max_length=64)
    role: str = Field(default="pending", pattern="^(pending|labeler)$")
    email_code: str = ""
    invite_code: str | None = None

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, value: str) -> str:
        return validate_display_name_value(value)

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        return validate_username_value(value)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return validate_password_strength(value)


class AdminRegisterRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=DISPLAY_NAME_MAX_LENGTH)
    username: str = Field(min_length=USERNAME_MIN_LENGTH, max_length=USERNAME_MAX_LENGTH)
    email: EmailStr
    password: str = Field(min_length=8, max_length=64)
    email_code: str = ""

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, value: str) -> str:
        return validate_display_name_value(value)

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        return validate_username_value(value)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return validate_password_strength(value)


class LoginRequest(BaseModel):
    account: str = Field(min_length=2, max_length=255)
    password: str = Field(min_length=8, max_length=64)


class RefreshRequest(BaseModel):
    refresh_token: str | None = None


class PasswordChangeRequest(BaseModel):
    old_password: str = Field(min_length=8, max_length=64)
    new_password: str = Field(min_length=8, max_length=64)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        return validate_password_strength(value)


class PasswordResetRequest(BaseModel):
    email: EmailStr
    email_code: str = Field(min_length=6, max_length=8)
    new_password: str = Field(min_length=8, max_length=64)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        return validate_password_strength(value)


class OAuthExchangeRequest(BaseModel):
    ticket: str = Field(min_length=20, max_length=300)


class OAuthLinkAccountRequest(BaseModel):
    ticket: str = Field(min_length=20, max_length=300)
    account: str = Field(min_length=2, max_length=255)
    password: str = Field(min_length=8, max_length=64)


class OAuthLinkCurrentUserRequest(BaseModel):
    ticket: str = Field(min_length=20, max_length=300)


class OAuthRegisterAccountRequest(BaseModel):
    ticket: str = Field(min_length=20, max_length=300)
    display_name: str = Field(min_length=1, max_length=DISPLAY_NAME_MAX_LENGTH)
    username: str = Field(min_length=USERNAME_MIN_LENGTH, max_length=USERNAME_MAX_LENGTH)
    email: EmailStr | None = None
    email_code: str = ""
    password: str = Field(min_length=8, max_length=64)
    role: str = Field(default="pending", pattern="^(pending)$")

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, value: str) -> str:
        return validate_display_name_value(value)

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        return validate_username_value(value)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return validate_password_strength(value)


class BindOAuthEmailRequest(BaseModel):
    ticket: str = Field(min_length=20, max_length=300)
    email: EmailStr
    email_code: str = Field(min_length=6, max_length=8)


class TeamRegisterRequest(BaseModel):
    company_name: str = Field(min_length=2, max_length=120)
    admin_email: EmailStr
    admin_password: str = Field(min_length=8, max_length=64)
    admin_username: str = Field(min_length=2, max_length=20)
    admin_email_code: str = Field(min_length=6, max_length=8)
    industry: str | None = Field(default=None, max_length=80)
    contact_phone: str | None = Field(default=None, max_length=32)
    invite_code: str | None = None

    @field_validator("admin_password")
    @classmethod
    def validate_admin_password(cls, value: str) -> str:
        return validate_password_strength(value)

    @field_validator("contact_phone")
    @classmethod
    def validate_phone(cls, value: str | None) -> str | None:
        if value and not all(ch.isdigit() or ch in "+- " for ch in value):
            raise ValueError("联系电话格式不正确")
        return value


class LabelerOnboardingProfile(BaseModel):
    domains: str = Field(min_length=1, max_length=500)
    qualification: str = Field(min_length=1, max_length=200)
    task_types: str = Field(min_length=1, max_length=500)
    experience: str | None = Field(default=None, max_length=1000)


class OrganizationOnboardingProfile(BaseModel):
    company_name: str = Field(min_length=2, max_length=120)
    industry: str = Field(min_length=1, max_length=80)
    contact_name: str = Field(min_length=1, max_length=80)
    contact_phone: str = Field(min_length=1, max_length=32)
    business_description: str = Field(min_length=1, max_length=1000)
    website: str | None = Field(default=None, max_length=200)
    address: str | None = Field(default=None, max_length=200)

    @field_validator("contact_phone")
    @classmethod
    def validate_phone(cls, value: str) -> str:
        if not all(ch.isdigit() or ch in "+- " for ch in value):
            raise ValueError("联系电话格式不正确")
        return value


class OnboardingCompleteRequest(BaseModel):
    identity: str = Field(pattern="^(labeler|requester)$")
    labeler_profile: LabelerOnboardingProfile | None = None
    organization_action: str | None = Field(default=None, pattern="^(create|join)$")
    organization_profile: OrganizationOnboardingProfile | None = None
    invite_code: str | None = Field(default=None, min_length=6, max_length=120)
