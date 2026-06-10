import os
from datetime import datetime

os.environ.setdefault("SECRET_KEY", "test-secret-key-with-strong-length")
os.environ.setdefault("MONGODB_URL", "mongomock://localhost")
os.environ.setdefault("MONGODB_DATABASE", "markup_test")

from fastapi.testclient import TestClient

from app.core.database import get_database, reset_database
from app.core.security import generate_object_id
from app.main import app
from app.models.auth import RefreshSession
from app.models.production import Question, Task
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
        jti_hash=f"task-question-scope-{generate_object_id()}",
        expire_at=datetime(2030, 1, 1),
    )
    db.add(session)
    db.commit()
    return auth_service.create_access_token(user.id, {"role": user.global_role, "sid": session.id})


def test_task_questions_ignore_cross_team_rows_with_same_task_id() -> None:
    db = get_database()
    team = Team(company_name="Task Question Scope Team", owner_user_id="owner-1")
    owner = User(username="taskscopeowner", email="task-scope-owner@example.com", global_role="owner", email_verified=True)
    task = Task(team_id=team.id, owner_id=owner.id, title="Scoped question task", status="draft")
    own_question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "own"})
    cross_team_question = Question(team_id="other-team", task_id=task.id, row_index=1, content={"text": "leaked"})
    for item in [team, owner, task, own_question, cross_team_question]:
        db.add(item)
    db.add(TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"))
    db.commit()

    response = client.get(
        f"/api/v1/tasks/{task.id}/questions",
        headers={"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["pagination"]["total"] == 1
    assert [item["content"]["text"] for item in data["items"]] == ["own"]
