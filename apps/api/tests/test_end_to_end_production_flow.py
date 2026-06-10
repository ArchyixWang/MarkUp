import os
from datetime import timedelta

os.environ.setdefault("SECRET_KEY", "test-secret-key-with-strong-length")
os.environ.setdefault("MONGODB_URL", "mongomock://localhost")
os.environ.setdefault("MONGODB_DATABASE", "markup_test")

from fastapi.testclient import TestClient

from app.core.database import get_database, reset_database
from app.core.security import generate_object_id, now_utc
from app.domains.rbac import permissions_for_team_role
from app.main import app
from app.models.audit import AuditLog
from app.models.auth import RefreshSession
from app.models.production import Question, Submission, Task, TaskClaimBundle
from app.models.profile import PointsLedger, PointsWallet
from app.models.resource import TeamPointsBudget, TeamPointsWalletLedger
from app.models.team import TeamMember
from app.models.user import User
from app.services import auth_service

client = TestClient(app)
sent_codes: dict[str, str] = {}


def setup_function() -> None:
    reset_database()
    sent_codes.clear()
    auth_service.send_email_verification_code = lambda email, code, purpose: sent_codes.__setitem__(email, code)


def access_token(user: User) -> str:
    db = get_database()
    session = RefreshSession(
        user_id=user.id,
        jti_hash=f"e2e-production-{generate_object_id()}",
        expire_at=now_utc().replace(tzinfo=None) + timedelta(days=30),
    )
    db.add(session)
    db.commit()
    return auth_service.create_access_token(user.id, {"role": user.global_role, "sid": session.id})


def register_team_admin(email: str) -> tuple[str, dict, dict[str, str]]:
    send_code = client.post("/api/v1/auth/email/send-code", json={"email": email, "purpose": "register"})
    assert send_code.status_code == 200
    registered = client.post(
        "/api/v1/auth/register/admin",
        json={"display_name": "E2E Admin", "username": "e2eadmin", "email": email, "password": "SecurePass123!", "email_code": sent_codes[email]},
    )
    assert registered.status_code == 200
    login = client.post("/api/v1/auth/login", json={"account": email, "password": "SecurePass123!"})
    assert login.status_code == 200
    token = login.json()["data"]["access_token"]
    team = client.post("/api/v1/teams", headers={"Authorization": f"Bearer {token}"}, json={"company_name": "E2E Production Flow Team"})
    assert team.status_code == 200
    team_data = team.json()["data"]
    headers = {"Authorization": f"Bearer {token}", "X-Team-ID": team_data["team_id"]}
    return token, team_data, headers


def add_team_member(*, team_id: str, username: str, email: str, global_role: str, team_role: str) -> User:
    db = get_database()
    user = User(username=username, email=email, global_role=global_role, email_verified=True)
    db.add(user)
    db.add(
        TeamMember(
            team_id=team_id,
            user_id=user.id,
            team_role=team_role,
            permissions=permissions_for_team_role(team_role),
        )
    )
    db.commit()
    return user


