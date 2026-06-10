from __future__ import annotations

import importlib.util
from pathlib import Path

from app.core.database import get_database, reset_database
from app.models.ai_review import AiReviewJob
from app.models.production import AnnotationTemplate, Dataset, Question, Submission, Task, TemplateVersion
from app.models.resource import TeamAiWallet
from app.models.team import Team, TeamMember
from app.models.user import User, UserProfile


def load_dev_seed_accounts_module():
    script_path = Path(__file__).resolve().parents[1] / "scripts" / "dev_seed_accounts.py"
    spec = importlib.util.spec_from_file_location("dev_seed_accounts", script_path)
    if not spec or not spec.loader:
        raise RuntimeError("Unable to load dev_seed_accounts.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_dev_seed_accounts_align_with_current_team_baseline() -> None:
    reset_database()
    module = load_dev_seed_accounts_module()
    team_id = module.upsert_test_accounts(reset=False)

    db = get_database()

    markitup = db.find_one(Team, {"company_name": "MarkitUp"})
    markitdown = db.find_one(Team, {"company_name": "MarkitDown"})
    assert markitup is not None
    assert markitdown is not None
    assert team_id == markitup.id

    expected_members = {
        "MarkitUp": {
            "admin@markitup.test": "team_admin",
            "owner@markitup.test": "owner",
            "labeler1@markitup.test": "labeler",
            "labeler2@markitup.test": "labeler",
            "reviewer1@markitup.test": "reviewer",
            "reviewer2@markitup.test": "reviewer",
        },
        "MarkitDown": {
            "admin@markitdown.test": "team_admin",
            "owner@markitdown.test": "owner",
            "labeler1@markitdown.test": "labeler",
            "labeler2@markitdown.test": "labeler",
            "reviewer1@markitdown.test": "reviewer",
            "reviewer2@markitdown.test": "reviewer",
        },
    }

    for team in [markitup, markitdown]:
        team_members = expected_members[team.company_name]
        team_admin_members = db.find(TeamMember, {"team_id": team.id, "team_role": "team_admin", "status": "active"})
        assert len(team_admin_members) == 1

        for email, team_role in team_members.items():
            user = db.find_one(User, {"email": email})
            assert user is not None
            member = db.find_one(TeamMember, {"team_id": team.id, "user_id": user.id})
            assert member is not None
            assert member.team_role == team_role

        wallet = db.find_one(TeamAiWallet, {"team_id": team.id})
        assert wallet is not None
        assert wallet.balance_points == 0.0

        system_agent_member = db.find_one(TeamMember, {"team_id": team.id, "team_role": "agent"})
        assert system_agent_member is not None
        assert system_agent_member.is_system_member is True

        system_agent_user = db.get(User, system_agent_member.user_id)
        assert system_agent_user is not None
        assert system_agent_user.global_role == "agent"

        system_agent_profile = db.find_one(UserProfile, {"user_id": system_agent_user.id})
        assert system_agent_profile is not None
        assert system_agent_profile.display_name == "Agent"

    platform_admin = db.find_one(User, {"email": "platform.admin@test.local"})
    assert platform_admin is not None
    assert platform_admin.global_role == "platform_admin"

    for email in ["alpha.labeler@test.local", "beta.labeler@test.local"]:
        personal_labeler = db.find_one(User, {"email": email})
        assert personal_labeler is not None
        assert personal_labeler.global_role == "labeler"
        assert db.find_one(TeamMember, {"user_id": personal_labeler.id}) is None

    assert db.find_one(Task, {}) is None
    assert db.find_one(Dataset, {}) is None
    assert db.find_one(Question, {}) is None
    assert db.find_one(AnnotationTemplate, {}) is None
    assert db.find_one(TemplateVersion, {}) is None
    assert db.find_one(Submission, {}) is None
    assert db.find_one(AiReviewJob, {}) is None
    assert db.find_one(User, {"email": "agent@test.local"}) is None
