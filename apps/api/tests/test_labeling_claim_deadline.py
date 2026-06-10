import os
from datetime import datetime, timedelta

os.environ.setdefault("SECRET_KEY", "test-secret-key-with-strong-length")
os.environ.setdefault("MONGODB_URL", "mongomock://localhost")
os.environ.setdefault("MONGODB_DATABASE", "markup_test")

from fastapi.testclient import TestClient

from app.core.database import get_database, reset_database
from app.core.security import generate_object_id, now_utc
from app.models.auth import RefreshSession
from app.models.production import AnnotationTemplate, Question, Submission, Task, TemplateVersion
from app.models.profile import ReputationLedger
from app.models.team import Team, TeamMember
from app.models.user import User
from app.main import app
from app.services import auth_service

client = TestClient(app)


def access_token(user: User) -> str:
    db = get_database()
    session = RefreshSession(
        user_id=user.id,
        jti_hash=f"labeling-deadline-{generate_object_id()}",
        expire_at=now_utc().replace(tzinfo=None) + timedelta(days=30),
    )
    db.add(session)
    db.commit()
    return auth_service.create_access_token(user.id, {"role": user.global_role, "sid": session.id})


def setup_function() -> None:
    reset_database()


def test_claim_rejects_closed_deadline_task_without_assigning_questions() -> None:
    db = get_database()
    labeler = User(username="deadlineclaimlabeler", email="deadline-claim-labeler@example.com", global_role="labeler", email_verified=True)
    task = Task(
        team_id="deadline-team",
        owner_id="owner-1",
        title="Expired public task",
        description="Should be closed by deadline",
        status="published",
        deadline="2020-01-01",
        reward_rule={"mode": "item", "points_per_item": 2},
        stats={"total": 1, "claimed": 0, "submitted": 0, "approved": 0, "rejected": 0},
    )
    question = Question(team_id=task.team_id, task_id=task.id, row_index=0, content={"text": "expired"})
    db.add(labeler)
    db.add(task)
    db.add(question)
    db.commit()

    marketplace = client.get("/api/v1/labels/tasks?status=closed")
    assert marketplace.status_code == 200
    assert marketplace.json()["data"]["items"][0]["task_id"] == task.id

    response = client.post(
        f"/api/v1/labels/tasks/{task.id}/claim",
        headers={"Authorization": f"Bearer {access_token(labeler)}"},
        json={"bundle_size": 1},
    )

    assert response.status_code == 409
    assert response.json()["code"] == 40902
    persisted_question = db.get(Question, question.id)
    assert persisted_question.status == "pending"
    assert persisted_question.assigned_to is None


def test_my_tasks_releases_overdue_claimed_questions() -> None:
    db = get_database()
    labeler = User(username="overduelistlabeler", email="overdue-list-labeler@example.com", global_role="labeler", email_verified=True)
    task = Task(
        team_id="overdue-list-team",
        owner_id="owner-1",
        title="Overdue list task",
        status="published",
        claim_config={"completion_hours": 1},
        reward_rule={"mode": "item", "points_per_item": 2, "bundle_options": [1]},
        stats={"total": 1, "claimed": 1, "submitted": 0, "approved": 0, "rejected": 0},
    )
    question = Question(
        team_id=task.team_id,
        task_id=task.id,
        row_index=0,
        content={"text": "overdue"},
        status="claimed",
        assigned_to=labeler.id,
        claim_due_at=now_utc().replace(tzinfo=None) - timedelta(minutes=5),
    )
    submission = Submission(team_id=task.team_id, task_id=task.id, question_id=question.id, labeler_id=labeler.id, answers={}, draft={}, status="draft")
    for item in [labeler, task, question, submission]:
        db.add(item)
    db.commit()

    response = client.get("/api/v1/labels/my-tasks", headers={"Authorization": f"Bearer {access_token(labeler)}"})

    persisted_question = db.get(Question, question.id)
    assert response.status_code == 200
    assert response.json()["data"]["items"] == []
    assert persisted_question.status == "pending"
    assert persisted_question.assigned_to is None
    assert persisted_question.claim_due_at is None
    assert db.find_one(ReputationLedger, {"user_id": labeler.id, "source_type": "labeling_timeout"}) is not None


def test_draft_rejects_overdue_claimed_question() -> None:
    db = get_database()
    labeler = User(username="overduedraftlabeler", email="overdue-draft-labeler@example.com", global_role="labeler", email_verified=True)
    task = Task(
        team_id="overdue-draft-team",
        owner_id="owner-1",
        title="Overdue draft task",
        status="published",
        claim_config={"completion_hours": 1},
        reward_rule={"mode": "item", "points_per_item": 2, "bundle_options": [1]},
        stats={"total": 1, "claimed": 1, "submitted": 0, "approved": 0, "rejected": 0},
    )
    question = Question(
        team_id=task.team_id,
        task_id=task.id,
        row_index=0,
        content={"text": "overdue"},
        status="claimed",
        assigned_to=labeler.id,
        claim_due_at=now_utc().replace(tzinfo=None) - timedelta(minutes=5),
    )
    submission = Submission(team_id=task.team_id, task_id=task.id, question_id=question.id, labeler_id=labeler.id, answers={"answer": "old"}, draft={"answer": "old"}, status="draft")
    for item in [labeler, task, question, submission]:
        db.add(item)
    db.commit()

    response = client.put(
        f"/api/v1/labels/questions/{question.id}/draft",
        headers={"Authorization": f"Bearer {access_token(labeler)}"},
        json={"answers": {"answer": "new"}},
    )

    persisted_question = db.get(Question, question.id)
    persisted_submission = db.get(Submission, submission.id)
    assert response.status_code == 409
    assert persisted_question.status == "pending"
    assert persisted_question.assigned_to is None
    assert persisted_submission.draft == {"answer": "old"}


