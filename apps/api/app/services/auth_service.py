from datetime import timedelta

from fastapi import Request

from app.core.config import settings
from app.core.database import MongoDatabase
from app.core.errors import AppError, ErrorCode
from app.core.security import (
    create_access_token,
    create_refresh_token,
    generate_code,
    generate_token_urlsafe,
    hash_password,
    hash_secret,
    now_utc,
    verify_password,
)
from app.domains.rbac import GlobalRole, effective_permissions, permissions_for_team_role
from app.models.team import TeamMember
from app.models.auth import EmailVerification, RefreshSession
from app.models.user import User, UserProfile
from app.services.email_service import send_email_verification_code
from app.services.audit_service import write_audit_log


def _team_role_label(role: str) -> str:
    labels = {
        "team_admin": "企业管理员",
        "owner": "任务发布者",
        "reviewer": "审核员",
        "agent": "Agent",
        "labeler": "标注员",
    }
    return labels.get(str(role or ""), str(role or ""))


def public_user_payload(
    user: User,
    team_permissions: list[str] | None = None,
    *,
    display_name: str | None = None,
    team_member: TeamMember | None = None,
) -> dict:
    payload = {
        "user_id": user.id,
        "username": user.username,
        "display_name": display_name or user.username,
        "email": user.email,
        "role": user.global_role,
        "avatar": user.avatar,
        "email_verified": user.email_verified,
        "permissions": effective_permissions(user.global_role, team_permissions),
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }
    if team_member:
        payload.update({
            "team_id": team_member.team_id,
            "default_team_id": team_member.team_id,
            "team_role": team_member.team_role,
            "team_role_label": _team_role_label(team_member.team_role),
        })
    return payload


def default_team_member(db: MongoDatabase, user_id: str) -> TeamMember | None:
    return db.find_one(TeamMember, {"user_id": user_id, "status": "active"}, sort=[("joined_at", 1)])


def team_member_permissions(member: TeamMember | None) -> list[str] | None:
    if not member:
        return None
    if member.permissions_customized:
        return sorted(set(member.permissions or []))
    return permissions_for_team_role(member.team_role)


def send_email_code(db: MongoDatabase, email: str, purpose: str) -> dict:
    latest = db.find_one(EmailVerification, {"email": email.lower(), "purpose": purpose}, sort=[("created_at", -1)])
    if latest and (now_utc() - latest.created_at.replace(tzinfo=now_utc().tzinfo)).total_seconds() < settings.email_code_resend_seconds:
        raise AppError(ErrorCode.BUSINESS_RULE, "验证码发送过于频繁")

    code = generate_code()
    verification = EmailVerification(
        email=email.lower(),
        purpose=purpose,
        code_hash=hash_secret(code, settings.verification_code_pepper),
        expire_at=now_utc() + timedelta(minutes=settings.email_code_expire_minutes),
    )
    db.add(verification)
    send_email_verification_code(email.lower(), code, purpose)
    db.commit()
    return {"email": mask_email(email), "expire_in_seconds": settings.email_code_expire_minutes * 60}


def mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    if len(local) <= 2:
        masked = local[0] + "*"
    else:
        masked = local[:2] + "***"
    return f"{masked}@{domain}"


def validate_email_code(db: MongoDatabase, email: str, code: str, purpose: str, *, consume: bool = True) -> None:
    if purpose == "register" and not settings.smtp_enabled and settings.environment not in {"production", "prod"}:
        return
    verification = db.find_one(EmailVerification, {"email": email.lower(), "purpose": purpose, "consumed": False}, sort=[("created_at", -1)])
    if not verification:
        raise AppError(ErrorCode.VALIDATION_FORMAT, "验证码无效或已过期")
    if verification.expire_at.replace(tzinfo=now_utc().tzinfo) < now_utc():
        raise AppError(ErrorCode.VALIDATION_FORMAT, "验证码无效或已过期")
    if verification.attempts >= settings.email_code_max_attempts:
        raise AppError(ErrorCode.VALIDATION_FORMAT, "验证码无效或已过期")
    if verification.code_hash != hash_secret(code, settings.verification_code_pepper):
        verification.attempts += 1
        db.save(verification)
        raise AppError(ErrorCode.VALIDATION_FORMAT, "验证码无效或已过期")
    if consume:
        verification.attempts += 1
        verification.consumed = True
        db.save(verification)


