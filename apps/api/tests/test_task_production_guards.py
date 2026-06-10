import csv
import io
import json
import os
import zipfile
from datetime import timedelta

import pytest

os.environ.setdefault("SECRET_KEY", "test-secret-key-with-strong-length")
os.environ.setdefault("MONGODB_URL", "mongomock://localhost")
os.environ.setdefault("MONGODB_DATABASE", "markup_test")

from fastapi.testclient import TestClient

from app.core.database import get_database, reset_database
from app.core.security import generate_object_id, now_utc
from app.models.auth import RefreshSession
from app.models.ai_review import AiReviewJob
from app.models.export import ExportJob
from app.models.notification import Notification
from app.models.platform import PlatformFinanceLedger
from app.models.platform import PlatformSetting
from app.models.profile import PointsLedger
from app.models.production import AnnotationTemplate, Dataset, Question, Submission, Task, TemplateVersion
from app.models.resource import TeamPointsBudget, TeamPointsWalletLedger
from app.models.team import Team, TeamMember
from app.models.user import User
from app.main import app
from app.services import auth_service
from app.services.file_storage import read_storage_file, write_storage_file
from app.services.production_service import materialize_question_content, validate_task_mappings

client = TestClient(app)


def access_token(user: User) -> str:
    db = get_database()
    session = RefreshSession(
        user_id=user.id,
        jti_hash=f"task-production-guards-{generate_object_id()}",
        expire_at=now_utc().replace(tzinfo=None) + timedelta(days=30),
    )
    db.add(session)
    db.commit()
    return auth_service.create_access_token(user.id, {"role": user.global_role, "sid": session.id})


def setup_function() -> None:
    reset_database()


def owner_team(slug: str) -> tuple[Team, User, dict[str, str]]:
    db = get_database()
    team = Team(company_name=f"{slug} Team", owner_user_id=f"{slug}-owner")
    owner = User(username=f"{slug}owner", email=f"{slug}-owner@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    db.commit()
    headers = {"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id}
    return team, owner, headers


def published_template(db, team_id: str, owner_id: str, slug: str) -> AnnotationTemplate:
    schema = {
        "schema_version": "1.0",
        "tabs": [
            {
                "id": "main",
                "title": "Main",
                "components": [
                    {
                        "id": "show_text",
                        "type": "ShowItem",
                        "field": "show_text",
                        "label": "Text",
                        "required": False,
                        "config": {},
                        "options": [],
                    },
                    {
                        "id": "answer",
                        "type": "TextInput",
                        "field": "answer",
                        "label": "Answer",
                        "required": True,
                        "config": {},
                        "options": [],
                    },
                ],
            }
        ],
        "components": [],
        "validation_rules": {},
        "linkage_rules": [],
        "llm_config": {},
    }
    template = AnnotationTemplate(team_id=team_id, owner_id=owner_id, name=f"{slug} Template", schema=schema, status="published")
    db.add(template)
    db.add(TemplateVersion(template_id=template.id, team_id=team_id, version=1, schema=schema, is_published=True))
    return template


def test_pause_allows_claimed_or_rejected_questions() -> None:
    db = get_database()
    team = Team(company_name="Pause Guard Team", owner_user_id="owner-1")
    owner = User(username="pauseguardowner", email="pause-guard@example.com", global_role="user", email_verified=True)
    task = Task(team_id=team.id, owner_id=owner.id, title="Pause guard task", status="published")
    claimed = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "claimed"}, status="claimed", assigned_to="labeler-1")
    pending = Question(team_id=team.id, task_id=task.id, row_index=1, content={"text": "pending"}, status="pending")
    for item in [team, owner, TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"), task, claimed, pending]:
        db.add(item)
    db.commit()

    response = client.post(
        f"/api/v1/tasks/{task.id}/status",
        headers={"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id},
        json={"action": "pause"},
    )

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "paused"
    assert db.get(Task, task.id).status == "paused"


def test_finish_blocks_unfinished_review_or_rework_questions() -> None:
    db = get_database()
    team = Team(company_name="Finish Guard Team", owner_user_id="owner-1")
    owner = User(username="finishguardowner", email="finish-guard@example.com", global_role="user", email_verified=True)
    task = Task(team_id=team.id, owner_id=owner.id, title="Finish guard task", status="published")
    submitted = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "submitted"}, status="submitted", assigned_to="labeler-1")
    approved = Question(team_id=team.id, task_id=task.id, row_index=1, content={"text": "approved"}, status="approved", assigned_to="labeler-2")
    for item in [team, owner, TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"), task, submitted, approved]:
        db.add(item)
    db.commit()

    response = client.post(
        f"/api/v1/tasks/{task.id}/status",
        headers={"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id},
        json={"action": "finish"},
    )

    assert response.status_code == 409
    assert response.json()["detail"]["blocking"] == 1
    assert db.get(Task, task.id).status == "published"


def test_task_list_includes_delete_eligibility_before_delete_click() -> None:
    db = get_database()
    team, owner, headers = owner_team("deleteeligibility")
    draft = Task(team_id=team.id, owner_id=owner.id, title="Draft deletable", status="draft")
    finished = Task(team_id=team.id, owner_id=owner.id, title="Finished deletable", status="finished")
    blocked = Task(team_id=team.id, owner_id=owner.id, title="Finished blocked", status="finished")
    blocked_submission = Submission(team_id=team.id, task_id=blocked.id, question_id="blocked-question", labeler_id="labeler-1", status="submitted")
    for item in [draft, finished, blocked, blocked_submission]:
        db.add(item)
    db.commit()

    response = client.get("/api/v1/tasks", headers=headers)

    assert response.status_code == 200
    items = {item["task_id"]: item for item in response.json()["data"]["items"]}
    assert items[draft.id]["delete_eligibility"]["deletable"] is True
    assert items[draft.id]["delete_eligibility"]["mode"] == "draft"
    assert items[finished.id]["delete_eligibility"]["deletable"] is True
    assert items[finished.id]["delete_eligibility"]["mode"] == "finished_cascade"
    assert items[blocked.id]["delete_eligibility"]["deletable"] is False
    assert items[blocked.id]["delete_eligibility"]["blockers"]["submitted_submissions"] == 1


def test_delete_finished_task_cascades_review_ai_export_and_notifications_but_keeps_ledgers() -> None:
    db = get_database()
    team, owner, headers = owner_team("deletecascade")
    task = Task(team_id=team.id, owner_id=owner.id, title="Finished cascade task", status="finished", reward_rule={"mode": "item", "points_per_item": 5})
    approved_question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "approved"}, status="approved", assigned_to="labeler-1", claim_bundle_id="bundle-1")
    abandoned_question = Question(team_id=team.id, task_id=task.id, row_index=1, content={"text": "abandoned"}, status="closed", claim_bundle_id="bundle-1")
    pending_question = Question(team_id=team.id, task_id=task.id, row_index=2, content={"text": "never issued"}, status="pending")
    approved_submission = Submission(team_id=team.id, task_id=task.id, question_id=approved_question.id, labeler_id="labeler-1", status="approved", claim_bundle_id="bundle-1")
    abandoned_submission = Submission(team_id=team.id, task_id=task.id, question_id=abandoned_question.id, labeler_id="labeler-1", status="abandoned", claim_bundle_id="bundle-1")
    ai_job = AiReviewJob(team_id=team.id, task_id=task.id, question_id=approved_question.id, submission_id=approved_submission.id, labeler_id="labeler-1", status="completed")
    export_path = write_storage_file(f"exports/{team.id}/delete-cascade.json", b"[]")
    export_job = ExportJob(team_id=team.id, task_id=task.id, created_by=owner.id, status="completed", filename="delete-cascade.json", path=export_path, storage="filesystem")
    task_notification = Notification(team_id=team.id, title="Task notice", content="task", notification_type="task", related_entity_type="task", related_entity_id=task.id)
    export_notification = Notification(team_id=team.id, title="Export notice", content="export", notification_type="export", related_entity_type="export", related_entity_id=export_job.id, metadata={"task_id": task.id})
    points_ledger = PointsLedger(user_id="labeler-1", change=5, source_type="submission_review", source_id=approved_submission.id)
    team_ledger = TeamPointsWalletLedger(team_id=team.id, transaction_type="reward_spend", direction="out", amount=5, source_type="submission_review", source_id=approved_submission.id)
    platform_ledger = PlatformFinanceLedger(team_id=team.id, task_id=task.id, labeler_id="labeler-1", source_id=approved_submission.id, amount_points=1)
    for item in [
        task,
        approved_question,
        abandoned_question,
        pending_question,
        approved_submission,
        abandoned_submission,
        ai_job,
        export_job,
        task_notification,
        export_notification,
        points_ledger,
        team_ledger,
        platform_ledger,
    ]:
        db.add(item)
    db.commit()
    assert read_storage_file(export_path) == b"[]"

    response = client.delete(f"/api/v1/tasks/{task.id}", headers=headers)

    assert response.status_code == 200
    assert db.get(Task, task.id) is None
    assert db.find(Question, {"task_id": task.id}) == []
    assert db.find(Submission, {"task_id": task.id}) == []
    assert db.find(AiReviewJob, {"task_id": task.id}) == []
    assert db.find(ExportJob, {"task_id": task.id}) == []
    assert db.find(Notification, {"team_id": team.id}) == []
    assert db.get(PointsLedger, points_ledger.id) is not None
    assert db.get(TeamPointsWalletLedger, team_ledger.id) is not None
    assert db.get(PlatformFinanceLedger, platform_ledger.id) is not None
    assert db.collection("audit_logs").find_one({"entity_id": task.id, "action": "task_deleted"}) is not None
    try:
        read_storage_file(export_path)
    except Exception as exc:
        assert "文件不存在" in str(exc)
    else:
        raise AssertionError("export file should be deleted")


