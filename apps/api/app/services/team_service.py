from datetime import timedelta
from urllib.parse import urlencode

from fastapi import Request

from app.core.config import settings
from app.core.database import MongoDatabase
from app.core.errors import AppError, ErrorCode
from app.core.security import generate_token_urlsafe, hash_password, hash_secret, now_utc
from app.domains.rbac import TeamRole, permissions_for_team_role, role_value
from app.models.resource import TeamAiWallet
from app.models.team import Team, TeamInvitation, TeamMember
from app.models.upload import UploadedFile
from app.models.user import User, UserProfile
from app.schemas.auth import validate_display_name_value, validate_username_value
from app.services.audit_service import write_audit_log
from app.services.email_service import send_team_invitation_email
from app.services.membership_service import assert_member_capacity, membership_payload
from app.services.notification_dispatcher import notify_team_security_event
from app.services.notification_service import create_notification

SYSTEM_AGENT_DISPLAY_NAME = "Agent"
SYSTEM_AGENT_USERNAME_SUFFIX = "_ai_agent"
SYSTEM_AGENT_ROLE_LABEL = "Agent"
SYSTEM_AGENT_AVATAR_BASE_PATH = "/agent-avatars"
SYSTEM_AGENT_PRESET_AVATARS = [
    {
        "key": "agent-orbit",
        "label": "Orbit",
        "url": f"{SYSTEM_AGENT_AVATAR_BASE_PATH}/agent-orbit.svg",
        "description": "Default official avatar for a general Agent identity.",
    },
    {
        "key": "agent-bubble",
        "label": "Bubble",
        "url": f"{SYSTEM_AGENT_AVATAR_BASE_PATH}/agent-bubble.svg",
        "description": "Soft round blue Agent avatar.",
    },
    {
        "key": "agent-grid",
        "label": "Grid",
        "url": f"{SYSTEM_AGENT_AVATAR_BASE_PATH}/agent-grid.svg",
        "description": "Structured Agent avatar.",
    },
    {
        "key": "agent-spark",
        "label": "Spark",
        "url": f"{SYSTEM_AGENT_AVATAR_BASE_PATH}/agent-spark.svg",
        "description": "Action-oriented Agent avatar.",
    },
    {
        "key": "agent-shield",
        "label": "Shield",
        "url": f"{SYSTEM_AGENT_AVATAR_BASE_PATH}/agent-shield.svg",
        "description": "Stable guardian-style Agent avatar.",
    },
]

INVITE_MODE_EMAIL = "email"
INVITE_MODE_CODE = "code"


def ensure_team_role_user_assignable(team_role: str) -> str:
    normalized = role_value(team_role)
    if normalized == TeamRole.AGENT.value:
        raise AppError(ErrorCode.BUSINESS_RULE, "Agent 为系统角色，不支持人工创建、修改或邀请")
    return normalized


def permissions_within_team_role(team_role: str, permissions: list[str] | None) -> list[str]:
    defaults = permissions_for_team_role(team_role)
    if permissions is None:
        return defaults
    allowed = set(defaults)
    requested = list(dict.fromkeys(permissions))
    invalid = sorted(set(requested) - allowed)
    if invalid:
        raise AppError(
            ErrorCode.BUSINESS_RULE,
            "成员权限不能超出目标企业角色默认权限",
            {"team_role": team_role, "invalid_permissions": invalid},
        )
    return requested


def active_team_admin_members(
    db: MongoDatabase,
    team_id: str,
    *,
    exclude_user_ids: set[str] | None = None,
) -> list[TeamMember]:
    members = db.find(
        TeamMember,
        {"team_id": team_id, "team_role": TeamRole.TEAM_ADMIN.value, "status": "active"},
    )
    if not exclude_user_ids:
        return members
    return [member for member in members if member.user_id not in exclude_user_ids]


def ensure_team_admin_assignment_available(
    db: MongoDatabase,
    *,
    team_id: str,
    team_role: str,
    exclude_user_ids: set[str] | None = None,
) -> None:
    if role_value(team_role) != TeamRole.TEAM_ADMIN.value:
        return
    if active_team_admin_members(db, team_id, exclude_user_ids=exclude_user_ids):
        raise AppError(ErrorCode.BUSINESS_RULE, "每个企业只能有一个 Team Admin")


def ensure_team_admin_membership_preserved(
    db: MongoDatabase,
    *,
    team_id: str,
    member: TeamMember,
    next_team_role: str | None = None,
    next_status: str | None = None,
) -> None:
    if role_value(member.team_role) != TeamRole.TEAM_ADMIN.value:
        return
    target_role = role_value(next_team_role or member.team_role)
    target_status = next_status or member.status or "active"
    if target_role == TeamRole.TEAM_ADMIN.value and target_status == "active":
        return
    if active_team_admin_members(db, team_id, exclude_user_ids={member.user_id}):
        return
    raise AppError(ErrorCode.BUSINESS_RULE, "企业必须保留唯一的 Team Admin")


def is_system_member(member: TeamMember | None) -> bool:
    return bool(member and (member.is_system_member or role_value(member.team_role) == TeamRole.AGENT.value))


def system_agent_username(team_id: str) -> str:
    return f"aiagt_{team_id[-14:]}"


def default_system_agent_avatar() -> str:
    return SYSTEM_AGENT_PRESET_AVATARS[0]["url"]


def invitation_mode_value(invite_mode: str | None) -> str:
    return INVITE_MODE_CODE if invite_mode == INVITE_MODE_CODE else INVITE_MODE_EMAIL


def absolute_frontend_url(path: str) -> str:
    base = settings.frontend_app_url.rstrip("/")
    normalized_path = path if path.startswith("/") else f"/{path}"
    return f"{base}{normalized_path}"


def invitation_join_url(invite_code: str) -> str:
    query = urlencode({"organization_action": "join", "invite_code": invite_code})
    return absolute_frontend_url(f"/onboarding?{query}")


def system_agent_preset_avatar_options() -> list[dict]:
    return [dict(item) for item in SYSTEM_AGENT_PRESET_AVATARS]


def detect_system_agent_preset_key(avatar: str | None) -> str | None:
    if not avatar:
        return None
    for option in SYSTEM_AGENT_PRESET_AVATARS:
        if option["url"] == avatar:
            return option["key"]
    return None


