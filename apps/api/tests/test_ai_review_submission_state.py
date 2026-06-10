import os
from datetime import datetime, timedelta

os.environ.setdefault("SECRET_KEY", "test-secret-key-with-strong-length")
os.environ.setdefault("MONGODB_URL", "mongomock://localhost")
os.environ.setdefault("MONGODB_DATABASE", "markup_test")

from fastapi.testclient import TestClient

from app.core.database import get_database, reset_database
from app.core.errors import AppError
from app.core.security import generate_object_id, now_utc
from app.main import app
from app.models.ai_review import AiReviewJob
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
        jti_hash=f"ai-review-state-{generate_object_id()}",
        expire_at=now_utc().replace(tzinfo=None) + timedelta(days=30),
    )
    db.add(session)
    db.commit()
    return auth_service.create_access_token(user.id, {"role": user.global_role, "sid": session.id})


def test_manual_ai_review_trigger_rejects_draft_submission_without_creating_job() -> None:
    db = get_database()
    team = Team(company_name="AI Review Submission State Team", owner_user_id="owner-1")
    reviewer = User(username="aireviewstate", email="ai-review-state@example.com", global_role="reviewer", email_verified=True)
    task = Task(
        team_id=team.id,
        owner_id="owner-1",
        title="AI review state task",
        status="published",
        reviewer_ids=[reviewer.id],
        ai_config={"enabled": True, "prompt": "check answer"},
    )
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="claimed")
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id="labeler-1",
        answers={"label": "draft"},
        status="draft",
    )
    for item in [team, reviewer, task, question, submission]:
        db.add(item)
    db.add(TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer", assigned_review_tasks=[task.id]))
    db.commit()

    response = client.post(
        f"/api/v1/ai-reviews/submissions/{submission.id}/trigger",
        headers={"Authorization": f"Bearer {access_token(reviewer)}", "X-Team-ID": team.id},
    )

    assert response.status_code == 409
    assert response.json()["code"] == 40902
    assert db.collection("ai_review_jobs").count_documents({"submission_id": submission.id}) == 0


def test_ai_review_retry_rejects_completed_job_after_submission_left_review() -> None:
    db = get_database()
    team = Team(company_name="AI Review Retry State Team", owner_user_id="owner-1")
    reviewer = User(username="airetryreviewer", email="ai-retry-reviewer@example.com", global_role="reviewer", email_verified=True)
    task = Task(
        team_id=team.id,
        owner_id="owner-1",
        title="AI review retry state task",
        status="published",
        reviewer_ids=[reviewer.id],
        ai_config={"enabled": True, "prompt": "check answer"},
    )
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="approved")
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id="labeler-1",
        answers={"label": "done"},
        status="approved",
        submitted_at=datetime(2026, 5, 31, 12, 0, 0),
        task_submitted_at=datetime(2026, 5, 31, 12, 5, 0),
    )
    job = AiReviewJob(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        submission_id=submission.id,
        labeler_id=submission.labeler_id,
        status="completed",
        idempotency_key=f"submission:{submission.id}:ai-review",
        result={"decision": "pass"},
    )
    for item in [team, reviewer, task, question, submission, job, TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer", assigned_review_tasks=[task.id])]:
        db.add(item)
    db.commit()

    response = client.post(
        f"/api/v1/ai-reviews/tasks/{job.id}/retry",
        headers={"Authorization": f"Bearer {access_token(reviewer)}", "X-Team-ID": team.id},
    )

    assert response.status_code == 409
    assert db.get(AiReviewJob, job.id).status == "completed"


def test_ai_review_process_rejects_job_with_mismatched_submission_scope() -> None:
    from app.services.ai_reviews_service import process_ai_review_job

    db = get_database()
    team = Team(company_name="AI Review Process Scope Team", owner_user_id="owner-1")
    task = Task(team_id=team.id, owner_id="owner-1", title="AI review process scope task", status="published", ai_config={"enabled": True})
    job_question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "job"}, status="submitted")
    submission_question = Question(team_id=team.id, task_id=task.id, row_index=1, content={"text": "submission"}, status="submitted")
    submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=submission_question.id,
        labeler_id="labeler-1",
        answers={"label": "answer"},
        status="submitted",
        submitted_at=datetime(2026, 5, 31, 12, 0, 0),
    )
    job = AiReviewJob(
        team_id=team.id,
        task_id=task.id,
        question_id=job_question.id,
        submission_id=submission.id,
        labeler_id=submission.labeler_id,
        status="pending",
        idempotency_key=f"submission:{submission.id}:ai-review",
    )
    for item in [team, task, job_question, submission_question, submission, job]:
        db.add(item)
    db.commit()

    try:
        process_ai_review_job(db, job_id=job.id)
    except AppError:
        pass
    else:
        raise AssertionError("mismatched AI review job should be rejected before processing")

    persisted_submission = db.get(Submission, submission.id)
    assert persisted_submission.task_submitted_at is None
    assert db.get(AiReviewJob, job.id).status == "pending"


