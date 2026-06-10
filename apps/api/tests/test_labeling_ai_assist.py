import os
from datetime import datetime

import pytest

os.environ.setdefault("SECRET_KEY", "test-secret-key-with-strong-length")
os.environ.setdefault("MONGODB_URL", "mongomock://localhost")
os.environ.setdefault("MONGODB_DATABASE", "markup_test")

from fastapi.testclient import TestClient

from app.core.database import get_database, reset_database
from app.core.security import encrypt_secret, generate_object_id
from app.models.audit import AuditLog
from app.models.auth import RefreshSession
from app.models.production import Question, Submission, Task, TemplateVersion
from app.models.resource import AiCallLog, AiProviderConfig
from app.models.team import Team, TeamMember
from app.models.upload import UploadedFile
from app.models.user import User
from app.main import app
from app.services import auth_service, labels_service, resource_service
from app.services.file_storage import write_storage_file

client = TestClient(app)


def setup_function() -> None:
    reset_database()


def access_token(user: User) -> str:
    db = get_database()
    session = RefreshSession(
        user_id=user.id,
        jti_hash=f"labeling-ai-{generate_object_id()}",
        expire_at=datetime(2030, 1, 1),
    )
    db.add(session)
    db.commit()
    return auth_service.create_access_token(user.id, {"role": user.global_role, "sid": session.id})


def auth_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token(user)}"}


def seed_public_url_provider(db, team_id: str, provider_id: str = "provider-1") -> AiProviderConfig:
    provider = AiProviderConfig(
        team_id=team_id,
        route_name="Vision compatible",
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
            "text": {"enabled": True, "transport_modes": []},
            "image": {
                "enabled": True,
                "transport_modes": ["external_url", "inline_data"],
                "request_part_type": "image_url",
                "options": {"detail": "auto"},
            },
        },
        status="enabled",
        protocol_profile="openai_compatible_chat",
    )
    provider.id = provider_id
    db.add(provider)
    return provider


def seed_uploaded_image(db, team_id: str, owner_id: str, *, filename: str = "assist-image.jpg") -> UploadedFile:
    image_path = write_storage_file(f"uploads/{team_id}/{filename}", b"image-bytes")
    upload = UploadedFile(
        team_id=team_id,
        owner_id=owner_id,
        filename=filename,
        content_type="image/jpeg",
        category="media",
        size=11,
        path=image_path,
    )
    upload.url = f"/api/v1/uploads/{upload.id}/download"
    db.add(upload)
    return upload


def install_provider_capture(monkeypatch) -> list[dict]:
    captured_payloads: list[dict] = []

    class DummyResponse:
        status_code = 200
        text = ""
        headers = {"x-request-id": "req-public-media"}

        def json(self) -> dict:
            return {
                "choices": [
                    {
                        "message": {
                            "content": '{"answers":{"intent":"payment","reason":"media ok"},"explanation":"ok","field_explanations":{},"image_annotations":[]}'
                        }
                    }
                ],
                "usage": {"total_tokens": 1},
            }

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
    return captured_payloads


def labeling_schema() -> dict:
    return {
        "schema_version": "1.1",
        "tabs": [
            {
                "id": "answer",
                "title": "标注答案",
                "components": [
                    {"id": "intent", "type": "SingleSelect", "field": "intent", "label": "条款类型", "required": True, "config": {}, "options": [{"value": "risk", "label": "风险条款"}, {"value": "payment", "label": "付款条款"}], "version": "1.0"},
                    {"id": "reason", "type": "TextArea", "field": "reason", "label": "判断理由", "required": False, "config": {}, "options": [], "version": "1.0"},
                    {"id": "ai_helper", "type": "LLMComponent", "field": "ai_helper", "label": "AI 标注建议", "required": False, "config": {"button_text": "生成建议", "prompt_hint": "结合原文判断条款类型。", "provider_id": "provider-1"}, "options": [], "version": "1.0"},
                ],
            }
        ],
        "components": [],
        "validation_rules": {},
        "linkage_rules": [],
        "llm_config": {},
    }


def seed_labeling_question() -> tuple[User, Question]:
    db = get_database()
    team = Team(company_name="Labeling AI Team", owner_user_id="owner-1")
    labeler = User(username="labelingai", email="labeling-ai@example.com", global_role="labeler", email_verified=True)
    task = Task(
        team_id=team.id,
        owner_id="owner-1",
        title="合同条款标注",
        description="判断条款风险",
        status="published",
        template_id="template-ai-labeling",
        template_version_id="template-ai-labeling:v1",
        claim_config={"labeling_ai_assist_percent": 100},
        stats={"total": 1, "claimed": 1},
    )
    version = TemplateVersion(
        template_id=task.template_id,
        team_id=team.id,
        version=1,
        schema=labeling_schema(),
        is_published=True,
    )
    question = Question(
        team_id=team.id,
        task_id=task.id,
        dataset_id="dataset-1",
        row_index=0,
        content={"show_title": "合同中包含高额违约金"},
        status="claimed",
        assigned_to=labeler.id,
    )
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id=labeler.id,
        template_id=task.template_id,
        template_version_id=task.template_version_id,
        status="draft",
    )
    for item in [team, labeler, task, version, question, submission]:
        db.add(item)
    db.commit()
    return labeler, question


