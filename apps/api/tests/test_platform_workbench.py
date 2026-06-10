import os
from datetime import datetime

os.environ.setdefault("SECRET_KEY", "test-secret-key-with-strong-length")
os.environ.setdefault("MONGODB_URL", "mongomock://localhost")
os.environ.setdefault("MONGODB_DATABASE", "markup_test")

from fastapi.testclient import TestClient

from app.core.database import get_database, reset_database
from app.core.security import generate_object_id
from app.models.auth import RefreshSession
from app.models.platform import PlatformFinanceLedger
from app.models.profile import PointsLedger, PointsWallet
from app.models.production import Question, Submission, Task
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
        jti_hash=f"platform-test-{generate_object_id()}",
        expire_at=datetime(2030, 6, 1),
    )
    db.add(session)
    db.commit()
    return auth_service.create_access_token(user.id, {"role": user.global_role, "sid": session.id})


def setup_function() -> None:
    reset_database()


def test_platform_workbench_requires_platform_permission() -> None:
    db = get_database()
    admin = User(username="platformadmin", email="platform@example.com", global_role="platform_admin", email_verified=True)
    normal = User(username="normaluser", email="normal@example.com", global_role="user", email_verified=True)
    db.add(admin)
    db.add(normal)
    db.add(
        PlatformFinanceLedger(
            transaction_type="commission_income",
            source_type="submission_review",
            source_id="submission-trend-1",
            reward_points=50,
            amount_points=5,
            status="completed",
        )
    )

    forbidden = client.get("/api/v1/platform/workbench", headers={"Authorization": f"Bearer {access_token(normal)}"})
    assert forbidden.status_code == 403

    allowed = client.get("/api/v1/platform/workbench", headers={"Authorization": f"Bearer {access_token(admin)}"})
    assert allowed.status_code == 200
    data = allowed.json()["data"]
    assert data["commission_setting"]["commission_rate_bps"] == 1000
    assert data["unit_hint"] == "1 积分 = 1 元"
    assert len(data["settlement_trend"]) == 30
    assert data["summary"]["month_commission_points"] == 5
    assert data["settlement_trend"][-1]["commission_points"] == 5
    assert data["settlement_trend"][-1]["commission_yuan"] == 5


def test_review_approval_settles_reward_and_platform_commission() -> None:
    db = get_database()
    team = Team(company_name="Commission Team", owner_user_id="owner-1")
    reviewer = User(username="reviewer1", email="reviewer1@example.com", global_role="reviewer", email_verified=True)
    labeler = User(username="labeler1", email="labeler1@example.com", global_role="labeler", email_verified=True)
    db.add(team)
    db.add(reviewer)
    db.add(labeler)
    db.add(TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer", assigned_review_tasks=["task-commission"]))
    db.add(TeamPointsBudget(team_id=team.id, total_points=100, current_balance=100))
    task = Task(id="task-commission", team_id=team.id, owner_id="owner-1", title="抽佣任务", status="published", reward_rule={"mode": "item", "points_per_item": 10}, stats={"total": 1})
    question = Question(team_id=team.id, task_id=task.id, row_index=1, content={"text": "q"}, status="submitted", assigned_to=labeler.id)
    submission = Submission(team_id=team.id, task_id=task.id, question_id=question.id, labeler_id=labeler.id, answers={"a": "b"}, draft={"a": "b"}, status="submitted")
    db.add(task)
    db.add(question)
    db.add(submission)

    response = client.post(
        f"/api/v1/reviews/submissions/{submission.id}",
        headers={"Authorization": f"Bearer {access_token(reviewer)}", "X-Team-ID": team.id},
        json={"decision": "approved"},
    )

    assert response.status_code == 200
    wallet = db.find_one(PointsWallet, {"user_id": labeler.id})
    assert wallet is not None
    assert wallet.available_points == 10
    budget = db.find_one(TeamPointsBudget, {"team_id": team.id})
    assert budget is not None
    assert budget.current_balance == 89
    ledgers = db.find(TeamPointsWalletLedger, {"team_id": team.id})
    assert any(item.transaction_type == "reward_spend" and item.amount == 10 for item in ledgers)
    assert any(item.transaction_type == "platform_service_fee" and item.amount == 1 for item in ledgers)
    commission = db.find_one(PlatformFinanceLedger, {"source_id": submission.id})
    assert commission is not None
    assert commission.amount_points == 1
    assert commission.reward_points == 10


def test_profile_withdrawal_is_completed_immediately() -> None:
    db = get_database()
    labeler = User(username="withdrawer", email="withdrawer@example.com", global_role="labeler", email_verified=True)
    db.add(labeler)
    db.add(PointsWallet(user_id=labeler.id, total_points=50, available_points=50))

    created = client.post(
        "/api/v1/profile/points/withdraw",
        headers={"Authorization": f"Bearer {access_token(labeler)}"},
        json={"amount": 20, "payout_method": "alipay", "account_no": "labeler-pay", "account_name": "Labeler"},
    )
    assert created.status_code == 200
    data = created.json()["data"]
    request_id = data["request_id"]
    assert data["status"] == "approved"
    assert data["review_comment"] == "余额校验通过，系统自动完成提现"

    wallet = db.find_one(PointsWallet, {"user_id": labeler.id})
    assert wallet is not None
    assert wallet.available_points == 30
    ledger = db.find_one(PointsLedger, {"source_type": "platform_payment_request", "source_id": request_id})
    assert ledger is not None
    assert ledger.change == -20


def test_platform_reviews_team_verification() -> None:
    db = get_database()
    admin = User(username="verifyadmin", email="verifyadmin@example.com", global_role="platform_admin", email_verified=True)
    team = Team(
        company_name="Verify Team",
        owner_user_id="owner-1",
        verification_status="pending_review",
        legal_name="Verify Legal",
        registration_number="913000000000000000",
        verification_contact="张三",
        verification_phone="13800000000",
        verification_materials=["file-1"],
    )
    db.add(admin)
    db.add(team)

    response = client.post(
        f"/api/v1/platform/teams/{team.id}/verification/review",
        headers={"Authorization": f"Bearer {access_token(admin)}"},
        json={"decision": "approved", "comment": "材料通过"},
    )

    assert response.status_code == 200
    assert response.json()["data"]["verification_status"] == "verified"
    assert db.get(Team, team.id).verification_status == "verified"
