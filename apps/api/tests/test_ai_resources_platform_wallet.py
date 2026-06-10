import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-with-strong-length")
os.environ.setdefault("MONGODB_URL", "mongomock://localhost")
os.environ.setdefault("MONGODB_DATABASE", "markup_test")

from fastapi import Request

from app.core.database import get_database, reset_database
from app.core.security import encrypt_secret
from app.models.resource import AiCallLog, AiProviderConfig, TeamAiWallet, TeamAiWalletLedger
from app.models.team import Team
from app.models.upload import UploadedFile
from app.models.user import User
from app.services.resource_service import (
    create_provider_config,
    list_team_ai_history,
    list_provider_configs,
    recharge_points_budget,
    recharge_team_ai_wallet,
    record_platform_ai_wallet_spend,
    require_team_ai_wallet_positive_balance,
    set_points_budget_payment_password,
    team_ai_wallet_payload,
    team_points_budget_payload,
    transfer_team_points_to_ai_wallet,
)
from app.services.file_storage import write_storage_file
from app.services import production_service, resource_service
from app.services.team_service import create_team_for_admin


def setup_module() -> None:
    reset_database()


def build_request() -> Request:
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/test",
        "headers": [],
        "client": ("127.0.0.1", 12345),
    }
    return Request(scope)


def provider_create_payload(*, scope: str, team_id: str | None, route_name: str, is_platform_default: bool = False) -> dict:
    return {
        "route_name": route_name,
        "provider_kind": "OpenAI Compatible",
        "scope": scope,
        "is_platform_default": is_platform_default,
        "team_id": team_id,
        "api_base": "https://provider.example.com/v1",
        "api_key": "sk-test-123",
        "model_id": "gpt-4.1-mini",
        "pricing": {
            "input_price_per_million": 4.2,
            "output_price_per_million": 11.8,
            "cache_hit_price_per_million": 1.1,
        },
        "capabilities": ["text"],
        "runtime_config": {"temperature": 0, "max_output_tokens": 2048, "timeout_ms": 15000},
        "status": "enabled",
        "remark": "test",
    }


def provider_config(*, provider_kind: str = "OpenAI Compatible", timeout_ms: int = 15000) -> AiProviderConfig:
    return AiProviderConfig(
        scope="platform",
        team_id=None,
        route_name="Provider Test",
        provider_kind=provider_kind,
        provider=provider_kind,
        api_base="https://provider.example.com/v1",
        encrypted_api_key="encrypted",
        api_key_configured=True,
        model_id="model-a",
        default_model="model-a",
        models=["model-a"],
        runtime_config={"temperature": 0, "max_output_tokens": 128, "timeout_ms": timeout_ms},
        status="enabled",
    )


def test_generation_timeout_uses_provider_runtime_config() -> None:
    item = provider_config(timeout_ms=15000)

    assert resource_service._provider_generation_timeout_seconds(item) == 15.0
    assert resource_service._provider_connection_test_timeout_seconds(item) == resource_service.PROVIDER_CONNECTION_TEST_TIMEOUT_SECONDS


def test_provider_connection_test_uses_lightweight_token_limit_without_affecting_generation() -> None:
    item = provider_config(provider_kind="OpenAI Compatible")
    item.runtime_config = {"temperature": 0, "max_output_tokens": 4096, "timeout_ms": 15000}

    _url, _headers, test_body = resource_service._provider_test_request(item, "sk-test", "ping")
    _gen_url, _gen_headers, generation_body = resource_service._provider_generation_request(item, "sk-test", "model-a", "write a summary")

    assert test_body["max_tokens"] == resource_service.PROVIDER_CONNECTION_TEST_MAX_OUTPUT_TOKENS
    assert generation_body["max_tokens"] == 4096


def test_provider_http_client_ignores_environment_proxy_by_default(monkeypatch) -> None:
    captured_kwargs: list[dict] = []

    class DummyResponse:
        status_code = 200
        headers: dict = {}

        @staticmethod
        def json() -> dict:
            return {"usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}}

    class DummyClient:
        def __init__(self, *args, **kwargs) -> None:
            captured_kwargs.append(kwargs)

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb) -> None:
            return None

        def post(self, url: str, headers: dict | None = None, json: dict | None = None):
            assert json is not None
            assert json["max_tokens"] == resource_service.PROVIDER_CONNECTION_TEST_MAX_OUTPUT_TOKENS
            return DummyResponse()

    monkeypatch.setattr(resource_service.httpx, "Client", DummyClient)
    item = provider_config(provider_kind="OpenAI Compatible")

    result = resource_service._run_provider_test(item, api_key="sk-test", message="ping", request=build_request())

    assert result["status"] == "success"
    assert captured_kwargs[0]["timeout"] == resource_service.PROVIDER_CONNECTION_TEST_TIMEOUT_SECONDS
    assert captured_kwargs[0]["trust_env"] is False