def test_submit_rejects_overdue_claimed_question() -> None:
    db = get_database()
    labeler = User(username="overduesubmitlabeler", email="overdue-submit-labeler@example.com", global_role="labeler", email_verified=True)
    template = AnnotationTemplate(team_id="overdue-submit-team", owner_id="owner-1", name="Overdue submit template", status="published")
    schema = {
        "components": [
            {"id": "answer", "field": "answer", "type": "SingleSelect", "label": "判断", "required": True, "options": [{"label": "是", "value": "yes"}, {"label": "否", "value": "no"}]}
        ]
    }
    version = TemplateVersion(template_id=template.id, team_id=template.team_id, version=1, schema=schema, is_published=True)
    task = Task(
        team_id=template.team_id,
        owner_id="owner-1",
        title="Overdue submit task",
        status="published",
        template_id=template.id,
        template_version_id=f"{template.id}:v1",
        claim_config={"completion_hours": 1},
        reward_rule={"mode": "item", "points_per_item": 2, "bundle_options": [1]},
        stats={"total": 1, "claimed": 1, "submitted": 0, "approved": 0, "rejected": 0},
    )
    question = Question(
        team_id=task.team_id,
        task_id=task.id,
        row_index=0,
        content={"text": "overdue"},
        status="claimed",
        assigned_to=labeler.id,
        claim_due_at=now_utc().replace(tzinfo=None) - timedelta(minutes=5),
    )
    submission = Submission(
        team_id=task.team_id,
        task_id=task.id,
        question_id=question.id,
        labeler_id=labeler.id,
        template_id=template.id,
        template_version_id=f"{template.id}:v1",
        answers={"answer": "no"},
        draft={"answer": "no"},
        status="draft",
    )
    for item in [labeler, template, version, task, question, submission]:
        db.add(item)
    db.commit()

    response = client.post(
        f"/api/v1/labels/questions/{question.id}/submit",
        headers={"Authorization": f"Bearer {access_token(labeler)}"},
        json={"answers": {"answer": "yes"}},
    )

    persisted_question = db.get(Question, question.id)
    persisted_submission = db.get(Submission, submission.id)
    assert response.status_code == 409
    assert persisted_question.status == "pending"
    assert persisted_question.assigned_to is None
    assert persisted_submission.status == "draft"
    assert persisted_submission.answers == {"answer": "no"}


def test_claim_ignores_cross_team_questions_with_same_task_id() -> None:
    db = get_database()
    labeler = User(username="scopeclaimlabeler", email="scope-claim-labeler@example.com", global_role="labeler", email_verified=True)
    task = Task(
        team_id="claim-team",
        owner_id="owner-1",
        title="Scoped public task",
        description="Only same-team questions should be claimable",
        status="published",
        reward_rule={"mode": "item", "points_per_item": 2, "bundle_options": [1]},
        stats={"total": 1, "claimed": 0, "submitted": 0, "approved": 0, "rejected": 0},
    )
    cross_team_question = Question(team_id="other-team", task_id=task.id, row_index=0, content={"text": "leaked"})
    own_question = Question(team_id=task.team_id, task_id=task.id, row_index=1, content={"text": "own"})
    for item in [labeler, task, cross_team_question, own_question]:
        db.add(item)
    db.commit()

    response = client.post(
        f"/api/v1/labels/tasks/{task.id}/claim",
        headers={"Authorization": f"Bearer {access_token(labeler)}"},
        json={"bundle_size": 1},
    )

    assert response.status_code == 200
    assert response.json()["data"]["remaining_items"] == 0
    persisted_own = db.get(Question, own_question.id)
    persisted_cross_team = db.get(Question, cross_team_question.id)
    assert persisted_own.status == "claimed"
    assert persisted_own.assigned_to == labeler.id
    assert persisted_cross_team.status == "pending"
    assert persisted_cross_team.assigned_to is None
    assert db.find_one(Submission, {"question_id": own_question.id, "labeler_id": labeler.id}) is not None
    assert db.find_one(Submission, {"question_id": cross_team_question.id, "labeler_id": labeler.id}) is None


