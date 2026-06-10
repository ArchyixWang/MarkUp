import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Alert, Button, message, Space, Tag } from 'antd';
import { AppstoreOutlined, ApiOutlined, AuditOutlined, BarChartOutlined, BellOutlined, CloudUploadOutlined, DatabaseOutlined, DesktopOutlined, EditOutlined, FileSearchOutlined, FileTextOutlined, OrderedListOutlined, RocketOutlined, SafetyCertificateOutlined, SettingOutlined, SlidersOutlined, TeamOutlined, StarOutlined } from '@ant-design/icons';
import { AppShell, type AppShellBreadcrumbItem, type AppShellNavGroup } from '../components/layout/AppShell';
import { PublicFooter } from '../components/layout/PublicFooter';
import { LoginPage } from '../pages/auth/LoginPage';
import { PlatformApp, type PlatformPage } from '../pages/platform/PlatformApp';
import { WorkspaceApp, type WorkspacePage } from '../pages/workspace/WorkspaceApp';
import { WorkspaceLoading } from '../pages/workspace/WorkspaceLoading';
import { HomePage } from '../pages/home/HomePage';
import { TaskSquarePage } from '../pages/tasks/TaskSquarePage';
import { SolutionsPage } from '../pages/solutions/SolutionsPage';
import { HelpPage } from '../pages/help/HelpPage';
import { OnboardingPage } from '../pages/onboarding/OnboardingPage';
import { getCurrentUser, linkOAuthCurrentUser } from '../services/authService';
import { ApiClientError } from '../services/apiClient';
import { getStoredSession, getStoredSessionWithStorage, subscribeToSessionInvalidated, updateStoredSessionUser, type AuthSession } from '../stores/authStore';
import { clearAuthReturnTarget, currentRelativeAppUrl, getAuthReturnTarget, isInviteJoinPath, normalizeAppRelativePath, setAuthReturnTarget } from '../services/appLink';
import { getAssignedTask } from '../services/taskService';
import type { TaskPayload } from '../types/api';
import type { OperationLogFilters } from '../pages/workspace/OperationLogsPage';
import { isEnterpriseSession, isLabelerSession, isTeamLabelerUser } from './workspaceAccess';
import { buildWorkspaceNav, canAccessWorkspacePage, getDefaultWorkspacePage } from './workspaceNavigation';

type OAuthOverlayMode = 'bind' | 'register';

interface OAuthOverlayState {
  ticket: string;
  provider?: string;
  initialMode?: OAuthOverlayMode;
}

type OAuthCallbackIntent = 'login' | 'bind_current_user';

const oauthProviderLabels: Record<string, string> = {
  github: 'GitHub',
  google: 'Google',
  huggingface: 'Hugging Face',
};

type LoginOverlayState =
  | { open: false; mode: 'login' | 'register'; oauth?: undefined }
  | { open: true; mode: 'login' | 'register'; oauth?: undefined }
  | { open: true; mode: 'oauth-callback'; oauth: OAuthOverlayState };

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

function AppRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const [session, setSession] = useState<AuthSession | null>(
    () => getStoredSession(window.localStorage) ?? getStoredSession(window.sessionStorage)
  );
  const [loginOverlay, setLoginOverlay] = useState<LoginOverlayState>({ open: false, mode: 'login' });
  const [workspacePage, setWorkspacePage] = useState<WorkspacePage>(() => {
    const storedSession = getStoredSession(window.localStorage) ?? getStoredSession(window.sessionStorage);
    return storedSession ? getDefaultWorkspacePage(storedSession.user) : 'dashboard';
  });
  const [operationLogFilters, setOperationLogFilters] = useState<OperationLogFilters | undefined>();
  const [platformPage, setPlatformPage] = useState<PlatformPage>(() => parsePlatformPage(window.location.search) ?? 'overview');
  const [breadcrumbTail, setBreadcrumbTail] = useState<AppShellBreadcrumbItem | null>(null);
  const [pendingWorkspaceUrl, setPendingWorkspaceUrl] = useState<string | null>(null);
  const workspaceQueryState = useMemo(() => parseWorkspaceQuery(location.search), [location.search]);
  const platformQueryPage = useMemo(() => parsePlatformPage(location.search), [location.search]);
  const currentRelativeUrl = useMemo(
    () => currentRelativeAppUrl({ pathname: location.pathname, search: location.search, hash: location.hash }),
    [location.hash, location.pathname, location.search],
  );
  const inviteJoinLocation = useMemo(() => isInviteJoinPath(currentRelativeUrl), [currentRelativeUrl]);

  useEffect(() => {
    return subscribeToSessionInvalidated(({ reason }) => {
      setSession(null);
      setBreadcrumbTail(null);
      setWorkspacePage('dashboard');

      if (reason === 'manual_logout') {
        return;
      }

      if (inviteJoinLocation) {
        setAuthReturnTarget(currentRelativeUrl);
      }

      if ((location.pathname.startsWith('/workspace') || location.pathname === '/onboarding') && !inviteJoinLocation) {
        navigate('/', { replace: true });
      }
      setLoginOverlay({ open: true, mode: 'login' });
    });
  }, [currentRelativeUrl, inviteJoinLocation, location.pathname, navigate]);

  useEffect(() => {
    const handler = () => {
      setSession(getStoredSession(window.localStorage) ?? getStoredSession(window.sessionStorage));
    };
    window.addEventListener('markup:session-updated', handler);
    return () => window.removeEventListener('markup:session-updated', handler);
  }, []);

  useEffect(() => {
    if (!session || session.user.role === 'pending') return undefined;
    if (!location.pathname.startsWith('/workspace') && !location.pathname.startsWith('/platform')) return undefined;
    let active = true;
    getCurrentUser()
      .then((user) => {
        if (!active) return;
        const currentSession = getStoredSession(window.localStorage) ?? getStoredSession(window.sessionStorage);
        if (!currentSession || currentSession.user.user_id !== user.user_id) return;
        updateStoredSessionUser(user);
        setSession({ ...currentSession, user: { ...currentSession.user, ...user } });
      })
      .catch(() => {
        // Auth failures are handled by the authenticated client; stale profile refreshes should not block rendering.
      });
    return () => {
      active = false;
    };
  }, [location.pathname, session?.accessToken, session?.user.role, session?.user.user_id]);

  useEffect(() => {
    if (session?.user.role !== 'pending') return;
    if (!location.pathname.startsWith('/workspace') && !location.pathname.startsWith('/platform')) return;
    navigate('/onboarding', { replace: true });
  }, [location.pathname, navigate, session?.user.role]);

  useEffect(() => {
    if (!session || session.user.role === 'pending') return;
    if (!inviteJoinLocation || location.pathname !== '/onboarding') return;
    clearAuthReturnTarget();
    message.warning('该邀请码需要待完成 onboarding 的通用账号使用，请切换账号后重试');
    navigate(workspaceEntryForSession(session), { replace: true });
  }, [inviteJoinLocation, location.pathname, navigate, session]);

  function handleLoginSuccess() {
    const nextSession = getStoredSession(window.localStorage) ?? getStoredSession(window.sessionStorage);
    const returnTarget = getAuthReturnTarget();
    setSession(nextSession);
    setLoginOverlay({ open: false, mode: 'login' });
    setWorkspacePage(nextSession ? getDefaultWorkspacePage(nextSession.user) : 'dashboard');
    setBreadcrumbTail(null);
    if (nextSession && returnTarget) {
      if (isInviteJoinPath(returnTarget)) {
        if (nextSession.user.role !== 'pending') {
          clearAuthReturnTarget();
          message.warning('该邀请码需要待完成 onboarding 的通用账号使用，请切换账号后重试');
          navigate(workspaceEntryForSession(nextSession), { replace: true });
          return;
        }
        navigate(returnTarget, { replace: true });
        return;
      }
      clearAuthReturnTarget();
      navigate(returnTarget, { replace: true });
      return;
    }
    if (nextSession?.user.role === 'pending') {
      navigate('/onboarding', { replace: true });
    } else if (nextSession) {
      navigate(workspaceEntryForSession(nextSession), { replace: true });
    }
  }

  function handleLogout() {
    setSession(null);
  }

  const openLogin = useCallback((mode: 'login' | 'register', returnTarget?: string) => {
    if (returnTarget) {
      setAuthReturnTarget(returnTarget);
    }
    setLoginOverlay({ open: true, mode });
  }, []);

  const openOAuthOverlay = useCallback((oauth: OAuthOverlayState) => {
    setLoginOverlay({
      open: true,
      mode: 'oauth-callback',
      oauth,
    });
  }, []);

  function handleLoginOverlayClose() {
    if (loginOverlay.mode === 'oauth-callback') {
      setLoginOverlay({ open: true, mode: 'login' });
      return;
    }
    setLoginOverlay({ open: false, mode: loginOverlay.mode });
  }

  const navWorkspacePage = useCallback((page: WorkspacePage) => {
    setBreadcrumbTail(null);
    setOperationLogFilters(undefined);
    if (workspacePage !== page) {
      setWorkspacePage(page);
    }
    if (location.pathname.startsWith('/workspace')) {
      const nextUrl = workspaceUrlFor(page);
      setPendingWorkspaceUrl(nextUrl);
      if (`${location.pathname}${location.search}` !== nextUrl) {
        navigate(nextUrl, { replace: true });
      }
    }
  }, [location.pathname, location.search, navigate, workspacePage]);

  const openWorkspaceOperationLogs = useCallback((filters?: OperationLogFilters) => {
    if (workspacePage !== 'operation-logs') {
      setWorkspacePage('operation-logs');
    }
    setOperationLogFilters(filters);
    if (location.pathname.startsWith('/workspace')) {
      const nextUrl = workspaceUrlFor('operation-logs', filters);
      setPendingWorkspaceUrl(nextUrl);
      if (`${location.pathname}${location.search}` !== nextUrl) {
        navigate(nextUrl, { replace: true });
      }
    }
  }, [location.pathname, location.search, navigate, workspacePage]);

  const navPlatformPage = useCallback((page: PlatformPage) => {
    if (location.pathname.startsWith('/platform')) {
      const nextUrl = platformUrlFor(page);
      if (`${location.pathname}${location.search}` !== nextUrl) {
        navigate(nextUrl, { replace: true });
        return;
      }
    }
    if (platformPage !== page) {
      setPlatformPage(page);
    }
  }, [location.pathname, location.search, navigate, platformPage]);

  const changeOperationLogFilters = useCallback((filters?: OperationLogFilters) => {
    if (!sameOperationLogFilters(operationLogFilters, filters)) {
      setOperationLogFilters(filters);
    }
    if (location.pathname.startsWith('/workspace') && workspacePage === 'operation-logs') {
      const nextUrl = workspaceUrlFor('operation-logs', filters);
      setPendingWorkspaceUrl(nextUrl);
      if (`${location.pathname}${location.search}` !== nextUrl) {
        navigate(nextUrl, { replace: true });
      }
    }
  }, [location.pathname, location.search, navigate, operationLogFilters, workspacePage]);

  useEffect(() => {
    if (!location.pathname.startsWith('/workspace')) return;
    const currentUrl = `${location.pathname}${location.search}`;
    if (pendingWorkspaceUrl) {
      if (currentUrl !== pendingWorkspaceUrl) {
        return;
      }
      window.setTimeout(() => setPendingWorkspaceUrl(null), 0);
    }
    const fallbackPage = session ? getDefaultWorkspacePage(session.user) : 'dashboard';
    const requestedPage = workspaceQueryState.page ?? fallbackPage;
    const resolvedPage = session && !canAccessWorkspacePage(session.user, requestedPage) ? fallbackPage : requestedPage;
    if (resolvedPage !== workspacePage) {
      window.setTimeout(() => setWorkspacePage(resolvedPage), 0);
    }
    if (workspaceQueryState.hasPageQuery && workspaceQueryState.page !== resolvedPage) {
      const nextUrl = workspaceUrlFor(resolvedPage);
      if (`${location.pathname}${location.search}` !== nextUrl) {
        navigate(nextUrl, { replace: true });
      }
      return;
    }
    if (resolvedPage === 'operation-logs' && workspaceQueryState.hasOperationLogFilters && !sameOperationLogFilters(operationLogFilters, workspaceQueryState.operationLogFilters)) {
      window.setTimeout(() => setOperationLogFilters(workspaceQueryState.operationLogFilters), 0);
    }
    if (resolvedPage !== 'operation-logs' && operationLogFilters) {
      window.setTimeout(() => setOperationLogFilters(undefined), 0);
    };
  }, [location.pathname, location.search, navigate, operationLogFilters, pendingWorkspaceUrl, session, workspacePage, workspaceQueryState]);

  useEffect(() => {
    if (!location.pathname.startsWith('/platform')) return;
    const nextPage = platformQueryPage ?? 'overview';
    if (nextPage !== platformPage) {
      setPlatformPage(nextPage);
    }
  }, [location.pathname, platformPage, platformQueryPage]);

  const isEnterpriseWorkspace = session ? isEnterpriseSession(session) : false;
  const isLabelerWorkspace = session ? isLabelerSession(session) : false;
  const isTeamLabelerWorkspace = session ? isTeamLabelerUser(session.user) : false;
  const legacyWorkspaceNav: AppShellNavGroup[] = useMemo(() => (isLabelerWorkspace ? [
    {
      id: 'labeler-workbench',
      label: '批注工作台',
      items: [
        { id: 'labeler-tasks', label: '我的任务', icon: <EditOutlined />, active: workspacePage === 'labeler-tasks' || workspacePage === 'labeling', onSelect: () => navWorkspacePage('labeler-tasks') },
        { id: 'labeler-questions', label: '任务历史', icon: <OrderedListOutlined />, active: workspacePage === 'labeler-questions', onSelect: () => navWorkspacePage('labeler-questions') },
      ],
    },
    {
      id: 'labeler-account',
      label: '个人工具',
      items: [
        { id: 'account-profile', label: '基础信息', icon: <SettingOutlined />, active: workspacePage === 'account-profile', onSelect: () => navWorkspacePage('account-profile') },
        { id: 'account-certifications', label: '资质认证', icon: <SafetyCertificateOutlined />, active: ['account-certifications', 'account-certification-form', 'certification-rules', 'certification-material-guide', 'certification-user-agreement'].includes(workspacePage), onSelect: () => navWorkspacePage('account-certifications') },
        { id: 'account-points', label: '积分管理', icon: <BarChartOutlined />, active: ['account-points', 'points-level-rules'].includes(workspacePage), onSelect: () => navWorkspacePage('account-points') },
        { id: 'account-reputation', label: '信誉分管理', icon: <StarOutlined />, active: workspacePage === 'account-reputation', onSelect: () => navWorkspacePage('account-reputation') },
        { id: 'account', label: '账号管理', icon: <SettingOutlined />, active: workspacePage === 'account', onSelect: () => navWorkspacePage('account') },
      ],
    },
    ...(isTeamLabelerWorkspace ? [
      {
        id: 'organization-management',
        label: '组织管理',
        items: [
          { id: 'organization-info', label: '组织信息', icon: <SettingOutlined />, active: workspacePage === 'organization-info', onSelect: () => navWorkspacePage('organization-info') },
          { id: 'people-management', label: '团队信息', icon: <TeamOutlined />, active: workspacePage === 'people-management', onSelect: () => navWorkspacePage('people-management') },
        ],
      },
    ] : []),
  ] : [
    {
      id: 'workspace-home',
      label: '主页面',
      items: [{ id: 'dashboard', label: '主页面', icon: <AppstoreOutlined />, active: workspacePage === 'dashboard', onSelect: () => navWorkspacePage('dashboard') }],
    },
    {
      id: 'data-production',
      label: '数据生产',
      items: [
        { id: 'datasets', label: '数据集管理', icon: <DatabaseOutlined />, active: workspacePage === 'datasets', onSelect: () => navWorkspacePage('datasets') },
        { id: 'templates', label: '模板搭建', icon: <SlidersOutlined />, active: workspacePage === 'templates', onSelect: () => navWorkspacePage('templates') },
        { id: 'task-management', label: '任务管理', icon: <RocketOutlined />, active: workspacePage === 'task-management' || workspacePage === 'publish-task', onSelect: () => navWorkspacePage('task-management') },
      ],
    },
    {
      id: 'review-quality',
      label: '审核质检',
      items: [
        { id: 'ai-review', label: 'AI预审', icon: <FileSearchOutlined />, active: workspacePage === 'ai-review', onSelect: () => navWorkspacePage('ai-review') },
        { id: 'manual-review', label: '人工审核', icon: <AuditOutlined />, active: workspacePage === 'manual-review', onSelect: () => navWorkspacePage('manual-review') },
      ],
    },
    {
      id: 'organization-management',
      label: '企业管理',
      items: [
        { id: 'organization-info', label: '企业信息', icon: <SettingOutlined />, active: workspacePage === 'organization-info', onSelect: () => navWorkspacePage('organization-info') },
        { id: 'resource-config', label: '资源配置', icon: <ApiOutlined />, active: workspacePage === 'resource-config', onSelect: () => navWorkspacePage('resource-config') },
        { id: 'people-management', label: '人员管理', icon: <TeamOutlined />, active: workspacePage === 'people-management', onSelect: () => navWorkspacePage('people-management') },
        { id: 'announcements', label: '公告通知', icon: <BellOutlined />, active: workspacePage === 'announcements', onSelect: () => navWorkspacePage('announcements') },
        { id: 'operation-logs', label: '操作日志', icon: <FileTextOutlined />, active: workspacePage === 'operation-logs', onSelect: () => navWorkspacePage('operation-logs') },
      ],
    },
    {
      id: 'personal-tools',
      label: '个人工具',
      items: [
        { id: 'account', label: '账号管理', icon: <SettingOutlined />, active: workspacePage === 'account', onSelect: () => navWorkspacePage('account') },
        ...(!isEnterpriseWorkspace
          ? [
            { id: 'labeler-tasks', label: '我的任务', icon: <EditOutlined />, active: workspacePage === 'labeler-tasks' || workspacePage === 'labeling', onSelect: () => navWorkspacePage('labeler-tasks') },
            { id: 'labeler-questions', label: '任务历史', icon: <OrderedListOutlined />, active: workspacePage === 'labeler-questions', onSelect: () => navWorkspacePage('labeler-questions') },
          ]
          : []),
      ],
    },
  ]), [navWorkspacePage, isEnterpriseWorkspace, isLabelerWorkspace, isTeamLabelerWorkspace, workspacePage]);

  const workspaceNav = useMemo(
    () => (session ? buildWorkspaceNav(session.user, workspacePage, navWorkspacePage) : legacyWorkspaceNav),
    [navWorkspacePage, legacyWorkspaceNav, session, workspacePage],
  );

  const workspaceBreadcrumbs = useMemo(
    () => session && location.pathname.startsWith('/workspace')
      ? buildWorkspaceBreadcrumbs(workspacePage, navWorkspacePage, breadcrumbTail)
      : undefined,
    [breadcrumbTail, navWorkspacePage, location.pathname, session, workspacePage],
  );
  const platformNav = useMemo(
    () => buildPlatformNav(platformPage, navPlatformPage),
    [navPlatformPage, platformPage],
  );
  const platformBreadcrumbs = useMemo<AppShellBreadcrumbItem[] | undefined>(
    () => session && location.pathname.startsWith('/platform')
      ? [
        { key: 'platform', label: '平台工作台', icon: <DesktopOutlined />, onClick: () => navPlatformPage('overview') },
        { key: platformPage, label: platformPageLabels[platformPage] },
      ]
      : undefined,
    [location.pathname, navPlatformPage, platformPage, session],
  );
  const shellNav = session && location.pathname.startsWith('/platform')
    ? platformNav
    : session && location.pathname.startsWith('/workspace')
      ? workspaceNav
      : undefined;
  const shellBreadcrumbs = platformBreadcrumbs ?? workspaceBreadcrumbs;

  return (
    <AppShell
      session={session}
      onOpenLogin={openLogin}
      onLogout={handleLogout}
      workspaceNav={shellNav}
      workspaceBreadcrumbs={shellBreadcrumbs}
    >
      <Routes>
        <Route path="/" element={<PublicPage><HomePage onOpenLogin={openLogin} session={session} /></PublicPage>} />
        <Route
          path="/tasks"
          element={
            <PublicPage>
              <TaskSquarePage
                session={session}
                onOpenLogin={openLogin}
                onClaimedTask={(taskId) => {
                  const claimedTaskId = taskId.trim();
                  setWorkspacePage('labeler-tasks');
                  navigate(`/workspace?page=labeler-tasks&claimed_task_id=${encodeURIComponent(claimedTaskId)}&claimed_at=${Date.now()}`);
                }}
              />
            </PublicPage>
          }
        />
        <Route path="/tasks/assigned/:code" element={session ? <AssignedTaskEntry /> : <AssignedTaskLoginRedirect onOpenLogin={openLogin} />} />
        <Route path="/solutions" element={<PublicPage><SolutionsPage onOpenLogin={openLogin} /></PublicPage>} />
        <Route path="/publish" element={<Navigate to="/solutions" replace />} />
        <Route path="/help" element={<PublicPage><HelpPage /></PublicPage>} />
        <Route path="/oauth/callback" element={<OAuthCallbackPage session={session} onOpenOAuthOverlay={openOAuthOverlay} />} />
        <Route
          path="/onboarding"
          element={
            session
              ? session.user.role === 'pending'
                ? <OnboardingPage session={session} onComplete={setSession} />
                : <Navigate to={workspaceEntryForSession(session)} replace />
              : inviteJoinLocation
                ? <OnboardingPage inviteEntryPath={currentRelativeUrl} onOpenAuth={openLogin} />
                : <Navigate to="/" replace />
          }
        />
        <Route
          path="/platform/*"
          element={
            session
              ? session.user.role === 'pending'
                ? <Navigate to="/onboarding" replace />
                : canAccessPlatform(session)
                  ? <PlatformApp page={platformPage} />
                  : <Navigate to="/workspace" replace />
              : <Navigate to="/" replace />
          }
        />
        <Route
          path="/workspace/*"
          element={
            session
              ? session.user.role === 'pending'
                ? <Navigate to="/onboarding" replace />
                : canAccessPlatform(session)
                  ? <Navigate to="/platform" replace />
                : (
                  <WorkspaceApp
                    initialSession={session}
                    page={workspacePage}
                    onPageChange={navWorkspacePage}
                    operationLogFilters={operationLogFilters}
                    onOperationLogFiltersChange={changeOperationLogFilters}
                    onOpenOperationLogs={openWorkspaceOperationLogs}
                    onBreadcrumbTailChange={setBreadcrumbTail}
                    initialLabelingTaskId={workspaceQueryState.labelingTaskId}
                    claimedLabelingTaskId={workspaceQueryState.claimedTaskId}
                  />
                )
              : <Navigate to="/" replace />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {loginOverlay.open && (
        <LoginPage
          overlayMode
          initialMode={loginOverlay.mode === 'oauth-callback' ? undefined : loginOverlay.mode}
          oauthContext={loginOverlay.mode === 'oauth-callback' ? loginOverlay.oauth : undefined}
          redirectAfterLogin={getAuthReturnTarget() ?? undefined}
          onLoginSuccess={handleLoginSuccess}
          onClose={handleLoginOverlayClose}
        />
      )}
    </AppShell>
  );
}

