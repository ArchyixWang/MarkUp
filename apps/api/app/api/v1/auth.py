from urllib.parse import urlencode

from fastapi import APIRouter, Body, Cookie, Depends, Request, Response
from fastapi.responses import RedirectResponse

from app.api.deps import CurrentUser, get_current_user
from app.core.config import settings
from app.core.database import MongoDatabase, get_db
from app.core.errors import AppError, ErrorCode
from app.core.responses import success_response
from app.models.team import TeamMember
from app.models.user import UserProfile
from app.schemas.auth import (
    BindOAuthEmailRequest,
    AdminRegisterRequest,
    ConfirmEmailRequest,
    LoginRequest,
    OAuthExchangeRequest,
    OAuthLinkAccountRequest,
    OAuthLinkCurrentUserRequest,
    OAuthRegisterAccountRequest,
    OnboardingCompleteRequest,
    PasswordChangeRequest,
    PasswordResetRequest,
    RefreshRequest,
    RegisterRequest,
    SendEmailCodeRequest,
    TeamRegisterRequest,
)
from app.services.auth_service import (
    authenticate_user,
    change_password,
    default_team_member,
    issue_token_pair,
    mark_confirmed_email,
    public_user_payload,
    register_admin,
    register_user,
    reset_password,
    revoke_other_user_sessions,
    revoke_refresh_token,
    rotate_refresh_token,
    send_email_code,
    team_member_permissions,
    update_labeler_onboarding_profile,
    update_user_role,
)
from app.services.oauth_service import (
    bind_oauth_email,
    exchange_oauth_ticket,
    link_oauth_existing_account,
    link_oauth_current_user,
    list_oauth_identities,
    oauth_callback,
    oauth_start,
    register_oauth_account,
    unlink_oauth_identity,
)
from app.services.team_service import create_team_for_admin, respond_invitation

router = APIRouter()


def set_refresh_cookie(response: Response, token_pair: dict) -> None:
    response.set_cookie(
        key="refresh_token",
        value=token_pair["refresh_token"],
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        path="/api/v1/auth",
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key="refresh_token", path="/api/v1/auth")


@router.post("/email/send-code")
def send_code(payload: SendEmailCodeRequest, request: Request, db: MongoDatabase = Depends(get_db)) -> dict:
    data = send_email_code(db, payload.email, payload.purpose)
    return success_response(data, "验证码已发送", request)


@router.post("/email/confirm")
def confirm_email(payload: ConfirmEmailRequest, request: Request, db: MongoDatabase = Depends(get_db)) -> dict:
    data = mark_confirmed_email(db, payload.email, payload.code, payload.purpose)
    return success_response(data, "邮箱验证成功", request)


@router.post("/register")
def register(payload: RegisterRequest, request: Request, db: MongoDatabase = Depends(get_db)) -> dict:
    user = register_user(
        db,
        username=payload.username,
        display_name=payload.display_name,
        email=payload.email,
        password=payload.password,
        role=payload.role,
        email_code=payload.email_code,
        request=request,
    )
    return success_response(public_user_payload(user, display_name=payload.display_name), "注册成功", request)


