from __future__ import annotations

from pathlib import Path

from app.core.config import settings
from app.core.errors import AppError, ErrorCode


def storage_base_dir() -> Path:
    api_root = Path(__file__).resolve().parents[2]
    if api_root.name == "api" and api_root.parent.name == "apps":
        return api_root.parent.parent
    return api_root


def storage_root() -> Path:
    configured = Path(settings.file_storage_root)
    root = configured if configured.is_absolute() else storage_base_dir() / configured
    root.mkdir(parents=True, exist_ok=True)
    return root


def write_storage_file(relative_path: str, content: bytes) -> str:
    path = resolve_storage_path(relative_path, must_exist=False)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return storage_relative_path(path)


def read_storage_file(relative_path: str) -> bytes:
    path = resolve_storage_path(relative_path, must_exist=True)
    return path.read_bytes()


def delete_storage_file(relative_path: str) -> bool:
    path = resolve_storage_path(relative_path, must_exist=False)
    if not path.is_file():
        return False
    path.unlink()
    return True


def storage_relative_path(path: Path) -> str:
    root = storage_root().resolve()
    resolved = path.resolve()
    try:
        return resolved.relative_to(root).as_posix()
    except ValueError as exc:
        raise AppError(ErrorCode.VALIDATION_FORMAT, "非法文件路径") from exc


def resolve_storage_path(relative_path: str, *, must_exist: bool) -> Path:
    value = str(relative_path or "").strip().lstrip("/\\")
    if not value:
        raise AppError(ErrorCode.NOT_FOUND, "文件不存在")
    root = storage_root().resolve()
    path = (root / value).resolve()
    try:
        path.relative_to(root)
    except ValueError as exc:
        raise AppError(ErrorCode.VALIDATION_FORMAT, "非法文件路径") from exc
    if must_exist and not path.is_file():
        raise AppError(ErrorCode.NOT_FOUND, "文件不存在")
    return path