def test_provider_http_client_allows_explicit_environment_proxy_opt_in(monkeypatch) -> None:
    captured_kwargs: list[dict] = []

    class DummyClient:
        def __init__(self, *args, **kwargs) -> None:
            captured_kwargs.append(kwargs)

    monkeypatch.setattr(resource_service.httpx, "Client", DummyClient)
    item = provider_config(provider_kind="OpenAI Compatible")
    item.runtime_config = {"trust_env_proxy": True}

    resource_service._provider_http_client(item, timeout=3.0)

    assert captured_kwargs[0]["trust_env"] is True


def test_openai_compatible_structured_generation_uses_json_object() -> None:
    item = provider_config(provider_kind="OpenAI Compatible")
    schema = {"type": "object", "properties": {"decision": {"type": "string"}}}

    _url, _headers, body = resource_service._provider_generation_request(item, "sk-test", "model-a", "return json", structured_output_schema=schema)

    assert body["response_format"] == {"type": "json_object"}


def test_deepseek_compatible_route_is_recognized_as_deepseek() -> None:
    item = provider_config(provider_kind="OpenAI Compatible")
    item.route_name = "deepseek"
    item.api_base = "https://api.deepseek.com"
    item.model_id = "deepseek-chat"

    assert resource_service._provider_kind(item) == "DeepSeek"


def test_openai_structured_generation_uses_json_schema() -> None:
    item = provider_config(provider_kind="OpenAI")
    schema = {"type": "object", "properties": {"decision": {"type": "string"}}}

    _url, _headers, body = resource_service._provider_generation_request(item, "sk-test", "model-a", "return json", structured_output_schema=schema)

    assert body["response_format"]["type"] == "json_schema"
    assert body["response_format"]["json_schema"]["schema"] == schema


def test_uploaded_video_uses_provider_managed_transport_when_public_url_is_not_reachable(monkeypatch) -> None:
    reset_database()
    db = get_database()
    team = Team(company_name="Inline Media Team", owner_user_id="owner-inline")
    provider = AiProviderConfig(
        scope="team",
        team_id=team.id,
        route_name="Ark Video",
        provider_kind="方舟",
        provider="方舟",
        protocol_profile="ark_chat",
        api_base="https://ark.cn-beijing.volces.com/api/v3",
        encrypted_api_key=encrypt_secret("sk-test"),
        api_key_configured=True,
        model_id="doubao-seed-2-0-lite",
        default_model="doubao-seed-2-0-lite",
        models=["doubao-seed-2-0-lite"],
        capabilities=["text", "video"],
        transport_modes=["external_url", "inline_data"],
        capability_profile={
            "text": {"enabled": True, "transport_modes": [], "request_part_type": None, "supports_streaming": True, "options": {}},
            "video": {
                "enabled": True,
                "transport_modes": ["external_url", "inline_data"],
                "request_part_type": "video_url",
                "supports_streaming": True,
                "options": {},
            },
        },
        runtime_config={"temperature": 0, "max_output_tokens": 128, "timeout_ms": 15000},
        status="enabled",
    )
    video_path = write_storage_file(f"uploads/{team.id}/inline-video.mp4", b"fake-video-binary")
    upload = UploadedFile(
        team_id=team.id,
        owner_id="owner-inline",
        filename="inline-video.mp4",
        content_type="video/mp4",
        category="media",
        size=len(b"fake-video-binary"),
        storage="filesystem",
        path=video_path,
        url="",
    )
    upload.url = f"/api/v1/uploads/{upload.id}/download"
    db.add(team)
    db.add(provider)
    db.add(upload)
    db.commit()

    calls: list[tuple[str, dict | None, dict | None]] = []

    class DummyResponse:
        def __init__(self, payload: dict) -> None:
            self.status_code = 200
            self.text = ""
            self.headers = {"x-request-id": "req-inline"}
            self._payload = payload

        def json(self) -> dict:
            return self._payload

    class DummyClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb) -> None:
            return None

        def post(self, url: str, headers: dict | None = None, json: dict | None = None, data: dict | None = None, files=None):
            calls.append((url, json, data))
            if url.endswith("/files"):
                assert data is not None
                assert data["purpose"] == "user_data"
                assert "preprocess_configs[video][fps]" in data
                assert files is not None
                return DummyResponse({"id": "file-inline-1", "status": "processed"})
            assert json is not None
            return DummyResponse(
                {
                    "output": [{"content": [{"type": "output_text", "text": "ok"}]}],
                    "usage": {"input_tokens": 12, "output_tokens": 3, "total_tokens": 15},
                }
            )

    monkeypatch.setattr(resource_service.httpx, "Client", DummyClient)

    result = resource_service.run_provider_messages_generation(
        db,
        team_id=team.id,
        provider_id=provider.id,
        model=provider.model_id,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "analyze this video"},
                    {"type": "video_url", "video_url": {"url": upload.url}, "label": "sample-video"},
                ],
            }
        ],
        operation_type="labeling_ai_assist_preview",
        operator_id="owner-inline",
        request=build_request(),
        charge_ai_resource=False,
    )

    assert result["content"] == "ok"
    assert any(url.endswith("/files") for url, _json, _data in calls)
    responses_payload = next(payload for url, payload, _data in calls if url.endswith("/responses"))
    input_video = next(part for part in responses_payload["input"][0]["content"] if part["type"] == "input_video")
    assert input_video["file_id"] == "file-inline-1"


