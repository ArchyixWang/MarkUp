import os
from datetime import datetime, timedelta

os.environ.setdefault("SECRET_KEY", "test-secret-key-with-strong-length")
os.environ.setdefault("MONGODB_URL", "mongomock://localhost")
os.environ.setdefault("MONGODB_DATABASE", "markup_test")

from fastapi.testclient import TestClient

from app.core.database import get_database, reset_database
from app.core.security import generate_object_id, now_utc
from app.main import app
from app.models.ai_review import AiReviewJob
from app.models.auth import RefreshSession
from app.models.production import Question, Submission, Task
from app.models.team import Team, TeamMember
from app.models.user import User
from app.services import auth_service

client = TestClient(app)


def access_token(user: User) -> str:
    db = get_database()
    session = RefreshSession(
        user_id=user.id,
        jti_hash=f"labeling-review-guards-{generate_object_id()}",
        expire_at=now_utc().replace(tzinfo=None) + timedelta(days=30),
    )
    db.add(session)
    db.commit()
    return auth_service.create_access_token(user.id, {"role": user.global_role, "sid": session.id})


def setup_function() -> None:
    reset_database()


def test_labeler_can_save_draft_without_ai_review_job_name_error() -> None:
    db = get_database()
    team = Team(company_name="Draft Guard Team", owner_user_id="owner-1")
    labeler = User(username="draftguardlabeler", email="draft-guard@example.com", global_role="labeler", email_verified=True)
    task = Task(team_id=team.id, owner_id="owner-1", title="Draft guard task", status="published")
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="claimed", assigned_to=labeler.id)
    submission = Submission(team_id=team.id, task_id=task.id, question_id=question.id, labeler_id=labeler.id, status="draft")
    for item in [team, labeler, task, question, submission]:
        db.add(item)
    db.commit()

    response = client.put(
        f"/api/v1/labels/questions/{question.id}/draft",
        headers={"Authorization": f"Bearer {access_token(labeler)}"},
        json={"answers": {"intent": "safe"}},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["draft"] == {"intent": "safe"}
    assert data.get("ai_review_job") is None


def test_review_detail_rejects_submission_with_cross_team_question_reference() -> None:
    db = get_database()
    team = Team(company_name="Review Scoped Team", owner_user_id="owner-1")
    other_team = Team(company_name="Review Hidden Team", owner_user_id="owner-2")
    reviewer = User(username="reviewguardreviewer", email="review-guard@example.com", global_role="reviewer", email_verified=True)
    task = Task(team_id=team.id, owner_id="owner-1", title="Scoped review task", status="published", reviewer_ids=[reviewer.id])
    hidden_question = Question(team_id=other_team.id, task_id="other-task", row_index=0, content={"text": "hidden"}, status="submitted")
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=hidden_question.id,
        labeler_id="labeler-1",
        answers={"answer": "ok"},
        draft={"answer": "ok"},
        status="submitted",
        submitted_at=datetime(2026, 5, 31, 12, 0, 0),
    )
    for item in [team, other_team, reviewer, TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer", assigned_review_tasks=[task.id]), task, hidden_question, submission]:
        db.add(item)
    db.commit()

    response = client.get(
        f"/api/v1/reviews/submissions/{submission.id}",
        headers={"Authorization": f"Bearer {access_token(reviewer)}", "X-Team-ID": team.id},
    )

    assert response.status_code == 404


def test_ai_review_trigger_rejects_disabled_task_without_creating_job() -> None:
    db = get_database()
    team = Team(company_name="AI Disabled Guard Team", owner_user_id="owner-1")
    reviewer = User(username="aiguardreviewer", email="ai-guard@example.com", global_role="reviewer", email_verified=True)
    task = Task(team_id=team.id, owner_id="owner-1", title="AI disabled task", status="published", reviewer_ids=[reviewer.id], ai_config={"enabled": False})
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="submitted")
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id="labeler-1",
        answers={"answer": "ok"},
        draft={"answer": "ok"},
        status="submitted",
        submitted_at=datetime(2026, 5, 31, 12, 0, 0),
    )
    for item in [team, reviewer, TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer", assigned_review_tasks=[task.id]), task, question, submission]:
        db.add(item)
    db.commit()

    response = client.post(
        f"/api/v1/ai-reviews/submissions/{submission.id}/trigger",
        headers={"Authorization": f"Bearer {access_token(reviewer)}", "X-Team-ID": team.id},
    )

    assert response.status_code == 404
    assert db.find_one(AiReviewJob, {"submission_id": submission.id}) is None
