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
from app.models.production import Question, Submission
from app.models.user import User
from app.services import auth_service

client = TestClient(app)


def setup_function() -> None:
    reset_database()


def access_token(user: User) -> str:
    db = get_database()
    session = RefreshSession(
        user_id=user.id,
        jti_hash=f"labeling-rejection-{generate_object_id()}",
        expire_at=now_utc().replace(tzinfo=None) + timedelta(days=30),
    )
    db.add(session)
    db.commit()
    return auth_service.create_access_token(user.id, {"role": user.global_role, "sid": session.id})


def test_rejection_detail_ignores_cross_team_review_audit_logs() -> None:
    db = get_database()
    labeler = User(username="rejectionscope", email="rejection-scope@example.com", global_role="labeler", email_verified=True)
    question = Question(team_id="team-a", task_id="task-a", row_index=0, content={"text": "A"}, status="rejected", assigned_to=labeler.id)
    submission = Submission(
        team_id="team-a",
        task_id="task-a",
        question_id=question.id,
        labeler_id=labeler.id,
        answers={"label": "own"},
        status="rejected",
        current_round=2,
    )
    own_log = AuditLog(
        team_id="team-a",
        entity_type="review",
        entity_id=submission.id,
        action="submission_reviewed",
        operator_id="reviewer-a",
        changes={"decision": "rejected", "comment": "own team comment", "round": 1},
        created_at=datetime(2026, 5, 30, 10, 0, 0),
    )
    cross_team_log = AuditLog(
        team_id="team-b",
        entity_type="review",
        entity_id=submission.id,
        action="submission_reviewed",
        operator_id="reviewer-b",
        changes={"decision": "rejected", "comment": "cross team secret", "round": 99},
        created_at=datetime(2026, 5, 31, 10, 0, 0),
    )
    for item in [labeler, question, submission, own_log, cross_team_log]:
        db.add(item)
    db.commit()

    response = client.get(
        f"/api/v1/labels/questions/{question.id}/rejection",
        headers={"Authorization": f"Bearer {access_token(labeler)}"},
    )

    assert response.status_code == 200
    assert response.json()["data"]["latest"]["comment"] == "own team comment"
    assert [item["comment"] for item in response.json()["data"]["history"]] == ["own team comment"]
