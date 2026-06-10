import os
from datetime import datetime, timedelta

os.environ.setdefault("SECRET_KEY", "test-secret-key-with-strong-length")
os.environ.setdefault("MONGODB_URL", "mongomock://localhost")
os.environ.setdefault("MONGODB_DATABASE", "markup_test")

from fastapi.testclient import TestClient

from app.core.database import get_database, reset_database
from app.core.security import generate_object_id, now_utc
from app.models.auth import RefreshSession
from app.models.production import Question, Submission, Task, TaskClaimBundle
from app.models.profile import PointsLedger, PointsWallet, ReputationLedger, ReputationWallet
from app.models.resource import TeamPointsBudget, TeamPointsWalletLedger
from app.models.team import Team, TeamMember
from app.models.user import User
from app.main import app
from app.services import auth_service

client = TestClient(app)


def access_token(user: User) -> str:
    db = get_database()
    session = RefreshSession(
        user_id=user.id,
        jti_hash=f"review-task-reward-{generate_object_id()}",
        expire_at=now_utc().replace(tzinfo=None) + timedelta(days=30),
    )
    db.add(session)
    db.commit()
    return auth_service.create_access_token(user.id, {"role": user.global_role, "sid": session.id})


def setup_function() -> None:
    reset_database()


def test_task_total_points_are_settled_as_per_question_share() -> None:
    db = get_database()
    team = Team(company_name="Task Total Reward Team", owner_user_id="owner-1")
    reviewer = User(username="tasktotalreviewer", email="task-total-reviewer@example.com", global_role="reviewer", email_verified=True)
    task = Task(
        team_id=team.id,
        owner_id="owner-1",
        title="Task total reward",
        status="published",
        reviewer_ids=[reviewer.id],
        reward_rule={"mode": "task", "total_points": 20},
        stats={"total": 2, "claimed": 1, "submitted": 1, "approved": 0, "rejected": 0},
    )
    submitted_question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="submitted")
    pending_question = Question(team_id=team.id, task_id=task.id, row_index=1, content={"text": "B"}, status="pending")
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=submitted_question.id,
        labeler_id="labeler-total-reward",
        answers={"answer": "ok"},
        draft={"answer": "ok"},
        status="submitted",
    )
    db.add(team)
    db.add(reviewer)
    db.add(TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer", assigned_review_tasks=[task.id]))
    db.add(TeamPointsBudget(team_id=team.id, total_points=100, current_balance=100, spent_points_total=0))
    for item in [task, submitted_question, pending_question, submission]:
        db.add(item)
    db.commit()

    response = client.post(
        f"/api/v1/reviews/submissions/{submission.id}",
        headers={"Authorization": f"Bearer {access_token(reviewer)}", "X-Team-ID": team.id},
        json={"decision": "approved", "comment": "ok"},
    )

    assert response.status_code == 200
    wallet = db.find_one(PointsWallet, {"user_id": "labeler-total-reward"})
    assert wallet is not None
    assert wallet.available_points == 10
    assert wallet.total_points == 10
    ledger = db.find_one(PointsLedger, {"user_id": "labeler-total-reward", "source_type": "submission_review", "source_id": submission.id})
    assert ledger is not None
    assert ledger.change == 10
    team_ledger = db.find_one(TeamPointsWalletLedger, {"team_id": team.id, "source_type": "submission_review", "source_id": submission.id})
    assert team_ledger is not None
    assert team_ledger.amount == 10


def test_claim_bundle_settles_only_after_all_bundle_items_are_processed() -> None:
    db = get_database()
    team = Team(company_name="Bundle Settlement Team", owner_user_id="owner-1")
    reviewer = User(username="bundlereviewer", email="bundle-reviewer@example.com", global_role="reviewer", email_verified=True)
    labeler = User(username="bundlelabeler", email="bundle-labeler@example.com", global_role="labeler", email_verified=True)
    bundle = TaskClaimBundle(team_id=team.id, task_id="bundle-task", labeler_id=labeler.id, question_ids=[], bundle_size=2, reward_points_total=10)
    task = Task(
        id=bundle.task_id,
        team_id=team.id,
        owner_id="owner-1",
        title="Bundle reward task",
        status="published",
        reviewer_ids=[reviewer.id],
        reward_rule={"mode": "item", "points_per_item": 5},
        stats={"total": 2, "claimed": 2, "submitted": 2, "approved": 0, "rejected": 0},
    )
    questions = [
        Question(team_id=team.id, task_id=task.id, row_index=index, content={"text": f"Q{index}"}, status="submitted", assigned_to=labeler.id, claim_bundle_id=bundle.id)
        for index in range(2)
    ]
    bundle.question_ids = [question.id for question in questions]
    submissions = [
        Submission(
            team_id=team.id,
            task_id=task.id,
            question_id=question.id,
            labeler_id=labeler.id,
            claim_bundle_id=bundle.id,
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
        TeamPointsBudget(team_id=team.id, total_points=100, current_balance=100, spent_points_total=0),
        task,
        bundle,
        *questions,
        *submissions,
    ]:
        db.add(item)
    db.commit()

    first = client.post(
        f"/api/v1/reviews/submissions/{submissions[0].id}",
        headers={"Authorization": f"Bearer {access_token(reviewer)}", "X-Team-ID": team.id},
        json={"decision": "approved", "comment": "first approved"},
    )

    assert first.status_code == 200
    assert db.find_one(PointsLedger, {"user_id": labeler.id, "source_type": "submission_review", "source_id": submissions[0].id}) is None
    assert db.find_one(PointsWallet, {"user_id": labeler.id}) is None
    assert db.find_one(TeamPointsBudget, {"team_id": team.id}).current_balance == 100

    second = client.post(
        f"/api/v1/reviews/submissions/{submissions[1].id}",
        headers={"Authorization": f"Bearer {access_token(reviewer)}", "X-Team-ID": team.id},
        json={"decision": "approved", "comment": "second approved"},
    )

    assert second.status_code == 200
    wallet = db.find_one(PointsWallet, {"user_id": labeler.id})
    assert wallet is not None
    assert wallet.available_points == 10
    assert db.find_one(PointsLedger, {"user_id": labeler.id, "source_type": "submission_review", "source_id": submissions[0].id}) is not None
    assert db.find_one(PointsLedger, {"user_id": labeler.id, "source_type": "submission_review", "source_id": submissions[1].id}) is not None
    team_budget = db.find_one(TeamPointsBudget, {"team_id": team.id})
    assert team_budget is not None
    assert team_budget.current_balance == 88
    assert team_budget.spent_points_total == 12
    persisted_bundle = db.get(TaskClaimBundle, bundle.id)
    assert persisted_bundle is not None
    assert persisted_bundle.status == "settled"


def test_final_reject_completes_bundle_and_settles_only_approved_items() -> None:
    db = get_database()
    team = Team(company_name="Bundle Final Reject Team", owner_user_id="owner-1")
    reviewer = User(username="bundlefinalreviewer", email="bundle-final-reviewer@example.com", global_role="reviewer", email_verified=True)
    labeler = User(username="bundlefinallabeler", email="bundle-final-labeler@example.com", global_role="labeler", email_verified=True)
    bundle = TaskClaimBundle(team_id=team.id, task_id="bundle-final-task", labeler_id=labeler.id, question_ids=[], bundle_size=2, reward_points_total=10)
    task = Task(
        id=bundle.task_id,
        team_id=team.id,
        owner_id="owner-1",
        title="Bundle final reject task",
        status="published",
        deadline="2099-01-01",
        reviewer_ids=[reviewer.id],
        reward_rule={"mode": "item", "points_per_item": 5},
        stats={"total": 2, "claimed": 2, "submitted": 1, "approved": 1, "rejected": 0},
    )
    approved_question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "Q0"}, status="approved", assigned_to=labeler.id, claim_bundle_id=bundle.id)
    final_reject_question = Question(team_id=team.id, task_id=task.id, row_index=1, content={"text": "Q1"}, status="submitted", assigned_to=labeler.id, claim_bundle_id=bundle.id)
    bundle.question_ids = [approved_question.id, final_reject_question.id]
    approved_submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=approved_question.id,
        labeler_id=labeler.id,
        claim_bundle_id=bundle.id,
        answers={"answer": "ok"},
        draft={"answer": "ok"},
        status="approved",
        current_round=1,
        task_submitted_at=datetime(2026, 5, 31),
    )
    final_reject_submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=final_reject_question.id,
        labeler_id=labeler.id,
        claim_bundle_id=bundle.id,
        answers={"answer": "bad"},
        draft={"answer": "bad"},
        status="submitted",
        current_round=3,
        task_submitted_at=datetime(2026, 5, 31),
    )
    for item in [
        team,
        reviewer,
        labeler,
        TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer", assigned_review_tasks=[task.id]),
        TeamPointsBudget(team_id=team.id, total_points=100, current_balance=100, spent_points_total=0),
        ReputationWallet(user_id=labeler.id, score=100),
        task,
        bundle,
        approved_question,
        final_reject_question,
        approved_submission,
        final_reject_submission,
    ]:
        db.add(item)
    db.commit()

    response = client.post(
        f"/api/v1/reviews/submissions/{final_reject_submission.id}",
        headers={"Authorization": f"Bearer {access_token(reviewer)}", "X-Team-ID": team.id},
        json={"decision": "rejected", "comment": "final reject"},
    )

    assert response.status_code == 200
    wallet = db.find_one(PointsWallet, {"user_id": labeler.id})
    assert wallet is not None
    assert wallet.available_points == 5
    assert db.find_one(PointsLedger, {"user_id": labeler.id, "source_type": "submission_review", "source_id": approved_submission.id}) is not None
    assert db.find_one(PointsLedger, {"user_id": labeler.id, "source_type": "submission_review", "source_id": final_reject_submission.id}) is None
    team_budget = db.find_one(TeamPointsBudget, {"team_id": team.id})
    assert team_budget is not None
    assert team_budget.current_balance == 94
    assert team_budget.spent_points_total == 6