function PublicPage({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <PublicFooter />
    </>
  );
}

function parseWorkspaceQuery(search: string): { page?: WorkspacePage; hasPageQuery: boolean; operationLogFilters?: OperationLogFilters; hasOperationLogFilters: boolean; labelingTaskId?: string; claimedTaskId?: string } {
  const params = new URLSearchParams(search);
  const page = normalizeWorkspacePage(params.get('page'));
  const labelingTaskId = page === 'labeling' ? params.get('task_id')?.trim() || undefined : undefined;
  const claimedTaskId = page === 'labeler-tasks' ? params.get('claimed_task_id')?.trim() || undefined : undefined;
  const operationLogFilterKeys = ['keyword', 'entity_type', 'entity_id', 'operator_id', 'risk_level', 'action', 'start_date', 'end_date'];
  const hasOperationLogFilters = operationLogFilterKeys.some((key) => params.has(key));
  return {
    page,
    hasPageQuery: params.has('page'),
    operationLogFilters: page === 'operation-logs' && hasOperationLogFilters ? operationLogFiltersFromParams(params) : undefined,
    hasOperationLogFilters,
    labelingTaskId,
    claimedTaskId,
  };
}

function normalizeWorkspacePage(value: string | null): WorkspacePage | undefined {
  if (!value) return undefined;
  return workspacePageLabels[value as WorkspacePage] ? value as WorkspacePage : undefined;
}