def test_delete_finished_task_rejects_unsettled_review_states() -> None:
    db = get_database()
    team, owner, headers = owner_team("deleteblocked")
    task = Task(team_id=team.id, owner_id=owner.id, title="Blocked cascade task", status="finished")
    submitted_question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "submitted"}, status="submitted", assigned_to="labeler-1")
    submitted_submission = Submission(team_id=team.id, task_id=task.id, question_id=submitted_question.id, labeler_id="labeler-1", status="submitted")
    for item in [task, submitted_question, submitted_submission]:
        db.add(item)
    db.commit()

    response = client.delete(f"/api/v1/tasks/{task.id}", headers=headers)

    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["blockers"]["submitted_questions"] == 1
    assert detail["blockers"]["submitted_submissions"] == 1
    assert db.get(Task, task.id) is not None
    assert db.get(Question, submitted_question.id) is not None
    assert db.get(Submission, submitted_submission.id) is not None


def test_task_total_points_reservation_releases_approved_share() -> None:
    db = get_database()
    team = Team(company_name="Task Total Reserve Team", owner_user_id="owner-1")
    owner = User(username="reserveowner", email="reserve-owner@example.com", global_role="user", email_verified=True)
    reviewer = User(username="reservereviewer", email="reserve-reviewer@example.com", global_role="reviewer", email_verified=True)
    task = Task(
        team_id=team.id,
        owner_id=owner.id,
        title="Task total reserve",
        status="published",
        reviewer_ids=[reviewer.id],
        reward_rule={"mode": "task", "total_points": 20},
        stats={"total": 2, "claimed": 1, "submitted": 1, "approved": 0, "rejected": 0},
    )
    submitted_question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="submitted", assigned_to="labeler-1")
    pending_question = Question(team_id=team.id, task_id=task.id, row_index=1, content={"text": "B"}, status="pending")
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=submitted_question.id,
        labeler_id="labeler-1",
        answers={"answer": "ok"},
        draft={"answer": "ok"},
        status="submitted",
    )
    db.add(team)
    db.add(owner)
    db.add(reviewer)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    db.add(TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer", assigned_review_tasks=[task.id]))
    db.add(TeamPointsBudget(team_id=team.id, total_points=100, current_balance=100, spent_points_total=0))
    for item in [task, submitted_question, pending_question, submission]:
        db.add(item)
    db.commit()

    approved = client.post(
        f"/api/v1/reviews/submissions/{submission.id}",
        headers={"Authorization": f"Bearer {access_token(reviewer)}", "X-Team-ID": team.id},
        json={"decision": "approved", "comment": "ok"},
    )
    wallet = client.get(
        f"/api/v1/teams/{team.id}/points-budget",
        headers={"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id},
    )

    assert approved.status_code == 200
    assert wallet.status_code == 200
    assert wallet.json()["data"]["reserved_points"] == 11
    assert wallet.json()["data"]["available_points"] == 78


def test_task_question_import_rejects_empty_rows() -> None:
    db = get_database()
    team, owner, headers = owner_team("emptyimport")
    task = Task(team_id=team.id, owner_id=owner.id, title="Empty import task", status="draft")
    db.add(task)
    db.commit()

    response = client.post(
        f"/api/v1/tasks/{task.id}/questions/import",
        headers=headers,
        files={"file": ("empty-row.json", b"[{}]", "application/json")},
    )

    assert response.status_code == 400
    assert response.json()["detail"]["row_errors"][0]["row"] == 1
    assert db.collection(Question.collection_name).count_documents({"task_id": task.id}) == 0


def test_dataset_csv_download_escapes_formula_like_values() -> None:
    db = get_database()
    team, owner, headers = owner_team("datasetcsvformula")
    dataset = Dataset(
        team_id=team.id,
        owner_id=owner.id,
        name="Formula Dataset",
        source_format="json",
        columns=[{"name": "row_id", "data_type": "text"}, {"name": "text", "data_type": "text"}],
        rows=[{"row_id": "1", "text": "=HYPERLINK(\"https://evil.example\",\"open\")"}],
        preview_rows=[],
        row_count=1,
        status="ready",
    )
    db.add(dataset)
    db.commit()

    response = client.get(f"/api/v1/datasets/{dataset.id}/download?format=csv", headers=headers)

    assert response.status_code == 200
    rows = list(csv.DictReader(io.StringIO(response.content.decode("utf-8-sig"))))
    assert rows[0]["text"].startswith("'=HYPERLINK")


def test_task_list_csv_export_escapes_formula_like_values() -> None:
    db = get_database()
    team, owner, headers = owner_team("taskcsvformula")
    task = Task(
        team_id=team.id,
        owner_id=owner.id,
        title="=HYPERLINK(\"https://evil.example\",\"open\")",
        description="formula title",
        status="draft",
        tags=["+SUM(1,1)"],
    )
    db.add(task)
    db.commit()

    response = client.get("/api/v1/tasks/export?format=csv", headers=headers)

    assert response.status_code == 200
    rows = list(csv.DictReader(io.StringIO(response.content.decode("utf-8-sig"))))
    assert rows[0]["title"].startswith("'=HYPERLINK")
    assert rows[0]["tags"].startswith("'+SUM")


def test_task_question_exports_escape_formula_like_values() -> None:
    db = get_database()
    team, owner, headers = owner_team("questionformula")
    task = Task(team_id=team.id, owner_id=owner.id, title="Question formula task", status="draft")
    question = Question(
        team_id=team.id,
        task_id=task.id,
        row_index=0,
        content={"text": "=HYPERLINK(\"https://evil.example\",\"open\")"},
        status="pending",
    )
    db.add(task)
    db.add(question)
    db.commit()

    csv_response = client.get(f"/api/v1/tasks/{task.id}/questions/export?format=csv", headers=headers)
    xlsx_response = client.get(f"/api/v1/tasks/{task.id}/questions/export?format=xlsx", headers=headers)

    assert csv_response.status_code == 200
    rows = list(csv.DictReader(io.StringIO(csv_response.content.decode("utf-8-sig"))))
    assert rows[0]["content.text"].startswith("'=HYPERLINK")

    assert xlsx_response.status_code == 200
    with zipfile.ZipFile(io.BytesIO(xlsx_response.content)) as archive:
        sheet = archive.read("xl/worksheets/sheet1.xml").decode("utf-8")
    assert "'=HYPERLINK" in sheet


def test_draft_question_update_rejects_runtime_status_mutation() -> None:
    db = get_database()
    team, owner, headers = owner_team("draftstatus")
    task = Task(team_id=team.id, owner_id=owner.id, title="Draft status task", status="draft")
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="pending")
    db.add(task)
    db.add(question)
    db.commit()

    response = client.put(
        f"/api/v1/tasks/{task.id}/questions/{question.id}",
        headers=headers,
        json={"status": "approved", "assigned_to": "labeler-1"},
    )

    persisted = db.get(Question, question.id)
    assert response.status_code == 409
    assert persisted.status == "pending"
    assert persisted.assigned_to is None


def test_draft_question_update_rejects_empty_content() -> None:
    db = get_database()
    team, owner, headers = owner_team("emptyquestionupdate")
    task = Task(team_id=team.id, owner_id=owner.id, title="Empty question update task", status="draft")
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "original"}, status="pending")
    db.add(task)
    db.add(question)
    db.commit()

    response = client.put(
        f"/api/v1/tasks/{task.id}/questions/{question.id}",
        headers=headers,
        json={"content": {}},
    )

    persisted = db.get(Question, question.id)
    assert response.status_code == 400
    assert persisted.content == {"text": "original"}


