import ipaddress
from functools import lru_cache
from urllib.parse import urlparse

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "MarkUp API"
    environment: str = "local"
    log_level: str = "INFO"
    api_v1_prefix: str = "/api/v1"
    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_database: str = "markup"
    file_storage_root: str = ".storage"
    ffmpeg_path: str | None = None
    ffprobe_path: str | None = None
    video_preview_max_width: int = 1280
    video_preview_timeout_seconds: int = 600
    secret_key: str = Field(default="change-me-in-production", min_length=16)
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 14
    email_code_expire_minutes: int = 10
    email_code_resend_seconds: int = 60
    email_code_max_attempts: int = 5
    verification_code_pepper: str | None = None
    password_pepper: str | None = None
    frontend_app_url: str = "http://localhost:5173"
    frontend_oauth_callback_url: str = "http://localhost:5173/oauth/callback"
    public_api_base_url: str | None = None

    github_client_id: str | None = None
    github_client_secret: str | None = None
    github_redirect_uri: str | None = None

    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str | None = None
    google_oauth_scope: str = "openid email profile"

    huggingface_client_id: str | None = None
    huggingface_client_secret: str | None = None
    huggingface_redirect_uri: str | None = None
    huggingface_oauth_scope: str = "openid profile email"

    smtp_enabled: bool = False
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str | None = None
    smtp_from_name: str = "MarkUp"
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False

    cookie_secure: bool = False
    cookie_samesite: str = "lax"

    difficulty_ai_api_base: str = "https://ark.cn-beijing.volces.com/api/v3"
    difficulty_ai_api_key: str | None = None
    difficulty_ai_model: str = "ep-20260514105718-jthdm"
    difficulty_ai_temperature: float = 0
    difficulty_ai_timeout_seconds: float = 60

    platform_agent_enabled: bool = True
    platform_agent_rag_dir: str = ".rag/platform-agent"
    platform_agent_embedding_api_base: str | None = None
    platform_agent_embedding_api_key: str | None = None
    platform_agent_embedding_model: str = "text-embedding-3-small"
    platform_agent_rate_limit_per_minute: int = 20

    @field_validator("environment")
    @classmethod
    def normalize_environment(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("mongodb_url")
    @classmethod
    def validate_mongodb_url(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("MONGODB_URL 不能为空")
        return normalized

    @field_validator("mongodb_database")
    @classmethod
    def validate_mongodb_database(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("MONGODB_DATABASE 不能为空")
        return normalized

    @field_validator("cookie_samesite")
    @classmethod
    def validate_cookie_samesite(cls, value: str) -> str:
        normalized = value.lower()
        if normalized not in {"lax", "strict", "none"}:
            raise ValueError("COOKIE_SAMESITE 只能是 lax、strict 或 none")
        return normalized

    @model_validator(mode="after")
    def validate_production_secret_key(self) -> "Settings":
        if self.cookie_samesite == "none" and not self.cookie_secure:
            raise ValueError("COOKIE_SAMESITE 为 none 时，COOKIE_SECURE 必须为 true")
        if self.environment not in {"production", "prod"}:
            return self
        if self.secret_key == "change-me-in-production" or not is_strong_nonblank_secret(self.secret_key):
            raise ValueError("生产环境必须将 SECRET_KEY 替换为至少 32 字节的高强度随机值")
        if not self.cookie_secure:
            raise ValueError("生产环境 COOKIE_SECURE 必须为 true")
        if not is_strong_nonblank_secret(self.password_pepper):
            raise ValueError("生产环境 PASSWORD_PEPPER 必须设置为至少 32 字节的高强度随机值")
        if not is_strong_nonblank_secret(self.verification_code_pepper):
            raise ValueError("生产环境 VERIFICATION_CODE_PEPPER 必须设置为至少 32 字节的高强度随机值")
        if not is_public_https_url(self.frontend_app_url, require_origin=True):
            raise ValueError("生产环境 FRONTEND_APP_URL 必须是公开可访问的 HTTPS URL")
        if not is_public_https_url(self.frontend_oauth_callback_url):
            raise ValueError("生产环境 FRONTEND_OAUTH_CALLBACK_URL 必须是公开可访问的 HTTPS URL")
        if url_origin(self.frontend_oauth_callback_url) != url_origin(self.frontend_app_url):
            raise ValueError("生产环境 FRONTEND_OAUTH_CALLBACK_URL 必须与 FRONTEND_APP_URL 使用相同源")
        if not self.smtp_enabled:
            raise ValueError("生产环境 SMTP_ENABLED 必须为 true，避免绕过邮箱验证")
        if urlparse(self.mongodb_url).scheme.lower() == "mongomock":
            raise ValueError("生产环境 MONGODB_URL 必须指向真实 MongoDB 服务")
        missing_smtp = [
            key
            for key, value in {
                "SMTP_HOST": self.smtp_host,
                "SMTP_USERNAME": self.smtp_username,
                "SMTP_PASSWORD": self.smtp_password,
                "SMTP_FROM_EMAIL": self.smtp_from_email,
            }.items()
            if not value
        ]
        if missing_smtp:
            raise ValueError(f"生产环境必须设置 {', '.join(missing_smtp)}")
        for key, value in {
            "GITHUB_REDIRECT_URI": self.github_redirect_uri,
            "GOOGLE_REDIRECT_URI": self.google_redirect_uri,
            "HUGGINGFACE_REDIRECT_URI": self.huggingface_redirect_uri,
            "PUBLIC_API_BASE_URL": self.public_api_base_url,
        }.items():
            if value and not is_public_https_url(value):
                raise ValueError(f"生产环境 {key} 必须是公开可访问的 HTTPS URL")
        return self


def is_strong_nonblank_secret(value: str | None) -> bool:
    return bool(value and len(value.strip().encode("utf-8")) >= 32)


def is_public_https_url(value: str, *, require_origin: bool = False) -> bool:
    parsed = urlparse(value)
    hostname = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme != "https" or not hostname:
        return False
    if parsed.username or parsed.password:
        return False
    if parsed.query or parsed.fragment:
        return False
    if require_origin and parsed.path not in {"", "/"}:
        return False
    internal_suffixes = (".local", ".localhost", ".internal", ".lan", ".test", ".example", ".invalid")
    if "." not in hostname or hostname == "localhost" or hostname.endswith(internal_suffixes):
        return False
    try:
        ip = ipaddress.ip_address(hostname)
    except ValueError:
        return True
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def url_origin(value: str) -> tuple[str, str, int | None]:
    parsed = urlparse(value)
    return (parsed.scheme.lower(), (parsed.hostname or "").lower().rstrip("."), parsed.port)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
