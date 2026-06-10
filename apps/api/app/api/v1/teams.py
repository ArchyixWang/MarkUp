from fastapi import APIRouter, Depends, File, Query, Request, UploadFile

from app.api.deps import CurrentUser, get_current_user, require_permissions
from app.core.database import MongoDatabase, get_db
from app.core.errors import AppError, ErrorCode
from app.core.responses import success_response
from app.core.security import hash_password
from app.schemas.resource import (
    PointsBudgetAlertUpdate,
    PointsBudgetRecharge,
    PointsBudgetWithdraw,
    TeamPointsPaymentPasswordChange,
    TeamPointsPaymentPasswordReset,
    TeamPointsPaymentPasswordSet,
)
from app.schemas.team import (
    AddMemberRequest,
    AgentSettingsUpdateRequest,
    BatchUpdateMemberRoleRequest,
    BudgetRequestApprove,
    BudgetRequestCreate,
    CreateMemberAccountRequest,
    CreateTeamRequest,
    ImportMembersRequest,
    InviteMemberRequest,
    MemberSecurityReminderRequest,
    MembershipSubscribeRequest,
    ResendInvitationRequest,
    RespondInvitationRequest,
    RevokeInvitationRequest,
    SubmitTeamVerificationRequest,
    UpdateMemberRequest,
    UpdateTeamRequest,
)
from app.services.resource_service import (
    change_points_budget_payment_password,
    approve_budget_request,
    create_budget_request,
    list_budget_requests,
    list_points_wallet_ledger,
    points_payment_password_status,
    recharge_points_budget,
    reset_points_budget_payment_password,
    set_points_budget_payment_password,
    set_points_budget_alert,
    team_budget_payload,
    team_points_budget_payload,
    withdraw_points_budget,
)
from app.services.membership_service import cancel_scheduled_membership_change, membership_payload, subscribe_membership
from app.services.team_service import (
    add_member,
    admin_overview,
    batch_update_member_role,
    create_member_account,
    create_team_for_admin,
    import_members,
    invite_member,
    list_invitations,
    list_members,
    remove_member,
    resend_invitation,
    respond_invitation,
    revoke_invitation,
    send_member_security_reminders,
    submit_team_verification,
    system_agent_settings_payload,
    team_admin_only,
    team_detail,
    update_member,
    update_system_agent_settings,
    update_team_info,
)
from app.services.upload_service import create_team_agent_avatar_upload
from app.services.labeler_dashboard_service import team_labeler_dashboard_payload
from app.services.workspace_dashboard_service import workspace_dashboard_payload

router = APIRouter()


def ensure_team_scope(current: CurrentUser, team_id: str) -> None:
    if current.team_id != team_id:
        raise AppError(ErrorCode.PERMISSION_DENIED, "鏃犳潈闄愯闂鍥㈤槦")


@router.get("/admin/overview")
def get_admin_overview(request: Request, current: CurrentUser = Depends(get_current_user), db: MongoDatabase = Depends(get_db)) -> dict:
    data = admin_overview(db, current.user_id)
    return success_response(data, "success", request)