def test_template_publish_rejects_unsupported_schema_version() -> None:
    _team, _owner, headers = owner_team("schemaversion")
    schema = {
        "schema_version": "9.9",
        "tabs": [
            {
                "id": "main",
                "title": "Main",
                "components": [
                    {
                        "id": "answer",
                        "type": "TextInput",
                        "field": "answer",
                        "label": "Answer",
                        "required": True,
                        "config": {},
                        "options": [],
                    }
                ],
            }
        ],
        "components": [],
        "validation_rules": {},
        "linkage_rules": [],
        "llm_config": {},
    }

    created = client.post("/api/v1/templates", headers=headers, json={"name": "Unsupported schema", "schema": schema})
    assert created.status_code == 200
    template_id = created.json()["data"]["template_id"]

    readiness = client.get(f"/api/v1/templates/{template_id}/readiness", headers=headers)
    published = client.post(f"/api/v1/templates/{template_id}/publish", headers=headers)

    assert readiness.status_code == 200
    assert readiness.json()["data"]["ready"] is False
    assert any(item["key"] == "schema_version" for item in readiness.json()["data"]["blockers"])
    assert published.status_code == 422


def test_task_publish_rejects_dataset_from_another_team() -> None:
    db = get_database()
    team, owner, headers = owner_team("foreigndataset")
    other_team = Team(company_name="Foreign Dataset Team", owner_user_id="other-owner")
    db.add(other_team)
    template = published_template(db, team.id, owner.id, "Foreign dataset")
    foreign_dataset = Dataset(
        team_id=other_team.id,
        owner_id="other-owner",
        name="Foreign Dataset",
        source_format="json",
        columns=[{"name": "text", "data_type": "text"}],
        rows=[{"text": "foreign"}],
        preview_rows=[{"text": "foreign"}],
        row_count=1,
        status="ready",
    )
    db.add(foreign_dataset)
    task = Task(
        team_id=team.id,
        owner_id=owner.id,
        title="Foreign dataset task",
        description="Should not publish with a cross-team dataset.",
        status="draft",
        template_id=template.id,
        template_version_id=f"{template.id}:v1",
        dataset_id=foreign_dataset.id,
        column_mapping={"show_text": "text"},
        reward_rule={"mode": "item", "points_per_item": 1},
        stats={"total": 1, "claimed": 0, "submitted": 0, "approved": 0, "rejected": 0},
    )
    question = Question(team_id=team.id, task_id=task.id, dataset_id=foreign_dataset.id, row_index=0, content={"show_text": "foreign"})
    db.add(task)
    db.add(question)
    db.commit()

    response = client.post(f"/api/v1/tasks/{task.id}/publish", headers=headers)

    assert response.status_code == 422
    assert db.get(Task, task.id).status == "draft"