def test_uploaded_audio_prefers_public_url_for_audio_url_provider(monkeypatch) -> None:
    reset_database()
    db = get_database()
    team = Team(company_name="Public Audio Team", owner_user_id="owner-audio")
    provider = AiProviderConfig(
        scope="team",
        team_id=team.id,
        route_name="Audio URL Provider",
        provider_kind="OpenAI Compatible",
        provider="OpenAI Compatible",
        api_base="https://provider.example.com/v1",
        encrypted_api_key=encrypt_secret("sk-test"),
        api_key_configured=True,
        model_id="audio-model",
        default_model="audio-model",
        models=["audio-model"],
        capabilities=["text", "audio"],
        capability_profile={
            "text": {"enabled": True, "transport_modes": [], "request_part_type": None, "supports_streaming": True, "options": {}},
            "audio": {
                "enabled": True,
                "transport_modes": ["external_url", "inline_data"],
                "request_part_type": "audio_url",
                "supports_streaming": True,
                "options": {},
            },
        },
        status="enabled",
    )
    audio_path = write_storage_file(f"uploads/{team.id}/public-audio.wav", b"audio-bytes")
    upload = UploadedFile(team_id=team.id, owner_id="owner-audio", filename="public-audio.wav", content_type="audio/wav", category="media", size=11, path=audio_path)
    upload.url = f"/api/v1/uploads/{upload.id}/download"
    db.add(team)
    db.add(provider)
    db.add(upload)
    db.commit()
    monkeypatch.setattr(resource_service.settings, "public_api_base_url", "https://www.markuplabel.cn")

    captured_payloads: list[dict] = []

    class DummyResponse:
        status_code = 200
        text = ""
        headers = {"x-request-id": "req-audio-url"}

        def json(self) -> dict:
            return {"choices": [{"message": {"content": "ok"}}], "usage": {"total_tokens": 1}}

    class DummyClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb) -> None:
            return None

        def post(self, url: str, headers: dict | None = None, json: dict | None = None, data: dict | None = None, files=None):
            assert json is not None
            captured_payloads.append(json)
            return DummyResponse()

    monkeypatch.setattr(resource_service.httpx, "Client", DummyClient)

    result = resource_service.run_provider_messages_generation(
        db,
        team_id=team.id,
        provider_id=provider.id,
        model=provider.model_id,
        messages=[{"role": "user", "content": [{"type": "text", "text": "listen"}, {"type": "audio_url", "audio_url": {"url": upload.url}, "label": "clip"}]}],
        operation_type="labeling_ai_assist_preview",
        operator_id="owner-audio",
        request=build_request(),
        charge_ai_resource=False,
    )

    assert result["content"] == "ok"
    audio_part = next(part for part in captured_payloads[0]["messages"][0]["content"] if part["type"] == "audio_url")
    audio_url = audio_part["audio_url"]["url"]
    assert audio_url.startswith(f"https://www.markuplabel.cn/api/v1/uploads/{upload.id}/playback?token=")
    assert not audio_url.startswith("data:audio/")
    log = db.find(AiCallLog, {"operation_type": "labeling_ai_assist_preview"})[0]
    assert log.meta["debug"]["media_parts"][0]["transport_mode"] == "external_url"


