from datetime import timedelta
import base64
from hashlib import sha256
from urllib.parse import urlencode, urlparse, urlunparse

import httpx
from fastapi import Request

from app.core.database import MongoDatabase
from app.core.config import settings
from app.core.errors import AppError, ErrorCode
from app.core.security import generate_token_urlsafe, hash_password, hash_secret, now_utc
from app.models.auth import OAuthIdentity, OAuthState
from app.models.user import User, UserProfile
from app.services.audit_service import write_audit_log
from app.services.auth_service import authenticate_user, consume_email_code, issue_token_pair, validate_email_code


OAUTH_TICKET_TTL_MINUTES = 5
OAUTH_INTENT_LOGIN = "login"
OAUTH_INTENT_BIND_CURRENT_USER = "bind_current_user"
OAUTH_INTENTS = {OAUTH_INTENT_LOGIN, OAUTH_INTENT_BIND_CURRENT_USER}
SAFE_REDIRECT_AFTER_LOGIN_PREFIXES = ("/onboarding", "/workspace", "/platform", "/tasks/assigned")
oauth_login_tickets: dict[str, dict] = {}


class OAuthProfile(dict):
    @property
    def provider_user_id(self) -> str:
        return self["provider_user_id"]

    @property
    def username(self) -> str | None:
        return self.get("username")

    @property
    def email(self) -> str | None:
        return self.get("email")

    @property
    def email_verified(self) -> bool:
        return bool(self.get("email_verified"))

    @property
    def avatar(self) -> str | None:
        return self.get("avatar")


def normalize_oauth_intent(intent: str | None) -> str:
    normalized = (intent or OAUTH_INTENT_LOGIN).strip() or OAUTH_INTENT_LOGIN
    if normalized not in OAUTH_INTENTS:
        raise AppError(ErrorCode.VALIDATION_FORMAT, "不支持的 OAuth intent")
    return normalized


def oauth_start(db: MongoDatabase, provider: str, redirect_after_login: str | None = None, intent: str | None = None) -> str:
    config = provider_config(provider)
    oauth_intent = normalize_oauth_intent(intent)
    state = generate_token_urlsafe(32)
    code_verifier = generate_token_urlsafe(48) if provider in {"github", "google", "huggingface"} else None
    oauth_state = OAuthState(
        provider=provider,
        intent=oauth_intent,
        state_hash=hash_secret(state),
        code_verifier=code_verifier,
        redirect_after_login=normalize_redirect_after_login(redirect_after_login),
        expire_at=now_utc() + timedelta(minutes=10),
    )
    db.add(oauth_state)
    db.commit()
    return build_authorization_url(provider, config, state, code_verifier)


def provider_config(provider: str) -> dict:
    if provider == "github":
        if not settings.github_client_id or not settings.github_client_secret or not settings.github_redirect_uri:
            raise AppError(ErrorCode.THIRD_PARTY_ERROR, "GitHub OAuth 未配置，请设置 GITHUB_CLIENT_ID、GITHUB_CLIENT_SECRET 和 GITHUB_REDIRECT_URI")
        return {
            "client_id": settings.github_client_id,
            "client_secret": settings.github_client_secret,
            "redirect_uri": settings.github_redirect_uri,
        }
    if provider == "google":
        if not settings.google_client_id or not settings.google_client_secret or not settings.google_redirect_uri:
            raise AppError(ErrorCode.THIRD_PARTY_ERROR, "Google OAuth 未配置，请设置 GOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET 和 GOOGLE_REDIRECT_URI")
        return {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": settings.google_redirect_uri,
        }
    if provider == "huggingface":
        if not settings.huggingface_client_id or not settings.huggingface_client_secret or not settings.huggingface_redirect_uri:
            raise AppError(
                ErrorCode.THIRD_PARTY_ERROR,
                "Hugging Face OAuth 未配置，请设置 HUGGINGFACE_CLIENT_ID、HUGGINGFACE_CLIENT_SECRET 和 HUGGINGFACE_REDIRECT_URI",
            )
        return {
            "client_id": settings.huggingface_client_id,
            "client_secret": settings.huggingface_client_secret,
            "redirect_uri": settings.huggingface_redirect_uri,
        }
    raise AppError(ErrorCode.VALIDATION_FORMAT, "不支持的 OAuth provider")


