import os
from datetime import datetime, timedelta

os.environ.setdefault("SECRET_KEY", "test-secret-key-with-strong-length")
os.environ.setdefault("MONGODB_URL", "mongomock://localhost")
os.environ.setdefault("MONGODB_DATABASE", "markup_test")

from fastapi.testclient import TestClient

from app.core.database import get_database, reset_database
from app.core.security import generate_object_id, now_utc
from app.models.ai_review import AiReviewJob
from app.models.auth import RefreshSession
from app.models.production import Question, Submission, Task, TemplateVersion
from app.models.resource import AiProviderConfig, TeamPointsBudget
from app.models.team import Team, TeamMember
from app.models.user import User
from app.main import app
from app.services import auth_service
from app.services.labels_service import submit_question_answers

client = TestClient(app)


def access_token(user: User) -> str:
    db = get_database()
    session = RefreshSession(
        user_id=user.id,
        jti_hash=f"labeling-review-round-{generate_object_id()}",
        expire_at=now_utc().replace(tzinfo=None) + timedelta(days=30),
    )
    db.add(session)
    db.commit()
    return auth_service.create_access_token(user.id, {"role": user.global_role, "sid": session.id})


def setup_function() -> None:
    reset_database()


def answer_schema() -> dict:
    return {
        "schema_version": "1.0",
        "tabs": [
            {
                "id": "tab-1",
                "title": "默认",
                "components": [
                    {
                        "id": "decision",
                        "field": "decision",
                        "type": "SingleSelect",
                        "label": "判断",
                        "required": True,
                        "options": [{"label": "是", "value": "yes"}, {"label": "否", "value": "no"}],
                    }
                ],
            }
        ],
        "components": [],
    }


def test_claim_refreshes_task_pending_and_claimed_stats() -> None:
    db = get_database()
    labeler = User(username="claimstatslabeler", email="claim-stats-labeler@example.com", global_role="labeler", email_verified=True)
    task = Task(
        team_id="claim-stats-team",
        owner_id="owner-1",
        title="Claim stats task",
        status="published",
        reward_rule={"mode": "item", "points_per_item": 1, "bundle_options": [1]},
        stats={"total": 2, "pending": 2, "claimed": 0, "submitted": 0, "approved": 0, "rejected": 0},
    )
    questions = [
        Question(team_id=task.team_id, task_id=task.id, row_index=0, content={"text": "A"}),
        Question(team_id=task.team_id, task_id=task.id, row_index=1, content={"text": "B"}),
    ]
    db.add(labeler)
    db.add(task)
    for question in questions:
        db.add(question)
    db.commit()

    response = client.post(
        f"/api/v1/labels/tasks/{task.id}/claim",
        headers={"Authorization": f"Bearer {access_token(labeler)}"},
        json={"bundle_size": 1},
    )

    assert response.status_code == 200
    stats = db.get(Task, task.id).stats
    assert stats["claimed"] == 1
    assert stats["pending"] == 1


