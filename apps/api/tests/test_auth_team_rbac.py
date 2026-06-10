import os
from datetime import datetime

os.environ.setdefault("SECRET_KEY", "test-secret-key-with-strong-length")
os.environ.setdefault("MONGODB_URL", "mongomock://localhost")
os.environ.setdefault("MONGODB_DATABASE", "markup_test")

from jose import jwt
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.database import get_database, reset_database
from app.core.security import generate_object_id
from app.domains.rbac import permissions_for_team_role
from app.models.audit import AuditLog
from app.models.auth import OAuthIdentity, RefreshSession
from app.models.ai_review import AiReviewJob
from app.models.export import ExportJob
from app.models.notification import Notification
from app.models.profile import PointsLedger, PointsWallet
from app.models.production import AnnotationTemplate, Dataset, Question, Submission, Task, TemplateVersion
from app.models.resource import AiProviderConfig, TeamPointsBudget, TeamPointsWalletLedger
from app.models.team import Team, TeamInvitation, TeamMember
from app.models.upload import UploadedFile
from app.models.user import User, UserProfile
from app.main import app
from app.services import auth_service
from app.services.labels_service import extract_question_media_assets
from app.services.notification_dispatcher import emit_notification
from app.services.production_service import get_task_bound_template_version


client = TestClient(app)
sent_codes: dict[str, str] = {}


def setup_module() -> None:
    reset_database()
    auth_service.send_email_verification_code = lambda email, code, purpose: sent_codes.__setitem__(email, code)


def send_code(email: str) -> str:
    response = client.post("/api/v1/auth/email/send-code", json={"email": email, "purpose": "register"})
    assert response.status_code == 200
    return sent_codes[email]


def send_code_for(email: str, purpose: str) -> str:
    response = client.post("/api/v1/auth/email/send-code", json={"email": email, "purpose": purpose})
    assert response.status_code == 200
    return sent_codes[email]


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


def team_auth_headers(user: User, team_id: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_session_bound_access_token(user.id, role=user.global_role)}", "X-Team-ID": team_id}


def test_team_dashboard_team_admin_reads_organization_summary() -> None:
    db = get_database()
    team = Team(company_name="Dashboard Admin Team", owner_user_id="dashboard-admin")
    admin = User(username="dashboardadmin", email="dashboard-admin@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(admin)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin"))
    task = Task(
        team_id=team.id,
        owner_id=admin.id,
        title="Dashboard Published Task",
        status="published",
        quota=5,
        stats={"total": 5, "claimed": 3, "submitted": 2, "approved": 1, "rejected": 1},
    )
    db.add(task)
    db.add(Submission(team_id=team.id, task_id=task.id, question_id="dashboard-question-1", labeler_id="labeler-a", status="submitted"))
    db.add(AiReviewJob(team_id=team.id, task_id=task.id, submission_id="dashboard-submission-1", question_id="dashboard-question-1", labeler_id="labeler-a", status="failed", idempotency_key="dashboard-ai-failed"))
    db.add(ExportJob(team_id=team.id, task_id=task.id, created_by=admin.id, status="completed", filename="dashboard.jsonl"))
    db.add(Notification(team_id=team.id, title="Dashboard Notice", content="请关注生产状态", notification_type="organization", target_type="team"))
    db.commit()

    response = client.get(f"/api/v1/teams/{team.id}/dashboard", headers=team_auth_headers(admin, team.id))

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["team"]["team_id"] == team.id
    assert data["viewer_role"] == "team_admin"
    assert data["production"]["tasks"]["published"] == 1
    assert data["production"]["questions"]["approved"] == 1
    assert data["review"]["pending"] == 1
    assert data["ai"]["jobs"]["failed"] == 1
    assert data["exports"]["completed"] == 1
    assert data["governance"]["notifications"][0]["title"] == "Dashboard Notice"
    assert {item["key"] for item in data["summary_cards"]} >= {"active_tasks", "review_pending", "ai_pending", "exports"}


def test_team_dashboard_rejects_path_and_header_team_mismatch() -> None:
    db = get_database()
    team_a = Team(company_name="Dashboard Scope Team A", owner_user_id="dashboard-scope")
    team_b = Team(company_name="Dashboard Scope Team B", owner_user_id="dashboard-scope")
    user = User(username="dashboardscope", email="dashboard-scope@example.com", global_role="user", email_verified=True)
    for item in [team_a, team_b, user]:
        db.add(item)
    db.add(TeamMember(team_id=team_a.id, user_id=user.id, team_role="team_admin"))
    db.add(TeamMember(team_id=team_b.id, user_id=user.id, team_role="team_admin"))
    db.commit()

    response = client.get(f"/api/v1/teams/{team_a.id}/dashboard", headers=team_auth_headers(user, team_b.id))

    assert response.status_code == 403


def test_team_dashboard_reviewer_is_scoped_to_assigned_team_tasks() -> None:
    db = get_database()
    team = Team(company_name="Dashboard Reviewer Team", owner_user_id="dashboard-review-owner")
    other_team = Team(company_name="Dashboard Reviewer Other Team", owner_user_id="dashboard-review-other")
    reviewer = User(username="dashboardreviewer", email="dashboard-reviewer@example.com", global_role="reviewer", email_verified=True)
    db.add(team)
    db.add(other_team)
    db.add(reviewer)
    db.add(TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer"))
    assigned = Task(team_id=team.id, owner_id="owner-a", title="Assigned Review Task", status="published", reviewer_ids=[reviewer.id], stats={"total": 2, "submitted": 1})
    unassigned = Task(team_id=team.id, owner_id="owner-a", title="Unassigned Review Task", status="published", reviewer_ids=[], stats={"total": 2, "submitted": 1})
    external = Task(team_id=other_team.id, owner_id="owner-b", title="External Review Task", status="published", reviewer_ids=[reviewer.id], stats={"total": 2, "submitted": 1})
    for item in [assigned, unassigned, external]:
        db.add(item)
    db.add(Submission(team_id=team.id, task_id=assigned.id, question_id="assigned-question", labeler_id="labeler-a", status="submitted"))
    db.add(Submission(team_id=team.id, task_id=unassigned.id, question_id="unassigned-question", labeler_id="labeler-b", status="submitted"))
    db.add(Submission(team_id=other_team.id, task_id=external.id, question_id="external-question", labeler_id="labeler-c", status="submitted"))
    db.commit()

    response = client.get(f"/api/v1/teams/{team.id}/dashboard", headers=team_auth_headers(reviewer, team.id))

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["viewer_role"] == "reviewer"
    assert data["review"]["pending"] == 1
    assert data["production"]["tasks"]["total"] == 1
    assert [item["title"] for item in data["production"]["recent_tasks"]] == ["Assigned Review Task"]
    assert data["exports"]["total"] == 0
    assert all(shortcut["target_page"] != "task-management" for shortcut in data["shortcuts"])


def test_team_dashboard_empty_team_returns_zero_metrics() -> None:
    db = get_database()
    team = Team(company_name="Dashboard Empty Team", owner_user_id="dashboard-empty-owner")
    owner = User(username="dashboardemptyowner", email="dashboard-empty-owner@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    db.commit()

    response = client.get(f"/api/v1/teams/{team.id}/dashboard", headers=team_auth_headers(owner, team.id))

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["production"]["tasks"]["total"] == 0
    assert data["production"]["questions"] == {"total": 0, "claimed": 0, "submitted": 0, "approved": 0, "rejected": 0}
    assert data["production"]["recent_tasks"] == []
    assert data["review"]["total_visible"] == 0
    assert data["ai"]["jobs"]["total"] == 0
    assert data["ai"]["recent_jobs"] == []
    assert data["exports"]["recent_exports"] == []


def test_team_labeler_dashboard_only_returns_current_company_projects() -> None:
    db = get_database()
    team = Team(company_name="Company Labeler Team", owner_user_id="company-labeler-owner")
    other_team = Team(company_name="Other Company Labeler Team", owner_user_id="other-company-labeler-owner")
    labeler = User(username="companylabeler", email="company-labeler@example.com", global_role="labeler", email_verified=True)
    for item in [team, other_team, labeler]:
        db.add(item)
    db.add(TeamMember(team_id=team.id, user_id=labeler.id, team_role="labeler"))
    db.add(TeamMember(team_id=other_team.id, user_id=labeler.id, team_role="labeler"))
    company_task = Task(team_id=team.id, owner_id="owner-a", title="公司项目 A", status="published", quota=2, stats={"total": 2, "claimed": 1, "submitted": 0, "approved": 0, "rejected": 0})
    external_task = Task(team_id=other_team.id, owner_id="owner-b", title="其他企业项目", status="published", quota=2, stats={"total": 2, "claimed": 1, "submitted": 0, "approved": 0, "rejected": 0})
    db.add(company_task)
    db.add(external_task)
    db.add(Question(team_id=team.id, task_id=company_task.id, row_index=0, content={"text": "A"}, status="claimed", assigned_to=labeler.id))
    db.add(Question(team_id=other_team.id, task_id=external_task.id, row_index=0, content={"text": "B"}, status="claimed", assigned_to=labeler.id))
    db.add(Notification(team_id=team.id, title="公司项目提醒", content="请处理项目", notification_type="task", target_type="member", target_user_ids=[labeler.id]))
    db.add(Notification(team_id=team.id, title="企业治理广播", content="Labeler 不应接收", notification_type="team", target_type="team"))
    db.commit()

    response = client.get(f"/api/v1/teams/{team.id}/labeler-dashboard", headers=team_auth_headers(labeler, team.id))

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["viewer_role"] == "team_labeler"
    assert data["team"]["team_id"] == team.id
    assert [item["task"]["title"] for item in data["recent_tasks"]] == ["公司项目 A"]
    assert data["labeling"]["total_tasks"] == 1
    assert data["labeling"]["pending_questions"] == 1
    assert [item["title"] for item in data["notifications"]] == ["公司项目提醒"]
    assert all(card["key"] != "points" for card in data["summary_cards"])


def test_team_labeler_dashboard_hides_soft_deleted_notifications() -> None:
    db = get_database()
    team = Team(company_name="Company Labeler Deleted Notice Team", owner_user_id="company-labeler-notice-owner")
    labeler = User(username="companydeletednotice", email="company-deleted-notice@example.com", global_role="labeler", email_verified=True)
    active_notice = Notification(
        team_id=team.id,
        title="Active task notice",
        content="Visible to the assigned labeler.",
        notification_type="task",
        target_type="member",
        target_user_ids=[labeler.id],
    )
    deleted_notice = Notification(
        team_id=team.id,
        title="Deleted task notice",
        content="Must stay hidden after enterprise deletion.",
        notification_type="task",
        target_type="member",
        target_user_ids=[labeler.id],
        deleted_at=datetime(2026, 6, 7, 10, 0, 0),
        deleted_by="owner-1",
    )
    for item in [team, labeler, TeamMember(team_id=team.id, user_id=labeler.id, team_role="labeler"), active_notice, deleted_notice]:
        db.add(item)
    db.commit()

    response = client.get(f"/api/v1/teams/{team.id}/labeler-dashboard", headers=team_auth_headers(labeler, team.id))

    assert response.status_code == 200
    assert [item["title"] for item in response.json()["data"]["notifications"]] == ["Active task notice"]


def test_team_labeler_dashboard_rejects_non_labeler_member() -> None:
    db = get_database()
    team = Team(company_name="Company Labeler Reject Team", owner_user_id="company-labeler-reject-owner")
    owner = User(username="companylabelerowner", email="company-labeler-owner@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    db.commit()

    response = client.get(f"/api/v1/teams/{team.id}/labeler-dashboard", headers=team_auth_headers(owner, team.id))

    assert response.status_code == 403


def test_personal_labeler_dashboard_returns_personal_growth_data_without_team_header() -> None:
    db = get_database()
    labeler = User(username="personallabeler", email="personal-labeler@example.com", global_role="labeler", email_verified=True)
    team = Team(company_name="Personal Marketplace Team", owner_user_id="personal-market-owner")
    db.add(labeler)
    db.add(team)
    task = Task(team_id=team.id, owner_id="owner-a", title="个人可接任务", status="published", quota=1, stats={"total": 1, "claimed": 1, "submitted": 1, "approved": 1, "rejected": 0}, reward_rule={"mode": "item", "points_per_item": 5})
    db.add(task)
    question = Question(team_id=team.id, task_id=task.id, row_index=1, content={"text": "A"}, status="approved", assigned_to=labeler.id)
    db.add(question)
    db.add(Submission(team_id=team.id, task_id=task.id, question_id=question.id, labeler_id=labeler.id, status="approved", task_submitted_at=datetime(2026, 6, 6, 9, 0, 0)))
    market_task = Task(team_id=team.id, owner_id="owner-a", title="个人推荐任务", status="published", quota=1, stats={"total": 1, "claimed": 0, "submitted": 0, "approved": 0, "rejected": 0}, reward_rule={"mode": "item", "points_per_item": 3, "priority": "recommended"})
    db.add(market_task)
    db.add(Question(team_id=team.id, task_id=market_task.id, row_index=0, content={"text": "B"}, status="pending", assigned_to=None))
    db.add(PointsWallet(user_id=labeler.id, total_points=30, available_points=20, level="bronze"))
    db.add(PointsLedger(user_id=labeler.id, change=5, reason="任务审核通过", source_type="submission_review", source_id="personal-submission", balance_after=20))
    db.commit()

    response = client.get("/api/v1/profile/dashboard", headers={"Authorization": f"Bearer {create_session_bound_access_token(labeler.id, role=labeler.global_role)}"})

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["viewer_role"] == "personal_labeler"
    assert any(card["key"] == "points" for card in data["summary_cards"])
    assert data["points"]["wallet"]["available_points"] == 25
    assert data["recent_records"][0]["task_title"] == "个人可接任务"
    assert data["recommended_tasks"][0]["title"] == "个人推荐任务"


def test_delete_published_template_requires_no_task_references() -> None:
    db = get_database()
    team = Team(company_name="Template Delete Team", owner_user_id="template-delete-owner")
    owner = User(username="templatedeleteowner", email="template-delete-owner@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    schema = {"schema_version": "1.0", "tabs": [{"id": "tab-1", "title": "默认", "components": []}], "components": []}
    deletable = AnnotationTemplate(team_id=team.id, owner_id=owner.id, name="未引用已发布模板", schema=schema, status="published")
    referenced = AnnotationTemplate(team_id=team.id, owner_id=owner.id, name="已引用已发布模板", schema=schema, status="published")
    db.add(deletable)
    db.add(referenced)
    db.add(TemplateVersion(template_id=deletable.id, team_id=team.id, version=1, schema=schema, is_published=True))
    db.add(TemplateVersion(template_id=referenced.id, team_id=team.id, version=1, schema=schema, is_published=True))
    db.add(Task(team_id=team.id, owner_id=owner.id, title="引用模板任务", template_id=referenced.id, template_version_id=f"{referenced.id}:v1"))
    db.commit()
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(owner.id, role=owner.global_role)}", "X-Team-ID": team.id}

    deleted = client.delete(f"/api/v1/templates/{deletable.id}", headers=headers)
    assert deleted.status_code == 200
    assert db.get(AnnotationTemplate, deletable.id) is None
    assert db.find_one(TemplateVersion, {"template_id": deletable.id}) is None

    blocked = client.delete(f"/api/v1/templates/{referenced.id}", headers=headers)
    assert blocked.status_code == 409
    assert blocked.json()["message"] == "模板已被任务引用，不能删除"


def test_template_payload_falls_back_to_latest_version_schema() -> None:
    db = get_database()
    team = Team(company_name="Template Version Fallback Team", owner_user_id="template-version-owner")
    owner = User(username="templateversionowner", email="template-version-owner@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    schema = {
        "schema_version": "1.0",
        "tabs": [
            {
                "id": "tab-main",
                "title": "商品标题清洗",
                "components": [
                    {"id": "show_title", "type": "ShowItem", "field": "title", "label": "原始标题"},
                    {"id": "keywords", "type": "TagSelect", "field": "keywords", "label": "关键词", "required": True},
                ],
            }
        ],
        "components": [],
    }
    template = AnnotationTemplate(team_id=team.id, owner_id=owner.id, name="商品标题清洗审核模板", schema={}, status="published")
    db.add(template)
    db.add(TemplateVersion(template_id=template.id, team_id=team.id, version=1, schema=schema, is_published=True))
    db.commit()
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(owner.id, role=owner.global_role)}", "X-Team-ID": team.id}

    response = client.get(f"/api/v1/templates/{template.id}", headers=headers)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["tab_count"] == 1
    assert data["show_item_count"] == 1
    assert data["schema"]["tabs"][0]["components"][1]["type"] == "TagSelect"

    readiness = client.get(f"/api/v1/templates/{template.id}/readiness", headers=headers)
    assert readiness.status_code == 200
    assert readiness.json()["data"]["summary"]["component_count"] == 2

    copied = client.post(f"/api/v1/templates/{template.id}/copy", headers=headers, json={"name": "商品标题清洗审核模板 副本"})
    assert copied.status_code == 200
    copied_data = copied.json()["data"]
    assert copied_data["schema"]["tabs"][0]["title"] == "商品标题清洗"
    assert copied_data["tab_count"] == 1


def test_template_readiness_accepts_all_designer_material_types() -> None:
    db = get_database()
    team = Team(company_name="Template Material Registry Team", owner_user_id="template-material-owner")
    owner = User(username="templatematerialowner", email="template-material-owner@example.com", global_role="user", email_verified=True)
    provider = AiProviderConfig(team_id=team.id, route_name="template-material-provider", provider_kind="openai", provider="openai", status="enabled")
    for item in [team, owner, provider]:
        db.add(item)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    components = [
        {"id": "show_context", "type": "ShowItem", "field": "show_context", "label": "原始文本", "required": False, "config": {"content_field": "text"}, "options": [], "version": "1.0"},
        {"id": "text_input", "type": "TextInput", "field": "text_input", "label": "单行输入", "required": False, "config": {}, "options": [], "version": "1.0"},
        {"id": "text_area", "type": "TextArea", "field": "text_area", "label": "多行文本", "required": False, "config": {}, "options": [], "version": "1.0"},
        {"id": "single_select", "type": "SingleSelect", "field": "single_select", "label": "单选", "required": False, "config": {}, "options": [{"value": "yes", "label": "是"}], "version": "1.0"},
        {"id": "multi_select", "type": "MultiSelect", "field": "multi_select", "label": "多选", "required": False, "config": {}, "options": [{"value": "a", "label": "A"}], "version": "1.0"},
        {"id": "tag_select", "type": "TagSelect", "field": "tag_select", "label": "标签选择", "required": False, "config": {}, "options": [{"value": "tag", "label": "标签"}], "version": "1.0"},
        {"id": "scale_score", "type": "Scale", "field": "scale_score", "label": "量表评分", "required": False, "config": {"min": 1, "max": 5, "step": 1}, "options": [], "version": "1.0"},
        {"id": "ranking_choices", "type": "Ranking", "field": "ranking_choices", "label": "排序题", "required": False, "config": {}, "options": [{"value": "a", "label": "A"}, {"value": "b", "label": "B"}], "version": "1.0"},
        {"id": "rich_editor", "type": "RichEditor", "field": "rich_editor", "label": "富文本", "required": False, "config": {}, "options": [], "version": "1.0"},
        {"id": "file_upload", "type": "FileUpload", "field": "file_upload", "label": "文件上传", "required": False, "config": {}, "options": [], "version": "1.0"},
        {"id": "image_upload", "type": "ImageUpload", "field": "image_upload", "label": "图片上传", "required": False, "config": {}, "options": [], "version": "1.0"},
        {"id": "image_mask", "type": "ImageMaskAnnotation", "field": "image_mask", "label": "图片 Mask", "required": False, "config": {}, "options": [], "version": "1.0"},
        {"id": "audio_upload", "type": "AudioUpload", "field": "audio_upload", "label": "音频上传", "required": False, "config": {}, "options": [], "version": "1.0"},
        {"id": "video_upload", "type": "VideoUpload", "field": "video_upload", "label": "视频上传", "required": False, "config": {}, "options": [], "version": "1.0"},
        {"id": "json_editor", "type": "JsonEditor", "field": "json_editor", "label": "JSON 编辑器", "required": False, "config": {}, "options": [], "version": "1.0"},
        {"id": "llm_helper", "type": "LLMComponent", "field": "llm_helper", "label": "LLM 辅助", "required": False, "config": {"provider_id": provider.id}, "options": [], "version": "1.0"},
        {"id": "group_container", "type": "GroupContainer", "field": "group_container", "label": "分组容器", "required": False, "config": {}, "options": [], "version": "1.0"},
    ]
    schema = {
        "schema_version": "1.1",
        "tabs": [{"id": "tab-all", "title": "全部物料", "components": components}],
        "components": [],
        "validation_rules": {},
        "linkage_rules": [],
        "llm_config": {},
    }
    template = AnnotationTemplate(team_id=team.id, owner_id=owner.id, name="全部物料模板", schema=schema, status="draft")
    db.add(template)
    db.commit()
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(owner.id, role=owner.global_role)}", "X-Team-ID": team.id}

    readiness = client.get(f"/api/v1/templates/{template.id}/readiness", headers=headers)
    assert readiness.status_code == 200
    data = readiness.json()["data"]
    assert data["ready"] is True
    assert data["summary"]["component_count"] == len(components)
    assert data["summary"]["answer_field_count"] == len(components) - 3
    component_type_check = next(item for item in data["checks"] if item["key"] == "component_types")
    assert component_type_check["status"] == "pass"

    published = client.post(f"/api/v1/templates/{template.id}/publish", headers=headers)
    assert published.status_code == 200
    assert published.json()["data"]["status"] == "published"


def test_template_schema_versioning_and_runtime_rules_are_stable_after_task_publish() -> None:
    db = get_database()
    team = Team(company_name="Template Runtime Rules Team", owner_user_id="template-runtime-owner")
    owner = User(username="templateruntimeowner", email="template-runtime-owner@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    schema_v1 = {
        "schema_version": "1.0",
        "tabs": [
            {
                "id": "tab-main",
                "title": "默认",
                "components": [
                    {"id": "status", "type": "SingleSelect", "field": "status", "label": "状态", "required": True, "config": {}, "options": [{"value": "need", "label": "需要"}, {"value": "skip", "label": "跳过"}], "version": "1.0"},
                    {"id": "risk", "type": "SingleSelect", "field": "risk", "label": "风险", "required": False, "config": {}, "options": [{"value": "high", "label": "高"}, {"value": "low", "label": "低"}], "version": "1.0"},
                    {"id": "reason", "type": "TextInput", "field": "reason", "label": "理由", "required": True, "config": {}, "options": [], "version": "1.0"},
                ],
            }
        ],
        "components": [],
        "validation_rules": {"reason": [{"type": "min_length", "value": 4}]},
        "linkage_rules": [
            {
                "target_component_id": "reason",
                "action": "show",
                "condition_mode": "all",
                "conditions": [
                    {"source_field": "status", "operator": "equals", "value": "need"},
                    {"source_field": "risk", "operator": "equals", "value": "high"},
                ],
            }
        ],
        "llm_config": {},
    }
    template = AnnotationTemplate(team_id=team.id, owner_id=owner.id, name="运行规则模板", schema=schema_v1, status="published")
    dataset = Dataset(team_id=team.id, owner_id=owner.id, name="运行规则数据", source_format="json", columns=[{"name": "title", "data_type": "text"}], rows=[{"title": "A"}], preview_rows=[{"title": "A"}], row_count=1)
    db.add(template)
    db.add(TemplateVersion(template_id=template.id, team_id=team.id, version=1, schema=schema_v1, is_published=True))
    db.add(dataset)
    task = Task(team_id=team.id, owner_id=owner.id, title="绑定旧版本任务", description="验证模板版本稳定", status="published", template_id=template.id, template_version_id=f"{template.id}:v1", dataset_id=dataset.id)
    question = Question(team_id=team.id, task_id=task.id, dataset_id=dataset.id, row_index=0, content={"title": "A"}, status="claimed", assigned_to=owner.id)
    db.add(task)
    db.add(question)
    db.commit()
    headers = team_auth_headers(owner, team.id)

    validation_hidden = client.post("/api/v1/templates/validate", headers=headers, json={"schema": schema_v1, "answers": {"status": "skip", "risk": "high"}, "content": {}})
    assert validation_hidden.status_code == 200
    assert validation_hidden.json()["data"]["valid"] is True
    assert validation_hidden.json()["data"]["summary"]["hidden_component_count"] >= 1
    assert validation_hidden.json()["data"]["summary"]["schema_version"] == "1.1"

    validation_visible = client.post("/api/v1/templates/validate", headers=headers, json={"schema": schema_v1, "answers": {"status": "need", "risk": "high", "reason": "短"}, "content": {}})
    assert validation_visible.status_code == 200
    assert validation_visible.json()["data"]["valid"] is False
    assert validation_visible.json()["data"]["field_errors"][0]["rule"] == "min_length"

    schema_label_alias = {
        **schema_v1,
        "tabs": [
            {
                "id": "tab-main",
                "title": "Default",
                "components": [
                    {"id": "result", "type": "SingleSelect", "field": "result", "label": "Result", "required": True, "config": {}, "options": [{"value": "option_1", "label": "Pass"}, {"value": "option_2", "label": "Reject"}], "version": "1.0"},
                    {"id": "reject_reason", "type": "TextInput", "field": "reject_reason", "label": "Reject reason", "required": True, "config": {}, "options": [], "version": "1.0"},
                ],
            }
        ],
        "validation_rules": {},
        "linkage_rules": [{"source_field": "result", "operator": "equals", "value": "Reject", "target_component_id": "reject_reason", "action": "show"}],
    }
    validation_label_alias = client.post("/api/v1/templates/validate", headers=headers, json={"schema": schema_label_alias, "answers": {"result": "option_2"}, "content": {}})
    assert validation_label_alias.status_code == 200
    assert validation_label_alias.json()["data"]["valid"] is False
    assert validation_label_alias.json()["data"]["summary"]["hidden_component_count"] == 0

    updated = client.put(
        f"/api/v1/templates/{template.id}",
        headers=headers,
        json={
            "name": "运行规则模板新版",
            "schema": {
                **schema_v1,
                "tabs": [
                    {
                        **schema_v1["tabs"][0],
                        "components": [
                            *schema_v1["tabs"][0]["components"],
                            {"id": "new_field", "type": "TextInput", "field": "new_field", "label": "新版字段", "required": True, "config": {}, "options": [], "version": "1.0"},
                        ],
                    }
                ],
            },
        },
    )
    assert updated.status_code == 200
    assert updated.json()["data"]["latest_version"] == 2
    assert updated.json()["data"]["schema"]["schema_version"] == "1.1"

    bound_version = get_task_bound_template_version(db, task)
    assert bound_version is not None
    assert task.template_version_id == f"{template.id}:v1"
    bound_components = bound_version.schema["tabs"][0]["components"]
    assert all(component["id"] != "new_field" for component in bound_components)


def test_personal_inbox_team_broadcast_is_team_scoped_and_excludes_labeler() -> None:
    db = get_database()
    team_a = Team(company_name="Inbox Isolation Team A", owner_user_id="inbox-owner-a")
    team_b = Team(company_name="Inbox Isolation Team B", owner_user_id="inbox-owner-b")
    owner_a = User(username="inboxownera", email="inbox-owner-a@example.com", global_role="user", email_verified=True)
    reviewer_a = User(username="inboxreviewera", email="inbox-reviewer-a@example.com", global_role="reviewer", email_verified=True)
    labeler_a = User(username="inboxlabelera", email="inbox-labeler-a@example.com", global_role="labeler", email_verified=True)
    owner_b = User(username="inboxownerb", email="inbox-owner-b@example.com", global_role="user", email_verified=True)
    for item in [team_a, team_b, owner_a, reviewer_a, labeler_a, owner_b]:
        db.add(item)
    db.add(TeamMember(team_id=team_a.id, user_id=owner_a.id, team_role="owner"))
    db.add(TeamMember(team_id=team_a.id, user_id=reviewer_a.id, team_role="reviewer"))
    db.add(TeamMember(team_id=team_a.id, user_id=labeler_a.id, team_role="labeler"))
    db.add(TeamMember(team_id=team_b.id, user_id=owner_b.id, team_role="owner"))
    notification = Notification(
        team_id=team_a.id,
        title="企业广播",
        content="仅企业侧成员可见",
        notification_type="team",
        target_type="team",
        sender_id=owner_a.id,
        sender_name=owner_a.username,
    )
    db.add(notification)
    db.commit()

    owner_response = client.get("/api/v1/notifications/my", headers={"Authorization": f"Bearer {create_session_bound_access_token(owner_a.id, role=owner_a.global_role)}"})
    reviewer_response = client.get("/api/v1/notifications/my", headers={"Authorization": f"Bearer {create_session_bound_access_token(reviewer_a.id, role=reviewer_a.global_role)}"})
    labeler_response = client.get("/api/v1/notifications/my", headers={"Authorization": f"Bearer {create_session_bound_access_token(labeler_a.id, role=labeler_a.global_role)}"})
    team_b_response = client.get("/api/v1/notifications/my", headers={"Authorization": f"Bearer {create_session_bound_access_token(owner_b.id, role=owner_b.global_role)}"})

    assert owner_response.status_code == 200
    assert reviewer_response.status_code == 200
    assert owner_response.json()["data"]["items"][0]["notification_type"] == "organization"
    assert owner_response.json()["data"]["items"][0]["source_team_name"] == team_a.company_name
    assert reviewer_response.json()["data"]["pagination"]["total"] == 1
    assert labeler_response.json()["data"]["pagination"]["total"] == 0
    assert team_b_response.json()["data"]["pagination"]["total"] == 0


def test_personal_inbox_rejects_cross_team_target_user_id_and_batch_state() -> None:
    db = get_database()
    team_a = Team(company_name="Inbox Explicit Target Team A", owner_user_id="explicit-owner-a")
    team_b = Team(company_name="Inbox Explicit Target Team B", owner_user_id="explicit-owner-b")
    owner_a = User(username="explicitownera", email="explicit-owner-a@example.com", global_role="user", email_verified=True)
    external_user = User(username="explicitexternal", email="explicit-external@example.com", global_role="labeler", email_verified=True)
    for item in [team_a, team_b, owner_a, external_user]:
        db.add(item)
    db.add(TeamMember(team_id=team_a.id, user_id=owner_a.id, team_role="owner"))
    db.add(TeamMember(team_id=team_b.id, user_id=external_user.id, team_role="owner"))
    notification = Notification(
        team_id=team_a.id,
        title="错误指定外企业成员",
        content="不能因为 target_user_ids 包含用户就跨企业可见",
        notification_type="security",
        target_type="member",
        target_user_ids=[external_user.id],
        sender_id=owner_a.id,
        sender_name=owner_a.username,
    )
    visible_notification = Notification(
        team_id=team_b.id,
        title="本企业安全提醒",
        content="允许当前用户处理",
        notification_type="security",
        target_type="member",
        target_user_ids=[external_user.id],
        sender_id=owner_a.id,
        sender_name=owner_a.username,
    )
    db.add(notification)
    db.add(visible_notification)
    db.commit()
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(external_user.id, role=external_user.global_role)}"}

    listed = client.get("/api/v1/notifications/my", headers=headers)
    assert listed.status_code == 200
    assert [item["notification_id"] for item in listed.json()["data"]["items"]] == [visible_notification.id]

    blocked = client.post(f"/api/v1/notifications/my/{notification.id}/state", headers=headers, json={"action": "star"})
    assert blocked.status_code == 404

    batch = client.post(
        "/api/v1/notifications/my/batch-state",
        headers=headers,
        json={"notification_ids": [notification.id, visible_notification.id], "action": "star"},
    )
    assert batch.status_code == 200
    assert batch.json()["data"]["updated_count"] == 1
    assert batch.json()["data"]["skipped_count"] == 1
    assert external_user.id not in db.get(Notification, notification.id).starred_by
    assert external_user.id in db.get(Notification, visible_notification.id).starred_by
    assert db.collection("audit_logs").count_documents({"entity_type": "notification", "action": "notification_starred_batch", "team_id": team_b.id}) == 1

    deleted = client.post(f"/api/v1/notifications/my/{visible_notification.id}/state", headers=headers, json={"action": "delete"})
    assert deleted.status_code == 200
    assert deleted.json()["data"]["is_deleted"] is True
    assert external_user.id in db.get(Notification, visible_notification.id).deleted_for
    assert db.collection("audit_logs").count_documents({"entity_type": "notification", "entity_id": visible_notification.id, "action": "notification_deleted_for_user", "team_id": team_b.id}) == 1
    after_delete = client.get("/api/v1/notifications/my", headers=headers)
    assert after_delete.json()["data"]["pagination"]["total"] == 0


