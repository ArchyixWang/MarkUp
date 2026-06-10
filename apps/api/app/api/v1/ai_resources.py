from fastapi import APIRouter, Depends, Query, Request

from app.api.deps import CurrentUser, get_current_user, require_permissions
from app.api.v1.teams import ensure_team_scope
from app.core.database import MongoDatabase, get_db
from app.core.errors import AppError, ErrorCode
from app.core.responses import success_response
from app.models.resource import AiProviderConfig
from app.schemas.resource import (
    AiWalletRechargeRequest,
    AiWalletTransferInRequest,
    AiEstimateRequest,
    AiProviderConfigCreate,
    AiProviderConfigDraftTestRequest,
    AiProviderConfigStatusUpdate,
    AiProviderConfigTestRequest,
    AiProviderConfigUpdate,
    BudgetAlertUpdate,
    BudgetLimitUpdate,
)
from app.services.resource_service import (
    cost_report,
    create_provider_config,
    delete_provider_config,
    duplicate_provider_config,
    estimate_tokens,
    list_team_ai_wallet_ledger,
    list_team_ai_history,
    list_call_logs,
    list_cert_types,
    list_provider_configs,
    recharge_team_ai_wallet,
    set_budget_alert,
    set_budget_limit,
    set_provider_config_status,
    team_ai_wallet_payload,
    team_budget_payload,
    test_provider_config,
    test_provider_config_draft,
    transfer_team_points_to_ai_wallet,
    update_provider_config,
)

router = APIRouter()


def require_platform_scope(current: CurrentUser) -> None:
    if "platform:manage" not in current.global_permissions:
        raise AppError(ErrorCode.PERMISSION_DENIED, "无权限访问该资源")


def require_team_ai_resource_read(current: CurrentUser) -> None:
    permissions = set(current.permissions)
    if "budget:view" not in permissions and "ai_provider:manage" not in permissions:
        raise AppError(ErrorCode.PERMISSION_DENIED, "无权限访问该资源")


def resolve_ai_resource_team_scope(current: CurrentUser, team_id: str | None) -> str | None:
    if team_id:
        ensure_team_scope(current, team_id)
        require_team_ai_resource_read(current)
        return team_id
    if current.team_id:
        require_team_ai_resource_read(current)
        return current.team_id
    require_platform_scope(current)
    return None


def ensure_provider_payload_scope(current: CurrentUser, payload: dict) -> None:
    scope = str(payload.get("scope") or "team")
    if scope == "team":
        ensure_team_scope(current, str(payload.get("team_id") or ""))
        return
    require_platform_scope(current)


def ensure_provider_config_scope(db: MongoDatabase, current: CurrentUser, provider_id: str) -> None:
    item = db.get(AiProviderConfig, provider_id)
    if not item:
        raise AppError(ErrorCode.NOT_FOUND, "资源不存在")
    if item.team_id:
        ensure_team_scope(current, item.team_id)
        return
    require_platform_scope(current)


def ensure_provider_estimate_scope(db: MongoDatabase, current: CurrentUser, provider_id: str | None) -> None:
    if not provider_id:
        return
    item = db.get(AiProviderConfig, provider_id)
    if not item:
        raise AppError(ErrorCode.NOT_FOUND, "资源不存在")
    if item.team_id:
        ensure_team_scope(current, item.team_id)
        return
    if current.team_id:
        return
    require_platform_scope(current)


