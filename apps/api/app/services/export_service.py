from __future__ import annotations

import csv
import io
import json
import zipfile
from datetime import datetime, time
from typing import Any

from fastapi import Request

from app.core.database import MongoDatabase
from app.core.errors import AppError, ErrorCode
from app.core.security import now_utc
from app.models.audit import AuditLog
from app.models.export import ExportJob
from app.models.production import Question, Submission, Task
from app.services.audit_service import write_audit_log
from app.services.csv_utils import escape_csv_formula
from app.services.file_storage import read_storage_file, write_storage_file
from app.services.notification_dispatcher import notify_export_completed
from app.services.production_service import assert_production_switch_enabled, safe_filename, task_question_query, xlsx_column_name


def create_export_job(db: MongoDatabase, *, team_id: str, operator_id: str, payload: dict[str, Any], request: Request) -> dict:
    assert_production_switch_enabled(db, "data_export")
    task = get_export_task(db, team_id, payload["task_id"])
    export_format = normalize_export_format(payload.get("format"))
    export_rows = filtered_export_rows(db, task, payload.get("filters") or {})
    include_review_records = bool(payload.get("include_review_records"))
    review_records_by_submission = (
        review_records_for_export(db, team_id=team_id, submission_ids=[submission.id for _, submission in export_rows if submission])
        if include_review_records
        else {}
    )
    filename, media_type, body = render_export_file(
        task,
        export_rows,
        export_format,
        payload.get("fields_config") or {},
        include_review_records,
        review_records_by_submission,
    )
    now = now_utc().replace(tzinfo=None)
    job = ExportJob(
        team_id=team_id,
        task_id=task.id,
        created_by=operator_id,
        export_format=export_format,
        filters=payload.get("filters") or {},
        fields_config=payload.get("fields_config") or {},
        include_review_records=include_review_records,
        status="completed",
        progress=100,
        filename=filename,
        media_type=media_type,
        storage="filesystem",
        file_size=len(body),
        completed_at=now,
        updated_at=now,
    )
    job.path = write_storage_file(export_storage_path(job, filename), body)
    db.add(job)
    write_audit_log(db, entity_type="export", entity_id=job.id, action="export_created", operator_id=operator_id, team_id=team_id, changes={"task_id": task.id, "format": export_format, "row_count": len(export_rows)}, request=request)
    notify_export_completed(db, team_id=team_id, task=task, export_id=job.id, operator_id=operator_id, row_count=len(export_rows), request=request)
    db.commit()
    return export_job_payload(job)