@router.post("/onboarding/complete")
def complete_onboarding(
    payload: OnboardingCompleteRequest,
    request: Request,
    response: Response,
    current: CurrentUser = Depends(get_current_user),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    if current.user.global_role != "pending":
        raise AppError(ErrorCode.STATE_CONFLICT, "仅待完善资料的用户可以进入引导流程")

    if payload.identity == "labeler":
        if not payload.labeler_profile:
            raise AppError(ErrorCode.VALIDATION_REQUIRED, "请填写标注员资料")
        update_labeler_onboarding_profile(db, current.user, payload.labeler_profile.model_dump())
        update_user_role(db, current.user, "labeler")
        db.commit()
    elif payload.organization_action == "create":
        if not payload.organization_profile:
            raise AppError(ErrorCode.VALIDATION_REQUIRED, "请填写组织资料")
        profile = payload.organization_profile
        create_team_for_admin(
            db,
            owner=current.user,
            company_name=profile.company_name,
            industry=profile.industry,
            contact_phone=profile.contact_phone,
            description=f"{profile.business_description}\n联系人：{profile.contact_name}",
            logo_url=None,
            website=profile.website,
            address=profile.address,
            billing_info=None,
            mailing_info=None,
            request=request,
        )
        update_user_role(db, current.user, "admin")
    elif payload.organization_action == "join":
        if not payload.invite_code:
            raise AppError(ErrorCode.VALIDATION_REQUIRED, "请填写邀请码")
        respond_invitation(db, invite_code=payload.invite_code, action="accept", user=current.user, request=request)
    else:
            raise AppError(ErrorCode.VALIDATION_REQUIRED, "请选择组织操作")

    data = issue_token_pair(db, current.user, request)
    set_refresh_cookie(response, data)
    return success_response(data, "onboarding completed", request)


@router.post("/register/admin")
def register_admin_account(payload: AdminRegisterRequest, request: Request, db: MongoDatabase = Depends(get_db)) -> dict:
    user = register_admin(
        db,
        username=payload.username,
        display_name=payload.display_name,
        email=payload.email,
        password=payload.password,
        email_code=payload.email_code,
        request=request,
    )
    return success_response(public_user_payload(user, display_name=payload.display_name), "管理员注册成功", request)


@router.post("/login")
def login(payload: LoginRequest, request: Request, response: Response, db: MongoDatabase = Depends(get_db)) -> dict:
    user = authenticate_user(db, payload.account, payload.password)
    data = issue_token_pair(db, user, request)
    set_refresh_cookie(response, data)
    return success_response(data, "登录成功", request)


@router.post("/refresh")
def refresh(
    request: Request,
    response: Response,
    payload: RefreshRequest = Body(default_factory=RefreshRequest),
    refresh_token_cookie: str | None = Cookie(default=None, alias="refresh_token"),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    token = payload.refresh_token or refresh_token_cookie
    if not token:
        raise AppError(ErrorCode.AUTH_REQUIRED, "请先登录")
    data = rotate_refresh_token(db, token, request)
    set_refresh_cookie(response, data)
    return success_response(data, "刷新成功", request)


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    payload: RefreshRequest = Body(default_factory=RefreshRequest),
    current: CurrentUser = Depends(get_current_user),
    refresh_token_cookie: str | None = Cookie(default=None, alias="refresh_token"),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    revoke_refresh_token(db, payload.refresh_token or refresh_token_cookie, current.user_id, current.session_id)
    clear_refresh_cookie(response)
    return success_response(None, "登出成功", request)


@router.get("/me")
def me(request: Request, current: CurrentUser = Depends(get_current_user), db: MongoDatabase = Depends(get_db)) -> dict:
    display_name = None
    if profile := db.find_one(UserProfile, {"user_id": current.user_id}):
        display_name = profile.display_name
    team_member = default_team_member(db, current.user_id)
    if current.team_id:
        team_member = db.find_one(TeamMember, {"team_id": current.team_id, "user_id": current.user_id, "status": "active"})
    return success_response(public_user_payload(current.user, current.team_permissions or team_member_permissions(team_member), display_name=display_name, team_member=team_member), "success", request)


@router.put("/password")
def password(payload: PasswordChangeRequest, request: Request, current: CurrentUser = Depends(get_current_user), db: MongoDatabase = Depends(get_db)) -> dict:
    change_password(db, current.user, payload.old_password, payload.new_password, request)
    return success_response(None, "密码修改成功", request)


@router.post("/sessions/revoke-others")
def revoke_other_sessions(
    request: Request,
    payload: RefreshRequest = Body(default_factory=RefreshRequest),
    current: CurrentUser = Depends(get_current_user),
    refresh_token_cookie: str | None = Cookie(default=None, alias="refresh_token"),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = revoke_other_user_sessions(
        db,
        current.user,
        payload.refresh_token or refresh_token_cookie,
        request,
        current.session_id,
    )
    return success_response(data, "other sessions revoked", request)


@router.post("/password/reset")
def password_reset(payload: PasswordResetRequest, request: Request, db: MongoDatabase = Depends(get_db)) -> dict:
    reset_password(db, payload.email, payload.email_code, payload.new_password, request)
    return success_response(None, "密码重置成功", request)


@router.post("/register/team")
def team_register(payload: TeamRegisterRequest, request: Request, db: MongoDatabase = Depends(get_db)) -> dict:
    raise AppError(
        ErrorCode.STATE_CONFLICT,
        "该接口已废弃，请先调用 /auth/register/admin 注册管理员，再登录后调用 /teams 创建企业",
        {"replacement": ["/api/v1/auth/register/admin", "/api/v1/teams"]},
    )


@router.get("/oauth/{provider}/start")
def oauth_login_start(
    provider: str,
    redirect_after_login: str | None = None,
    intent: str | None = None,
    db: MongoDatabase = Depends(get_db),
) -> RedirectResponse:
    authorization_url = oauth_start(db, provider, redirect_after_login, intent)
    return RedirectResponse(authorization_url, status_code=302)


@router.get("/oauth/{provider}/callback")
async def oauth_login_callback(provider: str, code: str, state: str, request: Request, db: MongoDatabase = Depends(get_db)) -> RedirectResponse:
    callback_data = await oauth_callback(db, provider, code, state, request)
    query = urlencode(
        {
            "ticket": callback_data["ticket"],
            "provider": provider,
            "intent": callback_data["intent"],
            "redirect_after_login": callback_data["redirect_after_login"] or "",
        }
    )
    return RedirectResponse(f"{settings.frontend_oauth_callback_url}?{query}", status_code=302)


@router.post("/oauth/exchange")
def oauth_exchange(payload: OAuthExchangeRequest, request: Request, response: Response, db: MongoDatabase = Depends(get_db)) -> dict:
    data = exchange_oauth_ticket(db, payload.ticket, request)
    if "refresh_token" in data:
        set_refresh_cookie(response, data)
    return success_response(data, "OAuth 登录成功", request)


@router.post("/oauth/bind-email")
def oauth_bind_email(payload: BindOAuthEmailRequest, request: Request, response: Response, db: MongoDatabase = Depends(get_db)) -> dict:
    data = bind_oauth_email(db, payload.ticket, payload.email, payload.email_code, request)
    set_refresh_cookie(response, data)
    return success_response(data, "邮箱绑定成功", request)


@router.post("/oauth/link-account")
def oauth_link_account(payload: OAuthLinkAccountRequest, request: Request, response: Response, db: MongoDatabase = Depends(get_db)) -> dict:
    data = link_oauth_existing_account(db, payload.ticket, payload.account, payload.password, request)
    set_refresh_cookie(response, data)
    return success_response(data, "账号绑定成功", request)


@router.post("/oauth/link-current-user")
def oauth_link_current_user_endpoint(
    payload: OAuthLinkCurrentUserRequest,
    request: Request,
    current: CurrentUser = Depends(get_current_user),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = link_oauth_current_user(db, payload.ticket, current.user, request)
    return success_response(data, "当前账号绑定成功", request)


@router.post("/oauth/register-account")
def oauth_register_account(payload: OAuthRegisterAccountRequest, request: Request, response: Response, db: MongoDatabase = Depends(get_db)) -> dict:
    data = register_oauth_account(
        db,
        ticket=payload.ticket,
        username=payload.username,
        display_name=payload.display_name,
        email=payload.email,
        email_code=payload.email_code,
        password=payload.password,
        role=payload.role,
        request=request,
    )
    set_refresh_cookie(response, data)
    return success_response(data, "OAuth 注册成功", request)


@router.get("/oauth/identities")
def oauth_identities(request: Request, current: CurrentUser = Depends(get_current_user), db: MongoDatabase = Depends(get_db)) -> dict:
    data = list_oauth_identities(db, current.user)
    return success_response(data, "success", request)


@router.delete("/oauth/identities/{provider}")
def oauth_identity_delete(provider: str, request: Request, current: CurrentUser = Depends(get_current_user), db: MongoDatabase = Depends(get_db)) -> dict:
    data = unlink_oauth_identity(db, current.user, provider, request)
    return success_response(data, "OAuth identity unlinked", request)
