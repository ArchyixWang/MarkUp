import os
from datetime import datetime, timedelta

os.environ.setdefault("SECRET_KEY", "test-secret-key-with-strong-length")
os.environ.setdefault("MONGODB_URL", "mongomock://localhost")
os.environ.setdefault("MONGODB_DATABASE", "markup_test")

from fastapi.testclient import TestClient

from app.core.database import get_database, remove_legacy_inline_storage, reset_database
from app.core.security import generate_object_id, now_utc
from app.models.auth import RefreshSession
from app.models.notification import Notification
from app.models.platform import PlatformSetting
from app.models.production import Dataset, Question, Submission, Task
from app.models.team import Team, TeamMember
from app.models.user import User
from app.main import app
from app.services import auth_service
from app.services import upload_service
from app.services.file_storage import read_storage_file

client = TestClient(app)


def access_token(user: User) -> str:
    db = get_database()
    session = RefreshSession(
        user_id=user.id,
        jti_hash=f"export-notify-upload-{generate_object_id()}",
        expire_at=now_utc().replace(tzinfo=None) + timedelta(days=30),
    )
    db.add(session)
    db.commit()
    return auth_service.create_access_token(user.id, {"role": user.global_role, "sid": session.id})


def setup_function() -> None:
    reset_database()


def test_init_cleanup_removes_legacy_inline_storage_records_without_touching_filesystem_records() -> None:
    db = get_database()
    team = Team(company_name="Legacy Inline Cleanup Team", owner_user_id="owner-1")
    owner = User(username="legacycleanupowner", email="legacy-cleanup-owner@example.com", global_role="user", email_verified=True)
    clean_dataset = Dataset(team_id=team.id, owner_id=owner.id, name="Clean dataset", rows=[{"image_url": "/api/v1/uploads/clean/download"}], row_count=1)
    inline_dataset = Dataset(team_id=team.id, owner_id=owner.id, name="Inline dataset", rows=[{"image_url": "data:image/png;base64,AAAA"}], row_count=1)
    for item in [team, owner, clean_dataset, inline_dataset]:
        db.add(item)
    db.collection("uploaded_files").insert_many(
        [
            {"_id": "legacy-upload", "team_id": team.id, "filename": "old.png", "storage": "mongo", "url": "data:image/png;base64,AAAA", "content_base64": "AAAA"},
            {"_id": "clean-upload", "team_id": team.id, "filename": "new.png", "storage": "filesystem", "path": "uploads/team/new.png", "url": "/api/v1/uploads/clean-upload/download"},
        ]
    )
    db.collection("export_jobs").insert_many(
        [
            {"_id": "legacy-export", "team_id": team.id, "task_id": "task-1", "status": "completed", "file_content": "AAAA"},
            {"_id": "clean-export", "team_id": team.id, "task_id": "task-1", "status": "completed", "storage": "filesystem", "path": "exports/team/clean.json"},
        ]
    )

    remove_legacy_inline_storage(db)

    assert db.collection("uploaded_files").find_one({"_id": "legacy-upload"}) is None
    assert db.collection("uploaded_files").find_one({"_id": "clean-upload"}) is not None
    assert db.collection("export_jobs").find_one({"_id": "legacy-export"}) is None
    assert db.collection("export_jobs").find_one({"_id": "clean-export"}) is not None
    assert db.collection("datasets").find_one({"_id": inline_dataset.id}) is None
    assert db.collection("datasets").find_one({"_id": clean_dataset.id}) is not None