def _is_uploaded_agent_avatar(db: MongoDatabase, team_id: str, avatar: str) -> bool:
    if not avatar:
        return False
    return db.find_one(UploadedFile, {"team_id": f"agent:{team_id}", "url": avatar}) is not None


def _system_agent_member(db: MongoDatabase, team_id: str) -> TeamMember:
    member = db.find_one(TeamMember, {"team_id": team_id, "team_role": TeamRole.AGENT.value}, sort=[("joined_at", 1)])
    if not member:
        raise AppError(ErrorCode.NOT_FOUND, "系统 Agent 不存在")
    return member


def _system_agent_user_and_profile(db: MongoDatabase, member: TeamMember) -> tuple[User, UserProfile]:
    user = db.get(User, member.user_id)
    if not user:
        raise AppError(ErrorCode.NOT_FOUND, "系统 Agent 不存在")
    profile = db.find_one(UserProfile, {"user_id": member.user_id})
    if not profile:
        raise AppError(ErrorCode.NOT_FOUND, "系统 Agent 档案缺失，请先人工清洗历史数据")
    return user, profile


def create_system_agent_member(db: MongoDatabase, *, team: Team) -> TeamMember:
    existing_member = db.find_one(TeamMember, {"team_id": team.id, "team_role": TeamRole.AGENT.value})
    if existing_member:
        return existing_member
    username = system_agent_username(team.id)
    user = db.find_one(User, {"username": username})
    if not user:
        user = User(
            username=username,
            email=None,
            password_hash=None,
            global_role="agent",
            avatar=default_system_agent_avatar(),
            email_verified=True,
        )
        db.add(user)
        db.add(UserProfile(user_id=user.id, display_name=SYSTEM_AGENT_DISPLAY_NAME))
    elif not user.avatar:
        user.avatar = default_system_agent_avatar()
        user.updated_at = now_utc().replace(tzinfo=None)
        db.save(user)
    member = TeamMember(
        team_id=team.id,
        user_id=user.id,
        team_role=TeamRole.AGENT,
        is_system_member=True,
        permissions=permissions_for_team_role(TeamRole.AGENT),
    )
    db.add(member)
    return member


def create_team_for_admin(
    db: MongoDatabase,
    *,
    owner: User,
    company_name: str,
    industry: str | None,
    contact_phone: str | None,
    description: str | None,
    logo_url: str | None,
    website: str | None,
    address: str | None,
    billing_info: dict | None,
    mailing_info: dict | None,
    request: Request,
) -> dict:
    if db.find_one(Team, {"company_name": company_name}):
        raise AppError(ErrorCode.RESOURCE_EXISTS, "企业已存在")
    team = Team(
        company_name=company_name,
        industry=industry,
        contact_phone=contact_phone,
        description=description,
        logo_url=logo_url,
        website=website,
        address=address,
        billing_info=billing_info,
        mailing_info=mailing_info,
        owner_user_id=owner.id,
    )
    db.add(team)
    member = TeamMember(
        team_id=team.id,
        user_id=owner.id,
        team_role=TeamRole.TEAM_ADMIN,
        permissions=permissions_for_team_role(TeamRole.TEAM_ADMIN),
    )
    db.add(member)
    create_system_agent_member(db, team=team)
    db.add(TeamAiWallet(team_id=team.id, balance_points=0.0))
    write_audit_log(
        db,
        entity_type="team",
        entity_id=team.id,
        action="team_created",
        operator_id=owner.id,
        team_id=team.id,
        changes={"company_name": company_name, "owner_user_id": owner.id},
        request=request,
    )
    db.commit()
    return team_detail(db, team.id)


def update_team_info(
    db: MongoDatabase,
    *,
    team_id: str,
    payload: dict,
    operator_id: str,
    request: Request,
) -> dict:
    team = db.get(Team, team_id)
    if not team:
        raise AppError(ErrorCode.NOT_FOUND, "资源不存在")
    changes = {}
    for field in ["company_name", "industry", "contact_phone", "description", "logo_url", "website", "address", "status", "billing_info", "mailing_info"]:
        if field in payload and payload[field] is not None:
            changes[field] = {"from": getattr(team, field), "to": payload[field]}
            setattr(team, field, payload[field])
    db.save(team)
    write_audit_log(
        db,
        entity_type="team",
        entity_id=team_id,
        action="team_updated",
        operator_id=operator_id,
        team_id=team_id,
        changes=changes,
        request=request,
    )
    db.commit()
    return team_detail(db, team_id)


def team_admin_only(current_team_role: str | None) -> None:
    if role_value(current_team_role) != TeamRole.TEAM_ADMIN.value:
        raise AppError(ErrorCode.PERMISSION_DENIED, "仅 Team Admin 可以管理 Agent 设置")


def system_agent_settings_payload(db: MongoDatabase, team_id: str) -> dict:
    member = _system_agent_member(db, team_id)
    user, profile = _system_agent_user_and_profile(db, member)
    avatar = user.avatar or default_system_agent_avatar()
    preset_key = detect_system_agent_preset_key(avatar)
    return {
        "user_id": user.id,
        "username": user.username,
        "team_role": TeamRole.AGENT.value,
        "role_label": SYSTEM_AGENT_ROLE_LABEL,
        "display_name": profile.display_name or SYSTEM_AGENT_DISPLAY_NAME,
        "avatar": avatar,
        "preset_avatar_key": preset_key,
        "default_display_name": SYSTEM_AGENT_DISPLAY_NAME,
        "default_avatar_url": default_system_agent_avatar(),
        "preset_avatar_options": system_agent_preset_avatar_options(),
        "is_system_member": is_system_member(member),
        "editable_fields": ["display_name", "avatar"],
    }


