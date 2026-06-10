from fastapi import APIRouter, Depends, Request

from app.api.deps import CurrentUser, require_permissions
from app.core.database import MongoDatabase, get_db
from app.core.errors import AppError, ErrorCode
from app.core.responses import success_response
from app.schemas.production import CopyTemplateRequest, CreateTemplateRequest, TemplateValidationRequest, UpdateTemplateRequest
from app.services.production_service import archive_template, copy_template, create_template, delete_template, get_template, get_template_readiness, get_template_version_diff, list_template_versions, list_templates, publish_template, update_template, validate_template_answers

router = APIRouter()


def require_team_id(current: CurrentUser) -> str:
    if not current.team_id:
        raise AppError(ErrorCode.PERMISSION_DENIED, "缺少企业上下文")
    return current.team_id


@router.get("")
def list_template_route(request: Request, current: CurrentUser = Depends(require_permissions("task:read")), db: MongoDatabase = Depends(get_db)) -> dict:
    return success_response(list_templates(db, require_team_id(current)), "success", request)


@router.post("")
def create_template_route(
    payload: CreateTemplateRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("task:create")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = create_template(
        db,
        team_id=require_team_id(current),
        owner_id=current.user_id,
        name=payload.name,
        description=payload.description,
        schema=payload.template_schema.model_dump(),
        auto_saved=payload.auto_saved,
        request=request,
    )
    return success_response(data, "模板已保存", request)


@router.get("/{template_id}")
def get_template_route(template_id: str, request: Request, current: CurrentUser = Depends(require_permissions("task:read")), db: MongoDatabase = Depends(get_db)) -> dict:
    return success_response(get_template(db, require_team_id(current), template_id), "success", request)


@router.put("/{template_id}")
def update_template_route(
    template_id: str,
    payload: UpdateTemplateRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("task:manage")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    raw_payload = payload.model_dump(exclude_unset=True)
    if "template_schema" in raw_payload:
        raw_payload["schema"] = raw_payload.pop("template_schema")
    data = update_template(db, team_id=require_team_id(current), template_id=template_id, payload=raw_payload, operator_id=current.user_id, request=request)
    return success_response(data, "模板已更新", request)


@router.post("/{template_id}/publish")
def publish_template_route(template_id: str, request: Request, current: CurrentUser = Depends(require_permissions("task:manage")), db: MongoDatabase = Depends(get_db)) -> dict:
    return success_response(publish_template(db, team_id=require_team_id(current), template_id=template_id, operator_id=current.user_id, request=request), "模板已发布", request)


@router.get("/{template_id}/readiness")
def get_template_readiness_route(template_id: str, request: Request, current: CurrentUser = Depends(require_permissions("task:read")), db: MongoDatabase = Depends(get_db)) -> dict:
    return success_response(get_template_readiness(db, require_team_id(current), template_id), "success", request)


@router.post("/validate")
def validate_template_answers_route(payload: TemplateValidationRequest, request: Request, current: CurrentUser = Depends(require_permissions("task:read"))) -> dict:
    data = validate_template_answers(payload.template_schema.model_dump(), payload.answers, payload.content)
    return success_response(data, "success", request)


@router.post("/{template_id}/copy")
def copy_template_route(
    template_id: str,
    payload: CopyTemplateRequest,
    request: Request,
    current: CurrentUser = Depends(require_permissions("task:create")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    data = copy_template(db, team_id=require_team_id(current), template_id=template_id, payload=payload.model_dump(exclude_unset=True), operator_id=current.user_id, request=request)
    return success_response(data, "模板副本已创建", request)


@router.post("/{template_id}/archive")
def archive_template_route(template_id: str, request: Request, current: CurrentUser = Depends(require_permissions("task:manage")), db: MongoDatabase = Depends(get_db)) -> dict:
    return success_response(archive_template(db, team_id=require_team_id(current), template_id=template_id, operator_id=current.user_id, request=request), "模板已归档", request)


@router.delete("/{template_id}")
def delete_template_route(template_id: str, request: Request, current: CurrentUser = Depends(require_permissions("task:manage")), db: MongoDatabase = Depends(get_db)) -> dict:
    delete_template(db, team_id=require_team_id(current), template_id=template_id, operator_id=current.user_id, request=request)
    return success_response(None, "模板已删除", request)


@router.get("/{template_id}/versions")
def template_versions_route(template_id: str, request: Request, current: CurrentUser = Depends(require_permissions("task:read")), db: MongoDatabase = Depends(get_db)) -> dict:
    return success_response(list_template_versions(db, require_team_id(current), template_id), "success", request)


@router.get("/{template_id}/versions/diff")
def template_version_diff_route(
    template_id: str,
    from_version: int,
    to_version: int,
    request: Request,
    current: CurrentUser = Depends(require_permissions("task:read")),
    db: MongoDatabase = Depends(get_db),
) -> dict:
    return success_response(get_template_version_diff(db, require_team_id(current), template_id, from_version, to_version), "success", request)


@router.get("/{template_id}/preview")
def template_preview_route(template_id: str, request: Request, current: CurrentUser = Depends(require_permissions("task:read")), db: MongoDatabase = Depends(get_db)) -> dict:
    data = get_template(db, require_team_id(current), template_id)
    return success_response({"template": data, "renderer_mode": "preview"}, "success", request)


@router.get("/{template_id}/export")
def template_export_route(template_id: str, request: Request, current: CurrentUser = Depends(require_permissions("task:read")), db: MongoDatabase = Depends(get_db)) -> dict:
    data = get_template(db, require_team_id(current), template_id)
    return success_response({"schema": data["schema"], "name": data["name"], "version": data["latest_version"]}, "success", request)