def test_task_publish_rejects_stale_column_mapping() -> None:
    db = get_database()
    team, owner, headers = owner_team("stalemapping")
    template = published_template(db, team.id, owner.id, "Stale mapping")
    dataset = Dataset(
        team_id=team.id,
        owner_id=owner.id,
        name="Changed Dataset",
        source_format="json",
        columns=[{"name": "text", "data_type": "text"}],
        rows=[{"text": "current"}],
        preview_rows=[{"text": "current"}],
        row_count=1,
        status="ready",
    )
    db.add(dataset)
    task = Task(
        team_id=team.id,
        owner_id=owner.id,
        title="Stale mapping task",
        description="Should not publish after dataset columns change.",
        status="draft",
        template_id=template.id,
        template_version_id=f"{template.id}:v1",
        dataset_id=dataset.id,
        column_mapping={"show_text": "removed_column"},
        reward_rule={"mode": "item", "points_per_item": 1},
        stats={"total": 1, "claimed": 0, "submitted": 0, "approved": 0, "rejected": 0},
    )
    question = Question(team_id=team.id, task_id=task.id, dataset_id=dataset.id, row_index=0, content={"show_text": "old"})
    db.add(task)
    db.add(question)
    db.commit()

    response = client.post(f"/api/v1/tasks/{task.id}/publish", headers=headers)

    assert response.status_code == 422
    assert db.get(Task, task.id).status == "draft"


def test_task_publish_rejects_when_available_points_cannot_cover_reserve() -> None:
    db = get_database()
    team, owner, headers = owner_team("publishreserveguard")
    member = db.find_one(TeamMember, {"team_id": team.id, "user_id": owner.id})
    member.team_role = "team_admin"
    db.save(member)
    template = published_template(db, team.id, owner.id, "Publish reserve guard")
    dataset = Dataset(
        team_id=team.id,
        owner_id=owner.id,
        name="Publish Reserve Dataset",
        source_format="json",
        columns=[{"name": "text", "data_type": "text"}],
        rows=[{"text": "current"}],
        preview_rows=[{"text": "current"}],
        row_count=1,
        status="ready",
    )
    task = Task(
        team_id=team.id,
        owner_id=owner.id,
        title="Publish reserve guard task",
        description="Should reject publish when available balance cannot cover reservation.",
        status="draft",
        template_id=template.id,
        template_version_id=f"{template.id}:v1",
        dataset_id=dataset.id,
        column_mapping={"show_text": "text"},
        reward_rule={"mode": "item", "points_per_item": 40},
        stats={"total": 1, "claimed": 0, "submitted": 0, "approved": 0, "rejected": 0},
    )
    question = Question(team_id=team.id, task_id=task.id, dataset_id=dataset.id, row_index=0, content={"show_text": "current"})
    db.add(dataset)
    db.add(task)
    db.add(question)
    db.add(TeamPointsBudget(team_id=team.id, total_points=30, current_balance=30, spent_points_total=0))
    db.commit()

    response = client.post(f"/api/v1/tasks/{task.id}/publish", headers=headers)

    assert response.status_code == 422
    assert response.json()["detail"]["available_points"] == 30
    assert response.json()["detail"]["required_reserve_points"] == 44
    assert response.json()["detail"]["additional_required_points"] == 44
    assert db.get(Task, task.id).status == "draft"