def test_ai_review_task_submissions_exclude_unsubmitted_drafts() -> None:
    db = get_database()
    team = Team(company_name="AI Review Draft List Team", owner_user_id="owner-1")
    reviewer = User(username="aidraftlistreviewer", email="ai-draft-list-reviewer@example.com", global_role="reviewer", email_verified=True)
    task = Task(
        team_id=team.id,
        owner_id="owner-1",
        title="AI review draft list task",
        status="published",
        reviewer_ids=[reviewer.id],
        ai_config={"enabled": True, "provider_id": "provider-1", "model": "review-model", "prompt": "check answer"},
    )
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
        f"/api/v1/ai-reviews/task-overviews/{task.id}/submissions",
        headers={"Authorization": f"Bearer {access_token(reviewer)}", "X-Team-ID": team.id},
    )

    assert response.status_code == 200
    items = response.json()["data"]["items"]
    assert [item["submission_id"] for item in items] == [submitted_submission.id]


def test_ai_review_uploaded_image_uses_public_signed_url_for_provider(monkeypatch) -> None:
    from app.models.resource import AiProviderConfig
    from app.models.upload import UploadedFile
    from app.services import resource_service

    db = get_database()
    team = Team(company_name="AI Review Public Media Team", owner_user_id="owner-1")
    upload = UploadedFile(
        team_id=team.id,
        owner_id="owner-1",
        filename="sample.jpg",
        content_type="image/jpeg",
        category="media",
        path="uploads/team/sample.jpg",
        url="/api/v1/uploads/1234567890abcdef12345678/download",
    )
    upload.id = "1234567890abcdef12345678"
    provider = AiProviderConfig(
        team_id=team.id,
        route_name="Vision compatible",
        provider_kind="OpenAI Compatible",
        model_id="vision-model",
        capability_profile={
            "text": {"enabled": True, "transport_modes": []},
            "image": {
                "enabled": True,
                "transport_modes": ["external_url", "inline_data"],
                "request_part_type": "image_url",
                "options": {"detail": "auto"},
            },
        },
        protocol_profile="openai_compatible_chat",
    )
    db.add(team)
    db.add(upload)
    db.add(provider)
    db.commit()
    monkeypatch.setattr(resource_service.settings, "public_api_base_url", "https://www.markuplabel.cn")

    debug_context = {}
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "review this image"},
                {"type": "image_url", "image_url": {"url": upload.url}, "label": "sample.jpg"},
            ],
        }
    ]

    resolved = resource_service._resolve_provider_accessible_messages(
        db,
        item=provider,
        api_key=None,
        team_id=team.id,
        messages=messages,
        request=None,
        debug_context=debug_context,
    )
    _url, _headers, body = resource_service._provider_messages_request(
        provider,
        "test-key",
        provider.model_id,
        resolved,
        debug_context=debug_context,
    )

    image_part = body["messages"][0]["content"][1]
    image_url = image_part["image_url"]["url"]
    assert image_url.startswith(f"https://www.markuplabel.cn/api/v1/uploads/{upload.id}/playback?token=")
    assert not image_url.startswith("data:image/")
    assert debug_context["media_parts"][0]["transport_mode"] == "external_url"