def test_revision_submit_creates_ai_review_job_for_current_round() -> None:
    db = get_database()
    labeler = User(username="airoundlabeler", email="ai-round-labeler@example.com", global_role="labeler", email_verified=True)
    provider = AiProviderConfig(team_id="ai-round-team", route_name="round-ai", provider_kind="openai", provider="openai", status="enabled")
    task = Task(
        team_id="ai-round-team",
        owner_id="owner-1",
        title="AI round task",
        status="published",
        template_id="template-ai-round",
        template_version_id="template-ai-round:v1",
        ai_config={
            "enabled": True,
            "provider_id": provider.id,
            "model": "gpt-4.1-mini",
            "input_prompt": "check",
            "review_matrix": [{"dimension": "quality", "max_score": 5}],
            "matrix_confirmed": True,
        },
        reward_rule={"mode": "item", "points_per_item": 0},
        stats={"total": 1, "claimed": 1, "submitted": 0, "approved": 0, "rejected": 1},
    )
    question = Question(team_id=task.team_id, task_id=task.id, row_index=0, content={"text": "retry"}, status="rejected", assigned_to=labeler.id)
    submission = Submission(
        team_id=task.team_id,
        task_id=task.id,
        question_id=question.id,
        labeler_id=labeler.id,
        template_id=task.template_id,
        template_version_id=task.template_version_id,
        answers={"decision": "no"},
        draft={"decision": "no"},
        status="rejected",
        current_round=2,
        submitted_at=datetime(2026, 5, 31, 10, 0, 0),
    )
    old_job = AiReviewJob(
        team_id=task.team_id,
        task_id=task.id,
        question_id=question.id,
        submission_id=submission.id,
        labeler_id=labeler.id,
        status="completed",
        idempotency_key=f"submission:{submission.id}:ai-review",
        result={"decision": "reject", "reason": "old answer"},
    )
    for item in [
        labeler,
        provider,
        task,
        question,
        submission,
        old_job,
        TemplateVersion(template_id=task.template_id, team_id=task.team_id, version=1, schema=answer_schema(), is_published=True),
    ]:
        db.add(item)
    db.commit()

    payload = submit_question_answers(db, question_id=question.id, user_id=labeler.id, answers={"decision": "yes"}, request=None)

    jobs = db.find(AiReviewJob, {"submission_id": submission.id})
    assert len(jobs) == 2
    assert payload["ai_review_job"]["job_id"] != old_job.id
    assert payload["ai_review_job"]["idempotency_key"] == f"submission:{submission.id}:round:2:ai-review"


def test_submit_rejects_stale_ai_review_config_before_mutating_submission() -> None:
    db = get_database()
    team = Team(company_name="AI stale submit team", owner_user_id="owner-1")
    labeler = User(username="aistalesubmitlabeler", email="ai-stale-submit@example.com", global_role="labeler", email_verified=True)
    provider = AiProviderConfig(team_id=team.id, route_name="stale-ai", provider_kind="openai", provider="openai", status="disabled")
    task = Task(
        team_id=team.id,
        owner_id="owner-1",
        title="AI stale submit task",
        status="published",
        template_id="template-ai-stale",
        template_version_id="template-ai-stale:v1",
        ai_config={
            "enabled": True,
            "provider_id": provider.id,
            "model": "gpt-4.1-mini",
            "input_prompt": "Review answer quality",
            "review_matrix": [{"dimension": "quality", "max_score": 5}],
            "matrix_confirmed": True,
        },
        reward_rule={"mode": "item", "points_per_item": 0},
        stats={"total": 1, "claimed": 1, "submitted": 0, "approved": 0, "rejected": 0},
    )
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="claimed", assigned_to=labeler.id)
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id=labeler.id,
        template_id=task.template_id,
        template_version_id=task.template_version_id,
        answers={"decision": "no"},
        draft={"decision": "no"},
        status="draft",
    )
    for item in [
        team,
        labeler,
        provider,
        task,
        question,
        submission,
        TemplateVersion(template_id=task.template_id, team_id=team.id, version=1, schema=answer_schema(), is_published=True),
    ]:
        db.add(item)
    db.commit()

    response = client.post(
        f"/api/v1/labels/questions/{question.id}/submit",
        headers={"Authorization": f"Bearer {access_token(labeler)}"},
        json={"answers": {"decision": "yes"}},
    )

    assert response.status_code == 422
    assert response.json()["code"] == 42201
    assert db.get(Submission, submission.id).status == "draft"
    assert db.get(Submission, submission.id).answers == {"decision": "no"}
    assert db.get(Question, question.id).status == "claimed"
    assert db.find(AiReviewJob, {"submission_id": submission.id}) == []