def test_task_approval_rejects_when_available_points_cannot_cover_reserve() -> None:
    db = get_database()
    team, owner, headers = owner_team("approvereserveguard")
    member = db.find_one(TeamMember, {"team_id": team.id, "user_id": owner.id})
    member.team_role = "team_admin"
    db.save(member)
    template = published_template(db, team.id, owner.id, "Approve reserve guard")
    dataset = Dataset(
        team_id=team.id,
        owner_id=owner.id,
        name="Approve Reserve Dataset",
        source_format="json",
        columns=[{"name": "text", "data_type": "text"}],
        rows=[{"text": "current"}],
        preview_rows=[{"text": "current"}],
        row_count=1,
        status="ready",
    )
    task = Task(
        team_id=team.id,
        owner_id=owner.id,
        title="Approve reserve guard task",
        description="Should reject approval when available balance cannot cover reservation.",
        status="pending_review",
        template_id=template.id,
        template_version_id=f"{template.id}:v1",
        dataset_id=dataset.id,
        column_mapping={"show_text": "text"},
        reward_rule={"mode": "item", "points_per_item": 40},
        stats={"total": 1, "claimed": 0, "submitted": 0, "approved": 0, "rejected": 0},
    )
    question = Question(team_id=team.id, task_id=task.id, dataset_id=dataset.id, row_index=0, content={"show_text": "current"})
    db.add(dataset)
    db.add(task)
    db.add(question)
    db.add(TeamPointsBudget(team_id=team.id, total_points=30, current_balance=30, spent_points_total=0))
    db.commit()

    response = client.post(f"/api/v1/tasks/{task.id}/status", headers=headers, json={"action": "approve"})

    assert response.status_code == 422
    assert response.json()["detail"]["available_points"] == 30
    assert response.json()["detail"]["required_reserve_points"] == 44
    assert response.json()["detail"]["additional_required_points"] == 44
    assert db.get(Task, task.id).status == "pending_review"


def test_show_item_multi_display_mapping_materializes_all_fields() -> None:
    db = get_database()
    team, owner, _ = owner_team("showitemmulti")
    dataset = Dataset(
        team_id=team.id,
        owner_id=owner.id,
        name="ShowItem Multi Dataset",
        source_format="json",
        columns=[
            {"name": "title", "data_type": "text"},
            {"name": "video_url", "data_type": "video"},
        ],
        rows=[],
        preview_rows=[],
        row_count=1,
        status="ready",
    )
    db.add(dataset)
    db.commit()
    mapping_config = {
        "show_bundle": {
            "source_type": "column",
            "column_name": "title",
            "field": "title",
            "display_fields": [
                {"label": "标题", "field": "title", "binding": {"source_type": "column", "column_name": "title", "field": "title"}},
                {"label": "视频", "field": "video_url", "binding": {"source_type": "media", "media_type": "video", "role": "primary", "field": "video_url"}},
            ],
        }
    }
    row = {
        "title": "合同条款",
        "video_url": "demo.mp4",
        "media": [
            {
                "type": "video",
                "role": "primary",
                "field": "video_url",
                "url": "/api/v1/uploads/video-file/download",
                "file_id": "video-file",
                "filename": "demo.mp4",
                "mime_type": "video/mp4",
            }
        ],
    }

    validate_task_mappings(dataset, {"show_bundle": "title"}, mapping_config)
    content = materialize_question_content(row, {"show_bundle": "title"}, mapping_config)

    assert content["show_bundle"][0]["value"] == "合同条款"
    assert content["show_bundle"][1]["value"]["file_id"] == "video-file"
    assert content["media"][0]["filename"] == "demo.mp4"
    assert content["_bindings"]["show_bundle"]["display_fields"][1]["binding"]["media_type"] == "video"


def test_media_schema_binding_does_not_require_system_media_column() -> None:
    db = get_database()
    team, owner, _ = owner_team("mediaschemabinding")
    dataset = Dataset(
        team_id=team.id,
        owner_id=owner.id,
        name="Media Schema Dataset",
        source_format="json",
        columns=[{"name": "title", "data_type": "text"}],
        media_schema=[{"type": "image", "role": "primary", "field": "primary_image", "source": "uploaded_file"}],
        rows=[],
        preview_rows=[],
        row_count=1,
        status="ready",
    )
    db.add(dataset)
    db.commit()
    mapping_config = {
        "show_image": {"source_type": "media", "media_type": "image", "role": "primary", "field": "primary_image"}
    }
    row = {
        "title": "图像样本",
        "media": [
            {
                "type": "image",
                "role": "primary",
                "field": "primary_image",
                "url": "/api/v1/uploads/image-file/download",
                "file_id": "image-file",
                "filename": "sample.jpg",
                "mime_type": "image/jpeg",
            }
        ],
    }

    validate_task_mappings(dataset, {}, mapping_config)
    content = materialize_question_content(row, {}, mapping_config)

    assert content["show_image"] == "/api/v1/uploads/image-file/download"
    assert content["media"][0]["field"] == "primary_image"
    assert content["_bindings"]["show_image"]["source_type"] == "media"


def test_component_bindings_materialize_media_without_content_field() -> None:
    db = get_database()
    team, owner, _ = owner_team("masksourcebinding")
    dataset = Dataset(
        team_id=team.id,
        owner_id=owner.id,
        name="Mask Source Dataset",
        source_format="json",
        columns=[{"name": "title", "data_type": "text"}],
        media_schema=[{"type": "image", "role": "primary", "field": "image_url", "source": "uploaded_file"}],
        rows=[],
        preview_rows=[],
        row_count=1,
        status="ready",
    )
    db.add(dataset)
    db.commit()
    component_bindings = {
        "damage_mask": {
            "mask_image": {"source_type": "media", "media_type": "image", "role": "primary", "field": "image_url"}
        }
    }
    row = {
        "title": "图像样本",
        "media": [
            {
                "type": "image",
                "role": "primary",
                "field": "image_url",
                "url": "/api/v1/uploads/image-file/download",
                "file_id": "image-file",
                "filename": "sample.jpg",
                "mime_type": "image/jpeg",
            }
        ],
    }

    validate_task_mappings(dataset, {}, {}, component_bindings)
    content = materialize_question_content(row, {}, {}, dataset, component_bindings)

    assert "damage_mask" not in content
    assert content["media"][0]["file_id"] == "image-file"
    assert "_bindings" not in content
    assert "image_url" not in content


