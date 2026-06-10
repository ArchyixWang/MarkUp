import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Avatar, Button, Drawer, Dropdown, Form, Input, Menu, Modal, Select, Space, Tag, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, EyeOutlined, HistoryOutlined, MailOutlined, SafetyCertificateOutlined, StopOutlined, SyncOutlined } from '@ant-design/icons';
import { ApiClientError } from '../../services/apiClient';
import { toAbsoluteAppUrl } from '../../services/appLink';
import { getStoredSession } from '../../stores/authStore';
import {
  batchUpdateTeamMemberRole,
  createMemberAccount,
  getAdminOverview,
  getTeamMembers,
  importTeamMembers,
  inviteTeamMember,
  listTeamInvitations,
  removeTeamMember,
  resendTeamInvitation,
  revokeTeamInvitation,
  sendMemberSecurityReminder,
  updateTeamMember,
} from '../../services/workspaceService';
import type { TeamDetail, TeamInvitationPayload, TeamInvitationRecord, TeamMember } from '../../types/api';
import { apiDateTimeValue, formatApiDateTime } from '../../utils/dateTime';
import type { OperationLogFilters } from './OperationLogsPage';
import { WorkspaceLoading } from './WorkspaceLoading';
import { WorkspaceSummaryStrip } from './WorkspaceListPrimitives';
import { fixedTablePagination, workspacePopupContainer } from './workspaceListHelpers';
import { EnhancedTable } from '../../components/ui/EnhancedTable';
import { WorkspaceTableActions } from './WorkspaceTableActions';

type MemberRole = 'owner' | 'reviewer' | 'labeler';
type MemberFormMode = 'create' | 'invite_email' | 'invite_code';
const memberTableScrollX = 1510;
const invitationTableScrollX = 980;
const memberTimeFilterNow = Date.now();

const roleOptions: Array<{ value: MemberRole; label: string }> = [
  { value: 'owner', label: 'Owner' },
  { value: 'reviewer', label: 'Reviewer' },
  { value: 'labeler', label: 'Labeler' },
];

const roleFilterOptions = [
  { value: 'all', label: '全部角色' },
  { value: 'team_admin', label: 'Team Admin' },
  ...roleOptions,
  { value: 'agent', label: 'Agent' },
];

const statusOptions = [
  { value: 'all', label: '全部状态' },
  { value: 'active', label: '正常' },
  { value: 'disabled', label: '禁用' },
];

const roleColors: Record<string, string> = {
  team_admin: 'blue',
  owner: 'orange',
  reviewer: 'purple',
  agent: 'cyan',
  labeler: 'green',
};

const invitationStatusLabels: Record<string, string> = {
  pending: '待接受',
  accepted: '已接受',
  rejected: '已拒绝',
  expired: '已过期',
  revoked: '已撤销',
};

const invitationStatusColors: Record<string, string> = {
  pending: 'orange',
  accepted: 'green',
  rejected: 'red',
  expired: 'default',
  revoked: 'default',
};

function buildTableFilterOptions(values: Array<string | null | undefined>) {
  return Array.from(
    new Map(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
        .map((value) => [value, { text: value, value }]),
    ).values(),
  );
}

function compareText(left?: string | null, right?: string | null) {
  return (left ?? '').localeCompare(right ?? '', 'zh-CN');
}

function compareNumber(left?: number | null, right?: number | null) {
  return (left ?? 0) - (right ?? 0);
}

function compareDateTime(left?: string | null, right?: string | null) {
  return apiDateTimeValue(left) - apiDateTimeValue(right);
}

const invitationModeLabels: Record<string, string> = {
  email: '邮箱邀请',
  code: '邀请码加入',
};

const usernamePattern = /^[a-z][a-z0-9_]{3,31}$/;

interface MemberFormValues {
  username?: string;
  display_name?: string;
  email?: string;
  password?: string;
  team_role: MemberRole;
  message?: string;
  expire_hours?: number;
}

function isImmutableSystemMember(member: TeamMember | null | undefined): boolean {
  return Boolean(member && (member.is_system_member || member.team_role === 'agent'));
}

function isLockedTeamAdminMember(member: TeamMember | null | undefined): boolean {
  return Boolean(member && member.team_role === 'team_admin');
}

function isManagementLockedMember(member: TeamMember | null | undefined): boolean {
  return isImmutableSystemMember(member) || isLockedTeamAdminMember(member);
}

function getTeamRoleDisplayLabel(member: Pick<TeamMember, 'team_role' | 'team_role_label' | 'is_system_member'> | Pick<TeamInvitationRecord, 'team_role' | 'team_role_label'> | null | undefined): string {
  if (!member) return '-';
  if (member.team_role === 'agent' || ('is_system_member' in member && member.is_system_member)) return 'Agent';
  return member.team_role_label || member.team_role || '-';
}

function getMemberPositionDisplayLabel(member: Pick<TeamMember, 'position'> | null | undefined): string {
  if (!member) return '-';
  return 'position' in member && typeof member.position === 'string' && member.position.trim() ? member.position.trim() : '-';
}

function getMemberDisplayName(member: Pick<TeamMember, 'display_name' | 'username' | 'email' | 'user_id'> | null | undefined): string {
  if (!member) return '-';
  return member.display_name?.trim() || member.username?.trim() || member.email || member.user_id || '-';
}

function normalizeInvitationPayload<T extends { invite_url?: string }>(payload: T): T {
  return {
    ...payload,
    invite_url: payload.invite_url ? toAbsoluteAppUrl(payload.invite_url) : payload.invite_url,
  };
}