def list_export_jobs(db: MongoDatabase, *, team_id: str, task_id: str | None = None, status: str | None = None, page: int = 1, page_size: int = 20) -> dict:
    query: dict[str, Any] = {"team_id": team_id}
    if task_id:
        query["task_id"] = task_id
    if status and status != "all":
        query["status"] = status
    jobs = db.find(ExportJob, query, sort=[("created_at", -1)])
    safe_page_size = min(max(page_size, 1), 100)
    safe_page = max(page, 1)
    start = (safe_page - 1) * safe_page_size
    sliced = jobs[start : start + safe_page_size]
    return {
        "items": [export_job_payload(job) for job in sliced],
        "pagination": {
            "page": safe_page,
            "page_size": safe_page_size,
            "total": len(jobs),
            "total_pages": max((len(jobs) + safe_page_size - 1) // safe_page_size, 1),
        },
    }


def get_export_job(db: MongoDatabase, *, team_id: str, export_id: str) -> dict:
    return export_job_payload(get_export_job_model(db, team_id, export_id))


def cancel_export_job(db: MongoDatabase, *, team_id: str, export_id: str, operator_id: str, request: Request) -> dict:
    job = get_export_job_model(db, team_id, export_id)
    if job.status == "completed":
        raise AppError(ErrorCode.STATE_CONFLICT, "已完成的导出任务不能取消")
    if job.status == "cancelled":
        return export_job_payload(job)
    job.status = "cancelled"
    job.progress = 0
    job.updated_at = now_utc().replace(tzinfo=None)
    db.save(job)
    write_audit_log(db, entity_type="export", entity_id=job.id, action="export_cancelled", operator_id=operator_id, team_id=team_id, changes={"status": "cancelled"}, request=request)
    db.commit()
    return export_job_payload(job)


def download_export_job(db: MongoDatabase, *, team_id: str, export_id: str, operator_id: str | None, request: Request) -> tuple[str, str, bytes]:
    job = get_export_job_model(db, team_id, export_id)
    if job.status != "completed":
        raise AppError(ErrorCode.STATE_CONFLICT, "导出任务尚未完成")
    body = export_job_bytes(job)
    job.download_count += 1
    job.updated_at = now_utc().replace(tzinfo=None)
    db.save(job)
    write_audit_log(db, entity_type="export", entity_id=job.id, action="export_downloaded", operator_id=operator_id, team_id=team_id, changes={"download_count": job.download_count, "filename": job.filename}, request=request)
    db.commit()
    return job.filename, job.media_type, body


def get_export_task(db: MongoDatabase, team_id: str, task_id: str) -> Task:
    task = db.get(Task, task_id)
    if not task or task.team_id != team_id:
        raise AppError(ErrorCode.NOT_FOUND, "任务不存在")
    return task


def get_export_job_model(db: MongoDatabase, team_id: str, export_id: str) -> ExportJob:
    job = db.get(ExportJob, export_id)
    if not job or job.team_id != team_id:
        raise AppError(ErrorCode.NOT_FOUND, "导出任务不存在")
    return job


def export_job_bytes(job: ExportJob) -> bytes:
    if job.storage == "filesystem" and job.path:
        return read_storage_file(job.path)
    return b""


def export_storage_path(job: ExportJob, filename: str) -> str:
    suffix = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    safe_suffix = safe_filename(suffix).strip(".") or "bin"
    return f"exports/{job.team_id}/{job.id}.{safe_suffix}"


def filtered_export_rows(db: MongoDatabase, task: Task, filters: dict[str, Any]) -> list[tuple[Question, Submission | None]]:
    query: dict[str, Any] = task_question_query(task)
    status = filters.get("status") or "approved"
    questions = db.find(Question, query, sort=[("row_index", 1)])
    labeler_id = filters.get("labeler_id") or filters.get("assigned_to")
    start_date = parse_filter_datetime(filters.get("start_date"), end_of_day=False)
    end_date = parse_filter_datetime(filters.get("end_date"), end_of_day=True)
    rows: list[tuple[Question, Submission | None]] = []
    for question in questions:
        submission = db.find_one(Submission, {"team_id": task.team_id, "task_id": task.id, "question_id": question.id}, sort=[("updated_at", -1)])
        row_status = submission.status if submission else question.status
        if status and status != "all" and row_status != status:
            continue
        if labeler_id and labeler_id not in {question.assigned_to, submission.labeler_id if submission else None}:
            continue
        reference_time = submission.updated_at if submission and submission.updated_at else question.updated_at
        if start_date and reference_time and reference_time < start_date:
            continue
        if end_date and reference_time and reference_time > end_date:
            continue
        rows.append((question, submission))
    return rows


def parse_filter_datetime(value: Any, *, end_of_day: bool) -> datetime | None:
    if not value:
        return None
    if not isinstance(value, str):
        raise AppError(ErrorCode.VALIDATION_FORMAT, "导出日期范围必须使用 ISO 日期字符串")
    normalized = value.strip()
    if not normalized:
        return None
    try:
        if len(normalized) == 10:
            parsed_date = datetime.fromisoformat(normalized).date()
            return datetime.combine(parsed_date, time.max if end_of_day else time.min)
        return datetime.fromisoformat(normalized.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError as exc:
        raise AppError(ErrorCode.VALIDATION_FORMAT, "导出日期范围必须使用 ISO 日期字符串") from exc


def normalize_export_format(value: str | None) -> str:
    normalized = (value or "jsonl").lower()
    if normalized == "xlsx":
        normalized = "excel"
    if normalized not in {"json", "jsonl", "csv", "excel"}:
        raise AppError(ErrorCode.VALIDATION_FORMAT, "导出格式仅支持 json、jsonl、csv、excel")
    return normalized


def render_export_file(
    task: Task,
    export_rows: list[tuple[Question, Submission | None]],
    export_format: str,
    fields_config: dict[str, Any],
    include_review_records: bool,
    review_records_by_submission: dict[str, list[dict[str, Any]]] | None = None,
) -> tuple[str, str, bytes]:
    rows = [
        export_row(question, submission, fields_config, include_review_records, review_records_by_submission or {})
        for question, submission in export_rows
    ]
    filename_base = f"{safe_filename(task.title) or 'task'}-export"
    if export_format == "json":
        return f"{filename_base}.json", "application/json; charset=utf-8", json.dumps(rows, ensure_ascii=False, indent=2).encode("utf-8")
    if export_format == "jsonl":
        return f"{filename_base}.jsonl", "application/x-ndjson; charset=utf-8", "\n".join(json.dumps(row, ensure_ascii=False) for row in rows).encode("utf-8")
    if export_format == "csv":
        return f"{filename_base}.csv", "text/csv; charset=utf-8", rows_csv(rows)
    return f"{filename_base}.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", rows_xlsx(rows)


def export_row(
    question: Question,
    submission: Submission | None,
    fields_config: dict[str, Any],
    include_review_records: bool,
    review_records_by_submission: dict[str, list[dict[str, Any]]] | None = None,
) -> dict[str, Any]:
    base: dict[str, Any] = {
        "question_id": question.id,
        "row_index": question.row_index,
        "status": question.status,
        "assigned_to": question.assigned_to,
        "content": question.content,
    }
    if submission:
        base.update(
            {
                "submission_id": submission.id,
                "labeler_id": submission.labeler_id,
                "answers": submission.answers,
                "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else None,
                "submission_status": submission.status,
                "submission_updated_at": submission.updated_at.isoformat() if submission.updated_at else None,
            }
        )
    if include_review_records:
        base["review_records"] = (review_records_by_submission or {}).get(submission.id if submission else "", [])
    include = fields_config.get("include") or []
    exclude = set(fields_config.get("exclude") or [])
    rename = fields_config.get("rename") or {}
    flattened = flatten_dict(base)
    if include:
        flattened = include_export_fields(flattened, include)
    for key in exclude:
        flattened.pop(key, None)
    return apply_export_rename(flattened, rename)


def apply_export_rename(flattened: dict[str, Any], rename: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(rename, dict):
        raise AppError(ErrorCode.VALIDATION_FORMAT, "fields_config.rename 必须是对象")
    row: dict[str, Any] = {}
    target_sources: dict[str, str] = {}
    for key, value in flattened.items():
        raw_target = rename.get(key, key)
        if not isinstance(raw_target, str) or not raw_target.strip():
            raise AppError(ErrorCode.VALIDATION_FORMAT, "fields_config.rename 的目标字段名必须是非空字符串")
        if raw_target in target_sources and target_sources[raw_target] != key:
            raise AppError(ErrorCode.VALIDATION_FORMAT, f"fields_config.rename 目标字段名重复：{raw_target}")
        target_sources[raw_target] = key
        row[raw_target] = value
    return row


def include_export_fields(flattened: dict[str, Any], include: list[Any]) -> dict[str, Any]:
    selected: dict[str, Any] = {}
    for raw_key in include:
        if not isinstance(raw_key, str):
            continue
        key = raw_key.strip()
        if not key:
            continue
        if key.endswith(".*"):
            prefix = key[:-1]
            for flattened_key, value in flattened.items():
                if flattened_key.startswith(prefix):
                    selected[flattened_key] = value
            continue
        if key in flattened:
            selected[key] = flattened[key]
    return selected


def review_records_for_export(db: MongoDatabase, *, team_id: str, submission_ids: list[str]) -> dict[str, list[dict[str, Any]]]:
    records: dict[str, list[dict[str, Any]]] = {submission_id: [] for submission_id in submission_ids}
    for submission_id in submission_ids:
        logs = db.find(
            AuditLog,
            {"team_id": team_id, "entity_type": "review", "entity_id": submission_id, "action": "submission_reviewed"},
            sort=[("created_at", 1)],
        )
        records[submission_id] = [review_record_payload(log) for log in logs]
    return records


def review_record_payload(log: AuditLog) -> dict[str, Any]:
    changes = log.changes or {}
    return {
        "review_id": log.id,
        "reviewer_id": log.operator_id,
        "decision": changes.get("decision"),
        "comment": changes.get("comment"),
        "round": changes.get("round"),
        "stage": changes.get("stage"),
        "created_at": log.created_at.isoformat() if log.created_at else None,
    }


def flatten_dict(payload: dict[str, Any], prefix: str = "") -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in payload.items():
        next_key = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            result.update(flatten_dict(value, next_key))
        elif isinstance(value, list):
            result[next_key] = json.dumps(value, ensure_ascii=False)
        else:
            result[next_key] = value
    return result


def rows_csv(rows: list[dict[str, Any]]) -> bytes:
    columns = export_columns(rows)
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({column: escape_csv_formula(row.get(column, "")) for column in columns})
    return buffer.getvalue().encode("utf-8-sig")


def rows_xlsx(rows: list[dict[str, Any]]) -> bytes:
    columns = export_columns(rows)
    table_rows = [columns] + [[row.get(column, "") for column in columns] for row in rows]
    sheet_rows = []
    for row_index, row in enumerate(table_rows, start=1):
        cells = []
        for column_index, value in enumerate(row, start=1):
            cell_ref = f"{xlsx_column_name(column_index)}{row_index}"
            safe_value = escape_csv_formula(value)
            text = escape_xml("" if safe_value is None else str(safe_value))
            cells.append(f'<c r="{cell_ref}" t="inlineStr"><is><t>{text}</t></is></c>')
        sheet_rows.append(f'<row r="{row_index}">{"".join(cells)}</row>')
    return minimal_xlsx(sheet_rows)


def export_columns(rows: list[dict[str, Any]]) -> list[str]:
    columns: list[str] = []
    for row in rows:
        for key in row.keys():
            if key not in columns:
                columns.append(key)
    return columns or ["empty"]


def minimal_xlsx(sheet_rows: list[str]) -> bytes:
    worksheet = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{"".join(sheet_rows)}</sheetData></worksheet>'
    workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="export" sheetId="1" r:id="rId1"/></sheets></workbook>'
    rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
    workbook_rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
    content_types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", rels)
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
        archive.writestr("xl/worksheets/sheet1.xml", worksheet)
    return buffer.getvalue()


def escape_xml(value: str) -> str:
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def export_job_payload(job: ExportJob) -> dict:
    return {
        "export_id": job.id,
        "team_id": job.team_id,
        "task_id": job.task_id,
        "created_by": job.created_by,
        "format": job.export_format,
        "filters": job.filters,
        "fields_config": job.fields_config,
        "include_review_records": job.include_review_records,
        "status": job.status,
        "progress": job.progress,
        "filename": job.filename,
        "file_size": job.file_size,
        "download_count": job.download_count,
        "error": job.error,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "updated_at": job.updated_at.isoformat() if job.updated_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    }
