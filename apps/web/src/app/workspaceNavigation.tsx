import {
  AppstoreOutlined,
  ApiOutlined,
  AuditOutlined,
  BellOutlined,
  DatabaseOutlined,
  EditOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  OrderedListOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  SlidersOutlined,
  TeamOutlined,
  TrophyOutlined,
  StarOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import type { AppShellNavGroup } from '../components/layout/AppShell';
import type { WorkspacePage } from '../pages/workspace/WorkspaceApp';
import type { ApiUser } from '../types/api';
import { getEnterpriseWorkspaceRole, isTeamLabelerUser } from './workspaceAccess';

export interface WorkspaceNavDefinitionItem {
  id: WorkspacePage;
  label: string;
  icon?: ReactNode;
  activeFor?: WorkspacePage[];
}

export interface WorkspaceNavDefinitionGroup {
  id: string;
  label: string;
  items: WorkspaceNavDefinitionItem[];
}

const enterpriseAdminNav: WorkspaceNavDefinitionGroup[] = [
  {
    id: 'workspace-home',
    label: '主页面',
    items: [
      { id: 'dashboard', label: '主页面', icon: <AppstoreOutlined /> },
    ],
  },
  {
    id: 'data-production',
    label: '数据生产',
    items: [
      { id: 'datasets', label: '数据集管理', icon: <DatabaseOutlined /> },
      { id: 'templates', label: '模板搭建', icon: <SlidersOutlined /> },
      { id: 'task-management', label: '任务管理', icon: <RocketOutlined />, activeFor: ['task-management', 'publish-task'] },
    ],
  },
  {
    id: 'review-quality',
    label: '审核质检',
    items: [
      { id: 'ai-review', label: 'AI预审', icon: <FileSearchOutlined />, activeFor: ['ai-review', 'ai-review-task'] },
      { id: 'manual-review', label: '人工审核', icon: <AuditOutlined /> },
    ],
  },
  {
    id: 'organization-management',
    label: '企业管理',
    items: [
      { id: 'organization-info', label: '企业信息', icon: <SettingOutlined /> },
      { id: 'resource-config', label: '资源配置', icon: <ApiOutlined /> },
      { id: 'people-management', label: '人员管理', icon: <TeamOutlined /> },
      { id: 'announcements', label: '公告通知', icon: <BellOutlined /> },
      { id: 'operation-logs', label: '操作日志', icon: <FileTextOutlined /> },
    ],
  },
  {
    id: 'personal-tools',
    label: '个人工具',
    items: [
      { id: 'account', label: '账号管理', icon: <SettingOutlined /> },
    ],
  },
];

const enterpriseOwnerNav: WorkspaceNavDefinitionGroup[] = [
  enterpriseAdminNav[0],
  enterpriseAdminNav[1],
  {
    id: 'review-quality',
    label: '审核质检',
    items: [
      { id: 'ai-review', label: 'AI预审', icon: <FileSearchOutlined />, activeFor: ['ai-review', 'ai-review-task'] },
      { id: 'manual-review', label: '人工审核', icon: <AuditOutlined /> },
    ],
  },
  {
    id: 'organization-management',
    label: '企业管理',
    items: [
      { id: 'organization-info', label: '企业信息', icon: <SettingOutlined /> },
      { id: 'people-management', label: '团队信息', icon: <TeamOutlined /> },
    ],
  },
  enterpriseAdminNav[4],
];

const readonlyOrganizationNav: WorkspaceNavDefinitionGroup = {
  id: 'organization-management',
  label: '企业管理',
  items: [
    { id: 'organization-info', label: '企业信息', icon: <SettingOutlined /> },
    { id: 'resource-config', label: '资源配置', icon: <ApiOutlined /> },
    { id: 'people-management', label: '人员管理', icon: <TeamOutlined /> },
    { id: 'announcements', label: '公告通知', icon: <BellOutlined /> },
  ],
};

const reviewerOrganizationNav: WorkspaceNavDefinitionGroup = {
  id: 'organization-management',
  label: '企业管理',
  items: [
    { id: 'organization-info', label: '企业信息', icon: <SettingOutlined /> },
    { id: 'people-management', label: '人员管理', icon: <TeamOutlined /> },
  ],
};

const teamLabelerOrganizationNav: WorkspaceNavDefinitionGroup = {
  id: 'organization-management',
  label: '企业管理',
  items: [
    { id: 'organization-info', label: '企业信息', icon: <SettingOutlined /> },
    { id: 'people-management', label: '人员管理', icon: <TeamOutlined /> },
  ],
};

const enterpriseReviewerNav: WorkspaceNavDefinitionGroup[] = [
  enterpriseAdminNav[0],
  {
    id: 'review-quality',
    label: '审核质检',
    items: [
      { id: 'ai-review', label: 'AI预审', icon: <FileSearchOutlined />, activeFor: ['ai-review', 'ai-review-task'] },
      { id: 'manual-review', label: '人工审核', icon: <AuditOutlined /> },
    ],
  },
  reviewerOrganizationNav,
  enterpriseAdminNav[4],
];

const enterpriseAgentNav: WorkspaceNavDefinitionGroup[] = [
  enterpriseAdminNav[0],
  {
    id: 'review-quality',
    label: '审核质检',
    items: [
      { id: 'ai-review', label: 'AI预审', icon: <FileSearchOutlined />, activeFor: ['ai-review', 'ai-review-task'] },
    ],
  },
  {
    id: 'organization-management',
    label: '企业管理',
    items: [
      { id: 'resource-config', label: '资源配置', icon: <ApiOutlined /> },
    ],
  },
  enterpriseAdminNav[4],
];

const labelerNav: WorkspaceNavDefinitionGroup[] = [
  {
    id: 'labeler-workbench',
    label: '批注工作台',
    items: [
      { id: 'labeler-dashboard', label: '主页面', icon: <AppstoreOutlined /> },
      { id: 'labeler-tasks', label: '我的任务', icon: <EditOutlined />, activeFor: ['labeler-tasks', 'labeling'] },
      { id: 'labeler-questions', label: '任务历史', icon: <OrderedListOutlined /> },
    ],
  },
  {
    id: 'labeler-account',
    label: '个人工具',
    items: [
      { id: 'account-profile', label: '基础信息', icon: <SettingOutlined /> },
      { id: 'account-certifications', label: '资质认证', icon: <SafetyCertificateOutlined />, activeFor: ['account-certifications', 'account-certification-form', 'certification-rules', 'certification-material-guide', 'certification-user-agreement'] },
      { id: 'account-points', label: '积分管理', icon: <TrophyOutlined />, activeFor: ['account-points', 'points-level-rules'] },
      { id: 'account-reputation', label: '信誉分管理', icon: <StarOutlined /> },
      { id: 'account', label: '账号管理', icon: <SettingOutlined /> },
    ],
  },
];

const teamLabelerNav: WorkspaceNavDefinitionGroup[] = [
  {
    id: 'team-labeler-workbench',
    label: '企业项目',
    items: [
      { id: 'labeler-dashboard', label: '主页面', icon: <AppstoreOutlined /> },
      { id: 'labeler-tasks', label: '我的项目', icon: <EditOutlined />, activeFor: ['labeler-tasks', 'labeling'] },
      { id: 'labeler-questions', label: '项目历史', icon: <OrderedListOutlined /> },
    ],
  },
  teamLabelerOrganizationNav,
  {
    id: 'labeler-personal-tools',
    label: '个人工具',
    items: [
      { id: 'account', label: '账号管理', icon: <SettingOutlined /> },
    ],
  },
];

export function getWorkspaceNavDefinition(user: ApiUser): WorkspaceNavDefinitionGroup[] {
  const role = getEnterpriseWorkspaceRole(user);

  if (role === 'admin') {
    return enterpriseAdminNav;
  }

  if (role === 'owner') {
    return enterpriseOwnerNav;
  }

  if (role === 'reviewer') {
    return enterpriseReviewerNav;
  }

  if (role === 'agent') {
    return enterpriseAgentNav;
  }

  if (isTeamLabelerUser(user)) {
    return teamLabelerNav;
  }

  return labelerNav;
}

export function buildWorkspaceNav(
  user: ApiUser,
  currentPage: WorkspacePage,
  onSelectPage: (page: WorkspacePage) => void,
): AppShellNavGroup[] {
  return getWorkspaceNavDefinition(user).map((group) => ({
    id: group.id,
    label: group.label,
    items: group.items.map((item) => ({
      id: item.id,
      label: item.label,
      icon: item.icon,
      active: (item.activeFor ?? [item.id]).includes(currentPage),
      onSelect: () => onSelectPage(item.id),
    })),
  }));
}

export function getDefaultWorkspacePage(user: ApiUser): WorkspacePage {
  if (isTeamLabelerUser(user) || user.role === 'labeler') return 'labeler-dashboard';
  return getEnterpriseWorkspaceRole(user) ? 'dashboard' : 'account-profile';
}

export function canAccessWorkspacePage(user: ApiUser, page: WorkspacePage): boolean {
  if (page === 'personal-inbox') return true;
  const allowedPages = new Set(
    getWorkspaceNavDefinition(user)
      .flatMap((group) => group.items)
      .flatMap((item) => [item.id, ...(item.activeFor ?? [])]),
  );

  return allowedPages.has(page);
}

export function getDashboardShortcut(user: ApiUser): { page: WorkspacePage; label: string } {
  const role = getEnterpriseWorkspaceRole(user);

  if (role === 'reviewer') {
    return { page: 'manual-review', label: '进入人工审核' };
  }

  if (role === 'agent') {
    return { page: 'resource-config', label: '进入资源配置' };
  }

  if (role === 'admin' || role === 'owner') {
    return { page: 'datasets', label: '进入数据集管理' };
  }

  return { page: 'labeler-tasks', label: '查看我的任务' };
}