def update_system_agent_settings(
    db: MongoDatabase,
    *,
    team_id: str,
    display_name: str,
    avatar: str,
    preset_avatar_key: str | None,
    operator_id: str,
    request: Request,
) -> dict:
    member = _system_agent_member(db, team_id)
    user, profile = _system_agent_user_and_profile(db, member)
    next_display_name = display_name.strip() or SYSTEM_AGENT_DISPLAY_NAME
    next_avatar = avatar.strip()
    current_avatar = user.avatar or default_system_agent_avatar()
    if not next_avatar:
        raise AppError(ErrorCode.VALIDATION_FORMAT, "Agent 头像不能为空")
    if preset_avatar_key:
        preset = next((item for item in SYSTEM_AGENT_PRESET_AVATARS if item["key"] == preset_avatar_key), None)
        if not preset:
            raise AppError(ErrorCode.VALIDATION_FORMAT, "预设 Agent 头像不存在")
        if preset["url"] != next_avatar:
            raise AppError(ErrorCode.VALIDATION_FORMAT, "预设头像标识与头像 URL 不匹配")
    elif next_avatar != current_avatar and not _is_uploaded_agent_avatar(db, team_id, next_avatar):
        raise AppError(ErrorCode.VALIDATION_FORMAT, "请先上传有效的 Agent 头像")
    changes = {
        "display_name": {"from": profile.display_name or SYSTEM_AGENT_DISPLAY_NAME, "to": next_display_name},
        "avatar": {"from": current_avatar, "to": next_avatar},
        "preset_avatar_key": {
            "from": detect_system_agent_preset_key(user.avatar),
            "to": preset_avatar_key,
        },
    }
    profile.display_name = next_display_name
    profile.updated_at = now_utc().replace(tzinfo=None)
    user.avatar = next_avatar
    user.updated_at = now_utc().replace(tzinfo=None)
    db.save(profile)
    db.save(user)
    write_audit_log(
        db,
        entity_type="system_agent",
        entity_id=member.user_id,
        action="system_agent_settings_updated",
        operator_id=operator_id,
        team_id=team_id,
        changes=changes,
        request=request,
    )
    db.commit()
    return system_agent_settings_payload(db, team_id)


def submit_team_verification(
    db: MongoDatabase,
    *,
    team_id: str,
    payload: dict,
    operator_id: str,
    request: Request,
) -> dict:
    team = db.get(Team, team_id)
    if not team:
        raise AppError(ErrorCode.NOT_FOUND, "资源不存在")
    changes = {}
    for field in ["legal_name", "registration_number", "verification_contact", "verification_phone", "verification_materials"]:
        changes[field] = {"from": getattr(team, field), "to": payload[field]}
        setattr(team, field, payload[field])
    changes["verification_status"] = {"from": team.verification_status, "to": "pending_review"}
    team.verification_status = "pending_review"
    team.verification_review_comment = None
    team.verification_submitted_at = now_utc().replace(tzinfo=None)
    team.updated_at = now_utc().replace(tzinfo=None)
    db.save(team)
    write_audit_log(
        db,
        entity_type="team",
        entity_id=team_id,
        action="team_verification_submitted",
        operator_id=operator_id,
        team_id=team_id,
        changes=changes,
        request=request,
    )
    db.commit()
    return team_detail(db, team_id)


def team_detail(db: MongoDatabase, team_id: str) -> dict:
    team = db.get(Team, team_id)
    if not team:
        raise AppError(ErrorCode.NOT_FOUND, "资源不存在")
    members = db.find(TeamMember, {"team_id": team_id, "status": "active"})
    stats = {"owners": 0, "reviewers": 0, "agents": 0, "labelers": 0, "team_admins": 0}
    for member in members:
        team_role = role_value(member.team_role)
        key = f"{team_role}s"
        if role_value(member.team_role) == TeamRole.TEAM_ADMIN.value:
            key = "team_admins"
        stats[key] = stats.get(key, 0) + 1
    return {
        "team_id": team.id,
        "company_name": team.company_name,
        "industry": team.industry,
        "contact_phone": team.contact_phone,
        "description": team.description,
        "logo_url": team.logo_url,
        "website": team.website,
        "address": team.address,
        "owner_user_id": team.owner_user_id,
        "status": team.status,
        "verification_status": team.verification_status,
        "legal_name": team.legal_name,
        "registration_number": team.registration_number,
        "verification_contact": team.verification_contact,
        "verification_phone": team.verification_phone,
        "verification_materials": team.verification_materials,
        "verification_review_comment": team.verification_review_comment,
        "verification_submitted_at": team.verification_submitted_at.isoformat() if team.verification_submitted_at else None,
        "billing_info": team.billing_info,
        "mailing_info": team.mailing_info,
        "member_count": len(members),
        "member_stats": stats,
        "membership": membership_payload(db, team_id),
        "ai_budget": {"total_limit": 0, "used": 0, "remaining": 0},
        "created_at": team.created_at.isoformat() if team.created_at else None,
    }


def admin_overview(db: MongoDatabase, user_id: str) -> dict:
    memberships = db.find(TeamMember, {"user_id": user_id, "status": "active"})
    teams = [team_detail(db, member.team_id) for member in memberships]
    return {
        "teams": teams,
        "default_team_id": teams[0]["team_id"] if teams else None,
        "team_count": len(teams),
        "notifications": [],
    }


def list_members(db: MongoDatabase, team_id: str, role: str | None = None, status: str | None = None, keyword: str | None = None, current_user_id: str | None = None) -> list[dict]:
    query: dict = {"team_id": team_id}
    if role:
        query["team_role"] = role
    if status:
        query["status"] = status
    members = db.find(TeamMember, query, sort=[("joined_at", -1)])
    if keyword:
        lowered = keyword.lower()
        members = [
            member
            for member in members
            if (user := db.get(User, member.user_id))
            and (
                lowered in user.username.lower()
                or (user.email and lowered in user.email.lower())
                or (
                    (profile := db.find_one(UserProfile, {"user_id": member.user_id}))
                    and profile.display_name
                    and lowered in profile.display_name.lower()
                )
            )
        ]
    return [member_payload(db, member, current_user_id=current_user_id) for member in members]


