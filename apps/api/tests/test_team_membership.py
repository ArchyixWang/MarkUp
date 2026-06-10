import json
import os
from datetime import datetime, timedelta

os.environ.setdefault("SECRET_KEY", "test-secret-key-with-strong-length")
os.environ.setdefault("MONGODB_URL", "mongomock://localhost")
os.environ.setdefault("MONGODB_DATABASE", "markup_test")

from fastapi.testclient import TestClient

from app.core.database import get_database, reset_database
from app.core.security import generate_object_id, hash_password, now_utc
from app.models.auth import RefreshSession
from app.models.audit import AuditLog
from app.models.production import AnnotationTemplate, Dataset, Question, Task, TemplateVersion
from app.models.resource import TeamPointsBudget, TeamPointsWalletLedger
from app.models.team import Team, TeamMember
from app.models.upload import UploadedFile
from app.models.user import User
from app.main import app
from app.services import auth_service


client = TestClient(app)


def setup_module() -> None:
    reset_database()


def create_session_bound_access_token(user_id: str, *, role: str = "user") -> str:
    db = get_database()
    session = RefreshSession(
        user_id=user_id,
        jti_hash=f"test-session-{generate_object_id()}",
        expire_at=datetime(2030, 1, 1),
    )
    db.add(session)
    db.commit()
    return auth_service.create_access_token(user_id, {"role": role, "sid": session.id})


def create_team_admin(slug: str) -> tuple[Team, User, dict[str, str]]:
    db = get_database()
    team = Team(company_name=f"{slug} Team", owner_user_id=f"{slug}-owner")
    admin = User(username=f"{slug}admin", email=f"{slug}@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(admin)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin"))
    db.commit()
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(admin.id, role=admin.global_role)}", "X-Team-ID": team.id}
    return team, admin, headers


def test_legacy_team_membership_defaults_to_free() -> None:
    team, _admin, headers = create_team_admin("legacyfree")

    response = client.get(f"/api/v1/teams/{team.id}/membership", headers=headers)

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["current_plan"] == "free"
    assert data["effective_plan"] == "free"
    assert data["limits"]["members"] == 3
    assert data["limits"]["active_tasks"] == 3
    assert data["limits"]["storage_bytes"] == 3 * 1024**3
    assert any(item["plan"] == "more" and item["contact_only"] is True for item in data["plans"])


def test_system_agent_does_not_count_toward_member_limit() -> None:
    db = get_database()
    team, _admin, headers = create_team_admin("agentfree")
    db.add(TeamMember(team_id=team.id, user_id="agentfree-system-agent", team_role="agent", is_system_member=True))
    owner = User(username="agentfreeowner", email="agentfreeowner@example.com", global_role="user", email_verified=True)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    db.commit()

    membership = client.get(f"/api/v1/teams/{team.id}/membership", headers=headers)
    assert membership.status_code == 200
    assert membership.json()["data"]["usage"]["members"] == 2

    response = client.post(
        f"/api/v1/teams/{team.id}/members/accounts",
        headers=headers,
        json={
            "username": "agentfreehuman",
            "display_name": "Third Human",
            "email": "agentfreehuman@example.com",
            "password": "SecurePass123!",
            "team_role": "owner",
        },
    )

    assert response.status_code == 200
    updated = client.get(f"/api/v1/teams/{team.id}/membership", headers=headers)
    assert updated.json()["data"]["usage"]["members"] == 3