def test_disabled_dataset_fields_are_removed_from_question_context() -> None:
    db = get_database()
    team, owner, _ = owner_team("disabledcontext")
    dataset = Dataset(
        team_id=team.id,
        owner_id=owner.id,
        name="Disabled Context Dataset",
        source_format="json",
        columns=[
            {"name": "title", "data_type": "text", "use_in_mapping": True},
            {"name": "internal_note", "data_type": "text", "use_in_mapping": False},
            {"name": "image_url", "data_type": "image", "use_in_mapping": False},
        ],
        media_schema=[{"type": "image", "role": "primary", "field": "image_url", "source": "external_url"}],
        rows=[],
        preview_rows=[],
        row_count=1,
        status="ready",
    )
    db.add(dataset)
    db.commit()
    row = {
        "row_id": "row-1",
        "title": "公开标题",
        "internal_note": "审核员不应看到",
        "image_url": "https://cdn.example.com/private.png",
        "media": [{"type": "image", "role": "primary", "field": "image_url", "url": "https://cdn.example.com/private.png"}],
    }

    content = materialize_question_content(row, {"show_title": "title"}, {}, dataset)

    assert content["title"] == "公开标题"
    assert content["show_title"] == "公开标题"
    assert content["row_id"] == "row-1"
    assert "internal_note" not in content
    assert "image_url" not in content
    assert "media" not in content


def test_disabled_media_schema_field_cannot_be_mapped() -> None:
    db = get_database()
    team, owner, _ = owner_team("disabledmedia")
    dataset = Dataset(
        team_id=team.id,
        owner_id=owner.id,
        name="Disabled Media Dataset",
        source_format="json",
        columns=[{"name": "image_url", "data_type": "image", "use_in_mapping": False}],
        media_schema=[{"type": "image", "role": "primary", "field": "image_url", "source": "external_url"}],
        rows=[],
        preview_rows=[],
        row_count=1,
        status="ready",
    )
    db.add(dataset)
    db.commit()

    with pytest.raises(Exception) as exc_info:
        validate_task_mappings(
            dataset,
            {},
            {"show_image": {"source_type": "media", "media_type": "image", "role": "primary", "field": "image_url"}},
        )

    assert "列映射包含数据集中不存在的字段" in str(exc_info.value)


def test_show_item_multi_display_mapping_rejects_stale_nested_column() -> None:
    db = get_database()
    team, owner, _ = owner_team("showitemstale")
    dataset = Dataset(
        team_id=team.id,
        owner_id=owner.id,
        name="ShowItem Stale Dataset",
        source_format="json",
        columns=[{"name": "title", "data_type": "text"}],
        rows=[],
        preview_rows=[],
        row_count=1,
        status="ready",
    )
    db.add(dataset)
    db.commit()

    try:
        validate_task_mappings(
            dataset,
            {"show_bundle": "title"},
            {
                "show_bundle": {
                    "source_type": "column",
                    "column_name": "title",
                    "display_fields": [
                        {"label": "缺失字段", "field": "removed_video", "binding": {"source_type": "media", "media_type": "video", "field": "removed_video"}},
                    ],
                }
            },
        )
    except Exception as exc:
        assert "列映射包含数据集中不存在的字段" in str(exc)
    else:
        raise AssertionError("stale nested ShowItem display field should be rejected")


def test_task_publish_rejects_missing_ai_provider() -> None:
    db = get_database()
    team, owner, headers = owner_team("missingaiprovider")
    template = published_template(db, team.id, owner.id, "Missing AI provider")
    dataset = Dataset(
        team_id=team.id,
        owner_id=owner.id,
        name="AI Dataset",
        source_format="json",
        columns=[{"name": "text", "data_type": "text"}],
        rows=[{"text": "current"}],
        preview_rows=[{"text": "current"}],
        row_count=1,
        status="ready",
    )
    db.add(dataset)
    task = Task(
        team_id=team.id,
        owner_id=owner.id,
        title="Missing AI provider task",
        description="Should not publish with enabled AI and a missing provider.",
        status="draft",
        template_id=template.id,
        template_version_id=f"{template.id}:v1",
        dataset_id=dataset.id,
        column_mapping={"show_text": "text"},
        ai_config={
            "enabled": True,
            "provider_id": "missing-provider",
            "model": "gpt-4.1-mini",
            "input_prompt": "Review answer quality",
            "review_matrix": [{"dimension": "quality", "max_score": 5}],
            "matrix_confirmed": True,
        },
        reward_rule={"mode": "item", "points_per_item": 1},
        stats={"total": 1, "claimed": 0, "submitted": 0, "approved": 0, "rejected": 0},
    )
    question = Question(team_id=team.id, task_id=task.id, dataset_id=dataset.id, row_index=0, content={"show_text": "current"})
    db.add(task)
    db.add(question)
    db.commit()

    response = client.post(f"/api/v1/tasks/{task.id}/publish", headers=headers)

    assert response.status_code == 422
    assert db.get(Task, task.id).status == "draft"


def test_delete_dataset_rejects_published_task_reference() -> None:
    db = get_database()
    team, owner, headers = owner_team("datasetref")
    dataset = Dataset(
        team_id=team.id,
        owner_id=owner.id,
        name="Referenced Dataset",
        source_format="json",
        columns=[{"name": "text", "data_type": "text"}],
        rows=[{"text": "stable"}],
        preview_rows=[{"text": "stable"}],
        row_count=1,
        status="ready",
    )
    task = Task(
        team_id=team.id,
        owner_id=owner.id,
        title="Published dataset reference",
        status="published",
        dataset_id=dataset.id,
    )
    db.add(dataset)
    db.add(task)
    db.commit()

    response = client.delete(f"/api/v1/datasets/{dataset.id}", headers=headers)

    assert response.status_code == 409
    assert db.get(Dataset, dataset.id) is not None