@router.get("/configs")
def get_configs(
    request: Request,
    team_id: str | None = Query(default=None),
    current: CurrentUser = Depends(get_current_user),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    scoped_team_id = resolve_ai_resource_team_scope(current, team_id)
    return success_response(
        {"items": list_provider_configs(db, scoped_team_id, manage_platform="platform:manage" in current.global_permissions)},
        "success",
        request,
    )


@router.post("/configs")
def post_config(
    payload: AiProviderConfigCreate,
    request: Request,
    current: CurrentUser = Depends(require_permissions("ai_provider:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    raw_payload = payload.model_dump()
    ensure_provider_payload_scope(current, raw_payload)
    data = create_provider_config(db, raw_payload, current.user_id, request)
    return success_response(data, "AI Provider 已保存", request)


@router.patch("/configs/{provider_id}")
def patch_config(
    provider_id: str,
    payload: AiProviderConfigUpdate,
    request: Request,
    current: CurrentUser = Depends(require_permissions("ai_provider:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_provider_config_scope(db, current, provider_id)
    data = update_provider_config(db, provider_id, payload.model_dump(exclude_unset=True), current.user_id, request)
    return success_response(data, "AI Provider 已更新", request)


@router.post("/configs/{provider_id}/duplicate")
def post_duplicate_config(
    provider_id: str,
    request: Request,
    current: CurrentUser = Depends(require_permissions("ai_provider:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_provider_config_scope(db, current, provider_id)
    data = duplicate_provider_config(db, provider_id, current.user_id, request)
    return success_response(data, "AI Provider 已复制", request)


@router.post("/configs/{provider_id}/status")
def post_provider_status(
    provider_id: str,
    payload: AiProviderConfigStatusUpdate,
    request: Request,
    current: CurrentUser = Depends(require_permissions("ai_provider:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_provider_config_scope(db, current, provider_id)
    data = set_provider_config_status(db, provider_id, payload.status, current.user_id, request)
    return success_response(data, "AI Provider 状态已更新", request)


@router.delete("/configs/{provider_id}")
def remove_provider_config(
    provider_id: str,
    request: Request,
    current: CurrentUser = Depends(require_permissions("ai_provider:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_provider_config_scope(db, current, provider_id)
    delete_provider_config(db, provider_id, current.user_id, request)
    return success_response({"provider_id": provider_id}, "AI Provider 已删除", request)


@router.post("/configs/{provider_id}/test")
def post_provider_test(
    provider_id: str,
    payload: AiProviderConfigTestRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("ai_provider:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_provider_config_scope(db, current, provider_id)
    data = test_provider_config(db, provider_id, payload.model_dump(), current.user_id, request)
    return success_response(data, "AI Provider 连接测试完成", request)


@router.post("/configs/test-draft")
def post_provider_test_draft(
    payload: AiProviderConfigDraftTestRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("ai_provider:manage")),
) -> dict:
    raw_payload = payload.model_dump()
    ensure_provider_payload_scope(current, raw_payload)
    data = test_provider_config_draft(raw_payload, request)
    return success_response(data, "AI Provider draft test completed", request)


@router.get("/teams/{team_id}/budget")
def get_team_budget(
    team_id: str,
    request: Request,
    current: CurrentUser = Depends(require_permissions("budget:view")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    return success_response(team_budget_payload(db, team_id), "success", request)


@router.get("/teams/{team_id}/wallet")
def get_team_ai_wallet(
    team_id: str,
    request: Request,
    current: CurrentUser = Depends(require_permissions("budget:view")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    return success_response(team_ai_wallet_payload(db, team_id), "success", request)


@router.get("/teams/{team_id}/wallet/ledger")
def get_team_ai_wallet_ledger(
    team_id: str,
    request: Request,
    current: CurrentUser = Depends(require_permissions("budget:view")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    return success_response({"items": list_team_ai_wallet_ledger(db, team_id)}, "success", request)


@router.get("/teams/{team_id}/history")
def get_team_ai_history(
    team_id: str,
    request: Request,
    current: CurrentUser = Depends(require_permissions("budget:view")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    return success_response({"items": list_team_ai_history(db, team_id)}, "success", request)


@router.post("/teams/{team_id}/wallet/recharge")
def post_team_ai_wallet_recharge(
    team_id: str,
    payload: AiWalletRechargeRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("budget:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    data = recharge_team_ai_wallet(
        db,
        team_id=team_id,
        amount=payload.amount,
        payment_method=payload.payment_method,
        operator_id=current.user_id,
        request=request,
    )
    return success_response(data, "AI 积分钱包已充值", request)


@router.post("/teams/{team_id}/wallet/transfer-in")
def post_team_ai_wallet_transfer_in(
    team_id: str,
    payload: AiWalletTransferInRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("budget:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    data = transfer_team_points_to_ai_wallet(
        db,
        team_id=team_id,
        amount=payload.amount,
        payment_password=payload.payment_password,
        operator_id=current.user_id,
        request=request,
    )
    return success_response(data, "AI 积分钱包转入成功", request)


@router.post("/teams/{team_id}/budget/limit")
def update_budget_limit(
    team_id: str,
    payload: BudgetLimitUpdate,
    request: Request,
    current: CurrentUser = Depends(require_permissions("budget:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    data = set_budget_limit(db, team_id, payload.total_limit, current.user_id, request)
    return success_response(data, "预算上限已更新", request)


@router.post("/teams/{team_id}/budget/alerts")
def update_budget_alert(
    team_id: str,
    payload: BudgetAlertUpdate,
    request: Request,
    current: CurrentUser = Depends(require_permissions("budget:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    data = set_budget_alert(db, team_id, payload.enabled, payload.threshold, current.user_id, request)
    return success_response(data, "预算预警已更新", request)


@router.post("/estimate")
def post_estimate(
    payload: AiEstimateRequest,
    request: Request,
    current: CurrentUser = Depends(get_current_user),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_provider_estimate_scope(db, current, payload.provider_id)
    return success_response(estimate_tokens(db, payload.model_dump()), "success", request)


@router.get("/calls")
def get_calls(
    request: Request,
    team_id: str | None = Query(default=None),
    current: CurrentUser = Depends(get_current_user),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    scoped_team_id = resolve_ai_resource_team_scope(current, team_id)
    return success_response({"items": list_call_logs(db, scoped_team_id)}, "success", request)


@router.get("/teams/{team_id}/reports/cost")
def get_cost_report(
    team_id: str,
    request: Request,
    current: CurrentUser = Depends(require_permissions("budget:view")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    ensure_team_scope(current, team_id)
    return success_response(cost_report(db, team_id), "success", request)


@router.get("/cert-types")
def get_cert_types(
    request: Request,
    current: CurrentUser = Depends(get_current_user),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    return success_response({"items": list_cert_types(db)}, "success", request)