def test_public_market_hides_internal_and_assigned_link_tasks() -> None:
    db = get_database()
    team = Team(company_name="Distribution Scope Team", owner_user_id="owner-1")
    other_team = Team(company_name="Other Distribution Scope Team", owner_user_id="owner-2")
    team_labeler = User(username="distteamlabeler", email="dist-team-labeler@example.com", global_role="user", email_verified=True)
    public_task = Task(
        team_id=team.id,
        owner_id="owner-1",
        title="Public package task",
        status="published",
        distribution="first_come_all",
        reward_rule={"mode": "item", "points_per_item": 2, "bundle_options": [1]},
    )
    internal_task = Task(
        team_id=team.id,
        owner_id="owner-1",
        title="Internal team flow task",
        status="published",
        distribution="quota_grab",
        reward_rule={"mode": "item", "points_per_item": 2, "bundle_options": [1]},
    )
    assigned_link_task = Task(
        team_id=team.id,
        owner_id="owner-1",
        title="Assigned link task",
        status="published",
        distribution="assigned_link",
        assignment={"enabled": True, "code": "dist-scope-link", "expire_at": (now_utc() + timedelta(days=1)).isoformat()},
        reward_rule={"mode": "item", "points_per_item": 2, "bundle_options": [1]},
    )
    other_internal_task = Task(
        team_id=other_team.id,
        owner_id="owner-2",
        title="Other team internal flow task",
        status="published",
        distribution="quota_grab",
        reward_rule={"mode": "item", "points_per_item": 2, "bundle_options": [1]},
    )
    questions = [
        Question(team_id=team.id, task_id=public_task.id, row_index=0, content={"text": "public"}),
        Question(team_id=team.id, task_id=internal_task.id, row_index=0, content={"text": "internal"}),
        Question(team_id=team.id, task_id=assigned_link_task.id, row_index=0, content={"text": "link"}),
        Question(team_id=other_team.id, task_id=other_internal_task.id, row_index=0, content={"text": "other internal"}),
    ]
    for item in [
        team,
        other_team,
        team_labeler,
        TeamMember(team_id=team.id, user_id=team_labeler.id, team_role="labeler"),
        public_task,
        internal_task,
        assigned_link_task,
        other_internal_task,
        *questions,
    ]:
        db.add(item)
    db.commit()

    public_response = client.get("/api/v1/labels/tasks")
    team_labeler_personal_response = client.get(
        "/api/v1/labels/tasks",
        headers={"Authorization": f"Bearer {access_token(team_labeler)}"},
    )
    internal_response = client.get(
        "/api/v1/labels/tasks?team_scope=mine",
        headers={"Authorization": f"Bearer {access_token(team_labeler)}", "X-Team-ID": team.id},
    )

    assert public_response.status_code == 200
    public_ids = {item["task_id"] for item in public_response.json()["data"]["items"]}
    assert public_task.id in public_ids
    assert internal_task.id not in public_ids
    assert assigned_link_task.id not in public_ids
    assert team_labeler_personal_response.status_code == 200
    team_labeler_personal_ids = {item["task_id"] for item in team_labeler_personal_response.json()["data"]["items"]}
    assert public_task.id not in team_labeler_personal_ids
    assert internal_response.status_code == 200
    internal_ids = {item["task_id"] for item in internal_response.json()["data"]["items"]}
    assert internal_task.id in internal_ids
    assert other_internal_task.id not in internal_ids
    assert assigned_link_task.id not in internal_ids


def test_external_labeler_cannot_claim_quota_grab_team_task() -> None:
    db = get_database()
    team = Team(company_name="Quota Claim Scope Team", owner_user_id="owner-1")
    labeler = User(username="externalclaimlabeler", email="external-claim@example.com", global_role="labeler", email_verified=True)
    task = Task(
        team_id=team.id,
        owner_id="owner-1",
        title="Internal claim task",
        status="published",
        distribution="quota_grab",
        reward_rule={"mode": "item", "points_per_item": 2, "bundle_options": [1]},
    )
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "internal"})
    for item in [team, labeler, task, question]:
        db.add(item)
    db.commit()

    response = client.post(
        f"/api/v1/labels/tasks/{task.id}/claim",
        headers={"Authorization": f"Bearer {access_token(labeler)}"},
        json={"bundle_size": 1},
    )

    assert response.status_code == 404
    persisted_question = db.get(Question, question.id)
    assert persisted_question.status == "pending"
    assert persisted_question.assigned_to is None
    assert db.find_one(Submission, {"task_id": task.id, "labeler_id": labeler.id}) is None


def test_external_labeler_qualification_check_rejects_quota_grab_team_task() -> None:
    db = get_database()
    team = Team(company_name="Quota Qualification Scope Team", owner_user_id="owner-1")
    labeler = User(username="externalqualifier", email="external-qualification@example.com", global_role="labeler", email_verified=True)
    task = Task(
        team_id=team.id,
        owner_id="owner-1",
        title="Internal qualification task",
        status="published",
        distribution="quota_grab",
        reward_rule={"mode": "item", "points_per_item": 2, "bundle_options": [1]},
    )
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "internal"})
    for item in [team, labeler, task, question]:
        db.add(item)
    db.commit()

    response = client.get(
        f"/api/v1/labels/tasks/{task.id}/qualification-check",
        headers={"Authorization": f"Bearer {access_token(labeler)}"},
    )

    assert response.status_code == 404