def normalize_redirect_after_login(value: str | None) -> str | None:
    trimmed = (value or "").strip()
    if not trimmed:
        return None

    parsed = urlparse(trimmed)
    if parsed.scheme or parsed.netloc:
        frontend = urlparse(settings.frontend_app_url)
        if parsed.scheme != frontend.scheme or parsed.netloc != frontend.netloc:
            return None
    elif not trimmed.startswith("/") or trimmed.startswith("//"):
        return None

    relative = urlunparse(("", "", parsed.path, "", parsed.query, parsed.fragment))
    if not relative.startswith("/"):
        relative = f"/{relative}"
    if any(
        relative == prefix or relative.startswith(f"{prefix}/") or relative.startswith(f"{prefix}?")
        for prefix in SAFE_REDIRECT_AFTER_LOGIN_PREFIXES
    ):
        return relative
    return None


def build_authorization_url(provider: str, config: dict, state: str, code_verifier: str | None) -> str:
    if provider == "github":
        query = urlencode(
            {
                "client_id": config["client_id"],
                "redirect_uri": config["redirect_uri"],
                "scope": "read:user user:email",
                "prompt": "select_account",
                "state": state,
                "code_challenge": pkce_challenge(code_verifier or ""),
                "code_challenge_method": "S256",
            }
        )
        return f"https://github.com/login/oauth/authorize?{query}"
    if provider == "google":
        params = {
            "client_id": config["client_id"],
            "redirect_uri": config["redirect_uri"],
            "response_type": "code",
            "scope": settings.google_oauth_scope,
            "prompt": "select_account",
            "state": state,
            "code_challenge": pkce_challenge(code_verifier or ""),
            "code_challenge_method": "S256",
        }
        query = urlencode(params)
        return f"https://accounts.google.com/o/oauth2/v2/auth?{query}"
    if provider == "huggingface":
        params = {
            "client_id": config["client_id"],
            "redirect_uri": config["redirect_uri"],
            "response_type": "code",
            "scope": settings.huggingface_oauth_scope,
            "state": state,
            "code_challenge": pkce_challenge(code_verifier or ""),
            "code_challenge_method": "S256",
        }
        query = urlencode(params)
        return f"https://huggingface.co/oauth/authorize?{query}"
    raise AppError(ErrorCode.VALIDATION_FORMAT, "不支持的 OAuth provider")


def pkce_challenge(code_verifier: str) -> str:
    digest = sha256(code_verifier.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


async def oauth_callback(db: MongoDatabase, provider: str, code: str, state: str, request: Request) -> dict:
    oauth_state = db.find_one(OAuthState, {"provider": provider, "state_hash": hash_secret(state), "consumed": False})
    if not oauth_state or oauth_state.expire_at.replace(tzinfo=now_utc().tzinfo) < now_utc():
        raise AppError(ErrorCode.AUTH_REQUIRED, "OAuth 状态已失效")
    oauth_state.consumed = True
    db.save(oauth_state)
    profile = await fetch_oauth_profile(provider, code, oauth_state.code_verifier)
    identity = db.find_one(OAuthIdentity, {"provider": provider, "provider_user_id": profile.provider_user_id})

    user: User | None = db.get(User, identity.user_id) if identity else None

    ticket = generate_oauth_ticket(
        provider=provider,
        profile=profile,
        user_id=user.id if user else None,
        intent=oauth_state.intent,
        redirect_after_login=oauth_state.redirect_after_login,
    )
    write_audit_log(
        db,
        entity_type="oauth",
        entity_id=provider,
        action="oauth_callback",
        operator_id=user.id if user else None,
        changes={"provider": provider, "intent": oauth_state.intent, "needs_account_link": user is None},
        request=request,
    )
    db.commit()
    return {
        "ticket": ticket,
        "intent": oauth_state.intent,
        "redirect_after_login": oauth_state.redirect_after_login,
    }


async def fetch_oauth_profile(provider: str, code: str, code_verifier: str | None) -> OAuthProfile:
    if provider == "github":
        return await fetch_github_profile(code, code_verifier)
    if provider == "google":
        return await fetch_google_profile(code, code_verifier)
    if provider == "huggingface":
        return await fetch_huggingface_profile(code, code_verifier)
    raise AppError(ErrorCode.VALIDATION_FORMAT, "不支持的 OAuth provider")


async def fetch_github_profile(code: str, code_verifier: str | None) -> OAuthProfile:
    config = provider_config("github")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            token_response = await client.post(
                "https://github.com/login/oauth/access_token",
                headers={"Accept": "application/json"},
                data={
                    "client_id": config["client_id"],
                    "client_secret": config.get("client_secret"),
                    "code": code,
                    "redirect_uri": config["redirect_uri"],
                    "code_verifier": code_verifier,
                },
            )
            token_response.raise_for_status()
            access_token = token_response.json().get("access_token")
            if not access_token:
                raise AppError(ErrorCode.THIRD_PARTY_ERROR, "GitHub 授权失败")
            user_response = await client.get(
                "https://api.github.com/user",
                headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
            )
            user_response.raise_for_status()
            user_data = user_response.json()
            emails_response = await client.get(
                "https://api.github.com/user/emails",
                headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
            )
            emails_response.raise_for_status()
    except AppError:
        raise
    except httpx.HTTPError as exc:
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, "GitHub 授权服务调用失败", {"error": str(exc)}) from exc
    verified_email = next((item["email"] for item in emails_response.json() if item.get("primary") and item.get("verified")), None)
    return OAuthProfile(
        provider_user_id=str(user_data["id"]),
        username=user_data.get("login"),
        email=verified_email,
        email_verified=bool(verified_email),
        avatar=user_data.get("avatar_url"),
    )


