import os
from datetime import timedelta

os.environ.setdefault("SECRET_KEY", "test-secret-key-with-strong-length")
os.environ.setdefault("MONGODB_URL", "mongomock://localhost")
os.environ.setdefault("MONGODB_DATABASE", "markup_test")

from fastapi.testclient import TestClient

from app.core.database import get_database, reset_database
from app.core.security import generate_object_id, now_utc
from app.models.auth import RefreshSession
from app.models.team import Team, TeamMember
from app.models.upload import UploadedFile
from app.models.user import User
from app.main import app
from app.services import auth_service

client = TestClient(app)


def access_token(user: User) -> str:
    db = get_database()
    session = RefreshSession(
        user_id=user.id,
        jti_hash=f"platform-profile-permission-{generate_object_id()}",
        expire_at=now_utc().replace(tzinfo=None) + timedelta(days=30),
    )
    db.add(session)
    db.commit()
    return auth_service.create_access_token(user.id, {"role": user.global_role, "sid": session.id})


def setup_function() -> None:
    reset_database()


def test_team_scoped_custom_permissions_do_not_grant_platform_profile_actions() -> None:
    db = get_database()
    team = Team(company_name="Scoped Platform Permission Team", owner_user_id="owner-1")
    operator = User(username="teamoperator", email="team-operator@example.com", global_role="user", email_verified=True)
    target = User(username="targetlabeler", email="target-labeler@example.com", global_role="labeler", email_verified=True)
    db.add(team)
    db.add(operator)
    db.add(target)
    db.add(
        TeamMember(
            team_id=team.id,
            user_id=operator.id,
            team_role="labeler",
            permissions=["platform:manage", "certification:review"],
        )
    )
    material = UploadedFile(
        team_id=f"profile:{target.id}",
        owner_id=target.id,
        filename="private.pdf",
        content_type="application/pdf",
        category="verification",
        size=6,
        storage="filesystem",
        path=f"profile-materials/{target.id}/private.pdf",
    )
    db.add(material)
    db.commit()

    headers = {"Authorization": f"Bearer {access_token(operator)}", "X-Team-ID": team.id}
    points = client.post(
        "/api/v1/profile/points",
        headers=headers,
        json={"user_id": target.id, "change": 10, "reason": "manual adjustment"},
    )
    assert points.status_code == 403

    review_queue = client.get("/api/v1/profile/certifications/review-queue", headers=headers)
    assert review_queue.status_code == 403

    material_download = client.get(f"/api/v1/profile/certifications/materials/{material.id}/download", headers=headers)
    assert material_download.status_code == 403
