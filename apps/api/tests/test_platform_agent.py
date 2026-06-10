import os
from datetime import datetime

os.environ.setdefault("SECRET_KEY", "test-secret-key-with-strong-length")
os.environ.setdefault("MONGODB_URL", "mongomock://localhost")
os.environ.setdefault("MONGODB_DATABASE", "markup_test")

from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.database import get_database, reset_database
from app.core.security import decrypt_secret, encrypt_secret, generate_object_id
from app.models.auth import RefreshSession
from app.models.platform import PlatformSetting
from app.models.resource import AiCallLog, AiProviderConfig
from app.models.user import User
from app.main import app
from app.services import auth_service
from app.services import platform_agent_service
from app.services.platform_agent_service import AgentSource, RetrievedContext

client = TestClient(app)


def access_token(user: User) -> str:
    db = get_database()
    session = RefreshSession(
        user_id=user.id,
        jti_hash=f"platform-agent-test-{generate_object_id()}",
        expire_at=datetime(2030, 6, 1),
    )
    db.add(session)
    db.commit()
    return auth_service.create_access_token(user.id, {"role": user.global_role, "sid": session.id})


def setup_function() -> None:
    reset_database()
    platform_agent_service.reset_rate_limits_for_tests()
    settings.platform_agent_enabled = True
    settings.platform_agent_embedding_api_base = None
    settings.platform_agent_embedding_api_key = None
    settings.platform_agent_embedding_model = "text-embedding-3-small"
    settings.platform_agent_rate_limit_per_minute = 20


def fake_context() -> RetrievedContext:
    source = AgentSource(title="帮助文档", path="/help#quickstart", excerpt="MarkUp 支持任务发布、模板配置和 AI 预审。")
    return RetrievedContext([source], "- 帮助文档: MarkUp 支持任务发布、模板配置和 AI 预审。", used_vector_index=False)


def test_platform_agent_public_documents_are_limited_to_help_page() -> None:
    docs = platform_agent_service._load_public_documents()
    joined_content = "\n".join(content for _path, _title, content in docs)

    assert docs
    assert all(path.startswith("/help#") for path, _title, _content in docs)
    assert not any("docs/" in path or "README" in path for path, _title, _content in docs)
    assert any(title == "公开入口与账号体系" for _path, title, _content in docs)
    assert "任务广场" in joined_content
    assert "建设中" not in joined_content
    assert "适用角色" in joined_content
    assert "Provider" in joined_content
    assert "Manifest JSONL" in joined_content
    assert "LLMComponent" in joined_content
    assert "ImageMaskAnnotation" in joined_content
    assert "图片 Mask" in joined_content
    assert "media_schema" in joined_content
    assert "context_schema" in joined_content
    assert "账号身份唯一" in joined_content
    assert "企业内流转" in joined_content
    assert "AI 钱包" in joined_content
    assert "身份切换" not in joined_content
    assert "平台运营工作台" not in joined_content
    assert "平台运营后台" not in joined_content


def test_public_platform_agent_returns_rag_summary_without_login_or_provider(monkeypatch) -> None:
    monkeypatch.setattr(platform_agent_service, "retrieve_platform_context", lambda *args, **kwargs: fake_context())

    response = client.post("/api/v1/platform-agent/chat/stream", json={"message": "怎么发布任务？"})

    assert response.status_code == 200
    body = response.text
    assert "event: meta" in body
    assert '"fallback": "rag_summary"' in body
    assert "event: delta" in body
    assert "MarkUp" in body
    assert "event: sources" in body


def test_public_platform_agent_status_without_login_or_provider() -> None:
    response = client.get("/api/v1/platform-agent/status")

    assert response.status_code == 200
    data = response.json()
    assert data["enabled"] is True
    assert data["provider_configured"] is False
    assert data["provider_status"] == "missing"
    assert data["rag_mode"] == "summary"
    assert data["embedding_configured"] is False
    assert data["embedding_model"] == "text-embedding-3-small"


