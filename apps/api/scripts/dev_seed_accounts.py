from __future__ import annotations

import argparse

from app.core.database import get_database, reset_database
from app.core.security import hash_password
from app.domains.rbac import GlobalRole, TeamRole, permissions_for_team_role
from app.models.resource import TeamAiWallet
from app.models.team import Team, TeamMember
from app.models.user import User, UserProfile
from app.services.team_service import create_system_agent_member


PASSWORD = "SecurePass123!"
PRIMARY_TEAM_NAME = "MarkitUp"
LEGACY_AGENT_EMAIL = "agent@test.local"
LEGACY_AGENT_USERNAME = "agent_test"

PLATFORM_ACCOUNTS = [
    {
        "username": "platformadmin",
        "display_name": "平台管理员",
        "email": "platform.admin@test.local",
        "global_role": GlobalRole.PLATFORM_ADMIN.value,
    },
]

TEAM_SPECS = [
    {
        "company_name": "MarkitUp",
        "industry": "AI Data Operations",
        "contact_phone": "13800138001",
        "description": "MarkitUp local development seed team.",
        "admin_email": "admin@markitup.test",
        "members": [
            {
                "username": "miachen",
                "display_name": "陈米娅",
                "email": "admin@markitup.test",
                "global_role": GlobalRole.USER.value,
                "team_role": TeamRole.TEAM_ADMIN.value,
            },
            {
                "username": "owenli",
                "display_name": "李欧文",
                "email": "owner@markitup.test",
                "global_role": GlobalRole.USER.value,
                "team_role": TeamRole.OWNER.value,
            },
            {
                "username": "linazhao",
                "display_name": "赵丽娜",
                "email": "labeler1@markitup.test",
                "global_role": GlobalRole.LABELER.value,
                "team_role": TeamRole.LABELER.value,
            },
            {
                "username": "leowang",
                "display_name": "王利奥",
                "email": "labeler2@markitup.test",
                "global_role": GlobalRole.LABELER.value,
                "team_role": TeamRole.LABELER.value,
            },
            {
                "username": "reneexu",
                "display_name": "徐芮妮",
                "email": "reviewer1@markitup.test",
                "global_role": GlobalRole.REVIEWER.value,
                "team_role": TeamRole.REVIEWER.value,
            },
            {
                "username": "ryanzhou",
                "display_name": "周瑞恩",
                "email": "reviewer2@markitup.test",
                "global_role": GlobalRole.REVIEWER.value,
                "team_role": TeamRole.REVIEWER.value,
            },
        ],
    },
    {
        "company_name": "MarkitDown",
        "industry": "AI Data Operations",
        "contact_phone": "13800138002",
        "description": "MarkitDown local development seed team.",
        "admin_email": "admin@markitdown.test",
        "members": [
            {
                "username": "dorahhuang",
                "display_name": "黄多拉",
                "email": "admin@markitdown.test",
                "global_role": GlobalRole.USER.value,
                "team_role": TeamRole.TEAM_ADMIN.value,
            },
            {
                "username": "nolansun",
                "display_name": "孙诺兰",
                "email": "owner@markitdown.test",
                "global_role": GlobalRole.USER.value,
                "team_role": TeamRole.OWNER.value,
            },
            {
                "username": "ivylin",
                "display_name": "林艾薇",
                "email": "labeler1@markitdown.test",
                "global_role": GlobalRole.LABELER.value,
                "team_role": TeamRole.LABELER.value,
            },
            {
                "username": "evanqiao",
                "display_name": "乔伊凡",
                "email": "labeler2@markitdown.test",
                "global_role": GlobalRole.LABELER.value,
                "team_role": TeamRole.LABELER.value,
            },
            {
                "username": "gracetang",
                "display_name": "唐格蕾丝",
                "email": "reviewer1@markitdown.test",
                "global_role": GlobalRole.REVIEWER.value,
                "team_role": TeamRole.REVIEWER.value,
            },
            {
                "username": "victorfeng",
                "display_name": "冯维克多",
                "email": "reviewer2@markitdown.test",
                "global_role": GlobalRole.REVIEWER.value,
                "team_role": TeamRole.REVIEWER.value,
            },
        ],
    },
]

PERSONAL_ACCOUNTS = [
    {
        "username": "avayu",
        "display_name": "于艾娃",
        "email": "alpha.labeler@test.local",
        "global_role": GlobalRole.LABELER.value,
    },
    {
        "username": "benluo",
        "display_name": "罗本",
        "email": "beta.labeler@test.local",
        "global_role": GlobalRole.LABELER.value,
    },
]