@router.post("")
def create_team(
    payload: CreateTeamRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("team:create")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = create_team_for_admin(
        db,
        owner=current.user,
        company_name=payload.company_name,
        industry=payload.industry,
        contact_phone=payload.contact_phone,
        description=payload.description,
        logo_url=payload.logo_url,
        website=payload.website,
        address=payload.address,
        billing_info=payload.billing_info.model_dump(exclude_none=True) if payload.billing_info else None,
        mailing_info=payload.mailing_info.model_dump(exclude_none=True) if payload.mailing_info else None,
        request=request,
    )
    return success_response(data, "鍥㈤槦鍒涘缓鎴愬姛", request)


@router.get("/{team_id}")
def get_team(team_id: str, request: Request, current: CurrentUser = Depends(require_permissions("team:read")), db: MongoDatabase = Depends(get_db)) -> dict:
    ensure_team_scope(current, team_id)
    data = team_detail(db, team_id)
    return success_response(data, "success", request)


@router.get("/{team_id}/dashboard")
def get_team_dashboard(team_id: str, request: Request, current: CurrentUser = Depends(require_permissions("team:read")), db: MongoDatabase = Depends(get_db)) -> dict:
    ensure_team_scope(current, team_id)
    data = workspace_dashboard_payload(db, team_id=team_id, current=current)
    return success_response(data, "success", request)


@router.get("/{team_id}/labeler-dashboard")
def get_team_labeler_dashboard(team_id: str, request: Request, current: CurrentUser = Depends(require_permissions("label:read")), db: MongoDatabase = Depends(get_db)) -> dict:
    ensure_team_scope(current, team_id)
    data = team_labeler_dashboard_payload(db, team_id=team_id, current=current)
    return success_response(data, "success", request)


@router.get("/{team_id}/membership")
def get_membership(team_id: str, request: Request, current: CurrentUser = Depends(require_permissions("team:read")), db: MongoDatabase = Depends(get_db)) -> dict:
    ensure_team_scope(current, team_id)
    return success_response(membership_payload(db, team_id), "success", request)


@router.post("/{team_id}/membership/subscribe")
def post_membership_subscribe(
    team_id: str,
    payload: MembershipSubscribeRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("team:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    data = subscribe_membership(
        db,
        team_id=team_id,
        target_plan=payload.target_plan,
        payment_password=payload.payment_password,
        operator_id=current.user_id,
        request=request,
    )
    return success_response(data, "success", request)


@router.post("/{team_id}/membership/cancel-scheduled-change")
def post_membership_cancel_scheduled_change(
    team_id: str,
    request: Request,
    current: CurrentUser = Depends(require_permissions("team:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    data = cancel_scheduled_membership_change(db, team_id=team_id, operator_id=current.user_id, request=request)
    return success_response(data, "success", request)


@router.put("/{team_id}")
def update_team(
    team_id: str,
    payload: UpdateTeamRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("team:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    data = update_team_info(db, team_id=team_id, payload=payload.model_dump(exclude_unset=True), operator_id=current.user_id, request=request)
    return success_response(data, "Team information updated", request)


@router.get("/{team_id}/agent-settings")
def get_agent_settings(
    team_id: str,
    request: Request,
    current: CurrentUser = Depends(require_permissions("team:read")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    data = system_agent_settings_payload(db, team_id)
    return success_response(data, "success", request)


@router.post("/{team_id}/agent-settings/avatar")
async def upload_agent_avatar(
    team_id: str,
    request: Request,
    file: UploadFile = File(...),
    current: CurrentUser = Depends(require_permissions("team:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    team_admin_only(current.team_role)
    data = await create_team_agent_avatar_upload(
        db,
        team_id=team_id,
        owner_id=current.user_id,
        file=file,
        request=request,
    )
    return success_response(data, "Agent avatar uploaded", request)


@router.put("/{team_id}/agent-settings")
def put_agent_settings(
    team_id: str,
    payload: AgentSettingsUpdateRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("team:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    team_admin_only(current.team_role)
    data = update_system_agent_settings(
        db,
        team_id=team_id,
        display_name=payload.display_name,
        avatar=payload.avatar,
        preset_avatar_key=payload.preset_avatar_key,
        operator_id=current.user_id,
        request=request,
    )
    return success_response(data, "Agent settings updated", request)


@router.post("/{team_id}/verification")
def submit_verification(
    team_id: str,
    payload: SubmitTeamVerificationRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("team:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    data = submit_team_verification(db, team_id=team_id, payload=payload.model_dump(), operator_id=current.user_id, request=request)
    return success_response(data, "Team verification submitted", request)


@router.get("/{team_id}/members")
def get_members(
    team_id: str,
    request: Request,
    role: str | None = Query(default=None),
    status: str | None = Query(default=None),
    keyword: str | None = Query(default=None),
    current: CurrentUser = Depends(get_current_user),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    if "member:read" not in set(current.permissions):
        raise AppError(ErrorCode.PERMISSION_DENIED, "无权限访问")
    data = {"items": list_members(db, team_id, role, status, keyword, current.user_id), "pagination": {"page": 1, "page_size": 100, "total": 0, "total_pages": 1}}
    data["pagination"]["total"] = len(data["items"])
    return success_response(data, "success", request)


@router.post("/{team_id}/members")
def create_member(
    team_id: str,
    payload: AddMemberRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("member:create")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    data = add_member(
        db,
        team_id=team_id,
        user_id=payload.user_id,
        team_role=payload.team_role,
        permissions=payload.permissions,
        assigned_review_tasks=payload.assigned_review_tasks,
        operator_id=current.user_id,
        request=request,
    )
    return success_response(data, "Member added", request)


@router.post("/{team_id}/members/accounts")
def create_member_account_route(
    team_id: str,
    payload: CreateMemberAccountRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("member:create")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    data = create_member_account(
        db,
        team_id=team_id,
        username=payload.username,
        invite_mode="account",
        email=payload.email,
        password_hash=hash_password(payload.password),
        team_role=payload.team_role,
        permissions=payload.permissions,
        assigned_review_tasks=payload.assigned_review_tasks,
        display_name=payload.display_name,
        operator_id=current.user_id,
        request=request,
    )
    return success_response(data, "Member account created", request)


@router.post("/{team_id}/members/import")
def import_members_route(
    team_id: str,
    payload: ImportMembersRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("member:create")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    data = import_members(
        db,
        team_id=team_id,
        rows=[row.model_dump() for row in payload.rows],
        default_password=payload.default_password,
        operator_id=current.user_id,
        request=request,
    )
    return success_response(data, "Members imported", request)


@router.post("/{team_id}/invite")
def invite(
    team_id: str,
    payload: InviteMemberRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("member:invite")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    data = invite_member(
        db,
        team_id=team_id,
        invite_mode=payload.invite_mode,
        email=payload.email,
        team_role=payload.team_role,
        permissions=payload.permissions,
        assigned_review_tasks=payload.assigned_review_tasks,
        message=payload.message,
        expire_hours=payload.expire_hours,
        operator_id=current.user_id,
        request=request,
    )
    return success_response(data, "Invitation sent", request)


@router.get("/{team_id}/invitations")
def get_invitations(
    team_id: str,
    request: Request,
    status: str | None = Query(default=None, pattern="^(all|pending|accepted|rejected|expired|revoked)$"),
    current: CurrentUser = Depends(require_permissions("member:invite")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    items = list_invitations(db, team_id, status=status)
    return success_response({"items": items, "pagination": {"page": 1, "page_size": 100, "total": len(items), "total_pages": 1}}, "success", request)


@router.post("/{team_id}/invitations/{invitation_id}/resend")
def resend_invite(
    team_id: str,
    invitation_id: str,
    payload: ResendInvitationRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("member:invite")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    data = resend_invitation(
        db,
        team_id=team_id,
        invitation_id=invitation_id,
        message=payload.message,
        expire_hours=payload.expire_hours,
        operator_id=current.user_id,
        request=request,
    )
    return success_response(data, "閭€璇峰凡閲嶅彂", request)


@router.post("/{team_id}/invitations/{invitation_id}/revoke")
def revoke_invite(
    team_id: str,
    invitation_id: str,
    payload: RevokeInvitationRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("member:invite")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    data = revoke_invitation(
        db,
        team_id=team_id,
        invitation_id=invitation_id,
        reason=payload.reason,
        operator_id=current.user_id,
        request=request,
    )
    return success_response(data, "閭€璇峰凡鎾ら攢", request)


@router.post("/invitations/{invite_code}/respond")
def respond(
    invite_code: str,
    payload: RespondInvitationRequest,
    request: Request,
    current: CurrentUser = Depends(get_current_user),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = respond_invitation(db, invite_code=invite_code, action=payload.action, user=current.user, request=request)
    return success_response(data, "鎿嶄綔鎴愬姛", request)


@router.put("/{team_id}/members/{user_id}")
def put_member(
    team_id: str,
    user_id: str,
    payload: UpdateMemberRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("member:update")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    data = update_member(
        db,
        team_id=team_id,
        user_id=user_id,
        team_role=payload.team_role,
        permissions=payload.permissions,
        assigned_review_tasks=payload.assigned_review_tasks,
        status=payload.status,
        operator_id=current.user_id,
        request=request,
    )
    return success_response(data, "Member updated", request)


@router.post("/{team_id}/members/batch-role")
def batch_update_role(
    team_id: str,
    payload: BatchUpdateMemberRoleRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("member:update")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    data = batch_update_member_role(
        db,
        team_id=team_id,
        user_ids=payload.user_ids,
        team_role=payload.team_role,
        operator_id=current.user_id,
        request=request,
    )
    return success_response(data, "Member roles updated", request)


@router.post("/{team_id}/members/security-reminders")
def send_security_reminders(
    team_id: str,
    payload: MemberSecurityReminderRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("member:update")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    data = send_member_security_reminders(
        db,
        team_id=team_id,
        user_ids=payload.user_ids,
        title=payload.title,
        content=payload.content,
        operator_id=current.user_id,
        operator_name=current.user.username,
        request=request,
    )
    return success_response(data, "Security reminders sent", request)


@router.delete("/{team_id}/members/{user_id}")
def delete_member(
    team_id: str,
    user_id: str,
    request: Request,
    current: CurrentUser = Depends(require_permissions("member:delete")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    remove_member(db, team_id=team_id, user_id=user_id, operator_id=current.user_id, request=request)
    return success_response(None, "Member removed", request)


@router.get("/{team_id}/budget")
def get_budget(team_id: str, request: Request, current: CurrentUser = Depends(require_permissions("budget:view")), db: MongoDatabase = Depends(get_db)) -> dict:
    ensure_team_scope(current, team_id)
    return success_response(team_budget_payload(db, team_id), "success", request)


@router.get("/{team_id}/points-budget")
def get_points_budget(team_id: str, request: Request, current: CurrentUser = Depends(require_permissions("budget:view")), db: MongoDatabase = Depends(get_db)) -> dict:
    ensure_team_scope(current, team_id)
    return success_response(team_points_budget_payload(db, team_id), "success", request)


@router.get("/{team_id}/points-budget/ledger")
def get_points_budget_ledger(team_id: str, request: Request, current: CurrentUser = Depends(require_permissions("budget:view")), db: MongoDatabase = Depends(get_db)) -> dict:
    ensure_team_scope(current, team_id)
    items = list_points_wallet_ledger(db, team_id)
    return success_response({"items": items, "pagination": {"page": 1, "page_size": 100, "total": len(items), "total_pages": 1}}, "success", request)


@router.get("/{team_id}/points-budget/payment-password/status")
def get_points_budget_payment_password_status(
    team_id: str,
    request: Request,
    current: CurrentUser = Depends(require_permissions("budget:view")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    return success_response(points_payment_password_status(db, team_id), "success", request)


@router.post("/{team_id}/points-budget/payment-password/set")
def post_points_budget_payment_password_set(
    team_id: str,
    payload: TeamPointsPaymentPasswordSet,
    request: Request,
    current: CurrentUser = Depends(require_permissions("budget:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    team_admin_only(current.team_role)
    data = set_points_budget_payment_password(
        db,
        team_id=team_id,
        new_password=payload.new_password,
        confirm_password=payload.confirm_password,
        operator_id=current.user_id,
        request=request,
    )
    return success_response(data, "鏀粯瀵嗙爜璁剧疆鎴愬姛", request)


@router.post("/{team_id}/points-budget/payment-password/change")
def post_points_budget_payment_password_change(
    team_id: str,
    payload: TeamPointsPaymentPasswordChange,
    request: Request,
    current: CurrentUser = Depends(require_permissions("budget:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    team_admin_only(current.team_role)
    data = change_points_budget_payment_password(
        db,
        team_id=team_id,
        current_password=payload.current_password,
        new_password=payload.new_password,
        confirm_password=payload.confirm_password,
        operator_id=current.user_id,
        request=request,
    )
    return success_response(data, "鏀粯瀵嗙爜淇敼鎴愬姛", request)


@router.post("/{team_id}/points-budget/payment-password/reset")
def post_points_budget_payment_password_reset(
    team_id: str,
    payload: TeamPointsPaymentPasswordReset,
    request: Request,
    current: CurrentUser = Depends(require_permissions("budget:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    team_admin_only(current.team_role)
    if current.user.email and current.user.email.lower() != payload.email.lower():
        raise AppError(ErrorCode.PERMISSION_DENIED, "仅当前管理员邮箱可以重置支付密码")
    data = reset_points_budget_payment_password(
        db,
        team_id=team_id,
        email=payload.email,
        email_code=payload.email_code,
        new_password=payload.new_password,
        confirm_password=payload.confirm_password,
        operator_id=current.user_id,
        request=request,
    )
    return success_response(data, "鏀粯瀵嗙爜閲嶇疆鎴愬姛", request)


@router.post("/{team_id}/points-budget/recharge")
def post_points_budget_recharge(team_id: str, payload: PointsBudgetRecharge, request: Request, current: CurrentUser = Depends(require_permissions("budget:manage")), db: MongoDatabase = Depends(get_db)) -> dict:
    ensure_team_scope(current, team_id)
    data = recharge_points_budget(db, team_id, payload.amount, payload.payment_method, current.user_id, request)
    return success_response(data, "Points budget recharged", request)


@router.post("/{team_id}/points-budget/withdraw")
def post_points_budget_withdraw(team_id: str, payload: PointsBudgetWithdraw, request: Request, current: CurrentUser = Depends(require_permissions("budget:manage")), db: MongoDatabase = Depends(get_db)) -> dict:
    ensure_team_scope(current, team_id)
    data = withdraw_points_budget(
        db,
        team_id=team_id,
        amount=payload.amount,
        payout_method=payload.payout_method,
        account_name=payload.account_name,
        account_no=payload.account_no,
        bank_name=payload.bank_name,
        note=payload.note,
        payment_password=payload.payment_password,
        operator_id=current.user_id,
        request=request,
    )
    return success_response(data, "绉垎鎻愮幇鎴愬姛", request)


@router.post("/{team_id}/points-budget/alerts")
def post_points_budget_alert(team_id: str, payload: PointsBudgetAlertUpdate, request: Request, current: CurrentUser = Depends(require_permissions("budget:manage")), db: MongoDatabase = Depends(get_db)) -> dict:
    ensure_team_scope(current, team_id)
    data = set_points_budget_alert(db, team_id, payload.enabled, payload.threshold, current.user_id, request)
    return success_response(data, "Points budget alert updated", request)


@router.post("/{team_id}/budget/requests")
def post_budget_request(team_id: str, payload: BudgetRequestCreate, request: Request, current: CurrentUser = Depends(require_permissions("budget:view")), db: MongoDatabase = Depends(get_db)) -> dict:
    ensure_team_scope(current, team_id)
    data = create_budget_request(db, team_id, current.user_id, payload.model_dump(), request)
    return success_response(data, "Budget request submitted", request)


@router.get("/{team_id}/budget/requests")
def get_budget_requests(team_id: str, request: Request, current: CurrentUser = Depends(require_permissions("budget:view")), db: MongoDatabase = Depends(get_db)) -> dict:
    ensure_team_scope(current, team_id)
    items = list_budget_requests(db, team_id)
    return success_response({"items": items, "pagination": {"page": 1, "page_size": 100, "total": len(items), "total_pages": 1}}, "success", request)


@router.post("/{team_id}/budget/requests/{request_id}/approve")
def approve_budget(team_id: str, request_id: str, payload: BudgetRequestApprove, request: Request, current: CurrentUser = Depends(require_permissions("budget:manage")), db: MongoDatabase = Depends(get_db)) -> dict:
    ensure_team_scope(current, team_id)
    data = approve_budget_request(db, team_id, request_id, payload.model_dump(), current.user_id, request)
    return success_response(data, "Budget request processed", request)