def test_platform_agent_embedding_setting_can_be_configured_from_platform(monkeypatch) -> None:
    db = get_database()
    admin = User(username="agentembedadmin", email="agent-embed@example.com", global_role="platform_admin", email_verified=True)
    db.add(admin)
    db.commit()
    headers = {"Authorization": f"Bearer {access_token(admin)}"}

    updated = client.put(
        "/api/v1/platform/settings/agent-embedding",
        headers=headers,
        json={
            "api_base": "https://embeddings.example/v1",
            "api_key": "emb-secret",
            "model": "bge-m3",
        },
    )

    assert updated.status_code == 200
    data = updated.json()["data"]
    assert data["api_base"] == "https://embeddings.example/v1"
    assert data["model"] == "bge-m3"
    assert data["api_key_configured"] is True
    assert "api_key" not in data

    setting = db.find_one(PlatformSetting, {"key": "platform_agent_embedding"})
    assert setting is not None
    assert setting.value["encrypted_api_key"] != "emb-secret"
    assert decrypt_secret(setting.value["encrypted_api_key"]) == "emb-secret"

    monkeypatch.setattr(platform_agent_service, "_chroma_dependency_errors", lambda: [])
    status = client.get("/api/v1/platform-agent/status")
    assert status.status_code == 200
    status_data = status.json()
    assert status_data["rag_mode"] == "chroma"
    assert status_data["rag_status"] == "chroma_ready"
    assert status_data["embedding_configured"] is True
    assert status_data["embedding_model"] == "bge-m3"


def test_platform_agent_status_reports_missing_rag_dependencies(monkeypatch) -> None:
    settings.platform_agent_embedding_api_key = "emb-secret"
    monkeypatch.setattr(
        platform_agent_service,
        "_chroma_dependency_errors",
        lambda: ["chromadb: ModuleNotFoundError: No module named 'chromadb'"],
    )

    response = client.get("/api/v1/platform-agent/status")

    assert response.status_code == 200
    data = response.json()
    assert data["embedding_configured"] is True
    assert data["rag_mode"] == "summary"
    assert data["rag_status"] == "missing_dependencies"
    assert "chromadb" in data["rag_dependency_errors"][0]


def test_platform_agent_embedding_setting_requires_key_without_existing_config() -> None:
    db = get_database()
    admin = User(username="agentembednokey", email="agent-embed-no-key@example.com", global_role="platform_admin", email_verified=True)
    db.add(admin)
    db.commit()
    headers = {"Authorization": f"Bearer {access_token(admin)}"}

    response = client.put(
        "/api/v1/platform/settings/agent-embedding",
        headers=headers,
        json={"api_base": "https://embeddings.example/v1", "api_key": " ", "model": "bge-m3"},
    )

    assert response.status_code == 422
    assert response.json()["code"] == 42201
    assert response.json()["detail"]["field"] == "api_key"
    assert db.find_one(PlatformSetting, {"key": "platform_agent_embedding"}) is None


def test_platform_agent_embedding_setting_preserves_existing_key_on_blank_update() -> None:
    db = get_database()
    admin = User(username="agentembedpreserve", email="agent-embed-preserve@example.com", global_role="platform_admin", email_verified=True)
    db.add(admin)
    db.commit()
    headers = {"Authorization": f"Bearer {access_token(admin)}"}

    first = client.put(
        "/api/v1/platform/settings/agent-embedding",
        headers=headers,
        json={"api_base": "https://embeddings.example/v1", "api_key": "first-key", "model": "model-a"},
    )
    assert first.status_code == 200
    second = client.put(
        "/api/v1/platform/settings/agent-embedding",
        headers=headers,
        json={"api_base": "https://embeddings.example/v1", "api_key": "", "model": "model-b"},
    )

    assert second.status_code == 200
    data = second.json()["data"]
    assert data["model"] == "model-b"
    assert data["api_key_configured"] is True
    setting = db.find_one(PlatformSetting, {"key": "platform_agent_embedding"})
    assert decrypt_secret(setting.value["encrypted_api_key"]) == "first-key"