def add_member(
    db: MongoDatabase,
    *,
    team_id: str,
    user_id: str,
    team_role: str,
    permissions: list[str] | None,
    assigned_review_tasks: list[str],
    operator_id: str,
    request: Request,
) -> dict:
    normalized_team_role = ensure_team_role_user_assignable(team_role)
    normalized_permissions = permissions_within_team_role(normalized_team_role, permissions)
    if not db.get(Team, team_id):
        raise AppError(ErrorCode.NOT_FOUND, "资源不存在")
    user = db.get(User, user_id)
    if not user:
        raise AppError(ErrorCode.NOT_FOUND, "资源不存在")
    if db.find_one(TeamMember, {"team_id": team_id, "user_id": user_id}):
        raise AppError(ErrorCode.RESOURCE_EXISTS, "成员已存在")
    ensure_team_admin_assignment_available(db, team_id=team_id, team_role=normalized_team_role)
    assert_member_capacity(db, team_id, add_count=1)
    member = TeamMember(
        team_id=team_id,
        user_id=user_id,
        team_role=normalized_team_role,
        permissions=normalized_permissions,
        permissions_customized=permissions is not None,
        assigned_review_tasks=assigned_review_tasks,
    )
    db.add(member)
    write_audit_log(
        db,
        entity_type="team_member",
        entity_id=user_id,
        action="member_added",
        operator_id=operator_id,
        team_id=team_id,
        changes={"team_id": team_id, "team_role": normalized_team_role},
        request=request,
    )
    notify_team_security_event(
        db,
        team_id=team_id,
        event_key=f"team:{team_id}:member:{user_id}:added",
        title="你已加入企业团队",
        content=f"你已加入当前企业团队，角色为 {team_role_label(normalized_team_role)}。",
        target_user_ids=[user_id],
        actor_id=operator_id,
        related_entity_id=user_id,
        metadata={"team_role": normalized_team_role},
        request=request,
    )
    db.commit()
    return member_payload(db, member)


def create_member_account(
    db: MongoDatabase,
    *,
    team_id: str,
    username: str,
    invite_mode: str,
    email: str | None,
    password_hash: str,
    team_role: str,
    permissions: list[str] | None,
    assigned_review_tasks: list[str],
    display_name: str,
    operator_id: str,
    request: Request,
) -> dict:
    email = email.lower()
    normalized_team_role = ensure_team_role_user_assignable(team_role)
    normalized_permissions = permissions_within_team_role(normalized_team_role, permissions)
    if not db.get(Team, team_id):
        raise AppError(ErrorCode.NOT_FOUND, "资源不存在")
    if db.find_one(User, {"$or": [{"email": email}, {"username": username}]}):
        raise AppError(ErrorCode.RESOURCE_EXISTS, "用户已存在")
    ensure_team_admin_assignment_available(db, team_id=team_id, team_role=normalized_team_role)
    assert_member_capacity(db, team_id, add_count=1)
    user_global_role = "labeler" if normalized_team_role == TeamRole.LABELER.value else "user"
    if normalized_team_role == TeamRole.REVIEWER.value:
        user_global_role = "reviewer"
    user = User(
        username=username,
        email=email,
        password_hash=password_hash,
        global_role=user_global_role,
        email_verified=True,
    )
    db.add(user)
    db.add(UserProfile(user_id=user.id, display_name=display_name))
    member = TeamMember(
        team_id=team_id,
        user_id=user.id,
        team_role=normalized_team_role,
        permissions=normalized_permissions,
        permissions_customized=permissions is not None,
        assigned_review_tasks=assigned_review_tasks,
    )
    db.add(member)
    write_audit_log(
        db,
        entity_type="team_member",
        entity_id=user.id,
        action="member_account_created",
        operator_id=operator_id,
        team_id=team_id,
        changes={"team_id": team_id, "team_role": normalized_team_role, "email": email},
        request=request,
    )
    db.commit()
    return member_payload(db, member)


def import_members(
    db: MongoDatabase,
    *,
    team_id: str,
    rows: list[dict],
    default_password: str | None,
    operator_id: str,
    request: Request,
) -> dict:
    if not db.get(Team, team_id):
        raise AppError(ErrorCode.NOT_FOUND, "资源不存在")
    seen_emails: set[str] = set()
    results = []
    imported_members = []
    for index, row in enumerate(rows, start=1):
        email = str(row.get("email") or "").strip().lower()
        team_role = row.get("team_role")
        try:
            normalized_team_role = ensure_team_role_user_assignable(team_role)
        except AppError as exc:
            results.append({"row": index, "email": email, "status": "skipped", "reason": exc.message})
            continue
        if not email:
            results.append({"row": index, "email": email, "status": "skipped", "reason": "邮箱不能为空"})
            continue
        if email in seen_emails:
            results.append({"row": index, "email": email, "status": "skipped", "reason": "Duplicate email in import content"})
            continue
        seen_emails.add(email)
        user = db.find_one(User, {"email": email})
        username = str(row.get("username") or "").strip()
        display_name = str(row.get("display_name") or "").strip()
        if user and db.find_one(TeamMember, {"team_id": team_id, "user_id": user.id}):
            results.append({"row": index, "email": email, "user_id": user.id, "status": "skipped", "reason": "成员已存在"})
            continue
        try:
            ensure_team_admin_assignment_available(db, team_id=team_id, team_role=normalized_team_role)
        except AppError as exc:
            results.append({"row": index, "email": email, "status": "skipped", "reason": exc.message})
            continue
        try:
            assert_member_capacity(db, team_id, add_count=1)
        except AppError as exc:
            results.append({"row": index, "email": email, "status": "skipped", "reason": exc.message})
            continue
        if user:
            member = TeamMember(
                team_id=team_id,
                user_id=user.id,
                team_role=normalized_team_role,
                permissions=permissions_for_team_role(normalized_team_role),
                assigned_review_tasks=row.get("assigned_review_tasks") or [],
            )
            db.add(member)
            action = "member_imported"
        else:
            if not username:
                results.append({"row": index, "email": email, "status": "skipped", "reason": "缺少登录账号 username"})
                continue
            if not display_name:
                results.append({"row": index, "email": email, "status": "skipped", "reason": "Missing display_name"})
                continue
            try:
                username = validate_username_value(username)
            except ValueError as exc:
                results.append({"row": index, "email": email, "status": "skipped", "reason": str(exc)})
                continue
            try:
                display_name = validate_display_name_value(display_name)
            except ValueError as exc:
                results.append({"row": index, "email": email, "status": "skipped", "reason": str(exc)})
                continue
            password = row.get("password") or default_password
            if not password:
                results.append({"row": index, "email": email, "status": "skipped", "reason": "新用户缺少初始密码或默认密码"})
                continue
            if db.find_one(User, {"username": username}):
                results.append({"row": index, "email": email, "status": "skipped", "reason": "用户名已存在"})
                continue
            user = User(
                username=username,
                email=email,
                password_hash=hash_password(password),
                global_role=global_role_for_team_role(normalized_team_role),
                email_verified=True,
            )
            db.add(user)
            db.add(UserProfile(user_id=user.id, display_name=display_name))
            member = TeamMember(
                team_id=team_id,
                user_id=user.id,
                team_role=normalized_team_role,
                permissions=permissions_for_team_role(normalized_team_role),
                assigned_review_tasks=row.get("assigned_review_tasks") or [],
            )
            db.add(member)
            action = "member_account_imported"
        write_audit_log(
            db,
            entity_type="team_member",
            entity_id=user.id,
            action=action,
            operator_id=operator_id,
            team_id=team_id,
            changes={"team_id": team_id, "team_role": normalized_team_role, "email": email, "row": index},
            request=request,
        )
        results.append({"row": index, "email": email, "user_id": user.id, "status": "imported", "team_role": normalized_team_role})
        imported_members.append(member_payload(db, member))
    imported_count = len([item for item in results if item["status"] == "imported"])
    skipped_count = len([item for item in results if item["status"] == "skipped"])
    write_audit_log(
        db,
        entity_type="team",
        entity_id=team_id,
        action="member_batch_import_completed",
        operator_id=operator_id,
        team_id=team_id,
        changes={
            "requested_count": len(rows),
            "imported_count": imported_count,
            "skipped_count": skipped_count,
        },
        request=request,
    )
    db.commit()
    return {
        "requested_count": len(rows),
        "imported_count": imported_count,
        "skipped_count": skipped_count,
        "results": results,
        "members": imported_members,
    }


