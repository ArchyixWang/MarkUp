import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Badge, Button, Descriptions, Drawer, Dropdown, Empty, Layout, List, Menu, Popover, Space, Spin, Tag, Tooltip } from 'antd';
import { AppstoreOutlined, BellOutlined, LogoutOutlined, MenuOutlined, SettingOutlined, StarFilled, StarOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import { AgentAvatar } from '../agent/AgentAvatar';
import { PlatformAgentDrawer } from '../agent/PlatformAgentDrawer';
import type { AuthSession } from '../../stores/authStore';
import { clearAllStoredSessions, markSessionInvalidated } from '../../stores/authStore';
import { logoutCurrentSession } from '../../services/authService';
import { getAdminOverview, getMyProfile, getTeamMembers, listMyNotifications, markAllMyNotificationsRead, updateMyNotificationState } from '../../services/workspaceService';
import type { AdminOverview, NotificationListResponse, NotificationPayload, ProfilePayload, TeamMember } from '../../types/api';
import { isEnterpriseSession } from '../../app/workspaceAccess';
import { formatInboxTime, inboxPriorityColors, inboxTypeLabels } from '../../pages/workspace/personalInboxHelpers';
import { ConnectionStatusIndicator } from './ConnectionStatusIndicator';
import './SiteNav.css';

interface SiteNavProps {
  session: AuthSession | null;
  onOpenLogin: (mode: 'login' | 'register') => void;
  onLogout: () => void;
}

const navItems = [
  { key: '/', label: '首页' },
  { key: '/tasks', label: '任务广场' },
  { key: '/solutions', label: '解决方案' },
  { key: '/help', label: '帮助文档' },
];

function getTeamRoleDisplayLabel(member: TeamMember | null, fallbackRole: string) {
  if (!member) return fallbackRole;
  if (member.team_role === 'agent' || member.is_system_member) return 'Agent';
  return member.team_role_label || member.team_role || fallbackRole;
}

export function SiteNav({ session, onOpenLogin, onLogout }: SiteNavProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [member, setMember] = useState<TeamMember | null>(null);
  const [identityLoading, setIdentityLoading] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxData, setInboxData] = useState<NotificationListResponse | null>(null);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const user = session?.user;
  const initials = (user?.display_name || user?.email || '?').slice(0, 2).toUpperCase();
  const selectedKey = navItems.find((item) => item.key === pathname)?.key ?? '';
  const workspaceEntryPath = session?.user.role === 'pending' ? '/onboarding' : isPlatformUser(session) ? '/platform' : '/workspace';

  const selectedKeys = useMemo(() => (selectedKey ? [selectedKey] : []), [selectedKey]);

  const go = useCallback((path: string) => {
    setMobileMenuOpen(false);
    navigate(path);
  }, [navigate]);

  function openAuth(mode: 'login' | 'register') {
    setMobileMenuOpen(false);
    onOpenLogin(mode);
  }

  function openPlatformAi() {
    setMobileMenuOpen(false);
    setAiAssistantOpen(true);
  }

  async function handleLogout() {
    try {
      await logoutCurrentSession(session?.refreshToken);
    } catch {
      // Best effort: local logout should still succeed even if server-side revoke fails.
    } finally {
      clearAllStoredSessions();
      markSessionInvalidated({ reason: 'manual_logout' });
      onLogout();
      setMobileMenuOpen(false);
      navigate('/');
    }
  }

  async function loadIdentityCard(open: boolean) {
    if (!open || !session || identityLoading) return;
    setIdentityLoading(true);
    try {
      const profileData = await getMyProfile();
      setProfile(profileData);
      if (isOrganizationUser(session)) {
        const data = await getAdminOverview();
        setOverview(data);
        const team = data.teams.find((item) => item.team_id === data.default_team_id) ?? data.teams[0];
        if (team) {
          const members = await getTeamMembers(team.team_id, { status: 'active' });
          setMember(members.items.find((item) => item.is_current_user || item.user_id === session.user.user_id) ?? null);
        }
      }
    } finally {
      setIdentityLoading(false);
    }
  }

  async function loadInboxPreview() {
    if (!session || inboxLoading) return;
    setInboxLoading(true);
    setInboxError(null);
    try {
      setInboxData(await listMyNotifications({ page_size: 5 }));
    } catch (err) {
      setInboxError(err instanceof Error ? err.message : '个人信箱加载失败');
    } finally {
      setInboxLoading(false);
    }
  }

  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(() => {
      void loadInboxPreview();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken]);

  async function handleInboxOpenChange(open: boolean) {
    setInboxOpen(open);
    if (open) await loadInboxPreview();
  }

  async function markInboxItemRead(item: NotificationPayload) {
    const updated = await updateMyNotificationState(item.notification_id, 'read');
    setInboxData((current) => updatePreviewNotification(current, updated));
  }

  async function toggleInboxItemStar(item: NotificationPayload) {
    const updated = await updateMyNotificationState(item.notification_id, item.is_starred ? 'unstar' : 'star');
    setInboxData((current) => updatePreviewNotification(current, updated));
  }

  async function markInboxAllRead() {
    await markAllMyNotificationsRead();
    await loadInboxPreview();
  }

  function openFullInbox() {
    setInboxOpen(false);
    setMobileMenuOpen(false);
    navigate('/workspace?page=personal-inbox');
  }

  const navMenuItems = useMemo(() => navItems.map((item) => ({ ...item, onClick: () => go(item.key) })), [go]);

  const menu = (
    <Menu
      className="site-nav-menu"
      mode="horizontal"
      selectedKeys={selectedKeys}
      items={navMenuItems}
    />
  );

  const inboxPreview = session ? (
    <Popover
      trigger="click"
      placement="bottomRight"
      open={inboxOpen}
      onOpenChange={(open) => void handleInboxOpenChange(open)}
      overlayClassName="personal-inbox-popover"
      content={(
        <InboxPreviewPanel
          data={inboxData}
          loading={inboxLoading}
          error={inboxError}
          onRefresh={loadInboxPreview}
          onMarkRead={markInboxItemRead}
          onToggleStar={toggleInboxItemStar}
          onMarkAllRead={markInboxAllRead}
          onOpenFull={openFullInbox}
        />
      )}
    >
      <Badge className="site-nav-inbox-badge" size="small" count={inboxData?.summary.unread ?? 0}>
        <Button type="text" className="site-nav-inbox-btn" icon={<BellOutlined />} aria-label="个人信箱" />
      </Badge>
    </Popover>
  ) : null;

  const aiEntry = (
    <Tooltip title="小马克">
      <button type="button" className="site-nav-ai-entry" aria-label="小马克" onClick={openPlatformAi}>
        <AgentAvatar size={24} />
      </button>
    </Tooltip>
  );

  const authActions = session ? (
    <Space size={6}>
      <ConnectionStatusIndicator className="site-nav-connection-status" />
      {aiEntry}
      {inboxPreview}
      <Button
        className="site-nav-workspace-btn"
        type="primary"
        icon={<AppstoreOutlined aria-hidden />}
        aria-label="工作台"
        onClick={() => navigate(workspaceEntryPath)}
      >
        工作台
      </Button>
      <Dropdown
        menu={{ items: [] }}
        trigger={['click']}
        placement="bottomRight"
        onOpenChange={(open) => void loadIdentityCard(open)}
        popupRender={() => (
          <IdentityDropdownCard
            session={session}
            profile={profile}
            overview={overview}
            member={member}
            loading={identityLoading}
            onNavigate={(page) => navigate(page ? `/workspace?page=${page}` : workspaceEntryPath)}
            onLogout={handleLogout}
          />
        )}
      >
        <Button type="text" className="avatar-trigger-ant" aria-label="打开账号菜单">
          <Avatar size={40} shape="circle" src={user?.avatar || undefined} icon={!user?.avatar ? <UserOutlined /> : undefined}>
            {!user?.avatar ? initials : null}
          </Avatar>
        </Button>
      </Dropdown>
    </Space>
  ) : (
    <Space size={6}>
      {aiEntry}
      <Button className="site-nav-login-btn" onClick={() => openAuth('login')}>登录</Button>
      <Button className="site-nav-register-btn" type="primary" onClick={() => openAuth('register')}>注册</Button>
    </Space>
  );

  return (
    <Layout.Header className="site-nav">
      <Button type="text" className="site-nav-brand" onClick={() => navigate('/')}>
        <img className="site-nav-logo site-nav-logo--color" src="/color_logo.svg" alt="MarkUp" height={32} />
        <img className="site-nav-logo site-nav-logo--white" src="/white_logo.svg" alt="" aria-hidden="true" height={32} />
      </Button>

      <div className="site-nav-links">{menu}</div>
      <div className="site-nav-actions">{authActions}</div>

      <Button
        className="mobile-menu-trigger"
        icon={<MenuOutlined />}
        aria-label="打开导航菜单"
        aria-expanded={mobileMenuOpen}
        onClick={() => setMobileMenuOpen(true)}
      />

      {mobileMenuOpen ? (
        <Drawer title="MarkUp" placement="right" size={320} open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)}>
          <Menu mode="vertical" selectedKeys={selectedKeys} items={navMenuItems} />
          <div className="mobile-menu-auth">
            {session ? (
              <>
                <Button
                  block
                  type="primary"
                  icon={<ConnectionStatusIndicator className="mobile-workspace-connection-status" />}
                  onClick={() => go(workspaceEntryPath)}
                >
                  工作台
                </Button>
                <Button block danger onClick={handleLogout}>退出登录</Button>
              </>
            ) : (
              <>
                <Button block onClick={() => openAuth('login')}>登录</Button>
                <Button block type="primary" onClick={() => openAuth('register')}>注册</Button>
              </>
            )}
          </div>
        </Drawer>
      ) : null}

      <PlatformAgentDrawer open={aiAssistantOpen} session={session} onClose={() => setAiAssistantOpen(false)} />
    </Layout.Header>
  );
}