def test_uploaded_video_prefers_public_url_for_video_url_provider(monkeypatch) -> None:
    reset_database()
    db = get_database()
    team = Team(company_name="Public Video Team", owner_user_id="owner-video")
    provider = AiProviderConfig(
        scope="team",
        team_id=team.id,
        route_name="Video URL Provider",
        provider_kind="OpenAI Compatible",
        provider="OpenAI Compatible",
        api_base="https://provider.example.com/v1",
        encrypted_api_key=encrypt_secret("sk-test"),
        api_key_configured=True,
        model_id="video-model",
        default_model="video-model",
        models=["video-model"],
        capabilities=["text", "video"],
        capability_profile={
            "text": {"enabled": True, "transport_modes": [], "request_part_type": None, "supports_streaming": True, "options": {}},
            "video": {
                "enabled": True,
                "transport_modes": ["external_url", "inline_data"],
                "request_part_type": "video_url",
                "supports_streaming": True,
                "options": {"fps": 1},
            },
        },
        status="enabled",
    )
    video_path = write_storage_file(f"uploads/{team.id}/public-video.mp4", b"video-bytes")
    upload = UploadedFile(team_id=team.id, owner_id="owner-video", filename="public-video.mp4", content_type="video/mp4", category="media", size=11, path=video_path)
    upload.url = f"/api/v1/uploads/{upload.id}/download"
    db.add(team)
    db.add(provider)
    db.add(upload)
    db.commit()
    monkeypatch.setattr(resource_service.settings, "public_api_base_url", "https://www.markuplabel.cn")

    captured_payloads: list[dict] = []

    class DummyResponse:
        status_code = 200
        text = ""
        headers = {"x-request-id": "req-video-url"}

        def json(self) -> dict:
            return {"choices": [{"message": {"content": "ok"}}], "usage": {"total_tokens": 1}}

    class DummyClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb) -> None:
            return None

        def post(self, url: str, headers: dict | None = None, json: dict | None = None, data: dict | None = None, files=None):
            assert json is not None
            captured_payloads.append(json)
            return DummyResponse()

    monkeypatch.setattr(resource_service.httpx, "Client", DummyClient)

    result = resource_service.run_provider_messages_generation(
        db,
        team_id=team.id,
        provider_id=provider.id,
        model=provider.model_id,
        messages=[{"role": "user", "content": [{"type": "text", "text": "watch"}, {"type": "video_url", "video_url": {"url": upload.url}, "label": "clip"}]}],
        operation_type="labeling_ai_assist_preview",
        operator_id="owner-video",
        request=build_request(),
        charge_ai_resource=False,
    )

    assert result["content"] == "ok"
    video_part = next(part for part in captured_payloads[0]["messages"][0]["content"] if part["type"] == "video_url")
    video_url = video_part["video_url"]["url"]
    assert video_url.startswith(f"https://www.markuplabel.cn/api/v1/uploads/{upload.id}/playback?token=")
    assert not video_url.startswith("data:video/")
    log = db.find(AiCallLog, {"operation_type": "labeling_ai_assist_preview"})[0]
    assert log.meta["debug"]["media_parts"][0]["transport_mode"] == "external_url"


def test_platform_messages_generation_uses_public_url_for_uploaded_image(monkeypatch) -> None:
    reset_database()
    db = get_database()
    team = Team(company_name="Platform Public Image Team", owner_user_id="owner-image")
    provider = AiProviderConfig(
        scope="team",
        team_id=team.id,
        route_name="Platform Vision Provider",
        provider_kind="OpenAI Compatible",
        provider="OpenAI Compatible",
        api_base="https://provider.example.com/v1",
        encrypted_api_key=encrypt_secret("sk-test"),
        api_key_configured=True,
        model_id="vision-model",
        default_model="vision-model",
        models=["vision-model"],
        capabilities=["text", "image"],
        capability_profile={
            "text": {"enabled": True, "transport_modes": [], "request_part_type": None, "supports_streaming": True, "options": {}},
            "image": {
                "enabled": True,
                "transport_modes": ["external_url", "inline_data"],
                "request_part_type": "image_url",
                "supports_streaming": True,
                "options": {"detail": "auto"},
            },
        },
        status="enabled",
    )
    image_path = write_storage_file(f"uploads/{team.id}/public-image.jpg", b"image-bytes")
    upload = UploadedFile(team_id=team.id, owner_id="owner-image", filename="public-image.jpg", content_type="image/jpeg", category="media", size=11, path=image_path)
    upload.url = f"/api/v1/uploads/{upload.id}/download"
    db.add(team)
    db.add(provider)
    db.add(upload)
    db.commit()
    monkeypatch.setattr(resource_service.settings, "public_api_base_url", "https://www.markuplabel.cn")

    captured_payloads: list[dict] = []

    class DummyResponse:
        status_code = 200
        text = ""
        headers = {"x-request-id": "req-platform-image"}

        def json(self) -> dict:
            return {"choices": [{"message": {"content": "ok"}}], "usage": {"total_tokens": 1}}

    class DummyClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb) -> None:
            return None

        def post(self, url: str, headers: dict | None = None, json: dict | None = None, data: dict | None = None, files=None):
            assert json is not None
            captured_payloads.append(json)
            return DummyResponse()

    monkeypatch.setattr(resource_service.httpx, "Client", DummyClient)

    result = production_service.run_platform_provider_messages_generation(
        db,
        team_id=team.id,
        provider_id=provider.id,
        model=provider.model_id,
        messages=[{"role": "user", "content": [{"type": "text", "text": "look"}, {"type": "image_url", "image_url": {"url": upload.url}, "label": "photo"}]}],
        operation_type="ai_review_execute",
        operator_id="owner-image",
        request=build_request(),
        charge_ai_resource=False,
    )

    assert result["content"] == "ok"
    image_part = next(part for part in captured_payloads[0]["messages"][0]["content"] if part["type"] == "image_url")
    image_url = image_part["image_url"]["url"]
    assert image_url.startswith(f"https://www.markuplabel.cn/api/v1/uploads/{upload.id}/playback?token=")
    assert not image_url.startswith("data:image/")
    log = db.find(AiCallLog, {"operation_type": "ai_review_execute"})[0]
    assert log.meta["debug"]["media_parts"][0]["transport_mode"] == "external_url"