def test_personal_inbox_read_unread_handled_unhandled_and_mark_all_scope() -> None:
    db = get_database()
    team = Team(company_name="Inbox State Team", owner_user_id="state-owner")
    owner = User(username="inboxstateowner", email="inbox-state-owner@example.com", global_role="user", email_verified=True)
    labeler = User(username="inboxstatelabeler", email="inbox-state-labeler@example.com", global_role="labeler", email_verified=True)
    for item in [team, owner, labeler]:
        db.add(item)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    db.add(TeamMember(team_id=team.id, user_id=labeler.id, team_role="labeler"))
    visible = Notification(team_id=team.id, title="任务提醒", content="请处理任务", notification_type="task", target_type="member", target_user_ids=[labeler.id])
    organization = Notification(team_id=team.id, title="企业通知", content="普通标注员不收", notification_type="organization", target_type="team")
    db.add(visible)
    db.add(organization)
    db.commit()
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(labeler.id, role=labeler.global_role)}"}

    handled = client.post(f"/api/v1/notifications/my/{visible.id}/state", headers=headers, json={"action": "handled"})
    assert handled.status_code == 200
    assert handled.json()["data"]["is_read"] is True
    assert handled.json()["data"]["is_handled"] is True
    assert labeler.id in db.get(Notification, visible.id).read_by
    assert labeler.id in db.get(Notification, visible.id).handled_by

    unread = client.post(f"/api/v1/notifications/my/{visible.id}/state", headers=headers, json={"action": "unread"})
    assert unread.status_code == 200
    assert unread.json()["data"]["is_read"] is False
    assert labeler.id not in db.get(Notification, visible.id).read_by

    unhandled = client.post(f"/api/v1/notifications/my/{visible.id}/state", headers=headers, json={"action": "unhandled"})
    assert unhandled.status_code == 200
    assert labeler.id not in db.get(Notification, visible.id).handled_by

    marked = client.post("/api/v1/notifications/my/mark-all-read", headers=headers)
    assert marked.status_code == 200
    assert marked.json()["data"]["updated"] == 1
    assert labeler.id in db.get(Notification, visible.id).read_by
    assert labeler.id not in db.get(Notification, organization.id).read_by
    assert db.collection("audit_logs").count_documents({"entity_type": "notification", "team_id": team.id, "action": "notification_mark_all_read"}) == 1


def test_notification_dispatcher_is_idempotent_and_exposes_action_context() -> None:
    db = get_database()
    team = Team(company_name="Dispatcher Context Team", owner_user_id="dispatcher-owner")
    owner = User(username="dispatcherowner", email="dispatcher-owner@example.com", global_role="user", email_verified=True)
    labeler = User(username="dispatcherlabeler", email="dispatcher-labeler@example.com", global_role="labeler", email_verified=True)
    for item in [team, owner, labeler]:
        db.add(item)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    db.add(TeamMember(team_id=team.id, user_id=labeler.id, team_role="labeler"))
    db.commit()

    first = emit_notification(
        db,
        event_key=f"task:{team.id}:published:operators",
        team_id=team.id,
        notification_type="task",
        title="任务已发布",
        content="任务状态已同步",
        target_type="role",
        target_roles=["owner"],
        related_entity_type="task",
        related_entity_id="dispatcher-task",
        action_url="/workspace?page=task-management&task_id=dispatcher-task",
        metadata={"status": "published", "count": 3},
        actor_id=owner.id,
        request=None,
    )
    duplicate = emit_notification(
        db,
        event_key=f"task:{team.id}:published:operators",
        team_id=team.id,
        notification_type="task",
        title="任务已发布",
        content="重复状态不应重复发信",
        target_type="role",
        target_roles=["owner"],
        actor_id=owner.id,
        request=None,
    )
    db.commit()

    assert first["emitted"] is True
    assert duplicate["reason"] == "duplicate"
    assert db.collection("notifications").count_documents({"team_id": team.id, "event_key": f"task:{team.id}:published:operators"}) == 1

    headers = {"Authorization": f"Bearer {create_session_bound_access_token(owner.id, role=owner.global_role)}"}
    listed = client.get("/api/v1/notifications/my", headers=headers)

    assert listed.status_code == 200
    item = listed.json()["data"]["items"][0]
    assert item["event_key"] == f"task:{team.id}:published:operators"
    assert item["action_url"] == "/workspace?page=task-management&task_id=dispatcher-task"
    assert item["metadata"]["status"] == "published"
    assert "task" in {option["key"] for option in listed.json()["data"]["type_options"]}


def test_labeler_claim_task_bundle_does_not_emit_confirmation_notification() -> None:
    db = get_database()
    team = Team(company_name="Claim Notification Team", owner_user_id="claim-notice-owner")
    owner = User(username="claimnoticeowner", email="claim-notice-owner@example.com", global_role="user", email_verified=True)
    labeler = User(username="claimnoticelabeler", email="claim-notice-labeler@example.com", global_role="labeler", email_verified=True)
    for item in [team, owner, labeler]:
        db.add(item)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    db.add(TeamMember(team_id=team.id, user_id=labeler.id, team_role="labeler"))
    task = Task(
        team_id=team.id,
        owner_id=owner.id,
        title="领取通知任务",
        status="published",
        distribution="quota_grab",
        reward_rule={"points_per_item": 2},
        claim_config={"completion_hours": 4},
        stats={"total": 1, "claimed": 0, "submitted": 0, "approved": 0, "rejected": 0},
    )
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "待领取"}, status="pending")
    db.add(task)
    db.add(question)
    db.commit()
    headers = team_auth_headers(labeler, team.id)

    claimed = client.post(f"/api/v1/labels/tasks/{task.id}/claim", headers=headers, json={"bundle_size": 1})

    assert claimed.status_code == 200
    bundle_id = claimed.json()["data"]["bundle_id"]
    notification = db.find_one(Notification, {"team_id": team.id, "event_key": f"task:{task.id}:bundle:{bundle_id}:claimed"})
    assert notification is None

    listed = client.get("/api/v1/notifications/my", headers={"Authorization": f"Bearer {create_session_bound_access_token(labeler.id, role=labeler.global_role)}"})
    assert listed.status_code == 200
    assert listed.json()["data"]["pagination"]["total"] == 0


def test_export_filters_by_date_range_and_includes_answers() -> None:
    db = get_database()
    team = Team(company_name="Export Filter Team", owner_user_id="export-owner")
    owner = User(username="exportowner", email="exportowner@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    task = Task(team_id=team.id, owner_id=owner.id, title="日期导出任务", status="finished", stats={"approved": 2})
    recent_question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "近期题目"}, status="approved", assigned_to="labeler-recent")
    old_question = Question(team_id=team.id, task_id=task.id, row_index=1, content={"text": "旧题目"}, status="approved", assigned_to="labeler-old")
    recent_submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=recent_question.id,
        labeler_id="labeler-recent",
        answers={"label": "近期答案"},
        status="approved",
        submitted_at=datetime(2026, 5, 28, 10, 0, 0),
        updated_at=datetime(2026, 5, 29, 9, 0, 0),
    )
    old_submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=old_question.id,
        labeler_id="labeler-old",
        answers={"label": "旧答案"},
        status="approved",
        submitted_at=datetime(2026, 5, 19, 10, 0, 0),
        updated_at=datetime(2026, 5, 20, 9, 0, 0),
    )
    for item in [task, recent_question, old_question, recent_submission, old_submission]:
        db.add(item)
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(owner.id, role=owner.global_role)}", "X-Team-ID": team.id}

    created = client.post(
        "/api/v1/exports",
        headers=headers,
        json={
            "task_id": task.id,
            "format": "csv",
            "filters": {"status": "approved", "start_date": "2026-05-28", "end_date": "2026-05-29"},
            "include_review_records": True,
        },
    )
    assert created.status_code == 200
    assert created.json()["data"]["filters"]["start_date"] == "2026-05-28"
    downloaded = client.get(f"/api/v1/exports/{created.json()['data']['export_id']}/download", headers=headers)
    assert downloaded.status_code == 200
    assert "answers.label" in downloaded.text
    assert "近期答案" in downloaded.text
    assert "旧答案" not in downloaded.text


def test_reviewer_cannot_create_or_download_task_result_exports() -> None:
    db = get_database()
    team = Team(company_name="Export Permission Team", owner_user_id="export-permission-owner")
    owner = User(username="exportpermissionowner", email="export-permission-owner@example.com", global_role="user", email_verified=True)
    reviewer = User(username="exportpermissionreviewer", email="export-permission-reviewer@example.com", global_role="reviewer", email_verified=True)
    db.add(team)
    db.add(owner)
    db.add(reviewer)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    db.add(TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer"))
    task = Task(team_id=team.id, owner_id=owner.id, title="Restricted result export", status="finished", stats={"approved": 1})
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "Sensitive source"}, status="approved", assigned_to="labeler-export")
    submission = Submission(team_id=team.id, task_id=task.id, question_id=question.id, labeler_id="labeler-export", answers={"label": "sensitive-answer"}, status="approved")
    for item in [task, question, submission]:
        db.add(item)
    owner_headers = {"Authorization": f"Bearer {create_session_bound_access_token(owner.id, role=owner.global_role)}", "X-Team-ID": team.id}
    reviewer_headers = {"Authorization": f"Bearer {create_session_bound_access_token(reviewer.id, role=reviewer.global_role)}", "X-Team-ID": team.id}

    created = client.post("/api/v1/exports", headers=owner_headers, json={"task_id": task.id, "format": "jsonl"})
    assert created.status_code == 200
    export_id = created.json()["data"]["export_id"]

    blocked_create = client.post("/api/v1/exports", headers=reviewer_headers, json={"task_id": task.id, "format": "jsonl"})
    assert blocked_create.status_code == 403

    blocked_download = client.get(f"/api/v1/exports/{export_id}/download", headers=reviewer_headers)
    assert blocked_download.status_code == 403
    persisted_export = db.collection("export_jobs").find_one({"_id": export_id})
    assert persisted_export is not None
    assert persisted_export["download_count"] == 0
    assert db.collection("export_jobs").count_documents({"team_id": team.id}) == 1


def test_review_batch_history_diff_and_stats() -> None:
    db = get_database()
    team = Team(company_name="Review Batch Team", owner_user_id="review-admin")
    reviewer = User(username="reviewbatch", email="reviewbatch@example.com", global_role="reviewer", email_verified=True)
    db.add(team)
    db.add(reviewer)
    db.add(TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer", assigned_review_tasks=["batch-task"]))
    db.add(TeamPointsBudget(team_id=team.id, total_points=100, current_balance=100, spent_points_total=0))
    task = Task(team_id=team.id, owner_id="owner", title="批量审核任务", status="published", reviewer_ids=[reviewer.id], reward_rule={"mode": "item", "points_per_item": 7}, stats={})
    question_a = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="submitted")
    question_b = Question(team_id=team.id, task_id=task.id, row_index=1, content={"text": "B"}, status="submitted")
    submission_a = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question_a.id,
        labeler_id="labeler-a",
        answers={"intent": "risk"},
        draft={"intent": "safe"},
        status="submitted",
    )
    submission_b = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question_b.id,
        labeler_id="labeler-b",
        answers={"intent": "safe"},
        draft={"intent": "safe"},
        status="submitted",
    )
    for item in [task, question_a, question_b, submission_a, submission_b]:
        db.add(item)
    token = create_session_bound_access_token(reviewer.id, role=reviewer.global_role)
    headers = {"Authorization": f"Bearer {token}", "X-Team-ID": team.id}

    stats_before = client.get("/api/v1/reviews/stats", headers=headers)
    assert stats_before.status_code == 200
    assert stats_before.json()["data"]["pending"] == 2

    diff = client.get(f"/api/v1/reviews/submissions/{submission_a.id}/diff", headers=headers)
    assert diff.status_code == 200
    assert diff.json()["data"]["summary"]["changed"] == 1
    assert diff.json()["data"]["items"][0]["field"] == "intent"

    batch = client.post(
        "/api/v1/reviews/submissions/batch",
        headers=headers,
        json={"submission_ids": [submission_a.id, submission_b.id, "missing-submission"], "decision": "approved", "comment": "批量通过"},
    )
    assert batch.status_code == 200
    assert batch.json()["data"]["success_count"] == 2
    assert batch.json()["data"]["failed_count"] == 1
    assert db.get(Task, task.id).stats["approved"] == 2
    assert db.find_one(PointsWallet, {"user_id": "labeler-a"}).available_points == 7
    assert db.find_one(PointsWallet, {"user_id": "labeler-b"}).available_points == 7
    assert db.find_one(PointsLedger, {"user_id": "labeler-a", "source_type": "submission_review", "source_id": submission_a.id})
    team_wallet = db.find_one(TeamPointsBudget, {"team_id": team.id})
    assert team_wallet is not None
    assert team_wallet.current_balance == 84
    assert team_wallet.spent_points_total == 14
    team_wallet_ledger = db.find_one(TeamPointsWalletLedger, {"team_id": team.id, "source_type": "submission_review", "source_id": submission_a.id})
    assert team_wallet_ledger is not None
    assert team_wallet_ledger.transaction_type == "reward_spend"
    assert team_wallet_ledger.amount == 7
    service_fee_ledgers = db.find(TeamPointsWalletLedger, {"team_id": team.id, "transaction_type": "platform_service_fee"})
    assert len(service_fee_ledgers) == 2
    assert sum(item.amount for item in service_fee_ledgers) == 2

    history = client.get(f"/api/v1/reviews/submissions/{submission_a.id}/history", headers=headers)
    assert history.status_code == 200
    assert history.json()["data"]["summary"]["total"] == 1
    assert history.json()["data"]["items"][0]["decision"] == "approved"

    stats_after = client.get("/api/v1/reviews/stats", headers=headers)
    assert stats_after.status_code == 200
    assert stats_after.json()["data"]["pending"] == 0
    assert stats_after.json()["data"]["approved"] == 2


def test_team_points_budget_recharge_and_alerts() -> None:
    db = get_database()
    team = Team(company_name="Points Budget Team", owner_user_id="points-owner")
    owner = User(username="pointsowner", email="pointsowner@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="team_admin"))
    db.add(
        Task(
            team_id=team.id,
            owner_id=owner.id,
            title="积分奖励任务",
            status="published",
            quota=10,
            reward_rule={"mode": "item", "points_per_item": 5},
            stats={"total": 10, "approved": 3},
        )
    )
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(owner.id, role=owner.global_role)}", "X-Team-ID": team.id}

    initial = client.get(f"/api/v1/teams/{team.id}/points-budget", headers=headers)
    assert initial.status_code == 200
    assert initial.json()["data"]["balance_points"] == 0
    assert initial.json()["data"]["reserved_points"] == 60
    assert initial.json()["data"]["spent_points"] == 0

    recharged = client.post(
        f"/api/v1/teams/{team.id}/points-budget/recharge",
        headers=headers,
        json={"amount": 100, "payment_method": "wechat"},
    )
    assert recharged.status_code == 200
    assert recharged.json()["data"]["balance_points"] == 100
    assert recharged.json()["data"]["available_points"] == 40
    assert recharged.json()["data"]["spent_points"] == 0

    alert_updated = client.post(
        f"/api/v1/teams/{team.id}/points-budget/alerts",
        headers=headers,
        json={"enabled": True, "threshold": 75},
    )
    assert alert_updated.status_code == 200
    assert alert_updated.json()["data"]["alert_enabled"] is True
    assert alert_updated.json()["data"]["alert_threshold"] == 75

    persisted = db.find_one(TeamPointsBudget, {"team_id": team.id})
    assert persisted is not None
    assert persisted.total_points == 100
    assert persisted.current_balance == 100
    assert persisted.spent_points_total == 0
    assert persisted.alert_enabled is True
    assert persisted.alert_threshold == 75

    audit_logs = client.get(f"/api/v1/audit-logs?entity_type=points_budget&entity_id={team.id}", headers=headers)
    assert audit_logs.status_code == 200
    audit_actions = {item["action"] for item in audit_logs.json()["data"]["items"]}
    assert {"points_budget_recharged", "points_budget_alert_updated"}.issubset(audit_actions)


def test_team_points_budget_only_reserves_published_tasks() -> None:
    db = get_database()
    team = Team(company_name="Published Reserve Team", owner_user_id="published-owner")
    owner = User(username="publishedowner", email="publishedowner@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="team_admin"))
    db.add(
        Task(
            team_id=team.id,
            owner_id=owner.id,
            title="已发布任务",
            status="published",
            quota=4,
            reward_rule={"mode": "item", "points_per_item": 6},
            stats={"total": 4, "approved": 0},
        )
    )
    db.add(
        Task(
            team_id=team.id,
            owner_id=owner.id,
            title="草稿任务",
            status="draft",
            quota=100,
            reward_rule={"mode": "item", "points_per_item": 9},
            stats={"total": 100, "approved": 0},
        )
    )
    db.add(
        Task(
            team_id=team.id,
            owner_id=owner.id,
            title="待审核任务",
            status="pending_review",
            quota=50,
            reward_rule={"mode": "item", "points_per_item": 8},
            stats={"total": 50, "approved": 0},
        )
    )
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(owner.id, role=owner.global_role)}", "X-Team-ID": team.id}

    wallet = client.get(f"/api/v1/teams/{team.id}/points-budget", headers=headers)
    assert wallet.status_code == 200
    assert wallet.json()["data"]["reserved_points"] == 28
    assert wallet.json()["data"]["available_points"] == 0


def test_personal_inbox_filters_visible_notifications_and_updates_state() -> None:
    db = get_database()
    team = Team(company_name="Personal Inbox Team", owner_user_id="inbox-owner")
    other_team = Team(company_name="Other Inbox Team", owner_user_id="other-owner")
    reviewer = User(username="inboxreviewer", email="inboxreviewer@example.com", global_role="reviewer", email_verified=True)
    labeler = User(username="inboxlabeler", email="inboxlabeler@example.com", global_role="labeler", email_verified=True)
    outsider = User(username="inboxoutsider", email="inboxoutsider@example.com", global_role="labeler", email_verified=True)
    for item in [team, other_team, reviewer, labeler, outsider]:
        db.add(item)
    db.add(TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer"))
    db.add(TeamMember(team_id=team.id, user_id=labeler.id, team_role="labeler"))
    db.add(TeamMember(team_id=other_team.id, user_id=outsider.id, team_role="labeler"))
    team_notice = Notification(team_id=team.id, title="全企业通知", content="所有成员可见", notification_type="team", target_type="team")
    role_notice = Notification(team_id=team.id, title="审核提醒", content="审核员可见", notification_type="review", target_type="role", target_roles=["reviewer"])
    member_notice = Notification(team_id=team.id, title="指定成员提醒", content="指定标注员可见", notification_type="system", target_type="member", target_user_ids=[labeler.id])
    hidden_notice = Notification(team_id=team.id, title="隐藏 Owner 通知", content="审核员不可见", notification_type="team", target_type="role", target_roles=["owner"])
    other_team_notice = Notification(team_id=other_team.id, title="其他企业通知", content="不应跨企业可见", notification_type="team", target_type="team")
    for item in [team_notice, role_notice, member_notice, hidden_notice, other_team_notice]:
        db.add(item)

    reviewer_headers = {"Authorization": f"Bearer {create_session_bound_access_token(reviewer.id, role=reviewer.global_role)}"}
    reviewer_list = client.get("/api/v1/notifications/my", headers=reviewer_headers)
    assert reviewer_list.status_code == 200
    reviewer_titles = {item["title"] for item in reviewer_list.json()["data"]["items"]}
    assert reviewer_titles == {"全企业通知", "审核提醒"}
    assert reviewer_list.json()["data"]["summary"]["unread"] == 2
    assert all(item["source_team_name"] == "Personal Inbox Team" for item in reviewer_list.json()["data"]["items"])

    labeler_headers = {"Authorization": f"Bearer {create_session_bound_access_token(labeler.id, role=labeler.global_role)}"}
    labeler_list = client.get("/api/v1/notifications/my", headers=labeler_headers)
    assert labeler_list.status_code == 200
    labeler_titles = {item["title"] for item in labeler_list.json()["data"]["items"]}
    assert labeler_titles == {"指定成员提醒"}

    handled = client.post(f"/api/v1/notifications/my/{role_notice.id}/state", headers=reviewer_headers, json={"status": "handled"})
    assert handled.status_code == 200
    assert handled.json()["data"]["is_read"] is True
    assert handled.json()["data"]["is_handled"] is True
    persisted_role_notice = db.get(Notification, role_notice.id)
    assert persisted_role_notice is not None
    assert reviewer.id in persisted_role_notice.read_by
    assert reviewer.id in persisted_role_notice.handled_by

    blocked_hidden = client.post(f"/api/v1/notifications/my/{hidden_notice.id}/state", headers=reviewer_headers, json={"status": "read"})
    assert blocked_hidden.status_code == 404

    marked = client.post("/api/v1/notifications/my/mark-all-read", headers=reviewer_headers)
    assert marked.status_code == 200
    assert marked.json()["data"]["updated"] == 1
    persisted_team_notice = db.get(Notification, team_notice.id)
    persisted_member_notice = db.get(Notification, member_notice.id)
    assert persisted_team_notice is not None
    assert persisted_member_notice is not None
    assert reviewer.id in persisted_team_notice.read_by
    assert reviewer.id not in persisted_member_notice.read_by


def test_team_notification_state_update_rejects_cross_team_without_side_effect() -> None:
    db = get_database()
    team_a = Team(company_name="Notification Scope Team A", owner_user_id="notice-scope-owner-a")
    team_b = Team(company_name="Notification Scope Team B", owner_user_id="notice-scope-owner-b")
    user = User(username="notificationscopeuser", email="notification-scope@example.com", global_role="user", email_verified=True)
    db.add(team_a)
    db.add(team_b)
    db.add(user)
    db.add(TeamMember(team_id=team_a.id, user_id=user.id, team_role="labeler"))
    notification = Notification(team_id=team_b.id, title="Other team notice", content="Must not be mutated", notification_type="team", target_type="team")
    db.add(notification)

    headers = {"Authorization": f"Bearer {create_session_bound_access_token(user.id, role=user.global_role)}", "X-Team-ID": team_a.id}
    response = client.post(f"/api/v1/notifications/{notification.id}/state", headers=headers, json={"status": "read"})

    assert response.status_code == 403
    persisted = db.get(Notification, notification.id)
    assert persisted is not None
    assert user.id not in persisted.read_by


def test_team_notification_state_update_rejects_hidden_recipient_without_side_effect() -> None:
    db = get_database()
    team = Team(company_name="Notification Recipient Scope Team", owner_user_id="notice-recipient-owner")
    reviewer = User(username="notificationrecipientreviewer", email="notification-recipient-reviewer@example.com", global_role="reviewer", email_verified=True)
    owner = User(username="notificationrecipientowner", email="notification-recipient-owner@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(reviewer)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer"))
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    hidden_notice = Notification(team_id=team.id, title="Owner only state", content="Reviewer must not mutate", notification_type="team", target_type="role", target_roles=["owner"])
    db.add(hidden_notice)

    headers = {"Authorization": f"Bearer {create_session_bound_access_token(reviewer.id, role=reviewer.global_role)}", "X-Team-ID": team.id}
    response = client.post(f"/api/v1/notifications/{hidden_notice.id}/state", headers=headers, json={"status": "handled"})

    assert response.status_code == 404
    persisted = db.get(Notification, hidden_notice.id)
    assert persisted is not None
    assert reviewer.id not in persisted.read_by
    assert reviewer.id not in persisted.handled_by


def test_team_mark_all_read_only_updates_visible_notifications() -> None:
    db = get_database()
    team = Team(company_name="Scoped Mark Read Team", owner_user_id="mark-read-owner")
    reviewer = User(username="markreadreviewer", email="mark-read-reviewer@example.com", global_role="reviewer", email_verified=True)
    db.add(team)
    db.add(reviewer)
    db.add(TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer"))
    visible_notice = Notification(team_id=team.id, title="Reviewer visible", content="All members can read", notification_type="team", target_type="team")
    hidden_notice = Notification(team_id=team.id, title="Owner only", content="Reviewer must not mutate", notification_type="team", target_type="role", target_roles=["owner"])
    for item in [visible_notice, hidden_notice]:
        db.add(item)
    db.commit()
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(reviewer.id, role=reviewer.global_role)}", "X-Team-ID": team.id}

    response = client.post(f"/api/v1/notifications/mark-all-read?team_id={team.id}", headers=headers)

    assert response.status_code == 200
    assert response.json()["data"]["updated"] == 1
    assert reviewer.id in db.get(Notification, visible_notice.id).read_by
    assert reviewer.id not in db.get(Notification, hidden_notice.id).read_by


def test_team_labeler_cannot_list_team_members() -> None:
    db = get_database()
    team = Team(company_name="Labeler Member Boundary Team", owner_user_id="labeler-member-owner")
    labeler = User(username="labelermemberboundary", email="labeler-member-boundary@example.com", global_role="labeler", email_verified=True)
    owner = User(username="labelermemberowner", email="labeler-member-owner@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(labeler)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=labeler.id, team_role="labeler"))
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    db.commit()

    response = client.get(
        f"/api/v1/teams/{team.id}/members?status=active",
        headers={"Authorization": f"Bearer {create_session_bound_access_token(labeler.id, role=labeler.global_role)}", "X-Team-ID": team.id},
    )

    assert response.status_code == 403


def test_team_labeler_cannot_view_points_budget() -> None:
    db = get_database()
    team = Team(company_name="Labeler Budget Boundary Team", owner_user_id="labeler-budget-owner")
    labeler = User(username="labelerbudgetboundary", email="labeler-budget-boundary@example.com", global_role="labeler", email_verified=True)
    db.add(team)
    db.add(labeler)
    db.add(TeamMember(team_id=team.id, user_id=labeler.id, team_role="labeler"))
    db.commit()

    response = client.get(
        f"/api/v1/teams/{team.id}/points-budget",
        headers={"Authorization": f"Bearer {create_session_bound_access_token(labeler.id, role=labeler.global_role)}", "X-Team-ID": team.id},
    )

    assert response.status_code == 403


def test_team_upload_download_requires_file_read_permission() -> None:
    db = get_database()
    team = Team(company_name="Upload Download Scope Team", owner_user_id="upload-download-admin")
    admin = User(username="uploaddownloadadmin", email="upload-download-admin@example.com", global_role="user", email_verified=True)
    labeler = User(username="uploaddownloadlabeler", email="upload-download-labeler@example.com", global_role="labeler", email_verified=True)
    db.add(team)
    db.add(admin)
    db.add(labeler)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin"))
    db.add(TeamMember(team_id=team.id, user_id=labeler.id, team_role="labeler"))
    admin_headers = {"Authorization": f"Bearer {create_session_bound_access_token(admin.id, role=admin.global_role)}", "X-Team-ID": team.id}
    labeler_headers = {"Authorization": f"Bearer {create_session_bound_access_token(labeler.id, role=labeler.global_role)}", "X-Team-ID": team.id}

    uploaded = client.post(
        "/api/v1/uploads",
        headers=admin_headers,
        data={"category": "verification"},
        files={"file": ("license.pdf", b"license-content", "application/pdf")},
    )
    assert uploaded.status_code == 200

    blocked_download = client.get(uploaded.json()["data"]["url"], headers=labeler_headers)
    assert blocked_download.status_code == 403


def test_team_upload_uses_team_scoped_manage_permission() -> None:
    db = get_database()
    team = Team(company_name="Upload Team Scoped Permission", owner_user_id="upload-team-scoped-admin")
    admin = User(username="uploadteamscopeadmin", email="upload-team-scope-admin@example.com", global_role="user", email_verified=True)
    global_owner = User(username="uploadglobalscopeowner", email="upload-global-scope-owner@example.com", global_role="owner", email_verified=True)
    db.add(team)
    db.add(admin)
    db.add(global_owner)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin"))
    db.add(TeamMember(team_id=team.id, user_id=global_owner.id, team_role="labeler"))
    admin_headers = {"Authorization": f"Bearer {create_session_bound_access_token(admin.id, role=admin.global_role)}", "X-Team-ID": team.id}
    global_owner_headers = {"Authorization": f"Bearer {create_session_bound_access_token(global_owner.id, role=global_owner.global_role)}", "X-Team-ID": team.id}

    uploaded = client.post(
        "/api/v1/uploads",
        headers=admin_headers,
        data={"category": "verification"},
        files={"file": ("team-license.pdf", b"license-content", "application/pdf")},
    )
    assert uploaded.status_code == 200

    response = client.post(
        "/api/v1/uploads",
        headers=global_owner_headers,
        data={"category": "verification"},
        files={"file": ("forbidden.pdf", b"forbidden-content", "application/pdf")},
    )
    blocked_download = client.get(uploaded.json()["data"]["url"], headers=global_owner_headers)

    assert response.status_code == 403
    assert blocked_download.status_code == 403
    assert db.collection("uploaded_files").count_documents({"team_id": team.id}) == 1


def test_team_image_upload_rejects_spoofed_document_content_type() -> None:
    db = get_database()
    team = Team(company_name="Upload Image Type Team", owner_user_id="upload-image-admin")
    admin = User(username="uploadimageadmin", email="upload-image-admin@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(admin)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin"))
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(admin.id, role=admin.global_role)}", "X-Team-ID": team.id}

    response = client.post(
        "/api/v1/uploads",
        headers=headers,
        data={"category": "image"},
        files={"file": ("evidence.pdf", b"%PDF-1.4 fake image", "image/png")},
    )

    assert response.status_code == 400
    assert response.json()["code"] == 40003
    assert db.collection("uploaded_files").count_documents({"team_id": team.id}) == 0