def test_export_defaults_to_approved_rows_only() -> None:
    db = get_database()
    team = Team(company_name="Default Export Scope Team", owner_user_id="owner-1")
    owner = User(username="defaultexportowner", email="default-export-owner@example.com", global_role="user", email_verified=True)
    task = Task(team_id=team.id, owner_id=owner.id, title="Default export task", status="finished", stats={"approved": 1, "submitted": 1})
    approved_question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "approved"}, status="approved", assigned_to="labeler-a")
    submitted_question = Question(team_id=team.id, task_id=task.id, row_index=1, content={"text": "still reviewing"}, status="submitted", assigned_to="labeler-b")
    approved_submission = Submission(team_id=team.id, task_id=task.id, question_id=approved_question.id, labeler_id="labeler-a", answers={"label": "ok"}, status="approved", submitted_at=datetime(2026, 6, 1))
    submitted_submission = Submission(team_id=team.id, task_id=task.id, question_id=submitted_question.id, labeler_id="labeler-b", answers={"label": "draft"}, status="submitted", submitted_at=datetime(2026, 6, 1))
    for item in [team, owner, TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"), task, approved_question, submitted_question, approved_submission, submitted_submission]:
        db.add(item)
    db.commit()

    headers = {"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id}
    created = client.post("/api/v1/exports", headers=headers, json={"task_id": task.id, "format": "json"})
    assert created.status_code == 200

    downloaded = client.get(f"/api/v1/exports/{created.json()['data']['export_id']}/download", headers=headers)

    assert downloaded.status_code == 200
    rows = downloaded.json()
    assert [row["question_id"] for row in rows] == [approved_question.id]
    assert rows[0]["answers.label"] == "ok"
    persisted = db.collection("export_jobs").find_one({"_id": created.json()["data"]["export_id"]})
    assert persisted is not None
    assert persisted["storage"] == "filesystem"
    assert persisted["path"].startswith(f"exports/{team.id}/")
    assert persisted["file_size"] == len(downloaded.content)
    assert read_storage_file(persisted["path"]) == downloaded.content


def test_export_status_filter_uses_submission_status() -> None:
    db = get_database()
    team = Team(company_name="Export Submission Status Team", owner_user_id="owner-1")
    owner = User(username="exportstatusowner", email="export-status-owner@example.com", global_role="user", email_verified=True)
    task = Task(team_id=team.id, owner_id=owner.id, title="Submission status export task", status="finished")
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "stale approved question"}, status="approved", assigned_to="labeler-a")
    rejected_submission = Submission(
        team_id=team.id,
        task_id=task.id,
        question_id=question.id,
        labeler_id="labeler-a",
        answers={"label": "bad"},
        status="rejected",
        submitted_at=datetime(2026, 6, 1),
        updated_at=datetime(2026, 6, 2),
    )
    for item in [team, owner, TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"), task, question, rejected_submission]:
        db.add(item)
    db.commit()

    headers = {"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id}
    created = client.post("/api/v1/exports", headers=headers, json={"task_id": task.id, "format": "json", "filters": {"status": "approved"}})
    assert created.status_code == 200

    downloaded = client.get(f"/api/v1/exports/{created.json()['data']['export_id']}/download", headers=headers)

    assert downloaded.status_code == 200
    assert downloaded.json() == []


def test_data_export_switch_blocks_export_creation() -> None:
    db = get_database()
    team = Team(company_name="Export Switch Guard Team", owner_user_id="owner-1")
    owner = User(username="exportswitchowner", email="export-switch-owner@example.com", global_role="user", email_verified=True)
    task = Task(team_id=team.id, owner_id=owner.id, title="Blocked export task", status="finished")
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "blocked"}, status="approved")
    submission = Submission(team_id=team.id, task_id=task.id, question_id=question.id, labeler_id="labeler-a", answers={"label": "ok"}, status="approved")
    for item in [
        PlatformSetting(key="data_export", value={"enabled": False}),
        team,
        owner,
        TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"),
        task,
        question,
        submission,
    ]:
        db.add(item)
    db.commit()

    response = client.post(
        "/api/v1/exports",
        headers={"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id},
        json={"task_id": task.id, "format": "json"},
    )

    assert response.status_code == 422
    assert response.json()["code"] == 42201
    assert response.json()["detail"]["switch_key"] == "data_export"
    assert db.collection("export_jobs").count_documents({"team_id": team.id}) == 0


def test_task_notification_is_hidden_from_unrelated_team_members() -> None:
    db = get_database()
    team = Team(company_name="Task Notification Scope Team", owner_user_id="owner-1")
    owner = User(username="tasknoticeowner", email="task-notice-owner@example.com", global_role="user", email_verified=True)
    assigned_labeler = User(username="tasknoticelabeler", email="task-notice-labeler@example.com", global_role="labeler", email_verified=True)
    unrelated_labeler = User(username="tasknoticeunrelated", email="task-notice-unrelated@example.com", global_role="labeler", email_verified=True)
    task = Task(team_id=team.id, owner_id=owner.id, title="Scoped task notice", status="published")
    question = Question(team_id=team.id, task_id=task.id, row_index=0, content={"text": "A"}, status="claimed", assigned_to=assigned_labeler.id)
    for item in [
        team,
        owner,
        assigned_labeler,
        unrelated_labeler,
        TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"),
        TeamMember(team_id=team.id, user_id=assigned_labeler.id, team_role="labeler"),
        TeamMember(team_id=team.id, user_id=unrelated_labeler.id, team_role="labeler"),
        task,
        question,
    ]:
        db.add(item)
    db.commit()

    created = client.post(
        f"/api/v1/notifications?team_id={team.id}",
        headers={"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id},
        json={
            "title": "Task reminder",
            "content": "Only task participants should receive this.",
            "notification_type": "task",
            "target_type": "task",
            "related_entity_type": "task",
            "related_entity_id": task.id,
        },
    )
    assert created.status_code == 200

    assigned_inbox = client.get("/api/v1/notifications/my", headers={"Authorization": f"Bearer {access_token(assigned_labeler)}"})
    unrelated_inbox = client.get("/api/v1/notifications/my", headers={"Authorization": f"Bearer {access_token(unrelated_labeler)}"})

    assert assigned_inbox.status_code == 200
    assert unrelated_inbox.status_code == 200
    assert [item["title"] for item in assigned_inbox.json()["data"]["items"]] == ["Task reminder"]
    assert unrelated_inbox.json()["data"]["items"] == []


def test_team_and_role_notifications_do_not_echo_untrusted_target_user_ids() -> None:
    db = get_database()
    team = Team(company_name="Notification Target Sanitizing Team", owner_user_id="owner-1")
    owner = User(username="sanitizeowner", email="sanitize-owner@example.com", global_role="user", email_verified=True)
    reviewer = User(username="sanitizereviewer", email="sanitize-reviewer@example.com", global_role="reviewer", email_verified=True)
    external_user = User(username="sanitizeexternal", email="sanitize-external@example.com", global_role="user", email_verified=True)
    for item in [
        team,
        owner,
        reviewer,
        external_user,
        TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"),
        TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer"),
    ]:
        db.add(item)
    db.commit()

    headers = {"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id}
    team_notice = client.post(
        f"/api/v1/notifications?team_id={team.id}",
        headers=headers,
        json={
            "title": "Team broadcast",
            "content": "Broadcast recipients are implied by team membership.",
            "target_type": "team",
            "target_user_ids": [external_user.id],
        },
    )
    role_notice = client.post(
        f"/api/v1/notifications?team_id={team.id}",
        headers=headers,
        json={
            "title": "Reviewer broadcast",
            "content": "Role recipients are implied by team membership.",
            "target_type": "role",
            "target_roles": ["reviewer"],
            "target_user_ids": [external_user.id],
        },
    )

    assert team_notice.status_code == 200
    assert role_notice.status_code == 200
    assert team_notice.json()["data"]["target_user_ids"] == []
    assert role_notice.json()["data"]["target_user_ids"] == []
    assert db.get(Notification, team_notice.json()["data"]["notification_id"]).target_user_ids == []
    assert db.get(Notification, role_notice.json()["data"]["notification_id"]).target_user_ids == []


def test_notification_preview_and_create_exclude_system_agent_members() -> None:
    db = get_database()
    team = Team(company_name="Notification Agent Boundary Team", owner_user_id="owner-1")
    owner = User(username="agentnoticeowner", email="agent-notice-owner@example.com", global_role="user", email_verified=True)
    agent = User(username="agentnoticeagent", email="agent-notice-agent@example.com", global_role="agent", email_verified=True)
    for item in [
        team,
        owner,
        agent,
        TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"),
        TeamMember(team_id=team.id, user_id=agent.id, team_role="agent", is_system_member=True),
    ]:
        db.add(item)
    db.commit()

    headers = {"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id}
    role_preview = client.get(f"/api/v1/notifications/preview?team_id={team.id}&target_type=role&target_roles=agent", headers=headers)
    member_preview = client.get(
        f"/api/v1/notifications/preview?team_id={team.id}&target_type=member&target_user_ids={agent.id}",
        headers=headers,
    )
    create_agent_notice = client.post(
        f"/api/v1/notifications?team_id={team.id}",
        headers=headers,
        json={"title": "Agent notice", "content": "System Agent must not receive manual notices.", "target_type": "role", "target_roles": ["agent"]},
    )

    assert role_preview.status_code == 200
    assert role_preview.json()["data"]["total"] == 0
    assert member_preview.status_code == 200
    assert member_preview.json()["data"]["total"] == 0
    assert create_agent_notice.status_code == 422
    assert db.collection("notifications").count_documents({"team_id": team.id}) == 0


def test_expired_notifications_keep_visibility_with_expired_status_filter() -> None:
    db = get_database()
    team = Team(company_name="Expired Notification Team", owner_user_id="owner-1")
    labeler = User(username="expiredlabeler", email="expired-labeler@example.com", global_role="labeler", email_verified=True)
    expired_notice = Notification(
        team_id=team.id,
        title="Expired announcement",
        content="The message remains visible for history but is expired.",
        notification_type="organization",
        target_type="member",
        target_user_ids=[labeler.id],
        expire_at=now_utc().replace(tzinfo=None) - timedelta(days=1),
    )
    for item in [team, labeler, TeamMember(team_id=team.id, user_id=labeler.id, team_role="labeler"), expired_notice]:
        db.add(item)
    db.commit()

    headers = {"Authorization": f"Bearer {access_token(labeler)}"}
    inbox = client.get("/api/v1/notifications/my", headers=headers)
    expired_only = client.get("/api/v1/notifications/my?status=expired", headers=headers)

    assert inbox.status_code == 200
    assert expired_only.status_code == 200
    assert inbox.json()["data"]["items"][0]["status"] == "expired"
    assert [item["notification_id"] for item in expired_only.json()["data"]["items"]] == [expired_notice.id]


def test_email_only_notifications_are_hidden_from_in_app_personal_inbox() -> None:
    db = get_database()
    team = Team(company_name="Email Only Notification Team", owner_user_id="owner-1")
    labeler = User(username="emailonlylabeler", email="email-only-labeler@example.com", global_role="labeler", email_verified=True)
    email_only_notice = Notification(
        team_id=team.id,
        title="Email only announcement",
        content="This notification should not appear in the in-app inbox.",
        notification_type="organization",
        target_type="member",
        target_user_ids=[labeler.id],
        email_enabled=True,
        in_app_enabled=False,
    )
    for item in [team, labeler, TeamMember(team_id=team.id, user_id=labeler.id, team_role="labeler"), email_only_notice]:
        db.add(item)
    db.commit()

    response = client.get("/api/v1/notifications/my", headers={"Authorization": f"Bearer {access_token(labeler)}"})

    assert response.status_code == 200
    assert response.json()["data"]["items"] == []


def test_individual_state_update_rejects_expired_notifications() -> None:
    db = get_database()
    team = Team(company_name="Expired Single State Team", owner_user_id="owner-1")
    labeler = User(username="expiredsinglelabeler", email="expired-single-labeler@example.com", global_role="labeler", email_verified=True)
    expired_notice = Notification(
        team_id=team.id,
        title="Expired single update",
        content="Expired notifications are historical and should not be handled.",
        notification_type="organization",
        target_type="member",
        target_user_ids=[labeler.id],
        expire_at=now_utc().replace(tzinfo=None) - timedelta(days=1),
    )
    for item in [team, labeler, TeamMember(team_id=team.id, user_id=labeler.id, team_role="labeler"), expired_notice]:
        db.add(item)
    db.commit()

    response = client.post(
        f"/api/v1/notifications/my/{expired_notice.id}/state",
        headers={"Authorization": f"Bearer {access_token(labeler)}"},
        json={"action": "handled"},
    )

    assert response.status_code == 409
    assert response.json()["code"] == 40902
    assert labeler.id not in db.get(Notification, expired_notice.id).handled_by
    assert labeler.id not in db.get(Notification, expired_notice.id).read_by


def test_individual_state_update_rejects_revoked_notifications() -> None:
    db = get_database()
    team = Team(company_name="Revoked Single State Team", owner_user_id="owner-1")
    reviewer = User(username="revokedsinglereviewer", email="revoked-single-reviewer@example.com", global_role="reviewer", email_verified=True)
    revoked_notice = Notification(
        team_id=team.id,
        title="Revoked single update",
        content="Revoked notifications should not accept user state changes.",
        notification_type="organization",
        target_type="team",
        status="revoked",
    )
    for item in [team, reviewer, TeamMember(team_id=team.id, user_id=reviewer.id, team_role="reviewer"), revoked_notice]:
        db.add(item)
    db.commit()

    response = client.post(
        f"/api/v1/notifications/my/{revoked_notice.id}/state",
        headers={"Authorization": f"Bearer {access_token(reviewer)}"},
        json={"action": "handled"},
    )

    assert response.status_code == 409
    assert response.json()["code"] == 40902
    assert reviewer.id not in db.get(Notification, revoked_notice.id).handled_by
    assert reviewer.id not in db.get(Notification, revoked_notice.id).read_by


def test_mark_all_my_notifications_read_skips_expired_notifications() -> None:
    db = get_database()
    team = Team(company_name="Expired Mark All Team", owner_user_id="owner-1")
    labeler = User(username="expiredmarklabeler", email="expired-mark-labeler@example.com", global_role="labeler", email_verified=True)
    expired_notice = Notification(
        team_id=team.id,
        title="Expired mark-all announcement",
        content="Expired history should not be marked read.",
        notification_type="organization",
        target_type="member",
        target_user_ids=[labeler.id],
        expire_at=now_utc().replace(tzinfo=None) - timedelta(days=1),
    )
    for item in [team, labeler, TeamMember(team_id=team.id, user_id=labeler.id, team_role="labeler"), expired_notice]:
        db.add(item)
    db.commit()

    response = client.post("/api/v1/notifications/my/mark-all-read", headers={"Authorization": f"Bearer {access_token(labeler)}"})

    assert response.status_code == 200
    assert response.json()["data"]["updated"] == 0
    assert labeler.id not in db.get(Notification, expired_notice.id).read_by


def test_team_document_upload_rejects_executable_content_type() -> None:
    db = get_database()
    team = Team(company_name="Document Upload Guard Team", owner_user_id="owner-1")
    owner = User(username="docuploadowner", email="doc-upload-owner@example.com", global_role="user", email_verified=True)
    for item in [team, owner, TeamMember(team_id=team.id, user_id=owner.id, team_role="owner")]:
        db.add(item)
    db.commit()

    response = client.post(
        "/api/v1/uploads",
        headers={"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id},
        data={"category": "document"},
        files={"file": ("payload.exe", b"MZ fake executable", "application/x-msdownload")},
    )

    assert response.status_code == 400
    assert response.json()["code"] == 40003
    assert db.collection("uploaded_files").count_documents({"team_id": team.id}) == 0


def test_team_upload_stores_bytes_on_filesystem_only() -> None:
    db = get_database()
    team = Team(company_name="Filesystem Upload Team", owner_user_id="owner-1")
    owner = User(username="filesystemuploadowner", email="filesystem-upload-owner@example.com", global_role="user", email_verified=True)
    for item in [team, owner, TeamMember(team_id=team.id, user_id=owner.id, team_role="owner")]:
        db.add(item)
    db.commit()

    response = client.post(
        "/api/v1/uploads",
        headers={"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id},
        data={"category": "document"},
        files={"file": ("contract.pdf", b"%PDF-1.4 filesystem-content", "application/pdf")},
    )

    assert response.status_code == 200
    uploaded = db.collection("uploaded_files").find_one({"_id": response.json()["data"]["file_id"]})
    assert uploaded is not None
    assert uploaded["storage"] == "filesystem"
    assert uploaded["path"].startswith(f"uploads/{team.id}/")
    assert uploaded["size"] == len(b"%PDF-1.4 filesystem-content")
    assert read_storage_file(uploaded["path"]) == b"%PDF-1.4 filesystem-content"
    downloaded = client.get(response.json()["data"]["url"], headers={"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id})
    assert downloaded.status_code == 200
    assert downloaded.content == b"%PDF-1.4 filesystem-content"


def test_media_upload_infers_avi_content_type_from_octet_stream() -> None:
    db = get_database()
    team = Team(company_name="AVI Upload Inference Team", owner_user_id="owner-1")
    owner = User(username="aviuploadowner", email="avi-upload-owner@example.com", global_role="user", email_verified=True)
    for item in [team, owner, TeamMember(team_id=team.id, user_id=owner.id, team_role="owner")]:
        db.add(item)
    db.commit()

    response = client.post(
        "/api/v1/uploads",
        headers={"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id},
        data={"category": "media"},
        files={"file": ("clip.avi", b"avi-media-content", "application/octet-stream")},
    )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["content_type"] == "video/x-msvideo"
    uploaded = db.collection("uploaded_files").find_one({"_id": payload["file_id"]})
    assert uploaded is not None
    assert uploaded["content_type"] == "video/x-msvideo"
    assert uploaded["category"] == "media"


def test_profile_avatar_public_url_uses_filesystem_storage_without_inline_mongo_content() -> None:
    db = get_database()
    user = User(username="publicavataruser", email="public-avatar-user@example.com", global_role="labeler", email_verified=True)
    db.add(user)
    db.commit()

    response = client.post(
        "/api/v1/uploads",
        headers={"Authorization": f"Bearer {access_token(user)}"},
        data={"category": "image"},
        files={"file": ("avatar.png", b"png-avatar-content", "image/png")},
    )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["url"].startswith("/api/v1/uploads/")
    assert payload["url"].endswith("/public")
    uploaded = db.collection("uploaded_files").find_one({"_id": payload["file_id"]})
    assert uploaded is not None
    assert uploaded["storage"] == "filesystem"
    assert uploaded["team_id"] == f"profile:{user.id}"
    assert uploaded["size"] == len(b"png-avatar-content")
    assert read_storage_file(uploaded["path"]) == b"png-avatar-content"
    public = client.get(payload["url"])
    assert public.status_code == 200
    assert public.headers["content-type"].startswith("image/png")
    assert public.content == b"png-avatar-content"


def test_dataset_import_rejects_inline_base64_media_payload() -> None:
    db = get_database()
    team = Team(company_name="Inline Base64 Dataset Team", owner_user_id="owner-1")
    owner = User(username="inlinebase64owner", email="inline-base64-owner@example.com", global_role="user", email_verified=True)
    for item in [team, owner, TeamMember(team_id=team.id, user_id=owner.id, team_role="owner")]:
        db.add(item)
    db.commit()

    response = client.post(
        "/api/v1/datasets",
        headers={"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id},
        data={"name": "Inline base64 dataset", "description": "should be rejected"},
        files={"file": ("items.json", '[{"row_id":"row-1","image_url":"data:image/png;base64,AAAA"}]', "application/json")},
    )

    assert response.status_code == 400
    assert response.json()["code"] == 40002
    assert db.collection("datasets").count_documents({"team_id": team.id}) == 0


def test_upload_switch_blocks_team_upload() -> None:
    db = get_database()
    team = Team(company_name="Upload Switch Guard Team", owner_user_id="owner-1")
    owner = User(username="uploadswitchowner", email="upload-switch-owner@example.com", global_role="user", email_verified=True)
    for item in [
        PlatformSetting(key="upload", value={"enabled": False}),
        team,
        owner,
        TeamMember(team_id=team.id, user_id=owner.id, team_role="owner"),
    ]:
        db.add(item)
    db.commit()

    response = client.post(
        "/api/v1/uploads",
        headers={"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id},
        data={"category": "document"},
        files={"file": ("contract.pdf", b"%PDF-1.4", "application/pdf")},
    )

    assert response.status_code == 422
    assert response.json()["code"] == 42201
    assert response.json()["detail"]["switch_key"] == "upload"
    assert db.collection("uploaded_files").count_documents({"team_id": team.id}) == 0


def test_document_upload_rejects_octet_stream_even_with_pdf_extension() -> None:
    db = get_database()
    team = Team(company_name="Octet Upload Guard Team", owner_user_id="owner-1")
    owner = User(username="octetuploadowner", email="octet-upload-owner@example.com", global_role="user", email_verified=True)
    for item in [team, owner, TeamMember(team_id=team.id, user_id=owner.id, team_role="owner")]:
        db.add(item)
    db.commit()

    response = client.post(
        "/api/v1/uploads",
        headers={"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id},
        data={"category": "document"},
        files={"file": ("contract.pdf", b"%PDF-1.4", "application/octet-stream")},
    )

    assert response.status_code == 400
    assert response.json()["code"] == 40003
    assert db.collection("uploaded_files").count_documents({"team_id": team.id}) == 0


def test_team_upload_rejects_executable_even_with_generic_category() -> None:
    db = get_database()
    team = Team(company_name="Generic Upload Guard Team", owner_user_id="owner-1")
    owner = User(username="genericuploadowner", email="generic-upload-owner@example.com", global_role="user", email_verified=True)
    for item in [team, owner, TeamMember(team_id=team.id, user_id=owner.id, team_role="owner")]:
        db.add(item)
    db.commit()

    response = client.post(
        "/api/v1/uploads",
        headers={"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id},
        data={"category": "other"},
        files={"file": ("payload.exe", b"MZ fake executable", "application/x-msdownload")},
    )

    assert response.status_code == 400
    assert response.json()["code"] == 40003
    assert db.collection("uploaded_files").count_documents({"team_id": team.id}) == 0


def test_team_upload_rejects_scriptable_html_even_with_generic_category() -> None:
    db = get_database()
    team = Team(company_name="HTML Upload Guard Team", owner_user_id="owner-1")
    owner = User(username="htmluploadowner", email="html-upload-owner@example.com", global_role="user", email_verified=True)
    for item in [team, owner, TeamMember(team_id=team.id, user_id=owner.id, team_role="owner")]:
        db.add(item)
    db.commit()

    response = client.post(
        "/api/v1/uploads",
        headers={"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id},
        data={"category": "other"},
        files={"file": ("payload.html", b"<script>alert(1)</script>", "text/html")},
    )

    assert response.status_code == 400
    assert response.json()["code"] == 40003
    assert db.collection("uploaded_files").count_documents({"team_id": team.id}) == 0


def test_single_upload_limit_is_one_gigabyte_and_rejects_larger_payload(monkeypatch) -> None:
    assert upload_service.MAX_UPLOAD_BYTES == 1024 * 1024 * 1024

    db = get_database()
    team = Team(company_name="Upload Size Limit Team", owner_user_id="owner-1")
    owner = User(username="sizelimitowner", email="size-limit-owner@example.com", global_role="user", email_verified=True)
    for item in [team, owner, TeamMember(team_id=team.id, user_id=owner.id, team_role="owner")]:
        db.add(item)
    db.commit()

    monkeypatch.setattr(upload_service, "MAX_UPLOAD_BYTES", 4)
    response = client.post(
        "/api/v1/uploads",
        headers={"Authorization": f"Bearer {access_token(owner)}", "X-Team-ID": team.id},
        data={"category": "document"},
        files={"file": ("contract.pdf", b"%PDF-1.4", "application/pdf")},
    )

    assert response.status_code == 400
    assert response.json()["code"] == 40003
    assert response.json()["message"] == "单文件最大 1GB"
    assert db.collection("uploaded_files").count_documents({"team_id": team.id}) == 0