def test_public_platform_agent_rate_limit(monkeypatch) -> None:
    settings.platform_agent_rate_limit_per_minute = 1
    monkeypatch.setattr(platform_agent_service, "retrieve_platform_context", lambda *args, **kwargs: fake_context())

    first = client.post("/api/v1/platform-agent/chat/stream", json={"message": "AI 预审怎么用？"})
    second = client.post("/api/v1/platform-agent/chat/stream", json={"message": "AI 预审怎么用？"})

    assert first.status_code == 200
    assert second.status_code == 429
    assert "请求过于频繁" in second.text


def test_public_platform_agent_uses_platform_default_provider(monkeypatch) -> None:
    db = get_database()
    provider = AiProviderConfig(
        scope="platform",
        team_id=None,
        route_name="平台默认问答路由",
        provider_kind="OpenAI",
        provider="OpenAI",
        model_id="gpt-4.1-mini",
        default_model="gpt-4.1-mini",
        models=["gpt-4.1-mini"],
        api_base="https://api.openai.example/v1",
        encrypted_api_key=encrypt_secret("sk-test"),
        api_key_configured=True,
        is_platform_default=True,
        status="enabled",
    )
    db.add(provider)
    db.commit()
    monkeypatch.setattr(platform_agent_service, "retrieve_platform_context", lambda *args, **kwargs: fake_context())
    def fake_stream(*args, **kwargs):
        assert kwargs["model_id"] == "gpt-4.1-mini"
        yield {"type": "meta", "request_id": "agent-request-1"}
        yield {"type": "delta", "content": "可以先"}
        yield {"type": "delta", "content": "创建模板和数据集，再发布任务。"}
        yield {
            "type": "done",
            "request_id": "agent-request-1",
            "prompt_tokens": 20,
            "completion_tokens": 10,
            "total_tokens": 30,
            "content": "可以先创建模板和数据集，再发布任务。",
        }

    monkeypatch.setattr(platform_agent_service.resource_service, "iter_provider_generation_stream", fake_stream)

    response = client.post("/api/v1/platform-agent/chat/stream", json={"message": "怎么发布任务？"})

    assert response.status_code == 200
    body = response.text
    assert '"content": "可以先"' in body
    assert '"content": "创建模板和数据集，再发布任务。"' in body
    assert "agent-request-1" in body
    assert body.index("event: meta") < body.index("event: delta")
    assert body.index("event: delta") < body.index("event: sources")
    assert body.index("event: sources") < body.index("event: done")
    logs = db.find(AiCallLog, {"operation_type": "platform_agent_chat"})
    assert len(logs) == 1
    assert logs[0].team_id == ""
    assert logs[0].tokens == 30


def test_public_platform_agent_falls_back_when_provider_stream_fails(monkeypatch) -> None:
    db = get_database()
    provider = AiProviderConfig(
        scope="platform",
        team_id=None,
        route_name="平台默认问答路由",
        provider_kind="OpenAI Compatible",
        provider="OpenAI Compatible",
        model_id="gpt-4.1-mini",
        default_model="gpt-4.1-mini",
        models=["gpt-4.1-mini"],
        api_base="https://api.openai.example/v1",
        encrypted_api_key=encrypt_secret("sk-test"),
        api_key_configured=True,
        is_platform_default=True,
        status="enabled",
    )
    db.add(provider)
    db.commit()
    monkeypatch.setattr(platform_agent_service, "retrieve_platform_context", lambda *args, **kwargs: fake_context())

    def broken_stream(*args, **kwargs):
        raise RuntimeError("provider stream failed")
        yield  # pragma: no cover

    monkeypatch.setattr(platform_agent_service.resource_service, "iter_provider_generation_stream", broken_stream)

    response = client.post("/api/v1/platform-agent/chat/stream", json={"message": "怎么发布任务？"})

    assert response.status_code == 200
    body = response.text
    assert '"fallback": "rag_summary"' in body
    assert "MarkUp" in body
    logs = db.find(AiCallLog, {"operation_type": "platform_agent_chat"})
    assert len(logs) == 1
    assert "provider stream failed" in logs[0].error