def test_ark_video_file_api_upload_uses_responses_file_id(monkeypatch) -> None:
    reset_database()
    db = get_database()
    team = Team(company_name="File API Team", owner_user_id="owner-file")
    provider = AiProviderConfig(
        scope="team",
        team_id=team.id,
        route_name="Ark File Video",
        provider_kind="方舟",
        provider="方舟",
        protocol_profile="ark_chat",
        api_base="https://ark.cn-beijing.volces.com/api/v3",
        encrypted_api_key=encrypt_secret("sk-test"),
        api_key_configured=True,
        model_id="doubao-seed-2-0-lite",
        default_model="doubao-seed-2-0-lite",
        models=["doubao-seed-2-0-lite"],
        capabilities=["text", "video"],
        transport_modes=["file_api"],
        capability_profile={
            "text": {"enabled": True, "transport_modes": [], "request_part_type": None, "supports_streaming": True, "options": {}},
            "video": {
                "enabled": True,
                "transport_modes": ["file_api"],
                "request_part_type": "input_video",
                "supports_streaming": False,
                "options": {},
            },
        },
        runtime_config={"temperature": 0, "max_output_tokens": 128, "timeout_ms": 15000},
        status="enabled",
    )
    video_path = write_storage_file(f"uploads/{team.id}/file-api-video.mp4", b"file-api-video")
    upload = UploadedFile(
        team_id=team.id,
        owner_id="owner-file",
        filename="file-api-video.mp4",
        content_type="video/mp4",
        category="media",
        size=len(b"file-api-video"),
        storage="filesystem",
        path=video_path,
        url="",
    )
    upload.url = f"/api/v1/uploads/{upload.id}/download"
    db.add(team)
    db.add(provider)
    db.add(upload)
    db.commit()

    calls: list[tuple[str, dict | None, dict | None]] = []

    class DummyResponse:
        def __init__(self, status_code: int, payload: dict) -> None:
            self.status_code = status_code
            self._payload = payload
            self.text = ""
            self.headers = {"x-request-id": "req-file-api"}

        def json(self) -> dict:
            return self._payload

    class DummyClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb) -> None:
            return None

        def post(self, url: str, headers: dict | None = None, json: dict | None = None, data: dict | None = None, files=None):
            calls.append((url, json, data))
            if url.endswith("/files"):
                assert data is not None
                assert data["purpose"] == "user_data"
                assert "preprocess_configs[video][fps]" in data
                assert files is not None
                return DummyResponse(200, {"id": "file-provider-1", "status": "processed"})
            return DummyResponse(
                200,
                {
                    "output": [
                        {
                            "content": [
                                {"type": "output_text", "text": "ok"},
                            ]
                        }
                    ],
                    "usage": {"input_tokens": 9, "output_tokens": 2, "total_tokens": 11},
                },
            )

    monkeypatch.setattr(resource_service.httpx, "Client", DummyClient)

    result = resource_service.run_provider_messages_generation(
        db,
        team_id=team.id,
        provider_id=provider.id,
        model=provider.model_id,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "inspect video"},
                    {"type": "video_url", "video_url": {"url": upload.url}, "label": "sample-video"},
                ],
            }
        ],
        operation_type="labeling_ai_assist_preview",
        operator_id="owner-file",
        request=build_request(),
        charge_ai_resource=False,
    )

    assert result["content"] == "ok"
    assert calls[0][0].endswith("/files")
    assert calls[1][0].endswith("/responses")
    responses_payload = calls[1][1]
    assert responses_payload is not None
    input_video = next(part for part in responses_payload["input"][0]["content"] if part["type"] == "input_video")
    assert input_video["file_id"] == "file-provider-1"
    logs = db.find(AiCallLog, {"operation_type": "labeling_ai_assist_preview"})
    assert len(logs) == 1
    assert logs[0].meta["debug"]["request_endpoint"] == "/responses"
    assert logs[0].meta["debug"]["media_parts"][0]["provider_file_id"] == "file-provider-1"


