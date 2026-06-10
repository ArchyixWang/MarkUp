import os
import logging

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

os.environ["MONGODB_URL"] = "mongodb://localhost:27017"

from app.core.config import Settings
from app.main import app


def production_settings_kwargs(**overrides):
    kwargs = {
        "environment": "production",
        "secret_key": "strong-production-secret-key-32-bytes",
        "cookie_secure": True,
        "password_pepper": "strong-password-pepper-value-32-bytes",
        "verification_code_pepper": "strong-verification-pepper-32-bytes",
        "frontend_app_url": "https://app.example.com",
        "frontend_oauth_callback_url": "https://app.example.com/oauth/callback",
        "smtp_enabled": True,
        "smtp_host": "smtp.example.com",
        "smtp_username": "mailer@example.com",
        "smtp_password": "smtp-password",
        "smtp_from_email": "noreply@example.com",
    }
    kwargs.update(overrides)
    return kwargs


def test_production_rejects_default_secret_key() -> None:
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        Settings(environment="production", secret_key="change-me-in-production")


def test_production_rejects_short_secret_key() -> None:
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        Settings(environment="production", secret_key="short-secret-key")


def test_production_rejects_blank_secret_key() -> None:
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        Settings(**production_settings_kwargs(secret_key=" " * 32))


def test_local_allows_documented_placeholder_secret_key() -> None:
    settings = Settings(environment="local", secret_key="change-me-in-production")

    assert settings.secret_key == "change-me-in-production"


def test_environment_is_normalized_before_production_guards() -> None:
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        Settings(environment=" Production ", secret_key="change-me-in-production")


def test_cookie_samesite_rejects_invalid_values() -> None:
    with pytest.raises(ValidationError, match="COOKIE_SAMESITE"):
        Settings(cookie_samesite="relaxed")


def test_cookie_samesite_normalizes_valid_values() -> None:
    settings = Settings(cookie_samesite="Strict")

    assert settings.cookie_samesite == "strict"


def test_request_logging_includes_request_context(caplog: pytest.LogCaptureFixture) -> None:
    client = TestClient(app)

    with caplog.at_level(logging.INFO, logger="app.request"):
        response = client.get("/health", headers={"X-Request-ID": "req-log-test"})

    assert response.status_code == 200
    record = next(item for item in caplog.records if item.name == "app.request" and item.message == "http_request_completed")
    assert record.request_id == "req-log-test"
    assert record.method == "GET"
    assert record.path == "/health"
    assert record.status_code == 200
    assert isinstance(record.duration_ms, float)


def test_cookie_samesite_none_requires_secure_cookie() -> None:
    with pytest.raises(ValidationError, match="COOKIE_SECURE"):
        Settings(cookie_samesite="none", cookie_secure=False)


def test_production_requires_secure_refresh_cookie() -> None:
    with pytest.raises(ValidationError, match="COOKIE_SECURE"):
        Settings(
            environment="production",
            secret_key="strong-production-secret-key-32-bytes",
            cookie_secure=False,
        )


def test_production_requires_password_pepper() -> None:
    with pytest.raises(ValidationError, match="PASSWORD_PEPPER"):
        Settings(
            environment="production",
            secret_key="strong-production-secret-key-32-bytes",
            cookie_secure=True,
            verification_code_pepper="strong-verification-pepper-32-bytes",
        )


def test_production_rejects_blank_password_pepper() -> None:
    with pytest.raises(ValidationError, match="PASSWORD_PEPPER"):
        Settings(**production_settings_kwargs(password_pepper=" " * 32))


def test_production_requires_verification_code_pepper() -> None:
    with pytest.raises(ValidationError, match="VERIFICATION_CODE_PEPPER"):
        Settings(
            environment="production",
            secret_key="strong-production-secret-key-32-bytes",
            cookie_secure=True,
            password_pepper="strong-password-pepper-value-32-bytes",
        )