def test_team_points_wallet_ledger_and_withdraw() -> None:
    db = get_database()
    team = Team(company_name="Points Wallet Team", owner_user_id="wallet-owner")
    owner = User(username="walletowner", email="walletowner@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="team_admin"))
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(owner.id, role=owner.global_role)}", "X-Team-ID": team.id}

    recharged = client.post(
        f"/api/v1/teams/{team.id}/points-budget/recharge",
        headers=headers,
        json={"amount": 300, "payment_method": "wechat"},
    )
    assert recharged.status_code == 200

    ledger_response = client.get(f"/api/v1/teams/{team.id}/points-budget/ledger", headers=headers)
    assert ledger_response.status_code == 200
    assert ledger_response.json()["data"]["pagination"]["total"] >= 1
    first_item = ledger_response.json()["data"]["items"][0]
    assert first_item["transaction_type"] == "recharge"
    assert first_item["amount"] == 300

    password = client.post(
        f"/api/v1/teams/{team.id}/points-budget/payment-password/set",
        headers=headers,
        json={"new_password": "123456", "confirm_password": "123456"},
    )
    assert password.status_code == 200

    withdrawn = client.post(
        f"/api/v1/teams/{team.id}/points-budget/withdraw",
        headers=headers,
        json={
            "amount": 120,
            "payout_method": "bank_transfer",
            "account_name": "MarkUp Finance",
            "account_no": "6222020202020202",
            "bank_name": "招商银行上海分行",
            "note": "财务回收",
            "payment_password": "123456",
        },
    )
    assert withdrawn.status_code == 200
    assert withdrawn.json()["data"]["balance_points"] == 180
    assert withdrawn.json()["data"]["pending_payment_points"] == 0
    assert withdrawn.json()["data"]["available_points"] == 180
    assert withdrawn.json()["data"]["available_points"] == 180

    persisted = db.find_one(TeamPointsBudget, {"team_id": team.id})
    assert persisted is not None
    assert persisted.current_balance == 180

    ledger_items = db.find(TeamPointsWalletLedger, {"team_id": team.id}, sort=[("created_at", -1)])
    assert ledger_items[0].transaction_type == "withdraw"
    assert ledger_items[0].amount == 120
    assert ledger_items[0].status == "completed"


def test_team_points_withdraw_uses_available_balance_only() -> None:
    db = get_database()
    team = Team(company_name="Available Withdraw Team", owner_user_id="available-owner")
    owner = User(username="availableowner", email="availableowner@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="team_admin"))
    db.add(
        Task(
            team_id=team.id,
            owner_id=owner.id,
            title="发布即预扣任务",
            status="published",
            quota=12,
            reward_rule={"mode": "item", "points_per_item": 10},
            stats={"total": 12, "approved": 0},
        )
    )
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(owner.id, role=owner.global_role)}", "X-Team-ID": team.id}

    recharged = client.post(
        f"/api/v1/teams/{team.id}/points-budget/recharge",
        headers=headers,
        json={"amount": 200, "payment_method": "wechat"},
    )
    assert recharged.status_code == 200
    assert recharged.json()["data"]["available_points"] == 68

    password = client.post(
        f"/api/v1/teams/{team.id}/points-budget/payment-password/set",
        headers=headers,
        json={"new_password": "123456", "confirm_password": "123456"},
    )
    assert password.status_code == 200

    blocked = client.post(
        f"/api/v1/teams/{team.id}/points-budget/withdraw",
        headers=headers,
        json={
            "amount": 81,
            "payout_method": "wechat",
            "account_no": "wechat-account-001",
            "payment_password": "123456",
        },
    )
    assert blocked.status_code == 422
    assert blocked.json()["detail"]["available_balance"] == 68
    assert blocked.json()["detail"]["reserved_points"] == 132
    assert blocked.json()["detail"]["current_balance"] == 200

    withdrawn = client.post(
        f"/api/v1/teams/{team.id}/points-budget/withdraw",
        headers=headers,
        json={
            "amount": 68,
            "payout_method": "alipay",
            "account_no": "a",
            "payment_password": "123456",
        },
    )
    assert withdrawn.status_code == 200
    assert withdrawn.json()["data"]["balance_points"] == 132
    assert withdrawn.json()["data"]["reserved_points"] == 132
    assert withdrawn.json()["data"]["pending_payment_points"] == 0
    assert withdrawn.json()["data"]["available_points"] == 0


def test_labeler_can_view_rejection_and_resubmit() -> None:
    db = get_database()
    team = Team(company_name="Rejection Resubmit Team", owner_user_id="review-owner")
    reviewer = User(username="rejectreviewer", email="rejectreviewer@example.com", global_role="reviewer", email_verified=True)
    labeler = User(username="rejectlabeler", email="rejectlabeler@example.com", global_role="labeler", email_verified=True)
    db.add(team)
    db.add(reviewer)
    db.add(labeler)
    db.add(TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer", assigned_review_tasks=["reject-task"]))
    template_id = generate_object_id()
    template_version_id = f"{template_id}:v1"
    template_schema = {"schema_version": "1.0", "tabs": [{"id": "tab-1", "title": "默认", "components": []}], "components": []}
    db.add(TemplateVersion(template_id=template_id, team_id=team.id, version=1, schema=template_schema, is_published=True))
    task = Task(
        team_id=team.id,
        owner_id="owner",
        title="打回重提任务",
        status="published",
        reviewer_ids=[reviewer.id],
        template_id=template_id,
        template_version_id=template_version_id,
        stats={"total": 1, "claimed": 0, "submitted": 1, "approved": 0, "rejected": 0},
    )
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="submitted", assigned_to=labeler.id)
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id=labeler.id,
        answers={"intent": "risk"},
        draft={"intent": "risk"},
        status="submitted",
    )
    for item in [task, question, submission]:
        db.add(item)
    reviewer_token = create_session_bound_access_token(reviewer.id, role=reviewer.global_role)
    labeler_token = create_session_bound_access_token(labeler.id, role=labeler.global_role)
    reviewer_headers = {"Authorization": f"Bearer {reviewer_token}", "X-Team-ID": team.id}
    labeler_headers = {"Authorization": f"Bearer {labeler_token}"}

    rejected = client.post(
        f"/api/v1/reviews/submissions/{submission.id}",
        headers=reviewer_headers,
        json={"decision": "rejected", "comment": "证据不足，请补充理由"},
    )
    assert rejected.status_code == 200
    rejected_stats = db.get(Task, task.id).stats
    assert rejected_stats["submitted"] == 0
    assert rejected_stats["rejected"] == 1

    rejection = client.get(f"/api/v1/labels/questions/{question.id}/rejection", headers=labeler_headers)
    assert rejection.status_code == 200
    assert rejection.json()["data"]["latest"]["comment"] == "证据不足，请补充理由"
    assert rejection.json()["data"]["current_round"] == 2

    resubmitted = client.post(
        f"/api/v1/labels/questions/{question.id}/submit",
        headers=labeler_headers,
        json={"answers": {"intent": "risk", "reason": "已补充证据"}},
    )
    assert resubmitted.status_code == 200
    assert resubmitted.json()["data"]["status"] == "submitted"
    assert db.get(Question, question.id).status == "submitted"
    resubmitted_stats = db.get(Task, task.id).stats
    assert resubmitted_stats["submitted"] == 1
    assert resubmitted_stats["rejected"] == 0


def test_labeler_cannot_overwrite_submitted_answer_before_review() -> None:
    db = get_database()
    team = Team(company_name="Submitted Answer Lock Team", owner_user_id="submit-lock-owner")
    labeler = User(username="submitlocklabeler", email="submit-lock-labeler@example.com", global_role="labeler", email_verified=True)
    db.add(team)
    db.add(labeler)
    template_id = generate_object_id()
    template_version_id = f"{template_id}:v1"
    template_schema = {"schema_version": "1.0", "tabs": [{"id": "tab-1", "title": "默认", "components": []}], "components": []}
    db.add(TemplateVersion(template_id=template_id, team_id=team.id, version=1, schema=template_schema, is_published=True))
    task = Task(
        team_id=team.id,
        owner_id="owner",
        title="待审核答案锁定任务",
        status="published",
        template_id=template_id,
        template_version_id=template_version_id,
        stats={"total": 1, "claimed": 0, "submitted": 1, "approved": 0, "rejected": 0},
    )
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="submitted", assigned_to=labeler.id)
    submitted_at = datetime(2026, 5, 31, 9, 0, 0)
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id=labeler.id,
        answers={"intent": "original"},
        draft={"intent": "original"},
        status="submitted",
        submitted_at=submitted_at,
    )
    for item in [task, question, submission]:
        db.add(item)
    db.commit()
    labeler_headers = {"Authorization": f"Bearer {create_session_bound_access_token(labeler.id, role=labeler.global_role)}"}

    duplicate = client.post(
        f"/api/v1/labels/questions/{question.id}/submit",
        headers=labeler_headers,
        json={"answers": {"intent": "changed"}},
    )

    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == 40902
    persisted_submission = db.get(Submission, submission.id)
    assert persisted_submission.answers == {"intent": "original"}
    assert persisted_submission.draft == {"intent": "original"}
    assert persisted_submission.status == "submitted"
    assert persisted_submission.submitted_at == submitted_at
    assert db.get(Question, question.id).status == "submitted"
    assert db.get(Task, task.id).stats["submitted"] == 1


def test_labeler_cannot_edit_draft_after_submission_before_review() -> None:
    db = get_database()
    team = Team(company_name="Submitted Draft Lock Team", owner_user_id="draft-lock-owner")
    labeler = User(username="draftlocklabeler", email="draft-lock-labeler@example.com", global_role="labeler", email_verified=True)
    db.add(team)
    db.add(labeler)
    template_id = generate_object_id()
    template_version_id = f"{template_id}:v1"
    template_schema = {"schema_version": "1.0", "tabs": [{"id": "tab-1", "title": "默认", "components": []}], "components": []}
    db.add(TemplateVersion(template_id=template_id, team_id=team.id, version=1, schema=template_schema, is_published=True))
    task = Task(
        team_id=team.id,
        owner_id="owner",
        title="待审核草稿锁定任务",
        status="published",
        template_id=template_id,
        template_version_id=template_version_id,
        stats={"total": 1, "claimed": 0, "submitted": 1, "approved": 0, "rejected": 0},
    )
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="submitted", assigned_to=labeler.id)
    submitted_at = datetime(2026, 5, 31, 10, 0, 0)
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id=labeler.id,
        answers={"intent": "original"},
        draft={"intent": "original"},
        status="submitted",
        submitted_at=submitted_at,
    )
    for item in [task, question, submission]:
        db.add(item)
    db.commit()
    labeler_headers = {"Authorization": f"Bearer {create_session_bound_access_token(labeler.id, role=labeler.global_role)}"}

    blocked = client.put(
        f"/api/v1/labels/questions/{question.id}/draft",
        headers=labeler_headers,
        json={"answers": {"intent": "changed"}},
    )

    assert blocked.status_code == 409
    assert blocked.json()["code"] == 40902
    persisted_submission = db.get(Submission, submission.id)
    assert persisted_submission.answers == {"intent": "original"}
    assert persisted_submission.draft == {"intent": "original"}
    assert persisted_submission.status == "submitted"
    assert persisted_submission.submitted_at == submitted_at


def test_ai_review_submission_enqueues_job_when_enabled(monkeypatch) -> None:
    from app.services import ai_reviews_service

    db = get_database()
    team = Team(company_name="AI Review Switch Team", owner_user_id="ai-owner")
    labeler = User(username="aiswitchlabeler", email="aiswitchlabeler@example.com", global_role="labeler", email_verified=True)
    db.add(team)
    db.add(labeler)
    template_id = generate_object_id()
    template_version_id = f"{template_id}:v1"
    template_schema = {
        "schema_version": "1.0",
        "tabs": [{
            "id": "tab-1",
            "title": "默认",
            "components": [{
                "id": "intent",
                "type": "SingleSelect",
                "field": "intent",
                "label": "意图",
                "required": True,
                "config": {},
                "options": [{"value": "risk", "label": "风险"}],
                "version": "1.0",
            }],
        }],
        "components": [],
    }
    db.add(TemplateVersion(template_id=template_id, team_id=team.id, version=1, schema=template_schema, is_published=True))
    provider = AiProviderConfig(team_id=team.id, route_name="provider-1", provider_kind="openai", provider="openai", status="enabled")
    task = Task(
        team_id=team.id,
        owner_id="owner",
        title="AI 开关任务",
        status="published",
        template_id=template_id,
        template_version_id=template_version_id,
        ai_config={
            "enabled": True,
            "provider_id": provider.id,
            "model": "mock-model",
            "input_prompt": "检查答案质量",
            "input_confirmed": True,
            "review_matrix": [{"dimension": "quality", "max_score": 5}],
            "matrix_confirmed": True,
        },
    )
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="claimed", assigned_to=labeler.id)
    db.add(provider)
    db.add(task)
    db.add(question)
    labeler_headers = {"Authorization": f"Bearer {create_session_bound_access_token(labeler.id, role=labeler.global_role)}"}

    def fake_generation(*args, **kwargs):
        assert kwargs["operation_type"] == "ai_review_execute"
        assert kwargs["team_id"] == team.id
        assert kwargs["messages"]
        return {
            "content": '{"decision":"pass","total_score":95,"reason":"ok","dimension_scores":[],"risk_flags":[]}',
            "provider_id": "provider-1",
            "model": "mock-model",
        }

    monkeypatch.setattr(ai_reviews_service, "run_platform_provider_messages_generation", fake_generation)

    submitted = client.post(f"/api/v1/labels/questions/{question.id}/submit", headers=labeler_headers, json={"answers": {"intent": "risk"}})
    assert submitted.status_code == 200
    assert submitted.json()["data"]["status"] == "submitted"
    assert submitted.json()["data"]["ai_review_job"]["status"] == "pending"
    assert db.get(Question, question.id).status == "submitted"
    stored_submission = db.find_one(Submission, {"question_id": question.id, "labeler_id": labeler.id})
    assert stored_submission is not None
    assert stored_submission.task_submitted_at is not None
    assert db.collection("ai_review_jobs").count_documents({"question_id": question.id}) == 1
    stored_job = db.find_one(AiReviewJob, {"question_id": question.id})
    assert stored_job.status == "completed"
    assert stored_job.result["ai_suggestion"] == "pass"


def test_ai_review_jobs_require_team_scope_header() -> None:
    db = get_database()
    team_a = Team(company_name="AI Review Scoped Team", owner_user_id="ai-review-owner-a")
    team_b = Team(company_name="AI Review Hidden Team", owner_user_id="ai-review-owner-b")
    reviewer = User(username="aireviewscope", email="ai-review-scope@example.com", global_role="reviewer", email_verified=True)
    for item in [team_a, team_b, reviewer]:
        db.add(item)
    db.add(TeamMember(team_id=team_a.id, user_id=reviewer.id, team_role="reviewer", assigned_review_tasks=["ai-review-task-a"]))
    task_a = Task(team_id=team_a.id, owner_id="owner-a", title="Scoped AI Review", status="published", reviewer_ids=[reviewer.id])
    task_b = Task(team_id=team_b.id, owner_id="owner-b", title="Hidden AI Review", status="published", reviewer_ids=[])
    task_a.ai_config["enabled"] = True
    task_b.ai_config["enabled"] = True
    question_a = Question(team_id=team_a.id, task_id=task_a.id, row_index=0, content={"text": "A"}, status="submitted")
    question_b = Question(team_id=team_b.id, task_id=task_b.id, row_index=0, content={"text": "B"}, status="submitted")
    submission_a = Submission(team_id=team_a.id, task_id=task_a.id, question_id=question_a.id, labeler_id="labeler-a", status="submitted", task_submitted_at=datetime(2026, 5, 31, 10, 0, 0))
    submission_b = Submission(team_id=team_b.id, task_id=task_b.id, question_id=question_b.id, labeler_id="labeler-b", status="submitted", task_submitted_at=datetime(2026, 5, 31, 10, 0, 0))
    for item in [task_a, task_b, question_a, question_b, submission_a, submission_b]:
        db.add(item)
    db.add(
        AiReviewJob(
            team_id=team_a.id,
            task_id=task_a.id,
            question_id=question_a.id,
            submission_id=submission_a.id,
            labeler_id="labeler-a",
            idempotency_key=f"submission:{submission_a.id}:ai-review",
        )
    )
    db.add(
        AiReviewJob(
            team_id=team_b.id,
            task_id=task_b.id,
            question_id=question_b.id,
            submission_id=submission_b.id,
            labeler_id="labeler-b",
            idempotency_key=f"submission:{submission_b.id}:ai-review",
        )
    )
    db.commit()

    token = create_session_bound_access_token(reviewer.id, role=reviewer.global_role)
    no_scope = client.get("/api/v1/ai-reviews/tasks", headers={"Authorization": f"Bearer {token}"})
    assert no_scope.status_code == 403

    scoped = client.get("/api/v1/ai-reviews/tasks", headers={"Authorization": f"Bearer {token}", "X-Team-ID": team_a.id})
    assert scoped.status_code == 200
    items = scoped.json()["data"]["items"]
    assert [item["team_id"] for item in items] == [team_a.id]
    assert items[0]["submission_id"] == submission_a.id

    no_scope_overview = client.get("/api/v1/ai-reviews/task-overviews", headers={"Authorization": f"Bearer {token}"})
    assert no_scope_overview.status_code == 403

    overview = client.get("/api/v1/ai-reviews/task-overviews", headers={"Authorization": f"Bearer {token}", "X-Team-ID": team_a.id})
    assert overview.status_code == 200
    overview_data = overview.json()["data"]
    assert [item["task_id"] for item in overview_data["items"]] == [task_a.id]
    assert overview_data["summary"]["task_total"] == 1
    assert overview_data["summary"]["pending"] == 1

    detail = client.get(f"/api/v1/ai-reviews/task-overviews/{task_a.id}/submissions", headers={"Authorization": f"Bearer {token}", "X-Team-ID": team_a.id})
    assert detail.status_code == 200
    detail_data = detail.json()["data"]
    assert detail_data["task"]["task_id"] == task_a.id
    assert [item["submission_id"] for item in detail_data["items"]] == [submission_a.id]

    hidden_detail = client.get(f"/api/v1/ai-reviews/task-overviews/{task_b.id}/submissions", headers={"Authorization": f"Bearer {token}", "X-Team-ID": team_a.id})
    assert hidden_detail.status_code == 404


def test_ai_review_task_overviews_empty_scope_returns_zeroes() -> None:
    db = get_database()
    team = Team(company_name="AI Review Empty Team", owner_user_id="ai-review-empty-owner")
    owner = User(username="aireviewempty", email="ai-review-empty@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    db.commit()

    response = client.get("/api/v1/ai-reviews/task-overviews", headers=team_auth_headers(owner, team.id))

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["items"] == []
    assert data["summary"]["task_total"] == 0
    assert data["summary"]["pending"] == 0
    assert data["pagination"]["total"] == 0


def test_ai_review_task_overviews_hide_disabled_ai_tasks() -> None:
    db = get_database()
    team = Team(company_name="AI Review Disabled Team", owner_user_id="ai-review-disabled-owner")
    owner = User(username="aireviewdisabled", email="ai-review-disabled@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    provider = AiProviderConfig(team_id=team.id, route_name="Provider Display Name", provider_kind="openai_compatible", provider="openai_compatible", model_id="model-from-provider", status="enabled")
    db.add(provider)
    enabled_task = Task(team_id=team.id, owner_id=owner.id, title="Enabled AI Review", status="published", ai_config={"enabled": True, "provider_id": provider.id, "model": "model-should-not-display"})
    disabled_task = Task(team_id=team.id, owner_id=owner.id, title="Disabled AI Review", status="published", ai_config={"enabled": False})
    paused_task = Task(team_id=team.id, owner_id=owner.id, title="Paused AI Review", status="paused", ai_config={"enabled": True})
    enabled_question = Question(team_id=team.id, task_id=enabled_task.id, row_index=0, content={"text": "A"}, status="submitted")
    disabled_question = Question(team_id=team.id, task_id=disabled_task.id, row_index=0, content={"text": "B"}, status="submitted")
    paused_question = Question(team_id=team.id, task_id=paused_task.id, row_index=0, content={"text": "C"}, status="submitted")
    enabled_submission = Submission(team_id=team.id, task_id=enabled_task.id, question_id=enabled_question.id, labeler_id="labeler-a", status="submitted")
    disabled_submission = Submission(team_id=team.id, task_id=disabled_task.id, question_id=disabled_question.id, labeler_id="labeler-b", status="submitted")
    paused_submission = Submission(team_id=team.id, task_id=paused_task.id, question_id=paused_question.id, labeler_id="labeler-c", status="submitted")
    for item in [enabled_task, disabled_task, paused_task, enabled_question, disabled_question, paused_question, enabled_submission, disabled_submission, paused_submission]:
        db.add(item)
    db.commit()

    headers = team_auth_headers(owner, team.id)
    response = client.get("/api/v1/ai-reviews/task-overviews", headers=headers)
    assert response.status_code == 200
    assert [item["task_id"] for item in response.json()["data"]["items"]] == [enabled_task.id]
    assert response.json()["data"]["items"][0]["provider_name"] == "Provider Display Name"
    assert response.json()["data"]["items"][0]["model"] == "model-should-not-display"

    disabled_detail = client.get(f"/api/v1/ai-reviews/task-overviews/{disabled_task.id}/submissions", headers=headers)
    assert disabled_detail.status_code == 404

    paused_detail = client.get(f"/api/v1/ai-reviews/task-overviews/{paused_task.id}/submissions", headers=headers)
    assert paused_detail.status_code == 404


def test_ai_review_worker_writes_structured_result_without_final_review_decision(monkeypatch) -> None:
    from app.services.ai_reviews_service import process_ai_review_job
    from app.services import ai_reviews_service

    db = get_database()
    team = Team(company_name="AI Review Worker Team", owner_user_id="ai-review-worker-owner")
    owner = User(username="aireviewworker", email="ai-review-worker@example.com", global_role="user", email_verified=True)
    reviewer = User(username="aireviewworkerreviewer", email="ai-review-worker-reviewer@example.com", global_role="reviewer", email_verified=True)
    db.add(team)
    db.add(owner)
    db.add(reviewer)
    task = Task(
        team_id=team.id,
        owner_id=owner.id,
        title="Worker AI Review",
        status="published",
        ai_config={"enabled": True, "provider_id": "provider-1", "prompt": "检查答案质量"},
    )
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="submitted")
    task.reviewer_ids = [reviewer.id]
    submission = Submission(team_id=team.id, task_id=task.id, question_id=question.id, labeler_id="labeler-worker", status="submitted", answers={"intent": "risk"})
    job = AiReviewJob(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        submission_id=submission.id,
        labeler_id=submission.labeler_id,
        status="pending",
        idempotency_key=f"submission:{submission.id}:ai-review",
    )
    for item in [task, question, submission, job, TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer", assigned_review_tasks=[task.id])]:
        db.add(item)
    db.commit()

    def fake_generation(*args, **kwargs):
        assert kwargs["operation_type"] == "ai_review_execute"
        assert kwargs["team_id"] == team.id
        return {
            "content": '{"decision":"manual","total_score":72,"reason":"需要人工复核","dimension_scores":[],"risk_flags":["ambiguous"]}',
            "provider_id": "provider-1",
            "model": "mock-model",
            "request_id": "req-ai-review-worker",
            "tokens": 18,
            "cost": 1,
        }

    monkeypatch.setattr(ai_reviews_service, "run_platform_provider_messages_generation", fake_generation)

    result = process_ai_review_job(db, job_id=job.id)

    assert result["status"] == "completed"
    assert result["result"]["ai_suggestion"] == "manual"
    assert result["result"]["total_score"] == 72
    persisted_submission = db.get(Submission, submission.id)
    assert persisted_submission.status == "submitted"
    assert persisted_submission.task_submitted_at is not None
    assert db.get(Question, question.id).status == "submitted"
    queue = client.get("/api/v1/reviews/queue", headers=team_auth_headers(reviewer, team.id))
    assert queue.status_code == 200
    queue_item = queue.json()["data"]["items"][0]
    assert queue_item["submission_id"] == submission.id
    assert queue_item["responsible_reviewer_ids"] == [reviewer.id]
    assert queue_item["responsible_reviewer_names"] == [reviewer.username]
    assert queue_item["responsible_reviewers"][0]["display_name"] == reviewer.username
    processed_log = db.find_one(AuditLog, {"team_id": team.id, "entity_type": "ai_review", "entity_id": job.id, "action": "ai_review_job_processed"})
    assert processed_log is not None
    processed_changes = processed_log.changes or {}
    assert processed_changes["agent_actor"] == "MarkUp Agent"
    assert processed_changes["ai_suggestion"] == "manual"
    assert processed_changes["total_score"] == 72
    assert processed_changes["risk_flags"] == ["ambiguous"]
    assert processed_changes["provider_id"] == "provider-1"
    assert processed_changes["model"] == "mock-model"
    assert processed_changes["request_id"] == "req-ai-review-worker"
    released_log = db.find_one(AuditLog, {"team_id": team.id, "entity_type": "submission", "entity_id": submission.id, "action": "ai_review_submission_released_to_review"})
    assert released_log is not None
    assert (released_log.changes or {})["agent_actor"] == "MarkUp Agent"


def test_ai_review_worker_fails_invalid_decision_and_releases_review(monkeypatch) -> None:
    from app.services.ai_reviews_service import process_ai_review_job
    from app.services import ai_reviews_service

    db = get_database()
    team = Team(company_name="AI Review Invalid Team", owner_user_id="ai-review-invalid-owner")
    owner = User(username="aireviewinvalid", email="ai-review-invalid@example.com", global_role="user", email_verified=True)
    reviewer = User(username="aireviewinvalidreviewer", email="ai-review-invalid-reviewer@example.com", global_role="reviewer", email_verified=True)
    for item in [team, owner, reviewer]:
        db.add(item)
    task = Task(team_id=team.id, owner_id=owner.id, title="Invalid AI Review", status="published", reviewer_ids=[reviewer.id], ai_config={"enabled": True, "provider_id": "provider-1"})
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="submitted")
    submission = Submission(team_id=team.id, task_id=task.id, question_id=question.id, labeler_id="labeler-invalid", status="submitted", answers={"intent": "risk"})
    job = AiReviewJob(team_id=team.id, task_id=task.id, question_id=question.id, submission_id=submission.id, labeler_id=submission.labeler_id, status="pending", idempotency_key=f"submission:{submission.id}:ai-review")
    for item in [task, question, submission, job, TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer", assigned_review_tasks=[task.id])]:
        db.add(item)
    db.commit()

    monkeypatch.setattr(
        ai_reviews_service,
        "run_platform_provider_messages_generation",
        lambda *args, **kwargs: {"content": '{"decision":"maybe","total_score":50,"reason":"bad","dimension_scores":[],"risk_flags":[]}'},
    )

    result = process_ai_review_job(db, job_id=job.id)

    assert result["status"] == "failed"
    assert db.get(Submission, submission.id).task_submitted_at is not None
    queue = client.get("/api/v1/reviews/queue", headers=team_auth_headers(reviewer, team.id))
    assert queue.status_code == 200
    assert queue.json()["data"]["items"][0]["ai_review"]["status"] == "failed"
    processed_log = db.find_one(AuditLog, {"team_id": team.id, "entity_type": "ai_review", "entity_id": job.id, "action": "ai_review_job_processed"})
    assert processed_log is not None
    processed_changes = processed_log.changes or {}
    assert processed_changes["agent_actor"] == "MarkUp Agent"
    assert processed_changes["status"] == "failed"
    assert processed_changes["error"]
    released_log = db.find_one(AuditLog, {"team_id": team.id, "entity_type": "submission", "entity_id": submission.id, "action": "ai_review_submission_released_to_review"})
    assert released_log is not None
    assert (released_log.changes or {})["agent_actor"] == "MarkUp Agent"


def test_review_queue_requires_team_scope_for_unassigned_view() -> None:
    db = get_database()
    team_a = Team(company_name="Review Queue Scoped Team", owner_user_id="review-queue-owner-a")
    team_b = Team(company_name="Review Queue Hidden Team", owner_user_id="review-queue-owner-b")
    reviewer = User(username="reviewqueuescope", email="review-queue-scope@example.com", global_role="reviewer", email_verified=True)
    for item in [team_a, team_b, reviewer]:
        db.add(item)
    db.add(TeamMember(team_id=team_a.id, user_id=reviewer.id, team_role="reviewer", permissions=["submission:view"]))
    task_a = Task(team_id=team_a.id, owner_id="owner-a", title="Scoped Review Queue", status="published")
    task_b = Task(team_id=team_b.id, owner_id="owner-b", title="Hidden Review Queue", status="published")
    question_a = Question(team_id=team_a.id, task_id=task_a.id, row_index=0, content={"text": "A"}, status="submitted")
    question_b = Question(team_id=team_b.id, task_id=task_b.id, row_index=0, content={"text": "B"}, status="submitted")
    submission_a = Submission(team_id=team_a.id, task_id=task_a.id, question_id=question_a.id, labeler_id="labeler-a", status="submitted", task_submitted_at=datetime(2026, 5, 31, 10, 0, 0))
    submission_b = Submission(team_id=team_b.id, task_id=task_b.id, question_id=question_b.id, labeler_id="labeler-b", status="submitted", task_submitted_at=datetime(2026, 5, 31, 10, 0, 0))
    for item in [task_a, task_b, question_a, question_b, submission_a, submission_b]:
        db.add(item)
    db.commit()

    token = create_session_bound_access_token(reviewer.id, role=reviewer.global_role)
    no_scope = client.get("/api/v1/reviews/queue?assigned_only=false", headers={"Authorization": f"Bearer {token}"})
    assert no_scope.status_code == 403

    scoped = client.get(
        "/api/v1/reviews/queue?assigned_only=false",
        headers={"Authorization": f"Bearer {token}", "X-Team-ID": team_a.id},
    )
    assert scoped.status_code == 200
    submission_ids = {item["submission_id"] for item in scoped.json()["data"]["items"]}
    assert submission_a.id in submission_ids
    assert submission_b.id not in submission_ids


def test_review_queue_unassigned_view_requires_team_reviewer_role() -> None:
    db = get_database()
    team = Team(company_name="Review Queue Team Role Boundary", owner_user_id="review-queue-role-owner")
    reviewer_labeler = User(
        username="globalreviewerteamlabeler",
        email="global-reviewer-team-labeler@example.com",
        global_role="reviewer",
        email_verified=True,
    )
    db.add(team)
    db.add(reviewer_labeler)
    db.add(TeamMember(team_id=team.id, user_id=reviewer_labeler.id, team_role="labeler"))
    task = Task(team_id=team.id, owner_id="owner", title="Unassigned Team Review", status="published")
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="submitted")
    submission = Submission(team_id=team.id, task_id=task.id, question_id=question.id, labeler_id="labeler-a", status="submitted")
    for item in [task, question, submission]:
        db.add(item)
    db.commit()

    token = create_session_bound_access_token(reviewer_labeler.id, role=reviewer_labeler.global_role)
    response = client.get(
        "/api/v1/reviews/queue?assigned_only=false",
        headers={"Authorization": f"Bearer {token}", "X-Team-ID": team.id},
    )

    assert response.status_code == 200
    submission_ids = {item["submission_id"] for item in response.json()["data"]["items"]}
    assert submission.id not in submission_ids


def test_unassigned_manual_review_task_is_visible_to_all_team_reviewers() -> None:
    db = get_database()
    team = Team(company_name="Default Review Pool Team", owner_user_id="default-review-owner")
    reviewer_a = User(username="defaultreviewera", email="default-reviewer-a@example.com", global_role="reviewer", email_verified=True)
    reviewer_b = User(username="defaultreviewerb", email="default-reviewer-b@example.com", global_role="reviewer", email_verified=True)
    task = Task(team_id=team.id, owner_id="owner", title="Default Reviewer Pool Task", status="published", reviewer_ids=[])
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="submitted")
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id="labeler-a",
        status="submitted",
        submitted_at=datetime(2026, 5, 31, 12, 0, 0),
        task_submitted_at=datetime(2026, 5, 31, 12, 5, 0),
    )
    for item in [team, reviewer_a, reviewer_b, task, question, submission]:
        db.add(item)
    db.add(TeamMember(team_id=team.id, user_id=reviewer_a.id, team_role="reviewer", permissions=permissions_for_team_role("reviewer")))
    db.add(TeamMember(team_id=team.id, user_id=reviewer_b.id, team_role="reviewer", permissions=permissions_for_team_role("reviewer")))
    db.commit()

    reviewer_a_headers = {"Authorization": f"Bearer {create_session_bound_access_token(reviewer_a.id, role=reviewer_a.global_role)}", "X-Team-ID": team.id}
    reviewer_b_headers = {"Authorization": f"Bearer {create_session_bound_access_token(reviewer_b.id, role=reviewer_b.global_role)}", "X-Team-ID": team.id}

    reviewer_a_queue = client.get("/api/v1/reviews/queue", headers=reviewer_a_headers)
    assert reviewer_a_queue.status_code == 200
    assert reviewer_a_queue.json()["data"]["items"][0]["submission_id"] == submission.id
    assert {item["user_id"] for item in reviewer_a_queue.json()["data"]["items"][0]["responsible_reviewers"]} == {reviewer_a.id, reviewer_b.id}

    reviewer_b_queue = client.get("/api/v1/reviews/queue", headers=reviewer_b_headers)
    assert reviewer_b_queue.status_code == 200
    assert reviewer_b_queue.json()["data"]["items"][0]["submission_id"] == submission.id

    reviewer_b_detail = client.get(f"/api/v1/reviews/submissions/{submission.id}", headers=reviewer_b_headers)
    assert reviewer_b_detail.status_code == 200

    rejected = client.post(f"/api/v1/reviews/submissions/{submission.id}", headers=reviewer_b_headers, json={"decision": "rejected", "comment": "默认池 Reviewer 可处理"})
    assert rejected.status_code == 200
    assert rejected.json()["data"]["submission"]["status"] == "rejected"


