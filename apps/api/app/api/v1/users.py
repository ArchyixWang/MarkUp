from fastapi import APIRouter, Depends, Request

from app.api.deps import CurrentUser, get_current_user
from app.core.database import MongoDatabase, get_db
from app.core.errors import AppError, ErrorCode
from app.core.responses import success_response
from app.domains.rbac import GlobalRole, role_value
from app.models.user import User, UserProfile
from app.schemas.user import UpdateUserRequest
from app.services.auth_service import public_user_payload

router = APIRouter()


@router.get("/{user_id}")
def user_detail(user_id: str, request: Request, current: CurrentUser = Depends(get_current_user), db: MongoDatabase = Depends(get_db)) -> dict:
    if user_id != current.user_id and role_value(current.user.global_role) != GlobalRole.PLATFORM_ADMIN.value:
        raise AppError(ErrorCode.PERMISSION_DENIED, "无权限访问")
    user = db.get(User, user_id)
    if not user:
        raise AppError(ErrorCode.NOT_FOUND, "资源不存在")
    profile = db.find_one(UserProfile, {"user_id": user.id})
    return success_response(public_user_payload(user, display_name=profile.display_name if profile else None), "success", request)


@router.put("/{user_id}")
def update_user(
    user_id: str,
    payload: UpdateUserRequest,
    request: Request,
    current: CurrentUser = Depends(get_current_user),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    if role_value(current.user.global_role) != GlobalRole.PLATFORM_ADMIN.value:
        raise AppError(ErrorCode.PERMISSION_DENIED, "无权限访问")
    user = db.get(User, user_id)
    if not user:
        raise AppError(ErrorCode.NOT_FOUND, "资源不存在")
    if payload.role:
        user.global_role = payload.role
    if payload.status:
        user.status = payload.status
    db.save(user)
    profile = db.find_one(UserProfile, {"user_id": user.id})
    return success_response(public_user_payload(user, display_name=profile.display_name if profile else None), "更新成功", request)