function operationLogFiltersFromParams(params: URLSearchParams): OperationLogFilters {
  return {
    keyword: params.get('keyword') || undefined,
    entity_type: params.get('entity_type') || undefined,
    entity_id: params.get('entity_id') || undefined,
    operator_id: params.get('operator_id') || undefined,
    risk_level: params.get('risk_level') || undefined,
    action: params.get('action') || undefined,
    start_date: params.get('start_date') || undefined,
    end_date: params.get('end_date') || undefined,
  };
}

function workspaceUrlFor(page: WorkspacePage, filters?: OperationLogFilters): string {
  const params = new URLSearchParams();
  if (page !== 'dashboard') params.set('page', page);
  if (page === 'operation-logs' && filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, String(value));
    });
  }
  const query = params.toString();
  return query ? `/workspace?${query}` : '/workspace';
}

const platformPageLabels: Record<PlatformPage, string> = {
  overview: '经营总览',
  settlements: '结算流水',
  verification: '认证审核',
  providers: 'AI Provider',
  settings: '平台规则',
};

function parsePlatformPage(search: string): PlatformPage | undefined {
  const page = new URLSearchParams(search).get('page') as PlatformPage | null;
  return page && platformPageLabels[page] ? page : undefined;
}

function platformUrlFor(page: PlatformPage): string {
  return page === 'overview' ? '/platform' : `/platform?page=${page}`;
}