export function PeopleManagementPage({ onOpenLogs, readonly = false }: { onOpenLogs?: (filters?: OperationLogFilters) => void; readonly?: boolean }) {
  const sessionUser = useMemo(
    () => (getStoredSession(window.localStorage) ?? getStoredSession(window.sessionStorage))?.user ?? null,
    [],
  );
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [sortMode, setSortMode] = useState('joined_desc');
  const [formMode, setFormMode] = useState<MemberFormMode>('create');
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [invitationDrawerOpen, setInvitationDrawerOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [batchRoleModalOpen, setBatchRoleModalOpen] = useState(false);
  const [securityReminderModalOpen, setSecurityReminderModalOpen] = useState(false);
  const [invitationLoading, setInvitationLoading] = useState(false);
  const [invitations, setInvitations] = useState<TeamInvitationRecord[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [detailMember, setDetailMember] = useState<TeamMember | null>(null);
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [generatedInvitation, setGeneratedInvitation] = useState<TeamInvitationPayload | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [form] = Form.useForm<MemberFormValues>();
  const [editForm] = Form.useForm<{ team_role: MemberRole; status: 'active' | 'disabled' }>();
  const [batchRoleForm] = Form.useForm<{ team_role: MemberRole }>();
  const [securityReminderForm] = Form.useForm<{ title: string; content: string }>();
  const [importForm] = Form.useForm<{ default_password: string; rows_text: string }>();
  const skipNextFilterLoad = useRef(false);

  const canManageMembers = useMemo(
    () => {
      const roleAllowed = sessionUser ? ['admin', 'team_admin', 'owner'].includes(sessionUser.role) : false;
      const permissionAllowed = sessionUser
        ? sessionUser.permissions.some((permission) => ['team:manage', 'member:create', 'member:update', 'member:invite', 'member:delete'].includes(permission))
        : false;
      const currentMemberCanManage = members.some((member) => member.is_current_user && (member.actions?.can_edit || member.actions?.can_remove || member.actions?.can_disable || ['team_admin', 'owner'].includes(member.team_role)));
      return !readonly && (roleAllowed || permissionAllowed || currentMemberCanManage);
    },
    [members, readonly, sessionUser],
  );

  const visibleMembers = useMemo(() => {
    const rank: Record<string, number> = { team_admin: 1, owner: 2, reviewer: 3, agent: 4, labeler: 5 };
    return [...members].sort((left, right) => {
      if (sortMode === 'role') return (rank[left.team_role] ?? 99) - (rank[right.team_role] ?? 99);
      if (sortMode === 'name') return getMemberDisplayName(left).localeCompare(getMemberDisplayName(right));
      if (sortMode === 'tasks') return (right.assigned_task_count ?? 0) - (left.assigned_task_count ?? 0);
      return String(right.joined_at || '').localeCompare(String(left.joined_at || ''));
    });
  }, [members, sortMode]);

  const memberStats = useMemo(() => ({
    total: members.length,
    active: members.filter((member) => member.member_status !== 'disabled').length,
    disabled: members.filter((member) => member.member_status === 'disabled').length,
    unverified: members.filter((member) => member.email_verified === false).length,
  }), [members]);

  const selectedMembers = useMemo(
    () => members.filter((member) => selectedRowKeys.includes(member.user_id)),
    [members, selectedRowKeys],
  );

  const removableSelectedMembers = useMemo(
    () => selectedMembers.filter((member) => member.actions?.can_remove && !member.is_current_user && !isManagementLockedMember(member)),
    [selectedMembers],
  );

  const roleEditableSelectedMembers = useMemo(
    () => selectedMembers.filter((member) => member.actions?.can_edit && !member.is_current_user && !isManagementLockedMember(member)),
    [selectedMembers],
  );

  const reminderTargetMembers = useMemo(
    () => selectedMembers.filter((member) => member.actions?.can_edit && !member.is_current_user && member.member_status !== 'disabled' && !isImmutableSystemMember(member)),
    [selectedMembers],
  );

  const loadMembers = async (targetTeam = team) => {
    if (!targetTeam) return;
    setTableLoading(true);
    setActionError(null);
    try {
      const data = await getTeamMembers(targetTeam.team_id, {
        role: roleFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
        keyword,
      });
      setMembers(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '成员列表加载失败');
      setMembers([]);
    } finally {
      setTableLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const scopedTeamId = sessionUser?.team_id || sessionUser?.default_team_id || undefined;
    if (readonly && scopedTeamId) {
      const fallbackTeam: TeamDetail = {
        team_id: scopedTeamId,
        company_name: sessionUser?.team_name || sessionUser?.default_team_name || '当前企业',
        owner_user_id: '',
        industry: '',
        contact_phone: '',
        description: '',
        logo_url: '',
        website: '',
        address: '',
        status: 'active',
        verification_status: 'unknown',
        member_count: 0,
        member_stats: { team_admins: 0, owners: 0, reviewers: 0, agents: 0, labelers: 0 },
        created_at: '',
      };
      setTeam(fallbackTeam);
      void getTeamMembers(scopedTeamId, { status: 'active' })
        .then((data) => {
          if (!active) return;
          skipNextFilterLoad.current = true;
          setTeam(fallbackTeam);
          setMembers(Array.isArray(data.items) ? data.items : []);
        })
        .catch((err) => {
          if (active) {
            setTeam(fallbackTeam);
            setActionError(err instanceof ApiClientError ? err.message : '成员列表加载失败');
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }
    void getAdminOverview()
      .then(async (overview) => {
        if (!active) return;
        const currentTeam = overview.teams.find((item) => item.team_id === overview.default_team_id) ?? overview.teams[0] ?? null;
        let initialMembers: TeamMember[] = [];
        if (currentTeam) {
          const data = await getTeamMembers(currentTeam.team_id, { status: 'active' });
          initialMembers = Array.isArray(data.items) ? data.items : [];
        }
        if (active) {
          skipNextFilterLoad.current = true;
          setTeam(currentTeam);
          setMembers(initialMembers);
        }
      })
      .catch((err) => {
        if (active) setActionError(err instanceof ApiClientError ? err.message : '企业信息加载失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [readonly, sessionUser]);

  useEffect(() => {
    if (!team || loading) return;
    if (skipNextFilterLoad.current) {
      skipNextFilterLoad.current = false;
      return;
    }
    void loadMembers(team);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team, roleFilter, statusFilter, keyword]);

  const openMemberModal = (mode: MemberFormMode) => {
    setFormMode(mode);
    setGeneratedInvitation(null);
    form.setFieldsValue({
      username: '',
      display_name: '',
      email: undefined,
      password: 'SecurePass123!',
      team_role: 'owner',
      message: '邀请你加入 MarkUp 企业',
      expire_hours: 72,
    });
    setMemberModalOpen(true);
  };

  const submitMember = async (values: MemberFormValues) => {
    if (!team) return;
    setActionError(null);
    setMessage(null);
    try {
      if (formMode === 'create') {
        const created = await createMemberAccount(team.team_id, {
          username: values.username?.trim() || '',
          display_name: values.display_name?.trim() || '',
          email: values.email?.trim() || '',
          password: values.password || 'SecurePass123!',
          team_role: values.team_role,
          send_email: false,
        });
        setMembers((items) => [created, ...items.filter((item) => item.user_id !== created.user_id)]);
        setGeneratedInvitation(null);
        setMessage('成员账号已创建');
        setMemberModalOpen(false);
      } else {
        const invite = await inviteTeamMember(team.team_id, {
          invite_mode: formMode === 'invite_code' ? 'code' : 'email',
          email: formMode === 'invite_email' ? values.email?.trim() : undefined,
          team_role: values.team_role,
          message: values.message,
          expire_hours: values.expire_hours ?? 72,
        });
        const normalizedInvite = normalizeInvitationPayload(invite);
        if (formMode === 'invite_code') {
          setGeneratedInvitation(normalizedInvite);
          setMessage('邀请码已生成');
        } else {
          setGeneratedInvitation(null);
          setMessage(`邀请已发送：${normalizedInvite.invite_url}`);
          setMemberModalOpen(false);
        }
      }
      await loadMembers(team);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '成员操作失败');
    }
  };

  const closeMemberModal = () => {
    setMemberModalOpen(false);
    setGeneratedInvitation(null);
  };

  const copyInvitationValue = async (value: string, successText: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        setMessage(successText);
        return;
      }
    } catch {
      // Fall through to message fallback.
    }
    setMessage(`${successText}：${value}`);
  };

  const openEdit = (member: TeamMember) => {
    if (isManagementLockedMember(member)) return;
    setEditMember(member);
    editForm.setFieldsValue({
      team_role: member.team_role as MemberRole,
      status: member.member_status === 'disabled' ? 'disabled' : 'active',
    });
  };

  const submitEdit = async (values: { team_role: MemberRole; status: 'active' | 'disabled' }) => {
    if (!team || !editMember) return;
    setActionError(null);
    try {
      const updated = await updateTeamMember(team.team_id, editMember.user_id, values);
      setMembers((items) => items.map((item) => (item.user_id === updated.user_id ? updated : item)));
      setEditMember(null);
      setMessage('成员信息已更新');
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '成员更新失败');
    }
  };

  const removeMember = (member: TeamMember) => {
    if (!team) return;
    if (isManagementLockedMember(member)) return;
    Modal.confirm({
      title: '移除成员？',
      content: `将从企业中移除 ${getMemberDisplayName(member)}，历史提交、审核和审计记录会保留。`,
      okText: '移除成员',
      okButtonProps: { danger: true },
      onOk: async () => {
        await removeTeamMember(team.team_id, member.user_id);
        setMembers((items) => items.filter((item) => item.user_id !== member.user_id));
        setMessage('成员已移除');
      },
    });
  };

  const batchRemoveMembers = () => {
    if (!team || selectedMembers.length === 0) return;
    const skippedCount = selectedMembers.length - removableSelectedMembers.length;
    Modal.confirm({
      title: '批量移除成员？',
      content: `将移除 ${removableSelectedMembers.length} 名可移除成员，历史提交、审核和审计记录会保留。${skippedCount > 0 ? ` ${skippedCount} 名成员因权限或当前用户限制会被跳过。` : ''}`,
      okText: '批量移除',
      okButtonProps: { danger: true, disabled: removableSelectedMembers.length === 0 },
      onOk: async () => {
        const ids = removableSelectedMembers.map((member) => member.user_id);
        await Promise.all(ids.map((userId) => removeTeamMember(team.team_id, userId)));
        setMembers((items) => items.filter((item) => !ids.includes(item.user_id)));
        setSelectedRowKeys([]);
        setMessage(`已移除 ${ids.length} 名成员`);
      },
    });
  };

  const openBatchRoleModal = () => {
    batchRoleForm.setFieldsValue({ team_role: 'reviewer' });
    setBatchRoleModalOpen(true);
  };

  const submitBatchRole = async (values: { team_role: MemberRole }) => {
    if (!team || roleEditableSelectedMembers.length === 0) return;
    setActionError(null);
    try {
      const data = await batchUpdateTeamMemberRole(team.team_id, {
        user_ids: roleEditableSelectedMembers.map((member) => member.user_id),
        team_role: values.team_role,
      });
      setMembers((items) => items.map((item) => data.members.find((member) => member.user_id === item.user_id) || item));
      setSelectedRowKeys([]);
      setBatchRoleModalOpen(false);
      setMessage(`已批量更新 ${data.updated_count} 名成员角色${data.skipped_count ? `，跳过 ${data.skipped_count} 名` : ''}`);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '批量更新角色失败');
    }
  };

  const openImportModal = () => {
    importForm.setFieldsValue({
      default_password: 'SecurePass123!',
      rows_text: 'email,role,username,display_name,password\nlabeler3@example.com,labeler,labeler03,Labeler Three,SecurePass123!',
    });
    setImportModalOpen(true);
  };

  const submitImportMembers = async (values: { default_password: string; rows_text: string }) => {
    if (!team) return;
    setActionError(null);
    try {
      const rows = parseImportRows(values.rows_text);
      const data = await importTeamMembers(team.team_id, {
        default_password: values.default_password?.trim() || undefined,
        rows,
      });
      setMembers((items) => {
        const importedIds = new Set(data.members.map((member) => member.user_id));
        return [...data.members, ...items.filter((item) => !importedIds.has(item.user_id))];
      });
      setImportModalOpen(false);
      setMessage(`已导入 ${data.imported_count} 名成员${data.skipped_count ? `，跳过 ${data.skipped_count} 行` : ''}`);
      await loadMembers(team);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '批量导入成员失败');
    }
  };

  const openSecurityReminderModal = (targets = reminderTargetMembers) => {
    const availableTargets = targets.filter((member) => !isImmutableSystemMember(member));
    setSelectedRowKeys(availableTargets.map((member) => member.user_id));
    securityReminderForm.setFieldsValue({
      title: '账号安全提醒',
      content: '请尽快检查账号安全设置，开启双重验证并确认邮箱和联系方式。',
    });
    setSecurityReminderModalOpen(true);
  };

  const submitSecurityReminder = async (values: { title: string; content: string }) => {
    if (!team || reminderTargetMembers.length === 0) return;
    setActionError(null);
    try {
      const data = await sendMemberSecurityReminder(team.team_id, {
        user_ids: reminderTargetMembers.map((member) => member.user_id),
        title: values.title,
        content: values.content,
      });
      setSelectedRowKeys([]);
      setSecurityReminderModalOpen(false);
      setMessage(`已发送安全提醒给 ${data.sent_count} 名成员${data.skipped_count ? `，跳过 ${data.skipped_count} 名` : ''}`);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '安全提醒发送失败');
    }
  };

  const exportMembers = () => {
    const headers = ['成员', '用户名', '角色', '状态', '邮箱', '邮箱验证', '分配任务数', '加入时间'];
    const rows = visibleMembers.map((member) => [
      getMemberDisplayName(member),
      member.username || '',
      getTeamRoleDisplayLabel(member),
      member.member_status || 'active',
      member.email || '',
      member.email_verified === false ? '未验证' : '已验证',
      String(member.assigned_task_count ?? 0),
      member.joined_at || '',
    ]);
    downloadCsv(`${team?.company_name || 'team'}_members.csv`, [headers, ...rows]);
    setMessage('成员清单已生成下载');
  };

  const openInvitations = async () => {
    if (!team) return;
    setInvitationDrawerOpen(true);
    setInvitationLoading(true);
    setActionError(null);
    try {
      const data = await listTeamInvitations(team.team_id);
      setInvitations(Array.isArray(data.items) ? data.items.map((item) => normalizeInvitationPayload(item)) : []);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '邀请记录加载失败');
      setInvitations([]);
    } finally {
      setInvitationLoading(false);
    }
  };

  const refreshInvitations = async () => {
    if (!team) return;
    const data = await listTeamInvitations(team.team_id);
    setInvitations(Array.isArray(data.items) ? data.items.map((item) => normalizeInvitationPayload(item)) : []);
  };

  const handleResendInvitation = async (invitation: TeamInvitationRecord) => {
    if (!team) return;
    setInvitationLoading(true);
    setActionError(null);
    try {
      const data = await resendTeamInvitation(team.team_id, invitation.invitation_id, {
        message: invitation.message || undefined,
        expire_hours: 72,
      });
      const normalized = normalizeInvitationPayload(data);
      await refreshInvitations();
      if ((invitation.invite_mode ?? 'email') === 'code') {
        setGeneratedInvitation(normalized);
        setMemberModalOpen(true);
        setFormMode('invite_code');
        setMessage('邀请码已重新生成');
      } else {
        setMessage(normalized.invite_url ? `邀请已重发：${normalized.invite_url}` : '邀请已重发');
      }
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '邀请重发失败');
    } finally {
      setInvitationLoading(false);
    }
  };

  const handleRevokeInvitation = async (invitation: TeamInvitationRecord) => {
    if (!team) return;
    setInvitationLoading(true);
    setActionError(null);
    try {
      const data = await revokeTeamInvitation(team.team_id, invitation.invitation_id, '管理员在人员管理页撤销邀请');
      setInvitations((current) => current.map((item) => (item.invitation_id === invitation.invitation_id ? { ...item, ...data } : item)));
      setMessage('邀请已撤销');
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '邀请撤销失败');
    } finally {
      setInvitationLoading(false);
    }
  };

  const moreMenu: MenuProps['items'] = [
    { key: 'import', label: '批量导入成员', onClick: openImportModal },
    { key: 'export', label: '导出成员清单', onClick: exportMembers },
    { key: 'invite-log', label: '查看邀请记录', onClick: () => void openInvitations() },
    { key: 'audit', label: '查看成员操作日志', onClick: () => onOpenLogs?.({ entity_type: 'team_member' }) },
    { type: 'divider' },
    { key: 'security-reminder', label: '发送安全提醒', disabled: reminderTargetMembers.length === 0, onClick: () => openSecurityReminderModal() },
    { key: 'batch-delete', label: '批量删除成员', danger: true, disabled: selectedMembers.length === 0, onClick: batchRemoveMembers },
  ];

  if (loading) return <main className="workspace-content workspace-loading-page"><WorkspaceLoading tip="正在加载人员管理" /></main>;
  if (!team) return <main className="workspace-content"><Alert className="inline-message-ant" type="warning" showIcon title="请先完成企业企业配置。" /></main>;

  return (
    <main className="workspace-content people-management-page production-list-page workspace-fixed-page">
      <section className="page-heading">
        <div>
          <p className="section-kicker">People</p>
          <h1>人员管理</h1>
        </div>
        <div className="page-actions">
          <Tag color="blue">当前企业：{team.company_name}</Tag>
          <Button onClick={() => void loadMembers()}>刷新</Button>
        </div>
      </section>

      <WorkspaceSummaryStrip
        ariaLabel="人员概览"
        items={[
          { key: 'visible', label: '当前筛选', value: visibleMembers.length },
          { key: 'active', label: '正常成员', value: memberStats.active },
          { key: 'disabled', label: '禁用成员', value: memberStats.disabled },
          { key: 'unverified', label: '邮箱未验证', value: memberStats.unverified },
        ]}
      />

      {message && <Alert className="inline-message-ant" type="success" showIcon closable onClose={() => setMessage(null)} message={message} />}
      {actionError && <Alert className="inline-message-ant" type="error" showIcon closable onClose={() => setActionError(null)} message={actionError} />}

      <div className="production-filter-bar workspace-fixed-toolbar">
        <Input.Search className="production-filter-search" aria-label="搜索成员" allowClear placeholder="搜索姓名、用户名、邮箱、手机号或职位" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
        <Select className="production-filter-select" aria-label="角色筛选" value={roleFilter} onChange={setRoleFilter} getPopupContainer={workspacePopupContainer} options={roleFilterOptions} />
        <Select className="production-filter-select" aria-label="状态筛选" value={statusFilter} onChange={setStatusFilter} getPopupContainer={workspacePopupContainer} options={statusOptions} />
        <Select className="production-filter-select" aria-label="排序" value={sortMode} onChange={setSortMode} getPopupContainer={workspacePopupContainer} options={[
          { value: 'joined_desc', label: '最近加入' },
          { value: 'role', label: '角色' },
          { value: 'name', label: '姓名' },
          { value: 'tasks', label: '任务数' },
        ]} />
        {!readonly && (canManageMembers ? (
          <Button type="primary" onClick={() => openMemberModal('create')}>添加成员</Button>
        ) : (
          <Tooltip title="只有 Owner 或成员管理权限用户可以添加成员"><Button disabled>添加成员</Button></Tooltip>
        ))}
        {canManageMembers && <Dropdown getPopupContainer={workspacePopupContainer} menu={{ items: moreMenu }}><Button aria-label="更多成员操作">更多</Button></Dropdown>}
      </div>

      <section className="member-table-panel production-table-shell workspace-fixed-table-panel">
        {!readonly && selectedMembers.length > 0 && (
          <Alert
            className="inline-message-ant"
            type="info"
            showIcon
            title={`已选择 ${selectedMembers.length} 名成员`}
            description={`可批量改角色 ${roleEditableSelectedMembers.length} 名，可发送安全提醒 ${reminderTargetMembers.length} 名，可批量移除 ${removableSelectedMembers.length} 名；其余成员会因权限、当前用户或禁用状态限制跳过。`}
            action={(
              <Space>
                <Button disabled={roleEditableSelectedMembers.length === 0} onClick={openBatchRoleModal}>批量改角色</Button>
                <Button disabled={reminderTargetMembers.length === 0} onClick={() => openSecurityReminderModal()}>发送安全提醒</Button>
                <Button danger disabled={removableSelectedMembers.length === 0} onClick={batchRemoveMembers}>批量移除</Button>
              </Space>
            )}
          />
        )}
        <EnhancedTable<TeamMember>
          className="workspace-fixed-table"
          rowKey="user_id"
          loading={tableLoading}
          dataSource={visibleMembers}
          rowSelection={readonly ? undefined : {
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys.map(String)),
            getCheckboxProps: (member) => ({
              disabled: member.is_current_user || isManagementLockedMember(member) || (!member.actions?.can_edit && !member.actions?.can_remove),
              name: getMemberDisplayName(member),
            }),
          }}
          pagination={fixedTablePagination(visibleMembers.length)}
          scroll={{ x: memberTableScrollX, y: 'calc(var(--workspace-table-body-height) - 56px)' }}
          tableLayout="fixed"
          columns={decorateMemberColumns([
            {
              title: '成员',
              width: 230,
              key: 'member',
              sorter: (left, right) => compareText(getMemberDisplayName(left), getMemberDisplayName(right)),
              render: (_, member) => (
                <button type="button" className="member-identity-cell" onClick={() => setDetailMember(member)}>
                  <Avatar size={36} src={member.avatar}>{getMemberDisplayName(member).slice(0, 1).toUpperCase()}</Avatar>
                  <span>
                    <strong>
                      {getMemberDisplayName(member)}
                    </strong>
                    <small>{member.username || '-'} · {member.member_status || 'active'}{member.is_current_user ? ' · 我' : ''}</small>
                  </span>
                </button>
              ),
            },
            {
              title: '角色',
              width: 130,
              key: 'role',
              filters: buildTableFilterOptions(members.map((member) => getTeamRoleDisplayLabel(member))),
              filterSearch: true,
              onFilter: (value, member) => getTeamRoleDisplayLabel(member) === String(value),
              sorter: (left, right) => compareText(getTeamRoleDisplayLabel(left), getTeamRoleDisplayLabel(right)),
              render: (_, member) => (
                <Tag color={roleColors[member.team_role] || 'default'}>{getTeamRoleDisplayLabel(member)}</Tag>
              ),
            },
            {
              title: '职位',
              width: 130,
              key: 'position',
              filters: buildTableFilterOptions(members.map((member) => getMemberPositionDisplayLabel(member)).filter((value) => value !== '-')),
              filterSearch: true,
              onFilter: (value, member) => getMemberPositionDisplayLabel(member) === String(value),
              sorter: (left, right) => compareText(getMemberPositionDisplayLabel(left), getMemberPositionDisplayLabel(right)),
              render: (_, member) => getMemberPositionDisplayLabel(member),
            },
            {
              title: '手机号',
              width: 130,
              key: 'phone',
              sorter: (left, right) => compareText(left.phone, right.phone),
              render: (_, member) => member.phone || '-',
            },
            {
              title: '邮箱',
              width: 230,
              key: 'email',
              sorter: (left, right) => compareText(left.email, right.email),
              render: (_, member) => <span>{member.email || '-'} {member.email_verified === false && <Tag color="orange">未验证</Tag>}</span>,
            },
            {
              title: '任务/审核',
              width: 130,
              key: 'tasks',
              sorter: (left, right) => compareNumber(left.assigned_task_count, right.assigned_task_count),
              render: (_, member) => `${member.assigned_task_count ?? 0} 项分配`,
            },
            {
              title: '最近活跃',
              width: 130,
              key: 'last_active_at',
              filters: [
                { text: '7 天内活跃', value: '7d' },
                { text: '30 天内活跃', value: '30d' },
                { text: '未记录活跃', value: 'never' },
              ],
              onFilter: (value, member) => {
                if (value === 'never') return !member.last_active_at;
                if (!member.last_active_at) return false;
                const days = value === '7d' ? 7 : 30;
                return memberTimeFilterNow - apiDateTimeValue(member.last_active_at) <= days * 24 * 60 * 60 * 1000;
              },
              sorter: (left, right) => compareDateTime(left.last_active_at, right.last_active_at),
              render: (_, member) => formatApiDateTime(member.last_active_at),
            },
            {
              title: '加入时间',
              width: 170,
              key: 'joined_at',
              filters: [
                { text: '近 7 天加入', value: '7d' },
                { text: '近 30 天加入', value: '30d' },
              ],
              onFilter: (value, member) => {
                if (!member.joined_at) return false;
                const days = value === '7d' ? 7 : 30;
                return memberTimeFilterNow - apiDateTimeValue(member.joined_at) <= days * 24 * 60 * 60 * 1000;
              },
              sorter: (left, right) => compareDateTime(left.joined_at, right.joined_at),
              render: (_, member) => formatApiDateTime(member.joined_at),
            },
            {
              title: '操作',
              width: 138,
              key: 'actions',
              fixed: 'right',
              className: 'member-action-cell workspace-table-action-cell',
              render: (_, member) => (
                <WorkspaceTableActions
                  visible={readonly
                    ? [{ key: 'view', label: '查看', icon: <EyeOutlined />, onClick: () => setDetailMember(member) }]
                    : [
                        { key: 'view', label: '查看', icon: <EyeOutlined />, onClick: () => setDetailMember(member) },
                        { key: 'edit', label: '编辑', icon: <EditOutlined />, disabled: !member.actions?.can_edit || isManagementLockedMember(member), onClick: () => openEdit(member) },
                      ]}
                  menu={readonly
                    ? [{ key: 'audit', label: '查看操作日志', icon: <HistoryOutlined />, onClick: () => onOpenLogs?.({ entity_type: 'team_member', entity_id: member.user_id }) }]
                    : [
                        { key: 'audit', label: '查看操作日志', icon: <HistoryOutlined />, onClick: () => onOpenLogs?.({ entity_type: 'team_member', entity_id: member.user_id }) },
                        { key: 'security', label: '发送安全提醒', icon: <SafetyCertificateOutlined />, disabled: !member.actions?.can_edit || member.is_current_user || member.member_status === 'disabled' || isImmutableSystemMember(member), onClick: () => openSecurityReminderModal([member]) },
                        { key: 'disable', label: member.member_status === 'disabled' ? '启用成员' : '禁用成员', icon: member.member_status === 'disabled' ? <SyncOutlined /> : <StopOutlined />, disabled: !member.actions?.can_disable || isManagementLockedMember(member), onClick: () => openEdit(member) },
                        {
                          key: 'remove',
                          label: '移除成员',
                          icon: <DeleteOutlined />,
                          danger: true,
                          disabled: !member.actions?.can_remove || isManagementLockedMember(member),
                          onClick: () => removeMember(member),
                        },
                      ]}
                />
              ),
            },
          ], members)}
        />
      </section>

      <Modal
        title={formMode === 'create' ? '添加成员' : '邀请成员'}
        open={memberModalOpen}
        okText={formMode === 'create' ? '创建成员账号' : formMode === 'invite_code' ? '生成邀请码' : '发送邀请'}
        onCancel={closeMemberModal}
        onOk={() => form.submit()}
      >
        <Menu
          mode="horizontal"
          selectedKeys={[formMode]}
          onClick={({ key }) => {
            setFormMode(key as MemberFormMode);
            setGeneratedInvitation(null);
          }}
          items={[
            { key: 'create', label: '创建账号' },
            { key: 'invite_email', label: '邮箱邀请' },
            { key: 'invite_code', label: '邀请码邀请' },
          ]}
        />
        <Form form={form} layout="vertical" className="member-modal-form" onFinish={submitMember}>
          {formMode === 'create' && (
            <Form.Item
              name="display_name"
              label="显示名"
              rules={[
                { required: true, message: '请输入显示名' },
                {
                  validator: async (_, value?: string) => {
                    const normalized = String(value ?? '').trim();
                    if (!normalized) throw new Error('请输入显示名');
                    if (normalized.length > 32) throw new Error('显示名不能超过 32 个字符');
                  },
                },
              ]}
            >
              <Input maxLength={32} placeholder="张三" />
            </Form.Item>
          )}
          {formMode === 'create' && (
            <Form.Item
              name="username"
              label="登录账号"
              rules={[
                { required: true, message: '请输入登录账号' },
                {
                  validator: async (_, value?: string) => {
                    const normalized = String(value ?? '').trim();
                    if (!usernamePattern.test(normalized)) {
                      throw new Error('登录账号需为 4-32 位，字母开头，仅支持小写字母、数字和下划线');
                    }
                  },
                },
              ]}
            >
              <Input maxLength={32} placeholder="markup_user01" />
            </Form.Item>
          )}
          {formMode === 'create' && (
            <Form.Item
              name="email"
              label="邮箱"
              rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '邮箱格式不正确' }]}
            >
              <Input />
            </Form.Item>
          )}
          {formMode === 'invite_email' && (
            <Form.Item
              name="email"
              label="邮箱"
              rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '邮箱格式不正确' }]}
            >
              <Input />
            </Form.Item>
          )}
          <Form.Item name="team_role" label="成员角色" initialValue="owner" rules={[{ required: true }]}><Select options={roleOptions} /></Form.Item>
          {formMode === 'create' && <Form.Item name="password" label="初始密码" initialValue="SecurePass123!" rules={[{ required: true, message: '请输入初始密码' }]}><Input.Password /></Form.Item>}
          {(formMode === 'invite_email' || formMode === 'invite_code') && <Form.Item name="message" label="邀请说明" initialValue="邀请你加入 MarkUp 企业"><Input.TextArea rows={3} /></Form.Item>}
          {(formMode === 'invite_email' || formMode === 'invite_code') && (
            <Form.Item name="expire_hours" label="有效期" initialValue={72} rules={[{ required: true, message: '请选择有效期' }]}>
              <Select options={[{ value: 24, label: '24 小时' }, { value: 72, label: '72 小时' }, { value: 168, label: '7 天' }]} />
            </Form.Item>
          )}
        </Form>
        {formMode === 'invite_code' && generatedInvitation ? (
          <Alert
            className="inline-message-ant"
            type="success"
            showIcon
            title="邀请码已生成"
            description={(
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <span>供已注册用户在 onboarding 填写企业邀请码加入。</span>
                <Input readOnly value={generatedInvitation.invite_code} addonAfter={<Button type="link" size="small" onClick={() => void copyInvitationValue(generatedInvitation.invite_code, '邀请码已复制')}>复制</Button>} />
                <Input readOnly value={generatedInvitation.invite_url} addonAfter={<Button type="link" size="small" onClick={() => void copyInvitationValue(generatedInvitation.invite_url, '邀请链接已复制')}>复制</Button>} />
                <span>过期时间：{formatApiDateTime(generatedInvitation.expire_at)}</span>
              </Space>
            )}
          />
        ) : null}
      </Modal>

      <Drawer title="成员详情" size="large" open={Boolean(detailMember)} onClose={() => setDetailMember(null)}>
        {detailMember && (
          <div className="member-detail-drawer">
            <Avatar size={48} src={detailMember.avatar}>{getMemberDisplayName(detailMember).slice(0, 1).toUpperCase()}</Avatar>
            <h3>{getMemberDisplayName(detailMember)}</h3>
            <dl>
              <div><dt>用户名</dt><dd>{detailMember.username || '-'}</dd></div>
              <div><dt>邮箱</dt><dd>{detailMember.email || '-'}</dd></div>
              <div><dt>角色</dt><dd>{getTeamRoleDisplayLabel(detailMember)}</dd></div>
              <div><dt>成员类型</dt><dd>{isImmutableSystemMember(detailMember) ? 'Agent' : '企业成员'}</dd></div>
              <div><dt>职位</dt><dd>{getMemberPositionDisplayLabel(detailMember)}</dd></div>
              <div><dt>手机号</dt><dd>{detailMember.phone || '-'}</dd></div>
              <div><dt>权限数</dt><dd>{detailMember.permission_count ?? detailMember.permissions?.length ?? 0}</dd></div>
              <div><dt>审核任务</dt><dd>{detailMember.assigned_task_count ?? 0}</dd></div>
              <div><dt>加入时间</dt><dd>{formatApiDateTime(detailMember.joined_at)}</dd></div>
            </dl>
            <Alert
              type="info"
              showIcon
              title="可查看成员日志。"
              action={(
                <Space>
                  <Button size="small" onClick={() => onOpenLogs?.({ entity_type: 'team_member', entity_id: detailMember.user_id })}>查看成员操作日志</Button>
                </Space>
              )}
            />
          </div>
        )}
      </Drawer>

      <Modal
        title="批量修改成员角色"
        open={batchRoleModalOpen}
        okText="确认修改"
        onCancel={() => setBatchRoleModalOpen(false)}
        onOk={() => batchRoleForm.submit()}
      >
        <Alert
          className="inline-message-ant"
          type="warning"
          showIcon
          title={`将修改 ${roleEditableSelectedMembers.length} 名可编辑成员的企业角色`}
          description="当前用户和不可编辑成员会被跳过；角色变更会重置为目标角色的默认权限，并写入操作日志。"
        />
        <Form form={batchRoleForm} layout="vertical" onFinish={submitBatchRole}>
          <Form.Item name="team_role" label="目标角色" rules={[{ required: true, message: '请选择目标角色' }]}>
            <Select options={roleOptions} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="批量导入成员"
        open={importModalOpen}
        okText="导入成员"
        width={720}
        onCancel={() => setImportModalOpen(false)}
        onOk={() => importForm.submit()}
      >
        <Alert
          className="inline-message-ant"
          type="info"
          showIcon
          title="按 CSV 文本导入成员"
          description="每行格式为：邮箱,角色,用户名,显示名称,初始密码。已有账号可只填邮箱和角色；新账号需要补全登录账号、显示名称和密码。"
        />
        <Form form={importForm} layout="vertical" onFinish={submitImportMembers}>
          <Form.Item name="default_password" label="默认初始密码" initialValue="SecurePass123!" rules={[{ required: true, message: '请输入默认初始密码' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="rows_text" label="成员 CSV" rules={[{ required: true, message: '请输入成员导入内容' }]}>
            <Input.TextArea className="member-import-textarea" rows={8} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="发送安全提醒"
        open={securityReminderModalOpen}
        okText="发送提醒"
        onCancel={() => setSecurityReminderModalOpen(false)}
        onOk={() => securityReminderForm.submit()}
      >
        <Alert
          className="inline-message-ant"
          type="info"
          showIcon
          title={`将向 ${reminderTargetMembers.length} 名成员发送站内安全提醒`}
          description="将向所选成员发送站内安全提醒。"
        />
        <Form form={securityReminderForm} layout="vertical" onFinish={submitSecurityReminder}>
          <Form.Item name="title" label="提醒标题" rules={[{ required: true, message: '请输入提醒标题' }]}>
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="content" label="提醒内容" rules={[{ required: true, message: '请输入提醒内容' }]}>
            <Input.TextArea rows={4} maxLength={1000} showCount />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer title="编辑成员" open={Boolean(editMember)} onClose={() => setEditMember(null)}>
        {editMember && (
          <Form form={editForm} layout="vertical" onFinish={submitEdit}>
            <Alert className="inline-message-ant" type="warning" showIcon title="角色和状态变更会写入审计日志；禁用成员不会删除历史提交和审核记录。" />
            <Form.Item name="team_role" label="成员角色" rules={[{ required: true }]}><Select options={roleOptions} /></Form.Item>
            <Form.Item name="status" label="成员状态" rules={[{ required: true }]}><Select options={[{ value: 'active', label: '正常' }, { value: 'disabled', label: '禁用' }]} /></Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">保存成员变更</Button>
              <Button onClick={() => setEditMember(null)}>取消</Button>
            </Space>
          </Form>
        )}
      </Drawer>

      <Drawer title="邀请记录" size="large" open={invitationDrawerOpen} onClose={() => setInvitationDrawerOpen(false)}>
        <Alert className="inline-message-ant" type="info" showIcon title="邀请记录按当前企业展示，已过期状态由后端按过期时间计算。" />
        <EnhancedTable<TeamInvitationRecord>
          rowKey="invitation_id"
          loading={invitationLoading}
          dataSource={invitations}
          locale={{ emptyText: '暂无邀请记录' }}
          pagination={{ pageSize: 8 }}
          scroll={{ x: invitationTableScrollX }}
          columns={decorateInvitationColumns([
            { title: '模式', key: 'invite_mode', render: (_, item) => <Tag>{invitationModeLabels[item.invite_mode ?? 'email'] || '邮箱邀请'}</Tag> },
            { title: '邀请邮箱', key: 'email', sorter: (left, right) => compareText(left.email, right.email), render: (_, item) => (item.invite_mode ?? 'email') === 'code' ? '-' : (item.email || '-') },
            { title: '角色', key: 'team_role', render: (_, item) => <Tag color={roleColors[item.team_role] || 'default'}>{getTeamRoleDisplayLabel(item)}</Tag> },
            {
              title: '状态',
              key: 'status',
              render: (_, item) => <Tag color={invitationStatusColors[item.status] || 'default'}>{invitationStatusLabels[item.status] || item.status}</Tag>,
            },
            { title: '邀请人', key: 'created_by', render: (_, item) => item.created_by_name || item.created_by || '-' },
            { title: '过期时间', key: 'expire_at', render: (_, item) => formatApiDateTime(item.expire_at) },
            { title: '响应时间', key: 'responded_at', render: (_, item) => formatApiDateTime(item.responded_at) },
            {
              title: '操作',
              width: 138,
              key: 'actions',
              fixed: 'right',
              className: 'workspace-table-action-cell',
              render: (_, item) => {
                const canOperate = ['pending', 'expired'].includes(item.status);
                return (
                  <WorkspaceTableActions
                    visible={[{
                      key: 'resend',
                      label: (item.invite_mode ?? 'email') === 'code' ? '重新生成邀请码' : '重发',
                      icon: <MailOutlined />,
                      disabled: !canOperate,
                      onClick: () => void handleResendInvitation(item),
                    }]}
                    menu={[{
                      key: 'revoke',
                      label: '撤销邀请',
                      icon: <DeleteOutlined />,
                      danger: true,
                      disabled: !canOperate,
                      onClick: () => void handleRevokeInvitation(item),
                      confirm: { title: '撤销该邀请？', content: '撤销后原邀请链接将无法继续加入企业。', okText: '撤销' },
                    }]}
                  />
                );
              },
            },
          ], invitations)}
        />
      </Drawer>
    </main>
  );
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function parseImportRows(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows = lines[0]?.toLowerCase().startsWith('email,') || lines[0]?.startsWith('邮箱,') ? lines.slice(1) : lines;
  const parsed = rows.map((line, index) => {
    const [email = '', role = '', username = '', displayName = '', password = ''] = line.split(',').map((cell) => cell.trim());
    const teamRole = normalizeImportRole(role);
    if (!email) throw new Error(`第 ${index + 1} 行缺少邮箱`);
    if (!teamRole) throw new Error(`第 ${index + 1} 行角色无效，请使用 owner、reviewer 或 labeler`);
    if (username && !usernamePattern.test(username)) {
      throw new Error(`第 ${index + 1} 行登录账号格式无效，需为 4-32 位，字母开头，仅支持小写字母、数字和下划线`);
    }
    return {
      email,
      team_role: teamRole,
      username: username || undefined,
      display_name: displayName || undefined,
      password: password || undefined,
    };
  });
  if (parsed.length === 0) throw new Error('请至少输入一行成员数据');
  return parsed;
}

function normalizeImportRole(value: string): MemberRole | null {
  const normalized = value.trim().toLowerCase();
  const aliases: Record<string, MemberRole> = {
    owner: 'owner',
    reviewer: 'reviewer',
    labeler: 'labeler',
    任务发布者: 'owner',
    审核员: 'reviewer',
    标注员: 'labeler',
  };
  return aliases[normalized] || null;
}

function decorateMemberColumns(columns: ColumnsType<TeamMember>, members: TeamMember[]): ColumnsType<TeamMember> {
  return columns.map((column) => column).map((column) => {
    if (column.key === 'member') {
      return {
        ...column,
        sorter: (left, right) => compareText(getMemberDisplayName(left), getMemberDisplayName(right)),
      };
    }

    if (column.key === 'role') {
      return {
        ...column,
        filters: buildTableFilterOptions(members.map((member) => getTeamRoleDisplayLabel(member))),
        filterSearch: true,
        onFilter: (value, member) => getTeamRoleDisplayLabel(member) === String(value),
        sorter: (left, right) => compareText(getTeamRoleDisplayLabel(left), getTeamRoleDisplayLabel(right)),
      };
    }

    if (column.key === 'position') {
      return {
        ...column,
        filters: buildTableFilterOptions(members.map((member) => getMemberPositionDisplayLabel(member)).filter((value) => value !== '-')),
        filterSearch: true,
        onFilter: (value, member) => getMemberPositionDisplayLabel(member) === String(value),
        sorter: (left, right) => compareText(getMemberPositionDisplayLabel(left), getMemberPositionDisplayLabel(right)),
      };
    }

    if (column.key === 'phone') {
      return {
        ...column,
        sorter: (left, right) => compareText(left.phone, right.phone),
      };
    }

    if (column.key === 'email') {
      return {
        ...column,
        sorter: (left, right) => compareText(left.email, right.email),
      };
    }

    if (column.key === 'tasks') {
      return {
        ...column,
        sorter: (left, right) => compareNumber(left.assigned_task_count, right.assigned_task_count),
      };
    }

    if (column.key === 'last_active_at') {
      return {
        ...column,
        filters: [
          { text: '7 天内活跃', value: '7d' },
          { text: '30 天内活跃', value: '30d' },
          { text: '未记录活跃', value: 'never' },
        ],
        onFilter: (value, member) => {
          if (value === 'never') return !member.last_active_at;
          if (!member.last_active_at) return false;
          const days = value === '7d' ? 7 : 30;
          return Date.now() - apiDateTimeValue(member.last_active_at) <= days * 24 * 60 * 60 * 1000;
        },
        sorter: (left, right) => compareDateTime(left.last_active_at, right.last_active_at),
      };
    }

    if (column.key === 'joined_at') {
      return {
        ...column,
        filters: [
          { text: '近 7 天加入', value: '7d' },
          { text: '近 30 天加入', value: '30d' },
        ],
        onFilter: (value, member) => {
          if (!member.joined_at) return false;
          const days = value === '7d' ? 7 : 30;
          return Date.now() - apiDateTimeValue(member.joined_at) <= days * 24 * 60 * 60 * 1000;
        },
        sorter: (left, right) => compareDateTime(left.joined_at, right.joined_at),
      };
    }

    return column;
  });
}

function decorateInvitationColumns(
  columns: ColumnsType<TeamInvitationRecord>,
  invitations: TeamInvitationRecord[],
): ColumnsType<TeamInvitationRecord> {
  return columns.map((column) => {
    if (column.key === 'invite_mode') {
      return {
        ...column,
        filters: buildTableFilterOptions(invitations.map((item) => invitationModeLabels[item.invite_mode ?? 'email'] || '邮箱邀请')),
        filterSearch: true,
        onFilter: (value, item) => (invitationModeLabels[item.invite_mode ?? 'email'] || '邮箱邀请') === String(value),
      };
    }

    if (column.key === 'team_role') {
      return {
        ...column,
        filters: buildTableFilterOptions(invitations.map((item) => getTeamRoleDisplayLabel(item))),
        filterSearch: true,
        onFilter: (value, item) => getTeamRoleDisplayLabel(item) === String(value),
        sorter: (left, right) => compareText(getTeamRoleDisplayLabel(left), getTeamRoleDisplayLabel(right)),
      };
    }

    if (column.key === 'status') {
      return {
        ...column,
        filters: buildTableFilterOptions(invitations.map((item) => invitationStatusLabels[item.status] || item.status)),
        filterSearch: true,
        onFilter: (value, item) => (invitationStatusLabels[item.status] || item.status) === String(value),
      };
    }

    if (column.key === 'created_by') {
      return {
        ...column,
        sorter: (left, right) => compareText(left.created_by_name || left.created_by, right.created_by_name || right.created_by),
      };
    }

    if (column.key === 'expire_at') {
      return {
        ...column,
        sorter: (left, right) => compareDateTime(left.expire_at, right.expire_at),
      };
    }

    if (column.key === 'responded_at') {
      return {
        ...column,
        sorter: (left, right) => compareDateTime(left.responded_at, right.responded_at),
      };
    }

    return column;
  });
}