def test_production_rejects_blank_verification_code_pepper() -> None:
    with pytest.raises(ValidationError, match="VERIFICATION_CODE_PEPPER"):
        Settings(**production_settings_kwargs(verification_code_pepper=" " * 32))


def test_production_requires_https_frontend_app_url() -> None:
    with pytest.raises(ValidationError, match="FRONTEND_APP_URL"):
        Settings(
            environment="production",
            secret_key="strong-production-secret-key-32-bytes",
            cookie_secure=True,
            password_pepper="strong-password-pepper-value-32-bytes",
            verification_code_pepper="strong-verification-pepper-32-bytes",
            frontend_app_url="http://localhost:5173",
            frontend_oauth_callback_url="https://app.example.com/oauth/callback",
        )


def test_production_requires_https_frontend_oauth_callback_url() -> None:
    with pytest.raises(ValidationError, match="FRONTEND_OAUTH_CALLBACK_URL"):
        Settings(
            environment="production",
            secret_key="strong-production-secret-key-32-bytes",
            cookie_secure=True,
            password_pepper="strong-password-pepper-value-32-bytes",
            verification_code_pepper="strong-verification-pepper-32-bytes",
            frontend_app_url="https://app.example.com",
            frontend_oauth_callback_url="http://localhost:5173/oauth/callback",
        )


def test_production_rejects_private_https_frontend_oauth_callback_url() -> None:
    with pytest.raises(ValidationError, match="FRONTEND_OAUTH_CALLBACK_URL"):
        Settings(
            **production_settings_kwargs(
                frontend_oauth_callback_url="https://10.0.0.8/oauth/callback",
            )
        )


def test_production_requires_frontend_oauth_callback_same_origin() -> None:
    with pytest.raises(ValidationError, match="FRONTEND_OAUTH_CALLBACK_URL"):
        Settings(
            **production_settings_kwargs(
                frontend_app_url="https://app.example.com",
                frontend_oauth_callback_url="https://auth.example.com/oauth/callback",
            )
        )


def test_production_frontend_app_url_must_be_origin() -> None:
    with pytest.raises(ValidationError, match="FRONTEND_APP_URL"):
        Settings(
            **production_settings_kwargs(
                frontend_app_url="https://app.example.com/console",
            )
        )


def test_production_rejects_internal_frontend_hostnames() -> None:
    with pytest.raises(ValidationError, match="FRONTEND_APP_URL"):
        Settings(
            **production_settings_kwargs(
                frontend_app_url="https://markup-intranet",
            )
        )
    with pytest.raises(ValidationError, match="FRONTEND_OAUTH_CALLBACK_URL"):
        Settings(
            **production_settings_kwargs(
                frontend_oauth_callback_url="https://auth.local/oauth/callback",
            )
        )


def test_production_requires_smtp_enabled_for_email_verification() -> None:
    with pytest.raises(ValidationError, match="SMTP_ENABLED"):
        Settings(**production_settings_kwargs(smtp_enabled=False))


def test_production_rejects_mongomock_database_url() -> None:
    with pytest.raises(ValidationError, match="MONGODB_URL"):
        Settings(**production_settings_kwargs(mongodb_url="mongomock://localhost"))


def test_production_requires_non_empty_mongodb_database_name() -> None:
    with pytest.raises(ValidationError, match="MONGODB_DATABASE"):
        Settings(**production_settings_kwargs(mongodb_database="   "))


def test_production_requires_https_oauth_provider_redirect_uris() -> None:
    with pytest.raises(ValidationError, match="GITHUB_REDIRECT_URI"):
        Settings(
            **production_settings_kwargs(
                github_client_id="github-client",
                github_client_secret="github-secret",
                github_redirect_uri="http://localhost:8000/api/v1/auth/oauth/github/callback",
            )
        )


def test_production_allows_strong_secret_and_secure_cookie() -> None:
    settings = Settings(**production_settings_kwargs())

    assert settings.cookie_secure is True
