import csv
import io
import json
from datetime import datetime
from typing import Any

from fastapi import Request

from app.core.database import MongoDatabase
from app.core.errors import AppError, ErrorCode
from app.models.audit import AuditLog
from app.models.user import User, UserProfile
from app.services.csv_utils import escape_csv_formula


AGENT_AUDIT_ACTIONS = {
    "ai_review_batch_triggered",
    "ai_review_job_created",
    "ai_review_job_processed",
    "ai_review_job_requeued",
    "ai_review_submission_released_to_review",
    "labeling_ai_assist_generated",
    "system_agent_settings_updated",
}


def write_audit_log(
    db: MongoDatabase,
    *,
    entity_type: str,
    entity_id: str,
    action: str,
    operator_id: str | None,
    changes: dict | None = None,
    team_id: str | None = None,
    request: Request | None = None,
) -> AuditLog:
    log = AuditLog(
        team_id=team_id or _infer_team_id(entity_type, entity_id, changes),
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        operator_id=operator_id,
        request_id=getattr(request.state, "request_id", None) if request else None,
        changes=changes,
        ip_address=request.client.host if request and request.client else None,
        user_agent=request.headers.get("user-agent") if request else None,
    )
    db.add(log)
    return log


def list_audit_logs(
    db: MongoDatabase,
    *,
    team_id: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    action: str | None = None,
    operator_id: str | None = None,
    keyword: str | None = None,
    risk_level: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    logs = _find_audit_logs(
        db,
        team_id=team_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        operator_id=operator_id,
        keyword=keyword,
        risk_level=risk_level,
        start_date=start_date,
        end_date=end_date,
    )
    safe_page_size = min(max(page_size, 1), 100)
    safe_page = max(page, 1)
    start = (safe_page - 1) * safe_page_size
    sliced = logs[start : start + safe_page_size]
    return {
        "items": [audit_log_payload(log, db=db) for log in sliced],
        "pagination": {
            "page": safe_page,
            "page_size": safe_page_size,
            "total": len(logs),
            "total_pages": max((len(logs) + safe_page_size - 1) // safe_page_size, 1),
        },
    }


def export_audit_logs(
    db: MongoDatabase,
    *,
    team_id: str,
    operator_id: str | None,
    request: Request,
    entity_type: str | None = None,
    entity_id: str | None = None,
    action: str | None = None,
    target_operator_id: str | None = None,
    keyword: str | None = None,
    risk_level: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    export_format: str = "csv",
) -> dict:
    logs = _find_audit_logs(
        db,
        team_id=team_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        operator_id=target_operator_id,
        keyword=keyword,
        risk_level=risk_level,
        start_date=start_date,
        end_date=end_date,
    )
    payloads = [audit_log_payload(log, db=db) for log in logs]
    write_audit_log(
        db,
        entity_type="audit_log",
        entity_id=team_id,
        action="audit_log_exported",
        operator_id=operator_id,
        team_id=team_id,
        changes={
            "format": export_format,
            "exported_count": len(payloads),
            "filters": {
                "entity_type": entity_type,
                "entity_id": entity_id,
                "action": action,
                "operator_id": target_operator_id,
                "keyword": keyword,
                "risk_level": risk_level,
                "start_date": start_date,
                "end_date": end_date,
            },
        },
        request=request,
    )
    db.commit()
    if export_format == "json":
        content = json.dumps(payloads, ensure_ascii=False, indent=2)
        return {"content": content, "media_type": "application/json; charset=utf-8", "filename": "operation_logs.json", "count": len(payloads)}
    content = _audit_logs_to_csv(payloads)
    return {"content": content, "media_type": "text/csv; charset=utf-8", "filename": "operation_logs.csv", "count": len(payloads)}


def get_audit_log(db: MongoDatabase, log_id: str) -> dict:
    log = db.get(AuditLog, log_id)
    if not log:
        raise AppError(ErrorCode.NOT_FOUND, "操作日志不存在")
    return audit_log_payload(log, db=db)


def _find_audit_logs(
    db: MongoDatabase,
    *,
    team_id: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    action: str | None = None,
    operator_id: str | None = None,
    keyword: str | None = None,
    risk_level: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[AuditLog]:
    query: dict = {}
    if team_id:
        query["team_id"] = team_id
    if entity_type:
        query["entity_type"] = entity_type
    if entity_id:
        query["entity_id"] = entity_id
    if action:
        query["action"] = action
    if operator_id:
        query["operator_id"] = operator_id
    created_filter = {}
    if start_date:
        created_filter["$gte"] = _parse_datetime(start_date)
    if end_date:
        created_filter["$lte"] = _parse_datetime(end_date)
    if created_filter:
        query["created_at"] = created_filter
    logs = db.find(AuditLog, query, sort=[("created_at", -1)])
    if keyword:
        lowered = keyword.lower()
        logs = [
            log
            for log in logs
            if lowered in log.entity_type.lower()
            or lowered in log.entity_id.lower()
            or lowered in log.action.lower()
            or lowered in (log.operator_id or "").lower()
            or lowered in (log.request_id or "").lower()
            or lowered in str(log.changes or {}).lower()
        ]
    if risk_level and risk_level != "all":
        logs = [log for log in logs if infer_risk_level(log.action) == risk_level]
    return logs


def _audit_logs_to_csv(payloads: list[dict]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["时间", "风险", "企业ID", "实体类型", "实体ID", "动作", "操作人", "摘要", "Request ID", "IP", "User-Agent", "变更"])
    for item in payloads:
        write_csv_row(
            writer,
            [
                item.get("created_at") or "",
                item.get("risk_level") or "",
                item.get("team_id") or "",
                item.get("entity_type") or "",
                item.get("entity_id") or "",
                item.get("action") or "",
                item.get("operator_name") or item.get("operator_id") or "系统",
                item.get("summary") or "",
                item.get("request_id") or "",
                item.get("ip_address") or "",
                item.get("user_agent") or "",
                json.dumps(item.get("changes") or {}, ensure_ascii=False),
            ]
        )
    return "\ufeff" + output.getvalue()


def write_csv_row(writer: Any, row: list) -> None:
    writer.writerow([escape_csv_formula(value) for value in row])


def user_display_name(db: MongoDatabase, user_id: str | None) -> str | None:
    if not user_id:
        return None
    profile = db.find_one(UserProfile, {"user_id": user_id})
    user = db.get(User, user_id)
    return (
        (profile.real_name if profile else None)
        or (profile.display_name if profile else None)
        or (user.username if user else None)
        or (user.email if user else None)
    )


def audit_log_payload(log: AuditLog, *, db: MongoDatabase | None = None) -> dict:
    operator_name = user_display_name(db, log.operator_id) if db else None
    if not operator_name and not log.operator_id and _is_agent_audit_log(log):
        operator_name = _agent_actor_name(log)
    return {
        "log_id": log.id,
        "team_id": log.team_id,
        "entity_type": log.entity_type,
        "entity_id": log.entity_id,
        "action": log.action,
        "operator_id": log.operator_id,
        "operator_name": operator_name,
        "request_id": log.request_id,
        "changes": log.changes or {},
        "ip_address": log.ip_address,
        "user_agent": log.user_agent,
        "risk_level": infer_risk_level(log.action),
        "summary": summarize_changes(log),
        "created_at": log.created_at.isoformat() if log.created_at else None,
    }


def _is_agent_audit_log(log: AuditLog) -> bool:
    return log.action in AGENT_AUDIT_ACTIONS or isinstance(log.changes, dict) and isinstance(log.changes.get("agent_actor"), str)


def _agent_actor_name(log: AuditLog) -> str:
    if isinstance(log.changes, dict):
        agent_actor = log.changes.get("agent_actor")
        if isinstance(agent_actor, str) and agent_actor.strip():
            return agent_actor
    return "MarkUp Agent"


def infer_risk_level(action: str) -> str:
    high_risk_keywords = ["deleted", "removed", "download", "provider", "permission", "switch", "member_removed"]
    important_keywords = ["published", "approved", "rejected", "budget", "review", "notification_created"]
    normalized = action.lower()
    if any(keyword in normalized for keyword in high_risk_keywords):
        return "high"
    if any(keyword in normalized for keyword in important_keywords):
        return "important"
    return "normal"


def summarize_changes(log: AuditLog) -> str:
    changes = log.changes or {}
    if "from" in changes and "to" in changes:
        return f"{changes['from']} -> {changes['to']}"
    fragments = []
    for key, value in changes.items():
        if isinstance(value, dict) and "from" in value and "to" in value:
            fragments.append(f"{key}: {value['from']} -> {value['to']}")
        else:
            fragments.append(f"{key}: {value}")
    return "；".join(fragments[:3]) if fragments else "该操作未记录字段级变更"


def _parse_datetime(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError as exc:
        raise AppError(ErrorCode.VALIDATION_FORMAT, "操作日志日期筛选必须使用 ISO 日期时间字符串") from exc


def _infer_team_id(entity_type: str, entity_id: str, changes: dict | None) -> str | None:
    if entity_type in {"team", "ai_resource"}:
        return entity_id
    if isinstance(changes, dict):
        raw_team_id = changes.get("team_id")
        if isinstance(raw_team_id, str):
            return raw_team_id
    return None