def test_team_labeler_cannot_claim_public_reward_task_from_own_team() -> None:
    db = get_database()
    team = Team(company_name="Public Reward Team", owner_user_id="owner-1")
    labeler = User(username="teampubliclabeler", email="team-public-labeler@example.com", global_role="labeler", email_verified=True)
    task = Task(
        team_id=team.id,
        owner_id="owner-1",
        title="Enterprise public reward task",
        status="published",
        distribution="first_come_all",
        reward_rule={"mode": "item", "points_per_item": 2, "bundle_options": [1]},
        stats={"total": 1, "claimed": 0, "submitted": 0, "approved": 0, "rejected": 0},
    )
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "public"})
    for item in [team, labeler, TeamMember(team_id=team.id, user_id=labeler.id, team_role="labeler"), task, question]:
        db.add(item)
    db.commit()

    personal_scope_claim = client.post(
        f"/api/v1/labels/tasks/{task.id}/claim",
        headers={"Authorization": f"Bearer {access_token(labeler)}"},
        json={"bundle_size": 1},
    )
    personal_scope_qualification = client.get(
        f"/api/v1/labels/tasks/{task.id}/qualification-check",
        headers={"Authorization": f"Bearer {access_token(labeler)}"},
    )
    response = client.post(
        f"/api/v1/labels/tasks/{task.id}/claim",
        headers={"Authorization": f"Bearer {access_token(labeler)}", "X-Team-ID": team.id},
        json={"bundle_size": 1},
    )

    assert personal_scope_claim.status_code == 404
    assert personal_scope_qualification.status_code == 404
    assert response.status_code == 404
    persisted_question = db.get(Question, question.id)
    assert persisted_question.status == "pending"
    assert persisted_question.assigned_to is None
    assert db.find_one(Submission, {"task_id": task.id, "labeler_id": labeler.id}) is None


def test_internal_flow_target_labelers_restrict_visibility_and_claim() -> None:
    db = get_database()
    team = Team(company_name="Targeted Internal Team", owner_user_id="owner-1")
    allowed = User(username="targetallowed", email="target-allowed@example.com", global_role="user", email_verified=True)
    denied = User(username="targetdenied", email="target-denied@example.com", global_role="user", email_verified=True)
    task = Task(
        team_id=team.id,
        owner_id="owner-1",
        title="Targeted internal flow task",
        status="published",
        distribution="quota_grab",
        assignment={"enabled": False, "target_labeler_ids": [allowed.id]},
        reward_rule={"mode": "item", "points_per_item": 0, "bundle_options": [1]},
        stats={"total": 1, "claimed": 0, "submitted": 0, "approved": 0, "rejected": 0},
    )
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "internal"})
    for item in [
        team,
        allowed,
        denied,
        TeamMember(team_id=team.id, user_id=allowed.id, team_role="labeler"),
        TeamMember(team_id=team.id, user_id=denied.id, team_role="labeler"),
        task,
        question,
    ]:
        db.add(item)
    db.commit()

    allowed_market = client.get(
        "/api/v1/labels/tasks?team_scope=mine",
        headers={"Authorization": f"Bearer {access_token(allowed)}", "X-Team-ID": team.id},
    )
    denied_market = client.get(
        "/api/v1/labels/tasks?team_scope=mine",
        headers={"Authorization": f"Bearer {access_token(denied)}", "X-Team-ID": team.id},
    )
    denied_claim = client.post(
        f"/api/v1/labels/tasks/{task.id}/claim",
        headers={"Authorization": f"Bearer {access_token(denied)}", "X-Team-ID": team.id},
        json={"bundle_size": 1},
    )
    allowed_claim = client.post(
        f"/api/v1/labels/tasks/{task.id}/claim",
        headers={"Authorization": f"Bearer {access_token(allowed)}", "X-Team-ID": team.id},
        json={"bundle_size": 1},
    )

    assert allowed_market.status_code == 200
    assert {item["task_id"] for item in allowed_market.json()["data"]["items"]} == {task.id}
    assert "_target_labeler_ids" not in allowed_market.json()["data"]["items"][0]
    assert denied_market.status_code == 200
    assert denied_market.json()["data"]["items"] == []
    assert denied_claim.status_code == 404
    assert allowed_claim.status_code == 200
    persisted_question = db.get(Question, question.id)
    assert persisted_question.status == "claimed"
    assert persisted_question.assigned_to == allowed.id
    assert db.find_one(Submission, {"task_id": task.id, "labeler_id": denied.id}) is None


def test_claim_rejects_bundle_size_outside_configured_options() -> None:
    db = get_database()
    labeler = User(username="bundleoptionlabeler", email="bundle-option-labeler@example.com", global_role="labeler", email_verified=True)
    task = Task(
        team_id="bundle-option-team",
        owner_id="owner-1",
        title="Bundle option task",
        description="Only configured bundle sizes should be accepted",
        status="published",
        reward_rule={"mode": "item", "points_per_item": 2, "bundle_options": [2, 5]},
        stats={"total": 5, "claimed": 0, "submitted": 0, "approved": 0, "rejected": 0},
    )
    questions = [
        Question(team_id=task.team_id, task_id=task.id, row_index=index, content={"text": f"Q{index + 1}"})
        for index in range(5)
    ]
    for item in [labeler, task, *questions]:
        db.add(item)
    db.commit()

    response = client.post(
        f"/api/v1/labels/tasks/{task.id}/claim",
        headers={"Authorization": f"Bearer {access_token(labeler)}"},
        json={"bundle_size": 3},
    )

    assert response.status_code == 400
    assert response.json()["code"] == 40003
    assert response.json()["detail"]["bundle_options"] == [2, 5]
    assert all(db.get(Question, question.id).assigned_to is None for question in questions)
    assert db.find(Submission, {"task_id": task.id, "labeler_id": labeler.id}) == []


