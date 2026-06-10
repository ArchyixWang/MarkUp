import os
from pathlib import Path

os.environ.setdefault("MONGODB_URL", "mongomock://localhost")

from app.core.config import settings
from app.services.file_storage import storage_base_dir, storage_root


def test_relative_storage_root_is_resolved_from_project_root(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "file_storage_root", ".storage-test")
    monkeypatch.chdir(tmp_path)

    root = storage_root()

    assert root == storage_base_dir() / ".storage-test"
    assert root != tmp_path / ".storage-test"
