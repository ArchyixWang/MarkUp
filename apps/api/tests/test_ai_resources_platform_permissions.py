import os
from datetime import datetime

os.environ.setdefault("SECRET_KEY", "test-secret-key-with-strong-length")
os.environ.setdefault("MONGODB_URL", "mongomock://localhost")
os.environ.setdefault("MONGODB_DATABASE", "markup_test")

from fastapi.testclient import TestClient

from app.core.database import get_database, reset_database
from app.core.security import generate_object_id
from app.models.auth import RefreshSession
from app.models.resource import AiProviderConfig
from app.models.team import Team, TeamMember
from app.models.user import User
from app.main import app
from app.services import auth_service
from app.services import resource_service

client = TestClient(app)


def access_token(user: User) -> str:
    db = get_database()
    session = RefreshSession(
        user_id=user.id,
        jti_hash=f"ai-resource-platform-permission-{generate_object_id()}",
        expire_at=datetime(2027, 6, 1),
    )
    db.add(session)
    db.commit()
    return auth_service.create_access_token(user.id, {"role": user.global_role, "sid": session.id})


def setup_function() -> None:
    reset_database()


def test_team_scoped_custom_permissions_cannot_manage_platform_provider() -> None:
    db = get_database()
    team = Team(company_name="Scoped AI Platform Team", owner_user_id="owner-1")
    operator = User(username="aiteamoperator", email="ai-team-operator@example.com", global_role="user", email_verified=True)
    provider = AiProviderConfig(
        scope="platform",
        team_id=None,
        route_name="Platform Shared",
        provider_kind="OpenAI",
        provider="OpenAI",
        model_id="gpt-4.1-mini",
        default_model="gpt-4.1-mini",
        models=["gpt-4.1-mini"],
        api_base="https://api.example.com/v1",
        api_key_configured=True,
        status="enabled",
    )
    db.add(team)
    db.add(operator)
    db.add(provider)
    db.add(
        TeamMember(
            team_id=team.id,
            user_id=operator.id,
            team_role="labeler",
            permissions=["ai_provider:manage", "platform:manage"],
        )
    )
    db.commit()

    headers = {"Authorization": f"Bearer {access_token(operator)}", "X-Team-ID": team.id}
    configs = client.get(f"/api/v1/ai-resources/configs?team_id={team.id}", headers=headers)
    assert configs.status_code == 200
    platform_item = next(item for item in configs.json()["data"]["items"] if item["provider_id"] == provider.id)
    assert platform_item["team_can_manage"] is False

    response = client.patch(
        f"/api/v1/ai-resources/configs/{provider.id}",
        headers=headers,
        json={"route_name": "Hijacked Platform Provider"},
    )
    assert response.status_code == 403
    assert db.get(AiProviderConfig, provider.id).route_name == "Platform Shared"


def test_team_user_cannot_estimate_another_team_provider() -> None:
    db = get_database()
    own_team = Team(company_name="Own Estimate Team", owner_user_id="owner-1")
    other_team = Team(company_name="Other Estimate Team", owner_user_id="owner-2")
    operator = User(username="estimateoperator", email="estimate-operator@example.com", global_role="user", email_verified=True)
    provider = AiProviderConfig(
        scope="team",
        team_id=other_team.id,
        route_name="Other Team Cost Route",
        provider_kind="OpenAI",
        provider="OpenAI",
        model_id="gpt-4.1-mini",
        default_model="gpt-4.1-mini",
        models=["gpt-4.1-mini"],
        pricing={
            "input_price_per_million": 10,
            "output_price_per_million": 20,
            "cache_hit_price_per_million": 1,
        },
        status="enabled",
    )
    db.add(own_team)
    db.add(other_team)
    db.add(operator)
    db.add(provider)
    db.add(TeamMember(team_id=own_team.id, user_id=operator.id, team_role="labeler"))
    db.commit()

    response = client.post(
        "/api/v1/ai-resources/estimate",
        headers={"Authorization": f"Bearer {access_token(operator)}", "X-Team-ID": own_team.id},
        json={"provider_id": provider.id, "prompt_chars": 4000, "completion_chars": 2000},
    )

    assert response.status_code == 403


def test_team_scoped_platform_manage_cannot_access_platform_workbench() -> None:
    db = get_database()
    team = Team(company_name="Scoped Platform Workbench Team", owner_user_id="owner-1")
    operator = User(username="scopedplatformmanage", email="scoped-platform-manage@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(operator)
    db.add(
        TeamMember(
            team_id=team.id,
            user_id=operator.id,
            team_role="labeler",
            permissions=["platform:manage"],
        )
    )
    db.commit()

    response = client.get(
        "/api/v1/platform/workbench",
        headers={"Authorization": f"Bearer {access_token(operator)}", "X-Team-ID": team.id},
    )

    assert response.status_code == 403


def test_team_scoped_certification_review_cannot_access_platform_review_queue() -> None:
    db = get_database()
    team = Team(company_name="Scoped Certification Review Team", owner_user_id="owner-1")
    operator = User(username="scopedcertreview", email="scoped-cert-review@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(operator)
    db.add(
        TeamMember(
            team_id=team.id,
            user_id=operator.id,
            team_role="labeler",
            permissions=["certification:review"],
        )
    )
    db.commit()

    response = client.get(
        "/api/v1/platform/certifications/review-queue",
        headers={"Authorization": f"Bearer {access_token(operator)}", "X-Team-ID": team.id},
    )

    assert response.status_code == 403


def test_platform_manager_can_test_platform_provider_draft_without_team_scope(monkeypatch) -> None:
    db = get_database()
    operator = User(
        username="platformmanager",
        email="platform-manager@example.com",
        global_role="platform_admin",
        email_verified=True,
    )
    db.add(operator)
    db.commit()

    class DummyResponse:
        status_code = 200
        headers = {"x-request-id": "upstream-platform-test"}

        @staticmethod
        def json() -> dict:
            return {"usage": {"prompt_tokens": 12, "completion_tokens": 6, "total_tokens": 18}}

    class DummyClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb) -> None:
            return None

        def post(self, url: str, headers: dict | None = None, json: dict | None = None):
            assert "openai" in url
            assert json is not None
            return DummyResponse()

    monkeypatch.setattr(resource_service.httpx, "Client", DummyClient)

    response = client.post(
        "/api/v1/ai-resources/configs/test-draft",
        headers={"Authorization": f"Bearer {access_token(operator)}"},
        json={
            "route_name": "平台默认共享路由",
            "provider_kind": "OpenAI",
            "scope": "platform",
            "api_base": "https://api.openai.com/v1",
            "api_key": "sk-platform-test",
            "model_id": "gpt-4.1-mini",
            "runtime_config": {"temperature": 0, "max_output_tokens": 128, "timeout_ms": 15000},
            "message": "ping",
        },
    )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["route_name"] == "平台默认共享路由"
    assert payload["provider_kind"] == "OpenAI"
    assert payload["model"] == "gpt-4.1-mini"
    assert payload["status"] == "success"
    assert payload["request_id"] == "upstream-platform-test"