def consume_email_code(db: MongoDatabase, email: str, code: str, purpose: str) -> None:
    validate_email_code(db, email, code, purpose, consume=True)


def register_user(
    db: MongoDatabase,
    *,
    username: str,
    display_name: str,
    email: str,
    password: str,
    role: str,
    email_code: str,
    request: Request,
) -> User:
    email = email.lower()
    if db.find_one(User, {"$or": [{"email": email}, {"username": username}]}):
        raise AppError(ErrorCode.RESOURCE_EXISTS, "用户已存在")
    consume_email_code(db, email, email_code, "register")
    user = User(
        username=username,
        email=email,
        password_hash=hash_password(password),
        global_role=role,
        email_verified=True,
    )
    db.add(user)
    db.add(UserProfile(user_id=user.id, display_name=display_name))
    write_audit_log(db, entity_type="user", entity_id=user.id, action="registered", operator_id=user.id, request=request)
    db.commit()
    return user


def update_user_role(db: MongoDatabase, user: User, role: str) -> User:
    user.global_role = role
    user.updated_at = now_utc().replace(tzinfo=None)
    db.save(user)
    return user


def update_labeler_onboarding_profile(db: MongoDatabase, user: User, profile: dict) -> None:
    user_profile = db.find_one(UserProfile, {"user_id": user.id})
    if not user_profile:
        user_profile = UserProfile(user_id=user.id, display_name=user.username)
        db.add(user_profile)
    domains = split_profile_tags(profile.get("domains", ""))
    task_types = split_profile_tags(profile.get("task_types", ""))
    user_profile.expertise_tags = list(dict.fromkeys([*domains, *task_types, str(profile.get("qualification", "")).strip()]))
    user_profile.bio = profile.get("experience") or user_profile.bio
    user_profile.notification_settings = {
        **(user_profile.notification_settings or {}),
        "onboarding": {
            "identity": "labeler",
            "domains": profile.get("domains"),
            "qualification": profile.get("qualification"),
            "task_types": profile.get("task_types"),
            "experience": profile.get("experience"),
        },
    }
    user_profile.updated_at = now_utc().replace(tzinfo=None)
    db.save(user_profile)


def split_profile_tags(value: object) -> list[str]:
    normalized = str(value).replace("/", ",").replace("|", ",").replace(";", ",")
    return [item.strip() for item in normalized.split(",") if item.strip()]


def register_admin(
    db: MongoDatabase,
    *,
    username: str,
    display_name: str,
    email: str,
    password: str,
    email_code: str,
    request: Request,
) -> User:
    email = email.lower()
    if db.find_one(User, {"$or": [{"email": email}, {"username": username}]}):
        raise AppError(ErrorCode.RESOURCE_EXISTS, "用户已存在")
    consume_email_code(db, email, email_code, "register")
    user = User(
        username=username,
        email=email,
        password_hash=hash_password(password),
        global_role=GlobalRole.ADMIN,
        email_verified=True,
    )
    db.add(user)
    db.add(UserProfile(user_id=user.id, display_name=display_name))
    write_audit_log(db, entity_type="user", entity_id=user.id, action="admin_registered", operator_id=user.id, request=request)
    db.commit()
    return user


def authenticate_user(db: MongoDatabase, account: str, password: str) -> User:
    account_normalized = account.lower()
    user = db.find_one(User, {"$or": [{"email": account_normalized}, {"username": account_normalized}]})
    if not user or not user.password_hash or not verify_password(password, user.password_hash):
        raise AppError(ErrorCode.INVALID_CREDENTIALS, "账号或密码错误")
    if user.status != "active":
        raise AppError(ErrorCode.AUTH_REQUIRED, "账号不可用")
    if not user.email_verified:
        raise AppError(ErrorCode.BUSINESS_RULE, "邮箱未验证")
    return user