def test_table_edit_rejects_published_task_dataset_reference() -> None:
    db = get_database()
    team, owner, headers = owner_team("tablelock")
    dataset = Dataset(
        team_id=team.id,
        owner_id=owner.id,
        name="Published Table Dataset",
        source_format="json",
        columns=[{"name": "text", "data_type": "text"}],
        rows=[{"text": "stable"}],
        preview_rows=[{"text": "stable"}],
        row_count=1,
        status="ready",
    )
    task = Task(
        team_id=team.id,
        owner_id=owner.id,
        title="Published table reference",
        status="published",
        dataset_id=dataset.id,
    )
    db.add(dataset)
    db.add(task)
    db.commit()

    response = client.put(
        f"/api/v1/datasets/{dataset.id}/table",
        headers=headers,
        json={"columns": [{"name": "text", "data_type": "text"}], "rows": [{"text": "mutated"}]},
    )

    persisted = db.get(Dataset, dataset.id)
    assert response.status_code == 409
    assert persisted.rows == [{"text": "stable"}]


def test_derived_column_update_rejects_published_task_dataset_reference() -> None:
    db = get_database()
    team, owner, headers = owner_team("derivedlock")
    dataset = Dataset(
        team_id=team.id,
        owner_id=owner.id,
        name="Published Derived Dataset",
        source_format="json",
        columns=[{"name": "text", "data_type": "text"}],
        rows=[{"text": "stable"}],
        preview_rows=[{"text": "stable"}],
        row_count=1,
        status="ready",
    )
    task = Task(
        team_id=team.id,
        owner_id=owner.id,
        title="Published derived reference",
        status="published",
        dataset_id=dataset.id,
    )
    db.add(dataset)
    db.add(task)
    db.commit()

    response = client.put(
        f"/api/v1/datasets/{dataset.id}",
        headers=headers,
        json={
            "derived_columns": [
                {
                    "name": "derived_text",
                    "data_type": "text",
                    "source_column": "text",
                    "expression": "{value}-mutated",
                }
            ]
        },
    )

    persisted = db.get(Dataset, dataset.id)
    assert response.status_code == 409
    assert persisted.rows == [{"text": "stable"}]
    assert persisted.preview_rows == [{"text": "stable"}]
    assert [column["name"] for column in persisted.columns] == ["text"]


def test_patch_upload_recalculates_dataset_storage_snapshot() -> None:
    db = get_database()
    team, owner, headers = owner_team("patchstorage")
    initial_rows = [{"row_id": "1", "text": "old"}]
    dataset = Dataset(
        team_id=team.id,
        owner_id=owner.id,
        name="Patch Storage Dataset",
        source_format="json",
        columns=[{"name": "row_id", "data_type": "text"}, {"name": "text", "data_type": "text"}],
        rows=initial_rows,
        preview_rows=initial_rows,
        row_count=1,
        storage_bytes=len(json.dumps(initial_rows, ensure_ascii=False).encode("utf-8")),
        status="ready",
    )
    db.add(dataset)
    db.commit()

    response = client.post(
        f"/api/v1/datasets/{dataset.id}/patch-upload",
        headers=headers,
        data={"primary_key": "row_id"},
        files={"file": ("patch.json", b'[{"row_id":"1","text":"updated"}]', "application/json")},
    )

    persisted = db.get(Dataset, dataset.id)
    expected_storage = len(json.dumps(persisted.rows, ensure_ascii=False).encode("utf-8"))
    assert response.status_code == 200
    assert persisted.rows == [{"row_id": "1", "text": "updated"}]
    assert persisted.storage_bytes == expected_storage


def test_derived_column_update_recalculates_dataset_storage_snapshot() -> None:
    db = get_database()
    team, owner, headers = owner_team("derivedstorage")
    initial_rows = [{"row_id": "1", "text": "old"}]
    dataset = Dataset(
        team_id=team.id,
        owner_id=owner.id,
        name="Derived Storage Dataset",
        source_format="json",
        columns=[{"name": "row_id", "data_type": "text"}, {"name": "text", "data_type": "text"}],
        rows=initial_rows,
        preview_rows=initial_rows,
        row_count=1,
        storage_bytes=len(json.dumps(initial_rows, ensure_ascii=False).encode("utf-8")),
        status="ready",
    )
    db.add(dataset)
    db.commit()

    response = client.put(
        f"/api/v1/datasets/{dataset.id}",
        headers=headers,
        json={
            "derived_columns": [
                {
                    "name": "derived_text",
                    "data_type": "text",
                    "source_column": "text",
                    "expression": "{value}-derived",
                }
            ]
        },
    )

    persisted = db.get(Dataset, dataset.id)
    expected_storage = len(json.dumps(persisted.rows, ensure_ascii=False).encode("utf-8"))
    assert response.status_code == 200
    assert persisted.rows == [{"row_id": "1", "text": "old", "derived_text": "old-derived"}]
    assert persisted.storage_bytes == expected_storage