function canAccessPlatform(session: AuthSession): boolean {
  return session.user.role === 'platform_admin' || session.user.permissions.includes('platform:manage') || session.user.permissions.includes('certification:review');
}

function workspaceEntryForSession(session: AuthSession | null): string {
  if (!session) return '/workspace';
  if (session.user.role === 'pending') return '/onboarding';
  if (canAccessPlatform(session)) return '/platform';
  return '/workspace';
}

function buildPlatformNav(currentPage: PlatformPage, navigatePage: (page: PlatformPage) => void): AppShellNavGroup[] {
  return [
    {
      id: 'platform-business',
      label: '平台运营',
      items: [
        { id: 'overview', label: platformPageLabels.overview, icon: <AppstoreOutlined />, active: currentPage === 'overview', onSelect: () => navigatePage('overview') },
        { id: 'settlements', label: platformPageLabels.settlements, icon: <FileTextOutlined />, active: currentPage === 'settlements', onSelect: () => navigatePage('settlements') },
        { id: 'verification', label: platformPageLabels.verification, icon: <SafetyCertificateOutlined />, active: currentPage === 'verification', onSelect: () => navigatePage('verification') },
        { id: 'providers', label: platformPageLabels.providers, icon: <ApiOutlined />, active: currentPage === 'providers', onSelect: () => navigatePage('providers') },
        { id: 'settings', label: platformPageLabels.settings, icon: <SettingOutlined />, active: currentPage === 'settings', onSelect: () => navigatePage('settings') },
      ],
    },
  ];
}

