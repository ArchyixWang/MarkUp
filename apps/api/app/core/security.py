import base64
from datetime import UTC, datetime, timedelta
import hashlib
import hmac
import secrets
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings

ALGORITHM = "HS256"
pwd_context = CryptContext(
    schemes=["argon2"],
    deprecated="auto",
    argon2__memory_cost=65536,
    argon2__time_cost=3,
    argon2__parallelism=4,
)


def now_utc() -> datetime:
    return datetime.now(UTC)


def generate_object_id() -> str:
    return secrets.token_hex(12)


def generate_code(length: int = 6) -> str:
    upper = 10**length
    return f"{secrets.randbelow(upper):0{length}d}"


def generate_token_urlsafe(length: int = 32) -> str:
    return secrets.token_urlsafe(length)


def hash_secret(value: str, pepper: str | None = None) -> str:
    key = (pepper or settings.secret_key).encode("utf-8")
    return hmac.digest(key, value.encode("utf-8"), "sha256").hex()


def _fernet() -> Fernet:
    digest = hashlib.sha256(settings.secret_key.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_secret(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return _fernet().decrypt(value.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError):
        return None


def normalize_password(password: str) -> str:
    if settings.password_pepper:
        return f"{settings.password_pepper}:{password}"
    return password


def hash_password(password: str) -> str:
    return pwd_context.hash(normalize_password(password))


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(normalize_password(password), password_hash)


def create_access_token(subject: str, claims: dict[str, Any] | None = None) -> str:
    expires_at = now_utc() + timedelta(minutes=settings.access_token_expire_minutes)
    payload: dict[str, Any] = {
        "sub": subject,
        "typ": "access",
        "exp": expires_at,
        "iat": now_utc(),
        "jti": generate_token_urlsafe(16),
    }
    if claims:
        payload.update(claims)
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def create_refresh_token(subject: str, jti: str) -> str:
    expires_at = now_utc() + timedelta(days=settings.refresh_token_expire_days)
    payload = {
        "sub": subject,
        "typ": "refresh",
        "jti": jti,
        "exp": expires_at,
        "iat": now_utc(),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