def test_labeler_can_claim_more_questions_after_previous_bundle_approved() -> None:
    db = get_database()
    labeler = User(username="reclaimlabeler", email="reclaim-labeler@example.com", global_role="labeler", email_verified=True)
    task = Task(
        team_id="reclaim-team",
        owner_id="owner-1",
        title="Reclaim public task",
        description="Approved bundles should not block new claims",
        status="published",
        reward_rule={"mode": "item", "points_per_item": 2, "bundle_options": [1]},
        stats={"total": 2, "claimed": 1, "submitted": 1, "approved": 1, "rejected": 0},
    )
    approved_question = Question(team_id=task.team_id, task_id=task.id, row_index=0, content={"text": "done"}, status="approved", assigned_to=labeler.id)
    pending_question = Question(team_id=task.team_id, task_id=task.id, row_index=1, content={"text": "next"})
    approved_submission = Submission(
        team_id=task.team_id,
        task_id=task.id,
        question_id=approved_question.id,
        labeler_id=labeler.id,
        answers={"answer": "ok"},
        draft={"answer": "ok"},
        status="approved",
        task_submitted_at=datetime(2026, 5, 31),
    )
    for item in [labeler, task, approved_question, pending_question, approved_submission]:
        db.add(item)
    db.commit()

    response = client.post(
        f"/api/v1/labels/tasks/{task.id}/claim",
        headers={"Authorization": f"Bearer {access_token(labeler)}"},
        json={"bundle_size": 1},
    )

    assert response.status_code == 200
    assert db.get(Question, pending_question.id).status == "claimed"
    my_tasks = client.get("/api/v1/labels/my-tasks", headers={"Authorization": f"Bearer {access_token(labeler)}"})
    assert my_tasks.status_code == 200
    item = my_tasks.json()["data"]["items"][0]
    assert item["task"]["task_id"] == task.id
    assert item["progress"]["total"] == 1
    assert item["latest_question_id"] == pending_question.id


def test_rejected_completed_task_returns_to_my_tasks() -> None:
    db = get_database()
    labeler = User(username="rejectedtasklabeler", email="rejected-task-labeler@example.com", global_role="labeler", email_verified=True)
    task = Task(
        team_id="rejected-task-team",
        owner_id="owner-1",
        title="Rejected active task",
        status="published",
        reward_rule={"mode": "item", "points_per_item": 2, "bundle_options": [1]},
        stats={"total": 1, "claimed": 1, "submitted": 1, "approved": 0, "rejected": 1},
    )
    question = Question(team_id=task.team_id, task_id=task.id, row_index=0, content={"text": "retry"}, status="rejected", assigned_to=labeler.id)
    submission = Submission(
        team_id=task.team_id,
        task_id=task.id,
        question_id=question.id,
        labeler_id=labeler.id,
        answers={"answer": "bad"},
        draft={"answer": "bad"},
        status="rejected",
        current_round=2,
        task_submitted_at=datetime(2026, 5, 31),
    )
    for item in [labeler, task, question, submission]:
        db.add(item)
    db.commit()

    response = client.get("/api/v1/labels/my-tasks", headers={"Authorization": f"Bearer {access_token(labeler)}"})

    assert response.status_code == 200
    items = response.json()["data"]["items"]
    assert len(items) == 1
    assert items[0]["task"]["task_id"] == task.id
    assert items[0]["progress"]["rejected"] == 1


def test_rejected_task_can_be_edited_resubmitted_and_reconfirmed() -> None:
    db = get_database()
    from app.models.production import AnnotationTemplate, TemplateVersion
    from app.models.team import Team

    labeler = User(username="retryflowlabeler", email="retry-flow-labeler@example.com", global_role="labeler", email_verified=True)
    team = Team(company_name="Retry Flow Team", owner_user_id="owner-1")
    template = AnnotationTemplate(team_id=team.id, owner_id="owner-1", name="Retry template")
    schema = {
        "components": [
            {"id": "answer", "field": "answer", "type": "SingleSelect", "label": "判断", "required": True, "options": [{"label": "是", "value": "yes"}, {"label": "否", "value": "no"}]}
        ]
    }
    version = TemplateVersion(template_id=template.id, team_id=team.id, version=1, schema=schema, is_published=True)
    task = Task(
        team_id=team.id,
        owner_id="owner-1",
        title="Rejected retry task",
        status="finished",
        template_id=template.id,
        template_version_id=f"{template.id}:v1",
        reward_rule={"mode": "item", "points_per_item": 2, "bundle_options": [1]},
        stats={"total": 1, "claimed": 1, "submitted": 0, "approved": 0, "rejected": 1},
    )
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "retry"}, status="rejected", assigned_to=labeler.id)
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id=labeler.id,
        template_id=template.id,
        template_version_id=f"{template.id}:v1",
        answers={"answer": "no"},
        draft={"answer": "no"},
        status="rejected",
        current_round=2,
        task_submitted_at=datetime(2026, 5, 31),
    )
    for item in [labeler, team, template, version, task, question, submission]:
        db.add(item)
    db.commit()
    headers = {"Authorization": f"Bearer {access_token(labeler)}"}

    my_tasks = client.get("/api/v1/labels/my-tasks", headers=headers)
    assert my_tasks.status_code == 200
    assert my_tasks.json()["data"]["items"][0]["progress"]["rejected"] == 1

    draft = client.put(f"/api/v1/labels/questions/{question.id}/draft", headers=headers, json={"answers": {"answer": "yes"}})
    assert draft.status_code == 200
    assert draft.json()["data"]["status"] == "draft"
    assert db.get(Question, question.id).status == "claimed"
    assert db.get(Submission, submission.id).task_submitted_at is None

    submitted = client.post(f"/api/v1/labels/questions/{question.id}/submit", headers=headers, json={"answers": {"answer": "yes"}})
    assert submitted.status_code == 200
    assert submitted.json()["data"]["status"] == "submitted"
    assert db.get(Question, question.id).status == "submitted"
    assert db.get(Submission, submission.id).task_submitted_at is None

    complete = client.post(f"/api/v1/labels/tasks/{task.id}/complete", headers=headers)
    assert complete.status_code == 200
    assert db.get(Submission, submission.id).task_submitted_at is not None