function sameOperationLogFilters(left?: OperationLogFilters, right?: OperationLogFilters): boolean {
  const keys: Array<keyof OperationLogFilters> = ['keyword', 'entity_type', 'entity_id', 'operator_id', 'risk_level', 'action', 'start_date', 'end_date'];
  return keys.every((key) => (left?.[key] || undefined) === (right?.[key] || undefined));
}

const workspacePageLabels: Record<WorkspacePage, string> = {
  dashboard: '主页面',
  'task-management': '任务管理',
  templates: '模板搭建',
  datasets: '数据集管理',
  'data-dashboard': '数据看板',
  'export-center': '导出中心',
  'ai-review': 'AI预审',
  'ai-review-task': 'AI预审任务明细',
  'manual-review': '人工审核',
  'organization-info': '企业信息',
  'resource-config': '资源配置',
  'people-management': '人员管理',
  announcements: '公告通知',
  'personal-inbox': '个人信箱',
  'operation-logs': '操作日志',
  'publish-task': '发布任务',
  account: '账号管理',
  'account-profile': '基础信息',
  'account-certifications': '资质认证',
  'account-certification-form': '添加认证',
  'account-points': '积分管理',
  'account-reputation': '信誉分管理',
  'certification-rules': '资质认证规则',
  'certification-material-guide': '认证材料说明',
  'certification-user-agreement': '用户使用协议',
  'points-level-rules': '等级规则',
  'labeler-dashboard': '主页面',
  'labeler-tasks': '我的任务',
  'labeler-questions': '任务历史',
  labeling: '标注页面',
};