def test_labeling_llm_assist_route_sends_uploaded_image_as_public_signed_url(monkeypatch) -> None:
    labeler, question = seed_labeling_question()
    db = get_database()
    task = db.get(Task, question.task_id)
    seed_public_url_provider(db, task.team_id)
    upload = seed_uploaded_image(db, task.team_id, labeler.id)
    question.content = {"show_image": upload.url}
    db.save(question)
    db.commit()
    monkeypatch.setattr(resource_service.settings, "public_api_base_url", "https://www.markuplabel.cn")
    captured_payloads = install_provider_capture(monkeypatch)

    response = client.post(f"/api/v1/labels/questions/{question.id}/llm-assist", headers=auth_headers(labeler), json={"component_id": "ai_helper"})

    assert response.status_code == 200
    image_part = next(part for part in captured_payloads[0]["messages"][0]["content"] if part["type"] == "image_url")
    image_url = image_part["image_url"]["url"]
    assert image_url.startswith(f"https://www.markuplabel.cn/api/v1/uploads/{upload.id}/playback?token=")
    assert not image_url.startswith("data:image/")
    log = db.find(AiCallLog, {"operation_type": "labeling_ai_assist"})[0]
    assert log.meta["debug"]["media_parts"][0]["transport_mode"] == "external_url"