def test_review_revise_rejects_answers_that_break_template_schema() -> None:
    db = get_database()
    team = Team(company_name="Review revise schema team", owner_user_id="owner-1")
    reviewer = User(username="reviseschemareviewer", email="revise-schema-reviewer@example.com", global_role="reviewer", email_verified=True)
    task = Task(
        team_id=team.id,
        owner_id="owner-1",
        title="Revise schema task",
        status="published",
        reviewer_ids=[reviewer.id],
        template_id="template-revise-schema",
        template_version_id="template-revise-schema:v1",
        reward_rule={"mode": "item", "points_per_item": 0},
        stats={"total": 1, "claimed": 1, "submitted": 1, "approved": 0, "rejected": 0},
    )
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="submitted", assigned_to="labeler-1")
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id="labeler-1",
        template_id=task.template_id,
        template_version_id=task.template_version_id,
        answers={"decision": "yes"},
        draft={"decision": "yes"},
        status="submitted",
        submitted_at=datetime(2026, 5, 31, 10, 0, 0),
        task_submitted_at=datetime(2026, 5, 31, 10, 5, 0),
    )
    for item in [
        team,
        reviewer,
        TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer", assigned_review_tasks=[task.id]),
        TeamPointsBudget(team_id=team.id, total_points=10, current_balance=10),
        task,
        question,
        submission,
        TemplateVersion(template_id=task.template_id, team_id=team.id, version=1, schema=answer_schema(), is_published=True),
    ]:
        db.add(item)
    db.commit()

    response = client.post(
        f"/api/v1/reviews/submissions/{submission.id}",
        headers={"Authorization": f"Bearer {access_token(reviewer)}", "X-Team-ID": team.id},
        json={"decision": "revise", "comment": "修正为空值", "revised_answers": {"decision": "maybe"}},
    )

    assert response.status_code == 422
    persisted_submission = db.get(Submission, submission.id)
    assert persisted_submission.status == "submitted"
    assert persisted_submission.answers == {"decision": "yes"}


def test_batch_review_revise_applies_revised_answers() -> None:
    db = get_database()
    team = Team(company_name="Batch revise team", owner_user_id="owner-1")
    reviewer = User(username="batchrevisereviewer", email="batch-revise-reviewer@example.com", global_role="reviewer", email_verified=True)
    task = Task(
        team_id=team.id,
        owner_id="owner-1",
        title="Batch revise task",
        status="published",
        reviewer_ids=[reviewer.id],
        template_id="template-batch-revise",
        template_version_id="template-batch-revise:v1",
        reward_rule={"mode": "item", "points_per_item": 0},
        stats={"total": 1, "claimed": 1, "submitted": 1, "approved": 0, "rejected": 0},
    )
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="submitted", assigned_to="labeler-1")
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id="labeler-1",
        template_id=task.template_id,
        template_version_id=task.template_version_id,
        answers={"decision": "no"},
        draft={"decision": "no"},
        status="submitted",
        submitted_at=datetime(2026, 5, 31, 10, 0, 0),
        task_submitted_at=datetime(2026, 5, 31, 10, 5, 0),
    )
    for item in [
        team,
        reviewer,
        TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer", assigned_review_tasks=[task.id]),
        TeamPointsBudget(team_id=team.id, total_points=10, current_balance=10),
        task,
        question,
        submission,
        TemplateVersion(template_id=task.template_id, team_id=team.id, version=1, schema=answer_schema(), is_published=True),
    ]:
        db.add(item)
    db.commit()

    response = client.post(
        "/api/v1/reviews/submissions/batch",
        headers={"Authorization": f"Bearer {access_token(reviewer)}", "X-Team-ID": team.id},
        json={"submission_ids": [submission.id], "decision": "revise", "comment": "统一修订", "revised_answers": {"decision": "yes"}},
    )

    assert response.status_code == 200
    assert response.json()["data"]["success_count"] == 1
    persisted_submission = db.get(Submission, submission.id)
    assert persisted_submission.status == "approved"
    assert persisted_submission.answers == {"decision": "yes"}
    assert db.get(Question, question.id).status == "approved"