def test_ark_uploaded_video_auto_upgrades_legacy_external_url_config_to_file_api(monkeypatch) -> None:
    reset_database()
    db = get_database()
    team = Team(company_name="Legacy Ark Config Team", owner_user_id="owner-legacy")
    provider = AiProviderConfig(
        scope="team",
        team_id=team.id,
        route_name="Ark Legacy Video",
        provider_kind="方舟",
        provider="方舟",
        protocol_profile="ark_chat",
        api_base="https://ark.cn-beijing.volces.com/api/v3",
        encrypted_api_key=encrypt_secret("sk-test"),
        api_key_configured=True,
        model_id="doubao-seed-2-0-lite",
        default_model="doubao-seed-2-0-lite",
        models=["doubao-seed-2-0-lite"],
        capabilities=["text", "video"],
        transport_modes=["external_url"],
        capability_profile={
            "text": {"enabled": True, "transport_modes": [], "request_part_type": None, "supports_streaming": True, "options": {}},
            "video": {
                "enabled": True,
                "transport_modes": ["external_url"],
                "request_part_type": "video_url",
                "supports_streaming": False,
                "options": {},
            },
        },
        runtime_config={"temperature": 0, "max_output_tokens": 128, "timeout_ms": 15000},
        status="enabled",
    )
    video_path = write_storage_file(f"uploads/{team.id}/legacy-video.mp4", b"legacy-video")
    upload = UploadedFile(
        team_id=team.id,
        owner_id="owner-legacy",
        filename="legacy-video.mp4",
        content_type="video/mp4",
        category="media",
        size=len(b"legacy-video"),
        storage="filesystem",
        path=video_path,
        url="",
    )
    upload.url = f"/api/v1/uploads/{upload.id}/download"
    db.add(team)
    db.add(provider)
    db.add(upload)
    db.commit()

    calls: list[str] = []

    class DummyResponse:
        def __init__(self, status_code: int, payload: dict) -> None:
            self.status_code = status_code
            self._payload = payload
            self.text = ""
            self.headers = {"x-request-id": "req-legacy-auto"}

        def json(self) -> dict:
            return self._payload

    class DummyClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb) -> None:
            return None

        def post(self, url: str, headers: dict | None = None, json: dict | None = None, data: dict | None = None, files=None):
            calls.append(url)
            if url.endswith("/files"):
                return DummyResponse(200, {"id": "file-auto-legacy", "status": "processed"})
            return DummyResponse(
                200,
                {
                    "output": [{"content": [{"type": "output_text", "text": "ok"}]}],
                    "usage": {"input_tokens": 7, "output_tokens": 2, "total_tokens": 9},
                },
            )

    monkeypatch.setattr(resource_service.httpx, "Client", DummyClient)

    result = resource_service.run_provider_messages_generation(
        db,
        team_id=team.id,
        provider_id=provider.id,
        model=provider.model_id,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "inspect uploaded video"},
                    {"type": "video_url", "video_url": {"url": upload.url}, "label": "legacy-video"},
                ],
            }
        ],
        operation_type="labeling_ai_assist_preview",
        operator_id="owner-legacy",
        request=build_request(),
        charge_ai_resource=False,
    )

    assert result["content"] == "ok"
    assert any(url.endswith("/files") for url in calls)
    assert any(url.endswith("/responses") for url in calls)


def test_platform_messages_deepseek_structured_generation_uses_json_object_and_prompt_schema() -> None:
    item = provider_config(provider_kind="DeepSeek")
    schema = {"type": "object", "properties": {"answers": {"type": "object"}}}

    _url, _headers, body = production_service.platform_provider_messages_request(
        item,
        "sk-test",
        "model-a",
        [{"role": "user", "content": [{"type": "text", "text": "return json"}]}],
        structured_output_schema=schema,
    )

    assert body["response_format"] == {"type": "json_object"}
    text_parts = [part["text"] for part in body["messages"][0]["content"] if part["type"] == "text"]
    assert any("Structured output JSON schema" in text for text in text_parts)


def test_platform_messages_openai_structured_generation_uses_json_schema() -> None:
    item = provider_config(provider_kind="OpenAI")
    schema = {"type": "object", "properties": {"answers": {"type": "object"}}}

    _url, _headers, body = production_service.platform_provider_messages_request(
        item,
        "sk-test",
        "model-a",
        [{"role": "user", "content": "return json"}],
        structured_output_schema=schema,
    )

    assert body["response_format"]["type"] == "json_schema"
    assert body["response_format"]["json_schema"]["schema"] == schema