def invite_member(
    db: MongoDatabase,
    *,
    team_id: str,
    invite_mode: str,
    email: str | None,
    team_role: str,
    permissions: list[str] | None,
    assigned_review_tasks: list[str],
    message: str | None,
    expire_hours: int,
    operator_id: str,
    request: Request,
) -> dict:
    team = db.get(Team, team_id)
    normalized_team_role = ensure_team_role_user_assignable(team_role)
    normalized_permissions = permissions_within_team_role(normalized_team_role, permissions)
    normalized_invite_mode = invitation_mode_value(invite_mode)
    if not team:
        raise AppError(ErrorCode.NOT_FOUND, "资源不存在")
    normalized_email = email.lower() if email else None
    if normalized_invite_mode == INVITE_MODE_EMAIL and not normalized_email:
        raise AppError(ErrorCode.VALIDATION_REQUIRED, "邮箱邀请必须填写邮箱地址")
    ensure_team_admin_assignment_available(db, team_id=team_id, team_role=normalized_team_role)
    raw_code = f"TM-INV-{generate_token_urlsafe(24)}"
    invitation = TeamInvitation(
        team_id=team_id,
        invite_mode=normalized_invite_mode,
        email=normalized_email,
        team_role=normalized_team_role,
        permissions=normalized_permissions,
        permissions_customized=permissions is not None,
        assigned_review_tasks=assigned_review_tasks,
        invite_code_hash=hash_secret(raw_code),
        message=message,
        expire_at=now_utc() + timedelta(hours=expire_hours),
        created_by=operator_id,
    )
    db.add(invitation)
    write_audit_log(
        db,
        entity_type="team_invitation",
        entity_id=team_id,
        action="member_invited",
        operator_id=operator_id,
        team_id=team_id,
        changes={"invite_mode": normalized_invite_mode, "email": normalized_email, "team_role": normalized_team_role},
        request=request,
    )
    db.commit()
    invite_url = invitation_join_url(raw_code)
    if normalized_invite_mode == INVITE_MODE_EMAIL and normalized_email:
        send_team_invitation_email(normalized_email, invite_url, message)
    return {
        "invite_code": raw_code,
        "invite_url": invite_url,
        "expire_at": invitation.expire_at.isoformat(),
        "invite_mode": normalized_invite_mode,
        "email": normalized_email,
    }


def list_invitations(db: MongoDatabase, team_id: str, *, status: str | None = None) -> list[dict]:
    query: dict = {"team_id": team_id}
    if status and status != "all":
        if status == "expired":
            query["status"] = "pending"
            query["expire_at"] = {"$lt": now_utc().replace(tzinfo=None)}
        else:
            query["status"] = status
    invitations = db.find(TeamInvitation, query, sort=[("created_at", -1)])
    items = [invitation_payload(db, invitation) for invitation in invitations]
    if status == "expired":
        return [item for item in items if item["status"] == "expired"]
    return items


def resend_invitation(
    db: MongoDatabase,
    *,
    team_id: str,
    invitation_id: str,
    message: str | None,
    expire_hours: int,
    operator_id: str,
    request: Request,
) -> dict:
    invitation = db.get(TeamInvitation, invitation_id)
    invite_mode = invitation_mode_value(invitation.invite_mode if invitation else None)
    if not invitation or invitation.team_id != team_id:
        raise AppError(ErrorCode.NOT_FOUND, "资源不存在")
    visible_status = invitation_payload(db, invitation)["status"]
    if visible_status not in {"pending", "expired"}:
        raise AppError(ErrorCode.STATE_CONFLICT, "仅待接受或已过期邀请可重发")
    raw_code = f"TM-INV-{generate_token_urlsafe(24)}"
    invitation.invite_code_hash = hash_secret(raw_code)
    invitation.status = "pending"
    invitation.message = message if message is not None else invitation.message
    invitation.expire_at = (now_utc() + timedelta(hours=expire_hours)).replace(tzinfo=None)
    invitation.responded_at = None
    invitation.revoked_by = None
    invitation.revoked_at = None
    db.save(invitation)
    write_audit_log(
        db,
        entity_type="team_invitation",
        entity_id=invitation.id,
        action="invitation_resent",
        operator_id=operator_id,
        team_id=team_id,
        changes={"invite_mode": invite_mode, "email": invitation.email, "team_role": invitation.team_role, "expire_hours": expire_hours},
        request=request,
    )
    db.commit()
    invite_url = invitation_join_url(raw_code)
    if invite_mode == INVITE_MODE_EMAIL and invitation.email:
        send_team_invitation_email(invitation.email, invite_url, invitation.message)
    return {
        **invitation_payload(db, invitation),
        "invite_code": raw_code,
        "invite_url": invite_url,
        "invite_mode": invite_mode,
    }


