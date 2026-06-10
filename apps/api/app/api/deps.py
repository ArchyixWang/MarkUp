from dataclasses import dataclass

from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

from app.core.database import MongoDatabase, get_db
from app.core.errors import AppError, ErrorCode
from app.core.security import decode_token, now_utc
from app.domains.rbac import effective_permissions, permissions_for_team_role
from app.models.auth import RefreshSession
from app.models.team import TeamMember
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass
class CurrentUser:
    user: User
    session_id: str
    team_id: str | None = None
    team_role: str | None = None
    team_permissions: list[str] | None = None

    @property
    def user_id(self) -> str:
        return self.user.id

    @property
    def permissions(self) -> list[str]:
        return effective_permissions(self.user.global_role, self.team_permissions)

    @property
    def global_permissions(self) -> list[str]:
        return effective_permissions(self.user.global_role)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    x_team_id: str | None = Header(default=None, alias="X-Team-ID"),
    db: MongoDatabase = Depends(get_db),
) -> CurrentUser:
    if not credentials:
        raise AppError(ErrorCode.AUTH_REQUIRED, "请先登录")
    try:
        payload = decode_token(credentials.credentials)
    except JWTError as exc:
        raise exc
    if payload.get("typ") != "access":
        raise AppError(ErrorCode.AUTH_REQUIRED, "请先登录")

    user_id = payload.get("sub")
    session_id = payload.get("sid")
    if not user_id or not session_id:
        raise AppError(ErrorCode.AUTH_REQUIRED, "请先登录")

    session = db.get(RefreshSession, session_id)
    if not session or session.user_id != user_id or session.revoked or session.expire_at.replace(tzinfo=now_utc().tzinfo) < now_utc():
        raise AppError(ErrorCode.AUTH_REQUIRED, "请先登录")

    user = db.get(User, user_id)
    if not user or user.status != "active":
        raise AppError(ErrorCode.AUTH_REQUIRED, "请先登录")
    if not user.email_verified:
        raise AppError(ErrorCode.BUSINESS_RULE, "邮箱未验证")

    team_role = None
    team_permissions = None
    if x_team_id:
        member = db.find_one(TeamMember, {"team_id": x_team_id, "user_id": user.id, "status": "active"})
        if not member:
            raise AppError(ErrorCode.PERMISSION_DENIED, "无权限访问该企业")
        team_role = member.team_role
        if member.permissions_customized:
            team_permissions = sorted(set(member.permissions or []))
        else:
            team_permissions = permissions_for_team_role(member.team_role)

    return CurrentUser(user=user, session_id=session.id, team_id=x_team_id, team_role=team_role, team_permissions=team_permissions)


def get_optional_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    x_team_id: str | None = Header(default=None, alias="X-Team-ID"),
    db: MongoDatabase = Depends(get_db),
) -> CurrentUser | None:
    if not credentials:
        return None
    return get_current_user(credentials=credentials, x_team_id=x_team_id, db=db)


def require_permissions(*required: str):
    def dependency(current: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        permissions = set(current.permissions)
        if not set(required).issubset(permissions):
            raise AppError(ErrorCode.PERMISSION_DENIED, "无权限访问")
        return current

    return dependency


def require_any_permissions(*allowed: str):
    def dependency(current: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        permissions = set(current.permissions)
        if not permissions.intersection(allowed):
            raise AppError(ErrorCode.PERMISSION_DENIED, "无权限访问")
        return current

    return dependency


def require_global_permissions(*required: str):
    def dependency(current: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        permissions = set(current.global_permissions)
        if not set(required).issubset(permissions):
            raise AppError(ErrorCode.PERMISSION_DENIED, "无权限访问")
        return current

    return dependency