def test_member_assigned_review_task_is_not_open_to_unassigned_reviewers() -> None:
    db = get_database()
    team = Team(company_name="Narrow Assigned Review Team", owner_user_id="narrow-review-owner")
    assigned = User(username="narrowassignedreviewer", email="narrow-assigned-reviewer@example.com", global_role="reviewer", email_verified=True)
    unassigned = User(username="narrowunassignedreviewer", email="narrow-unassigned-reviewer@example.com", global_role="reviewer", email_verified=True)
    task = Task(team_id=team.id, owner_id="owner", title="Narrow Assigned Review", status="published", reviewer_ids=[])
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="submitted")
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id="labeler-a",
        status="submitted",
        submitted_at=datetime(2026, 5, 31, 12, 0, 0),
        task_submitted_at=datetime(2026, 5, 31, 12, 5, 0),
    )
    for item in [team, assigned, unassigned, task, question, submission]:
        db.add(item)
    db.add(TeamMember(team_id=team.id, user_id=assigned.id, team_role="reviewer", assigned_review_tasks=[task.id], permissions=permissions_for_team_role("reviewer")))
    db.add(TeamMember(team_id=team.id, user_id=unassigned.id, team_role="reviewer", permissions=permissions_for_team_role("reviewer")))
    db.commit()

    assigned_headers = {"Authorization": f"Bearer {create_session_bound_access_token(assigned.id, role=assigned.global_role)}", "X-Team-ID": team.id}
    unassigned_headers = {"Authorization": f"Bearer {create_session_bound_access_token(unassigned.id, role=unassigned.global_role)}", "X-Team-ID": team.id}

    assigned_queue = client.get("/api/v1/reviews/queue", headers=assigned_headers)
    assert assigned_queue.status_code == 200
    assert assigned_queue.json()["data"]["items"][0]["submission_id"] == submission.id

    unassigned_queue = client.get("/api/v1/reviews/queue", headers=unassigned_headers)
    assert unassigned_queue.status_code == 200
    assert unassigned_queue.json()["data"]["items"] == []

    unassigned_review = client.post(f"/api/v1/reviews/submissions/{submission.id}", headers=unassigned_headers, json={"decision": "rejected", "comment": "不能越权"})
    assert unassigned_review.status_code == 403


def test_team_admin_and_owner_can_view_but_cannot_review_task_assigned_to_reviewer() -> None:
    db = get_database()
    team = Team(company_name="Manual Review Responsibility Team", owner_user_id="manual-review-owner")
    admin = User(username="manualreviewadmin", email="manual-review-admin@example.com", global_role="user", email_verified=True)
    owner = User(username="manualreviewowner", email="manual-review-owner@example.com", global_role="owner", email_verified=True)
    reviewer = User(username="manualreviewer", email="manual-reviewer@example.com", global_role="reviewer", email_verified=True)
    task = Task(team_id=team.id, owner_id=admin.id, title="Assigned Manual Review", status="published", reviewer_ids=[reviewer.id])
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="submitted")
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id="labeler-a",
        status="submitted",
        submitted_at=datetime(2026, 5, 31, 12, 0, 0),
        task_submitted_at=datetime(2026, 5, 31, 12, 5, 0),
    )
    for item in [team, admin, owner, reviewer, task, question, submission]:
        db.add(item)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin", permissions=permissions_for_team_role("team_admin")))
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner", permissions=permissions_for_team_role("owner")))
    db.add(TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer", assigned_review_tasks=[task.id], permissions=permissions_for_team_role("reviewer")))
    db.commit()

    admin_headers = {"Authorization": f"Bearer {create_session_bound_access_token(admin.id, role=admin.global_role)}", "X-Team-ID": team.id}
    owner_headers = {"Authorization": f"Bearer {create_session_bound_access_token(owner.id, role=owner.global_role)}", "X-Team-ID": team.id}
    reviewer_headers = {"Authorization": f"Bearer {create_session_bound_access_token(reviewer.id, role=reviewer.global_role)}", "X-Team-ID": team.id}

    admin_queue = client.get("/api/v1/reviews/queue?assigned_only=false", headers=admin_headers)
    assert admin_queue.status_code == 200
    assert admin_queue.json()["data"]["items"][0]["submission_id"] == submission.id

    admin_detail = client.get(f"/api/v1/reviews/submissions/{submission.id}?assigned_only=false", headers=admin_headers)
    assert admin_detail.status_code == 200

    admin_review = client.post(f"/api/v1/reviews/submissions/{submission.id}", headers=admin_headers, json={"decision": "approved"})
    assert admin_review.status_code == 403
    assert admin_review.json()["message"] == "只有当前任务分配的 Reviewer 可以提交审核结果"

    owner_queue = client.get("/api/v1/reviews/queue?assigned_only=false", headers=owner_headers)
    assert owner_queue.status_code == 200
    assert owner_queue.json()["data"]["items"][0]["submission_id"] == submission.id

    owner_detail = client.get(f"/api/v1/reviews/submissions/{submission.id}?assigned_only=false", headers=owner_headers)
    assert owner_detail.status_code == 200

    owner_review = client.post(f"/api/v1/reviews/submissions/{submission.id}", headers=owner_headers, json={"decision": "approved"})
    assert owner_review.status_code == 403

    reviewer_queue = client.get("/api/v1/reviews/queue", headers=reviewer_headers)
    assert reviewer_queue.status_code == 200
    assert reviewer_queue.json()["data"]["items"][0]["submission_id"] == submission.id


def test_request_task_assistance_adds_task_to_target_reviewer_and_unlocks_queue_access() -> None:
    db = get_database()
    team = Team(company_name="Task Assistance Team", owner_user_id="task-assist-owner")
    operator = User(username="taskassistoperator", email="task-assist-operator@example.com", global_role="user", email_verified=True)
    reviewer = User(username="taskassistreviewer", email="task-assist-reviewer@example.com", global_role="user", email_verified=True)
    task = Task(team_id=team.id, owner_id=operator.id, title="Assistance Task", status="published")
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="submitted")
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id="labeler-a",
        status="submitted",
        task_submitted_at=datetime(2026, 5, 31, 12, 0, 0),
    )
    for item in [team, operator, reviewer, task, question, submission]:
        db.add(item)
    db.add(TeamMember(team_id=team.id, user_id=operator.id, team_role="team_admin", permissions=permissions_for_team_role("team_admin")))
    db.add(TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer", permissions=permissions_for_team_role("reviewer")))
    db.commit()

    operator_headers = {
        "Authorization": f"Bearer {create_session_bound_access_token(operator.id, role=operator.global_role)}",
        "X-Team-ID": team.id,
    }
    response = client.post(
        f"/api/v1/tasks/{task.id}/request-assistance",
        headers=operator_headers,
        json={"target_reviewer_id": reviewer.id, "submission_ids": [submission.id], "reason": "临时协助"},
    )
    assert response.status_code == 200
    member = db.find_one(TeamMember, {"team_id": team.id, "user_id": reviewer.id})
    assert member is not None
    assert task.id in member.assigned_review_tasks
    payload = response.json()["data"]
    assert payload["task_id"] == task.id
    assert payload["submission_ids"] == [submission.id]
    assert payload["already_assigned"] is False

    audit_log = db.find_one(AuditLog, {"team_id": team.id, "entity_id": task.id, "action": "task_assistance_requested"})
    assert audit_log is not None
    assert audit_log.changes["target_reviewer_id"] == reviewer.id
    assert audit_log.changes["submission_ids"] == [submission.id]

    reviewer_headers = {
        "Authorization": f"Bearer {create_session_bound_access_token(reviewer.id, role=reviewer.global_role)}",
        "X-Team-ID": team.id,
    }
    review_queue = client.get("/api/v1/reviews/queue", headers=reviewer_headers)
    assert review_queue.status_code == 200
    assert review_queue.json()["data"]["summary"]["pending"] == 1
    assert review_queue.json()["data"]["items"][0]["task_id"] == task.id


def test_assigned_reviewer_can_request_task_assistance() -> None:
    db = get_database()
    team = Team(company_name="Reviewer Assistance Team", owner_user_id="reviewer-assist-owner")
    reviewer = User(username="reviewerassistoperator", email="reviewer-assist-operator@example.com", global_role="user", email_verified=True)
    target_reviewer = User(username="reviewerassisttarget", email="reviewer-assist-target@example.com", global_role="user", email_verified=True)
    task = Task(team_id=team.id, owner_id="owner-a", title="Reviewer Assistance Task", status="published")
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="submitted")
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id="labeler-a",
        status="submitted",
        task_submitted_at=datetime(2026, 5, 31, 12, 0, 0),
    )
    for item in [team, reviewer, target_reviewer, task, question, submission]:
        db.add(item)
    db.add(TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer", assigned_review_tasks=[task.id], permissions=permissions_for_team_role("reviewer")))
    db.add(TeamMember(team_id=team.id, user_id=target_reviewer.id, team_role="reviewer", permissions=permissions_for_team_role("reviewer")))
    db.commit()

    response = client.post(
        f"/api/v1/tasks/{task.id}/request-assistance",
        headers={
            "Authorization": f"Bearer {create_session_bound_access_token(reviewer.id, role=reviewer.global_role)}",
            "X-Team-ID": team.id,
        },
        json={"target_reviewer_id": target_reviewer.id, "submission_ids": [submission.id], "reason": "请求同组协助"},
    )

    assert response.status_code == 200
    target_member = db.find_one(TeamMember, {"team_id": team.id, "user_id": target_reviewer.id})
    assert target_member is not None
    assert task.id in target_member.assigned_review_tasks
    assert response.json()["data"]["submission_ids"] == [submission.id]


def test_review_queue_processed_view_includes_rejected_submissions() -> None:
    db = get_database()
    team = Team(company_name="Processed Review Queue Team", owner_user_id="processed-review-owner")
    reviewer = User(username="processedreviewer", email="processed-reviewer@example.com", global_role="user", email_verified=True)
    task = Task(team_id=team.id, owner_id=reviewer.id, title="Processed Queue Task", status="published")
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="rejected")
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id="labeler-a",
        status="rejected",
        task_submitted_at=datetime(2026, 5, 31, 12, 0, 0),
    )
    for item in [team, reviewer, task, question, submission]:
        db.add(item)
    db.add(TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer", assigned_review_tasks=[task.id], permissions=permissions_for_team_role("reviewer")))
    db.commit()

    headers = {
        "Authorization": f"Bearer {create_session_bound_access_token(reviewer.id, role=reviewer.global_role)}",
        "X-Team-ID": team.id,
    }
    response = client.get("/api/v1/reviews/queue?status=processed", headers=headers)
    assert response.status_code == 200
    assert response.json()["data"]["summary"]["pending"] == 1
    assert response.json()["data"]["items"][0]["submission_id"] == submission.id


def test_labeler_my_tasks_hides_removed_or_finished_tasks() -> None:
    db = get_database()
    team = Team(company_name="Hidden Label Task Team", owner_user_id="hidden-owner")
    labeler = User(username="hiddenlabeler", email="hiddenlabeler@example.com", global_role="labeler", email_verified=True)
    db.add(team)
    db.add(labeler)
    active_task = Task(team_id=team.id, owner_id="owner", title="仍可批注任务", status="published")
    finished_task = Task(team_id=team.id, owner_id="owner", title="已移除任务", status="finished")
    db.add(active_task)
    db.add(finished_task)
    db.add(Question(team_id=team.id, task_id=active_task.id, row_index=0, content={"text": "A"}, status="claimed", assigned_to=labeler.id))
    db.add(Question(team_id=team.id, task_id=finished_task.id, row_index=0, content={"text": "B"}, status="claimed", assigned_to=labeler.id))
    db.commit()
    labeler_headers = {"Authorization": f"Bearer {create_session_bound_access_token(labeler.id, role=labeler.global_role)}"}

    response = client.get("/api/v1/labels/my-tasks", headers=labeler_headers)

    assert response.status_code == 200
    task_titles = [item["task"]["title"] for item in response.json()["data"]["items"]]
    assert "仍可批注任务" in task_titles
    assert "已移除任务" not in task_titles


def test_task_claim_audit_log_is_visible_in_team_scope() -> None:
    db = get_database()
    team = Team(company_name="Claim Audit Team", owner_user_id="claim-audit-owner")
    owner = User(username="claimauditowner", email="claim-audit-owner@example.com", global_role="user", email_verified=True)
    labeler = User(username="claimauditlabeler", email="claim-audit-labeler@example.com", global_role="labeler", email_verified=True)
    for item in [team, owner, labeler]:
        db.add(item)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    task = Task(
        team_id=team.id,
        owner_id=owner.id,
        title="领取审计任务",
        status="published",
        reward_rule={"bundle_options": [1]},
        stats={"total": 1, "claimed": 0, "submitted": 0, "approved": 0, "rejected": 0},
    )
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="pending")
    db.add(task)
    db.add(question)
    db.commit()
    labeler_headers = {"Authorization": f"Bearer {create_session_bound_access_token(labeler.id, role=labeler.global_role)}"}
    owner_headers = {"Authorization": f"Bearer {create_session_bound_access_token(owner.id, role=owner.global_role)}", "X-Team-ID": team.id}

    claimed = client.post(f"/api/v1/labels/tasks/{task.id}/claim", headers=labeler_headers, json={"bundle_size": 1})
    assert claimed.status_code == 200

    audit_logs = client.get(
        f"/api/v1/audit-logs?entity_type=task&entity_id={task.id}&action=task_bundle_claimed",
        headers=owner_headers,
    )

    assert audit_logs.status_code == 200
    items = audit_logs.json()["data"]["items"]
    assert len(items) == 1
    assert items[0]["team_id"] == team.id
    assert items[0]["operator_id"] == labeler.id
    assert items[0]["changes"]["bundle_size"] == 1


def test_non_labeler_cannot_claim_public_task_bundle() -> None:
    db = get_database()
    team = Team(company_name="Claim Role Boundary Team", owner_user_id="claim-role-owner")
    admin = User(username="claimroleadmin", email="claim-role-admin@example.com", global_role="admin", email_verified=True)
    db.add(team)
    db.add(admin)
    task = Task(
        team_id=team.id,
        owner_id="owner",
        title="Public task for labelers only",
        description="Only labelers should claim",
        status="published",
        reward_rule={"bundle_options": [1]},
        stats={"total": 1, "claimed": 0, "submitted": 0, "approved": 0, "rejected": 0},
    )
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="pending")
    db.add(task)
    db.add(question)
    db.commit()
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(admin.id, role=admin.global_role)}"}

    response = client.post(f"/api/v1/labels/tasks/{task.id}/claim", headers=headers, json={"bundle_size": 1})

    assert response.status_code == 403
    persisted_question = db.get(Question, question.id)
    assert persisted_question.status == "pending"
    assert persisted_question.assigned_to is None
    assert db.find_one(Submission, {"question_id": question.id, "labeler_id": admin.id}) is None


def test_labeler_can_register_and_login() -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Labeler One",
            "username": "labeler01",
            "email": "labeler@example.com",
            "password": "SecurePass123!",
            "role": "labeler",
            "email_code": "anything",
        },
    )
    assert response.status_code == 200

    response = client.post("/api/v1/auth/login", json={"account": "labeler@example.com", "password": "SecurePass123!"})
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["access_token"]
    assert data["user"]["role"] == "labeler"
    assert data["user"]["display_name"] == "Labeler One"

    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {data['access_token']}"})
    assert me.status_code == 200
    assert me.json()["data"]["display_name"] == "Labeler One"


def test_pending_user_onboarding_labeler_and_organization_flows() -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Pending Display",
            "username": "pending01",
            "email": "pending@example.com",
            "password": "SecurePass123!",
            "role": "pending",
            "email_code": "",
        },
    )
    assert response.status_code == 200

    login = client.post("/api/v1/auth/login", json={"account": "pending@example.com", "password": "SecurePass123!"})
    assert login.status_code == 200
    assert login.json()["data"]["user"]["role"] == "pending"
    token = login.json()["data"]["access_token"]

    labeler = client.post(
        "/api/v1/auth/onboarding/complete",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "identity": "labeler",
            "labeler_profile": {
                "domains": "law, finance",
                "qualification": "law",
                "task_types": "text",
                "experience": "contract labeling",
            },
        },
    )
    assert labeler.status_code == 200
    assert labeler.json()["data"]["user"]["role"] == "labeler"

    create_response = client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Org Pending",
            "username": "orgpending01",
            "email": "orgpending@example.com",
            "password": "SecurePass123!",
            "role": "pending",
            "email_code": "",
        },
    )
    assert create_response.status_code == 200
    org_login = client.post("/api/v1/auth/login", json={"account": "orgpending@example.com", "password": "SecurePass123!"})
    org_token = org_login.json()["data"]["access_token"]
    onboard_org = client.post(
        "/api/v1/auth/onboarding/complete",
        headers={"Authorization": f"Bearer {org_token}"},
        json={
            "identity": "requester",
            "organization_action": "create",
            "organization_profile": {
                "company_name": "Onboarding Org",
                "industry": "AI",
                "contact_name": "Owner",
                "contact_phone": "13800000000",
                "business_description": "data tasks",
            },
        },
    )
    assert onboard_org.status_code == 200
    assert onboard_org.json()["data"]["user"]["role"] == "admin"
    overview = client.get("/api/v1/teams/admin/overview", headers={"Authorization": f"Bearer {onboard_org.json()['data']['access_token']}"})
    assert overview.status_code == 200
    assert overview.json()["data"]["teams"][0]["company_name"] == "Onboarding Org"

    team_id = overview.json()["data"]["teams"][0]["team_id"]
    admin_headers = {"Authorization": f"Bearer {onboard_org.json()['data']['access_token']}", "X-Team-ID": team_id}
    code_invite = client.post(
        f"/api/v1/teams/{team_id}/invite",
        headers=admin_headers,
        json={"invite_mode": "code", "team_role": "owner"},
    )
    assert code_invite.status_code == 200
    assert code_invite.json()["data"]["invite_mode"] == "code"

    join_response = client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Join Pending",
            "username": "joinpending01",
            "email": "joinpending@example.com",
            "password": "SecurePass123!",
            "role": "pending",
            "email_code": "",
        },
    )
    assert join_response.status_code == 200
    join_login = client.post("/api/v1/auth/login", json={"account": "joinpending@example.com", "password": "SecurePass123!"})
    assert join_login.status_code == 200
    join_token = join_login.json()["data"]["access_token"]
    join_org = client.post(
        "/api/v1/auth/onboarding/complete",
        headers={"Authorization": f"Bearer {join_token}"},
        json={
            "identity": "requester",
            "organization_action": "join",
            "invite_code": code_invite.json()["data"]["invite_code"],
        },
    )
    assert join_org.status_code == 200
    assert join_org.json()["data"]["user"]["role"] == "user"
    assert join_org.json()["data"]["user"]["team_role"] == "owner"


def test_onboarding_rejects_non_pending_user_without_role_change() -> None:
    db = get_database()
    labeler = User(
        username="onboardinglabeler",
        email="onboarding-labeler@example.com",
        password_hash=auth_service.hash_password("SecurePass123!"),
        global_role="labeler",
        email_verified=True,
    )
    db.add(labeler)
    db.add(UserProfile(user_id=labeler.id, display_name="Onboarding Labeler"))
    db.commit()
    token = create_session_bound_access_token(labeler.id, role=labeler.global_role)

    response = client.post(
        "/api/v1/auth/onboarding/complete",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "identity": "requester",
            "organization_action": "create",
            "organization_profile": {
                "company_name": "Labeler Escalation Team",
                "industry": "AI",
                "contact_name": "Owner",
                "contact_phone": "13800000000",
                "business_description": "data tasks",
            },
        },
    )

    assert response.status_code == 409
    persisted = db.get(User, labeler.id)
    assert persisted.global_role == "labeler"
    assert db.find_one(Team, {"company_name": "Labeler Escalation Team"}) is None
    assert db.find_one(TeamMember, {"user_id": labeler.id}) is None


def test_onboarding_create_failure_keeps_pending_role() -> None:
    db = get_database()
    existing_team = Team(company_name="Duplicate Onboarding Team", owner_user_id="existing-owner")
    pending = User(
        username="duplicatepending",
        email="duplicate-pending@example.com",
        password_hash=auth_service.hash_password("SecurePass123!"),
        global_role="pending",
        email_verified=True,
    )
    db.add(existing_team)
    db.add(pending)
    db.add(UserProfile(user_id=pending.id, display_name="Duplicate Pending"))
    db.commit()
    token = create_session_bound_access_token(pending.id, role=pending.global_role)

    response = client.post(
        "/api/v1/auth/onboarding/complete",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "identity": "requester",
            "organization_action": "create",
            "organization_profile": {
                "company_name": "Duplicate Onboarding Team",
                "industry": "AI",
                "contact_name": "Owner",
                "contact_phone": "13800000000",
                "business_description": "data tasks",
            },
        },
    )

    assert response.status_code == 409
    persisted = db.get(User, pending.id)
    assert persisted.global_role == "pending"
    assert db.find_one(TeamMember, {"user_id": pending.id}) is None


def test_register_requires_valid_username_for_pending_flow() -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Long Account User",
            "username": "long_account_name_for_markup_reg",
            "email": "long-account@example.com",
            "password": "SecurePass123!",
            "role": "pending",
            "email_code": "",
        },
    )
    assert response.status_code == 200

    login = client.post(
        "/api/v1/auth/login",
        json={"account": "long_account_name_for_markup_reg", "password": "SecurePass123!"},
    )
    assert login.status_code == 200
    assert login.json()["data"]["user"]["role"] == "pending"


def test_user_can_register_and_reset_password() -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Reset User",
            "username": "resetuser",
            "email": "reset-user@example.com",
            "password": "SecurePass123!",
            "role": "labeler",
            "email_code": "",
        },
    )
    assert response.status_code == 200
    assert response.json()["data"]["role"] == "labeler"

    reset_code = send_code_for("reset-user@example.com", "reset_password")
    response = client.post(
        "/api/v1/auth/password/reset",
        json={
            "email": "reset-user@example.com",
            "email_code": reset_code,
            "new_password": "NewSecurePass123!",
        },
    )
    assert response.status_code == 200

    old_login = client.post("/api/v1/auth/login", json={"account": "reset-user@example.com", "password": "SecurePass123!"})
    assert old_login.status_code == 401

    new_login = client.post("/api/v1/auth/login", json={"account": "reset-user@example.com", "password": "NewSecurePass123!"})
    assert new_login.status_code == 200
    assert new_login.json()["data"]["user"]["role"] == "labeler"


def test_email_confirm_does_not_consume_reset_password_code() -> None:
    db = get_database()
    user = User(
        username="confirmresetuser",
        email="confirm-reset-user@example.com",
        password_hash=auth_service.hash_password("OldSecurePass123!"),
        global_role="labeler",
        email_verified=True,
    )
    db.add(user)
    db.commit()
    reset_code = send_code_for(user.email, "reset_password")

    confirmed = client.post(
        "/api/v1/auth/email/confirm",
        json={"email": user.email, "code": reset_code, "purpose": "reset_password"},
    )
    assert confirmed.status_code == 200

    reset = client.post(
        "/api/v1/auth/password/reset",
        json={
            "email": user.email,
            "email_code": reset_code,
            "new_password": "NewSecurePass123!",
        },
    )

    assert reset.status_code == 200
    assert auth_service.verify_password("NewSecurePass123!", db.get(User, user.id).password_hash)


def test_team_admin_can_register_team_and_invite_roles() -> None:
    code = send_code("admin@example.com")
    response = client.post(
        "/api/v1/auth/register/admin",
        json={
            "display_name": "Admin One",
            "email": "admin@example.com",
            "password": "SecurePass123!",
            "username": "admin01",
            "email_code": code,
        },
    )
    assert response.status_code == 200

    login = client.post("/api/v1/auth/login", json={"account": "admin@example.com", "password": "SecurePass123!"})
    token = login.json()["data"]["access_token"]
    response = client.post(
        "/api/v1/teams",
        headers={"Authorization": f"Bearer {token}"},
        json={"company_name": "Demo Team", "industry": "AI"},
    )
    assert response.status_code == 200
    team_id = response.json()["data"]["team_id"]
    headers = {"Authorization": f"Bearer {token}", "X-Team-ID": team_id}

    for role in ["owner", "reviewer"]:
        response = client.post(
            f"/api/v1/teams/{team_id}/invite",
            headers=headers,
            json={"invite_mode": "email", "email": f"{role}@example.com", "team_role": role},
        )
        assert response.status_code == 200
        assert response.json()["data"]["invite_code"].startswith("TM-INV-")
        assert response.json()["data"]["invite_mode"] == "email"

    code_invitation = client.post(
        f"/api/v1/teams/{team_id}/invite",
        headers=headers,
        json={"invite_mode": "code", "team_role": "labeler"},
    )
    assert code_invitation.status_code == 200
    assert code_invitation.json()["data"]["invite_mode"] == "code"
    assert code_invitation.json()["data"]["email"] is None
    assert code_invitation.json()["data"]["invite_url"].startswith("http://localhost:5173/onboarding?organization_action=join&invite_code=TM-INV-")

    blocked_agent_invite = client.post(
        f"/api/v1/teams/{team_id}/invite",
        headers=headers,
        json={"invite_mode": "email", "email": "agent@example.com", "team_role": "agent"},
    )
    assert blocked_agent_invite.status_code == 400
    assert blocked_agent_invite.json()["code"] == 40001

    invitations = client.get(f"/api/v1/teams/{team_id}/invitations", headers=headers)
    assert invitations.status_code == 200
    invitation_items = invitations.json()["data"]["items"]
    assert len(invitation_items) == 3
    assert {item["email"] for item in invitation_items if item["email"]} == {"owner@example.com", "reviewer@example.com"}
    assert all(item["status"] == "pending" for item in invitation_items)
    assert any(item["invite_mode"] == "code" and item["email"] is None for item in invitation_items)
    target_invitation = next(item for item in invitation_items if item["email"] == "reviewer@example.com")
    code_invitation_record = next(item for item in invitation_items if item["invite_mode"] == "code")

    resend = client.post(
        f"/api/v1/teams/{team_id}/invitations/{target_invitation['invitation_id']}/resend",
        headers=headers,
        json={"message": "请重新加入企业", "expire_hours": 24},
    )
    assert resend.status_code == 200
    assert resend.json()["data"]["invite_code"].startswith("TM-INV-")
    assert resend.json()["data"]["invite_url"].startswith("http://localhost:5173/onboarding?organization_action=join&invite_code=TM-INV-")
    assert resend.json()["data"]["status"] == "pending"

    resend_code = client.post(
        f"/api/v1/teams/{team_id}/invitations/{code_invitation_record['invitation_id']}/resend",
        headers=headers,
        json={"message": "重新生成邀请码", "expire_hours": 24},
    )
    assert resend_code.status_code == 200
    assert resend_code.json()["data"]["invite_mode"] == "code"
    assert resend_code.json()["data"]["invite_code"].startswith("TM-INV-")
    assert resend_code.json()["data"]["invite_url"].startswith("http://localhost:5173/onboarding?organization_action=join&invite_code=TM-INV-")

    revoke = client.post(
        f"/api/v1/teams/{team_id}/invitations/{target_invitation['invitation_id']}/revoke",
        headers=headers,
        json={"reason": "测试撤销"},
    )
    assert revoke.status_code == 200
    assert revoke.json()["data"]["status"] == "revoked"

    revoked_items = client.get(f"/api/v1/teams/{team_id}/invitations?status=revoked", headers=headers)
    assert revoked_items.status_code == 200
    assert revoked_items.json()["data"]["items"][0]["email"] == "reviewer@example.com"

    db = get_database()
    audit_actions = {item["action"] for item in db.collection("audit_logs").find({"entity_type": "team_invitation"})}
    assert {"member_invited", "invitation_resent", "invitation_revoked"}.issubset(audit_actions)


