from fastapi import APIRouter, Depends, Query, Request

from app.api.deps import CurrentUser, require_global_permissions
from app.core.database import MongoDatabase, get_db
from app.core.responses import success_response
from app.schemas.platform import (
    PlatformAgentEmbeddingSettingUpdate,
    PlatformCommissionSettingUpdate,
    PlatformPaymentReviewRequest,
    PlatformReputationAppealReviewRequest,
    PlatformTeamVerificationReviewRequest,
)
from app.schemas.profile import ReviewCertificationRequest
from app.services.platform_service import (
    agent_embedding_setting_payload,
    commission_setting_payload,
    list_payment_requests,
    list_platform_settlements,
    list_team_verification_queue,
    platform_certification_queue,
    platform_reputation_appeal_queue,
    platform_review_certification,
    platform_review_reputation_appeal,
    review_payment_request,
    review_team_verification,
    update_agent_embedding_setting,
    update_commission_setting,
    workbench_payload,
)

router = APIRouter()


@router.get("/workbench")
def get_platform_workbench(
    request: Request,
    current: CurrentUser = Depends(require_global_permissions("platform:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    return success_response(workbench_payload(db), "success", request)


@router.get("/settlements")
def get_platform_settlements(
    request: Request,
    team_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
    keyword: str | None = Query(default=None),
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current: CurrentUser = Depends(require_global_permissions("platform:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = list_platform_settlements(
        db,
        team_id=team_id,
        status=status,
        keyword=keyword,
        start_date=start_date,
        end_date=end_date,
        page=page,
        page_size=page_size,
    )
    return success_response(data, "success", request)


@router.get("/payment-requests")
def get_payment_requests(
    request: Request,
    status: str | None = Query(default=None),
    owner_type: str | None = Query(default=None),
    keyword: str | None = Query(default=None),
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current: CurrentUser = Depends(require_global_permissions("platform:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = list_payment_requests(
        db,
        status=status,
        owner_type=owner_type,
        keyword=keyword,
        start_date=start_date,
        end_date=end_date,
        page=page,
        page_size=page_size,
    )
    return success_response(data, "success", request)


@router.post("/payment-requests/{request_id}/review")
def post_payment_review(
    request_id: str,
    payload: PlatformPaymentReviewRequest,
    request: Request,
    current: CurrentUser = Depends(require_global_permissions("platform:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = review_payment_request(db, request_id=request_id, decision=payload.decision, comment=payload.comment, operator_id=current.user_id, request=request)
    return success_response(data, "支付申请已处理", request)


@router.get("/teams/verification-queue")
def get_team_verification_queue(
    request: Request,
    status: str | None = Query(default="pending_review"),
    keyword: str | None = Query(default=None),
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current: CurrentUser = Depends(require_global_permissions("platform:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = list_team_verification_queue(
        db,
        status=status,
        keyword=keyword,
        start_date=start_date,
        end_date=end_date,
        page=page,
        page_size=page_size,
    )
    return success_response(data, "success", request)


@router.post("/teams/{team_id}/verification/review")
def post_team_verification_review(
    team_id: str,
    payload: PlatformTeamVerificationReviewRequest,
    request: Request,
    current: CurrentUser = Depends(require_global_permissions("platform:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = review_team_verification(db, team_id=team_id, decision=payload.decision, comment=payload.comment, operator_id=current.user_id, request=request)
    return success_response(data, "企业认证已处理", request)


@router.get("/certifications/review-queue")
def get_platform_certification_queue(
    request: Request,
    cert_category: str | None = Query(default=None),
    status: str | None = Query(default="pending_review"),
    keyword: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current: CurrentUser = Depends(require_global_permissions("certification:review")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = platform_certification_queue(db, cert_category=cert_category, status=status, keyword=keyword, page=page, page_size=page_size)
    return success_response(data, "success", request)


@router.post("/certifications/{cert_id}/review")
def post_platform_certification_review(
    cert_id: str,
    payload: ReviewCertificationRequest,
    request: Request,
    current: CurrentUser = Depends(require_global_permissions("certification:review")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = platform_review_certification(db, cert_id=cert_id, payload=payload.model_dump(), operator_id=current.user_id, request=request)
    return success_response(data, "资质审核已处理", request)


@router.get("/reputation-appeals")
def get_platform_reputation_appeals(
    request: Request,
    status: str | None = Query(default="pending"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current: CurrentUser = Depends(require_global_permissions("platform:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = platform_reputation_appeal_queue(db, status=status, page=page, page_size=page_size)
    return success_response(data, "success", request)


@router.post("/reputation-appeals/{appeal_id}/review")
def post_platform_reputation_appeal_review(
    appeal_id: str,
    payload: PlatformReputationAppealReviewRequest,
    request: Request,
    current: CurrentUser = Depends(require_global_permissions("platform:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = platform_review_reputation_appeal(db, appeal_id=appeal_id, decision=payload.decision, reviewer_notes=payload.reviewer_notes, operator_id=current.user_id, request=request)
    return success_response(data, "信誉分申诉已处理", request)


@router.get("/settings/commission")
def get_commission_setting(
    request: Request,
    current: CurrentUser = Depends(require_global_permissions("platform:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    return success_response(commission_setting_payload(db), "success", request)


@router.put("/settings/commission")
def put_commission_setting(
    payload: PlatformCommissionSettingUpdate,
    request: Request,
    current: CurrentUser = Depends(require_global_permissions("platform:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = update_commission_setting(db, commission_rate_bps=payload.commission_rate_bps, operator_id=current.user_id, request=request)
    return success_response(data, "平台服务费率已更新", request)


@router.get("/settings/agent-embedding")
def get_agent_embedding_setting(
    request: Request,
    current: CurrentUser = Depends(require_global_permissions("platform:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    return success_response(agent_embedding_setting_payload(db), "success", request)


@router.put("/settings/agent-embedding")
def put_agent_embedding_setting(
    payload: PlatformAgentEmbeddingSettingUpdate,
    request: Request,
    current: CurrentUser = Depends(require_global_permissions("platform:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = update_agent_embedding_setting(
        db,
        api_base=payload.api_base,
        api_key=payload.api_key,
        model=payload.model,
        operator_id=current.user_id,
        request=request,
    )
    return success_response(data, "平台问答 Agent Embedding 配置已更新", request)