def revoke_invitation(
    db: MongoDatabase,
    *,
    team_id: str,
    invitation_id: str,
    reason: str | None,
    operator_id: str,
    request: Request,
) -> dict:
    invitation = db.get(TeamInvitation, invitation_id)
    if not invitation or invitation.team_id != team_id:
        raise AppError(ErrorCode.NOT_FOUND, "资源不存在")
    visible_status = invitation_payload(db, invitation)["status"]
    if visible_status not in {"pending", "expired"}:
        raise AppError(ErrorCode.STATE_CONFLICT, "仅待接受或已过期邀请可撤销")
    now = now_utc().replace(tzinfo=None)
    invitation.status = "revoked"
    invitation.responded_at = now
    invitation.revoked_by = operator_id
    invitation.revoked_at = now
    db.save(invitation)
    write_audit_log(
        db,
        entity_type="team_invitation",
        entity_id=invitation.id,
        action="invitation_revoked",
        operator_id=operator_id,
        team_id=team_id,
        changes={"invite_mode": invitation_mode_value(invitation.invite_mode), "email": invitation.email, "team_role": invitation.team_role, "reason": reason},
        request=request,
    )
    db.commit()
    return invitation_payload(db, invitation)


def respond_invitation(db: MongoDatabase, *, invite_code: str, action: str, user: User, request: Request) -> dict:
    invitation = db.find_one(TeamInvitation, {"invite_code_hash": hash_secret(invite_code)})
    invite_mode = invitation_mode_value(invitation.invite_mode if invitation else None)
    if not invitation or invitation.status != "pending":
        raise AppError(ErrorCode.NOT_FOUND, "资源不存在")
    if invitation.expire_at.replace(tzinfo=now_utc().tzinfo) < now_utc():
        raise AppError(ErrorCode.STATE_CONFLICT, "邀请已过期")
    if role_value(invitation.team_role) == TeamRole.AGENT.value:
        raise AppError(ErrorCode.BUSINESS_RULE, "Agent 是系统角色，不能接受邀请")
    if invite_mode == INVITE_MODE_EMAIL and invitation.email and user.email and user.email.lower() != invitation.email.lower():
        raise AppError(ErrorCode.PERMISSION_DENIED, "无权限接受该邀请")
    invitation.status = "accepted" if action == "accept" else "rejected"
    invitation.responded_at = now_utc()
    if action == "accept":
        normalized_permissions = permissions_within_team_role(invitation.team_role, invitation.permissions)
        existing = db.find_one(TeamMember, {"team_id": invitation.team_id, "user_id": user.id})
        ensure_team_admin_assignment_available(
            db,
            team_id=invitation.team_id,
            team_role=invitation.team_role,
            exclude_user_ids={user.id}
            if existing and existing.status == "active" and role_value(existing.team_role) == TeamRole.TEAM_ADMIN.value
            else None,
        )
        if not existing or existing.status != "active":
            assert_member_capacity(db, invitation.team_id, add_count=1)
        if existing:
            ensure_team_admin_membership_preserved(
                db,
                team_id=invitation.team_id,
                member=existing,
                next_team_role=invitation.team_role,
                next_status="active",
            )
            existing.team_role = invitation.team_role
            existing.permissions = normalized_permissions
            existing.permissions_customized = invitation.permissions_customized
            existing.assigned_review_tasks = invitation.assigned_review_tasks
            existing.status = "active"
            db.save(existing)
            member = existing
        else:
            member = TeamMember(
                team_id=invitation.team_id,
                user_id=user.id,
                team_role=invitation.team_role,
                permissions=normalized_permissions,
                permissions_customized=invitation.permissions_customized,
                assigned_review_tasks=invitation.assigned_review_tasks,
            )
            db.add(member)
        if role_value(user.global_role) == "pending":
            user.global_role = "labeler" if role_value(invitation.team_role) == TeamRole.LABELER.value else "user"
            user.updated_at = now_utc()
            db.save(user)
        entity_action = "invitation_accepted"
    else:
        entity_action = "invitation_rejected"
    write_audit_log(
        db,
        entity_type="team_invitation",
        entity_id=invitation.id,
        action=entity_action,
        operator_id=user.id,
        team_id=invitation.team_id,
        changes={"team_id": invitation.team_id, "team_role": invitation.team_role, "invite_mode": invite_mode},
        request=request,
    )
    if action == "accept":
        notify_team_security_event(
            db,
            team_id=invitation.team_id,
            event_key=f"team:{invitation.team_id}:invitation:{invitation.id}:accepted:user",
            title="你已加入企业团队",
            content=f"你已接受邀请并加入企业团队，角色为 {team_role_label(invitation.team_role)}。",
            target_user_ids=[user.id],
            actor_id=user.id,
            related_entity_type="team_invitation",
            related_entity_id=invitation.id,
            metadata={"team_role": invitation.team_role, "invite_mode": invite_mode},
            request=request,
        )
    db.save(invitation)
    db.commit()
    return {"status": invitation.status, "team_id": invitation.team_id, "team_role": invitation.team_role, "invite_mode": invite_mode}


def invitation_payload(db: MongoDatabase, invitation: TeamInvitation) -> dict:
    inviter = db.get(User, invitation.created_by) if invitation.created_by else None
    inviter_profile = db.find_one(UserProfile, {"user_id": invitation.created_by}) if invitation.created_by else None
    invite_mode = invitation_mode_value(invitation.invite_mode)
    status = invitation.status
    if status == "pending" and invitation.expire_at.replace(tzinfo=now_utc().tzinfo) < now_utc():
        status = "expired"
    return {
        "invitation_id": invitation.id,
        "team_id": invitation.team_id,
        "invite_mode": invite_mode,
        "email": invitation.email,
        "team_role": invitation.team_role,
        "team_role_label": team_role_label(invitation.team_role),
        "status": status,
        "message": invitation.message,
        "created_by": invitation.created_by,
        "created_by_name": inviter_profile.display_name if inviter_profile and inviter_profile.display_name else (inviter.username if inviter else None),
        "expire_at": invitation.expire_at.isoformat() if invitation.expire_at else None,
        "responded_at": invitation.responded_at.isoformat() if invitation.responded_at else None,
        "created_at": invitation.created_at.isoformat() if invitation.created_at else None,
    }