def test_rejected_submission_returns_to_my_tasks_even_if_question_status_was_not_synced() -> None:
    db = get_database()
    labeler = User(username="unsyncedrejectlabeler", email="unsynced-reject@example.com", global_role="labeler", email_verified=True)
    task = Task(
        team_id="unsynced-reject-team",
        owner_id="owner-1",
        title="Unsynced rejected task",
        status="published",
        reward_rule={"mode": "item", "points_per_item": 2, "bundle_options": [1]},
        stats={"total": 1, "claimed": 1, "submitted": 1, "approved": 0, "rejected": 0},
    )
    question = Question(team_id=task.team_id, task_id=task.id, row_index=0, content={"text": "retry"}, status="submitted", assigned_to=labeler.id)
    submission = Submission(
        team_id=task.team_id,
        task_id=task.id,
        question_id=question.id,
        labeler_id=labeler.id,
        answers={"answer": "bad"},
        draft={"answer": "bad"},
        status="rejected",
        current_round=2,
        task_submitted_at=datetime(2026, 5, 31),
    )
    for item in [labeler, task, question, submission]:
        db.add(item)
    db.commit()

    response = client.get("/api/v1/labels/my-tasks", headers={"Authorization": f"Bearer {access_token(labeler)}"})

    assert response.status_code == 200
    items = response.json()["data"]["items"]
    assert len(items) == 1
    assert items[0]["task"]["task_id"] == task.id
    assert items[0]["progress"]["rejected"] == 1
    assert items[0]["latest_question_id"] == question.id


def test_one_rejected_question_marks_whole_claimed_task_as_revision() -> None:
    db = get_database()
    labeler = User(username="packrejectlabeler", email="pack-reject@example.com", global_role="labeler", email_verified=True)
    task = Task(
        team_id="pack-reject-team",
        owner_id="owner-1",
        title="Partially rejected task",
        status="published",
        reward_rule={"mode": "item", "points_per_item": 2, "bundle_options": [5]},
        stats={"total": 5, "claimed": 5, "submitted": 5, "approved": 0, "rejected": 1},
    )
    questions = [
        Question(
            team_id=task.team_id,
            task_id=task.id,
            row_index=index,
            content={"text": f"Q{index + 1}"},
            status="rejected" if index == 2 else "submitted",
            assigned_to=labeler.id,
        )
        for index in range(5)
    ]
    submissions = [
        Submission(
            team_id=task.team_id,
            task_id=task.id,
            question_id=question.id,
            labeler_id=labeler.id,
            answers={"answer": "bad" if index == 2 else "ok"},
            draft={"answer": "bad" if index == 2 else "ok"},
            status="rejected" if index == 2 else "submitted",
            current_round=2 if index == 2 else 1,
            task_submitted_at=datetime(2026, 5, 31),
        )
        for index, question in enumerate(questions)
    ]
    for item in [labeler, task, *questions, *submissions]:
        db.add(item)
    db.commit()

    response = client.get("/api/v1/labels/my-tasks", headers={"Authorization": f"Bearer {access_token(labeler)}"})

    assert response.status_code == 200
    items = response.json()["data"]["items"]
    assert len(items) == 1
    item = items[0]
    assert item["task"]["task_id"] == task.id
    assert item["needs_revision"] is True
    assert item["progress"]["total"] == 5
    assert item["progress"]["rejected"] == 1
    assert item["latest_question_id"] == questions[2].id


