import csv
import io
import json
import os
import zipfile
from datetime import datetime

os.environ.setdefault("SECRET_KEY", "test-secret-key-with-strong-length")
os.environ.setdefault("MONGODB_URL", "mongomock://localhost")
os.environ.setdefault("MONGODB_DATABASE", "markup_test")

from fastapi.testclient import TestClient

from app.core.database import get_database, reset_database
from app.core.security import generate_object_id
from app.models.audit import AuditLog
from app.models.auth import RefreshSession
from app.models.production import Question, Submission, Task
from app.models.team import Team, TeamMember
from app.models.user import User
from app.main import app
from app.services import auth_service

client = TestClient(app)


def access_token(user: User) -> str:
    db = get_database()
    session = RefreshSession(
        user_id=user.id,
        jti_hash=f"export-review-records-{generate_object_id()}",
        expire_at=datetime(2026, 7, 1),
    )
    db.add(session)
    db.commit()
    return auth_service.create_access_token(user.id, {"role": user.global_role, "sid": session.id})


def setup_function() -> None:
    reset_database()


def test_export_includes_review_records_from_audit_logs() -> None:
    db = get_database()
    team = Team(company_name="Export Review Records Team", owner_user_id="export-review-owner")
    owner = User(username="exportreviewowner", email="export-review-owner@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    task = Task(team_id=team.id, owner_id=owner.id, title="Review record export", status="finished", stats={"approved": 1})
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "source"}, status="approved", assigned_to="labeler-1")
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id="labeler-1",
        answers={"label": "answer"},
        status="approved",
        submitted_at=datetime(2026, 5, 29, 9, 0, 0),
        updated_at=datetime(2026, 5, 29, 10, 0, 0),
    )
    review_log = AuditLog(
        team_id=team.id,
        entity_type="review",
        entity_id=submission.id,
        action="submission_reviewed",
        operator_id="reviewer-1",
        changes={"decision": "approved", "comment": "looks good", "round": 1, "stage": "manual_review"},
        created_at=datetime(2026, 5, 29, 10, 30, 0),
    )
    for item in [task, question, submission, review_log]:
        db.add(item)
    db.commit()

    headers = {"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id}
    created = client.post(
        "/api/v1/exports",
        headers=headers,
        json={"task_id": task.id, "format": "json", "include_review_records": True},
    )
    assert created.status_code == 200

    downloaded = client.get(f"/api/v1/exports/{created.json()['data']['export_id']}/download", headers=headers)

    assert downloaded.status_code == 200
    rows = downloaded.json()
    review_records = json.loads(rows[0]["review_records"])
    assert review_records == [
        {
            "review_id": review_log.id,
            "reviewer_id": "reviewer-1",
            "decision": "approved",
            "comment": "looks good",
            "round": 1,
            "stage": "manual_review",
            "created_at": "2026-05-29T10:30:00",
        }
    ]


def test_export_csv_escapes_formula_like_answer_values() -> None:
    db = get_database()
    team = Team(company_name="Export CSV Formula Guard Team", owner_user_id="export-csv-owner")
    owner = User(username="exportcsvowner", email="export-csv-owner@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    task = Task(team_id=team.id, owner_id=owner.id, title="CSV formula export", status="finished", stats={"approved": 1})
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "source"}, status="approved", assigned_to="labeler-1")
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id="labeler-1",
        answers={
            "label": '=HYPERLINK("https://example.invalid","open")',
            "score": "+SUM(1,1)",
            "note": "plain text",
        },
        status="approved",
    )
    for item in [task, question, submission]:
        db.add(item)
    db.commit()

    headers = {"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id}
    created = client.post(
        "/api/v1/exports",
        headers=headers,
        json={"task_id": task.id, "format": "csv", "fields_config": {"include": ["answers.*"]}},
    )
    assert created.status_code == 200

    downloaded = client.get(f"/api/v1/exports/{created.json()['data']['export_id']}/download", headers=headers)

    assert downloaded.status_code == 200
    rows = list(csv.DictReader(io.StringIO(downloaded.content.decode("utf-8-sig"))))
    assert rows[0]["answers.label"].startswith("'=")
    assert rows[0]["answers.score"].startswith("'+")
    assert rows[0]["answers.note"] == "plain text"


def test_export_excel_escapes_formula_like_answer_values() -> None:
    db = get_database()
    team = Team(company_name="Export Excel Formula Guard Team", owner_user_id="export-excel-owner")
    owner = User(username="exportexcelowner", email="export-excel-owner@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    task = Task(team_id=team.id, owner_id=owner.id, title="Excel formula export", status="finished", stats={"approved": 1})
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "source"}, status="approved", assigned_to="labeler-1")
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id="labeler-1",
        answers={"label": '=HYPERLINK("https://example.invalid","open")', "score": "+SUM(1,1)"},
        status="approved",
    )
    for item in [task, question, submission]:
        db.add(item)
    db.commit()

    headers = {"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id}
    created = client.post(
        "/api/v1/exports",
        headers=headers,
        json={"task_id": task.id, "format": "excel", "fields_config": {"include": ["answers.*"]}},
    )
    assert created.status_code == 200

    downloaded = client.get(f"/api/v1/exports/{created.json()['data']['export_id']}/download", headers=headers)

    assert downloaded.status_code == 200
    with zipfile.ZipFile(io.BytesIO(downloaded.content)) as archive:
        worksheet = archive.read("xl/worksheets/sheet1.xml").decode("utf-8")
    assert "<t>'=HYPERLINK" in worksheet
    assert "<t>'+SUM" in worksheet


def test_export_rejects_rename_collisions_in_fields_config() -> None:
    db = get_database()
    team = Team(company_name="Export Rename Collision Team", owner_user_id="export-rename-owner")
    owner = User(username="exportrenameowner", email="export-rename-owner@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    task = Task(team_id=team.id, owner_id=owner.id, title="Rename collision export", status="finished", stats={"approved": 1})
    question = Question(
        team_id=team.id,
        task_id=task.id,
        row_index=0,
        content={"title": "source title"},
        status="approved",
        assigned_to="labeler-1",
    )
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id="labeler-1",
        answers={"title": "answer title"},
        status="approved",
    )
    for item in [task, question, submission]:
        db.add(item)
    db.commit()

    response = client.post(
        "/api/v1/exports",
        headers={"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id},
        json={
            "task_id": task.id,
            "format": "json",
            "fields_config": {
                "include": ["content.title", "answers.title"],
                "rename": {"content.title": "title", "answers.title": "title"},
            },
        },
    )

    assert response.status_code == 400
    assert response.json()["code"] == 40002
    assert db.collection("export_jobs").count_documents({"team_id": team.id}) == 0


def test_export_ignores_cross_team_questions_with_same_task_id() -> None:
    db = get_database()
    team = Team(company_name="Export Question Scope Team", owner_user_id="export-scope-owner")
    owner = User(username="exportscopeowner", email="export-scope-owner@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    task = Task(team_id=team.id, owner_id=owner.id, title="Scoped export task", status="finished", stats={"approved": 1})
    cross_team_question = Question(team_id="other-team", task_id=task.id, row_index=0, content={"text": "leaked"}, status="approved", assigned_to="other-labeler")
    cross_team_submission = Submission(
        team_id="other-team",
        task_id=task.id,
        question_id=cross_team_question.id,
        labeler_id="other-labeler",
        answers={"label": "secret"},
        status="approved",
    )
    own_question = Question(team_id=team.id, task_id=task.id, row_index=1, content={"text": "own"}, status="approved", assigned_to="labeler-1")
    own_submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=own_question.id,
        labeler_id="labeler-1",
        answers={"label": "answer"},
        status="approved",
    )
    for item in [task, cross_team_question, cross_team_submission, own_question, own_submission]:
        db.add(item)
    db.commit()

    headers = {"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id}
    created = client.post(
        "/api/v1/exports",
        headers=headers,
        json={"task_id": task.id, "format": "json"},
    )
    assert created.status_code == 200

    downloaded = client.get(f"/api/v1/exports/{created.json()['data']['export_id']}/download", headers=headers)

    assert downloaded.status_code == 200
    rows = downloaded.json()
    assert len(rows) == 1
    assert rows[0]["question_id"] == own_question.id
    assert rows[0]["content.text"] == "own"
    assert rows[0]["answers.label"] == "answer"


def test_export_fields_config_supports_prefix_wildcards() -> None:
    db = get_database()
    team = Team(company_name="Export Field Mapping Team", owner_user_id="export-field-owner")
    owner = User(username="exportfieldowner", email="export-field-owner@example.com", global_role="user", email_verified=True)
    db.add(team)
    db.add(owner)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    task = Task(team_id=team.id, owner_id=owner.id, title="Mapped export task", status="finished", stats={"approved": 1})
    question = Question(
        team_id=team.id,
        task_id=task.id,
        row_index=0,
        content={"title": "合同标题", "body": "合同正文"},
        status="approved",
        assigned_to="labeler-1",
    )
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id="labeler-1",
        answers={"category": "合格", "comment": "清晰"},
        status="approved",
    )
    for item in [task, question, submission]:
        db.add(item)
    db.commit()

    headers = {"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id}
    created = client.post(
        "/api/v1/exports",
        headers=headers,
        json={
            "task_id": task.id,
            "format": "json",
            "fields_config": {
                "include": ["question_id", "content.*", "answers.*"],
                "rename": {"question_id": "题目ID"},
            },
        },
    )
    assert created.status_code == 200

    downloaded = client.get(f"/api/v1/exports/{created.json()['data']['export_id']}/download", headers=headers)

    assert downloaded.status_code == 200
    rows = downloaded.json()
    assert rows == [
        {
            "题目ID": question.id,
            "content.title": "合同标题",
            "content.body": "合同正文",
            "answers.category": "合格",
            "answers.comment": "清晰",
        }
    ]