def test_admin_register_create_team_and_create_member_account() -> None:
    code = send_code("admin2@example.com")
    response = client.post(
        "/api/v1/auth/register/admin",
        json={
            "display_name": "Admin Two",
            "username": "admin02",
            "email": "admin2@example.com",
            "password": "SecurePass123!",
            "email_code": code,
        },
    )
    assert response.status_code == 200
    assert response.json()["data"]["role"] == "admin"

    login = client.post("/api/v1/auth/login", json={"account": "admin2@example.com", "password": "SecurePass123!"})
    token = login.json()["data"]["access_token"]
    create_team = client.post(
        "/api/v1/teams",
        headers={"Authorization": f"Bearer {token}"},
        json={"company_name": "Admin Flow Team", "industry": "AI", "description": "demo"},
    )
    assert create_team.status_code == 200
    team_id = create_team.json()["data"]["team_id"]
    team_admin_id = create_team.json()["data"]["owner_user_id"]
    headers = {"Authorization": f"Bearer {token}", "X-Team-ID": team_id}
    system_agent_member = next(item for item in create_team.json()["data"]["member_stats"].items() if item[0] == "agents")
    assert system_agent_member[1] == 1

    member = client.post(
        f"/api/v1/teams/{team_id}/members/accounts",
        headers=headers,
        json={
            "display_name": "Owner Two",
            "username": "owner02",
            "email": "owner2@example.com",
            "password": "SecurePass123!",
            "team_role": "owner",
        },
    )
    assert member.status_code == 200
    assert member.json()["data"]["team_role"] == "owner"
    assert member.json()["data"]["display_name"] == "Owner Two"
    assert member.json()["data"]["team_role_label"] == "任务发布者"
    owner_member_id = member.json()["data"]["user_id"]

    reviewer_member = client.post(
        f"/api/v1/teams/{team_id}/members/accounts",
        headers=headers,
        json={
            "display_name": "Reviewer Two",
            "username": "reviewer02",
            "email": "reviewer2@example.com",
            "password": "SecurePass123!",
            "team_role": "reviewer",
        },
    )
    assert reviewer_member.status_code == 200
    blocked_agent_member = client.post(
        f"/api/v1/teams/{team_id}/members/accounts",
        headers=headers,
        json={
            "display_name": "Agent Two",
            "username": "agent02",
            "email": "agent2@example.com",
            "password": "SecurePass123!",
            "team_role": "agent",
        },
    )
    assert blocked_agent_member.status_code == 400
    assert blocked_agent_member.json()["code"] == 40001

    owner_login = client.post("/api/v1/auth/login", json={"account": "owner2@example.com", "password": "SecurePass123!"})
    assert owner_login.status_code == 200
    owner_token = owner_login.json()["data"]["access_token"]
    owner_headers = {"Authorization": f"Bearer {owner_token}", "X-Team-ID": team_id}
    owner_auth_headers = {"Authorization": f"Bearer {owner_token}"}

    owner_overview = client.get("/api/v1/teams/admin/overview", headers=owner_auth_headers)
    assert owner_overview.status_code == 200
    assert owner_overview.json()["data"]["default_team_id"] == team_id
    assert owner_overview.json()["data"]["team_count"] == 1

    owner_team = client.get(f"/api/v1/teams/{team_id}", headers=owner_headers)
    assert owner_team.status_code == 200
    assert owner_team.json()["data"]["company_name"] == "Admin Flow Team"

    owner_members = client.get(f"/api/v1/teams/{team_id}/members?status=active", headers=owner_headers)
    assert owner_members.status_code == 200
    assert any(item["team_role"] == "owner" for item in owner_members.json()["data"]["items"])
    agent_member = next(item for item in owner_members.json()["data"]["items"] if item["team_role"] == "agent")
    assert agent_member["is_system_member"] is True
    assert agent_member["display_name"] == "Agent"
    assert agent_member["team_role_label"] == "Agent"
    assert agent_member["avatar"] == "/agent-avatars/agent-orbit.svg"
    assert agent_member["actions"] == {"can_edit": False, "can_remove": False, "can_disable": False}

    agent_settings = client.get(f"/api/v1/teams/{team_id}/agent-settings", headers=headers)
    assert agent_settings.status_code == 200
    assert agent_settings.json()["data"]["display_name"] == "Agent"
    assert agent_settings.json()["data"]["role_label"] == "Agent"
    assert agent_settings.json()["data"]["default_avatar_url"] == "/agent-avatars/agent-orbit.svg"
    assert agent_settings.json()["data"]["preset_avatar_options"][0]["key"] == "agent-orbit"

    owner_agent_settings_update = client.put(
        f"/api/v1/teams/{team_id}/agent-settings",
        headers=owner_headers,
        json={"display_name": "Owner Agent", "avatar": "/agent-avatars/agent-grid.svg", "preset_avatar_key": "agent-grid"},
    )
    assert owner_agent_settings_update.status_code == 403

    updated_agent_settings = client.put(
        f"/api/v1/teams/{team_id}/agent-settings",
        headers=headers,
        json={"display_name": "Review Agent", "avatar": "/agent-avatars/agent-grid.svg", "preset_avatar_key": "agent-grid"},
    )
    assert updated_agent_settings.status_code == 200
    assert updated_agent_settings.json()["data"]["display_name"] == "Review Agent"
    assert updated_agent_settings.json()["data"]["avatar"] == "/agent-avatars/agent-grid.svg"
    assert updated_agent_settings.json()["data"]["preset_avatar_key"] == "agent-grid"

    db = get_database()
    agent_audit = db.collection("audit_logs").find_one(
        {"entity_type": "system_agent", "entity_id": agent_member["user_id"], "action": "system_agent_settings_updated"}
    )
    assert agent_audit is not None

    reviewer_member_id = reviewer_member.json()["data"]["user_id"]
    assign_review_tasks = client.put(
        f"/api/v1/teams/{team_id}/members/{reviewer_member_id}",
        headers=owner_headers,
        json={"assigned_review_tasks": ["review-task-1", "review-task-2"]},
    )
    assert assign_review_tasks.status_code == 200
    assert assign_review_tasks.json()["data"]["assigned_tasks"] == ["review-task-1", "review-task-2"]

    db = get_database()
    task_id = generate_object_id()
    task_doc = db.collection("tasks").insert_one(
        {
            "_id": task_id,
            "team_id": team_id,
            "owner_id": owner_member_id,
            "title": "负责人转交任务",
            "description": "用于测试任务 ownership 转交",
            "rich_content": None,
            "tags": ["交接"],
            "status": "draft",
            "category": "text",
            "difficulty": "easy",
            "deadline": None,
            "quota": 0,
            "distribution": "first_come_all",
            "reward_rule": {"mode": "item", "points_per_item": 1},
            "reviewer_ids": [],
            "ai_config": {},
            "qualification_rules": {},
            "required_certs": [],
            "template_id": "template-transfer",
            "template_version_id": "template-transfer:v1",
            "dataset_id": "dataset-transfer",
            "column_mapping": {},
            "assignment": {"enabled": False},
            "stats": {"total": 0, "claimed": 0, "submitted": 0, "approved": 0, "rejected": 0},
        }
    ).inserted_id
    transfer_owner = client.post(
        f"/api/v1/tasks/{task_doc}/owner-transfer",
        headers=owner_headers,
        json={"target_owner_id": team_admin_id, "reason": "项目交接"},
    )
    assert transfer_owner.status_code == 200
    assert transfer_owner.json()["data"]["owner_id"] == team_admin_id
    assert db.collection("tasks").find_one({"_id": task_doc})["owner_id"] == team_admin_id
    transfer_owner_logs = client.get(f"/api/v1/audit-logs?entity_type=task&action=task_owner_transferred", headers=owner_headers)
    assert transfer_owner_logs.status_code == 200
    assert transfer_owner_logs.json()["data"]["items"][0]["changes"]["from_owner_id"] == owner_member_id
    assert transfer_owner_logs.json()["data"]["items"][0]["changes"]["to_owner_id"] == team_admin_id

    blocked_transfer_owner = client.post(
        f"/api/v1/tasks/{task_doc}/owner-transfer",
        headers=owner_headers,
        json={"target_owner_id": reviewer_member_id, "reason": "错误角色"},
    )
    assert blocked_transfer_owner.status_code == 403

    batch_role = client.post(
        f"/api/v1/teams/{team_id}/members/batch-role",
        headers=owner_headers,
        json={
            "user_ids": [reviewer_member_id, agent_member["user_id"], owner_member_id],
            "team_role": "labeler",
        },
    )
    assert batch_role.status_code == 200
    assert batch_role.json()["data"]["updated_count"] == 1
    assert batch_role.json()["data"]["skipped_count"] == 2
    assert all(item["team_role"] == "labeler" for item in batch_role.json()["data"]["members"])
    role_logs = client.get(f"/api/v1/audit-logs?entity_type=team_member&action=member_role_batch_updated", headers=owner_headers)
    assert role_logs.status_code == 200
    assert len(role_logs.json()["data"]["items"]) >= 1

    security_reminder = client.post(
        f"/api/v1/teams/{team_id}/members/security-reminders",
        headers=owner_headers,
        json={
            "user_ids": [reviewer_member.json()["data"]["user_id"], agent_member["user_id"], "missing-user"],
            "title": "账号安全提醒",
            "content": "请尽快开启双重验证并确认邮箱。",
        },
    )
    assert security_reminder.status_code == 200
    reminder_data = security_reminder.json()["data"]
    assert reminder_data["sent_count"] == 1
    assert reminder_data["skipped_count"] == 2
    assert reminder_data["notification"]["target_type"] == "member"
    assert set(reminder_data["notification"]["target_user_ids"]) == {reviewer_member.json()["data"]["user_id"]}
    reminder_logs = client.get(f"/api/v1/audit-logs?entity_type=team_member&action=member_security_reminder_sent", headers=owner_headers)
    assert reminder_logs.status_code == 200
    assert reminder_logs.json()["data"]["items"][0]["changes"]["sent_count"] == 1

    existing_outsider = User(
        username="existingoutsider",
        email="existing-outsider@example.com",
        password_hash=auth_service.hash_password("SecurePass123!"),
        global_role="labeler",
        email_verified=True,
    )
    db.add(existing_outsider)
    db.add(UserProfile(user_id=existing_outsider.id, display_name="Existing Outsider"))
    team = db.get(Team, team_id)
    assert team is not None
    team.membership_plan = "basic"
    db.save(team)
    db.commit()

    import_members = client.post(
        f"/api/v1/teams/{team_id}/members/import",
        headers=owner_headers,
        json={
            "default_password": "SecurePass123!",
            "rows": [
                {"email": "imported-labeler@example.com", "team_role": "labeler", "username": "importedlabeler", "display_name": "Imported Labeler"},
                {"email": "existing-outsider@example.com", "team_role": "reviewer"},
                {"email": "agent2@example.com", "team_role": "agent"},
                {"email": "imported-labeler@example.com", "team_role": "reviewer", "username": "duplicateimport"},
                {"email": "missing-display@example.com", "team_role": "labeler", "username": "missingdisplay"},
                {"email": "invalid-username@example.com", "team_role": "labeler", "username": "BadName", "display_name": "Invalid Username"},
            ],
        },
    )
    assert import_members.status_code == 200
    import_data = import_members.json()["data"]
    assert import_data["requested_count"] == 6
    assert import_data["imported_count"] == 2
    assert import_data["skipped_count"] == 4
    assert {member["email"] for member in import_data["members"]} == {"imported-labeler@example.com", "existing-outsider@example.com"}
    existing_member = next(member for member in import_data["members"] if member["email"] == "existing-outsider@example.com")
    assert existing_member["team_role"] == "reviewer"
    assert existing_member["display_name"] == "Existing Outsider"
    assert any(result["reason"] == "Agent 为系统角色，不支持人工创建、修改或邀请" for result in import_data["results"] if result["status"] == "skipped")
    assert any("display_name" in result["reason"] for result in import_data["results"] if result["status"] == "skipped")
    assert any("小写字母" in result["reason"] for result in import_data["results"] if result["status"] == "skipped")
    import_logs = client.get(f"/api/v1/audit-logs?entity_type=team_member&action=member_account_imported", headers=owner_headers)
    assert import_logs.status_code == 200
    assert any(item["changes"]["email"] == "imported-labeler@example.com" for item in import_logs.json()["data"]["items"])
    existing_import_logs = client.get(f"/api/v1/audit-logs?entity_type=team_member&action=member_imported", headers=owner_headers)
    assert existing_import_logs.status_code == 200
    assert any(item["changes"]["email"] == "existing-outsider@example.com" for item in existing_import_logs.json()["data"]["items"])
    import_summary_logs = client.get(f"/api/v1/audit-logs?entity_type=team&action=member_batch_import_completed", headers=owner_headers)
    assert import_summary_logs.status_code == 200
    assert import_summary_logs.json()["data"]["items"][0]["changes"]["imported_count"] == 2

    owner_update = client.put(
        f"/api/v1/teams/{team_id}",
        headers=owner_headers,
        json={
            "description": "owner can maintain team",
            "billing_info": {
                "invoice_type": "special",
                "invoice_title": "Admin Flow Team",
                "tax_number": "91310000FLOW",
                "invoice_address": "Shanghai Pudong",
                "invoice_phone": "021-12345678",
                "bank_name": "招商银行上海分行",
                "bank_account": "6222020000000000",
                "invoice_email": "finance@example.com",
                "invoice_remark": "按月开票",
            },
            "mailing_info": {
                "recipient_name": "Owner Two",
                "recipient_phone": "13800138000",
                "region": "上海市 浦东新区",
                "detail_address": "世纪大道 100 号",
                "postal_code": "200120",
                "address_alias": "总部",
                "is_default": True,
            },
        },
    )
    assert owner_update.status_code == 200
    assert owner_update.json()["data"]["description"] == "owner can maintain team"
    assert owner_update.json()["data"]["billing_info"]["invoice_title"] == "Admin Flow Team"
    assert owner_update.json()["data"]["mailing_info"]["recipient_name"] == "Owner Two"

    verification = client.post(
        f"/api/v1/teams/{team_id}/verification",
        headers=owner_headers,
        json={
            "legal_name": "Admin Flow Team Ltd.",
            "registration_number": "91310000DEMO",
            "verification_contact": "Owner Two",
            "verification_phone": "13800138000",
            "verification_materials": ["https://files.example.com/license.pdf"],
        },
    )
    assert verification.status_code == 200
    verification_data = verification.json()["data"]
    assert verification_data["verification_status"] == "pending_review"
    assert verification_data["legal_name"] == "Admin Flow Team Ltd."
    assert verification_data["verification_materials"] == ["https://files.example.com/license.pdf"]

    verification_logs = client.get(f"/api/v1/audit-logs?entity_type=team&entity_id={team_id}", headers=owner_headers)
    assert verification_logs.status_code == 200
    assert any(item["action"] == "team_verification_submitted" for item in verification_logs.json()["data"]["items"])

    notification = client.post(
        f"/api/v1/notifications?team_id={team_id}",
        headers=owner_headers,
        json={"title": "企业排班通知", "content": "本周完成复审排班。", "priority": "important", "target_type": "team"},
    )
    assert notification.status_code == 200
    notification_id = notification.json()["data"]["notification_id"]

    revoked_notification = client.post(
        f"/api/v1/notifications/{notification_id}/revoke?team_id={team_id}",
        headers=owner_headers,
        json={"reason": "排班调整"},
    )
    assert revoked_notification.status_code == 200
    assert revoked_notification.json()["data"]["status"] == "revoked"
    assert revoked_notification.json()["data"]["revoked_at"]

    notification_logs = client.get(f"/api/v1/audit-logs?entity_type=notification&entity_id={notification_id}", headers=owner_headers)
    assert notification_logs.status_code == 200
    assert any(item["action"] == "notification_revoked" for item in notification_logs.json()["data"]["items"])

    deleted_notification = client.delete(f"/api/v1/notifications/{notification_id}?team_id={team_id}", headers=owner_headers)
    assert deleted_notification.status_code == 200
    assert deleted_notification.json()["data"]["deleted"] is True

    notification_list = client.get(f"/api/v1/notifications?team_id={team_id}", headers=owner_headers)
    assert notification_list.status_code == 200
    assert all(item["notification_id"] != notification_id for item in notification_list.json()["data"]["items"])

    notification_logs_after_delete = client.get(f"/api/v1/audit-logs?entity_type=notification&entity_id={notification_id}", headers=owner_headers)
    assert any(item["action"] == "notification_deleted" for item in notification_logs_after_delete.json()["data"]["items"])

    members = client.get(f"/api/v1/teams/{team_id}/members?status=active&keyword=owner", headers=headers)
    assert members.status_code == 200
    first_member = members.json()["data"]["items"][0]
    assert first_member["display_name"] == "Owner Two"
    assert first_member["member_status"] == "active"
    assert first_member["permission_count"] > 0
    assert first_member["actions"]["can_edit"] is True


def test_historical_agent_data_requires_manual_cleanup_instead_of_runtime_fix() -> None:
    db = get_database()
    admin = User(username="legacyadmin", email="legacyadmin@example.com", global_role="admin", email_verified=True)
    legacy_agent = User(username="legacyagent", email=None, global_role="agent", email_verified=True)
    team = Team(company_name="Legacy Agent Team", owner_user_id=admin.id)
    db.add(admin)
    db.add(legacy_agent)
    db.add(UserProfile(user_id=admin.id, display_name="Legacy Admin"))
    db.add(team)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin"))
    db.add(TeamMember(team_id=team.id, user_id=legacy_agent.id, team_role="agent", is_system_member=False, permissions=[]))

    headers = {"Authorization": f"Bearer {create_session_bound_access_token(admin.id, role=admin.global_role)}", "X-Team-ID": team.id}

    members = client.get(f"/api/v1/teams/{team.id}/members?status=active", headers=headers)
    assert members.status_code == 200
    agent_member = next(item for item in members.json()["data"]["items"] if item["team_role"] == "agent")
    assert agent_member["is_system_member"] is True
    assert agent_member["display_name"] == "Agent"
    assert agent_member["avatar"] == "/agent-avatars/agent-orbit.svg"
    assert agent_member["actions"] == {"can_edit": False, "can_remove": False, "can_disable": False}

    settings_response = client.get(f"/api/v1/teams/{team.id}/agent-settings", headers=headers)
    assert settings_response.status_code == 404
    assert "人工清洗历史数据" in settings_response.json()["message"]

    persisted_member = db.find_one(TeamMember, {"team_id": team.id, "user_id": legacy_agent.id})
    assert persisted_member is not None
    assert persisted_member.is_system_member is False
    assert persisted_member.permissions == []
    assert db.find_one(UserProfile, {"user_id": legacy_agent.id}) is None
    assert db.get(User, legacy_agent.id).avatar is None


def test_member_update_rejects_self_disable() -> None:
    db = get_database()
    team = Team(company_name="Self Disable Team", owner_user_id="self-disable-admin")
    admin = User(username="selfdisableadmin", email="self-disable-admin@example.com", global_role="admin", email_verified=True)
    db.add(team)
    db.add(admin)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin", permissions=permissions_for_team_role("team_admin")))
    db.commit()
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(admin.id, role=admin.global_role)}", "X-Team-ID": team.id}

    response = client.put(f"/api/v1/teams/{team.id}/members/{admin.id}", headers=headers, json={"status": "disabled"})

    assert response.status_code == 422
    member = db.find_one(TeamMember, {"team_id": team.id, "user_id": admin.id})
    assert member.status == "active"


def test_member_update_rejects_self_role_change() -> None:
    db = get_database()
    team = Team(company_name="Self Role Team", owner_user_id="self-role-admin")
    admin = User(username="selfroleadmin", email="self-role-admin@example.com", global_role="admin", email_verified=True)
    db.add(team)
    db.add(admin)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin", permissions=permissions_for_team_role("team_admin")))
    db.commit()
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(admin.id, role=admin.global_role)}", "X-Team-ID": team.id}

    response = client.put(f"/api/v1/teams/{team.id}/members/{admin.id}", headers=headers, json={"team_role": "labeler"})

    assert response.status_code == 422
    member = db.find_one(TeamMember, {"team_id": team.id, "user_id": admin.id})
    assert member.team_role == "team_admin"
    assert member.permissions_customized is False


def test_member_update_rejects_self_permission_narrowing() -> None:
    db = get_database()
    team = Team(company_name="Self Permission Team", owner_user_id="self-permission-admin")
    admin = User(username="selfpermissionadmin", email="self-permission-admin@example.com", global_role="admin", email_verified=True)
    db.add(team)
    db.add(admin)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin", permissions=permissions_for_team_role("team_admin")))
    db.commit()
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(admin.id, role=admin.global_role)}", "X-Team-ID": team.id}

    response = client.put(f"/api/v1/teams/{team.id}/members/{admin.id}", headers=headers, json={"permissions": ["team:read"]})

    assert response.status_code == 422
    member = db.find_one(TeamMember, {"team_id": team.id, "user_id": admin.id})
    assert member.permissions == permissions_for_team_role("team_admin")
    assert member.permissions_customized is False


def test_add_member_rejects_permissions_outside_target_team_role() -> None:
    db = get_database()
    team = Team(company_name="Add Member Permission Boundary Team", owner_user_id="add-permission-admin")
    admin = User(username="addpermissionadmin", email="add-permission-admin@example.com", global_role="admin", email_verified=True)
    labeler = User(username="addpermissionlabeler", email="add-permission-labeler@example.com", global_role="labeler", email_verified=True)
    db.add(team)
    db.add(admin)
    db.add(labeler)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin", permissions=permissions_for_team_role("team_admin")))
    db.commit()
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(admin.id, role=admin.global_role)}", "X-Team-ID": team.id}

    response = client.post(
        f"/api/v1/teams/{team.id}/members",
        headers=headers,
        json={"user_id": labeler.id, "team_role": "labeler", "permissions": ["label:read", "team:manage"]},
    )

    assert response.status_code == 422
    assert response.json()["code"] == 42201
    assert db.find_one(TeamMember, {"team_id": team.id, "user_id": labeler.id}) is None


def test_add_member_respects_explicit_permission_narrowing() -> None:
    db = get_database()
    team = Team(company_name="Add Member Permission Narrow Team", owner_user_id="add-narrow-admin")
    admin = User(username="addnarrowadmin", email="add-narrow-admin@example.com", global_role="admin", email_verified=True)
    reviewer = User(username="addnarrowreviewer", email="add-narrow-reviewer@example.com", global_role="reviewer", email_verified=True)
    db.add(team)
    db.add(admin)
    db.add(reviewer)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin", permissions=permissions_for_team_role("team_admin")))
    db.commit()
    admin_headers = {"Authorization": f"Bearer {create_session_bound_access_token(admin.id, role=admin.global_role)}", "X-Team-ID": team.id}

    response = client.post(
        f"/api/v1/teams/{team.id}/members",
        headers=admin_headers,
        json={"user_id": reviewer.id, "team_role": "reviewer", "permissions": ["team:read"]},
    )

    assert response.status_code == 200
    assert response.json()["data"]["permissions"] == ["team:read"]
    reviewer_headers = {"Authorization": f"Bearer {create_session_bound_access_token(reviewer.id, role=reviewer.global_role)}", "X-Team-ID": team.id}
    members = client.get(f"/api/v1/teams/{team.id}/members", headers=reviewer_headers)
    assert members.status_code == 403


def test_create_member_account_rejects_permissions_outside_target_team_role() -> None:
    db = get_database()
    team = Team(company_name="Create Member Permission Boundary Team", owner_user_id="create-permission-admin")
    admin = User(username="createpermissionadmin", email="create-permission-admin@example.com", global_role="admin", email_verified=True)
    db.add(team)
    db.add(admin)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin", permissions=permissions_for_team_role("team_admin")))
    db.commit()
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(admin.id, role=admin.global_role)}", "X-Team-ID": team.id}

    response = client.post(
        f"/api/v1/teams/{team.id}/members/accounts",
        headers=headers,
        json={
            "display_name": "Over Permission Labeler",
            "username": "overpermissionlabeler",
            "email": "over-permission-labeler@example.com",
            "password": "SecurePass123!",
            "team_role": "labeler",
            "permissions": ["label:read", "budget:manage"],
        },
    )

    assert response.status_code == 422
    assert response.json()["code"] == 42201
    assert db.find_one(User, {"email": "over-permission-labeler@example.com"}) is None


def test_create_member_account_respects_explicit_permission_narrowing() -> None:
    db = get_database()
    team = Team(company_name="Create Member Permission Narrow Team", owner_user_id="create-narrow-admin")
    admin = User(username="createnarrowadmin", email="create-narrow-admin@example.com", global_role="admin", email_verified=True)
    db.add(team)
    db.add(admin)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin", permissions=permissions_for_team_role("team_admin")))
    db.commit()
    admin_headers = {"Authorization": f"Bearer {create_session_bound_access_token(admin.id, role=admin.global_role)}", "X-Team-ID": team.id}

    response = client.post(
        f"/api/v1/teams/{team.id}/members/accounts",
        headers=admin_headers,
        json={
            "display_name": "Narrow Reviewer",
            "username": "createnarrowreviewer",
            "email": "create-narrow-reviewer@example.com",
            "password": "SecurePass123!",
            "team_role": "reviewer",
            "permissions": ["team:read"],
        },
    )

    assert response.status_code == 200
    assert response.json()["data"]["permissions"] == ["team:read"]
    reviewer_id = response.json()["data"]["user_id"]
    reviewer_headers = {"Authorization": f"Bearer {create_session_bound_access_token(reviewer_id, role='reviewer')}", "X-Team-ID": team.id}
    members = client.get(f"/api/v1/teams/{team.id}/members", headers=reviewer_headers)
    assert members.status_code == 403


def test_add_member_rejects_second_team_admin() -> None:
    db = get_database()
    team = Team(company_name="Second Team Admin Add Member Team", owner_user_id="second-admin-add")
    admin = User(username="secondadminadd", email="second-admin-add@example.com", global_role="admin", email_verified=True)
    candidate = User(username="secondadmincandidate", email="second-admin-candidate@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(admin)
    db.add(candidate)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin", permissions=permissions_for_team_role("team_admin")))
    db.commit()
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(admin.id, role=admin.global_role)}", "X-Team-ID": team.id}

    response = client.post(
        f"/api/v1/teams/{team.id}/members",
        headers=headers,
        json={"user_id": candidate.id, "team_role": "team_admin"},
    )

    assert response.status_code == 422
    assert response.json()["code"] == 42201
    assert db.find_one(TeamMember, {"team_id": team.id, "user_id": candidate.id}) is None


def test_create_member_account_rejects_second_team_admin() -> None:
    db = get_database()
    team = Team(company_name="Second Team Admin Create Member Team", owner_user_id="second-admin-create")
    admin = User(username="secondadmincreate", email="second-admin-create@example.com", global_role="admin", email_verified=True)
    db.add(team)
    db.add(admin)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin", permissions=permissions_for_team_role("team_admin")))
    db.commit()
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(admin.id, role=admin.global_role)}", "X-Team-ID": team.id}

    response = client.post(
        f"/api/v1/teams/{team.id}/members/accounts",
        headers=headers,
        json={
            "display_name": "Second Admin",
            "username": "secondteamadmin",
            "email": "second-team-admin@example.com",
            "password": "SecurePass123!",
            "team_role": "team_admin",
        },
    )

    assert response.status_code == 422
    assert response.json()["code"] == 42201
    assert db.find_one(User, {"email": "second-team-admin@example.com"}) is None


def test_invite_member_rejects_permissions_outside_target_team_role() -> None:
    db = get_database()
    team = Team(company_name="Invite Permission Boundary Team", owner_user_id="invite-permission-admin")
    admin = User(username="invitepermissionadmin", email="invite-permission-admin@example.com", global_role="admin", email_verified=True)
    db.add(team)
    db.add(admin)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin", permissions=permissions_for_team_role("team_admin")))
    db.commit()
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(admin.id, role=admin.global_role)}", "X-Team-ID": team.id}

    response = client.post(
        f"/api/v1/teams/{team.id}/invite",
        headers=headers,
        json={"invite_mode": "code", "team_role": "labeler", "permissions": ["label:read", "member:delete"]},
    )

    assert response.status_code == 422
    assert response.json()["code"] == 42201
    assert db.find_one(TeamInvitation, {"team_id": team.id}) is None


def test_invite_member_rejects_second_team_admin() -> None:
    db = get_database()
    team = Team(company_name="Second Team Admin Invite Team", owner_user_id="second-admin-invite")
    admin = User(username="secondadmininvite", email="second-admin-invite@example.com", global_role="admin", email_verified=True)
    db.add(team)
    db.add(admin)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin", permissions=permissions_for_team_role("team_admin")))
    db.commit()
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(admin.id, role=admin.global_role)}", "X-Team-ID": team.id}

    response = client.post(
        f"/api/v1/teams/{team.id}/invite",
        headers=headers,
        json={"invite_mode": "code", "team_role": "team_admin"},
    )

    assert response.status_code == 422
    assert response.json()["code"] == 42201
    assert db.find_one(TeamInvitation, {"team_id": team.id}) is None


def test_invitation_accept_respects_explicit_permission_narrowing() -> None:
    db = get_database()
    team = Team(company_name="Invite Permission Narrow Team", owner_user_id="invite-narrow-admin")
    admin = User(username="invitenarrowadmin", email="invite-narrow-admin@example.com", global_role="admin", email_verified=True)
    invitee = User(username="invitenarrowreviewer", email="invite-narrow-reviewer@example.com", global_role="pending", email_verified=True)
    db.add(team)
    db.add(admin)
    db.add(invitee)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin", permissions=permissions_for_team_role("team_admin")))
    db.commit()
    admin_headers = {"Authorization": f"Bearer {create_session_bound_access_token(admin.id, role=admin.global_role)}", "X-Team-ID": team.id}

    invitation = client.post(
        f"/api/v1/teams/{team.id}/invite",
        headers=admin_headers,
        json={"invite_mode": "code", "team_role": "reviewer", "permissions": ["team:read"]},
    )
    assert invitation.status_code == 200
    invite_code = invitation.json()["data"]["invite_code"]
    invitee_headers = {"Authorization": f"Bearer {create_session_bound_access_token(invitee.id, role=invitee.global_role)}"}

    accept = client.post(f"/api/v1/teams/invitations/{invite_code}/respond", headers=invitee_headers, json={"action": "accept"})
    assert accept.status_code == 200

    reviewer_headers = {"Authorization": f"Bearer {create_session_bound_access_token(invitee.id, role='reviewer')}", "X-Team-ID": team.id}
    members = client.get(f"/api/v1/teams/{team.id}/members", headers=reviewer_headers)
    assert members.status_code == 403


def test_import_existing_member_preserves_global_role() -> None:
    db = get_database()
    team = Team(company_name="Import Existing Global Role Team", owner_user_id="import-global-admin")
    admin = User(username="importglobaladmin", email="import-global-admin@example.com", global_role="admin", email_verified=True)
    existing = User(username="importglobaluser", email="import-global-user@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(admin)
    db.add(existing)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin", permissions=permissions_for_team_role("team_admin")))
    db.commit()
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(admin.id, role=admin.global_role)}", "X-Team-ID": team.id}

    response = client.post(
        f"/api/v1/teams/{team.id}/members/import",
        headers=headers,
        json={"rows": [{"email": existing.email, "team_role": "reviewer"}]},
    )

    assert response.status_code == 200
    assert response.json()["data"]["imported_count"] == 1
    member = db.find_one(TeamMember, {"team_id": team.id, "user_id": existing.id})
    assert member is not None
    assert member.team_role == "reviewer"
    assert db.get(User, existing.id).global_role == "user"