async def fetch_google_profile(code: str, code_verifier: str | None) -> OAuthProfile:
    config = provider_config("google")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            token_response = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "grant_type": "authorization_code",
                    "client_id": config["client_id"],
                    "client_secret": config["client_secret"],
                    "code": code,
                    "redirect_uri": config["redirect_uri"],
                    "code_verifier": code_verifier,
                },
            )
            token_response.raise_for_status()
            token_payload = token_response.json()
            access_token = token_payload.get("access_token")
            if not access_token:
                raise AppError(ErrorCode.THIRD_PARTY_ERROR, "Google 授权失败", oauth_error_detail(token_payload))
            profile_response = await client.get(
                "https://openidconnect.googleapis.com/v1/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            profile_response.raise_for_status()
    except AppError:
        raise
    except httpx.HTTPError as exc:
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, "Google 授权服务调用失败", {"error": str(exc)}) from exc
    profile = profile_response.json()
    provider_user_id = profile.get("sub")
    if not provider_user_id:
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, "Google 用户信息缺少用户标识")
    return OAuthProfile(
        provider_user_id=str(provider_user_id),
        username=profile.get("name") or profile.get("given_name") or profile.get("email"),
        email=profile.get("email"),
        email_verified=bool(profile.get("email_verified")),
        avatar=profile.get("picture"),
    )


async def fetch_huggingface_profile(code: str, code_verifier: str | None) -> OAuthProfile:
    config = provider_config("huggingface")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            token_response = await client.post(
                "https://huggingface.co/oauth/token",
                data={
                    "grant_type": "authorization_code",
                    "client_id": config["client_id"],
                    "client_secret": config["client_secret"],
                    "code": code,
                    "redirect_uri": config["redirect_uri"],
                    "code_verifier": code_verifier,
                },
            )
            token_response.raise_for_status()
            token_payload = token_response.json()
            access_token = token_payload.get("access_token")
            if not access_token:
                raise AppError(ErrorCode.THIRD_PARTY_ERROR, "Hugging Face 授权失败", oauth_error_detail(token_payload))
            profile_response = await client.get(
                "https://huggingface.co/oauth/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            profile_response.raise_for_status()
    except AppError:
        raise
    except httpx.HTTPError as exc:
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, "Hugging Face 授权服务调用失败", {"error": str(exc)}) from exc
    profile = profile_response.json()
    provider_user_id = profile.get("sub")
    if not provider_user_id:
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, "Hugging Face 用户信息缺少用户标识")
    return OAuthProfile(
        provider_user_id=str(provider_user_id),
        username=profile.get("preferred_username") or profile.get("name") or profile.get("email"),
        email=profile.get("email"),
        email_verified=bool(profile.get("email_verified")),
        avatar=profile.get("picture"),
    )


def oauth_error_detail(payload: dict) -> dict:
    return {
        "code": payload.get("code"),
        "error": payload.get("error"),
        "error_description": payload.get("error_description") or payload.get("msg") or payload.get("message"),
    }


def oauth_identity_payload(identity: OAuthIdentity) -> dict:
    return {
        "provider": identity.provider,
        "provider_user_id": identity.provider_user_id,
        "provider_username": identity.provider_username,
        "provider_email": identity.provider_email,
        "email_verified_by_provider": identity.email_verified_by_provider,
        "created_at": identity.created_at.isoformat() if identity.created_at else None,
        "updated_at": identity.updated_at.isoformat() if identity.updated_at else None,
    }