def test_platform_messages_generation_retries_with_text_only_prompt_schema_on_provider_400(monkeypatch) -> None:
    reset_database()
    db = get_database()
    team = Team(company_name="Fallback Provider Team", owner_user_id="owner-1")
    provider = AiProviderConfig(
        scope="team",
        team_id=team.id,
        route_name="Compatible Provider",
        provider_kind="OpenAI Compatible",
        provider="OpenAI Compatible",
        api_base="https://provider.example.com/v1",
        encrypted_api_key=encrypt_secret("sk-test"),
        api_key_configured=True,
        model_id="model-a",
        default_model="model-a",
        models=["model-a"],
        runtime_config={"temperature": 0, "max_output_tokens": 128, "timeout_ms": 15000},
        status="enabled",
    )
    db.add(team)
    db.add(provider)
    db.commit()
    posted_bodies: list[dict] = []

    class DummyResponse:
        def __init__(self, status_code: int, payload: dict, text: str = "") -> None:
            self.status_code = status_code
            self._payload = payload
            self.text = text
            self.headers = {"x-request-id": f"retry-{len(posted_bodies)}"}

        def json(self) -> dict:
            return self._payload

    class DummyClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb) -> None:
            return None

        def post(self, url: str, headers: dict | None = None, json: dict | None = None):
            assert json is not None
            posted_bodies.append(json)
            if len(posted_bodies) == 1:
                return DummyResponse(400, {}, "unsupported response_format or content parts")
            return DummyResponse(
                200,
                {
                    "choices": [{"message": {"content": '{"answers":{},"explanation":"ok","field_explanations":{},"image_annotations":[]}'}}],
                    "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
                },
            )

    monkeypatch.setattr(resource_service.httpx, "Client", DummyClient)

    result = production_service.run_platform_provider_messages_generation(
        db,
        team_id=team.id,
        messages=[{"role": "user", "content": [{"type": "text", "text": "return json"}]}],
        operation_type="labeling_ai_assist_preview",
        operator_id="owner-1",
        request=build_request(),
        provider_id=provider.id,
        structured_output_schema={"type": "object", "properties": {"answers": {"type": "object"}}},
        charge_ai_resource=False,
    )

    assert result["content"] == '{"answers":{},"explanation":"ok","field_explanations":{},"image_annotations":[]}'
    assert len(posted_bodies) == 2
    assert posted_bodies[0]["response_format"] == {"type": "json_object"}
    assert "response_format" not in posted_bodies[1]
    fallback_content = posted_bodies[1]["messages"][0]["content"]
    assert isinstance(fallback_content, str)
    assert "Structured output JSON schema" in fallback_content
    logs = db.find(AiCallLog, {"operation_type": "labeling_ai_assist_preview"})
    assert len(logs) == 1
    assert logs[0].status == "success"


def test_create_team_initializes_ai_wallet() -> None:
    reset_database()
    db = get_database()
    owner = User(username="teamowner", email="teamowner@example.com", global_role="admin", email_verified=True)
    db.add(owner)

    detail = create_team_for_admin(
        db,
        owner=owner,
        company_name="AI Wallet Team",
        industry="ai",
        contact_phone=None,
        description=None,
        logo_url=None,
        website=None,
        address=None,
        billing_info=None,
        mailing_info=None,
        request=build_request(),
    )

    wallet = db.find_one(TeamAiWallet, {"team_id": detail["team_id"]})
    assert wallet is not None
    assert wallet.balance_points == 0.0


def test_platform_default_provider_is_unique_and_visible_readonly_to_team() -> None:
    reset_database()
    db = get_database()
    team = Team(company_name="Provider Team", owner_user_id="owner-1")
    db.add(team)

    first = create_provider_config(
        db,
        provider_create_payload(scope="platform", team_id=None, route_name="平台共享 A", is_platform_default=True),
        "platform-admin",
        build_request(),
    )
    second = create_provider_config(
        db,
        provider_create_payload(scope="platform", team_id=None, route_name="平台共享 B", is_platform_default=True),
        "platform-admin",
        build_request(),
    )
    create_provider_config(
        db,
        provider_create_payload(scope="team", team_id=team.id, route_name="企业自有路由"),
        "team-admin",
        build_request(),
    )

    platform_items = db.find(AiProviderConfig, {"scope": "platform"})
    assert len([item for item in platform_items if item.is_platform_default]) == 1
    assert any(item.id == second["provider_id"] and item.is_platform_default for item in platform_items)
    assert all(item.id == second["provider_id"] or not item.is_platform_default for item in platform_items)

    team_items = list_provider_configs(db, team.id, manage_platform=False)
    platform_view = next(item for item in team_items if item["provider_id"] == second["provider_id"])
    assert platform_view["scope"] == "platform"
    assert platform_view["is_platform_default"] is True
    assert platform_view["team_can_manage"] is False
    assert first["provider_id"] != second["provider_id"]


def test_ai_wallet_recharge_and_platform_spend() -> None:
    reset_database()
    db = get_database()
    team = Team(company_name="Wallet Ledger Team", owner_user_id="owner-1")
    db.add(team)

    recharged = recharge_team_ai_wallet(
        db,
        team_id=team.id,
        amount=200,
        payment_method="wechat",
        operator_id="team-admin",
        request=build_request(),
    )
    assert recharged["balance_points"] == 200

    require_team_ai_wallet_positive_balance(db, team.id)

    spent = record_platform_ai_wallet_spend(
        db,
        team_id=team.id,
        provider_id="provider-platform-1",
        route_name="平台共享默认路由",
        amount_points=211.5,
        source_type="ai_review",
        source_id="job-1",
        request_id="req-wallet-1",
        operator_id="team-admin",
    )
    assert spent["balance_points"] == -11.5

    wallet = team_ai_wallet_payload(db, team.id)
    assert wallet["balance_points"] == -11.5

    ledger_items = db.find(TeamAiWalletLedger, {"team_id": team.id})
    assert len(ledger_items) == 2
    assert any(item.transaction_type == "recharge" for item in ledger_items)
    assert any(item.transaction_type == "ai_spend" and item.balance_after == -11.5 for item in ledger_items)


