from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import Response

from app.api.deps import CurrentUser, get_current_user, require_global_permissions
from app.core.database import MongoDatabase, get_db
from app.core.responses import success_response
from app.schemas.profile import (
    AddPointsRequest,
    PointsWithdrawRequest,
    ReputationAppealRequest,
    ReviewCertificationRequest,
    SubmitEducationCertificationRequest,
    SubmitDomainCertificationRequest,
    UpdateMyProfileRequest,
)
from app.services.profile_service import (
    add_points,
    list_certification_review_queue,
    my_profile_payload,
    points_payload,
    reputation_payload,
    submit_reputation_appeal,
    review_certification,
    submit_domain_certification,
    submit_education_certification,
    update_my_profile,
)
from app.services.labeler_dashboard_service import personal_labeler_dashboard_payload
from app.services.platform_service import create_profile_withdraw_request
from app.services.upload_service import create_profile_material_upload, get_profile_material_file, uploaded_file_bytes

router = APIRouter()


@router.get("/me")
def get_my_profile(request: Request, current: CurrentUser = Depends(get_current_user), db: MongoDatabase = Depends(get_db)) -> dict:
    data = my_profile_payload(db, current.user)
    return success_response(data, "success", request)


@router.get("/dashboard")
def get_personal_labeler_dashboard(request: Request, current: CurrentUser = Depends(get_current_user), db: MongoDatabase = Depends(get_db)) -> dict:
    data = personal_labeler_dashboard_payload(db, current=current)
    return success_response(data, "success", request)


@router.put("/me")
def put_my_profile(
    payload: UpdateMyProfileRequest,
    request: Request,
    current: CurrentUser = Depends(get_current_user),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = update_my_profile(db, current.user, payload.model_dump(exclude_unset=True), request)
    return success_response(data, "个人资料已更新", request)


@router.post("/certifications/domain")
def submit_domain_cert(
    payload: SubmitDomainCertificationRequest,
    request: Request,
    current: CurrentUser = Depends(get_current_user),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = submit_domain_certification(db, current.user, payload.model_dump(), request)
    return success_response(data, "领域认证已提交", request)


@router.post("/certifications/education")
def submit_education_cert(
    payload: SubmitEducationCertificationRequest,
    request: Request,
    current: CurrentUser = Depends(get_current_user),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = submit_education_certification(db, current.user, payload.model_dump(), request)
    return success_response(data, "学历认证已提交", request)


@router.post("/certifications/materials")
async def upload_certification_material(
    request: Request,
    file: UploadFile = File(...),
    category: str = Form(default="verification"),
    current: CurrentUser = Depends(get_current_user),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = await create_profile_material_upload(db, owner_id=current.user_id, file=file, category=category, request=request)
    return success_response(data, "证明材料已上传", request)


@router.get("/certifications/materials/{file_id}/download")
def download_certification_material(
    file_id: str,
    current: CurrentUser = Depends(get_current_user),
    db: MongoDatabase = Depends(get_db),
) -> Response:
    item = get_profile_material_file(db, file_id=file_id, requester_id=current.user_id, permissions=current.global_permissions)
    body = uploaded_file_bytes(item)
    ascii_filename = item.filename.encode("ascii", "ignore").decode("ascii") or "material"
    return Response(
        content=body,
        media_type=item.content_type,
        headers={"Content-Disposition": f"attachment; filename=\"{ascii_filename}\"; filename*=UTF-8''{quote(item.filename)}"},
    )


@router.get("/certifications/review-queue")
def certification_review_queue(
    request: Request,
    cert_category: str | None = Query(default=None),
    status: str | None = Query(default="pending_review"),
    keyword: str | None = Query(default=None),
    current: CurrentUser = Depends(require_global_permissions("certification:review")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    items = list_certification_review_queue(db, cert_category, status, keyword)
    data = {"items": items, "pagination": {"page": 1, "page_size": 100, "total": len(items), "total_pages": 1}}
    return success_response(data, "success", request)


@router.post("/certifications/{cert_id}/review")
def review_cert(
    cert_id: str,
    payload: ReviewCertificationRequest,
    request: Request,
    current: CurrentUser = Depends(require_global_permissions("certification:review")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = review_certification(db, cert_id, payload.model_dump(), current.user_id, request)
    return success_response(data, "资质审核已处理", request)


@router.get("/points")
def get_points(request: Request, current: CurrentUser = Depends(get_current_user), db: MongoDatabase = Depends(get_db)) -> dict:
    data = points_payload(db, current.user)
    return success_response(data, "success", request)


@router.post("/points")
def add_user_points(
    payload: AddPointsRequest,
    request: Request,
    current: CurrentUser = Depends(require_global_permissions("platform:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = add_points(db, payload.model_dump(), current.user_id, request)
    return success_response(data, "积分已更新", request)




@router.get("/reputation")
def get_reputation(request: Request, current: CurrentUser = Depends(get_current_user), db: MongoDatabase = Depends(get_db)) -> dict:
    data = reputation_payload(db, current.user)
    return success_response(data, "success", request)


@router.post("/reputation/appeals")
def appeal_reputation_deduction(
    payload: ReputationAppealRequest,
    request: Request,
    current: CurrentUser = Depends(get_current_user),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = submit_reputation_appeal(db, user=current.user, ledger_id=payload.ledger_id, reason=payload.reason, request=request)
    return success_response(data, "信誉分申诉已提交", request)

@router.post("/points/withdraw")
def withdraw_user_points(
    payload: PointsWithdrawRequest,
    request: Request,
    current: CurrentUser = Depends(get_current_user),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = create_profile_withdraw_request(
        db,
        user=current.user,
        amount=payload.amount,
        payout_method=payload.payout_method,
        account_name=payload.account_name,
        account_no=payload.account_no,
        bank_name=payload.bank_name,
        note=payload.note,
        request=request,
    )
    return success_response(data, "提现申请已提交，等待平台处理", request)
