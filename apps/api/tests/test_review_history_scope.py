import os
from datetime import datetime, timedelta

os.environ.setdefault("SECRET_KEY", "test-secret-key-with-strong-length")
os.environ.setdefault("MONGODB_URL", "mongomock://localhost")
os.environ.setdefault("MONGODB_DATABASE", "markup_test")

from fastapi.testclient import TestClient

from app.core.database import get_database, reset_database
from app.core.security import generate_object_id, now_utc
from app.main import app
from app.models.audit import AuditLog
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
        jti_hash=f"review-history-{generate_object_id()}",
        expire_at=now_utc().replace(tzinfo=None) + timedelta(days=30),
    )
    db.add(session)
    db.commit()
    return auth_service.create_access_token(user.id, {"role": user.global_role, "sid": session.id})


def test_review_history_ignores_cross_team_audit_logs() -> None:
    db = get_database()
    team = Team(company_name="Review History Scope Team", owner_user_id="owner-1")
    reviewer = User(username="historyreviewer", email="history-reviewer@example.com", global_role="reviewer", email_verified=True)
    task = Task(
        team_id=team.id,
        owner_id="owner-1",
        title="History scoped task",
        status="published",
        reviewer_ids=[reviewer.id],
    )
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="submitted")
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id="labeler-1",
        answers={"label": "own"},
        status="submitted",
        current_round=1,
    )
    own_log = AuditLog(
        team_id=team.id,
        entity_type="review",
        entity_id=submission.id,
        action="submission_reviewed",
        operator_id=reviewer.id,
        changes={"decision": "rejected", "comment": "own team history", "round": 1},
        created_at=datetime(2026, 5, 30, 10, 0, 0),
    )
    cross_team_log = AuditLog(
        team_id="other-team",
        entity_type="review",
        entity_id=submission.id,
        action="submission_reviewed",
        operator_id="reviewer-b",
        changes={"decision": "approved", "comment": "cross team history", "round": 99},
        created_at=datetime(2026, 5, 31, 10, 0, 0),
    )
    for item in [team, reviewer, task, question, submission, own_log, cross_team_log]:
        db.add(item)
    db.add(TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer", assigned_review_tasks=[task.id]))
    db.commit()

    response = client.get(
        f"/api/v1/reviews/submissions/{submission.id}/history",
        headers={"Authorization": f"Bearer {access_token(reviewer)}", "X-Team-ID": team.id},
    )

    assert response.status_code == 200
    assert response.json()["data"]["summary"]["total"] == 1
    assert response.json()["data"]["items"][0]["comment"] == "own team history"


def test_unassigned_reviewer_view_cannot_open_detail_history_or_diff() -> None:
    db = get_database()
    team = Team(company_name="Review Unassigned Read Team", owner_user_id="owner-1")
    reviewer = User(username="unassignedreader", email="unassigned-reader@example.com", global_role="reviewer", email_verified=True)
    task = Task(
        team_id=team.id,
        owner_id="owner-1",
        title="Unassigned readable task",
        status="published",
        reviewer_ids=[],
    )
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="submitted")
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id="labeler-1",
        answers={"label": "risk"},
        draft={"label": "safe"},
        status="submitted",
        current_round=1,
        submitted_at=datetime(2026, 5, 31, 9, 0, 0),
        task_submitted_at=datetime(2026, 5, 31, 9, 5, 0),
    )
    log = AuditLog(
        team_id=team.id,
        entity_type="review",
        entity_id=submission.id,
        action="submission_reviewed",
        operator_id="reviewer-a",
        changes={"decision": "rejected", "comment": "needs more evidence", "round": 1},
        created_at=datetime(2026, 5, 31, 10, 0, 0),
    )
    for item in [
        team,
        reviewer,
        TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer", permissions=["submission:view"]),
        task,
        question,
        submission,
        log,
    ]:
        db.add(item)
    db.commit()
    headers = {"Authorization": f"Bearer {access_token(reviewer)}", "X-Team-ID": team.id}

    queue = client.get("/api/v1/reviews/queue?assigned_only=false", headers=headers)
    assert queue.status_code == 200
    assert queue.json()["data"]["items"] == []

    detail = client.get(f"/api/v1/reviews/submissions/{submission.id}?assigned_only=false", headers=headers)
    history = client.get(f"/api/v1/reviews/submissions/{submission.id}/history?assigned_only=false", headers=headers)
    diff = client.get(f"/api/v1/reviews/submissions/{submission.id}/diff?assigned_only=false", headers=headers)

    assert detail.status_code == 403
    assert history.status_code == 403
    assert diff.status_code == 403