def list_oauth_identities(db: MongoDatabase, user: User) -> dict:
    identities = db.find(OAuthIdentity, {"user_id": user.id}, sort=[("created_at", 1)])
    return {"items": [oauth_identity_payload(identity) for identity in identities]}


def unlink_oauth_identity(db: MongoDatabase, user: User, provider: str, request: Request) -> dict:
    identity = db.find_one(OAuthIdentity, {"user_id": user.id, "provider": provider})
    if not identity:
        raise AppError(ErrorCode.NOT_FOUND, "OAuth 身份不存在")
    identities = db.find(OAuthIdentity, {"user_id": user.id})
    if not user.password_hash and len(identities) <= 1:
        raise AppError(ErrorCode.BUSINESS_RULE, "不能移除最后一种登录方式")
    db.delete_one(OAuthIdentity, {"_id": identity.id})
    write_audit_log(
        db,
        entity_type="user",
        entity_id=user.id,
        action="oauth_identity_unlinked",
        operator_id=user.id,
        changes={"provider": provider, "provider_user_id": identity.provider_user_id},
        request=request,
    )
    db.commit()
    return {"provider": provider, "unlinked": True}


def link_oauth_identity(db: MongoDatabase, user: User, provider: str, profile: OAuthProfile) -> OAuthIdentity:
    identity = OAuthIdentity(
        user_id=user.id,
        provider=provider,
        provider_user_id=profile.provider_user_id,
        provider_username=profile.username,
        provider_email=profile.email.lower() if profile.email else None,
        email_verified_by_provider=profile.email_verified,
    )
    db.add(identity)
    return identity


def sync_oauth_identity(identity: OAuthIdentity, profile: OAuthProfile) -> OAuthIdentity:
    identity.provider_username = profile.username
    identity.provider_email = profile.email.lower() if profile.email else None
    identity.email_verified_by_provider = profile.email_verified
    identity.updated_at = now_utc()
    return identity


def ensure_oauth_identity_linkable(db: MongoDatabase, user: User, provider: str, profile: OAuthProfile) -> OAuthIdentity | None:
    exact_identity = db.find_one(OAuthIdentity, {"provider": provider, "provider_user_id": profile.provider_user_id})
    if exact_identity:
        if exact_identity.user_id != user.id:
            raise AppError(ErrorCode.RESOURCE_EXISTS, "该第三方账号已绑定其他用户")
        sync_oauth_identity(exact_identity, profile)
        db.save(exact_identity)
        return exact_identity

    provider_identity = db.find_one(OAuthIdentity, {"user_id": user.id, "provider": provider})
    if provider_identity:
        raise AppError(ErrorCode.RESOURCE_EXISTS, "当前账号已绑定该平台的其他第三方账号")

    return None


def unique_username(db: MongoDatabase, base_username: str) -> str:
    lowered = str(base_username).strip().lower()
    filtered = "".join(ch if ch.isalnum() or ch == "_" else "_" for ch in lowered)
    filtered = filtered.lstrip("0123456789_")
    normalized = filtered[:32] or "oauth_user"
    if len(normalized) < 4:
        normalized = f"{normalized}user"[:32]
    candidate = normalized
    suffix = 1
    while db.find_one(User, {"username": candidate}):
        suffix += 1
        suffix_text = str(suffix)
        candidate = f"{normalized[: 32 - len(suffix_text)]}{suffix_text}"
    return candidate


def normalized_profile_email(profile: dict | OAuthProfile) -> str | None:
    email = profile.get("email") if isinstance(profile, dict) else profile.email
    return email.lower() if email else None


def trusted_profile_email(profile: dict | OAuthProfile) -> str | None:
    email_verified = bool(profile.get("email_verified")) if isinstance(profile, dict) else profile.email_verified
    return normalized_profile_email(profile) if email_verified else None


def generate_oauth_ticket(
    provider: str,
    profile: OAuthProfile,
    user_id: str | None,
    intent: str,
    redirect_after_login: str | None,
) -> str:
    cleanup_expired_tickets()
    ticket = generate_token_urlsafe(48)
    oauth_login_tickets[hash_secret(ticket)] = {
        "provider": provider,
        "profile": dict(profile),
        "user_id": user_id,
        "intent": intent,
        "redirect_after_login": normalize_redirect_after_login(redirect_after_login),
        "expire_at": now_utc() + timedelta(minutes=OAUTH_TICKET_TTL_MINUTES),
    }
    return ticket


