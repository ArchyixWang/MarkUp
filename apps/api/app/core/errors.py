from enum import IntEnum


class ErrorCode(IntEnum):
    SUCCESS = 0
    VALIDATION_REQUIRED = 40001
    VALIDATION_FORMAT = 40002
    VALIDATION_RANGE = 40003
    AUTH_REQUIRED = 40101
    TOKEN_EXPIRED = 40102
    INVALID_CREDENTIALS = 40103
    PERMISSION_DENIED = 40301
    ROLE_FORBIDDEN = 40302
    NOT_FOUND = 40401
    RESOURCE_DELETED = 40402
    RESOURCE_EXISTS = 40901
    STATE_CONFLICT = 40902
    BUSINESS_RULE = 42201
    QUOTA_FULL = 42202
    CLAIM_LIMIT = 42203
    SERVER_ERROR = 50001
    THIRD_PARTY_ERROR = 50002


class AppError(Exception):
    def __init__(self, code: ErrorCode, message: str, detail: object | None = None) -> None:
        self.code = code
        self.message = message
        self.detail = detail
        super().__init__(message)
