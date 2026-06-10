import type { AuthSession } from '../stores/authStore';
import type { ApiUser } from '../types/api';

export type EnterpriseWorkspaceRole = 'admin' | 'owner' | 'reviewer' | 'agent';
export type WorkspaceAudience = EnterpriseWorkspaceRole | 'labeler' | 'guest';

const ADMIN_ROLES = new Set(['admin', 'team_admin']);
const ADMIN_PERMISSIONS = new Set(['team:create', 'team:manage', 'team:update']);
const TEAM_ROLE_TO_WORKSPACE_ROLE: Partial<Record<string, EnterpriseWorkspaceRole>> = {
  team_admin: 'admin',
  owner: 'owner',
  reviewer: 'reviewer',
  agent: 'agent',
};

export function isLabelerUser(user: ApiUser): boolean {
  return user.role === 'labeler';
}

export function isTeamLabelerUser(user: ApiUser): boolean {
  return isLabelerUser(user) && user.team_role === 'labeler' && Boolean(user.team_id || user.default_team_id);
}

export function getEnterpriseWorkspaceRole(user: ApiUser): EnterpriseWorkspaceRole | null {
  if (isLabelerUser(user)) {
    return null;
  }
  if (user.role === 'platform_admin') {
    return null;
  }

  const teamRole = user.team_role ? TEAM_ROLE_TO_WORKSPACE_ROLE[user.team_role] : null;
  if (teamRole) {
    return teamRole;
  }

  if (ADMIN_ROLES.has(user.role) || user.permissions.some((permission) => ADMIN_PERMISSIONS.has(permission))) {
    return 'admin';
  }

  if (user.role === 'owner') {
    return 'owner';
  }

  if (user.role === 'reviewer') {
    return 'reviewer';
  }

  if (user.role === 'agent') {
    return 'agent';
  }

  return null;
}

export function getWorkspaceAudience(user: ApiUser): WorkspaceAudience {
  if (isLabelerUser(user)) {
    return 'labeler';
  }

  return getEnterpriseWorkspaceRole(user) ?? 'guest';
}

export function isEnterpriseUser(user: ApiUser): boolean {
  return getEnterpriseWorkspaceRole(user) !== null;
}

export function isLabelerSession(session: AuthSession): boolean {
  return isLabelerUser(session.user);
}

export function isEnterpriseSession(session: AuthSession): boolean {
  return isEnterpriseUser(session.user);
}