def exchange_oauth_ticket(db: MongoDatabase, ticket: str, request: Request) -> dict:
    payload = get_ticket(ticket, expected_intent=OAUTH_INTENT_LOGIN)
    user_id = payload.get("user_id")
    if not user_id:
        bind_ticket = replace_ticket(ticket, payload)
        trusted_email = trusted_profile_email(payload["profile"])
        existing_user = db.find_one(User, {"email": trusted_email}) if trusted_email else None
        return {
            "needs_account_link": True,
            "provider": payload["provider"],
            "suggested_username": payload["profile"].get("username"),
            "suggested_email": trusted_email,
            "email_verified_by_provider": trusted_email is not None,
            "has_matching_user": existing_user is not None,
            "bind_ticket": bind_ticket,
        }
    pop_ticket(ticket)
    user = db.get(User, user_id)
    if not user or user.status != "active" or not user.email_verified:
        raise AppError(ErrorCode.AUTH_REQUIRED, "请先登录")
    token_pair = issue_token_pair(db, user, request)
    token_pair["needs_account_link"] = False
    return token_pair


def bind_oauth_email(db: MongoDatabase, ticket: str, email: str, email_code: str, request: Request) -> dict:
    payload = get_ticket(ticket, expected_intent=OAUTH_INTENT_LOGIN)
    profile = OAuthProfile(payload["profile"])
    normalized_email = email.lower()
    validate_email_code(db, normalized_email, email_code, "bind_email", consume=False)
    user = db.find_one(User, {"email": normalized_email})
    if not user:
        existing = db.find_one(OAuthIdentity, {"provider": payload["provider"], "provider_user_id": profile.provider_user_id})
        if existing:
            raise AppError(ErrorCode.RESOURCE_EXISTS, "该第三方账号已绑定其他用户")
        raise AppError(ErrorCode.BUSINESS_RULE, "请先选择 OAuth 注册流程创建账号")
    else:
        if user.status != "active":
            raise AppError(ErrorCode.AUTH_REQUIRED, "请先登录")
        existing = ensure_oauth_identity_linkable(db, user, payload["provider"], profile)
        consume_email_code(db, normalized_email, email_code, "bind_email")
        if not existing:
            link_oauth_identity(db, user, payload["provider"], profile)
        user.email_verified = True
        db.save(user)
    consume_ticket(ticket)
    write_audit_log(
        db,
        entity_type="user",
        entity_id=user.id,
        action="oauth_email_bound",
        operator_id=user.id,
        changes={"provider": payload["provider"], "email": email.lower()},
        request=request,
    )
    return issue_token_pair(db, user, request)


def link_oauth_existing_account(db: MongoDatabase, ticket: str, account: str, password: str, request: Request) -> dict:
    payload = get_ticket(ticket, expected_intent=OAUTH_INTENT_LOGIN)
    profile = OAuthProfile(payload["profile"])

    user = authenticate_user(db, account, password)
    if not user.email:
        raise AppError(ErrorCode.BUSINESS_RULE, "当前账号缺少可绑定邮箱")

    existing = ensure_oauth_identity_linkable(db, user, payload["provider"], profile)
    if not existing:
        link_oauth_identity(db, user, payload["provider"], profile)
    if profile.avatar and not user.avatar:
        user.avatar = profile.avatar
    user.email_verified = True
    db.save(user)
    consume_ticket(ticket)
    write_audit_log(
        db,
        entity_type="user",
        entity_id=user.id,
        action="oauth_account_linked",
        operator_id=user.id,
        changes={"provider": payload["provider"], "account": account},
        request=request,
    )
    return issue_token_pair(db, user, request)


def link_oauth_current_user(db: MongoDatabase, ticket: str, user: User, request: Request) -> dict:
    payload = get_ticket(ticket, expected_intent=OAUTH_INTENT_BIND_CURRENT_USER)
    profile = OAuthProfile(payload["profile"])
    existing = ensure_oauth_identity_linkable(db, user, payload["provider"], profile)
    identity = existing or link_oauth_identity(db, user, payload["provider"], profile)
    if profile.avatar and not user.avatar:
        user.avatar = profile.avatar
    user.email_verified = True
    db.save(user)
    consume_ticket(ticket)
    write_audit_log(
        db,
        entity_type="user",
        entity_id=user.id,
        action="oauth_current_user_linked",
        operator_id=user.id,
        changes={"provider": payload["provider"], "provider_user_id": profile.provider_user_id},
        request=request,
    )
    db.commit()
    return {"provider": payload["provider"], "linked": True, "identity": oauth_identity_payload(identity)}