def test_transfer_team_points_to_ai_wallet_and_history() -> None:
    reset_database()
    db = get_database()
    team = Team(company_name="Transfer Wallet Team", owner_user_id="owner-1")
    db.add(team)

    recharge_points_budget(
        db,
        team_id=team.id,
        amount=500,
        payment_method="wechat",
        operator_id="team-admin",
        request=build_request(),
    )
    set_points_budget_payment_password(
        db,
        team_id=team.id,
        new_password="123456",
        confirm_password="123456",
        operator_id="team-admin",
        request=build_request(),
    )

    transferred = transfer_team_points_to_ai_wallet(
        db,
        team_id=team.id,
        amount=120,
        payment_password="123456",
        operator_id="team-admin",
        request=build_request(),
    )
    assert transferred["balance_points"] == 120
    assert team_points_budget_payload(db, team.id)["available_points"] == 380

    db.add(
        AiCallLog(
            team_id=team.id,
            user_id="team-admin",
            provider_id="provider-platform-1",
            route_name="平台共享默认路由",
            operation_type="ai_review",
            provider="OpenAI Compatible",
            model="gpt-4.1-mini",
            tokens=64,
            cost=11.5,
            latency_ms=320,
            status="success",
            request_id="req-history-1",
        )
    )
    record_platform_ai_wallet_spend(
        db,
        team_id=team.id,
        provider_id="provider-platform-1",
        route_name="平台共享默认路由",
        amount_points=11.5,
        source_type="ai_review",
        source_id="job-history-1",
        request_id="req-history-1",
        operator_id="team-admin",
    )

    history_items = list_team_ai_history(db, team.id)
    transfer_row = next(item for item in history_items if item["record_type"] == "transfer_in")
    call_row = next(item for item in history_items if item["record_type"] == "ai_call")

    assert transfer_row["points_delta"] == 120
    assert transfer_row["source_label"] == "企业积分钱包"
    assert call_row["request_id"] == "req-history-1"
    assert call_row["points_delta"] == -11.5
    assert call_row["balance_after"] == 108.5


def test_ai_history_matches_spend_without_request_id_by_source_and_keeps_unmatched_spend() -> None:
    reset_database()
    db = get_database()
    team = Team(company_name="No Request AI History Team", owner_user_id="owner-1")
    db.add(team)

    recharge_team_ai_wallet(
        db,
        team_id=team.id,
        amount=20,
        payment_method="wechat",
        operator_id="team-admin",
        request=build_request(),
    )
    db.add(
        AiCallLog(
            team_id=team.id,
            user_id="team-admin",
            provider_id="provider-platform-1",
            route_name="平台共享默认路由",
            operation_type="labeling_ai_assist",
            provider="OpenAI Compatible",
            model="gpt-4.1-mini",
            tokens=4096,
            cost=1.25,
            billable=True,
            charged_points=1.25,
            source_type="labeling_ai_assist",
            source_id="submission-no-request",
            latency_ms=320,
            status="success",
            request_id=None,
        )
    )
    record_platform_ai_wallet_spend(
        db,
        team_id=team.id,
        provider_id="provider-platform-1",
        route_name="平台共享默认路由",
        amount_points=1.25,
        source_type="labeling_ai_assist",
        source_id="submission-no-request",
        request_id=None,
        operator_id="team-admin",
    )
    record_platform_ai_wallet_spend(
        db,
        team_id=team.id,
        provider_id="provider-platform-1",
        route_name="平台共享默认路由",
        amount_points=2.5,
        source_type="ai_review_execute",
        source_id="job-without-call-log",
        request_id=None,
        operator_id="team-admin",
    )

    history_items = list_team_ai_history(db, team.id)
    matched_call = next(item for item in history_items if item["history_id"].startswith("call:"))
    unmatched_spend = next(item for item in history_items if item["request_id"] == "job-without-call-log")

    assert matched_call["tokens"] == 4096
    assert matched_call["points_delta"] == -1.25
    assert matched_call["balance_after"] == 18.75
    assert unmatched_spend["record_type"] == "ai_call"
    assert unmatched_spend["tokens"] is None
    assert unmatched_spend["points_delta"] == -2.5
    assert unmatched_spend["balance_after"] == 16.25