def test_import_new_owner_member_keeps_global_role_user() -> None:
    db = get_database()
    team = Team(company_name="Import New Owner Role Team", owner_user_id="import-owner-admin")
    admin = User(username="importowneradmin", email="import-owner-admin@example.com", global_role="admin", email_verified=True)
    db.add(team)
    db.add(admin)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin", permissions=permissions_for_team_role("team_admin")))
    db.commit()
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(admin.id, role=admin.global_role)}", "X-Team-ID": team.id}

    response = client.post(
        f"/api/v1/teams/{team.id}/members/import",
        headers=headers,
        json={
            "default_password": "SecurePass123!",
            "rows": [{"email": "import-new-owner@example.com", "team_role": "owner", "username": "importnewowner", "display_name": "Import New Owner"}],
        },
    )

    assert response.status_code == 200
    assert response.json()["data"]["imported_count"] == 1
    imported = db.find_one(User, {"email": "import-new-owner@example.com"})
    assert imported is not None
    assert imported.global_role == "user"


def test_import_new_team_admin_member_is_skipped_when_team_admin_exists() -> None:
    db = get_database()
    team = Team(company_name="Import New Team Admin Role Team", owner_user_id="import-team-admin")
    admin = User(username="importteamadmin", email="import-team-admin@example.com", global_role="admin", email_verified=True)
    db.add(team)
    db.add(admin)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin", permissions=permissions_for_team_role("team_admin")))
    db.commit()
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(admin.id, role=admin.global_role)}", "X-Team-ID": team.id}

    response = client.post(
        f"/api/v1/teams/{team.id}/members/import",
        headers=headers,
        json={
            "default_password": "SecurePass123!",
            "rows": [{"email": "import-new-team-admin@example.com", "team_role": "team_admin", "username": "importnewadmin", "display_name": "Import New Admin"}],
        },
    )

    assert response.status_code == 200
    assert response.json()["data"]["imported_count"] == 0
    assert response.json()["data"]["skipped_count"] == 1
    assert response.json()["data"]["results"][0]["reason"] == "每个企业只能有一个 Team Admin"
    imported = db.find_one(User, {"email": "import-new-team-admin@example.com"})
    assert imported is None


def test_member_update_rejects_promoting_second_team_admin() -> None:
    db = get_database()
    team = Team(company_name="Second Team Admin Promote Team", owner_user_id="second-admin-promote")
    admin = User(username="secondadminpromote", email="second-admin-promote@example.com", global_role="admin", email_verified=True)
    owner = User(username="promoteowner", email="promote-owner@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(admin)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin", permissions=permissions_for_team_role("team_admin")))
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner", permissions=permissions_for_team_role("owner")))
    db.commit()
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(admin.id, role=admin.global_role)}", "X-Team-ID": team.id}

    response = client.put(
        f"/api/v1/teams/{team.id}/members/{owner.id}",
        headers=headers,
        json={"team_role": "team_admin"},
    )

    assert response.status_code == 422
    assert response.json()["code"] == 42201
    member = db.find_one(TeamMember, {"team_id": team.id, "user_id": owner.id})
    assert member is not None
    assert member.team_role == "owner"


def test_batch_update_member_role_rejects_promoting_second_team_admin() -> None:
    db = get_database()
    team = Team(company_name="Second Team Admin Batch Promote Team", owner_user_id="second-admin-batch")
    admin = User(username="secondadminbatch", email="second-admin-batch@example.com", global_role="admin", email_verified=True)
    reviewer = User(username="batchreviewer", email="batch-reviewer@example.com", global_role="reviewer", email_verified=True)
    db.add(team)
    db.add(admin)
    db.add(reviewer)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin", permissions=permissions_for_team_role("team_admin")))
    db.add(TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer", permissions=permissions_for_team_role("reviewer")))
    db.commit()
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(admin.id, role=admin.global_role)}", "X-Team-ID": team.id}

    response = client.post(
        f"/api/v1/teams/{team.id}/members/batch-role",
        headers=headers,
        json={"user_ids": [reviewer.id], "team_role": "team_admin"},
    )

    assert response.status_code == 200
    assert response.json()["data"]["updated_count"] == 0
    assert response.json()["data"]["skipped_count"] == 1
    assert response.json()["data"]["results"][0]["reason"] == "每个企业只能有一个 Team Admin"
    member = db.find_one(TeamMember, {"team_id": team.id, "user_id": reviewer.id})
    assert member is not None
    assert member.team_role == "reviewer"


def test_member_update_rejects_disabling_unique_team_admin() -> None:
    db = get_database()
    team = Team(company_name="Unique Team Admin Disable Team", owner_user_id="unique-admin-disable")
    admin = User(username="uniqueadmindisable", email="unique-admin-disable@example.com", global_role="admin", email_verified=True)
    owner = User(username="disableowner", email="disable-owner@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(admin)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin", permissions=permissions_for_team_role("team_admin")))
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner", permissions=permissions_for_team_role("owner")))
    db.commit()
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(admin.id, role=admin.global_role)}", "X-Team-ID": team.id}

    response = client.put(
        f"/api/v1/teams/{team.id}/members/{admin.id}",
        headers=headers,
        json={"status": "disabled"},
    )

    assert response.status_code == 422
    assert response.json()["code"] == 42201
    member = db.find_one(TeamMember, {"team_id": team.id, "user_id": admin.id})
    assert member is not None
    assert member.status == "active"


def test_owner_can_read_but_cannot_modify_team_members() -> None:
    db = get_database()
    team = Team(company_name="Owner Readonly Members Team", owner_user_id="owner-readonly-admin")
    owner = User(username="ownerreadonly", email="owner-readonly@example.com", global_role="user", email_verified=True)
    labeler = User(username="ownerreadonlylabeler", email="owner-readonly-labeler@example.com", global_role="labeler", email_verified=True)
    db.add(team)
    db.add(owner)
    db.add(labeler)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner", permissions=permissions_for_team_role("owner")))
    db.add(TeamMember(team_id=team.id, user_id=labeler.id, team_role="labeler", permissions=permissions_for_team_role("labeler")))
    db.commit()
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(owner.id, role=owner.global_role)}", "X-Team-ID": team.id}

    members = client.get(f"/api/v1/teams/{team.id}/members", headers=headers)
    update_member = client.put(
        f"/api/v1/teams/{team.id}/members/{labeler.id}",
        headers=headers,
        json={"status": "disabled"},
    )

    assert "member:read" in permissions_for_team_role("owner")
    assert "member:update" not in permissions_for_team_role("owner")
    assert "member:create" not in permissions_for_team_role("owner")
    assert "member:invite" not in permissions_for_team_role("owner")
    assert members.status_code == 200
    assert update_member.status_code == 403
    assert update_member.json()["code"] == 40301


def test_team_labeler_can_read_but_cannot_modify_team_members() -> None:
    db = get_database()
    team = Team(company_name="Labeler Readonly Members Team", owner_user_id="labeler-readonly-admin")
    labeler = User(username="labelerreadonly", email="labeler-readonly@example.com", global_role="labeler", email_verified=True)
    reviewer = User(username="labelerreadonlyreviewer", email="labeler-readonly-reviewer@example.com", global_role="reviewer", email_verified=True)
    db.add(team)
    db.add(labeler)
    db.add(reviewer)
    db.add(TeamMember(team_id=team.id, user_id=labeler.id, team_role="labeler", permissions=permissions_for_team_role("labeler")))
    db.add(TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer", permissions=permissions_for_team_role("reviewer")))
    db.commit()
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(labeler.id, role=labeler.global_role)}", "X-Team-ID": team.id}

    members = client.get(f"/api/v1/teams/{team.id}/members", headers=headers)
    update_member = client.put(
        f"/api/v1/teams/{team.id}/members/{reviewer.id}",
        headers=headers,
        json={"status": "disabled"},
    )

    assert "member:read" in permissions_for_team_role("labeler")
    assert "member:update" not in permissions_for_team_role("labeler")
    assert members.status_code == 200
    assert update_member.status_code == 403
    assert update_member.json()["code"] == 40301


def test_stale_owner_member_permissions_do_not_override_role_defaults() -> None:
    db = get_database()
    team = Team(company_name="Stale Owner Permission Team", owner_user_id="stale-owner-admin")
    owner = User(
        username="staleowner",
        email="stale-owner@example.com",
        password_hash=auth_service.hash_password("SecurePass123!"),
        global_role="user",
        email_verified=True,
    )
    db.add(team)
    db.add(owner)
    db.add(
        TeamMember(
            team_id=team.id,
            user_id=owner.id,
            team_role="owner",
            permissions=[*permissions_for_team_role("owner"), "member:update", "member:create", "member:invite", "team:manage"],
            permissions_customized=False,
        )
    )
    db.commit()

    login = client.post("/api/v1/auth/login", json={"account": owner.email, "password": "SecurePass123!"})

    assert login.status_code == 200
    permissions = set(login.json()["data"]["user"]["permissions"])
    assert "member:read" in permissions
    assert "team:read" in permissions
    assert "member:update" not in permissions
    assert "member:create" not in permissions
    assert "member:invite" not in permissions
    assert "team:manage" not in permissions


def test_remove_member_rejects_unique_team_admin() -> None:
    db = get_database()
    team = Team(company_name="Unique Team Admin Remove Team", owner_user_id="unique-admin-remove")
    admin = User(username="uniqueadminremove", email="unique-admin-remove@example.com", global_role="admin", email_verified=True)
    owner = User(username="removeowner", email="remove-owner@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(admin)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin", permissions=permissions_for_team_role("team_admin")))
    db.add(
        TeamMember(
            team_id=team.id,
            user_id=owner.id,
            team_role="owner",
            permissions=[*permissions_for_team_role("owner"), "member:delete"],
            permissions_customized=True,
        )
    )
    db.commit()
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(owner.id, role=owner.global_role)}", "X-Team-ID": team.id}

    response = client.delete(f"/api/v1/teams/{team.id}/members/{admin.id}", headers=headers)

    assert response.status_code == 422
    assert response.json()["code"] == 42201
    member = db.find_one(TeamMember, {"team_id": team.id, "user_id": admin.id})
    assert member is not None


def test_login_and_me_payload_respect_default_team_customized_permissions() -> None:
    db = get_database()
    team = Team(company_name="Customized Permission Login Team", owner_user_id="custom-permission-admin")
    reviewer = User(
        username="custompermissionreviewer",
        email="custom-permission-reviewer@example.com",
        password_hash=auth_service.hash_password("SecurePass123!"),
        global_role="user",
        email_verified=True,
    )
    db.add(team)
    db.add(reviewer)
    db.add(
        TeamMember(
            team_id=team.id,
            user_id=reviewer.id,
            team_role="reviewer",
            permissions=["team:read"],
            permissions_customized=True,
        )
    )
    db.commit()

    login = client.post("/api/v1/auth/login", json={"account": reviewer.email, "password": "SecurePass123!"})

    assert login.status_code == 200
    access_token = login.json()["data"]["access_token"]
    assert login.json()["data"]["user"]["permissions"] == ["team:read"]

    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert me.status_code == 200
    assert me.json()["data"]["permissions"] == ["team:read"]


def test_invitation_accept_preserves_existing_user_global_role() -> None:
    db = get_database()
    team = Team(company_name="Invite Existing Global Role Team", owner_user_id="invite-global-admin")
    admin = User(username="inviteglobaladmin", email="invite-global-admin@example.com", global_role="admin", email_verified=True)
    invitee = User(username="inviteglobaluser", email="invite-global-user@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(admin)
    db.add(invitee)
    db.add(TeamMember(team_id=team.id, user_id=admin.id, team_role="team_admin", permissions=permissions_for_team_role("team_admin")))
    db.commit()
    admin_headers = {"Authorization": f"Bearer {create_session_bound_access_token(admin.id, role=admin.global_role)}", "X-Team-ID": team.id}

    invitation = client.post(
        f"/api/v1/teams/{team.id}/invite",
        headers=admin_headers,
        json={"invite_mode": "code", "team_role": "owner"},
    )
    assert invitation.status_code == 200

    invitee_headers = {"Authorization": f"Bearer {create_session_bound_access_token(invitee.id, role=invitee.global_role)}"}
    accept = client.post(
        f"/api/v1/teams/invitations/{invitation.json()['data']['invite_code']}/respond",
        headers=invitee_headers,
        json={"action": "accept"},
    )

    assert accept.status_code == 200
    member = db.find_one(TeamMember, {"team_id": team.id, "user_id": invitee.id})
    assert member is not None
    assert member.team_role == "owner"
    assert db.get(User, invitee.id).global_role == "user"


def test_team_labeler_cannot_read_ai_resource_configs_or_call_logs() -> None:
    db = get_database()
    team = Team(company_name="Labeler AI Resource Boundary Team", owner_user_id="labeler-ai-owner")
    labeler = User(username="labelerairesource", email="labeler-ai-resource@example.com", global_role="labeler", email_verified=True)
    db.add(team)
    db.add(labeler)
    db.add(TeamMember(team_id=team.id, user_id=labeler.id, team_role="labeler", permissions=permissions_for_team_role("labeler")))
    db.commit()
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(labeler.id, role=labeler.global_role)}", "X-Team-ID": team.id}

    configs = client.get(f"/api/v1/ai-resources/configs?team_id={team.id}", headers=headers)
    assert configs.status_code == 403

    calls = client.get(f"/api/v1/ai-resources/calls?team_id={team.id}", headers=headers)
    assert calls.status_code == 403


def test_owner_can_import_dataset_build_template_and_publish_multimodal_task() -> None:
    code = send_code("production-admin@example.com")
    response = client.post(
        "/api/v1/auth/register/admin",
        json={"display_name": "Production Admin", "username": "prodadmin", "email": "production-admin@example.com", "password": "SecurePass123!", "email_code": code},
    )
    assert response.status_code == 200
    login = client.post("/api/v1/auth/login", json={"account": "production-admin@example.com", "password": "SecurePass123!"})
    token = login.json()["data"]["access_token"]
    team = client.post("/api/v1/teams", headers={"Authorization": f"Bearer {token}"}, json={"company_name": "Production Flow Team"})
    assert team.status_code == 200
    team_id = team.json()["data"]["team_id"]
    headers = {"Authorization": f"Bearer {token}", "X-Team-ID": team_id}

    dataset = client.post(
        "/api/v1/datasets",
        headers=headers,
        data={"name": "混合素材数据集", "description": "文本 + 图片 + 音频", "media_assets": '[{"url":"https://cdn.example.com/img01.png","type":"image"}]'},
        files=[
            ("file", ("items.csv", "title,image_url,audio_url\n合同条款,https://cdn.example.com/img01.png,https://cdn.example.com/a01.mp3\n", "text/csv")),
            ("media_files", ("audio01.mp3", b"demo-audio", "audio/mpeg")),
        ],
    )
    assert dataset.status_code == 200
    dataset_data = dataset.json()["data"]
    assert dataset_data["owner_id"]
    assert dataset_data["owner_name"] == "Production Admin"
    assert dataset_data["updated_by"] == dataset_data["owner_id"]
    assert dataset_data["updated_by_name"] == "Production Admin"
    assert dataset_data["row_count"] == 1
    assert [column["name"] for column in dataset_data["columns"]] == ["title", "image_url", "audio_url"]
    assert dataset_data["columns"][1]["data_type"] == "image"
    assert dataset_data["columns"][2]["data_type"] == "audio"
    assert all(column["name"] != "media" for column in dataset_data["columns"])
    assert "attachments" not in dataset_data["rows"][0]
    assert "derived_context" not in dataset_data["rows"][0]
    assert len(dataset_data["rows"][0]["media"]) == 2
    assert {item["field"] for item in dataset_data["media_schema"]} == {"image_url", "audio_url"}
    assert len(dataset_data["media_assets"]) == 1
    assert dataset_data["media_assets"][0]["filename"] == "audio01.mp3"
    assert dataset_data["media_assets"][0]["type"] == "audio"
    assert dataset_data["media_assets"][0]["url"].startswith("/api/v1/uploads/")
    assert dataset_data["processing_summary"]["unbound_media_count"] == 1

    update_dataset = client.put(
        f"/api/v1/datasets/{dataset_data['dataset_id']}",
        headers=headers,
        json={
            "columns": [{"name": "image_url", "comment": "图片列", "use_in_mapping": True}],
            "derived_columns": [
                {
                    "name": "display_title",
                    "data_type": "text",
                    "source_column": "title",
                    "expression": "原文：{value}",
                    "comment": "渲染页标题变量",
                    "use_in_mapping": True,
                }
            ],
        },
    )
    assert update_dataset.status_code == 200
    updated_dataset_data = update_dataset.json()["data"]
    assert updated_dataset_data["owner_id"] == dataset_data["owner_id"]
    assert updated_dataset_data["owner_name"] == "Production Admin"
    assert updated_dataset_data["updated_by"] == dataset_data["owner_id"]
    assert updated_dataset_data["updated_by_name"] == "Production Admin"
    assert updated_dataset_data["columns"][1]["comment"] == "图片列"
    assert updated_dataset_data["columns"][3]["name"] == "display_title"
    assert updated_dataset_data["columns"][3]["derived"] is True
    assert updated_dataset_data["rows"][0]["display_title"] == "原文：合同条款"

    db = get_database()
    dataset_editor = User(username="dataseteditor", email="dataset-editor@example.com", global_role="user", email_verified=True)
    db.add(dataset_editor)
    db.add(UserProfile(user_id=dataset_editor.id, display_name="Dataset Editor", real_name="数据最新修改人"))
    db.add(TeamMember(team_id=team_id, user_id=dataset_editor.id, team_role="owner"))
    db.commit()
    editor_headers = team_auth_headers(dataset_editor, team_id)
    editor_update_dataset = client.put(
        f"/api/v1/datasets/{dataset_data['dataset_id']}",
        headers=editor_headers,
        json={"description": "由第二位 Owner 更新"},
    )
    assert editor_update_dataset.status_code == 200
    editor_updated_dataset_data = editor_update_dataset.json()["data"]
    assert editor_updated_dataset_data["owner_id"] == dataset_data["owner_id"]
    assert editor_updated_dataset_data["owner_name"] == "Production Admin"
    assert editor_updated_dataset_data["updated_by"] == dataset_editor.id
    assert editor_updated_dataset_data["updated_by_name"] == "数据最新修改人"
    list_datasets_response = client.get("/api/v1/datasets", headers=headers)
    assert list_datasets_response.status_code == 200
    listed_dataset = list_datasets_response.json()["data"]["items"][0]
    assert listed_dataset["owner_name"] == "Production Admin"
    assert listed_dataset["updated_by"] == dataset_editor.id
    assert listed_dataset["updated_by_name"] == "数据最新修改人"

    download = client.get(f"/api/v1/datasets/{dataset_data['dataset_id']}/download?format=jsonl", headers=headers)
    assert download.status_code == 200
    assert "attachment" in download.headers["content-disposition"]
    assert "合同条款" in download.text

    schema = {
        "schema_version": "1.0",
        "tabs": [
            {
                "id": "tab_read",
                "title": "阅读材料",
                "components": [
                    {"id": "show_title", "type": "ShowItem", "field": "show_title", "label": "标题", "required": False, "config": {}, "options": [], "version": "1.0"},
                    {"id": "show_image", "type": "ShowItem", "field": "show_image", "label": "图片", "required": False, "config": {}, "options": [], "version": "1.0"},
                ],
            },
            {
                "id": "tab_answer",
                "title": "标注答案",
                "components": [
                    {"id": "intent", "type": "SingleSelect", "field": "intent", "label": "意图", "required": True, "config": {}, "options": [{"value": "a", "label": "A"}], "version": "1.0"}
                ],
            },
        ],
        "components": [],
        "validation_rules": {},
        "linkage_rules": [],
        "llm_config": {},
    }
    template = client.post("/api/v1/templates", headers=headers, json={"name": "多页签模板", "description": "ShowItem + 多 Tab", "schema": schema})
    assert template.status_code == 200
    template_data = template.json()["data"]
    assert template_data["owner_id"] == dataset_data["owner_id"]
    assert template_data["owner_name"] == "Production Admin"
    assert template_data["tab_count"] == 2
    readiness = client.get(f"/api/v1/templates/{template_data['template_id']}/readiness", headers=headers)
    assert readiness.status_code == 200
    assert readiness.json()["data"]["ready"] is True
    assert readiness.json()["data"]["summary"]["answer_field_count"] == 1
    published_template = client.post(f"/api/v1/templates/{template_data['template_id']}/publish", headers=headers)
    assert published_template.status_code == 200
    assert published_template.json()["data"]["status"] == "published"
    copied_template = client.post(f"/api/v1/templates/{template_data['template_id']}/copy", headers=headers, json={"name": "多页签模板副本"})
    assert copied_template.status_code == 200
    copied_template_data = copied_template.json()["data"]
    assert copied_template_data["owner_id"] == template_data["owner_id"]
    assert copied_template_data["owner_name"] == "Production Admin"
    assert copied_template_data["status"] == "draft"
    assert copied_template_data["name"] == "多页签模板副本"
    assert copied_template_data["schema"]["tabs"][0]["components"][0]["type"] == "ShowItem"
    delete_copy = client.delete(f"/api/v1/templates/{copied_template_data['template_id']}", headers=headers)
    assert delete_copy.status_code == 200
    deletable_template = client.post("/api/v1/templates", headers=headers, json={"name": "可删除发布模板", "schema": schema})
    assert deletable_template.status_code == 200
    deletable_template_id = deletable_template.json()["data"]["template_id"]
    publish_deletable_template = client.post(f"/api/v1/templates/{deletable_template_id}/publish", headers=headers)
    assert publish_deletable_template.status_code == 200
    delete_published_template = client.delete(f"/api/v1/templates/{deletable_template_id}", headers=headers)
    assert delete_published_template.status_code == 200
    invalid_schema = {
        **schema,
        "tabs": [
            {
                "id": "tab_bad",
                "title": "错误配置",
                "components": [
                    {"id": "llm_bad", "type": "LLMComponent", "field": "llm_bad", "label": "LLM", "required": False, "config": {}, "options": [], "version": "1.0"},
                    {"id": "bad_regex", "type": "TextInput", "field": "llm_bad", "label": "重复字段", "required": True, "config": {"regex": "["}, "options": [], "version": "1.0"},
                ],
            }
        ],
    }
    invalid_template = client.post("/api/v1/templates", headers=headers, json={"name": "错误模板", "schema": invalid_schema})
    assert invalid_template.status_code == 200
    invalid_template_id = invalid_template.json()["data"]["template_id"]
    invalid_readiness = client.get(f"/api/v1/templates/{invalid_template_id}/readiness", headers=headers)
    assert invalid_readiness.status_code == 200
    assert invalid_readiness.json()["data"]["ready"] is False
    invalid_publish = client.post(f"/api/v1/templates/{invalid_template_id}/publish", headers=headers)
    assert invalid_publish.status_code == 422
    assert invalid_publish.json()["detail"]["ready"] is False
    template_list = client.get("/api/v1/templates", headers=headers)
    assert template_list.status_code == 200
    listed_template = next(item for item in template_list.json()["data"]["items"] if item["template_id"] == template_data["template_id"])
    assert listed_template["owner_name"] == "Production Admin"
    assert listed_template["schema"]["tabs"][0]["components"][0]["type"] == "ShowItem"


def test_owner_imports_plain_dataset_without_extra_multimodal_columns() -> None:
    code = send_code("plain-dataset@example.com")
    response = client.post(
        "/api/v1/auth/register/admin",
        json={"display_name": "Plain Admin", "username": "plainadmin", "email": "plain-dataset@example.com", "password": "SecurePass123!", "email_code": code},
    )
    assert response.status_code == 200
    login = client.post("/api/v1/auth/login", json={"account": "plain-dataset@example.com", "password": "SecurePass123!"})
    token = login.json()["data"]["access_token"]
    team = client.post("/api/v1/teams", headers={"Authorization": f"Bearer {token}"}, json={"company_name": "Plain Flow Team"})
    assert team.status_code == 200
    headers = {"Authorization": f"Bearer {token}", "X-Team-ID": team.json()["data"]["team_id"]}

    dataset = client.post(
        "/api/v1/datasets",
        headers=headers,
        data={"name": "普通表格数据集", "description": "只包含文本字段"},
        files=[
            ("file", ("items.csv", "title,category\n合同条款,司法\n", "text/csv")),
        ],
    )
    assert dataset.status_code == 200
    dataset_data = dataset.json()["data"]
    assert [column["name"] for column in dataset_data["columns"]] == ["title", "category"]
    assert all("media" not in row for row in dataset_data["rows"])
    assert all("attachments" not in row for row in dataset_data["rows"])
    assert all("derived_context" not in row for row in dataset_data["rows"])


def test_owner_binds_unbound_dataset_media_asset_to_row() -> None:
    code = send_code("bind-media-dataset@example.com")
    response = client.post(
        "/api/v1/auth/register/admin",
        json={"display_name": "Bind Media Admin", "username": "bindmediaadmin", "email": "bind-media-dataset@example.com", "password": "SecurePass123!", "email_code": code},
    )
    assert response.status_code == 200
    login = client.post("/api/v1/auth/login", json={"account": "bind-media-dataset@example.com", "password": "SecurePass123!"})
    token = login.json()["data"]["access_token"]
    team = client.post("/api/v1/teams", headers={"Authorization": f"Bearer {token}"}, json={"company_name": "Bind Media Team"})
    assert team.status_code == 200
    headers = {"Authorization": f"Bearer {token}", "X-Team-ID": team.json()["data"]["team_id"]}

    dataset = client.post(
        "/api/v1/datasets",
        headers=headers,
        data={"name": "待绑定素材数据集", "description": "先上传素材后绑定"},
        files=[
            ("file", ("items.csv", "row_id,title\nrow-1,样本一\n", "text/csv")),
            ("media_files", ("sample.png", b"fake-image", "image/png")),
        ],
    )
    assert dataset.status_code == 200
    dataset_data = dataset.json()["data"]
    assert dataset_data["media_assets"][0]["filename"] == "sample.png"
    assert "media" not in dataset_data["rows"][0]

    bound = client.post(
        f"/api/v1/datasets/{dataset_data['dataset_id']}/media-assets/bind",
        headers=headers,
        json={"asset_index": 0, "row_index": 0, "role": "primary", "field": "reference_image", "media_type": "image"},
    )
    assert bound.status_code == 200
    bound_data = bound.json()["data"]
    assert bound_data["media_assets"] == []
    assert bound_data["rows"][0]["media"][0]["field"] == "reference_image"
    assert bound_data["rows"][0]["media"][0]["role"] == "primary"
    assert bound_data["rows"][0]["media"][0]["url"].startswith("/api/v1/uploads/")
    assert "media" in [column["name"] for column in bound_data["columns"]]
    assert bound_data["processing_summary"]["unbound_media_count"] == 0


def test_dataset_import_matches_uploaded_media_files_by_filename() -> None:
    code = send_code("filename-media-dataset@example.com")
    response = client.post(
        "/api/v1/auth/register/admin",
        json={"display_name": "Filename Media Admin", "username": "filenamemediaadmin", "email": "filename-media-dataset@example.com", "password": "SecurePass123!", "email_code": code},
    )
    assert response.status_code == 200
    login = client.post("/api/v1/auth/login", json={"account": "filename-media-dataset@example.com", "password": "SecurePass123!"})
    token = login.json()["data"]["access_token"]
    team = client.post("/api/v1/teams", headers={"Authorization": f"Bearer {token}"}, json={"company_name": "Filename Media Team"})
    assert team.status_code == 200
    headers = {"Authorization": f"Bearer {token}", "X-Team-ID": team.json()["data"]["team_id"]}

    dataset = client.post(
        "/api/v1/datasets",
        headers=headers,
        data={"name": "文件名自动匹配数据集", "description": "CSV 文件名自动匹配上传素材"},
        files=[
            ("file", ("items.csv", "row_id,image_url,title\nrow-1,sample.png,样本一\nrow-2,media/sample.png,样本二\n", "text/csv")),
            ("media_files", ("sample.png", b"fake-image", "image/png")),
        ],
    )
    assert dataset.status_code == 200
    dataset_data = dataset.json()["data"]
    assert dataset_data["rows"][0]["image_url"] == "sample.png"
    assert dataset_data["rows"][1]["image_url"] == "media/sample.png"
    assert dataset_data["rows"][0]["media"][0]["url"].startswith("/api/v1/uploads/")
    assert dataset_data["rows"][1]["media"][0]["source"] == "uploaded_file"
    assert dataset_data["media_assets"] == []
    assert dataset_data["processing_summary"]["bound_media_count"] == 2
    assert dataset_data["processing_summary"]["unbound_media_count"] == 0
    assert [column["name"] for column in dataset_data["columns"]] == ["image_url", "title", "media"]
    assert dataset_data["preview_rows"][0]["image_url"] == "sample.png"
    assert dataset_data["preview_rows"][0]["media"][0]["url"].startswith("/api/v1/uploads/")


def test_dataset_import_matches_uploaded_avi_video_without_duplicating_inline_data() -> None:
    code = send_code("filename-video-dataset@example.com")
    response = client.post(
        "/api/v1/auth/register/admin",
        json={"display_name": "Filename Video Admin", "username": "filenamevideoadmin", "email": "filename-video-dataset@example.com", "password": "SecurePass123!", "email_code": code},
    )
    assert response.status_code == 200
    login = client.post("/api/v1/auth/login", json={"account": "filename-video-dataset@example.com", "password": "SecurePass123!"})
    token = login.json()["data"]["access_token"]
    team = client.post("/api/v1/teams", headers={"Authorization": f"Bearer {token}"}, json={"company_name": "Filename Video Team"})
    assert team.status_code == 200
    headers = {"Authorization": f"Bearer {token}", "X-Team-ID": team.json()["data"]["team_id"]}

    dataset = client.post(
        "/api/v1/datasets",
        headers=headers,
        data={"name": "视频文件名自动匹配数据集", "description": "CSV 文件名自动匹配上传 AVI 视频"},
        files=[
            ("file", ("items.csv", "row_id,video_filename,video_path,title\nrow-1,traffic_light_car.avi,C:\\Users\\Lenovo\\Desktop\\markup_multimodal_datasets\\04_video\\video\\traffic_light_car.avi,交通灯\n", "text/csv")),
            ("media_files", ("traffic_light_car.avi", b"fake-video", "application/octet-stream")),
        ],
    )
    assert dataset.status_code == 200
    dataset_data = dataset.json()["data"]
    assert dataset_data["rows"][0]["video_filename"] == "traffic_light_car.avi"
    assert dataset_data["rows"][0]["media"][0]["type"] == "video"
    assert dataset_data["rows"][0]["media"][0]["field"] in {"video_filename", "video_path"}
    assert dataset_data["rows"][0]["media"][0]["mime_type"] == "video/x-msvideo"
    assert dataset_data["rows"][0]["media"][0]["url"].startswith("/api/v1/uploads/")
    assert dataset_data["preview_rows"][0]["video_filename"] == "traffic_light_car.avi"
    assert dataset_data["preview_rows"][0]["media"][0]["url"].startswith("/api/v1/uploads/")
    assert dataset_data["media_assets"] == []
    assert dataset_data["processing_summary"]["bound_media_count"] == 1
    assert dataset_data["processing_summary"]["unbound_media_count"] == 0


