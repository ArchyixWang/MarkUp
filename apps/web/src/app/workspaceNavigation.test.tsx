import { describe, expect, it } from 'vitest';
import type { ApiUser } from '../types/api';
import { getEnterpriseWorkspaceRole, isEnterpriseUser, isLabelerUser, isTeamLabelerUser } from './workspaceAccess';
import { buildWorkspaceNav, canAccessWorkspacePage, getDefaultWorkspacePage, getWorkspaceNavDefinition } from './workspaceNavigation';

function createUser(overrides: Partial<ApiUser>): ApiUser {
  return {
    user_id: 'u-1',
    username: 'user01',
    email: 'user@example.com',
    role: 'labeler',
    permissions: [],
    ...overrides,
  };
}

describe('workspace access and navigation', () => {
  it('builds labeler navigation separately from enterprise roles', () => {
    const labeler = createUser({ role: 'labeler', permissions: ['label:write'] });

    expect(isLabelerUser(labeler)).toBe(true);
    expect(isEnterpriseUser(labeler)).toBe(false);
    expect(getDefaultWorkspacePage(labeler)).toBe('labeler-dashboard');

    const groups = getWorkspaceNavDefinition(labeler);
    expect(groups.map((group) => group.id)).toEqual(['labeler-workbench', 'labeler-account']);
    expect(groups[1].label).toBe('个人工具');
    expect(groups[0].items.map((item) => item.id)).toEqual(['labeler-dashboard', 'labeler-tasks', 'labeler-questions']);
    expect(groups[1].items.map((item) => item.id)).toEqual(['account-profile', 'account-certifications', 'account-points', 'account-reputation', 'account']);
    expect(canAccessWorkspacePage(labeler, 'labeler-dashboard')).toBe(true);
    expect(canAccessWorkspacePage(labeler, 'labeling')).toBe(true);
    expect(canAccessWorkspacePage(labeler, 'labeler-tasks')).toBe(true);
    expect(canAccessWorkspacePage(labeler, 'labeler-questions')).toBe(true);
    expect(canAccessWorkspacePage(labeler, 'account')).toBe(true);
    expect(canAccessWorkspacePage(labeler, 'account-certifications')).toBe(true);
    expect(canAccessWorkspacePage(labeler, 'points-level-rules')).toBe(true);
    expect(canAccessWorkspacePage(labeler, 'account-reputation')).toBe(true);
    expect(canAccessWorkspacePage(labeler, 'personal-inbox')).toBe(true);
    expect(canAccessWorkspacePage(labeler, 'task-management')).toBe(false);
    expect(groups.flatMap((group) => group.items).map((item) => item.id)).not.toContain('personal-inbox');
  });

  it('adds read-only organization tools for team labelers', () => {
    const labeler = createUser({
      role: 'labeler',
      team_id: 'team-1',
      default_team_id: 'team-1',
      team_role: 'labeler',
      permissions: ['team:read', 'member:read', 'budget:view', 'label:write'],
    });

    expect(isLabelerUser(labeler)).toBe(true);
    expect(isTeamLabelerUser(labeler)).toBe(true);
    expect(isEnterpriseUser(labeler)).toBe(false);

    const groups = getWorkspaceNavDefinition(labeler);
    expect(getDefaultWorkspacePage(labeler)).toBe('labeler-dashboard');
    expect(groups.map((group) => group.id)).toEqual(['team-labeler-workbench', 'organization-management', 'labeler-personal-tools']);
    expect(groups[0].label).toBe('企业项目');
    expect(groups[0].items.map((item) => item.id)).toEqual(['labeler-dashboard', 'labeler-tasks', 'labeler-questions']);
    expect(groups[0].items.map((item) => item.label)).toEqual(['主页面', '我的项目', '项目历史']);
    expect(groups[1].items.map((item) => item.id)).toEqual(['organization-info', 'people-management']);
    expect(groups[2].label).toBe('个人工具');
    expect(groups[2].items.map((item) => item.label)).toContain('账号管理');
    expect(canAccessWorkspacePage(labeler, 'organization-info')).toBe(true);
    expect(canAccessWorkspacePage(labeler, 'resource-config')).toBe(false);
    expect(canAccessWorkspacePage(labeler, 'people-management')).toBe(true);
    expect(canAccessWorkspacePage(labeler, 'announcements')).toBe(false);
    expect(canAccessWorkspacePage(labeler, 'operation-logs')).toBe(false);
    expect(canAccessWorkspacePage(labeler, 'account')).toBe(true);
    expect(canAccessWorkspacePage(labeler, 'manual-review')).toBe(false);
    expect(canAccessWorkspacePage(labeler, 'task-management')).toBe(false);
  });

  it('classifies enterprise members by team_role before falling back to global role permissions', () => {
    const reviewer = createUser({
      role: 'user',
      team_id: 'team-1',
      default_team_id: 'team-1',
      team_role: 'reviewer',
      team_role_label: '审核员',
      permissions: ['team:read', 'member:read', 'budget:view', 'task:read', 'submission:view', 'review:submit'],
    });

    expect(getEnterpriseWorkspaceRole(reviewer)).toBe('reviewer');
    expect(getDefaultWorkspacePage(reviewer)).toBe('dashboard');
    expect(canAccessWorkspacePage(reviewer, 'ai-review')).toBe(true);
    expect(canAccessWorkspacePage(reviewer, 'ai-review-task')).toBe(true);
    expect(canAccessWorkspacePage(reviewer, 'manual-review')).toBe(true);
    expect(canAccessWorkspacePage(reviewer, 'datasets')).toBe(false);
    expect(canAccessWorkspacePage(reviewer, 'task-management')).toBe(false);
    expect(canAccessWorkspacePage(reviewer, 'resource-config')).toBe(false);
    expect(canAccessWorkspacePage(reviewer, 'announcements')).toBe(false);
    expect(canAccessWorkspacePage(reviewer, 'operation-logs')).toBe(false);
  });

  it('treats team admins and platform admins as enterprise admins', () => {
    const admin = createUser({ role: 'team_admin', permissions: ['team:manage'] });

    expect(getEnterpriseWorkspaceRole(admin)).toBe('admin');
    expect(isEnterpriseUser(admin)).toBe(true);

    const groups = getWorkspaceNavDefinition(admin);
    expect(groups.map((group) => group.id)).toContain('organization-management');
    expect(groups.find((group) => group.id === 'data-production')?.items.map((item) => item.id)).toEqual(['datasets', 'templates', 'task-management']);
    expect(canAccessWorkspacePage(admin, 'people-management')).toBe(true);
    expect(canAccessWorkspacePage(admin, 'manual-review')).toBe(true);
  });

  it('limits owner navigation to production, organization and account pages', () => {
    const owner = createUser({ role: 'owner', permissions: [] });

    expect(getEnterpriseWorkspaceRole(owner)).toBe('owner');
    expect(getDefaultWorkspacePage(owner)).toBe('dashboard');
    expect(getWorkspaceNavDefinition(owner).find((group) => group.id === 'data-production')?.items.map((item) => item.id)).toEqual(['datasets', 'templates', 'task-management']);
    expect(getWorkspaceNavDefinition(owner).find((group) => group.id === 'organization-management')?.items.map((item) => item.id)).toEqual(['organization-info', 'people-management']);
    expect(canAccessWorkspacePage(owner, 'datasets')).toBe(true);
    expect(canAccessWorkspacePage(owner, 'publish-task')).toBe(true);
    expect(canAccessWorkspacePage(owner, 'organization-info')).toBe(true);
    expect(canAccessWorkspacePage(owner, 'people-management')).toBe(true);
    expect(canAccessWorkspacePage(owner, 'announcements')).toBe(false);
    expect(canAccessWorkspacePage(owner, 'manual-review')).toBe(true);
  });

  it('builds reviewer navigation without announcements or resource configuration', () => {
    const reviewer = createUser({ role: 'reviewer', permissions: [] });

    expect(getEnterpriseWorkspaceRole(reviewer)).toBe('reviewer');
    expect(canAccessWorkspacePage(reviewer, 'ai-review')).toBe(true);
    expect(canAccessWorkspacePage(reviewer, 'ai-review-task')).toBe(true);
    expect(canAccessWorkspacePage(reviewer, 'manual-review')).toBe(true);
    expect(canAccessWorkspacePage(reviewer, 'organization-info')).toBe(true);
    expect(canAccessWorkspacePage(reviewer, 'resource-config')).toBe(false);
    expect(canAccessWorkspacePage(reviewer, 'people-management')).toBe(true);
    expect(canAccessWorkspacePage(reviewer, 'announcements')).toBe(false);
    expect(canAccessWorkspacePage(reviewer, 'operation-logs')).toBe(false);
    expect(canAccessWorkspacePage(reviewer, 'labeling')).toBe(false);

    const nav = buildWorkspaceNav(reviewer, 'manual-review', () => undefined);
    expect(nav.map((group) => group.id)).toEqual(['workspace-home', 'review-quality', 'organization-management', 'personal-tools']);
    expect(nav[1].items.map((item) => item.id)).toEqual(['ai-review', 'manual-review']);
    expect(nav[1].items[0].active).toBe(false);
    expect(nav[1].items[1].active).toBe(true);
    expect(nav[2].items.map((item) => item.id)).toEqual(['organization-info', 'people-management']);
  });

  it('limits agent navigation to resource pages and account pages', () => {
    const agent = createUser({ role: 'agent', permissions: [] });

    expect(getEnterpriseWorkspaceRole(agent)).toBe('agent');
    expect(canAccessWorkspacePage(agent, 'resource-config')).toBe(true);
    expect(canAccessWorkspacePage(agent, 'announcements')).toBe(false);
    expect(canAccessWorkspacePage(agent, 'operation-logs')).toBe(false);
    expect(canAccessWorkspacePage(agent, 'templates')).toBe(false);
    expect(canAccessWorkspacePage(agent, 'manual-review')).toBe(false);
  });
});