def update_member(
    db: MongoDatabase,
    *,
    team_id: str,
    user_id: str,
    team_role: str | None,
    permissions: list[str] | None,
    assigned_review_tasks: list[str] | None,
    status: str | None,
    operator_id: str,
    request: Request,
) -> dict:
    member = db.find_one(TeamMember, {"team_id": team_id, "user_id": user_id})
    if not member:
        raise AppError(ErrorCode.NOT_FOUND, "资源不存在")
    if user_id == operator_id:
        raise AppError(ErrorCode.BUSINESS_RULE, "不能编辑自己的成员关系")
    if is_system_member(member):
        raise AppError(ErrorCode.BUSINESS_RULE, "系统 Agent 不可编辑")
    next_team_role = ensure_team_role_user_assignable(team_role) if team_role else member.team_role
    next_status = status or member.status or "active"
    ensure_team_admin_assignment_available(
        db,
        team_id=team_id,
        team_role=next_team_role,
        exclude_user_ids={user_id}
        if member.status == "active" and role_value(member.team_role) == TeamRole.TEAM_ADMIN.value
        else None,
    )
    ensure_team_admin_membership_preserved(
        db,
        team_id=team_id,
        member=member,
        next_team_role=next_team_role,
        next_status=next_status,
    )
    next_permissions = member.permissions
    if permissions is not None:
        next_permissions = permissions_within_team_role(next_team_role, permissions)
    elif team_role:
        next_permissions = permissions_for_team_role(next_team_role)
    changes = {}
    if team_role:
        changes["team_role"] = {"from": member.team_role, "to": next_team_role}
        member.team_role = next_team_role
        if permissions is None:
            member.permissions = next_permissions
    if permissions is not None:
        changes["permissions"] = {"from": member.permissions, "to": next_permissions}
        member.permissions = next_permissions
        member.permissions_customized = True
    elif team_role:
        member.permissions_customized = False
    if assigned_review_tasks is not None:
        changes["assigned_review_tasks"] = {"from": member.assigned_review_tasks, "to": assigned_review_tasks}
        member.assigned_review_tasks = assigned_review_tasks
    if status:
        changes["status"] = {"from": member.status, "to": status}
        member.status = next_status
    db.save(member)
    write_audit_log(
        db,
        entity_type="team_member",
        entity_id=user_id,
        action="member_updated",
        operator_id=operator_id,
        team_id=team_id,
        changes=changes,
        request=request,
    )
    if changes:
        notify_team_security_event(
            db,
            team_id=team_id,
            event_key=f"team:{team_id}:member:{user_id}:updated:{member.updated_at.isoformat() if getattr(member, 'updated_at', None) else len(str(changes))}",
            title="你的团队权限已更新",
            content="你的企业角色、权限或审核任务分配已更新，请重新确认当前工作台权限。",
            target_user_ids=[user_id],
            actor_id=operator_id,
            related_entity_id=user_id,
            metadata={"changes": changes},
            request=request,
        )
    db.commit()
    return member_payload(db, member)


def batch_update_member_role(
    db: MongoDatabase,
    *,
    team_id: str,
    user_ids: list[str],
    team_role: str,
    operator_id: str,
    request: Request,
) -> dict:
    normalized_team_role = ensure_team_role_user_assignable(team_role)
    unique_user_ids = list(dict.fromkeys(user_ids))
    results = []
    updated_members = []
    for user_id in unique_user_ids:
        if user_id == operator_id:
            results.append({"user_id": user_id, "status": "skipped", "reason": "Cannot batch update your own role"})
            continue
        member = db.find_one(TeamMember, {"team_id": team_id, "user_id": user_id})
        if not member:
            results.append({"user_id": user_id, "status": "skipped", "reason": "Member does not exist or is outside current team"})
            continue
        if is_system_member(member):
            results.append({"user_id": user_id, "status": "skipped", "reason": "系统 Agent 不支持批量改角色"})
            continue
        old_role = member.team_role
        if old_role == normalized_team_role:
            results.append({"user_id": user_id, "status": "skipped", "reason": "成员已是目标角色"})
            continue
        try:
            ensure_team_admin_assignment_available(
                db,
                team_id=team_id,
                team_role=normalized_team_role,
                exclude_user_ids={user_id}
                if member.status == "active" and role_value(member.team_role) == TeamRole.TEAM_ADMIN.value
                else None,
            )
            ensure_team_admin_membership_preserved(
                db,
                team_id=team_id,
                member=member,
                next_team_role=normalized_team_role,
                next_status=member.status,
            )
        except AppError as exc:
            results.append({"user_id": user_id, "status": "skipped", "reason": exc.message})
            continue
        member.team_role = normalized_team_role
        member.permissions = permissions_for_team_role(normalized_team_role)
        member.permissions_customized = False
        db.save(member)
        write_audit_log(
            db,
            entity_type="team_member",
            entity_id=user_id,
            action="member_role_batch_updated",
            operator_id=operator_id,
            team_id=team_id,
            changes={"team_id": team_id, "team_role": {"from": old_role, "to": normalized_team_role}},
            request=request,
        )
        results.append({"user_id": user_id, "status": "updated", "from_role": old_role, "to_role": normalized_team_role})
        updated_members.append(member_payload(db, member))
    write_audit_log(
        db,
        entity_type="team",
        entity_id=team_id,
        action="member_role_batch_update_completed",
        operator_id=operator_id,
        team_id=team_id,
        changes={
            "target_role": normalized_team_role,
            "requested_count": len(unique_user_ids),
            "updated_count": len([item for item in results if item["status"] == "updated"]),
            "skipped_count": len([item for item in results if item["status"] == "skipped"]),
        },
        request=request,
    )
    db.commit()
    return {
        "requested_count": len(unique_user_ids),
        "updated_count": len([item for item in results if item["status"] == "updated"]),
        "skipped_count": len([item for item in results if item["status"] == "skipped"]),
        "target_role": normalized_team_role,
        "results": results,
        "members": updated_members,
    }