def issue_token_pair(db: MongoDatabase, user: User, request: Request | None = None) -> dict:
    jti = generate_token_urlsafe(32)
    session = RefreshSession(
        user_id=user.id,
        jti_hash=hash_secret(jti),
        expire_at=now_utc() + timedelta(days=settings.refresh_token_expire_days),
        user_agent=request.headers.get("user-agent") if request else None,
        ip_address=request.client.host if request and request.client else None,
    )
    db.add(session)
    access_token = create_access_token(user.id, {"role": user.global_role, "sid": session.id})
    refresh_token = create_refresh_token(user.id, jti)
    profile = db.find_one(UserProfile, {"user_id": user.id})
    team_member = default_team_member(db, user.id)
    db.commit()
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_in": settings.access_token_expire_minutes * 60,
        "token_type": "Bearer",
        "user": public_user_payload(
            user,
            team_member_permissions(team_member),
            display_name=profile.display_name if profile else None,
            team_member=team_member,
        ),
    }


def rotate_refresh_token(db: MongoDatabase, refresh_token: str, request: Request | None = None) -> dict:
    payload = decode_refresh_token(refresh_token)
    jti_hash = hash_secret(payload["jti"])
    session = db.find_one(RefreshSession, {"jti_hash": jti_hash})
    if not session or session.revoked or session.expire_at.replace(tzinfo=now_utc().tzinfo) < now_utc():
        if session and session.user_id:
            revoke_all_user_sessions(db, session.user_id)
        raise AppError(ErrorCode.AUTH_REQUIRED, "请先登录")
    if session.user_id != payload["sub"]:
        raise AppError(ErrorCode.AUTH_REQUIRED, "请先登录")
    user = db.get(User, payload["sub"])
    if not user or user.status != "active":
        raise AppError(ErrorCode.AUTH_REQUIRED, "请先登录")
    new_jti = generate_token_urlsafe(32)
    session.revoked = True
    session.replaced_by_hash = hash_secret(new_jti)
    db.save(session)
    next_session = RefreshSession(
        user_id=user.id,
        jti_hash=hash_secret(new_jti),
        expire_at=now_utc() + timedelta(days=settings.refresh_token_expire_days),
        user_agent=request.headers.get("user-agent") if request else None,
        ip_address=request.client.host if request and request.client else None,
    )
    db.add(next_session)
    access_token = create_access_token(user.id, {"role": user.global_role, "sid": next_session.id})
    next_refresh_token = create_refresh_token(user.id, new_jti)
    profile = db.find_one(UserProfile, {"user_id": user.id})
    team_member = default_team_member(db, user.id)
    db.commit()
    return {
        "access_token": access_token,
        "refresh_token": next_refresh_token,
        "expires_in": settings.access_token_expire_minutes * 60,
        "token_type": "Bearer",
        "user": public_user_payload(
            user,
            team_member_permissions(team_member),
            display_name=profile.display_name if profile else None,
            team_member=team_member,
        ),
    }


def decode_refresh_token(token: str) -> dict:
    from app.core.security import decode_token

    payload = decode_token(token)
    if payload.get("typ") != "refresh":
        raise AppError(ErrorCode.AUTH_REQUIRED, "请先登录")
    if not isinstance(payload.get("sub"), str) or not payload["sub"]:
        raise AppError(ErrorCode.AUTH_REQUIRED, "请先登录")
    if not isinstance(payload.get("jti"), str) or not payload["jti"]:
        raise AppError(ErrorCode.AUTH_REQUIRED, "请先登录")
    return payload