const workspacePageIcons: Record<WorkspacePage, React.ReactNode> = {
  dashboard: <AppstoreOutlined />,
  'task-management': <RocketOutlined />,
  templates: <SlidersOutlined />,
  datasets: <DatabaseOutlined />,
  'data-dashboard': <BarChartOutlined />,
  'export-center': <CloudUploadOutlined />,
  'ai-review': <FileSearchOutlined />,
  'ai-review-task': <FileSearchOutlined />,
  'manual-review': <AuditOutlined />,
  'organization-info': <SettingOutlined />,
  'resource-config': <ApiOutlined />,
  'people-management': <TeamOutlined />,
  announcements: <BellOutlined />,
  'personal-inbox': <BellOutlined />,
  'operation-logs': <FileTextOutlined />,
  'publish-task': <RocketOutlined />,
  account: <SettingOutlined />,
  'account-profile': <SettingOutlined />,
  'account-certifications': <SafetyCertificateOutlined />,
  'account-certification-form': <SafetyCertificateOutlined />,
  'account-points': <BarChartOutlined />,
  'account-reputation': <StarOutlined />,
  'certification-rules': <SafetyCertificateOutlined />,
  'certification-material-guide': <SafetyCertificateOutlined />,
  'certification-user-agreement': <FileTextOutlined />,
  'points-level-rules': <BarChartOutlined />,
  'labeler-dashboard': <AppstoreOutlined />,
  'labeler-tasks': <EditOutlined />,
  'labeler-questions': <OrderedListOutlined />,
  labeling: <EditOutlined />,
};

function buildWorkspaceBreadcrumbs(
  page: WorkspacePage,
  setPage: (page: WorkspacePage) => void,
  tail: AppShellBreadcrumbItem | null,
): AppShellBreadcrumbItem[] {
  const activeTail = tail && (tail.parentKey === page || tail.key === page || tail.parentKey) ? tail : null;
  const parentPage = activeTail?.parentKey && workspacePageLabels[activeTail.parentKey as WorkspacePage]
    ? activeTail.parentKey as WorkspacePage
    : page;
  const items: AppShellBreadcrumbItem[] = [
    { key: 'workspace', label: '工作台', icon: <DesktopOutlined />, onClick: () => setPage('dashboard') },
  ];
  if (parentPage !== 'dashboard') {
    items.push({
      key: parentPage,
      label: activeTail?.parentLabel ?? workspacePageLabels[parentPage],
      icon: workspacePageIcons[parentPage],
      onClick: activeTail?.parentOnClick ?? (() => setPage(parentPage)),
    });
  }
  if (activeTail && activeTail.key !== parentPage) {
    items.push(activeTail);
  }
  return items;
}

