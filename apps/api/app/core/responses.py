from datetime import UTC, datetime
from typing import Any

from fastapi import Request


def utc_now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def success_response(data: Any = None, message: str = "success", request: Request | None = None) -> dict[str, Any]:
    return {
        "code": 0,
        "message": message,
        "data": data,
        "request_id": getattr(request.state, "request_id", None) if request else None,
        "timestamp": utc_now_iso(),
    }


def error_response(
    code: int,
    message: str,
    detail: Any = None,
    request: Request | None = None,
) -> dict[str, Any]:
    return {
        "code": code,
        "message": message,
        "detail": detail,
        "request_id": getattr(request.state, "request_id", None) if request else None,
        "timestamp": utc_now_iso(),
    }