def revoke_refresh_token(
    db: MongoDatabase,
    refresh_token: str | None,
    user_id: str | None = None,
    current_session_id: str | None = None,
) -> None:
    if refresh_token:
        payload = decode_refresh_token(refresh_token)
        if user_id and payload.get("sub") != user_id:
            raise AppError(ErrorCode.AUTH_REQUIRED, "请先登录")
        session = db.find_one(RefreshSession, {"jti_hash": hash_secret(payload["jti"])})
        now = now_utc()
        if not session or session.revoked or session.expire_at.replace(tzinfo=now.tzinfo) < now:
            raise AppError(ErrorCode.AUTH_REQUIRED, "璇峰厛鐧诲綍")
        if user_id and session.user_id != user_id:
            raise AppError(ErrorCode.AUTH_REQUIRED, "璇峰厛鐧诲綍")
        if current_session_id and session.id != current_session_id:
            raise AppError(ErrorCode.AUTH_REQUIRED, "璇峰厛鐧诲綍")
        if session:
            if user_id and session.user_id != user_id:
                raise AppError(ErrorCode.AUTH_REQUIRED, "请先登录")
            session.revoked = True
            db.save(session)
    elif user_id and current_session_id:
        session = db.get(RefreshSession, current_session_id)
        if not session or session.user_id != user_id:
            raise AppError(ErrorCode.AUTH_REQUIRED, "请先登录")
        session.revoked = True
        db.save(session)
    elif user_id:
        raise AppError(ErrorCode.AUTH_REQUIRED, "请先登录")
    db.commit()


def revoke_all_user_sessions(db: MongoDatabase, user_id: str) -> None:
    sessions = db.find(RefreshSession, {"user_id": user_id, "revoked": False})
    for session in sessions:
        session.revoked = True
        db.save(session)


def revoke_other_user_sessions(
    db: MongoDatabase,
    user: User,
    refresh_token: str | None,
    request: Request,
    access_session_id: str,
) -> dict:
    if not refresh_token:
        raise AppError(ErrorCode.AUTH_REQUIRED, "缺少当前会话凭证，请重新登录后再试")

    current_session_id: str | None = None
    try:
        payload = decode_refresh_token(refresh_token)
        session = db.find_one(RefreshSession, {"jti_hash": hash_secret(payload["jti"]), "user_id": user.id})
        now = now_utc()
        if session and not session.revoked and session.expire_at.replace(tzinfo=now.tzinfo) >= now:
            current_session_id = session.id
    except AppError as exc:
        raise AppError(ErrorCode.AUTH_REQUIRED, "当前会话已失效，请重新登录后再试") from exc

    if not current_session_id:
        raise AppError(ErrorCode.AUTH_REQUIRED, "无法识别当前会话，请重新登录后再试")
    if current_session_id != access_session_id:
        raise AppError(ErrorCode.AUTH_REQUIRED, "当前会话凭证不匹配，请重新登录后再试")

    revoked_count = 0
    sessions = db.find(RefreshSession, {"user_id": user.id, "revoked": False})
    for session in sessions:
        if current_session_id and session.id == current_session_id:
            continue
        session.revoked = True
        db.save(session)
        revoked_count += 1

    write_audit_log(
        db,
        entity_type="user",
        entity_id=user.id,
        action="user_sessions_revoked",
        operator_id=user.id,
        changes={"revoked_count": revoked_count, "kept_current_session": True},
        request=request,
    )
    db.commit()
    return {"revoked_count": revoked_count, "kept_current_session": True}


def change_password(db: MongoDatabase, user: User, old_password: str, new_password: str, request: Request) -> None:
    if not user.password_hash or not verify_password(old_password, user.password_hash):
        raise AppError(ErrorCode.INVALID_CREDENTIALS, "账号或密码错误")
    user.password_hash = hash_password(new_password)
    db.save(user)
    revoke_all_user_sessions(db, user.id)
    write_audit_log(db, entity_type="user", entity_id=user.id, action="password_changed", operator_id=user.id, request=request)
    db.commit()


def reset_password(db: MongoDatabase, email: str, email_code: str, new_password: str, request: Request) -> None:
    email = email.lower()
    user = db.find_one(User, {"email": email})
    consume_email_code(db, email, email_code, "reset_password")
    if not user or user.status != "active":
        db.commit()
        return
    user.password_hash = hash_password(new_password)
    db.save(user)
    revoke_all_user_sessions(db, user.id)
    write_audit_log(db, entity_type="user", entity_id=user.id, action="password_reset", operator_id=user.id, request=request)
    db.commit()


def mark_confirmed_email(db: MongoDatabase, email: str, code: str, purpose: str) -> dict:
    validate_email_code(db, email.lower(), code, purpose, consume=False)
    db.commit()
    return {"email": mask_email(email), "confirmed": True}
