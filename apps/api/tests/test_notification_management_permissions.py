import os
from datetime import datetime

os.environ.setdefault("SECRET_KEY", "test-secret-key-with-strong-length")
os.environ.setdefault("MONGODB_URL", "mongomock://localhost")
os.environ.setdefault("MONGODB_DATABASE", "markup_test")

from fastapi.testclient import TestClient

from app.core.database import get_database, reset_database
from app.core.security import generate_object_id
from app.models.auth import RefreshSession
from app.models.notification import Notification
from app.models.team import Team, TeamMember
from app.models.user import User
from app.main import app
from app.services import auth_service

client = TestClient(app)


def access_token(user: User) -> str:
    db = get_database()
    session = RefreshSession(
        user_id=user.id,
        jti_hash=f"notification-management-{generate_object_id()}",
        expire_at=datetime(2030, 1, 1),
    )
    db.add(session)
    db.commit()
    return auth_service.create_access_token(user.id, {"role": user.global_role, "sid": session.id})


def setup_function() -> None:
    reset_database()


def test_labeler_cannot_open_team_notification_management_list() -> None:
    db = get_database()
    team = Team(company_name="Notification Scope Team", owner_user_id="owner-1")
    owner = User(username="notifyowner", email="notify-owner@example.com", global_role="user", email_verified=True)
    labeler = User(username="notifylabeler", email="notify-labeler@example.com", global_role="labeler", email_verified=True)
    db.add(team)
    db.add(owner)
    db.add(labeler)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    db.add(TeamMember(team_id=team.id, user_id=labeler.id, team_role="labeler"))
    db.add(
        Notification(
            team_id=team.id,
            title="Owner only notice",
            content="Hidden from labelers",
            notification_type="team",
            target_type="member",
            target_user_ids=[owner.id],
            sender_id=owner.id,
            sender_name=owner.username,
        )
    )
    db.commit()

    response = client.get(
        f"/api/v1/notifications?team_id={team.id}",
        headers={"Authorization": f"Bearer {access_token(labeler)}", "X-Team-ID": team.id},
    )

    assert response.status_code == 403


def test_reviewer_cannot_preview_team_notification_recipients() -> None:
    db = get_database()
    team = Team(company_name="Notification Preview Boundary Team", owner_user_id="owner-preview")
    reviewer = User(username="previewreviewer", email="preview-reviewer@example.com", global_role="reviewer", email_verified=True)
    owner = User(username="previewowner", email="preview-owner@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(reviewer)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer"))
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    db.commit()

    response = client.get(
        f"/api/v1/notifications/preview?team_id={team.id}&target_type=team",
        headers={"Authorization": f"Bearer {access_token(reviewer)}", "X-Team-ID": team.id},
    )

    assert response.status_code == 403


def test_personal_notification_state_requires_active_team_membership() -> None:
    db = get_database()
    team = Team(company_name="Notification Removed Member Team", owner_user_id="owner-2")
    removed_user = User(username="removednotify", email="removed-notify@example.com", global_role="labeler", email_verified=True)
    notification = Notification(
        team_id=team.id,
        title="Former member notice",
        content="No longer visible after team removal",
        notification_type="team",
        target_type="member",
        target_user_ids=[removed_user.id],
        sender_id="owner-2",
        sender_name="owner",
    )
    db.add(team)
    db.add(removed_user)
    db.add(notification)
    db.commit()

    response = client.post(
        f"/api/v1/notifications/my/{notification.id}/state",
        headers={"Authorization": f"Bearer {access_token(removed_user)}"},
        json={"status": "read"},
    )

    assert response.status_code == 404
    assert removed_user.id not in db.get(Notification, notification.id).read_by


def test_task_notification_requires_related_entity_id() -> None:
    db = get_database()
    team = Team(company_name="Task Notification Target Team", owner_user_id="owner-3")
    owner = User(username="tasknotifyowner", email="task-notify-owner@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    db.commit()

    response = client.post(
        f"/api/v1/notifications?team_id={team.id}",
        headers={"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id},
        json={
            "title": "Task reminder",
            "content": "Missing task id must not broadcast to the whole team.",
            "target_type": "task",
        },
    )

    assert response.status_code == 422
    assert response.json()["code"] == 42201
    assert db.collection("notifications").count_documents({"team_id": team.id}) == 0
