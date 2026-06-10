from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from jose import ExpiredSignatureError, JWTError

from app.core.errors import AppError, ErrorCode
from app.core.responses import error_response


HTTP_STATUS_BY_CODE = {
    ErrorCode.VALIDATION_REQUIRED: 400,
    ErrorCode.VALIDATION_FORMAT: 400,
    ErrorCode.VALIDATION_RANGE: 400,
    ErrorCode.AUTH_REQUIRED: 401,
    ErrorCode.TOKEN_EXPIRED: 401,
    ErrorCode.INVALID_CREDENTIALS: 401,
    ErrorCode.PERMISSION_DENIED: 403,
    ErrorCode.ROLE_FORBIDDEN: 403,
    ErrorCode.NOT_FOUND: 404,
    ErrorCode.RESOURCE_DELETED: 404,
    ErrorCode.RESOURCE_EXISTS: 409,
    ErrorCode.STATE_CONFLICT: 409,
    ErrorCode.BUSINESS_RULE: 422,
    ErrorCode.QUOTA_FULL: 422,
    ErrorCode.CLAIM_LIMIT: 422,
    ErrorCode.THIRD_PARTY_ERROR: 502,
}


def clean_validation_message(message: str) -> str:
    if message.startswith("Value error, "):
        return message.removeprefix("Value error, ")
    return message


def validation_error_message(detail: list[dict[str, str]]) -> str:
    messages = [item["message"] for item in detail if item.get("message")]
    if not messages:
        return "参数校验失败"
    return f"参数校验失败：{'；'.join(messages)}"


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        status_code = HTTP_STATUS_BY_CODE.get(exc.code, 500)
        return JSONResponse(
            status_code=status_code,
            content=error_response(exc.code, exc.message, exc.detail, request),
            media_type="application/json; charset=utf-8",
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        detail = [
            {"field": ".".join(str(part) for part in err["loc"]), "message": clean_validation_message(err["msg"])}
            for err in exc.errors()
        ]
        return JSONResponse(
            status_code=400,
            content=error_response(ErrorCode.VALIDATION_REQUIRED, validation_error_message(detail), detail, request),
            media_type="application/json; charset=utf-8",
        )

    @app.exception_handler(ExpiredSignatureError)
    async def handle_expired_token(request: Request, exc: ExpiredSignatureError) -> JSONResponse:
        return JSONResponse(
            status_code=401,
            content=error_response(ErrorCode.TOKEN_EXPIRED, "Token已过期", None, request),
            media_type="application/json; charset=utf-8",
        )

    @app.exception_handler(JWTError)
    async def handle_invalid_token(request: Request, exc: JWTError) -> JSONResponse:
        return JSONResponse(
            status_code=401,
            content=error_response(ErrorCode.AUTH_REQUIRED, "请先登录", None, request),
            media_type="application/json; charset=utf-8",
        )