def test_labeling_media_context_resolves_uploaded_webm_video_for_preview_and_ai() -> None:
    db = get_database()
    team = Team(company_name="Video Context Team", owner_user_id="video-context-owner")
    owner = User(username="videocontextowner", email="video-context@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(owner)
    db.commit()

    video = UploadedFile(
        team_id=team.id,
        owner_id=owner.id,
        filename="markup_preview.webm",
        content_type="video/webm",
        category="media",
        size=12,
        url="/api/v1/uploads/video-file-1/download",
        storage="filesystem",
        path="uploads/video-context/video-file-1.webm",
    )
    db.add(video)
    db.commit()

    assets = extract_question_media_assets(
        db,
        team.id,
        {
            "media": [
                {
                    "id": "row1_video_filename_1",
                    "type": "video",
                    "role": "primary",
                    "field": "video_filename",
                    "url": video.url,
                    "file_id": video.id,
                    "name": video.filename,
                    "mime_type": video.content_type,
                }
            ]
        },
        {"schema_version": "1.0", "tabs": [], "components": []},
    )

    assert assets == [
        {
            "source_id": "row1_video_filename_1",
            "field": "video_filename",
            "label": "markup_preview.webm",
            "type": "video",
            "role": "primary",
            "url": "/api/v1/uploads/video-file-1/download",
            "original_url": video.url,
            "mime_type": "video/webm",
            "file_id": video.id,
            "status": "ready",
        }
    ]


def test_revoke_other_sessions_invalidates_other_access_tokens_immediately() -> None:
    email = "revoke-other-sessions@example.com"
    code = send_code(email)
    registered = client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Revoke Other Sessions",
            "username": "revokeothersessions",
            "email": email,
            "password": "SecurePass123!",
            "role": "labeler",
            "email_code": code,
        },
    )
    assert registered.status_code == 200

    login_a = client.post("/api/v1/auth/login", json={"account": email, "password": "SecurePass123!"})
    login_b = client.post("/api/v1/auth/login", json={"account": email, "password": "SecurePass123!"})
    assert login_a.status_code == 200
    assert login_b.status_code == 200

    access_a = login_a.json()["data"]["access_token"]
    refresh_a = login_a.json()["data"]["refresh_token"]
    access_b = login_b.json()["data"]["access_token"]

    revoke = client.post(
        "/api/v1/auth/sessions/revoke-others",
        headers={"Authorization": f"Bearer {access_a}"},
        json={"refresh_token": refresh_a},
    )
    assert revoke.status_code == 200

    current_me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access_a}"})
    assert current_me.status_code == 200

    other_me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access_b}"})
    assert other_me.status_code == 401
    assert other_me.json()["code"] == 40101


def test_revoke_other_sessions_rejects_same_user_refresh_token_from_other_session() -> None:
    email = "revoke-session-mismatch@example.com"
    code = send_code(email)
    registered = client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Revoke Session Mismatch",
            "username": "revokesessionmismatch",
            "email": email,
            "password": "SecurePass123!",
            "role": "labeler",
            "email_code": code,
        },
    )
    assert registered.status_code == 200

    current_login = client.post("/api/v1/auth/login", json={"account": email, "password": "SecurePass123!"})
    other_login = client.post("/api/v1/auth/login", json={"account": email, "password": "SecurePass123!"})
    assert current_login.status_code == 200
    assert other_login.status_code == 200

    current_access = current_login.json()["data"]["access_token"]
    other_access = other_login.json()["data"]["access_token"]
    other_refresh = other_login.json()["data"]["refresh_token"]

    revoked = client.post(
        "/api/v1/auth/sessions/revoke-others",
        headers={"Authorization": f"Bearer {current_access}"},
        json={"refresh_token": other_refresh},
    )

    assert revoked.status_code == 401
    assert revoked.json()["code"] == 40101

    current_me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {current_access}"})
    assert current_me.status_code == 200

    other_me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {other_access}"})
    assert other_me.status_code == 200


def test_revoke_other_sessions_rejects_expired_current_refresh_session() -> None:
    db = get_database()
    user = User(username="expiredrevokesession", email="expired-revoke-session@example.com", global_role="labeler", email_verified=True)
    db.add(user)
    db.commit()

    access_token = create_session_bound_access_token(user.id, role=user.global_role)
    expired_jti = "expired-revoke-current-jti"
    expired_session = RefreshSession(
        user_id=user.id,
        jti_hash=auth_service.hash_secret(expired_jti),
        expire_at=datetime(2020, 1, 1),
    )
    other_session = RefreshSession(
        user_id=user.id,
        jti_hash="other-live-revoke-session",
        expire_at=datetime(2026, 6, 1),
    )
    db.add(expired_session)
    db.add(other_session)
    db.commit()

    expired_refresh_token = auth_service.create_refresh_token(user.id, expired_jti)
    revoked = client.post(
        "/api/v1/auth/sessions/revoke-others",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"refresh_token": expired_refresh_token},
    )

    assert revoked.status_code == 401
    assert revoked.json()["code"] == 40101
    assert db.get(RefreshSession, other_session.id).revoked is False


def test_logout_invalidates_current_access_token_immediately() -> None:
    login = client.post("/api/v1/auth/login", json={"account": "labeler@example.com", "password": "SecurePass123!"})
    assert login.status_code == 200
    access_token = login.json()["data"]["access_token"]
    refresh_token = login.json()["data"]["refresh_token"]
    headers = {"Authorization": f"Bearer {access_token}"}

    logout = client.post("/api/v1/auth/logout", headers=headers, json={"refresh_token": refresh_token})
    assert logout.status_code == 200

    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 401
    assert me.json()["code"] == 40101


def test_logout_rejects_same_user_refresh_token_from_other_session() -> None:
    email = "logout-session-mismatch@example.com"
    code = send_code(email)
    register = client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Logout Session Mismatch",
            "username": "logoutsessionmismatch",
            "email": email,
            "password": "SecurePass123!",
            "role": "labeler",
            "email_code": code,
        },
    )
    assert register.status_code == 200

    first_login = client.post("/api/v1/auth/login", json={"account": email, "password": "SecurePass123!"})
    second_login = client.post("/api/v1/auth/login", json={"account": email, "password": "SecurePass123!"})
    assert first_login.status_code == 200
    assert second_login.status_code == 200

    first_access = first_login.json()["data"]["access_token"]
    second_access = second_login.json()["data"]["access_token"]
    second_refresh = second_login.json()["data"]["refresh_token"]
    logout = client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {first_access}"},
        json={"refresh_token": second_refresh},
    )

    assert logout.status_code == 401
    assert logout.json()["code"] == 40101

    first_me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {first_access}"})
    assert first_me.status_code == 200

    second_me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {second_access}"})
    assert second_me.status_code == 200


def test_logout_without_refresh_token_only_revokes_current_session() -> None:
    email = "logout-current-session@example.com"
    code = send_code(email)
    register = client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Logout Current Session",
            "username": "logoutcurrentsession",
            "email": email,
            "password": "SecurePass123!",
            "role": "labeler",
            "email_code": code,
        },
    )
    assert register.status_code == 200

    first_login = client.post("/api/v1/auth/login", json={"account": email, "password": "SecurePass123!"})
    second_login = client.post("/api/v1/auth/login", json={"account": email, "password": "SecurePass123!"})
    assert first_login.status_code == 200
    assert second_login.status_code == 200

    first_access = first_login.json()["data"]["access_token"]
    second_access = second_login.json()["data"]["access_token"]
    client.cookies.clear()

    logout = client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {first_access}"})
    assert logout.status_code == 200

    first_me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {first_access}"})
    assert first_me.status_code == 401
    assert first_me.json()["code"] == 40101

    second_me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {second_access}"})
    assert second_me.status_code == 200


def test_logout_rejects_refresh_token_from_another_user() -> None:
    first_code = send_code("logout-first@example.com")
    second_code = send_code("logout-second@example.com")
    first_register = client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Logout First",
            "username": "logoutfirst",
            "email": "logout-first@example.com",
            "password": "SecurePass123!",
            "email_code": first_code,
        },
    )
    second_register = client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Logout Second",
            "username": "logoutsecond",
            "email": "logout-second@example.com",
            "password": "SecurePass123!",
            "email_code": second_code,
        },
    )
    assert first_register.status_code == 200
    assert second_register.status_code == 200

    first_login = client.post("/api/v1/auth/login", json={"account": "logout-first@example.com", "password": "SecurePass123!"})
    second_login = client.post("/api/v1/auth/login", json={"account": "logout-second@example.com", "password": "SecurePass123!"})
    assert first_login.status_code == 200
    assert second_login.status_code == 200

    logout = client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {first_login.json()['data']['access_token']}"},
        json={"refresh_token": second_login.json()["data"]["refresh_token"]},
    )
    assert logout.status_code == 401
    assert logout.json()["code"] == 40101

    second_me = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {second_login.json()['data']['access_token']}"},
    )
    assert second_me.status_code == 200


def test_refresh_rotates_session_and_invalidates_old_access_token() -> None:
    login = client.post("/api/v1/auth/login", json={"account": "labeler@example.com", "password": "SecurePass123!"})
    assert login.status_code == 200
    old_access_token = login.json()["data"]["access_token"]
    old_refresh_token = login.json()["data"]["refresh_token"]

    refreshed = client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh_token})
    assert refreshed.status_code == 200
    new_access_token = refreshed.json()["data"]["access_token"]

    old_payload = jwt.decode(old_access_token, settings.secret_key, algorithms=["HS256"])
    new_payload = jwt.decode(new_access_token, settings.secret_key, algorithms=["HS256"])
    assert old_payload["sid"] != new_payload["sid"]

    old_me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {old_access_token}"})
    assert old_me.status_code == 401
    assert old_me.json()["code"] == 40101

    new_me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {new_access_token}"})
    assert new_me.status_code == 200


def test_refresh_rejects_token_when_session_belongs_to_another_user() -> None:
    db = get_database()
    token_user = User(username="refreshsubuser", email="refresh-sub@example.com", global_role="labeler", email_verified=True)
    session_user = User(username="refreshsessionuser", email="refresh-session@example.com", global_role="labeler", email_verified=True)
    db.add(token_user)
    db.add(session_user)
    jti = "refresh-session-user-mismatch-jti"
    mismatched_session = RefreshSession(
        user_id=session_user.id,
        jti_hash=auth_service.hash_secret(jti),
        expire_at=datetime(2030, 1, 1),
    )
    db.add(mismatched_session)
    db.commit()
    refresh_token = auth_service.create_refresh_token(token_user.id, jti)

    refreshed = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})

    assert refreshed.status_code == 401
    assert refreshed.json()["code"] == 40101
    assert db.get(RefreshSession, mismatched_session.id).revoked is False
    assert db.find_one(RefreshSession, {"user_id": token_user.id}) is None


def test_change_password_invalidates_existing_access_and_refresh_tokens() -> None:
    register = client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Password Change",
            "username": "passwordchange",
            "email": "passwordchange@example.com",
            "password": "SecurePass123!",
            "role": "labeler",
            "email_code": "",
        },
    )
    assert register.status_code == 200

    login = client.post("/api/v1/auth/login", json={"account": "passwordchange@example.com", "password": "SecurePass123!"})
    assert login.status_code == 200
    access_token = login.json()["data"]["access_token"]
    refresh_token = login.json()["data"]["refresh_token"]

    changed = client.put(
        "/api/v1/auth/password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"old_password": "SecurePass123!", "new_password": "NewSecurePass123!"},
    )
    assert changed.status_code == 200

    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert me.status_code == 401
    assert me.json()["code"] == 40101

    refreshed = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert refreshed.status_code == 401
    assert refreshed.json()["code"] == 40101


def test_reset_password_invalidates_existing_access_and_refresh_tokens() -> None:
    register = client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Password Reset",
            "username": "passwordreset",
            "email": "passwordreset@example.com",
            "password": "SecurePass123!",
            "role": "labeler",
            "email_code": "",
        },
    )
    assert register.status_code == 200

    login = client.post("/api/v1/auth/login", json={"account": "passwordreset@example.com", "password": "SecurePass123!"})
    assert login.status_code == 200
    access_token = login.json()["data"]["access_token"]
    refresh_token = login.json()["data"]["refresh_token"]

    reset_code = send_code_for("passwordreset@example.com", "reset_password")
    reset_response = client.post(
        "/api/v1/auth/password/reset",
        json={
            "email": "passwordreset@example.com",
            "email_code": reset_code,
            "new_password": "NewSecurePass123!",
        },
    )
    assert reset_response.status_code == 200

    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert me.status_code == 401
    assert me.json()["code"] == 40101

    refreshed = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert refreshed.status_code == 401
    assert refreshed.json()["code"] == 40101


def test_reset_password_does_not_change_disabled_user_password() -> None:
    db = get_database()
    disabled_user = User(
        username="disabledreset",
        email="disabled-reset@example.com",
        password_hash=auth_service.hash_password("OldSecurePass123!"),
        global_role="labeler",
        email_verified=True,
        status="disabled",
    )
    db.add(disabled_user)
    db.commit()
    original_hash = disabled_user.password_hash
    reset_code = send_code_for(disabled_user.email, "reset_password")

    reset_response = client.post(
        "/api/v1/auth/password/reset",
        json={
            "email": disabled_user.email,
            "email_code": reset_code,
            "new_password": "NewSecurePass123!",
        },
    )

    assert reset_response.status_code == 200
    reloaded = db.get(User, disabled_user.id)
    assert reloaded.password_hash == original_hash
    assert auth_service.verify_password("NewSecurePass123!", reloaded.password_hash) is False


def test_session_endpoints_reject_structurally_invalid_refresh_tokens() -> None:
    db = get_database()
    user = User(username="malformedrefresh", email="malformed-refresh@example.com", global_role="labeler", email_verified=True)
    db.add(user)
    db.commit()
    access_token = create_session_bound_access_token(user.id, role=user.global_role)
    malformed_refresh = jwt.encode(
        {
            "sub": user.id,
            "typ": "refresh",
            "exp": datetime(2030, 1, 1),
            "iat": datetime(2026, 6, 1),
        },
        settings.secret_key,
        algorithm="HS256",
    )

    refreshed = client.post("/api/v1/auth/refresh", json={"refresh_token": malformed_refresh})
    assert refreshed.status_code == 401
    assert refreshed.json()["code"] == 40101

    logout = client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"refresh_token": malformed_refresh},
    )
    assert logout.status_code == 401
    assert logout.json()["code"] == 40101

    revoked = client.post(
        "/api/v1/auth/sessions/revoke-others",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"refresh_token": malformed_refresh},
    )
    assert revoked.status_code == 401
    assert revoked.json()["code"] == 40101


def test_github_oauth_start_requires_configuration() -> None:
    response = client.get('/api/v1/auth/oauth/github/start')
    assert response.status_code == 502
    assert response.json()['code'] == 50002
    assert 'GITHUB_CLIENT_ID' in response.json()['message']


def test_google_oauth_start_builds_authorization_url(monkeypatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, 'google_client_id', 'cli_test')
    monkeypatch.setattr(settings, 'google_client_secret', 'secret_test')
    monkeypatch.setattr(settings, 'google_redirect_uri', 'http://localhost:8000/api/v1/auth/oauth/google/callback')
    monkeypatch.setattr(settings, 'google_oauth_scope', 'openid email profile')

    response = client.get('/api/v1/auth/oauth/google/start', follow_redirects=False)
    assert response.status_code == 302
    location = response.headers['location']
    assert location.startswith('https://accounts.google.com/o/oauth2/v2/auth?')
    assert 'client_id=cli_test' in location
    assert 'response_type=code' in location
    assert 'redirect_uri=http%3A%2F%2Flocalhost%3A8000%2Fapi%2Fv1%2Fauth%2Foauth%2Fgoogle%2Fcallback' in location
    assert 'scope=openid+email+profile' in location
    assert 'prompt=select_account' in location
    assert 'state=' in location
    assert 'code_challenge=' in location
    assert 'code_challenge_method=S256' in location


def test_huggingface_oauth_start_builds_authorization_url(monkeypatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, 'huggingface_client_id', 'cli_test')
    monkeypatch.setattr(settings, 'huggingface_client_secret', 'secret_test')
    monkeypatch.setattr(settings, 'huggingface_redirect_uri', 'http://localhost:8000/api/v1/auth/oauth/huggingface/callback')
    monkeypatch.setattr(settings, 'huggingface_oauth_scope', 'openid profile email')

    response = client.get('/api/v1/auth/oauth/huggingface/start', follow_redirects=False)
    assert response.status_code == 302
    location = response.headers['location']
    assert location.startswith('https://huggingface.co/oauth/authorize?')
    assert 'client_id=cli_test' in location
    assert 'response_type=code' in location
    assert 'redirect_uri=http%3A%2F%2Flocalhost%3A8000%2Fapi%2Fv1%2Fauth%2Foauth%2Fhuggingface%2Fcallback' in location
    assert 'scope=openid+profile+email' in location
    assert 'state=' in location
    assert 'code_challenge=' in location
    assert 'code_challenge_method=S256' in location


def test_github_oauth_start_builds_authorization_url_with_account_picker(monkeypatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, 'github_client_id', 'cli_test')
    monkeypatch.setattr(settings, 'github_client_secret', 'secret_test')
    monkeypatch.setattr(settings, 'github_redirect_uri', 'http://localhost:8000/api/v1/auth/oauth/github/callback')

    response = client.get('/api/v1/auth/oauth/github/start', follow_redirects=False)
    assert response.status_code == 302
    location = response.headers['location']
    assert location.startswith('https://github.com/login/oauth/authorize?')
    assert 'client_id=cli_test' in location
    assert 'redirect_uri=http%3A%2F%2Flocalhost%3A8000%2Fapi%2Fv1%2Fauth%2Foauth%2Fgithub%2Fcallback' in location
    assert 'scope=read%3Auser+user%3Aemail' in location
    assert 'prompt=select_account' in location
    assert 'state=' in location
    assert 'code_challenge=' in location
    assert 'code_challenge_method=S256' in location


def test_github_oauth_callback_redirects_to_frontend_without_duplicate_identity(monkeypatch) -> None:
    from urllib.parse import parse_qs, urlparse

    from app.core.config import settings
    from app.services import oauth_service

    reset_database()
    monkeypatch.setattr(settings, 'github_client_id', 'cli_test')
    monkeypatch.setattr(settings, 'github_client_secret', 'secret_test')
    monkeypatch.setattr(settings, 'github_redirect_uri', 'http://localhost:8000/api/v1/auth/oauth/github/callback')
    monkeypatch.setattr(settings, 'frontend_oauth_callback_url', 'http://localhost:5173/oauth/callback')

    async def fake_fetch_github_profile(code: str, code_verifier: str | None):
        return oauth_service.OAuthProfile(
            provider_user_id='github-user-1',
            username='github_demo',
            email='github-demo@example.com',
            email_verified=True,
            avatar='https://example.com/avatar.png',
        )

    monkeypatch.setattr(oauth_service, 'fetch_github_profile', fake_fetch_github_profile)

    start = client.get('/api/v1/auth/oauth/github/start', follow_redirects=False)
    assert start.status_code == 302
    state = parse_qs(urlparse(start.headers['location']).query)['state'][0]

    callback = client.get(
        f'/api/v1/auth/oauth/github/callback?code=fake-code&state={state}',
        follow_redirects=False,
    )
    assert callback.status_code == 302
    assert callback.headers['location'].startswith('http://localhost:5173/oauth/callback?')


def test_github_oauth_callback_drops_external_redirect_after_login(monkeypatch) -> None:
    from urllib.parse import parse_qs, urlparse

    from app.core.config import settings
    from app.services import oauth_service

    reset_database()
    monkeypatch.setattr(settings, 'github_client_id', 'cli_test')
    monkeypatch.setattr(settings, 'github_client_secret', 'secret_test')
    monkeypatch.setattr(settings, 'github_redirect_uri', 'http://localhost:8000/api/v1/auth/oauth/github/callback')
    monkeypatch.setattr(settings, 'frontend_app_url', 'http://localhost:5173')
    monkeypatch.setattr(settings, 'frontend_oauth_callback_url', 'http://localhost:5173/oauth/callback')

    async def fake_fetch_github_profile(code: str, code_verifier: str | None):
        return oauth_service.OAuthProfile(
            provider_user_id='github-user-external-redirect',
            username='github_external_redirect',
            email='github-external-redirect@example.com',
            email_verified=True,
            avatar='https://example.com/avatar-external-redirect.png',
        )

    monkeypatch.setattr(oauth_service, 'fetch_github_profile', fake_fetch_github_profile)

    start = client.get(
        '/api/v1/auth/oauth/github/start?redirect_after_login=https%3A%2F%2Fevil.example%2Fphish',
        follow_redirects=False,
    )
    assert start.status_code == 302
    state = parse_qs(urlparse(start.headers['location']).query)['state'][0]

    callback = client.get(
        f'/api/v1/auth/oauth/github/callback?code=fake-code&state={state}',
        follow_redirects=False,
    )
    assert callback.status_code == 302
    redirect_query = parse_qs(urlparse(callback.headers['location']).query, keep_blank_values=True)
    assert redirect_query['redirect_after_login'] == ['']


def test_github_oauth_first_login_requires_explicit_account_choice(monkeypatch) -> None:
    from urllib.parse import parse_qs, urlparse

    from app.core.config import settings
    from app.models.auth import OAuthIdentity
    from app.models.user import User
    from app.services import oauth_service

    reset_database()
    monkeypatch.setattr(settings, 'github_client_id', 'cli_test')
    monkeypatch.setattr(settings, 'github_client_secret', 'secret_test')
    monkeypatch.setattr(settings, 'github_redirect_uri', 'http://localhost:8000/api/v1/auth/oauth/github/callback')
    monkeypatch.setattr(settings, 'frontend_oauth_callback_url', 'http://localhost:5173/oauth/callback')

    async def fake_fetch_github_profile(code: str, code_verifier: str | None):
        return oauth_service.OAuthProfile(
            provider_user_id='github-user-explicit',
            username='github_explicit',
            email='github-explicit@example.com',
            email_verified=True,
            avatar='https://example.com/avatar-explicit.png',
        )

    monkeypatch.setattr(oauth_service, 'fetch_github_profile', fake_fetch_github_profile)

    start = client.get('/api/v1/auth/oauth/github/start', follow_redirects=False)
    state = parse_qs(urlparse(start.headers['location']).query)['state'][0]
    callback = client.get(
        f'/api/v1/auth/oauth/github/callback?code=fake-code&state={state}',
        follow_redirects=False,
    )
    ticket = parse_qs(urlparse(callback.headers['location']).query)['ticket'][0]

    exchange = client.post('/api/v1/auth/oauth/exchange', json={'ticket': ticket})
    assert exchange.status_code == 200
    payload = exchange.json()['data']
    assert payload['needs_account_link'] is True
    assert payload['provider'] == 'github'
    assert payload['suggested_email'] == 'github-explicit@example.com'
    assert payload['email_verified_by_provider'] is True

    db = get_database()
    assert db.find_one(User, {'email': 'github-explicit@example.com'}) is None
    assert db.find_one(OAuthIdentity, {'provider': 'github', 'provider_user_id': 'github-user-explicit'}) is None


def test_oauth_unverified_provider_email_requires_verified_registration_email() -> None:
    from app.services import oauth_service

    reset_database()
    oauth_service.oauth_login_tickets.clear()
    db = get_database()
    matching_untrusted_user = User(
        username="untrustedmailuser",
        email="untrusted-provider@example.com",
        global_role="labeler",
        email_verified=True,
    )
    db.add(matching_untrusted_user)
    db.commit()

    ticket = oauth_service.generate_oauth_ticket(
        provider="github",
        profile=oauth_service.OAuthProfile(
            provider_user_id="github-unverified-email",
            username="github_unverified_email",
            email="untrusted-provider@example.com",
            email_verified=False,
            avatar="https://example.com/avatar-unverified-email.png",
        ),
        user_id=None,
        intent=oauth_service.OAUTH_INTENT_LOGIN,
        redirect_after_login=None,
    )

    exchange = client.post("/api/v1/auth/oauth/exchange", json={"ticket": ticket})
    assert exchange.status_code == 200
    payload = exchange.json()["data"]
    assert payload["needs_account_link"] is True
    assert payload["suggested_email"] is None
    assert payload["has_matching_user"] is False

    bind_ticket = payload["bind_ticket"]
    verified_email = "verified-oauth-register@example.com"
    code = send_code_for(verified_email, "bind_email")
    registered = client.post(
        "/api/v1/auth/oauth/register-account",
        json={
            "ticket": bind_ticket,
            "display_name": "Verified OAuth Register",
            "username": "verifiedoauth",
            "email": verified_email,
            "email_code": code,
            "password": "SecurePass123!",
            "role": "pending",
        },
    )
    assert registered.status_code == 200
    assert registered.json()["data"]["user"]["email"] == verified_email
    assert db.find_one(User, {"email": verified_email}) is not None


def test_oauth_register_requires_email_code_when_provider_verified_flag_has_no_email() -> None:
    from app.services import oauth_service

    reset_database()
    oauth_service.oauth_login_tickets.clear()
    db = get_database()
    ticket = oauth_service.generate_oauth_ticket(
        provider="github",
        profile=oauth_service.OAuthProfile(
            provider_user_id="github-verified-flag-no-email",
            username="github_no_email",
            email=None,
            email_verified=True,
            avatar="https://example.com/avatar-no-email.png",
        ),
        user_id=None,
        intent=oauth_service.OAUTH_INTENT_LOGIN,
        redirect_after_login=None,
    )

    registered = client.post(
        "/api/v1/auth/oauth/register-account",
        json={
            "ticket": ticket,
            "display_name": "No Email OAuth Register",
            "username": "noemailoauth",
            "email": "spoofed-oauth-email@example.com",
            "email_code": "000000",
            "password": "SecurePass123!",
            "role": "pending",
        },
    )

    assert registered.status_code == 400
    assert registered.json()["code"] == 40002
    assert db.find_one(User, {"email": "spoofed-oauth-email@example.com"}) is None
    assert db.find_one(OAuthIdentity, {"provider": "github", "provider_user_id": "github-verified-flag-no-email"}) is None


def test_oauth_bind_email_does_not_auto_create_unlinked_account() -> None:
    from app.models.auth import OAuthIdentity
    from app.models.user import User
    from app.services import oauth_service

    reset_database()
    oauth_service.oauth_login_tickets.clear()

    email = "oauth-bind-new@example.com"
    ticket = oauth_service.generate_oauth_ticket(
        provider="github",
        profile=oauth_service.OAuthProfile(
            provider_user_id="github-bind-new-user",
            username="github_bind_new",
            email=None,
            email_verified=False,
            avatar="https://example.com/avatar-bind-new.png",
        ),
        user_id=None,
        intent=oauth_service.OAUTH_INTENT_LOGIN,
        redirect_after_login=None,
    )
    code = send_code_for(email, "bind_email")

    response = client.post(
        "/api/v1/auth/oauth/bind-email",
        json={"ticket": ticket, "email": email, "email_code": code},
    )

    assert response.status_code == 422
    assert response.json()["code"] == 42201

    db = get_database()
    assert db.find_one(User, {"email": email}) is None
    assert db.find_one(OAuthIdentity, {"provider": "github", "provider_user_id": "github-bind-new-user"}) is None


def test_oauth_bind_email_failure_keeps_code_usable_for_explicit_register() -> None:
    from app.models.auth import OAuthIdentity
    from app.models.user import User
    from app.services import oauth_service

    oauth_service.oauth_login_tickets.clear()

    email = "oauth-bind-register@example.com"
    ticket = oauth_service.generate_oauth_ticket(
        provider="github",
        profile=oauth_service.OAuthProfile(
            provider_user_id="github-bind-register-user",
            username="github_bind_register",
            email=None,
            email_verified=False,
            avatar="https://example.com/avatar-bind-register.png",
        ),
        user_id=None,
        intent=oauth_service.OAUTH_INTENT_LOGIN,
        redirect_after_login=None,
    )
    code = send_code_for(email, "bind_email")

    bind_response = client.post(
        "/api/v1/auth/oauth/bind-email",
        json={"ticket": ticket, "email": email, "email_code": code},
    )
    assert bind_response.status_code == 422

    registered = client.post(
        "/api/v1/auth/oauth/register-account",
        json={
            "ticket": ticket,
            "display_name": "OAuth Bind Register",
            "username": "bindregister",
            "email": email,
            "email_code": code,
            "password": "SecurePass123!",
            "role": "pending",
        },
    )

    assert registered.status_code == 200
    assert registered.json()["data"]["user"]["email"] == email
    db = get_database()
    assert db.find_one(User, {"email": email}) is not None
    assert db.find_one(OAuthIdentity, {"provider": "github", "provider_user_id": "github-bind-register-user"}) is not None


def test_oauth_register_duplicate_username_keeps_bind_email_code_usable() -> None:
    from app.models.auth import OAuthIdentity
    from app.models.user import User
    from app.services import oauth_service

    reset_database()
    oauth_service.oauth_login_tickets.clear()
    db = get_database()
    existing_user = User(
        username="oauthdupe",
        email="oauth-dupe-existing@example.com",
        global_role="labeler",
        email_verified=True,
    )
    db.add(existing_user)
    db.commit()

    email = "oauth-dupe-register@example.com"
    ticket = oauth_service.generate_oauth_ticket(
        provider="github",
        profile=oauth_service.OAuthProfile(
            provider_user_id="github-dupe-register-user",
            username="github_dupe_register",
            email=None,
            email_verified=False,
            avatar="https://example.com/avatar-dupe-register.png",
        ),
        user_id=None,
        intent=oauth_service.OAUTH_INTENT_LOGIN,
        redirect_after_login=None,
    )
    code = send_code_for(email, "bind_email")

    duplicate_username = client.post(
        "/api/v1/auth/oauth/register-account",
        json={
            "ticket": ticket,
            "display_name": "OAuth Duplicate Register",
            "username": existing_user.username,
            "email": email,
            "email_code": code,
            "password": "SecurePass123!",
            "role": "pending",
        },
    )
    assert duplicate_username.status_code == 409

    registered = client.post(
        "/api/v1/auth/oauth/register-account",
        json={
            "ticket": ticket,
            "display_name": "OAuth Duplicate Register",
            "username": "oauthdupeok",
            "email": email,
            "email_code": code,
            "password": "SecurePass123!",
            "role": "pending",
        },
    )

    assert registered.status_code == 200
    assert registered.json()["data"]["user"]["email"] == email
    assert db.find_one(User, {"email": email}) is not None
    assert db.find_one(OAuthIdentity, {"provider": "github", "provider_user_id": "github-dupe-register-user"}) is not None