def test_review_rejection_returns_whole_task_to_labeler_my_tasks() -> None:
    db = get_database()
    team = Team(company_name="Review Reject Team", owner_user_id="owner-1")
    reviewer = User(username="reviewrejectreviewer", email="review-reject-reviewer@example.com", global_role="reviewer", email_verified=True)
    labeler = User(username="reviewrejectlabeler", email="review-reject-labeler@example.com", global_role="labeler", email_verified=True)
    task = Task(
        team_id=team.id,
        owner_id="owner-1",
        title="Review rejected task",
        status="published",
        reviewer_ids=[reviewer.id],
        reward_rule={"mode": "item", "points_per_item": 2, "bundle_options": [5]},
        stats={"total": 5, "claimed": 5, "submitted": 5, "approved": 0, "rejected": 0},
    )
    questions = [
        Question(
            team_id=team.id,
            task_id=task.id,
            row_index=index,
            content={"text": f"Q{index + 1}"},
            status="submitted",
            assigned_to=labeler.id,
        )
        for index in range(5)
    ]
    submissions = [
        Submission(
            team_id=team.id,
            task_id=task.id,
            question_id=question.id,
            labeler_id=labeler.id,
            answers={"answer": "ok"},
            draft={"answer": "ok"},
            status="submitted",
            current_round=1,
            task_submitted_at=datetime(2026, 5, 31),
        )
        for question in questions
    ]
    for item in [
        team,
        reviewer,
        labeler,
        TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer", assigned_review_tasks=[task.id]),
        task,
        *questions,
        *submissions,
    ]:
        db.add(item)
    db.commit()

    reject_response = client.post(
        f"/api/v1/reviews/submissions/{submissions[2].id}",
        headers={"Authorization": f"Bearer {access_token(reviewer)}", "X-Team-ID": team.id},
        json={"decision": "rejected", "comment": "第 3 题需要修改"},
    )
    assert reject_response.status_code == 200

    response = client.get("/api/v1/labels/my-tasks", headers={"Authorization": f"Bearer {access_token(labeler)}"})

    assert response.status_code == 200
    items = response.json()["data"]["items"]
    assert len(items) == 1
    item = items[0]
    assert item["task"]["task_id"] == task.id
    assert item["needs_revision"] is True
    assert item["progress"]["rejected"] == 1
    assert item["latest_question_id"] == questions[2].id


def test_rejected_submission_returns_to_my_tasks_even_if_assignment_was_lost() -> None:
    db = get_database()
    labeler = User(username="lostassignlabeler", email="lost-assign@example.com", global_role="labeler", email_verified=True)
    task = Task(
        team_id="lost-assign-team",
        owner_id="owner-1",
        title="Lost assignment rejected task",
        status="published",
        reward_rule={"mode": "item", "points_per_item": 2, "bundle_options": [1]},
        stats={"total": 1, "claimed": 1, "submitted": 1, "approved": 0, "rejected": 1},
    )
    question = Question(team_id=task.team_id, task_id=task.id, row_index=0, content={"text": "retry"}, status="rejected", assigned_to=None)
    submission = Submission(
        team_id=task.team_id,
        task_id=task.id,
        question_id=question.id,
        labeler_id=labeler.id,
        answers={"answer": "bad"},
        draft={"answer": "bad"},
        status="rejected",
        current_round=2,
        task_submitted_at=None,
    )
    for item in [labeler, task, question, submission]:
        db.add(item)
    db.commit()

    response = client.get("/api/v1/labels/my-tasks", headers={"Authorization": f"Bearer {access_token(labeler)}"})

    assert response.status_code == 200
    items = response.json()["data"]["items"]
    assert len(items) == 1
    assert items[0]["task"]["task_id"] == task.id
    assert items[0]["needs_revision"] is True
    assert items[0]["progress"]["rejected"] == 1


def test_final_rejected_released_question_does_not_return_to_old_labeler_my_tasks() -> None:
    db = get_database()
    labeler = User(username="finalreleasedlabeler", email="final-released@example.com", global_role="labeler", email_verified=True)
    task = Task(
        team_id="final-released-team",
        owner_id="owner-1",
        title="Final released task",
        status="published",
        reward_rule={"mode": "item", "points_per_item": 2, "bundle_options": [1]},
        stats={"total": 1, "claimed": 0, "submitted": 0, "approved": 0, "rejected": 0},
    )
    question = Question(team_id=task.team_id, task_id=task.id, row_index=0, content={"text": "released"}, status="pending", assigned_to=None)
    submission = Submission(
        team_id=task.team_id,
        task_id=task.id,
        question_id=question.id,
        labeler_id=labeler.id,
        answers={"answer": "bad"},
        draft={"answer": "bad"},
        status="rejected",
        current_round=3,
        task_submitted_at=datetime(2026, 5, 31),
    )
    for item in [labeler, task, question, submission]:
        db.add(item)
    db.commit()

    response = client.get("/api/v1/labels/my-tasks", headers={"Authorization": f"Bearer {access_token(labeler)}"})

    assert response.status_code == 200
    assert response.json()["data"]["items"] == []


def test_final_rejected_released_question_stays_in_labeler_contributions() -> None:
    db = get_database()
    labeler = User(username="finalcontriblabeler", email="final-contrib@example.com", global_role="labeler", email_verified=True)
    task = Task(
        team_id="final-contrib-team",
        owner_id="owner-1",
        title="Final rejected contribution task",
        status="published",
        reward_rule={"mode": "item", "points_per_item": 2, "bundle_options": [1]},
        stats={"total": 1, "claimed": 0, "submitted": 0, "approved": 0, "rejected": 0},
    )
    question = Question(team_id=task.team_id, task_id=task.id, row_index=0, content={"text": "released"}, status="pending", assigned_to=None)
    submission = Submission(
        team_id=task.team_id,
        task_id=task.id,
        question_id=question.id,
        labeler_id=labeler.id,
        answers={"answer": "bad"},
        draft={"answer": "bad"},
        status="rejected",
        current_round=3,
        task_submitted_at=datetime(2026, 5, 31),
    )
    for item in [labeler, task, question, submission]:
        db.add(item)
    db.commit()

    response = client.get("/api/v1/labels/contributions", headers={"Authorization": f"Bearer {access_token(labeler)}"})

    assert response.status_code == 200
    items = response.json()["data"]["recent_items"]
    assert len(items) == 1
    assert items[0]["task_id"] == task.id
    assert items[0]["status"] == "rejected"
    assert items[0]["status_counts"]["rejected"] == 1


