from enum import StrEnum


class GlobalRole(StrEnum):
    PLATFORM_ADMIN = "platform_admin"
    ADMIN = "admin"
    PENDING = "pending"
    USER = "user"
    OWNER = "owner"
    LABELER = "labeler"
    REVIEWER = "reviewer"
    AGENT = "agent"


class TeamRole(StrEnum):
    TEAM_ADMIN = "team_admin"
    OWNER = "owner"
    REVIEWER = "reviewer"
    AGENT = "agent"
    LABELER = "labeler"


ROLE_PERMISSIONS: dict[str, set[str]] = {
    TeamRole.TEAM_ADMIN.value: {
        "team:read",
        "team:manage",
        "member:read",
        "member:create",
        "member:update",
        "member:delete",
        "member:invite",
        "task:create",
        "task:manage",
        "task:read",
        "submission:view",
        "review:submit",
        "ai_provider:manage",
        "budget:view",
        "budget:manage",
    },
    TeamRole.OWNER.value: {
        "team:read",
        "member:read",
        "task:create",
        "task:manage",
        "task:read",
        "submission:view",
        "ai_provider:manage",
        "budget:view",
    },
    TeamRole.REVIEWER.value: {
        "team:read",
        "member:read",
        "budget:view",
        "task:read",
        "submission:view",
        "review:submit",
    },
    TeamRole.AGENT.value: {
        "team:read",
        "ai_budget:view",
        "ai_budget:manage",
        "budget:view",
    },
    TeamRole.LABELER.value: {
        "team:read",
        "member:read",
        "label:read",
        "label:write",
        "submission:submit",
    },
}

GLOBAL_ROLE_PERMISSIONS: dict[str, set[str]] = {
    GlobalRole.PLATFORM_ADMIN.value: {
        "platform:manage",
        "cert_type:manage",
        "certification:review",
        "ai_provider:manage",
    },
    GlobalRole.OWNER.value: {
        "task:create",
        "task:manage",
        "task:read",
        "submission:view",
        "budget:view",
    },
    GlobalRole.ADMIN.value: {
        "admin:workspace",
        "team:create",
    },
    GlobalRole.PENDING.value: set(),
    GlobalRole.LABELER.value: {"label:read", "label:write", "submission:submit"},
    GlobalRole.REVIEWER.value: {"review:submit", "submission:view"},
    GlobalRole.AGENT.value: {"ai_budget:view", "ai_budget:manage", "budget:view"},
    GlobalRole.USER.value: set(),
}

VALID_GLOBAL_ROLES = {role.value for role in GlobalRole}
VALID_TEAM_ROLES = {role.value for role in TeamRole}


def permissions_for_team_role(team_role: str) -> list[str]:
    return sorted(ROLE_PERMISSIONS.get(role_value(team_role), set()))


def effective_permissions(global_role: str, team_permissions: list[str] | None = None) -> list[str]:
    permissions = set(GLOBAL_ROLE_PERMISSIONS.get(role_value(global_role), set()))
    if team_permissions:
        permissions.update(team_permissions)
    return sorted(permissions)


def can_review_task(team_role: str | None, assigned_review_tasks: list[str] | None, task_id: str) -> bool:
    normalized_role = role_value(team_role)
    if normalized_role in {TeamRole.TEAM_ADMIN.value, TeamRole.OWNER.value}:
        return True
    if normalized_role != TeamRole.REVIEWER.value:
        return False
    return task_id in set(assigned_review_tasks or [])


def role_value(role: str | StrEnum | None) -> str | None:
    if role is None:
        return None
    if isinstance(role, StrEnum):
        return role.value
    return str(role)
