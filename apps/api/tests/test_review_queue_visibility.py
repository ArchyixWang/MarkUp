import os
from datetime import datetime, timedelta

os.environ.setdefault("SECRET_KEY", "test-secret-key-with-strong-length")
os.environ.setdefault("MONGODB_URL", "mongomock://localhost")
os.environ.setdefault("MONGODB_DATABASE", "markup_test")

from fastapi.testclient import TestClient

from app.core.database import get_database, reset_database
from app.core.security import generate_object_id, now_utc
from app.main import app
from app.models.auth import RefreshSession
from app.models.production import Question, Submission, Task
from app.models.team import Team, TeamMember
from app.models.user import User
from app.services import auth_service

client = TestClient(app)


def setup_function() -> None:
    reset_database()


def access_token(user: User) -> str:
    db = get_database()
    session = RefreshSession(
        user_id=user.id,
        jti_hash=f"review-queue-{generate_object_id()}",
        expire_at=now_utc().replace(tzinfo=None) + timedelta(days=30),
    )
    db.add(session)
    db.commit()
    return auth_service.create_access_token(user.id, {"role": user.global_role, "sid": session.id})


def test_review_queue_includes_submitted_submissions_without_task_submitted_at() -> None:
    db = get_database()
    team = Team(company_name="Review Queue Visibility Team", owner_user_id="owner-1")
    owner = User(username="queueowner", email="queue-owner@example.com", global_role="owner", email_verified=True)
    task = Task(team_id=team.id, owner_id=owner.id, title="Queue visible task", status="published", reviewer_ids=[owner.id])
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="submitted")
    submission = Submission(team_id=team.id, task_id=task.id, question_id=question.id, labeler_id="labeler-1", status="submitted", submitted_at=datetime(2026, 5, 31, 12, 0, 0))
    for item in [team, owner, task, question, submission, TeamMember(team_id=team.id, user_id=owner.id, team_role="owner")]:
        db.add(item)
    db.commit()

    response = client.get(
        "/api/v1/reviews/queue?status=submitted&stage=all_stages",
        headers={"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["summary"]["pending"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["submission_id"] == submission.id


def test_review_queue_reviewer_filter_includes_member_assigned_tasks() -> None:
    db = get_database()
    team = Team(company_name="Review Queue Reviewer Filter Team", owner_user_id="owner-1")
    owner = User(username="queuefilterowner", email="queue-filter-owner@example.com", global_role="owner", email_verified=True)
    reviewer = User(username="queuefilterreviewer", email="queue-filter-reviewer@example.com", global_role="reviewer", email_verified=True)
    task = Task(team_id=team.id, owner_id=owner.id, title="Member assigned review task", status="published", reviewer_ids=[])
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="submitted")
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id="labeler-1",
        status="submitted",
        submitted_at=datetime(2026, 5, 31, 12, 0, 0),
        task_submitted_at=datetime(2026, 5, 31, 12, 5, 0),
    )
    for item in [
        team,
        owner,
        reviewer,
        TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"),
        TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer", assigned_review_tasks=[task.id]),
        task,
        question,
        submission,
    ]:
        db.add(item)
    db.commit()

    response = client.get(
        f"/api/v1/reviews/queue?status=submitted&reviewer_id={reviewer.id}&assigned_only=false",
        headers={"Authorization": f"Bearer {access_token(reviewer)}", "X-Team-ID": team.id},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["summary"]["pending"] == 1
    assert data["items"][0]["submission_id"] == submission.id


def test_review_detail_rejects_unsubmitted_draft_submission() -> None:
    db = get_database()
    team = Team(company_name="Review Draft Detail Team", owner_user_id="owner-1")
    reviewer = User(username="draftdetailreviewer", email="draft-detail-reviewer@example.com", global_role="reviewer", email_verified=True)
    task = Task(team_id=team.id, owner_id="owner-1", title="Draft detail task", status="published", reviewer_ids=[reviewer.id])
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "draft"}, status="claimed", assigned_to="labeler-1")
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id="labeler-1",
        answers={"answer": "private draft"},
        draft={"answer": "private draft"},
        status="draft",
    )
    for item in [team, reviewer, TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer", assigned_review_tasks=[task.id]), task, question, submission]:
        db.add(item)
    db.commit()

    response = client.get(
        f"/api/v1/reviews/submissions/{submission.id}",
        headers={"Authorization": f"Bearer {access_token(reviewer)}", "X-Team-ID": team.id},
    )

    assert response.status_code == 404


def test_review_stats_excludes_unsubmitted_draft_submission() -> None:
    db = get_database()
    team = Team(company_name="Review Draft Stats Team", owner_user_id="owner-1")
    reviewer = User(username="draftstatsreviewer", email="draft-stats-reviewer@example.com", global_role="reviewer", email_verified=True)
    task = Task(team_id=team.id, owner_id="owner-1", title="Draft stats task", status="published", reviewer_ids=[reviewer.id])
    draft_question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "draft"}, status="claimed", assigned_to="labeler-1")
    submitted_question = Question(team_id=team.id, task_id=task.id, row_index=1, content={"text": "submitted"}, status="submitted", assigned_to="labeler-2")
    draft_submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=draft_question.id,
        labeler_id="labeler-1",
        answers={"answer": "draft"},
        draft={"answer": "draft"},
        status="draft",
    )
    submitted_submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=submitted_question.id,
        labeler_id="labeler-2",
        answers={"answer": "submitted"},
        draft={"answer": "submitted"},
        status="submitted",
        submitted_at=datetime(2026, 5, 31, 12, 0, 0),
    )
    for item in [
        team,
        reviewer,
        TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer", assigned_review_tasks=[task.id]),
        task,
        draft_question,
        submitted_question,
        draft_submission,
        submitted_submission,
    ]:
        db.add(item)
    db.commit()

    response = client.get(
        "/api/v1/reviews/stats",
        headers={"Authorization": f"Bearer {access_token(reviewer)}", "X-Team-ID": team.id},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["pending"] == 1
    assert data["total_visible"] == 1
    assert data["by_status"] == {"submitted": 1}