function InboxPreviewPanel({
  data,
  loading,
  error,
  onRefresh,
  onMarkRead,
  onToggleStar,
  onMarkAllRead,
  onOpenFull,
}: {
  data: NotificationListResponse | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  onMarkRead: (item: NotificationPayload) => Promise<void>;
  onToggleStar: (item: NotificationPayload) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  onOpenFull: () => void;
}) {
  const items = data?.items ?? [];
  return (
    <div className="personal-inbox-preview" aria-label="个人信箱概览">
      <div className="personal-inbox-preview-head">
        <div>
          <strong>个人信箱</strong>
          <span>{data?.summary.unread ?? 0} 条未读</span>
        </div>
        <Space size={4}>
          <Button size="small" type="link" onClick={() => void onRefresh()}>刷新</Button>
          <Button size="small" type="link" disabled={!data?.summary.unread} onClick={() => void onMarkAllRead()}>全部已读</Button>
        </Space>
      </div>
      {error ? (
        <div className="personal-inbox-preview-error">
          <span>{error}</span>
          <Button size="small" onClick={() => void onRefresh()}>重试</Button>
        </div>
      ) : loading ? (
        <div className="personal-inbox-preview-loading"><Spin size="small" /> 正在加载</div>
      ) : items.length ? (
        <List
          className="personal-inbox-preview-list"
          dataSource={items}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button key="star" size="small" type="link" icon={item.is_starred ? <StarFilled /> : <StarOutlined />} onClick={() => void onToggleStar(item)}>
                  {item.is_starred ? '取消' : '星标'}
                </Button>,
                ...(isUnreadInboxItem(item) ? [<Button key="read" size="small" type="link" onClick={() => void onMarkRead(item)}>已读</Button>] : []),
              ]}
            >
              <List.Item.Meta
                title={(
                  <span className="personal-inbox-preview-title">
                    {isUnreadInboxItem(item) && <Badge status="processing" />}
                    <span>{item.title}</span>
                  </span>
                )}
                description={(
                  <span className="personal-inbox-preview-meta">
                    <Tag color={inboxPriorityColors[item.priority]}>{inboxTypeLabels[item.notification_type] ?? item.notification_type}</Tag>
                    <span>{item.source_team_name || '系统'}</span>
                    <span>{formatInboxTime(item.created_at)}</span>
                  </span>
                )}
              />
            </List.Item>
          )}
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无个人消息" />
      )}
      <Button block type="primary" onClick={onOpenFull}>查看全部</Button>
    </div>
  );
}