def register_oauth_account(
    db: MongoDatabase,
    *,
    ticket: str,
    username: str,
    display_name: str,
    email: str | None,
    email_code: str,
    password: str,
    role: str,
    request: Request,
) -> dict:
    payload = get_ticket(ticket, expected_intent=OAUTH_INTENT_LOGIN)
    profile = OAuthProfile(payload["profile"])
    existing = db.find_one(OAuthIdentity, {"provider": payload["provider"], "provider_user_id": profile.provider_user_id})
    if existing:
        raise AppError(ErrorCode.RESOURCE_EXISTS, "该第三方账号已绑定其他用户")

    trusted_email = trusted_profile_email(profile)
    resolved_email = trusted_email or (email.lower() if email else None)
    if not resolved_email:
        raise AppError(ErrorCode.VALIDATION_REQUIRED, "请提供邮箱后再完成注册")
    if db.find_one(User, {"email": resolved_email}):
        raise AppError(ErrorCode.RESOURCE_EXISTS, "该邮箱已被注册，请改为绑定已有账号")
    if db.find_one(User, {"username": username}):
        raise AppError(ErrorCode.RESOURCE_EXISTS, "用户已存在")

    if not trusted_email:
        if not email:
            raise AppError(ErrorCode.VALIDATION_REQUIRED, "请提供邮箱后再完成注册")
        consume_email_code(db, resolved_email, email_code, "bind_email")

    if db.find_one(User, {"$or": [{"email": resolved_email}, {"username": username}]}):
        raise AppError(ErrorCode.RESOURCE_EXISTS, "用户已存在")

    user = User(
        username=username,
        email=resolved_email,
        password_hash=hash_password(password),
        global_role=role,
        avatar=profile.avatar,
        email_verified=True,
    )
    db.add(user)
    db.add(UserProfile(user_id=user.id, display_name=display_name))
    link_oauth_identity(db, user, payload["provider"], profile)
    consume_ticket(ticket)
    write_audit_log(
        db,
        entity_type="user",
        entity_id=user.id,
        action="oauth_registered",
        operator_id=user.id,
        changes={"provider": payload["provider"], "email": resolved_email},
        request=request,
    )
    return issue_token_pair(db, user, request)


def get_ticket(ticket: str, expected_intent: str | None = None) -> dict:
    cleanup_expired_tickets()
    payload = oauth_login_tickets.get(hash_secret(ticket))
    if not payload or payload["expire_at"] < now_utc():
        raise AppError(ErrorCode.AUTH_REQUIRED, "OAuth ticket 已失效")
    if expected_intent and payload.get("intent", OAUTH_INTENT_LOGIN) != expected_intent:
        raise AppError(ErrorCode.BUSINESS_RULE, "当前 OAuth ticket 不适用于该操作")
    return payload


def replace_ticket(ticket: str, payload: dict) -> str:
    oauth_login_tickets.pop(hash_secret(ticket), None)
    bind_ticket = generate_token_urlsafe(48)
    payload["expire_at"] = now_utc() + timedelta(minutes=OAUTH_TICKET_TTL_MINUTES)
    oauth_login_tickets[hash_secret(bind_ticket)] = payload
    return bind_ticket


def pop_ticket(ticket: str) -> dict:
    cleanup_expired_tickets()
    payload = oauth_login_tickets.pop(hash_secret(ticket), None)
    if not payload or payload["expire_at"] < now_utc():
        raise AppError(ErrorCode.AUTH_REQUIRED, "OAuth ticket 已失效")
    return payload


def consume_ticket(ticket: str) -> None:
    cleanup_expired_tickets()
    payload = oauth_login_tickets.get(hash_secret(ticket))
    if not payload or payload["expire_at"] < now_utc():
        raise AppError(ErrorCode.AUTH_REQUIRED, "OAuth ticket 已失效")
    oauth_login_tickets.pop(hash_secret(ticket), None)


def cleanup_expired_tickets() -> None:
    current = now_utc()
    for key, payload in list(oauth_login_tickets.items()):
        if payload["expire_at"] < current:
            oauth_login_tickets.pop(key, None)