def test_finished_task_is_marked_finished_in_labeler_contributions() -> None:
    db = get_database()
    labeler = User(username="finishedcontriblabeler", email="finished-contrib@example.com", global_role="labeler", email_verified=True)
    task = Task(
        team_id="finished-contrib-team",
        owner_id="owner-1",
        title="Finished contribution task",
        status="finished",
        reward_rule={"mode": "item", "points_per_item": 2, "bundle_options": [1]},
        stats={"total": 1, "claimed": 1, "submitted": 1, "approved": 0, "rejected": 0},
    )
    question = Question(team_id=task.team_id, task_id=task.id, row_index=0, content={"text": "done"}, status="submitted", assigned_to=labeler.id)
    submission = Submission(
        team_id=task.team_id,
        task_id=task.id,
        question_id=question.id,
        labeler_id=labeler.id,
        answers={"answer": "ok"},
        draft={"answer": "ok"},
        status="submitted",
        task_submitted_at=datetime(2026, 5, 31),
    )
    for item in [labeler, task, question, submission]:
        db.add(item)
    db.commit()

    response = client.get("/api/v1/labels/contributions", headers={"Authorization": f"Bearer {access_token(labeler)}"})

    assert response.status_code == 200
    items = response.json()["data"]["recent_items"]
    assert len(items) == 1
    assert items[0]["task_id"] == task.id
    assert items[0]["status"] == "finished"


def test_low_reputation_blocks_claiming_public_task() -> None:
    db = get_database()
    from app.models.profile import ReputationWallet

    labeler = User(username="lowreplabeler", email="low-rep@example.com", global_role="labeler", email_verified=True)
    task = Task(
        team_id="low-rep-team",
        owner_id="owner-1",
        title="Low reputation task",
        status="published",
        reward_rule={"mode": "item", "points_per_item": 2, "bundle_options": [1]},
        stats={"total": 1, "claimed": 0, "submitted": 0, "approved": 0, "rejected": 0},
    )
    question = Question(team_id=task.team_id, task_id=task.id, row_index=0, content={"text": "pending"})
    wallet = ReputationWallet(user_id=labeler.id, score=79)
    for item in [labeler, task, question, wallet]:
        db.add(item)
    db.commit()

    response = client.post(
        f"/api/v1/labels/tasks/{task.id}/claim",
        headers={"Authorization": f"Bearer {access_token(labeler)}"},
        json={"bundle_size": 1},
    )

    assert response.status_code == 422
    assert response.json()["code"] == 42201
    assert "信誉分过低" in response.json()["message"]
    assert db.get(Question, question.id).assigned_to is None


def test_labeler_can_abandon_question_and_release_it_to_marketplace() -> None:
    db = get_database()
    labeler = User(username="abandonlabeler", email="abandon-labeler@example.com", global_role="labeler", email_verified=True)
    task = Task(
        team_id="abandon-team",
        owner_id="owner-1",
        title="Abandon public task",
        status="published",
        difficulty="easy",
        reward_rule={"mode": "item", "points_per_item": 2, "bundle_options": [1]},
        stats={"total": 1, "claimed": 1, "submitted": 0, "approved": 0, "rejected": 0},
    )
    question = Question(team_id=task.team_id, task_id=task.id, row_index=0, content={"text": "release"}, status="claimed", assigned_to=labeler.id)
    submission = Submission(
        team_id=task.team_id,
        task_id=task.id,
        question_id=question.id,
        labeler_id=labeler.id,
        answers={"answer": "draft"},
        draft={"answer": "draft"},
        status="draft",
    )
    for item in [labeler, task, question, submission]:
        db.add(item)
    db.commit()
    headers = {"Authorization": f"Bearer {access_token(labeler)}"}

    response = client.post(f"/api/v1/labels/questions/{question.id}/abandon", headers=headers)

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["question"]["status"] == "pending"
    assert data["question"]["submission"]["status"] == "abandoned"
    assert data["progress"]["abandon_limit"] == 1
    assert data["progress"]["abandon_used"] == 1
    assert data["remaining_items"] == 1
    persisted_question = db.get(Question, question.id)
    persisted_submission = db.get(Submission, submission.id)
    assert persisted_question.status == "pending"
    assert persisted_question.assigned_to is None
    assert persisted_submission.status == "abandoned"
    assert persisted_submission.abandoned_at is not None

    marketplace = client.get("/api/v1/labels/tasks")
    assert marketplace.status_code == 200
    marketplace_task = marketplace.json()["data"]["items"][0]
    assert marketplace_task["task_id"] == task.id
    assert marketplace_task["available_items"] == 1