def iter_seed_accounts() -> list[dict]:
    accounts = [*PLATFORM_ACCOUNTS, *PERSONAL_ACCOUNTS]
    for team in TEAM_SPECS:
        accounts.extend(team["members"])
    return accounts


def remove_legacy_agent_account() -> None:
    db = get_database()
    legacy_agent = db.find_one(User, {"$or": [{"email": LEGACY_AGENT_EMAIL}, {"username": LEGACY_AGENT_USERNAME}]})
    if not legacy_agent:
        return
    db.delete_many(TeamMember, {"user_id": legacy_agent.id})
    db.delete_many(UserProfile, {"user_id": legacy_agent.id})
    db.delete_many(User, {"_id": legacy_agent.id})


def upsert_test_accounts(reset: bool = False) -> str:
    if reset:
        reset_database()
    db = get_database()
    password_hash = hash_password(PASSWORD)
    users: dict[str, User] = {}

    remove_legacy_agent_account()

    for account in iter_seed_accounts():
        email = str(account["email"])
        username = str(account["username"])
        global_role = str(account["global_role"])
        display_name = str(account["display_name"])

        user = db.find_one(User, {"email": email}) or db.find_one(User, {"username": username}) or User(email=email)
        user.username = username
        user.password_hash = password_hash
        user.global_role = global_role
        user.email_verified = True
        user.status = "active"
        db.save(user)
        users[email] = user

        profile = db.find_one(UserProfile, {"user_id": user.id}) or UserProfile(user_id=user.id)
        profile.display_name = display_name
        db.save(profile)

    primary_team_id = ""
    for team_spec in TEAM_SPECS:
        company_name = str(team_spec["company_name"])
        admin_email = str(team_spec["admin_email"])
        team_admin = users[admin_email]
        team = db.find_one(Team, {"company_name": company_name}) or Team(company_name=company_name)
        team.industry = str(team_spec["industry"])
        team.contact_phone = str(team_spec["contact_phone"])
        team.description = str(team_spec["description"])
        team.owner_user_id = team_admin.id
        team.status = "active"
        db.save(team)

        if company_name == PRIMARY_TEAM_NAME:
            primary_team_id = team.id

        wallet = db.find_one(TeamAiWallet, {"team_id": team.id}) or TeamAiWallet(team_id=team.id, balance_points=0.0)
        db.save(wallet)

        member_emails = {str(account["email"]) for account in team_spec["members"]}
        for email, user in users.items():
            if email not in member_emails:
                db.delete_many(TeamMember, {"team_id": team.id, "user_id": user.id})

        for account in team_spec["members"]:
            email = str(account["email"])
            team_role = str(account["team_role"])
            user = users[email]
            member = db.find_one(TeamMember, {"team_id": team.id, "user_id": user.id}) or TeamMember(
                team_id=team.id,
                user_id=user.id,
            )
            member.team_role = team_role
            member.is_system_member = False
            member.permissions = permissions_for_team_role(team_role)
            member.permissions_customized = False
            member.status = "active"
            db.save(member)

        create_system_agent_member(db, team=team)

    db.commit()
    return primary_team_id


def main() -> None:
    parser = argparse.ArgumentParser(description="Create MarkUp local development test accounts.")
    parser.add_argument("--reset", action="store_true", help="Drop all collections in the configured database before seeding.")
    args = parser.parse_args()
    primary_team_id = upsert_test_accounts(reset=args.reset)
    print(f"Primary team: {PRIMARY_TEAM_NAME} ({primary_team_id})")
    print(f"Password: {PASSWORD}")
    for account in PLATFORM_ACCOUNTS:
        print(f"platform | - | {account['email']} | {account['username']} | global_role={account['global_role']}")
    for team in TEAM_SPECS:
        for account in team["members"]:
            print(
                f"team | {team['company_name']} | {account['email']} | {account['username']} | "
                f"team_role={account['team_role']}"
            )
    for account in PERSONAL_ACCOUNTS:
        print(f"personal | - | {account['email']} | {account['username']} | global_role={account['global_role']}")
    print("System Agent is created automatically for each seeded team and is not a human login account.")
    print("No datasets, templates, tasks, questions, submissions, or reviews are created by this account seed.")


if __name__ == "__main__":
    main()
