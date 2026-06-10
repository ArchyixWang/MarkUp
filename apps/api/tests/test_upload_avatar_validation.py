import os
from datetime import timedelta

os.environ.setdefault("SECRET_KEY", "test-secret-key-with-strong-length")
os.environ.setdefault("MONGODB_URL", "mongomock://localhost")
os.environ.setdefault("MONGODB_DATABASE", "markup_test")

from fastapi.testclient import TestClient

from app.core.database import get_database, reset_database
from app.core.security import generate_object_id, now_utc
from app.main import app
from app.models.auth import RefreshSession
from app.models.user import User
from app.services import auth_service

client = TestClient(app)


def setup_function() -> None:
    reset_database()


def access_token(user: User) -> str:
    db = get_database()
    session = RefreshSession(
        user_id=user.id,
        jti_hash=f"avatar-upload-{generate_object_id()}",
        expire_at=now_utc().replace(tzinfo=None) + timedelta(days=30),
    )
    db.add(session)
    db.commit()
    return auth_service.create_access_token(user.id, {"role": user.global_role, "sid": session.id})


def test_profile_avatar_upload_rejects_spoofed_image_content_type() -> None:
    db = get_database()
    user = User(username="avatarspoof", email="avatar-spoof@example.com", global_role="labeler", email_verified=True)
    db.add(user)
    db.commit()

    response = client.post(
        "/api/v1/uploads",
        headers={"Authorization": f"Bearer {access_token(user)}"},
        data={"category": "image"},
        files={"file": ("avatar.pdf", b"%PDF-1.4", "image/png")},
    )

    assert response.status_code == 400
    assert response.json()["code"] == 40003
    assert db.collection("uploaded_files").count_documents({"owner_id": user.id}) == 0


def test_profile_material_upload_rejects_spoofed_pdf_content_type() -> None:
    db = get_database()
    user = User(username="materialspoof", email="material-spoof@example.com", global_role="labeler", email_verified=True)
    db.add(user)
    db.commit()

    response = client.post(
        "/api/v1/profile/certifications/materials",
        headers={"Authorization": f"Bearer {access_token(user)}"},
        data={"category": "verification"},
        files={"file": ("degree.exe", b"MZ fake executable", "application/pdf")},
    )

    assert response.status_code == 400
    assert response.json()["code"] == 40003
    assert db.collection("uploaded_files").count_documents({"owner_id": user.id}) == 0