def test_approved_submission_points_are_backfilled_for_labeler_points_page() -> None:
    db = get_database()
    labeler = User(username="pointsbackfilllabeler", email="points-backfill@example.com", global_role="labeler", email_verified=True)
    team = Team(company_name="Points Backfill Team", owner_user_id="owner-1")
    task = Task(
        team_id=team.id,
        owner_id="owner-1",
        title="Backfill reward task",
        status="published",
        reward_rule={"mode": "item", "points_per_item": 7},
        stats={"total": 1, "claimed": 1, "submitted": 1, "approved": 1, "rejected": 0},
    )
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="approved", assigned_to=labeler.id)
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id=labeler.id,
        answers={"answer": "ok"},
        draft={"answer": "ok"},
        status="approved",
    )
    for item in [labeler, team, task, question, submission]:
        db.add(item)
    db.commit()

    response = client.get("/api/v1/profile/points", headers={"Authorization": f"Bearer {access_token(labeler)}"})

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["wallet"]["available_points"] == 7
    assert data["items"][0]["change"] == 7
    assert db.find_one(PointsLedger, {"user_id": labeler.id, "source_type": "submission_review", "source_id": submission.id}) is not None


def test_review_queue_stage_filter_uses_submission_round() -> None:
    db = get_database()
    team = Team(company_name="Review Stage Team", owner_user_id="owner-1")
    reviewer = User(username="stagereviewer", email="stage-reviewer@example.com", global_role="reviewer", email_verified=True)
    task = Task(
        team_id=team.id,
        owner_id="owner-1",
        title="Stage review task",
        status="published",
        reviewer_ids=[reviewer.id],
        reward_rule={"mode": "item", "points_per_item": 1},
    )
    questions = [
        Question(team_id=team.id, task_id=task.id, row_index=index, content={"text": f"Q{index}"}, status="submitted")
        for index in range(3)
    ]
    submissions = [
        Submission(team_id=team.id, task_id=task.id, question_id=questions[0].id, labeler_id="labeler-1", status="submitted", current_round=1, task_submitted_at=datetime(2026, 5, 31)),
        Submission(team_id=team.id, task_id=task.id, question_id=questions[1].id, labeler_id="labeler-1", status="submitted", current_round=2, task_submitted_at=datetime(2026, 5, 31)),
        Submission(team_id=team.id, task_id=task.id, question_id=questions[2].id, labeler_id="labeler-1", status="submitted", current_round=3, task_submitted_at=datetime(2026, 5, 31)),
    ]
    db.add(team)
    db.add(reviewer)
    db.add(TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer", assigned_review_tasks=[task.id]))
    db.add(task)
    for item in [*questions, *submissions]:
        db.add(item)
    db.commit()
    headers = {"Authorization": f"Bearer {access_token(reviewer)}", "X-Team-ID": team.id}

    all_stage = client.get("/api/v1/reviews/queue?stage=all_stages", headers=headers)
    initial = client.get("/api/v1/reviews/queue?stage=initial_review", headers=headers)
    re_review = client.get("/api/v1/reviews/queue?stage=re_review", headers=headers)
    final = client.get("/api/v1/reviews/queue?stage=final_review", headers=headers)

    assert all_stage.status_code == 200
    assert all_stage.json()["data"]["summary"]["pending"] == 3
    assert [item["current_round"] for item in initial.json()["data"]["items"]] == [1]
    assert [item["current_round"] for item in re_review.json()["data"]["items"]] == [2]
    assert [item["current_round"] for item in final.json()["data"]["items"]] == [3]



def test_final_reject_releases_question_and_deducts_reputation() -> None:
    db = get_database()
    team = Team(company_name="Final Reject Reputation Team", owner_user_id="owner-1")
    reviewer = User(username="finalrejectreviewer", email="final-reject-reviewer@example.com", global_role="reviewer", email_verified=True)
    labeler = User(username="finalrejectlabeler", email="final-reject-labeler@example.com", global_role="labeler", email_verified=True)
    task = Task(
        team_id=team.id,
        owner_id="owner-1",
        title="Final reject task",
        status="published",
        deadline="2099-01-01",
        reviewer_ids=[reviewer.id],
        reward_rule={"mode": "item", "points_per_item": 1},
        stats={"total": 1, "claimed": 1, "submitted": 1, "approved": 0, "rejected": 0},
    )
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "bad"}, status="submitted", assigned_to=labeler.id)
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id=labeler.id,
        answers={"answer": "bad"},
        draft={"answer": "bad"},
        status="submitted",
        current_round=3,
        task_submitted_at=datetime(2026, 5, 31),
    )
    for item in [team, reviewer, labeler, task, question, submission, TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer", assigned_review_tasks=[task.id]), ReputationWallet(user_id=labeler.id, score=100)]:
        db.add(item)
    db.commit()

    response = client.post(
        f"/api/v1/reviews/submissions/{submission.id}",
        headers={"Authorization": f"Bearer {access_token(reviewer)}", "X-Team-ID": team.id},
        json={"decision": "rejected", "comment": "终审仍不合格"},
    )

    assert response.status_code == 200
    persisted_question = db.get(Question, question.id)
    assert persisted_question.status == "pending"
    assert persisted_question.assigned_to is None
    marketplace = client.get("/api/v1/labels/tasks")
    assert marketplace.status_code == 200
    marketplace_items = marketplace.json()["data"]["items"]
    assert any(item["task_id"] == task.id and item["available_items"] == 1 for item in marketplace_items)
    wallet = db.find_one(ReputationWallet, {"user_id": labeler.id})
    assert wallet.score == 95
    ledger = db.find_one(ReputationLedger, {"user_id": labeler.id, "source_type": "final_reject", "source_id": submission.id})
    assert ledger is not None
    assert ledger.change == -5


def test_final_reject_long_term_task_returns_question_to_marketplace() -> None:
    db = get_database()
    team = Team(company_name="Final Reject Long Term Team", owner_user_id="owner-1")
    reviewer = User(username="longtermreviewer", email="longterm-reviewer@example.com", global_role="reviewer", email_verified=True)
    labeler = User(username="longtermlabeler", email="longterm-labeler@example.com", global_role="labeler", email_verified=True)
    task = Task(
        team_id=team.id,
        owner_id="owner-1",
        title="Long term final reject task",
        status="published",
        deadline="2020-01-01",
        claim_config={"deadline_mode": "long_term"},
        reviewer_ids=[reviewer.id],
        reward_rule={"mode": "item", "points_per_item": 1},
        stats={"total": 1, "claimed": 1, "submitted": 1, "approved": 0, "rejected": 0},
    )
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "bad"}, status="submitted", assigned_to=labeler.id)
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id=labeler.id,
        answers={"answer": "bad"},
        draft={"answer": "bad"},
        status="submitted",
        current_round=3,
        task_submitted_at=datetime(2026, 5, 31),
    )
    for item in [team, reviewer, labeler, task, question, submission, TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer", assigned_review_tasks=[task.id]), ReputationWallet(user_id=labeler.id, score=100)]:
        db.add(item)
    db.commit()

    response = client.post(
        f"/api/v1/reviews/submissions/{submission.id}",
        headers={"Authorization": f"Bearer {access_token(reviewer)}", "X-Team-ID": team.id},
        json={"decision": "rejected", "comment": "长期有效任务终审不合格"},
    )

    assert response.status_code == 200
    persisted_question = db.get(Question, question.id)
    assert persisted_question.status == "pending"
    assert persisted_question.assigned_to is None
    marketplace = client.get("/api/v1/labels/tasks")
    assert marketplace.status_code == 200
    assert any(item["task_id"] == task.id and item["deadline_mode"] == "long_term" and item["available_items"] == 1 for item in marketplace.json()["data"]["items"])