def send_member_security_reminders(
    db: MongoDatabase,
    *,
    team_id: str,
    user_ids: list[str],
    title: str,
    content: str,
    operator_id: str,
    operator_name: str,
    request: Request,
) -> dict:
    unique_user_ids = list(dict.fromkeys(user_ids))
    valid_user_ids = []
    results = []
    for user_id in unique_user_ids:
        member = db.find_one(TeamMember, {"team_id": team_id, "user_id": user_id, "status": "active"})
        if not member:
            results.append({"user_id": user_id, "status": "skipped", "reason": "成员不存在、已禁用或不属于当前企业"})
            continue
        if is_system_member(member):
            results.append({"user_id": user_id, "status": "skipped", "reason": "System Agent does not receive security reminders"})
            continue
        valid_user_ids.append(user_id)
        results.append({"user_id": user_id, "status": "sent"})
    if not valid_user_ids:
        raise AppError(ErrorCode.BUSINESS_RULE, "没有可提醒的有效成员")
    notification = create_notification(
        db,
        team_id=team_id,
        payload={
            "title": title,
            "content": content,
            "notification_type": "security",
            "priority": "important",
            "target_type": "member",
            "target_user_ids": valid_user_ids,
            "related_entity_type": "team_member_security",
            "action_url": "/workspace?page=people-management",
            "in_app_enabled": True,
            "email_enabled": False,
        },
        sender_id=operator_id,
        sender_name=operator_name,
        request=request,
    )
    write_audit_log(
        db,
        entity_type="team_member",
        entity_id=team_id,
        action="member_security_reminder_sent",
        operator_id=operator_id,
        team_id=team_id,
        changes={
            "title": title,
            "requested_count": len(unique_user_ids),
            "sent_count": len(valid_user_ids),
            "skipped_count": len(unique_user_ids) - len(valid_user_ids),
            "target_user_ids": valid_user_ids,
            "notification_id": notification["notification_id"],
        },
        request=request,
    )
    db.commit()
    return {
        "requested_count": len(unique_user_ids),
        "sent_count": len(valid_user_ids),
        "skipped_count": len(unique_user_ids) - len(valid_user_ids),
        "results": results,
        "notification": notification,
    }


def remove_member(db: MongoDatabase, *, team_id: str, user_id: str, operator_id: str, request: Request) -> None:
    if user_id == operator_id:
        raise AppError(ErrorCode.BUSINESS_RULE, "不可移除自己")
    member = db.find_one(TeamMember, {"team_id": team_id, "user_id": user_id})
    if not member:
        raise AppError(ErrorCode.NOT_FOUND, "资源不存在")
    if is_system_member(member):
        raise AppError(ErrorCode.BUSINESS_RULE, "系统 Agent 不可移除")
    ensure_team_admin_membership_preserved(
        db,
        team_id=team_id,
        member=member,
        next_status="removed",
    )
    db.delete_one(TeamMember, {"_id": member.id})
    write_audit_log(
        db,
        entity_type="team_member",
        entity_id=user_id,
        action="member_removed",
        operator_id=operator_id,
        team_id=team_id,
        changes={"team_id": team_id},
        request=request,
    )
    notify_team_security_event(
        db,
        team_id=team_id,
        event_key=f"team:{team_id}:member:{user_id}:removed",
        title="成员已移除",
        content="一名成员已从企业团队中移除。",
        actor_id=operator_id,
        related_entity_id=user_id,
        metadata={"removed_user_id": user_id},
        request=request,
    )
    db.commit()


def member_payload(db: MongoDatabase, member: TeamMember, current_user_id: str | None = None) -> dict:
    user = db.get(User, member.user_id)
    if not user:
        raise AppError(ErrorCode.NOT_FOUND, "资源不存在")
    profile = db.find_one(UserProfile, {"user_id": member.user_id})
    system_member = is_system_member(member)
    return {
        "user_id": user.id,
        "username": user.username,
        "email": user.email,
        "display_name": profile.display_name if profile and profile.display_name else (SYSTEM_AGENT_DISPLAY_NAME if system_member else user.username),
        "avatar": user.avatar or (default_system_agent_avatar() if system_member else None),
        "position": profile.profession if profile and profile.profession else None,
        "phone": profile.phone if profile and profile.phone else None,
        "global_role": user.global_role,
        "team_role": member.team_role,
        "team_role_label": team_role_label(member.team_role),
        "permissions": member.permissions,
        "permission_count": len(member.permissions or []),
        "assigned_tasks": member.assigned_review_tasks,
        "assigned_task_count": len(member.assigned_review_tasks or []),
        "member_status": member.status,
        "user_status": user.status,
        "email_verified": user.email_verified,
        "is_current_user": user.id == current_user_id,
        "is_system_member": system_member,
        "joined_at": member.joined_at.isoformat() if member.joined_at else None,
        "actions": {
            "can_edit": (user.id != current_user_id) and not system_member,
            "can_remove": (user.id != current_user_id) and not system_member,
            "can_disable": (user.id != current_user_id) and member.status == "active" and not system_member,
        },
    }


def team_role_label(role: str) -> str:
    labels = {
        TeamRole.TEAM_ADMIN.value: "企业管理员",
        TeamRole.OWNER.value: "任务发布者",
        TeamRole.REVIEWER.value: "审核员",
        TeamRole.AGENT.value: SYSTEM_AGENT_ROLE_LABEL,
        TeamRole.LABELER.value: "标注员",
    }
    return labels.get(role_value(role), role)


def global_role_for_team_role(team_role: str) -> str:
    normalized = role_value(team_role)
    if normalized == TeamRole.REVIEWER.value:
        return "reviewer"
    if normalized == TeamRole.LABELER.value:
        return "labeler"
    return "user"


def username_from_email(db: MongoDatabase, email: str) -> str:
    base = email.split("@", 1)[0].lower()
    base = "".join(char if char.isalnum() or char in {"_", "-"} else "_" for char in base).strip("_-")
    if len(base) < 2:
        base = "user"
    base = base[:20]
    if not db.find_one(User, {"username": base}):
        return base
    for suffix in range(2, 1000):
        candidate = f"{base[: max(2, 20 - len(str(suffix)) - 1)]}_{suffix}"
        if not db.find_one(User, {"username": candidate}):
            return candidate
    return f"user_{generate_token_urlsafe(6)}"[:20]