def test_membership_subscribe_deducts_wallet_and_writes_ledger_and_audit() -> None:
    db = get_database()
    team, admin, headers = create_team_admin("subbasic")
    db.add(
        TeamPointsBudget(
            team_id=team.id,
            total_points=1200,
            current_balance=1200,
            payment_password_hash=hash_password("123456"),
        )
    )
    db.commit()

    response = client.post(
        f"/api/v1/teams/{team.id}/membership/subscribe",
        headers=headers,
        json={"target_plan": "basic", "payment_password": "123456"},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["current_plan"] == "basic"
    assert data["effective_plan"] == "basic"
    assert data["expires_at"] is not None

    budget = db.find_one(TeamPointsBudget, {"team_id": team.id})
    assert budget is not None
    assert budget.current_balance == 201
    assert budget.spent_points_total == 999

    ledger = db.find_one(TeamPointsWalletLedger, {"team_id": team.id, "transaction_type": "membership_fee"})
    assert ledger is not None
    assert ledger.amount == 999
    assert ledger.direction == "out"
    assert ledger.operator_id == admin.id

    audit = db.find_one(AuditLog, {"team_id": team.id, "entity_type": "membership", "action": "membership_subscribed"})
    assert audit is not None
    assert audit.changes["to_plan"] == "basic"


def test_membership_subscribe_rejects_wrong_password_insufficient_balance_and_team_scope_mismatch() -> None:
    db = get_database()
    team, _admin, headers = create_team_admin("subfail")
    other_team = Team(company_name="Other Team", owner_user_id="other")
    db.add(other_team)
    db.add(
        TeamPointsBudget(
            team_id=team.id,
            total_points=998,
            current_balance=998,
            payment_password_hash=hash_password("123456"),
        )
    )
    db.commit()

    wrong_password = client.post(
        f"/api/v1/teams/{team.id}/membership/subscribe",
        headers=headers,
        json={"target_plan": "basic", "payment_password": "000000"},
    )
    assert wrong_password.status_code == 422
    assert wrong_password.json()["detail"]["field"] == "payment_password"

    insufficient = client.post(
        f"/api/v1/teams/{team.id}/membership/subscribe",
        headers=headers,
        json={"target_plan": "basic", "payment_password": "123456"},
    )
    assert insufficient.status_code == 422
    assert insufficient.json()["detail"]["required_points"] == 999

    mismatch_headers = {**headers, "X-Team-ID": other_team.id}
    mismatch = client.post(
        f"/api/v1/teams/{team.id}/membership/subscribe",
        headers=mismatch_headers,
        json={"target_plan": "basic", "payment_password": "123456"},
    )
    assert mismatch.status_code == 403


def test_free_membership_blocks_fourth_human_member() -> None:
    db = get_database()
    team, _admin, headers = create_team_admin("membercap")
    for index in range(2):
        user = User(username=f"membercap{index}", email=f"membercap{index}@example.com", global_role="user", email_verified=True)
        db.add(user)
        db.add(TeamMember(team_id=team.id, user_id=user.id, team_role="owner"))
    db.commit()

    response = client.post(
        f"/api/v1/teams/{team.id}/members/accounts",
        headers=headers,
        json={
            "username": "membercapnew",
            "display_name": "New Member",
            "email": "membercapnew@example.com",
            "password": "SecurePass123!",
            "team_role": "owner",
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"]["key"] == "members"
    assert response.json()["detail"]["limit"] == 3


def test_membership_storage_usage_counts_uploaded_files_and_previews() -> None:
    db = get_database()
    team, _admin, headers = create_team_admin("storageusage")
    rows = [{"text": "dataset row"}]
    dataset_storage = len(json.dumps(rows, ensure_ascii=False).encode("utf-8"))
    db.add(
        Dataset(
            team_id=team.id,
            owner_id="storage-owner",
            name="Storage Usage Dataset",
            source_format="json",
            columns=[{"name": "text", "data_type": "text"}],
            rows=rows,
            preview_rows=rows,
            row_count=1,
            storage_bytes=dataset_storage,
        )
    )
    db.add(
        UploadedFile(
            team_id=team.id,
            owner_id="storage-owner",
            filename="clip.avi",
            content_type="video/avi",
            category="media",
            size=2048,
            preview_size=512,
        )
    )
    db.add(
        UploadedFile(
            team_id=f"agent:{team.id}",
            owner_id="storage-owner",
            filename="agent.png",
            content_type="image/png",
            category="image",
            size=128,
        )
    )
    db.commit()

    response = client.get(f"/api/v1/teams/{team.id}/membership", headers=headers)

    assert response.status_code == 200
    assert response.json()["data"]["usage"]["storage_bytes"] == dataset_storage + 2048 + 512 + 128


def test_free_membership_blocks_active_task_publish_over_limit() -> None:
    db = get_database()
    team, admin, headers = create_team_admin("taskcap")
    schema = {
        "schema_version": "1.0",
        "tabs": [
            {
                "id": "main",
                "title": "默认",
                "components": [{"id": "show_text", "type": "ShowItem", "field": "show_text", "label": "文本"}],
            }
        ],
        "components": [],
    }
    template = AnnotationTemplate(team_id=team.id, owner_id=admin.id, name="Task Cap Template", schema=schema, status="published")
    dataset = Dataset(
        team_id=team.id,
        owner_id=admin.id,
        name="Task Cap Dataset",
        source_format="json",
        columns=[{"name": "text", "data_type": "text"}],
        rows=[{"text": "A"}],
        preview_rows=[{"text": "A"}],
        row_count=1,
        status="ready",
    )
    db.add(template)
    db.add(TemplateVersion(template_id=template.id, team_id=team.id, version=1, schema=schema, is_published=True))
    db.add(dataset)
    for index in range(3):
        db.add(Task(team_id=team.id, owner_id=admin.id, title=f"Active {index}", status="published"))
    draft = Task(
        team_id=team.id,
        owner_id=admin.id,
        title="Draft over active task cap",
        description="A ready task that should only be blocked by membership active task capacity.",
        status="draft",
        template_id=template.id,
        template_version_id=f"{template.id}:v1",
        dataset_id=dataset.id,
        column_mapping={"show_text": "text"},
    )
    db.add(draft)
    db.add(Question(team_id=team.id, task_id=draft.id, dataset_id=dataset.id, row_index=0, content={"text": "A"}))
    db.commit()

    response = client.post(f"/api/v1/tasks/{draft.id}/publish", headers=headers)

    assert response.status_code == 422
    assert response.json()["detail"]["key"] == "active_tasks"
    assert response.json()["detail"]["limit"] == 3
    assert db.get(Task, draft.id).status == "draft"


def test_free_membership_blocks_dataset_import_over_storage_limit() -> None:
    db = get_database()
    team, _admin, headers = create_team_admin("storagecap")
    db.add(
        Dataset(
            team_id=team.id,
            owner_id="storage-owner",
            name="Existing huge dataset",
            source_format="json",
            columns=[],
            rows=[],
            preview_rows=[],
            row_count=0,
            storage_bytes=3 * 1024**3,
        )
    )
    db.commit()

    response = client.post(
        "/api/v1/datasets",
        headers=headers,
        data={"name": "Tiny over cap"},
        files={"file": ("tiny.json", b'[{"text":"x"}]', "application/json")},
    )

    assert response.status_code == 422
    assert response.json()["detail"]["key"] == "storage_bytes"
    assert response.json()["detail"]["limit"] == 3 * 1024**3


def test_expired_membership_uses_free_limits_and_scheduled_free_downgrade_keeps_existing_resources() -> None:
    db = get_database()
    team, _admin, headers = create_team_admin("expirecap")
    team.membership_plan = "basic"
    team.membership_status = "active"
    team.membership_expires_at = (now_utc() - timedelta(days=1)).replace(tzinfo=None)
    db.save(team)
    for index in range(5):
        db.add(Task(team_id=team.id, owner_id="owner", title=f"Existing {index}", status="published"))
    db.commit()

    response = client.get(f"/api/v1/teams/{team.id}/membership", headers=headers)

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["effective_plan"] == "free"
    assert data["usage"]["active_tasks"] == 5
    assert data["over_limit_items"][0]["key"] == "active_tasks"
    assert db.collection("tasks").count_documents({"team_id": team.id}) == 5

    active_team = Team(company_name="Scheduled Downgrade Team", owner_user_id="scheduled-owner")
    scheduled_admin = User(username="scheduledadmin", email="scheduled@example.com", global_role="user", email_verified=True)
    db.add(active_team)
    db.add(scheduled_admin)
    db.add(TeamMember(team_id=active_team.id, user_id=scheduled_admin.id, team_role="team_admin"))
    active_team.membership_plan = "basic"
    active_team.membership_status = "active"
    active_team.membership_expires_at = (now_utc() + timedelta(days=30)).replace(tzinfo=None)
    db.save(active_team)
    db.commit()
    scheduled_headers = {
        "Authorization": f"Bearer {create_session_bound_access_token(scheduled_admin.id, role=scheduled_admin.global_role)}",
        "X-Team-ID": active_team.id,
    }

    scheduled = client.post(
        f"/api/v1/teams/{active_team.id}/membership/subscribe",
        headers=scheduled_headers,
        json={"target_plan": "free"},
    )
    assert scheduled.status_code == 200
    assert scheduled.json()["data"]["next_plan"] == "free"

    cancelled = client.post(f"/api/v1/teams/{active_team.id}/membership/cancel-scheduled-change", headers=scheduled_headers)
    assert cancelled.status_code == 200
    assert cancelled.json()["data"]["next_plan"] is None
