import os
import csv
import io
from datetime import timedelta

os.environ.setdefault("SECRET_KEY", "test-secret-key-with-strong-length")
os.environ.setdefault("MONGODB_URL", "mongomock://localhost")
os.environ.setdefault("MONGODB_DATABASE", "markup_test")

from fastapi.testclient import TestClient

from app.core.database import get_database, reset_database
from app.core.security import generate_object_id, now_utc
from app.models.audit import AuditLog
from app.models.auth import RefreshSession
from app.models.team import Team, TeamMember
from app.models.user import User
from app.main import app
from app.services import auth_service

client = TestClient(app)
no_raise_client = TestClient(app, raise_server_exceptions=False)


def access_token(user: User) -> str:
    db = get_database()
    session = RefreshSession(
        user_id=user.id,
        jti_hash=f"audit-log-scope-{generate_object_id()}",
        expire_at=now_utc().replace(tzinfo=None) + timedelta(days=30),
    )
    db.add(session)
    db.commit()
    return auth_service.create_access_token(user.id, {"role": user.global_role, "sid": session.id})


def setup_function() -> None:
    reset_database()


def test_team_audit_detail_does_not_expose_global_logs() -> None:
    db = get_database()
    team = Team(company_name="Audit Scope Team", owner_user_id="owner-1")
    admin = User(username="auditscopeadmin", email="audit-scope-admin@example.com", global_role="user", email_verified=True)
    global_log = AuditLog(
        team_id=None,
        entity_type="user",
        entity_id="sensitive-user",
        action="password_reset",
        operator_id="sensitive-user",
        changes={"email": "sensitive@example.com"},
    )
    db.add(team)
    db.add(admin)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin"))
    db.add(global_log)
    db.commit()

    response = client.get(
        f"/api/v1/audit-logs/{global_log.id}",
        headers={"Authorization": f"Bearer {access_token(admin)}", "X-Team-ID": team.id},
    )

    assert response.status_code == 404


def test_audit_list_rejects_invalid_date_filters() -> None:
    db = get_database()
    team = Team(company_name="Audit Date Filter Team", owner_user_id="owner-1")
    admin = User(username="auditdateadmin", email="audit-date-admin@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(admin)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin"))
    db.commit()

    response = no_raise_client.get(
        "/api/v1/audit-logs?start_date=not-a-date",
        headers={"Authorization": f"Bearer {access_token(admin)}", "X-Team-ID": team.id},
    )

    assert response.status_code == 400
    assert response.json()["code"] == 40002


def test_audit_csv_export_escapes_formula_like_user_agent() -> None:
    db = get_database()
    team = Team(company_name="Audit CSV Formula Guard Team", owner_user_id="owner-1")
    admin = User(username="auditcsvadmin", email="audit-csv-admin@example.com", global_role="user", email_verified=True)
    audit_log = AuditLog(
        team_id=team.id,
        entity_type="task",
        entity_id="task-1",
        action="task_updated",
        operator_id=admin.id,
        user_agent='=HYPERLINK("https://example.invalid","open")',
    )
    db.add(team)
    db.add(admin)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin"))
    db.add(audit_log)
    db.commit()

    response = client.get(
        f"/api/v1/audit-logs/export?team_id={team.id}&export_format=csv",
        headers={"Authorization": f"Bearer {access_token(admin)}", "X-Team-ID": team.id},
    )

    assert response.status_code == 200
    rows = list(csv.reader(io.StringIO(response.content.decode("utf-8-sig"))))
    assert rows[1][10].startswith("'=")


def test_reviewer_cannot_list_organization_audit_logs() -> None:
    db = get_database()
    team = Team(company_name="Audit Reviewer List Team", owner_user_id="owner-1")
    reviewer = User(username="auditlistreviewer", email="audit-list-reviewer@example.com", global_role="reviewer", email_verified=True)
    audit_log = AuditLog(
        team_id=team.id,
        entity_type="task",
        entity_id="task-1",
        action="task_published",
        operator_id="owner-1",
    )
    db.add(team)
    db.add(reviewer)
    db.add(TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer"))
    db.add(audit_log)
    db.commit()

    response = client.get(
        f"/api/v1/audit-logs?team_id={team.id}",
        headers={"Authorization": f"Bearer {access_token(reviewer)}", "X-Team-ID": team.id},
    )

    assert response.status_code == 403


def test_reviewer_cannot_open_organization_audit_log_detail() -> None:
    db = get_database()
    team = Team(company_name="Audit Reviewer Detail Team", owner_user_id="owner-1")
    reviewer = User(username="auditdetailreviewer", email="audit-detail-reviewer@example.com", global_role="reviewer", email_verified=True)
    audit_log = AuditLog(
        team_id=team.id,
        entity_type="task",
        entity_id="task-2",
        action="task_deleted",
        operator_id="owner-1",
    )
    db.add(team)
    db.add(reviewer)
    db.add(TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer"))
    db.add(audit_log)
    db.commit()

    response = client.get(
        f"/api/v1/audit-logs/{audit_log.id}",
        headers={"Authorization": f"Bearer {access_token(reviewer)}", "X-Team-ID": team.id},
    )

    assert response.status_code == 403