function AssignedTaskEntry() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState<TaskPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getAssignedTask(code)
      .then((data) => {
        if (active) setTask(data);
      })
      .catch(() => {
        if (active) setError('指派链接无效或已过期');
      });
    return () => {
      active = false;
    };
  }, [code]);

  if (error) {
    return <main className="workspace-content"><Alert className="inline-message-ant" type="error" showIcon title={error} /></main>;
  }
  if (!task) {
    return <main className="workspace-content workspace-loading-page"><WorkspaceLoading tip="正在校验指派链接" /></main>;
  }
  return (
    <main className="workspace-content">
      <section className="page-heading">
        <div>
          <p className="section-kicker">Assigned task</p>
          <h1>{task?.title ?? '正在绑定指派任务'}</h1>
          <p>{task ? '指派链接已校验当前登录账号，后续可进入标注工作台领取作答。' : '正在校验指派链接...'}</p>
        </div>
        {task && <Tag color="blue">{task.status}</Tag>}
      </section>
      {task && (
        <section className="workspace-card">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <p>{task.description || '暂无任务说明'}</p>
            <Space wrap>
              <Button type="primary" onClick={() => navigate(`/tasks?keyword=${encodeURIComponent(task.task_id)}`)}>
                去任务广场领取
              </Button>
              <Button onClick={() => navigate('/tasks')}>
                返回任务广场
              </Button>
            </Space>
          </Space>
        </section>
      )}
    </main>
  );
}

function AssignedTaskLoginRedirect({ onOpenLogin }: { onOpenLogin: (mode: 'login' | 'register', returnTarget?: string) => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const returnTarget = useMemo(
    () => currentRelativeAppUrl({ pathname: location.pathname, search: location.search, hash: location.hash }),
    [location.hash, location.pathname, location.search],
  );

  useEffect(() => {
    onOpenLogin('login', returnTarget);
    navigate('/', { replace: true });
  }, [navigate, onOpenLogin, returnTarget]);

  return <main className="workspace-content workspace-loading-page"><WorkspaceLoading tip="正在打开登录" /></main>;
}

function OAuthCallbackPage({
  onOpenOAuthOverlay,
  session,
}: {
  onOpenOAuthOverlay: (oauth: OAuthOverlayState) => void;
  session: AuthSession | null;
}) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const ticket = searchParams.get('ticket');
  const provider = searchParams.get('provider') || undefined;
  const intent = (searchParams.get('intent') as OAuthCallbackIntent | null) ?? 'login';
  const redirectAfterLogin = normalizeAppRelativePath(searchParams.get('redirect_after_login') ?? '');
  const accountBindReturnTarget = redirectAfterLogin || '/workspace?page=account';

  useEffect(() => {
    if (!ticket) return;
    if (intent === 'bind_current_user') {
      if (!session && !getStoredSessionWithStorage()) {
        setAuthReturnTarget(accountBindReturnTarget);
        message.error('当前登录已过期，请重新登录后再绑定第三方账号');
        navigate('/', { replace: true });
        return;
      }
      let cancelled = false;
      void (async () => {
        try {
          await linkOAuthCurrentUser({ ticket });
          if (cancelled) return;
          message.success(`${oauthProviderLabels[provider ?? ''] ?? '第三方'}账号已绑定到当前账号`);
          navigate(accountBindReturnTarget, { replace: true });
        } catch (error) {
          if (cancelled) return;
          if (error instanceof ApiClientError && error.status === 401) {
            setAuthReturnTarget(accountBindReturnTarget);
            message.error('当前登录已过期，请重新登录后再绑定第三方账号');
            navigate('/', { replace: true });
            return;
          }
          message.error(error instanceof ApiClientError ? error.message : '第三方账号绑定失败');
          navigate(accountBindReturnTarget, { replace: true });
        }
      })();
      return () => {
        cancelled = true;
      };
    }
    if (redirectAfterLogin) {
      setAuthReturnTarget(redirectAfterLogin);
    }
    onOpenOAuthOverlay({ ticket, provider, initialMode: 'bind' });
  }, [accountBindReturnTarget, intent, navigate, onOpenOAuthOverlay, provider, redirectAfterLogin, session, ticket]);

  return <HomePage onOpenLogin={() => undefined} session={session} />;
}
