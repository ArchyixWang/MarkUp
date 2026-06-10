import json
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import Response

from app.api.deps import CurrentUser, require_permissions
from app.core.database import MongoDatabase, get_db
from app.core.errors import AppError, ErrorCode
from app.core.responses import success_response
from app.schemas.production import DatasetMediaAssetBindRequest, DatasetTableUpdateRequest, UpdateDatasetRequest
from app.services.production_service import bind_dataset_media_asset, create_dataset, dataset_download, delete_dataset, get_dataset, infer_media_type, list_datasets, merge_dataset_upload, update_dataset, update_dataset_table
from app.services.upload_service import create_upload

router = APIRouter()


async def uploaded_media_assets(
    db: MongoDatabase,
    *,
    team_id: str,
    owner_id: str,
    media_files: list[UploadFile] | None,
    request: Request,
) -> list[dict]:
    assets: list[dict] = []
    for media_file in media_files or []:
        upload = await create_upload(db, team_id=team_id, owner_id=owner_id, file=media_file, category="media", request=request)
        assets.append({
            "id": upload["file_id"],
            "file_id": upload["file_id"],
            "filename": upload["filename"],
            "name": upload["filename"],
            "url": upload["url"],
            "type": infer_media_type(upload["filename"], upload.get("content_type")),
            "mime_type": upload.get("content_type"),
            "content_type": upload.get("content_type"),
            "size": upload.get("size"),
            "source": "uploaded_file",
            "storage": "uploaded_file",
        })
    return assets


@router.get("")
def list_dataset_route(request: Request, current: CurrentUser = Depends(require_permissions("task:read")), db: MongoDatabase = Depends(get_db)) -> dict:
    if not current.team_id:
        raise AppError(ErrorCode.PERMISSION_DENIED, "缺少企业上下文")
    return success_response(list_datasets(db, current.team_id), "success", request)


@router.post("")
async def create_dataset_route(
    request: Request,
    name: str = Form(min_length=2, max_length=120),
    description: str | None = Form(default=None, max_length=1000),
    media_assets: str | None = Form(default=None),
    file: UploadFile = File(...),
    media_files: list[UploadFile] | None = File(default=None),
    current: CurrentUser = Depends(require_permissions("task:create")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    if not current.team_id:
        raise AppError(ErrorCode.PERMISSION_DENIED, "缺少企业上下文")
    media_payload = []
    if media_assets:
        try:
            media_payload = json.loads(media_assets)
        except json.JSONDecodeError as exc:
            raise AppError(ErrorCode.VALIDATION_FORMAT, "多模态素材清单必须是合法 JSON") from exc
        if not isinstance(media_payload, list):
            raise AppError(ErrorCode.VALIDATION_FORMAT, "多模态素材清单必须是数组")
    media_payload.extend(await uploaded_media_assets(db, team_id=current.team_id, owner_id=current.user_id, media_files=media_files, request=request))
    data = create_dataset(
        db,
        team_id=current.team_id,
        owner_id=current.user_id,
        name=name,
        description=description,
        filename=file.filename or "dataset.json",
        content=await file.read(),
        media_assets=media_payload,
        request=request,
    )
    return success_response(data, "数据集导入成功", request)


@router.get("/{dataset_id}")
def get_dataset_route(dataset_id: str, request: Request, current: CurrentUser = Depends(require_permissions("task:read")), db: MongoDatabase = Depends(get_db)) -> dict:
    if not current.team_id:
        raise AppError(ErrorCode.PERMISSION_DENIED, "缺少企业上下文")
    return success_response(get_dataset(db, current.team_id, dataset_id), "success", request)


@router.get("/{dataset_id}/download")
def download_dataset_route(
    dataset_id: str,
    format: str | None = None,
    current: CurrentUser = Depends(require_permissions("task:read")),
    db: MongoDatabase = Depends(get_db),
) -> Response:
    if not current.team_id:
        raise AppError(ErrorCode.PERMISSION_DENIED, "缺少企业上下文")
    filename, media_type, body = dataset_download(db, current.team_id, dataset_id, format)
    ascii_filename = filename.encode("ascii", "ignore").decode("ascii") or "dataset"
    return Response(
        content=body,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename=\"{ascii_filename}\"; filename*=UTF-8''{quote(filename)}"},
    )


@router.put("/{dataset_id}")
def update_dataset_route(
    dataset_id: str,
    payload: UpdateDatasetRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("task:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    if not current.team_id:
        raise AppError(ErrorCode.PERMISSION_DENIED, "缺少企业上下文")
    data = update_dataset(db, team_id=current.team_id, dataset_id=dataset_id, payload=payload.model_dump(exclude_unset=True), operator_id=current.user_id, request=request)
    return success_response(data, "数据集已更新", request)


@router.put("/{dataset_id}/table")
def update_dataset_table_route(
    dataset_id: str,
    payload: DatasetTableUpdateRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("task:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    if not current.team_id:
        raise AppError(ErrorCode.PERMISSION_DENIED, "缺少团队上下文")
    data = update_dataset_table(db, team_id=current.team_id, dataset_id=dataset_id, payload=payload.model_dump(), operator_id=current.user_id, request=request)
    return success_response(data, "数据表已保存", request)


@router.post("/{dataset_id}/media-assets/bind")
def bind_dataset_media_asset_route(
    dataset_id: str,
    payload: DatasetMediaAssetBindRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("task:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    if not current.team_id:
        raise AppError(ErrorCode.PERMISSION_DENIED, "缺少团队上下文")
    data = bind_dataset_media_asset(db, team_id=current.team_id, dataset_id=dataset_id, payload=payload.model_dump(), operator_id=current.user_id, request=request)
    return success_response(data, "素材已绑定到数据行", request)


@router.post("/{dataset_id}/patch-upload")
async def patch_upload_dataset_route(
    dataset_id: str,
    request: Request,
    primary_key: str = Form(min_length=1, max_length=120),
    media_assets: str | None = Form(default=None),
    file: UploadFile = File(...),
    media_files: list[UploadFile] | None = File(default=None),
    current: CurrentUser = Depends(require_permissions("task:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    if not current.team_id:
        raise AppError(ErrorCode.PERMISSION_DENIED, "缺少团队上下文")
    media_payload = []
    if media_assets:
        try:
            media_payload = json.loads(media_assets)
        except json.JSONDecodeError as exc:
            raise AppError(ErrorCode.VALIDATION_FORMAT, "多模态素材清单必须是合法 JSON") from exc
        if not isinstance(media_payload, list):
            raise AppError(ErrorCode.VALIDATION_FORMAT, "多模态素材清单必须是数组")
    media_payload.extend(await uploaded_media_assets(db, team_id=current.team_id, owner_id=current.user_id, media_files=media_files, request=request))
    data = merge_dataset_upload(
        db,
        team_id=current.team_id,
        dataset_id=dataset_id,
        operator_id=current.user_id,
        filename=file.filename or "dataset.json",
        content=await file.read(),
        primary_key=primary_key,
        media_assets=media_payload,
        request=request,
    )
    return success_response(data, "补上传数据已合并", request)


@router.delete("/{dataset_id}")
def delete_dataset_route(dataset_id: str, request: Request, current: CurrentUser = Depends(require_permissions("task:manage")), db: MongoDatabase = Depends(get_db)) -> dict:
    if not current.team_id:
        raise AppError(ErrorCode.PERMISSION_DENIED, "缺少企业上下文")
    delete_dataset(db, team_id=current.team_id, dataset_id=dataset_id, operator_id=current.user_id, request=request)
    return success_response(None, "数据集已删除", request)