def test_table_edit_rejects_membership_storage_growth_over_limit() -> None:
    db = get_database()
    team, owner, headers = owner_team("tablestoragequota")
    initial_rows = [{"text": "a"}]
    initial_storage = len(json.dumps(initial_rows, ensure_ascii=False).encode("utf-8"))
    limit = 3 * 1024**3
    other_dataset = Dataset(
        team_id=team.id,
        owner_id=owner.id,
        name="Existing Storage",
        source_format="json",
        columns=[{"name": "text", "data_type": "text"}],
        rows=[{"text": "existing"}],
        preview_rows=[{"text": "existing"}],
        row_count=1,
        storage_bytes=limit - initial_storage - 5,
        status="ready",
    )
    dataset = Dataset(
        team_id=team.id,
        owner_id=owner.id,
        name="Editable Storage",
        source_format="json",
        columns=[{"name": "text", "data_type": "text"}],
        rows=initial_rows,
        preview_rows=initial_rows,
        row_count=1,
        storage_bytes=initial_storage,
        status="ready",
    )
    db.add(other_dataset)
    db.add(dataset)
    db.commit()

    response = client.put(
        f"/api/v1/datasets/{dataset.id}/table",
        headers=headers,
        json={"columns": [{"name": "text", "data_type": "text"}], "rows": [{"text": "this edit grows beyond the free storage quota"}]},
    )

    persisted = db.get(Dataset, dataset.id)
    assert response.status_code == 422
    assert response.json()["detail"]["key"] == "storage_bytes"
    assert persisted.rows == initial_rows
    assert persisted.storage_bytes == initial_storage


def test_patch_upload_rejects_published_task_dataset_reference() -> None:
    db = get_database()
    team, owner, headers = owner_team("patchlock")
    dataset = Dataset(
        team_id=team.id,
        owner_id=owner.id,
        name="Published Patch Dataset",
        source_format="json",
        columns=[{"name": "row_id", "data_type": "text"}, {"name": "text", "data_type": "text"}],
        rows=[{"row_id": "1", "text": "stable"}],
        preview_rows=[{"row_id": "1", "text": "stable"}],
        row_count=1,
        status="ready",
    )
    task = Task(
        team_id=team.id,
        owner_id=owner.id,
        title="Published patch reference",
        status="published",
        dataset_id=dataset.id,
    )
    db.add(dataset)
    db.add(task)
    db.commit()

    response = client.post(
        f"/api/v1/datasets/{dataset.id}/patch-upload",
        headers=headers,
        data={"primary_key": "row_id"},
        files={"file": ("patch.json", b'[{"row_id":"1","text":"mutated"}]', "application/json")},
    )

    persisted = db.get(Dataset, dataset.id)
    assert response.status_code == 409
    assert persisted.rows == [{"row_id": "1", "text": "stable"}]


def test_media_asset_bind_rejects_published_task_dataset_reference() -> None:
    db = get_database()
    team, owner, headers = owner_team("mediabindlock")
    dataset = Dataset(
        team_id=team.id,
        owner_id=owner.id,
        name="Published Media Bind Dataset",
        source_format="json",
        columns=[{"name": "text", "data_type": "text"}],
        rows=[{"text": "stable"}],
        preview_rows=[{"text": "stable"}],
        media_assets=[
            {
                "filename": "sample.png",
                "name": "sample.png",
                "url": "https://cdn.example.com/sample.png",
                "type": "image",
                "size": 4,
            }
        ],
        row_count=1,
        status="ready",
    )
    task = Task(
        team_id=team.id,
        owner_id=owner.id,
        title="Published media bind reference",
        status="published",
        dataset_id=dataset.id,
    )
    db.add(dataset)
    db.add(task)
    db.commit()

    response = client.post(
        f"/api/v1/datasets/{dataset.id}/media-assets/bind",
        headers=headers,
        json={"asset_index": 0, "row_index": 0, "role": "context", "media_type": "image"},
    )

    persisted = db.get(Dataset, dataset.id)
    assert response.status_code == 409
    assert persisted.rows == [{"text": "stable"}]
    assert len(persisted.media_assets) == 1


def test_assigned_link_hides_unpublished_tasks() -> None:
    db = get_database()
    team, owner, _headers = owner_team("draftlink")
    task = Task(
        team_id=team.id,
        owner_id=owner.id,
        title="Draft assigned link task",
        status="pending_review",
        distribution="assigned_link",
        assignment={
            "enabled": True,
            "code": "pending-link-code",
            "expire_at": (now_utc() + timedelta(days=1)).isoformat(),
        },
    )
    db.add(task)
    db.commit()

    response = client.get(
        "/api/v1/tasks/assigned/pending-link-code",
        headers={"Authorization": f"Bearer {access_token(owner)}"},
    )

    assert response.status_code == 404


def test_task_publish_switch_blocks_pending_review_approval() -> None:
    db = get_database()
    team, owner, headers = owner_team("publishswitchapprove")
    member = db.find_one(TeamMember, {"team_id": team.id, "user_id": owner.id})
    member.team_role = "team_admin"
    db.save(member)
    template = published_template(db, team.id, owner.id, "Publish switch approve")
    dataset = Dataset(
        team_id=team.id,
        owner_id=owner.id,
        name="Publish Switch Dataset",
        source_format="json",
        columns=[{"name": "text", "data_type": "text"}],
        rows=[{"text": "current"}],
        preview_rows=[{"text": "current"}],
        row_count=1,
        status="ready",
    )
    task = Task(
        team_id=team.id,
        owner_id=owner.id,
        title="Publish switch approval task",
        description="Should not approve when the production switch is disabled.",
        status="pending_review",
        distribution="first_come_all",
        template_id=template.id,
        template_version_id=f"{template.id}:v1",
        dataset_id=dataset.id,
        column_mapping={"show_text": "text"},
        reward_rule={"mode": "item", "points_per_item": 1},
        stats={"total": 1, "claimed": 0, "submitted": 0, "approved": 0, "rejected": 0},
    )
    question = Question(team_id=team.id, task_id=task.id, dataset_id=dataset.id, row_index=0, content={"show_text": "current"})
    db.add(dataset)
    db.add(task)
    db.add(question)
    db.add(PlatformSetting(key="task_publish", value={"enabled": False}))
    db.commit()

    response = client.post(f"/api/v1/tasks/{task.id}/status", headers=headers, json={"action": "approve"})

    assert response.status_code == 422
    assert response.json()["detail"]["switch_key"] == "task_publish"
    assert db.get(Task, task.id).status == "pending_review"