def test_oauth_bind_email_rejects_inactive_existing_user() -> None:
    from app.models.auth import OAuthIdentity
    from app.models.user import User
    from app.services import oauth_service

    reset_database()
    oauth_service.oauth_login_tickets.clear()
    db = get_database()
    inactive_user = User(
        username="inactivebindemail",
        email="inactive-bind-email@example.com",
        global_role="labeler",
        email_verified=False,
        status="disabled",
    )
    db.add(inactive_user)
    db.commit()

    ticket = oauth_service.generate_oauth_ticket(
        provider="github",
        profile=oauth_service.OAuthProfile(
            provider_user_id="github-bind-inactive",
            username="github_bind_inactive",
            email=None,
            email_verified=False,
            avatar="https://example.com/avatar-bind-inactive.png",
        ),
        user_id=None,
        intent=oauth_service.OAUTH_INTENT_LOGIN,
        redirect_after_login=None,
    )
    code = send_code_for(inactive_user.email, "bind_email")

    response = client.post(
        "/api/v1/auth/oauth/bind-email",
        json={"ticket": ticket, "email": inactive_user.email, "email_code": code},
    )

    assert response.status_code == 401
    assert response.json()["code"] == 40101
    assert db.find_one(OAuthIdentity, {"provider": "github", "provider_user_id": "github-bind-inactive"}) is None


def test_github_oauth_exchange_rejects_inactive_linked_user(monkeypatch) -> None:
    from urllib.parse import parse_qs, urlparse

    from app.core.config import settings
    from app.models.auth import OAuthIdentity
    from app.models.user import User
    from app.services import oauth_service

    reset_database()
    oauth_service.oauth_login_tickets.clear()
    monkeypatch.setattr(settings, 'github_client_id', 'cli_test')
    monkeypatch.setattr(settings, 'github_client_secret', 'secret_test')
    monkeypatch.setattr(settings, 'github_redirect_uri', 'http://localhost:8000/api/v1/auth/oauth/github/callback')
    monkeypatch.setattr(settings, 'frontend_oauth_callback_url', 'http://localhost:5173/oauth/callback')

    db = get_database()
    inactive_user = User(
        username='inactiveoauth',
        email='inactive-oauth@example.com',
        global_role='labeler',
        email_verified=True,
        status='disabled',
    )
    db.add(inactive_user)
    db.add(OAuthIdentity(user_id=inactive_user.id, provider='github', provider_user_id='github-user-inactive'))
    db.commit()

    async def fake_fetch_github_profile(code: str, code_verifier: str | None):
        return oauth_service.OAuthProfile(
            provider_user_id='github-user-inactive',
            username='github_inactive',
            email='inactive-oauth@example.com',
            email_verified=True,
            avatar='https://example.com/avatar-inactive.png',
        )

    monkeypatch.setattr(oauth_service, 'fetch_github_profile', fake_fetch_github_profile)

    start = client.get('/api/v1/auth/oauth/github/start', follow_redirects=False)
    state = parse_qs(urlparse(start.headers['location']).query)['state'][0]
    callback = client.get(
        f'/api/v1/auth/oauth/github/callback?code=fake-code&state={state}',
        follow_redirects=False,
    )
    ticket = parse_qs(urlparse(callback.headers['location']).query)['ticket'][0]

    exchange = client.post('/api/v1/auth/oauth/exchange', json={'ticket': ticket})

    assert exchange.status_code == 401
    assert db.find(RefreshSession, {'user_id': inactive_user.id}) == []


def test_github_oauth_can_link_existing_account(monkeypatch) -> None:
    from urllib.parse import parse_qs, urlparse

    from app.core.config import settings
    from app.models.auth import OAuthIdentity
    from app.services import oauth_service

    reset_database()
    existing_register = client.post(
        '/api/v1/auth/register',
        json={
            'display_name': 'Existing User',
            'username': 'existinguser',
            'email': 'bind-existing@example.com',
            'password': 'SecurePass123!',
            'role': 'pending',
            'email_code': '',
        },
    )
    assert existing_register.status_code == 200

    monkeypatch.setattr(settings, 'github_client_id', 'cli_test')
    monkeypatch.setattr(settings, 'github_client_secret', 'secret_test')
    monkeypatch.setattr(settings, 'github_redirect_uri', 'http://localhost:8000/api/v1/auth/oauth/github/callback')
    monkeypatch.setattr(settings, 'frontend_oauth_callback_url', 'http://localhost:5173/oauth/callback')

    async def fake_fetch_github_profile(code: str, code_verifier: str | None):
        return oauth_service.OAuthProfile(
            provider_user_id='github-user-link',
            username='github_link',
            email='bind-existing@example.com',
            email_verified=True,
            avatar='https://example.com/avatar-link.png',
        )

    monkeypatch.setattr(oauth_service, 'fetch_github_profile', fake_fetch_github_profile)

    start = client.get('/api/v1/auth/oauth/github/start', follow_redirects=False)
    state = parse_qs(urlparse(start.headers['location']).query)['state'][0]
    callback = client.get(
        f'/api/v1/auth/oauth/github/callback?code=fake-code&state={state}',
        follow_redirects=False,
    )
    ticket = parse_qs(urlparse(callback.headers['location']).query)['ticket'][0]
    exchange = client.post('/api/v1/auth/oauth/exchange', json={'ticket': ticket})
    bind_ticket = exchange.json()['data']['bind_ticket']

    linked = client.post(
        '/api/v1/auth/oauth/link-account',
        json={'ticket': bind_ticket, 'account': 'existinguser', 'password': 'SecurePass123!'},
    )
    assert linked.status_code == 200
    assert linked.json()['data']['user']['email'] == 'bind-existing@example.com'

    db = get_database()
    identity = db.find_one(OAuthIdentity, {'provider': 'github', 'provider_user_id': 'github-user-link'})
    assert identity is not None


def test_github_oauth_can_register_new_pending_account_without_auto_creation(monkeypatch) -> None:
    from urllib.parse import parse_qs, urlparse

    from app.core.config import settings
    from app.models.auth import OAuthIdentity
    from app.models.user import User
    from app.services import oauth_service

    reset_database()
    monkeypatch.setattr(settings, 'github_client_id', 'cli_test')
    monkeypatch.setattr(settings, 'github_client_secret', 'secret_test')
    monkeypatch.setattr(settings, 'github_redirect_uri', 'http://localhost:8000/api/v1/auth/oauth/github/callback')
    monkeypatch.setattr(settings, 'frontend_oauth_callback_url', 'http://localhost:5173/oauth/callback')

    async def fake_fetch_github_profile(code: str, code_verifier: str | None):
        return oauth_service.OAuthProfile(
            provider_user_id='github-user-register',
            username='github_register',
            email='github-register@example.com',
            email_verified=True,
            avatar='https://example.com/avatar-register.png',
        )

    monkeypatch.setattr(oauth_service, 'fetch_github_profile', fake_fetch_github_profile)

    start = client.get('/api/v1/auth/oauth/github/start', follow_redirects=False)
    state = parse_qs(urlparse(start.headers['location']).query)['state'][0]
    callback = client.get(
        f'/api/v1/auth/oauth/github/callback?code=fake-code&state={state}',
        follow_redirects=False,
    )
    ticket = parse_qs(urlparse(callback.headers['location']).query)['ticket'][0]
    exchange = client.post('/api/v1/auth/oauth/exchange', json={'ticket': ticket})
    bind_ticket = exchange.json()['data']['bind_ticket']

    registered = client.post(
        '/api/v1/auth/oauth/register-account',
        json={
            'ticket': bind_ticket,
            'display_name': 'GitHub Register',
            'username': 'githubregister',
            'password': 'SecurePass123!',
            'role': 'pending',
        },
    )
    assert registered.status_code == 200
    assert registered.json()['data']['user']['role'] == 'pending'
    assert registered.json()['data']['user']['email'] == 'github-register@example.com'

    db = get_database()
    user = db.find_one(User, {'email': 'github-register@example.com'})
    identity = db.find_one(OAuthIdentity, {'provider': 'github', 'provider_user_id': 'github-user-register'})
    assert user is not None
    assert identity is not None


def test_oauth_ticket_is_not_consumed_on_failed_link_attempt(monkeypatch) -> None:
    from urllib.parse import parse_qs, urlparse

    from app.core.config import settings
    from app.services import oauth_service

    reset_database()
    existing_register = client.post(
        '/api/v1/auth/register',
        json={
            'display_name': 'Retry User',
            'username': 'retryuser',
            'email': 'retry-user@example.com',
            'password': 'SecurePass123!',
            'role': 'pending',
            'email_code': '',
        },
    )
    assert existing_register.status_code == 200

    monkeypatch.setattr(settings, 'github_client_id', 'cli_test')
    monkeypatch.setattr(settings, 'github_client_secret', 'secret_test')
    monkeypatch.setattr(settings, 'github_redirect_uri', 'http://localhost:8000/api/v1/auth/oauth/github/callback')
    monkeypatch.setattr(settings, 'frontend_oauth_callback_url', 'http://localhost:5173/oauth/callback')

    async def fake_fetch_github_profile(code: str, code_verifier: str | None):
        return oauth_service.OAuthProfile(
            provider_user_id='github-user-retry',
            username='github_retry',
            email='retry-user@example.com',
            email_verified=True,
            avatar='https://example.com/avatar-retry.png',
        )

    monkeypatch.setattr(oauth_service, 'fetch_github_profile', fake_fetch_github_profile)

    start = client.get('/api/v1/auth/oauth/github/start', follow_redirects=False)
    state = parse_qs(urlparse(start.headers['location']).query)['state'][0]
    callback = client.get(
        f'/api/v1/auth/oauth/github/callback?code=fake-code&state={state}',
        follow_redirects=False,
    )
    ticket = parse_qs(urlparse(callback.headers['location']).query)['ticket'][0]
    exchange = client.post('/api/v1/auth/oauth/exchange', json={'ticket': ticket})
    bind_ticket = exchange.json()['data']['bind_ticket']

    wrong_password = client.post(
        '/api/v1/auth/oauth/link-account',
        json={'ticket': bind_ticket, 'account': 'retryuser', 'password': 'WrongPass123!'},
    )
    assert wrong_password.status_code == 401
    assert wrong_password.json()['code'] == 40103

    retry = client.post(
        '/api/v1/auth/oauth/link-account',
        json={'ticket': bind_ticket, 'account': 'retryuser', 'password': 'SecurePass123!'},
    )
    assert retry.status_code == 200


def test_oauth_can_link_existing_account_even_when_provider_email_differs(monkeypatch) -> None:
    from urllib.parse import parse_qs, urlparse

    from app.core.config import settings
    from app.models.auth import OAuthIdentity
    from app.services import oauth_service

    reset_database()
    existing_register = client.post(
        '/api/v1/auth/register',
        json={
            'display_name': 'Mismatch User',
            'username': 'mismatchuser',
            'email': 'local-user@example.com',
            'password': 'SecurePass123!',
            'role': 'pending',
            'email_code': '',
        },
    )
    assert existing_register.status_code == 200

    monkeypatch.setattr(settings, 'github_client_id', 'cli_test')
    monkeypatch.setattr(settings, 'github_client_secret', 'secret_test')
    monkeypatch.setattr(settings, 'github_redirect_uri', 'http://localhost:8000/api/v1/auth/oauth/github/callback')
    monkeypatch.setattr(settings, 'frontend_oauth_callback_url', 'http://localhost:5173/oauth/callback')

    async def fake_fetch_github_profile(code: str, code_verifier: str | None):
        return oauth_service.OAuthProfile(
            provider_user_id='github-user-mismatch',
            username='github_mismatch',
            email='provider-user@example.com',
            email_verified=True,
            avatar='https://example.com/avatar-mismatch.png',
        )

    monkeypatch.setattr(oauth_service, 'fetch_github_profile', fake_fetch_github_profile)

    start = client.get('/api/v1/auth/oauth/github/start', follow_redirects=False)
    state = parse_qs(urlparse(start.headers['location']).query)['state'][0]
    callback = client.get(
        f'/api/v1/auth/oauth/github/callback?code=fake-code&state={state}',
        follow_redirects=False,
    )
    ticket = parse_qs(urlparse(callback.headers['location']).query)['ticket'][0]
    exchange = client.post('/api/v1/auth/oauth/exchange', json={'ticket': ticket})
    bind_ticket = exchange.json()['data']['bind_ticket']

    linked = client.post(
        '/api/v1/auth/oauth/link-account',
        json={'ticket': bind_ticket, 'account': 'mismatchuser', 'password': 'SecurePass123!'},
    )
    assert linked.status_code == 200
    assert linked.json()['data']['user']['email'] == 'local-user@example.com'

    db = get_database()
    identity = db.find_one(OAuthIdentity, {'provider': 'github', 'provider_user_id': 'github-user-mismatch'})
    assert identity is not None


def test_github_oauth_rejects_link_when_target_account_already_has_same_provider(monkeypatch) -> None:
    from urllib.parse import parse_qs, urlparse

    from app.core.config import settings
    from app.services import oauth_service

    reset_database()
    existing_register = client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Existing User",
            "username": "existinguser",
            "email": "provider-conflict@example.com",
            "password": "SecurePass123!",
            "role": "pending",
            "email_code": "",
        },
    )
    assert existing_register.status_code == 200
    db = get_database()
    existing_user = db.find_one(User, {"username": "existinguser"})
    assert existing_user is not None
    db.add(
        OAuthIdentity(
            user_id=existing_user.id,
            provider="github",
            provider_user_id="github-user-old",
            provider_username="existing-gh",
            provider_email="provider-conflict@example.com",
            email_verified_by_provider=True,
        )
    )
    db.commit()

    monkeypatch.setattr(settings, "github_client_id", "cli_test")
    monkeypatch.setattr(settings, "github_client_secret", "secret_test")
    monkeypatch.setattr(settings, "github_redirect_uri", "http://localhost:8000/api/v1/auth/oauth/github/callback")
    monkeypatch.setattr(settings, "frontend_oauth_callback_url", "http://localhost:5173/oauth/callback")

    async def fake_fetch_github_profile(code: str, code_verifier: str | None):
        return oauth_service.OAuthProfile(
            provider_user_id="github-user-new",
            username="github_new",
            email="provider-conflict@example.com",
            email_verified=True,
            avatar="https://example.com/avatar-new.png",
        )

    monkeypatch.setattr(oauth_service, "fetch_github_profile", fake_fetch_github_profile)

    start = client.get("/api/v1/auth/oauth/github/start", follow_redirects=False)
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    callback = client.get(
        f"/api/v1/auth/oauth/github/callback?code=fake-code&state={state}",
        follow_redirects=False,
    )
    ticket = parse_qs(urlparse(callback.headers["location"]).query)["ticket"][0]
    exchange = client.post("/api/v1/auth/oauth/exchange", json={"ticket": ticket})
    bind_ticket = exchange.json()["data"]["bind_ticket"]

    linked = client.post(
        "/api/v1/auth/oauth/link-account",
        json={"ticket": bind_ticket, "account": "existinguser", "password": "SecurePass123!"},
    )
    assert linked.status_code == 409
    assert linked.json()["code"] == 40901


def test_github_oauth_bind_current_user_callback_preserves_intent_and_redirect(monkeypatch) -> None:
    from urllib.parse import parse_qs, urlparse

    from app.core.config import settings
    from app.services import oauth_service

    reset_database()
    monkeypatch.setattr(settings, "github_client_id", "cli_test")
    monkeypatch.setattr(settings, "github_client_secret", "secret_test")
    monkeypatch.setattr(settings, "github_redirect_uri", "http://localhost:8000/api/v1/auth/oauth/github/callback")
    monkeypatch.setattr(settings, "frontend_oauth_callback_url", "http://localhost:5173/oauth/callback")

    async def fake_fetch_github_profile(code: str, code_verifier: str | None):
        return oauth_service.OAuthProfile(
            provider_user_id="github-user-callback",
            username="github_callback",
            email="callback@example.com",
            email_verified=True,
            avatar="https://example.com/avatar-callback.png",
        )

    monkeypatch.setattr(oauth_service, "fetch_github_profile", fake_fetch_github_profile)

    start = client.get(
        "/api/v1/auth/oauth/github/start?intent=bind_current_user&redirect_after_login=%2Fworkspace%3Fpage%3Daccount",
        follow_redirects=False,
    )
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    callback = client.get(
        f"/api/v1/auth/oauth/github/callback?code=fake-code&state={state}",
        follow_redirects=False,
    )
    redirect_query = parse_qs(urlparse(callback.headers["location"]).query)

    assert redirect_query["intent"] == ["bind_current_user"]
    assert redirect_query["redirect_after_login"] == ["/workspace?page=account"]
    assert redirect_query["provider"] == ["github"]
    assert redirect_query["ticket"]


def test_bind_current_user_ticket_cannot_be_exchanged_as_login(monkeypatch) -> None:
    from urllib.parse import parse_qs, urlparse

    from app.core.config import settings
    from app.services import oauth_service

    reset_database()
    monkeypatch.setattr(settings, "github_client_id", "cli_test")
    monkeypatch.setattr(settings, "github_client_secret", "secret_test")
    monkeypatch.setattr(settings, "github_redirect_uri", "http://localhost:8000/api/v1/auth/oauth/github/callback")
    monkeypatch.setattr(settings, "frontend_oauth_callback_url", "http://localhost:5173/oauth/callback")

    async def fake_fetch_github_profile(code: str, code_verifier: str | None):
        return oauth_service.OAuthProfile(
            provider_user_id="github-user-bind-ticket",
            username="github_bind_ticket",
            email="bind-ticket@example.com",
            email_verified=True,
            avatar="https://example.com/avatar-bind-ticket.png",
        )

    monkeypatch.setattr(oauth_service, "fetch_github_profile", fake_fetch_github_profile)

    start = client.get("/api/v1/auth/oauth/github/start?intent=bind_current_user", follow_redirects=False)
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    callback = client.get(
        f"/api/v1/auth/oauth/github/callback?code=fake-code&state={state}",
        follow_redirects=False,
    )
    ticket = parse_qs(urlparse(callback.headers["location"]).query)["ticket"][0]

    exchange = client.post("/api/v1/auth/oauth/exchange", json={"ticket": ticket})
    assert exchange.status_code == 422
    assert exchange.json()["code"] == 42201


def test_github_oauth_account_page_can_link_current_user(monkeypatch) -> None:
    from urllib.parse import parse_qs, urlparse

    from app.core.config import settings
    from app.services import oauth_service

    reset_database()
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Account Owner",
            "username": "accountowner",
            "email": "account-owner@example.com",
            "password": "SecurePass123!",
            "role": "pending",
            "email_code": "",
        },
    )
    assert register_response.status_code == 200
    login_response = client.post(
        "/api/v1/auth/login",
        json={"account": "accountowner", "password": "SecurePass123!"},
    )
    access_token = login_response.json()["data"]["access_token"]

    monkeypatch.setattr(settings, "github_client_id", "cli_test")
    monkeypatch.setattr(settings, "github_client_secret", "secret_test")
    monkeypatch.setattr(settings, "github_redirect_uri", "http://localhost:8000/api/v1/auth/oauth/github/callback")
    monkeypatch.setattr(settings, "frontend_oauth_callback_url", "http://localhost:5173/oauth/callback")

    async def fake_fetch_github_profile(code: str, code_verifier: str | None):
        return oauth_service.OAuthProfile(
            provider_user_id="github-user-current",
            username="github_current",
            email="account-owner@example.com",
            email_verified=True,
            avatar="https://example.com/avatar-current.png",
        )

    monkeypatch.setattr(oauth_service, "fetch_github_profile", fake_fetch_github_profile)

    start = client.get("/api/v1/auth/oauth/github/start?intent=bind_current_user", follow_redirects=False)
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    callback = client.get(
        f"/api/v1/auth/oauth/github/callback?code=fake-code&state={state}",
        follow_redirects=False,
    )
    ticket = parse_qs(urlparse(callback.headers["location"]).query)["ticket"][0]

    linked = client.post(
        "/api/v1/auth/oauth/link-current-user",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"ticket": ticket},
    )
    assert linked.status_code == 200
    assert linked.json()["data"]["provider"] == "github"
    assert linked.json()["data"]["linked"] is True

    db = get_database()
    account_owner = db.find_one(User, {"username": "accountowner"})
    identity = db.find_one(OAuthIdentity, {"provider": "github", "provider_user_id": "github-user-current"})
    assert account_owner is not None
    assert identity is not None
    assert identity.user_id == account_owner.id


def test_github_oauth_account_page_rejects_when_current_user_already_bound_same_provider(monkeypatch) -> None:
    from urllib.parse import parse_qs, urlparse

    from app.core.config import settings
    from app.services import oauth_service

    reset_database()
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Account Owner",
            "username": "accountowner",
            "email": "account-owner@example.com",
            "password": "SecurePass123!",
            "role": "pending",
            "email_code": "",
        },
    )
    assert register_response.status_code == 200
    login_response = client.post(
        "/api/v1/auth/login",
        json={"account": "accountowner", "password": "SecurePass123!"},
    )
    access_token = login_response.json()["data"]["access_token"]

    db = get_database()
    account_owner = db.find_one(User, {"username": "accountowner"})
    assert account_owner is not None
    db.add(
        OAuthIdentity(
            user_id=account_owner.id,
            provider="github",
            provider_user_id="github-user-old",
            provider_username="owner-gh-old",
            provider_email="account-owner@example.com",
            email_verified_by_provider=True,
        )
    )
    db.commit()

    monkeypatch.setattr(settings, "github_client_id", "cli_test")
    monkeypatch.setattr(settings, "github_client_secret", "secret_test")
    monkeypatch.setattr(settings, "github_redirect_uri", "http://localhost:8000/api/v1/auth/oauth/github/callback")
    monkeypatch.setattr(settings, "frontend_oauth_callback_url", "http://localhost:5173/oauth/callback")

    async def fake_fetch_github_profile(code: str, code_verifier: str | None):
        return oauth_service.OAuthProfile(
            provider_user_id="github-user-new",
            username="github_new",
            email="account-owner@example.com",
            email_verified=True,
            avatar="https://example.com/avatar-current-new.png",
        )

    monkeypatch.setattr(oauth_service, "fetch_github_profile", fake_fetch_github_profile)

    start = client.get("/api/v1/auth/oauth/github/start?intent=bind_current_user", follow_redirects=False)
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    callback = client.get(
        f"/api/v1/auth/oauth/github/callback?code=fake-code&state={state}",
        follow_redirects=False,
    )
    ticket = parse_qs(urlparse(callback.headers["location"]).query)["ticket"][0]

    linked = client.post(
        "/api/v1/auth/oauth/link-current-user",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"ticket": ticket},
    )
    assert linked.status_code == 409
    assert linked.json()["code"] == 40901

    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert me.status_code == 200
    assert me.json()["data"]["username"] == "accountowner"


def test_github_oauth_account_page_conflict_keeps_current_session(monkeypatch) -> None:
    from urllib.parse import parse_qs, urlparse

    from app.core.config import settings
    from app.services import oauth_service

    reset_database()
    current_register = client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Current User",
            "username": "currentuser",
            "email": "current-user@example.com",
            "password": "SecurePass123!",
            "role": "pending",
            "email_code": "",
        },
    )
    assert current_register.status_code == 200
    other_register = client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Other User",
            "username": "otheruser",
            "email": "other-user@example.com",
            "password": "SecurePass123!",
            "role": "pending",
            "email_code": "",
        },
    )
    assert other_register.status_code == 200
    login_response = client.post(
        "/api/v1/auth/login",
        json={"account": "currentuser", "password": "SecurePass123!"},
    )
    access_token = login_response.json()["data"]["access_token"]

    db = get_database()
    other_user = db.find_one(User, {"username": "otheruser"})
    assert other_user is not None
    db.add(
        OAuthIdentity(
            user_id=other_user.id,
            provider="github",
            provider_user_id="github-user-conflict",
            provider_username="other-gh",
            provider_email="other-user@example.com",
            email_verified_by_provider=True,
        )
    )
    db.commit()

    monkeypatch.setattr(settings, "github_client_id", "cli_test")
    monkeypatch.setattr(settings, "github_client_secret", "secret_test")
    monkeypatch.setattr(settings, "github_redirect_uri", "http://localhost:8000/api/v1/auth/oauth/github/callback")
    monkeypatch.setattr(settings, "frontend_oauth_callback_url", "http://localhost:5173/oauth/callback")

    async def fake_fetch_github_profile(code: str, code_verifier: str | None):
        return oauth_service.OAuthProfile(
            provider_user_id="github-user-conflict",
            username="github_conflict",
            email="other-user@example.com",
            email_verified=True,
            avatar="https://example.com/avatar-conflict.png",
        )

    monkeypatch.setattr(oauth_service, "fetch_github_profile", fake_fetch_github_profile)

    start = client.get("/api/v1/auth/oauth/github/start?intent=bind_current_user", follow_redirects=False)
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    callback = client.get(
        f"/api/v1/auth/oauth/github/callback?code=fake-code&state={state}",
        follow_redirects=False,
    )
    ticket = parse_qs(urlparse(callback.headers["location"]).query)["ticket"][0]

    linked = client.post(
        "/api/v1/auth/oauth/link-current-user",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"ticket": ticket},
    )
    assert linked.status_code == 409
    assert linked.json()["code"] == 40901

    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert me.status_code == 200
    assert me.json()["data"]["username"] == "currentuser"


def test_register_rejects_weak_password() -> None:
    code = send_code("weak@example.com")
    response = client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Weak User",
            "username": "weak01",
            "email": "weak@example.com",
            "password": "password",
            "role": "labeler",
            "email_code": code,
        },
    )
    assert response.status_code == 400
    assert response.json()["code"] == 40001
    assert response.json()["message"] == "参数校验失败：密码必须包含字母、数字和特殊字符中的至少三类"
    assert response.json()["detail"] == [
        {"field": "body.password", "message": "密码必须包含字母、数字和特殊字符中的至少三类"}
    ]


def test_register_rejects_invalid_username() -> None:
    code = send_code("invalid-username@example.com")
    response = client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Invalid Username",
            "username": "BadAccount",
            "email": "invalid-username@example.com",
            "password": "SecurePass123!",
            "role": "pending",
            "email_code": code,
        },
    )
    assert response.status_code == 400
    assert response.json()["code"] == 40001
    assert response.json()["detail"][0]["field"] == "body.username"
    """
        {"field": "body.username", "message": "鐧诲綍璐﹀彿闇€涓?4-32 浣嶏紝瀛楁瘝寮€澶达紝浠呮敮鎸佸皬鍐欏瓧姣嶃€佹暟瀛楀拰涓嬪垝绾?}
    ]


    """


def test_register_rejects_privileged_global_roles() -> None:
    code = send_code("privileged-register@example.com")
    response = client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Privileged Register",
            "username": "privilegedregister",
            "email": "privileged-register@example.com",
            "password": "SecurePass123!",
            "role": "owner",
            "email_code": code,
        },
    )
    assert response.status_code == 400
    assert response.json()["code"] == 40001
    assert response.json()["detail"][0]["field"] == "body.role"
    assert get_database().find_one(User, {"email": "privileged-register@example.com"}) is None


def test_register_rejects_blank_display_name() -> None:
    code = send_code("blank-display@example.com")
    response = client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "   ",
            "username": "blankdisplay",
            "email": "blank-display@example.com",
            "password": "SecurePass123!",
            "role": "pending",
            "email_code": code,
        },
    )
    assert response.status_code == 400
    assert response.json()["code"] == 40001
    assert response.json()["detail"][0]["field"] == "body.display_name"
    """
    assert response.json()["detail"] == [
        {"field": "body.display_name", "message": "鏄剧ず鍚嶄笉鑳戒负绌?}
    ]
    """


def test_update_task_internal_labelers_endpoint_validates_active_team_labelers() -> None:
    db = get_database()
    team = Team(company_name="Internal Labeler Assignment Team", owner_user_id="owner-1")
    owner = User(username="internaltaskowner", email="internal-task-owner@example.com", global_role="user", email_verified=True)
    labeler = User(username="internaltasklabeler", email="internal-task-labeler@example.com", global_role="user", email_verified=True)
    labeler_two = User(username="internaltasklabeler2", email="internal-task-labeler2@example.com", global_role="user", email_verified=True)
    reviewer = User(username="internaltaskreviewer", email="internal-task-reviewer@example.com", global_role="user", email_verified=True)
    task = Task(
        team_id=team.id,
        owner_id=owner.id,
        title="Internal flow editable task",
        status="published",
        distribution="quota_grab",
        assignment={"enabled": False, "target_labeler_ids": []},
        reward_rule={"mode": "item", "points_per_item": 0},
    )
    for item in [
        team,
        owner,
        labeler,
        labeler_two,
        reviewer,
        TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"),
        TeamMember(team_id=team.id, user_id=labeler.id, team_role="labeler"),
        TeamMember(team_id=team.id, user_id=labeler_two.id, team_role="labeler"),
        TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer"),
        task,
    ]:
        db.add(item)
    db.commit()
    headers = {"Authorization": f"Bearer {create_session_bound_access_token(owner.id, role=owner.global_role)}", "X-Team-ID": team.id}

    invalid = client.put(
        f"/api/v1/tasks/{task.id}/internal-labelers",
        headers=headers,
        json={"target_labeler_ids": [reviewer.id]},
    )
    updated = client.put(
        f"/api/v1/tasks/{task.id}/internal-labelers",
        headers=headers,
        json={"target_labeler_ids": [labeler.id, labeler.id]},
    )
    invalid_allocation_total = client.put(
        f"/api/v1/tasks/{task.id}/internal-labelers",
        headers=headers,
        json={
            "target_labeler_ids": [labeler.id, labeler_two.id],
            "target_labeler_allocations": [
                {"labeler_id": labeler.id, "quota": 60},
                {"labeler_id": labeler_two.id, "quota": 30},
            ],
        },
    )
    allocated = client.put(
        f"/api/v1/tasks/{task.id}/internal-labelers",
        headers=headers,
        json={
            "target_labeler_ids": [labeler.id, labeler_two.id],
            "target_labeler_allocations": [
                {"labeler_id": labeler.id, "quota": 60},
                {"labeler_id": labeler_two.id, "quota": 40},
            ],
        },
    )

    assert invalid.status_code == 400
    assert invalid.json()["code"] == 40002
    assert invalid.json()["detail"]["target_labeler_ids"] == [reviewer.id]
    assert updated.status_code == 200
    assert updated.json()["data"]["assignment"]["target_labeler_ids"] == [labeler.id]
    assert updated.json()["data"]["assignment"]["target_labeler_allocations"] == [{"labeler_id": labeler.id, "quota": 100}]
    assert invalid_allocation_total.status_code == 400
    assert invalid_allocation_total.json()["code"] == 40002
    assert invalid_allocation_total.json()["detail"]["target_labeler_allocations_total"] == 90
    assert allocated.status_code == 200
    assert allocated.json()["data"]["assignment"]["target_labeler_allocations"] == [
        {"labeler_id": labeler.id, "quota": 60},
        {"labeler_id": labeler_two.id, "quota": 40},
    ]
    persisted_task = db.get(Task, task.id)
    assert persisted_task.assignment == {
        "enabled": False,
        "target_labeler_ids": [labeler.id, labeler_two.id],
        "target_labeler_allocations": [
            {"labeler_id": labeler.id, "quota": 60},
            {"labeler_id": labeler_two.id, "quota": 40},
        ],
    }
    audit_log = db.find_one(AuditLog, {"entity_type": "task", "entity_id": task.id, "action": "task_internal_labelers_updated"})
    assert audit_log is not None