function isUnreadInboxItem(item: NotificationPayload): boolean {
  return item.status === 'unread' && !item.is_read;
}

function updatePreviewNotification(data: NotificationListResponse | null, updated: NotificationPayload): NotificationListResponse | null {
  if (!data) return data;
  const previous = data.items.find((item) => item.notification_id === updated.notification_id);
  const items = data.items.map((item) => (item.notification_id === updated.notification_id ? updated : item));
  return {
    ...data,
    items,
    summary: updatePreviewSummary(data.summary, previous, updated),
  };
}

function updatePreviewSummary(
  summary: NotificationListResponse['summary'],
  previous: NotificationPayload | undefined,
  updated: NotificationPayload,
): NotificationListResponse['summary'] {
  if (!previous) return summary;
  return {
    ...summary,
    unread: clampSummaryCount(summary.unread, readDelta(previous, updated)),
    starred: clampSummaryCount(summary.starred, starredDelta(previous, updated)),
  };
}

function readDelta(previous: NotificationPayload, updated: NotificationPayload): number {
  if (previous.is_read === updated.is_read) return 0;
  return updated.is_read ? -1 : 1;
}

function starredDelta(previous: NotificationPayload, updated: NotificationPayload): number {
  if (previous.is_starred === updated.is_starred) return 0;
  return updated.is_starred ? 1 : -1;
}