def test_renderer_llm_assist_preview_sends_uploaded_image_as_public_signed_url(monkeypatch) -> None:
    db = get_database()
    team = Team(company_name="Preview Public Media Team", owner_user_id="owner-preview")
    owner = User(username="previewpublic", email="preview-public@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    seed_public_url_provider(db, team.id)
    upload = seed_uploaded_image(db, team.id, owner.id, filename="renderer-image.jpg")
    db.commit()
    monkeypatch.setattr(resource_service.settings, "public_api_base_url", "https://www.markuplabel.cn")
    captured_payloads = install_provider_capture(monkeypatch)

    response = client.post(
        "/api/v1/labels/llm-assist/preview",
        headers={**auth_headers(owner), "X-Team-ID": team.id},
        json={
            "schema": labeling_schema(),
            "content": {"show_image": upload.url},
            "answers": {},
            "component_id": "ai_helper",
        },
    )

    assert response.status_code == 200
    image_part = next(part for part in captured_payloads[0]["messages"][0]["content"] if part["type"] == "image_url")
    image_url = image_part["image_url"]["url"]
    assert image_url.startswith(f"https://www.markuplabel.cn/api/v1/uploads/{upload.id}/playback?token=")
    assert not image_url.startswith("data:image/")
    log = db.find(AiCallLog, {"operation_type": "labeling_ai_assist_preview"})[0]
    assert log.meta["debug"]["media_parts"][0]["transport_mode"] == "external_url"


def test_labeling_llm_assist_route_generates_structured_answer(monkeypatch) -> None:
    labeler, question = seed_labeling_question()
    captured: dict = {}

    def fake_generation(*args, **kwargs):
        captured.update(kwargs)
        return {
            "content": '{"answers":{"intent":"风险条款","reason":"违约金过高"},"explanation":"存在明显风险。","field_explanations":{"intent":"文本包含高额违约金。","reason":"需要人工核对金额比例。"},"image_annotations":[]}',
            "provider_id": "provider-1",
            "model": "model-a",
            "request_id": "req-1",
            "tokens": 42,
            "cost": 0.25,
        }

    monkeypatch.setattr(labels_service, "run_platform_provider_messages_generation", fake_generation)

    response = client.post(f"/api/v1/labels/questions/{question.id}/llm-assist", headers=auth_headers(labeler), json={"prompt": "偏保守", "component_id": "ai_helper"})

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["answers"] == {"intent": "risk", "reason": "违约金过高"}
    assert data["field_explanations"]["intent"] == "文本包含高额违约金。"
    assert data["assist_usage"]["used"] == 1
    assert captured["provider_id"] == "provider-1"
    assert captured["structured_output_schema"]["required"] == ["answers", "explanation", "field_explanations", "image_annotations"]
    db = get_database()
    audit_log = db.find_one(AuditLog, {"entity_type": "question", "entity_id": question.id, "action": "labeling_ai_assist_generated"})
    assert audit_log is not None
    changes = audit_log.changes or {}
    assert changes["agent_actor"] == "MarkUp Agent"
    assert changes["operation_type"] == "labeling_ai_assist"
    assert changes["answer_field_count"] == 2
    assert changes["provider_id"] == "provider-1"
    assert changes["model"] == "model-a"
    assert changes["request_id"] == "req-1"
    assert changes["tokens"] == 42
    assert changes["cost"] == 0.25


def test_labeling_llm_assist_preview_uses_schema_without_submission_or_usage(monkeypatch) -> None:
    db = get_database()
    team = Team(company_name="Preview AI Team", owner_user_id="owner-preview")
    owner = User(username="previewowner", email="preview-owner@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    db.commit()
    captured: dict = {}

    def fake_generation(*args, **kwargs):
        captured.update(kwargs)
        message_text = kwargs["messages"][0]["content"][0]["text"]
        assert "draft reason" in message_text
        return {
            "content": '{"answers":{"intent":"payment","reason":"draft reason"},"explanation":"preview ok","field_explanations":{"intent":"matched option","reason":"kept current draft"},"image_annotations":[]}',
            "provider_id": "provider-preview",
            "model": "model-preview",
            "request_id": "req-preview",
        }

    monkeypatch.setattr(labels_service, "run_platform_provider_messages_generation", fake_generation)

    response = client.post(
        "/api/v1/labels/llm-assist/preview",
        headers={**auth_headers(owner), "X-Team-ID": team.id},
        json={
            "schema": labeling_schema(),
            "content": {"show_title": "preview row"},
            "answers": {"reason": "draft reason"},
            "prompt": "use preview row",
            "component_id": "ai_helper",
        },
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["question_id"] == "renderer-preview"
    assert data["answers"] == {"intent": "payment", "reason": "draft reason"}
    assert data["assist_usage"] is None
    assert captured["operation_type"] == "labeling_ai_assist_preview"
    assert captured["provider_id"] == "provider-1"
    assert captured["charge_ai_resource"] is False
    assert captured["structured_output_schema"]["required"] == ["answers", "explanation", "field_explanations", "image_annotations"]
    logs = db.find(AuditLog, {"action": "labeling_ai_assist_generated"})
    assert logs == []


def test_labeling_llm_assist_requires_component_provider(monkeypatch) -> None:
    labeler, question = seed_labeling_question()
    db = get_database()
    task = db.get(Task, question.task_id)
    version = db.find_one(TemplateVersion, {"template_id": task.template_id})
    schema = labeling_schema()
    schema["tabs"][0]["components"][-1]["config"].pop("provider_id", None)
    version.schema = schema
    db.save(version)
    db.commit()
    called = False

    def fake_generation(*args, **kwargs):
        nonlocal called
        called = True
        return {"content": "{}"}

    monkeypatch.setattr(labels_service, "run_platform_provider_messages_generation", fake_generation)

    response = client.post(f"/api/v1/labels/questions/{question.id}/llm-assist", headers=auth_headers(labeler), json={"component_id": "ai_helper"})

    assert response.status_code == 422
    assert "Provider" in response.json()["message"]
    assert called is False


def test_legacy_ai_assist_alias_and_parse_failures_do_not_count_usage(monkeypatch) -> None:
    labeler, question = seed_labeling_question()

    def bad_generation(*args, **kwargs):
        return {"content": "not json"}

    monkeypatch.setattr(labels_service, "run_platform_provider_messages_generation", bad_generation)

    response = client.post(f"/api/v1/labels/questions/{question.id}/ai-assist", headers=auth_headers(labeler), json={})

    assert response.status_code == 502
    db = get_database()
    logs = db.find(AuditLog, {"entity_type": "question", "entity_id": question.id, "action": "labeling_ai_assist_generated"})
    assert logs == []
    allowance = labels_service.labeling_ai_assist_allowance(db, db.get(Task, question.task_id), labeler.id)
    assert allowance["used"] == 0


@pytest.mark.parametrize(
    "content",
    [
        '{"explanation":"missing answers","field_explanations":{},"image_annotations":[]}',
        '{"answers":{"intent":"risk"},"explanation":"bad image","field_explanations":{},"image_annotations":[{"source_id":"img-1","label":"bad","shape":"rect","x":1.2,"y":0.5,"width":0.2,"height":0.2}]}',
    ],
)
def test_labeling_ai_assist_rejects_invalid_structured_payload_without_counting_usage(monkeypatch, content: str) -> None:
    labeler, question = seed_labeling_question()

    def bad_generation(*args, **kwargs):
        return {"content": content}

    monkeypatch.setattr(labels_service, "run_platform_provider_messages_generation", bad_generation)

    response = client.post(f"/api/v1/labels/questions/{question.id}/llm-assist", headers=auth_headers(labeler), json={})

    assert response.status_code == 502
    db = get_database()
    logs = db.find(AuditLog, {"entity_type": "question", "entity_id": question.id, "action": "labeling_ai_assist_generated"})
    assert logs == []
    allowance = labels_service.labeling_ai_assist_allowance(db, db.get(Task, question.task_id), labeler.id)
    assert allowance["used"] == 0