def test_dataset_template_task_label_review_points_long_workflow() -> None:
    _admin_token, team, admin_headers = register_team_admin("e2e-production-admin@example.com")
    team_id = team["team_id"]
    reviewer = add_team_member(team_id=team_id, username="e2ereviewer", email="e2e-reviewer@example.com", global_role="reviewer", team_role="reviewer")
    labeler = add_team_member(team_id=team_id, username="e2elabeler", email="e2e-labeler@example.com", global_role="labeler", team_role="labeler")

    db = get_database()
    db.add(TeamPointsBudget(team_id=team_id, total_points=100, current_balance=100, spent_points_total=0))
    db.commit()

    dataset = client.post(
        "/api/v1/datasets",
        headers=admin_headers,
        data={"name": "长链路数据集", "description": "任务长链路测试数据"},
        files=[("file", ("items.csv", "title,body\n合同条款A,请判断是否属于付款条款\n合同条款B,请判断是否属于风险条款\n", "text/csv"))],
    )
    assert dataset.status_code == 200
    dataset_data = dataset.json()["data"]
    assert dataset_data["row_count"] == 2

    schema = {
        "schema_version": "1.1",
        "tabs": [
            {
                "id": "materials",
                "title": "材料",
                "components": [
                    {"id": "show_title", "type": "ShowItem", "field": "show_title", "label": "标题", "required": False, "config": {}, "options": [], "version": "1.0"},
                    {"id": "show_body", "type": "ShowItem", "field": "show_body", "label": "正文", "required": False, "config": {}, "options": [], "version": "1.0"},
                ],
            },
            {
                "id": "answers",
                "title": "答案",
                "components": [
                    {
                        "id": "intent",
                        "type": "SingleSelect",
                        "field": "intent",
                        "label": "条款类型",
                        "required": True,
                        "config": {},
                        "options": [{"value": "payment", "label": "付款"}, {"value": "risk", "label": "风险"}],
                        "version": "1.0",
                    },
                    {"id": "reason", "type": "TextArea", "field": "reason", "label": "判断理由", "required": True, "config": {}, "options": [], "version": "1.0"},
                ],
            },
        ],
        "components": [],
        "validation_rules": {},
        "linkage_rules": [],
        "llm_config": {},
    }
    template = client.post("/api/v1/templates", headers=admin_headers, json={"name": "长链路审核模板", "description": "展示字段 + 人工答案", "schema": schema})
    assert template.status_code == 200
    template_id = template.json()["data"]["template_id"]
    readiness = client.get(f"/api/v1/templates/{template_id}/readiness", headers=admin_headers)
    assert readiness.status_code == 200
    assert readiness.json()["data"]["ready"] is True
    published_template = client.post(f"/api/v1/templates/{template_id}/publish", headers=admin_headers)
    assert published_template.status_code == 200
    assert published_template.json()["data"]["status"] == "published"

    task = client.post(
        "/api/v1/tasks",
        headers=admin_headers,
        json={
            "title": "长链路生产任务",
            "description": "从数据集到审核积分的状态流转",
            "category": "text",
            "difficulty": "easy",
            "distribution": "quota_grab",
            "quota": 2,
            "reward_rule": {"mode": "item", "points_per_item": 5},
            "reviewer_ids": [reviewer.id],
            "claim_config": {"completion_hours": 24, "deadline_mode": "long_term", "labeling_ai_assist_percent": 0},
            "template_id": template_id,
            "dataset_id": dataset_data["dataset_id"],
            "column_mapping": {"show_title": "title", "show_body": "body"},
            "mapping_config": {},
            "ai_config": {"enabled": False},
        },
    )
    assert task.status_code == 200
    task_id = task.json()["data"]["task_id"]
    assert task.json()["data"]["status"] == "draft"
    assert db.collection("questions").count_documents({"task_id": task_id, "status": "pending"}) == 2

    task_readiness = client.get(f"/api/v1/tasks/{task_id}/readiness", headers=admin_headers)
    assert task_readiness.status_code == 200
    assert task_readiness.json()["data"]["ready"] is True
    published_task = client.post(f"/api/v1/tasks/{task_id}/publish", headers=admin_headers)
    assert published_task.status_code == 200
    assert published_task.json()["data"]["status"] == "published"

    labeler_headers = {"Authorization": f"Bearer {access_token(labeler)}", "X-Team-ID": team_id}
    public_tasks = client.get("/api/v1/labels/tasks", headers=labeler_headers)
    assert public_tasks.status_code == 200
    assert any(item["task_id"] == task_id for item in public_tasks.json()["data"]["items"])

    claim = client.post(f"/api/v1/labels/tasks/{task_id}/claim", headers=labeler_headers, json={"bundle_size": 2})
    assert claim.status_code == 200, claim.json()
    bundle_id = claim.json()["data"]["bundle_id"]
    assert db.get(TaskClaimBundle, bundle_id) is not None
    claimed_questions = db.find(Question, {"task_id": task_id, "assigned_to": labeler.id}, sort=[("row_index", 1)])
    assert len(claimed_questions) == 2
    assert all(question.status == "claimed" for question in claimed_questions)
    assert {question.claim_bundle_id for question in claimed_questions} == {bundle_id}
    draft_submissions = db.find(Submission, {"task_id": task_id, "labeler_id": labeler.id}, sort=[("question_id", 1)])
    assert len(draft_submissions) == 2
    assert {submission.status for submission in draft_submissions} == {"draft"}

    for index, question in enumerate(claimed_questions):
        submitted = client.post(
            f"/api/v1/labels/questions/{question.id}/submit",
            headers=labeler_headers,
            json={"answers": {"intent": "payment" if index == 0 else "risk", "reason": f"第 {index + 1} 条文本判断依据"}},
        )
        assert submitted.status_code == 200
        assert submitted.json()["data"]["status"] == "submitted"
    completed = client.post(f"/api/v1/labels/tasks/{task_id}/complete", headers=labeler_headers)
    assert completed.status_code == 200
    submitted_submissions = db.find(Submission, {"task_id": task_id, "labeler_id": labeler.id}, sort=[("question_id", 1)])
    assert len(submitted_submissions) == 2
    assert {submission.status for submission in submitted_submissions} == {"submitted"}
    assert all(submission.task_submitted_at is not None for submission in submitted_submissions)

    reviewer_headers = {"Authorization": f"Bearer {access_token(reviewer)}", "X-Team-ID": team_id}
    review_queue = client.get("/api/v1/reviews/queue", headers=reviewer_headers)
    assert review_queue.status_code == 200
    queue_items = review_queue.json()["data"]["items"]
    assert {item["submission_id"] for item in queue_items} == {submission.id for submission in submitted_submissions}

    first_approval = client.post(
        f"/api/v1/reviews/submissions/{submitted_submissions[0].id}",
        headers=reviewer_headers,
        json={"decision": "approved", "comment": "第一条答案与原文一致"},
    )
    assert first_approval.status_code == 200
    assert first_approval.json()["data"]["submission"]["status"] == "approved"
    assert db.find_one(PointsWallet, {"user_id": labeler.id}) is None

    second_approval = client.post(
        f"/api/v1/reviews/submissions/{submitted_submissions[1].id}",
        headers=reviewer_headers,
        json={"decision": "approved", "comment": "第二条答案与原文一致"},
    )
    assert second_approval.status_code == 200
    assert second_approval.json()["data"]["submission"]["status"] == "approved"

    task_model = db.get(Task, task_id)
    assert task_model is not None
    approved_questions = db.find(Question, {"task_id": task_id, "assigned_to": labeler.id}, sort=[("row_index", 1)])
    approved_submissions = db.find(Submission, {"task_id": task_id, "labeler_id": labeler.id}, sort=[("question_id", 1)])
    assert len(approved_questions) == 2
    assert len(approved_submissions) == 2
    assert {question.status for question in approved_questions} == {"approved"}
    assert {submission.status for submission in approved_submissions} == {"approved"}
    assert task_model.stats["approved"] == 2
    assert task_model.stats["submitted"] == 0

    wallet = db.find_one(PointsWallet, {"user_id": labeler.id})
    assert wallet is not None
    assert wallet.available_points == 10
    assert wallet.total_points == 10
    labeler_ledgers = db.find(PointsLedger, {"user_id": labeler.id, "source_type": "submission_review"})
    assert len(labeler_ledgers) == 2
    assert sum(item.change for item in labeler_ledgers) == 10

    budget = db.find_one(TeamPointsBudget, {"team_id": team_id})
    assert budget is not None
    assert budget.current_balance == 88
    assert budget.spent_points_total == 12
    reward_spends = db.find(TeamPointsWalletLedger, {"team_id": team_id, "transaction_type": "reward_spend"})
    service_fees = db.find(TeamPointsWalletLedger, {"team_id": team_id, "transaction_type": "platform_service_fee"})
    assert len(reward_spends) == 2
    assert sum(item.amount for item in reward_spends) == 10
    assert len(service_fees) == 2
    assert sum(item.amount for item in service_fees) == 2

    audit_actions = {log.action for log in db.find(AuditLog, {"team_id": team_id})}
    assert {"dataset_imported", "template_published", "task_published", "task_bundle_claimed", "submission_submitted", "labeling_task_completed", "submission_reviewed"}.issubset(audit_actions)