function clampSummaryCount(value: number | undefined, delta: number): number {
  const current = value ?? 0;
  if (delta === 0) return current;
  return Math.max(0, current + delta);
}

function IdentityDropdownCard({
  session,
  profile,
  overview,
  member,
  loading,
  onNavigate,
  onLogout,
}: {
  session: AuthSession;
  profile: ProfilePayload | null;
  overview: AdminOverview | null;
  member: TeamMember | null;
  loading: boolean;
  onNavigate: (page?: string) => void;
  onLogout: () => void;
}) {
  const user = session.user;
  const team = overview?.teams.find((item) => item.team_id === overview.default_team_id) ?? overview?.teams[0] ?? null;
  const displayName = profile?.profile.display_name || member?.display_name || user.display_name || user.email || 'MarkUp 用户';
  const platform = isPlatformUser(session);
  const organization = isOrganizationUser(session);
  const quickActions = organization ? roleQuickActions(member?.team_role || user.role) : [];

  return (
    <div className="identity-dropdown-card">
      {loading && <Spin className="identity-card-spin" />}
      <Space align="start" size={12} className="identity-card-head">
        <Avatar size={48} src={profile?.user.avatar || user.avatar || undefined} icon={<UserOutlined />} />
        <div>
          <strong>{displayName}</strong>
          <p>{user.email}</p>
          <Space size={4} wrap>
            <Tag color="blue">{platform ? '平台运营' : organization ? '企业用户' : 'Labeler'}</Tag>
            <Tag color={user.email_verified ? 'green' : 'orange'}>{user.email_verified ? '邮箱已验证' : '邮箱未验证'}</Tag>
          </Space>
        </div>
      </Space>

      <Descriptions column={1} size="small" className="identity-card-desc">
        {platform ? (
          <>
            <Descriptions.Item label="平台角色">平台管理员</Descriptions.Item>
            <Descriptions.Item label="权限数">{user.permissions.length}</Descriptions.Item>
          </>
        ) : organization ? (
          <>
            <Descriptions.Item label="企业">{team?.company_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="企业身份">{getTeamRoleDisplayLabel(member, user.role)}</Descriptions.Item>
            <Descriptions.Item label="权限数">{member?.permission_count ?? user.permissions.length}</Descriptions.Item>
          </>
        ) : (
          <>
            <Descriptions.Item label="全局角色">{user.role}</Descriptions.Item>
            <Descriptions.Item label="可用积分">{profile?.points.available_points ?? 0}</Descriptions.Item>
            <Descriptions.Item label="资质">{profile?.certifications.length ?? 0} 条</Descriptions.Item>
          </>
        )}
      </Descriptions>

      <div className="identity-card-actions">
        {quickActions.map((item) => (
          <Button key={item.page} icon={item.icon} onClick={() => onNavigate(item.page)}>{item.label}</Button>
        ))}
        {platform && <Button icon={<AppstoreOutlined />} onClick={() => window.location.assign('/platform')}>平台工作台</Button>}
        <Button icon={<SettingOutlined />} onClick={() => onNavigate(organization ? 'account' : 'account-profile')}>账号管理</Button>
        <Button danger icon={<LogoutOutlined />} onClick={onLogout}>退出登录</Button>
      </div>
    </div>
  );
}

function isOrganizationUser(session: AuthSession): boolean {
  return !isPlatformUser(session) && isEnterpriseSession(session);
}

function isPlatformUser(session: AuthSession | null): boolean {
  return Boolean(session && (session.user.role === 'platform_admin' || session.user.permissions.includes('platform:manage')));
}

function roleQuickActions(role: string) {
  const workspaceRole = role === 'team_admin' || role === 'platform_admin' ? 'admin' : role;
  if (workspaceRole === 'admin') {
    return [
      { page: 'organization-info', label: '企业信息', icon: <TeamOutlined /> },
      { page: 'people-management', label: '人员管理', icon: <TeamOutlined /> },
    ];
  }
  if (role === 'owner') return [{ page: 'task-management', label: '任务管理', icon: <AppstoreOutlined /> }];
  if (role === 'reviewer') return [{ page: 'manual-review', label: '人工审核', icon: <AppstoreOutlined /> }];
  if (role === 'agent') return [{ page: 'resource-config', label: '资源配置', icon: <AppstoreOutlined /> }];
  return [];
}
