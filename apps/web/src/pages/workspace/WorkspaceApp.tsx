import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Avatar, Button, Card, Descriptions, Empty, Form, Input, Modal, notification, Progress, Segmented, Space, Table, Tabs, Tag, Timeline, Upload, message as antdMessage, type TableColumnsType, type UploadProps } from 'antd';
import { AppstoreOutlined, ArrowLeftOutlined, ArrowRightOutlined, BankOutlined, BarsOutlined, CalendarOutlined, CheckOutlined, CloseCircleOutlined, CloseOutlined, CreditCardOutlined, DashboardOutlined, DisconnectOutlined, EditOutlined, EyeOutlined, FileDoneOutlined, FileSearchOutlined, HistoryOutlined, InboxOutlined, LockOutlined, LogoutOutlined, PlusOutlined, ReloadOutlined, RobotOutlined, SaveOutlined, SearchOutlined, SendOutlined, SnippetsOutlined, StopOutlined, TrophyOutlined, UploadOutlined, UserOutlined } from '@ant-design/icons';
import type { AppShellBreadcrumbItem } from '../../components/layout/AppShell';
import { getStoredSession, getStoredSessionWithStorage, updateStoredSessionUser, type AuthSession } from '../../stores/authStore';
import { ApiClientError, authenticatedFetch, getApiBaseUrl } from '../../services/apiClient';
import { changePassword, listOAuthIdentities, revokeOtherSessions, unlinkOAuthIdentity } from '../../services/authService';
import { abandonLabelingQuestion, completeLabelingTask, generateLabelingAiAssist, getLabelerContributions, getLabelingQuestion, getLabelingRejection, getLabelingWorkbench, getMyLabelingTasks, saveLabelingDraft, submitLabelingQuestion } from '../../services/taskService';
import {
  getAdminOverview,
  getMyProfile,
  getPoints,
  getReputation,
  getTeamMembers,
  submitDomainCertification,
  submitEducationCertification,
  updateMyProfile,
  uploadProfileAvatar,
  uploadProfileMaterial,
  submitReputationAppeal,
} from '../../services/workspaceService';
import type { AdminOverview, ApiUser, Certification, LabelerContributionsPayload, LabelerTaskListPayload, LabelingAiAssistPayload, LabelingQuestionPayload, LabelingRejectionPayload, LabelingWorkbenchPayload, OAuthIdentityPayload, PointsPayload, ReputationPayload, ProfilePayload, TeamDetail, TeamMember, TemplateComponentSchema, TemplateSchemaPayload, TemplateValidationPayload } from '../../types/api';
import { DatasetManagementPage, TaskManagementPage, TaskPublishWorkspacePage, TemplateDesignerPage } from './OwnerProductionPages';
import { OrganizationProfilePage } from './OrganizationProfilePage';
import { PeopleManagementPage } from './PeopleManagementPage';
import { ResourceConfigPage } from './ResourceConfigPage';
import { AnnouncementsPage } from './AnnouncementsPage';
import { PersonalInboxPage } from './PersonalInboxPage';
import { OperationLogsPage, type OperationLogFilters } from './OperationLogsPage';
import { ReviewQueuePage } from './ReviewQueuePage';
import { AiReviewPage, AiReviewTaskDetailPage } from './AiReviewPage';
import { LabelerDashboardPage } from './LabelerDashboardPage';
import { WorkspaceDashboardPage } from './WorkspaceDashboardPage';
import { TemplateRenderer } from './TemplateRenderer';
import { WorkspaceTableActions } from './WorkspaceTableActions';
import { formatShortId } from './workspaceDisplay';
import { canAccessWorkspacePage, getDefaultWorkspacePage } from '../../app/workspaceNavigation';
import { getEnterpriseWorkspaceRole, isEnterpriseUser, isLabelerUser, isTeamLabelerUser } from '../../app/workspaceAccess';
import { OAuthProviderIcon, type OAuthProviderKey } from '../../components/auth/OAuthProviderIcon';
import { formatApiDateTime, formatApiTime } from '../../utils/dateTime';
import './WorkspaceApp.css';

export type WorkspacePage =
  | 'dashboard'
  | 'task-management'
  | 'templates'
  | 'datasets'
  | 'data-dashboard'
  | 'export-center'
  | 'ai-review'
  | 'ai-review-task'
  | 'manual-review'
  | 'organization-info'
  | 'resource-config'
  | 'people-management'
  | 'announcements'
  | 'personal-inbox'
  | 'operation-logs'
  | 'account'
  | 'account-profile'
  | 'account-certifications'
  | 'account-certification-form'
  | 'account-points'
  | 'account-reputation'
  | 'certification-rules'
  | 'certification-material-guide'
  | 'certification-user-agreement'
  | 'points-level-rules'
  | 'labeler-dashboard'
  | 'labeler-tasks'
  | 'labeler-questions'
  | 'labeling'
  | 'publish-task';
type AccountTab =
  | 'overview'
  | 'profile'
  | 'security'
  | 'oauth'
  | 'certifications'
  | 'points'
  | 'reputation';

const roleLabels: Record<string, string> = {
  admin: '企业管理员',
  owner: '任务负责人',
  reviewer: '审核员',
  labeler: '标注员',
  agent: 'Agent',
  platform_admin: '平台管理员',
};

const teamRoleLabels: Record<string, string> = {
  team_admin: '企业管理员',
  owner: 'Owner',
  reviewer: 'Reviewer',
  agent: 'Agent',
  labeler: 'Labeler',
};

const educationLevelLabels: Record<string, string> = {
  associate: '专科',
  bachelor: '本科',
  master: '硕士',
  doctor: '博士',
  other: '其他',
};

const professionalIndustryGroups = [
  { value: 'finance', label: '财经领域', professions: ['金融通用资质', '会计税务从业人员', '期货从业人员', '拍卖师', '保险从业人员', '证券从业人员', '基金从业人员'] },
  { value: 'judicial', label: '司法领域', professions: ['公证员', '法官', '大学法学院教师/教授', '仲裁员', '执业律师', '检察官', '法律职业资格'] },
  { value: 'psychology', label: '心理领域', professions: ['心理学社会企业工作人员', '心理学历', '心理治疗师', '心理学学者', '心理咨询师', '临床心理学从业者'] },
  { value: 'medical', label: '医疗领域', professions: ['卫生专技人员', '健康系统社会职务人员', '护士', '医学学历', '高校医学教师', '医生', '药师'] },
  { value: 'education', label: '教育领域', professions: ['高中/中学/小学教师', '大学教师', '幼师'] },
];

type LabelerAccountPage = 'account-profile' | 'account-certifications' | 'account-points' | 'account-reputation';

const labelerAccountPageToTab: Record<LabelerAccountPage, AccountTab> = {
  'account-profile': 'profile',
  'account-certifications': 'certifications',
  'account-points': 'points',
  'account-reputation': 'reputation',
};

const accountTabToLabelerPage: Partial<Record<AccountTab, LabelerAccountPage>> = {
  profile: 'account-profile',
  certifications: 'account-certifications',
  points: 'account-points',
  reputation: 'account-reputation',
};

function getWorkspaceTeamRoleLabel(member: Pick<TeamMember, 'team_role' | 'team_role_label' | 'is_system_member'> | null | undefined) {
  if (!member) return '-';
  if (member.team_role === 'agent' || member.is_system_member) return 'Agent';
  return member.team_role_label || teamRoleLabels[member.team_role || ''] || member.team_role || '-';
}

function getUserDisplayName(user: Pick<ApiUser, 'username' | 'display_name'> | null | undefined, fallback?: string | null) {
  return user?.display_name || fallback || user?.username || '-';
}

function isLabelerAccountPage(page: WorkspacePage): page is LabelerAccountPage {
  return page === 'account-profile' || page === 'account-certifications' || page === 'account-points' || page === 'account-reputation';
}

export function WorkspaceApp({
  initialSession,
  page,
  onPageChange,
  operationLogFilters,
  onOperationLogFiltersChange,
  onOpenOperationLogs,
  onBreadcrumbTailChange,
  initialLabelingTaskId,
  claimedLabelingTaskId,
}: {
  initialSession: AuthSession;
  page?: WorkspacePage;
  onPageChange?: (page: WorkspacePage) => void;
  operationLogFilters?: OperationLogFilters;
  onOperationLogFiltersChange?: (filters?: OperationLogFilters) => void;
  onOpenOperationLogs?: (filters?: OperationLogFilters) => void;
  onBreadcrumbTailChange?: (tail: AppShellBreadcrumbItem | null) => void;
  initialLabelingTaskId?: string;
  claimedLabelingTaskId?: string;
}) {
  const [session] = useState<AuthSession>(initialSession);
  const [localPage, setLocalPage] = useState<WorkspacePage>(getDefaultWorkspacePage(initialSession.user));
  const [accountTab, setAccountTab] = useState<AccountTab>(isLabelerUser(initialSession.user) ? 'profile' : 'overview');
  const [localOperationLogFilters, setLocalOperationLogFilters] = useState<OperationLogFilters | undefined>();
  const [activeLabelingTaskId, setActiveLabelingTaskId] = useState(initialLabelingTaskId);
  const [activeAiReviewTaskId, setActiveAiReviewTaskId] = useState<string | undefined>(() => new URLSearchParams(window.location.search).get('task_id') || undefined);
  const [editingCertification, setEditingCertification] = useState<Certification | null>(null);
  const requestedPage = page ?? localPage;
  const currentPage = canAccessWorkspacePage(session.user, requestedPage)
    ? requestedPage
    : getDefaultWorkspacePage(session.user);
  const setPage = onPageChange ?? setLocalPage;
  const teamLabeler = isTeamLabelerUser(session.user);
  const enterpriseRole = getEnterpriseWorkspaceRole(session.user);
  const organizationReadonly = teamLabeler || enterpriseRole === 'owner' || enterpriseRole === 'reviewer';
  const activeOperationLogFilters = onOperationLogFiltersChange ? operationLogFilters : localOperationLogFilters;
  const setOperationLogFilters = onOperationLogFiltersChange ?? setLocalOperationLogFilters;
  const standaloneNav = !page && !onPageChange;
  const activeAccountTab = isLabelerUser(session.user) && isLabelerAccountPage(currentPage)
    ? labelerAccountPageToTab[currentPage]
    : currentPage === 'account-certification-form'
      ? 'certifications'
    : accountTab;

  const openOperationLogs = (filters?: OperationLogFilters) => {
    if (!canAccessWorkspacePage(session.user, 'operation-logs')) {
      setPage(getDefaultWorkspacePage(session.user));
      return;
    }
    if (onOpenOperationLogs) {
      onOpenOperationLogs(filters);
      return;
    }
    setOperationLogFilters(filters);
    setPage('operation-logs');
  };

  const navigateWorkspacePage = useCallback((nextPage: WorkspacePage) => {
    if (nextPage !== 'operation-logs') setOperationLogFilters(undefined);
    setPage(nextPage);
  }, [setOperationLogFilters, setPage]);

  const openWorkspacePageInNewTab = useCallback((nextPage: WorkspacePage) => {
    const query = nextPage === 'dashboard' ? '' : `?page=${encodeURIComponent(nextPage)}`;
    window.open(`/workspace${query}`, '_blank', 'noopener,noreferrer');
  }, []);

  useEffect(() => {
    if (!initialLabelingTaskId) return;
    const timer = window.setTimeout(() => setActiveLabelingTaskId(initialLabelingTaskId), 0);
    return () => window.clearTimeout(timer);
  }, [initialLabelingTaskId]);

  useEffect(() => {
    if (!window.location.pathname.startsWith('/workspace')) return;
    const params = new URLSearchParams(window.location.search);
    if (currentPage === 'ai-review-task' && activeAiReviewTaskId) {
      params.set('page', 'ai-review-task');
      params.set('task_id', activeAiReviewTaskId);
    } else if (params.get('task_id')) {
      params.delete('task_id');
      if (currentPage !== 'dashboard') params.set('page', currentPage);
    } else {
      return;
    }
    const query = params.toString();
    window.history.replaceState(null, '', query ? `/workspace?${query}` : '/workspace');
  }, [activeAiReviewTaskId, currentPage]);

  const openLabelingTask = useCallback((taskId: string) => {
    const normalizedTaskId = taskId.trim();
    if (!normalizedTaskId) return;
    window.localStorage.setItem('markup:lastLabelingTaskId', normalizedTaskId);
    setActiveLabelingTaskId(normalizedTaskId);
    navigateWorkspacePage('labeling');
  }, [navigateWorkspacePage]);

  const navigateAccountTab = useCallback((tab: AccountTab) => {
    setAccountTab(tab);
    if (isLabelerUser(session.user)) {
      const nextPage = accountTabToLabelerPage[tab];
      if (nextPage) navigateWorkspacePage(nextPage);
    }
  }, [navigateWorkspacePage, session.user]);

  useEffect(() => {
    if (!onBreadcrumbTailChange) return undefined;
    if (currentPage === 'account-certification-form') {
      onBreadcrumbTailChange({
        key: 'account-certification-form-detail',
        parentKey: 'account-certifications',
        parentLabel: '资质认证',
        parentOnClick: () => {
          setAccountTab('certifications');
          navigateWorkspacePage('account-certifications');
        },
        label: '添加认证',
      });
      return () => onBreadcrumbTailChange(null);
    }
    if (currentPage === 'certification-rules') {
      onBreadcrumbTailChange({
        key: 'certification-rules-detail',
        parentKey: 'certification-rules',
        parentLabel: '资质认证',
        parentOnClick: () => {
          setAccountTab('certifications');
          navigateWorkspacePage(isLabelerUser(session.user) ? 'account-certifications' : 'account');
        },
        label: '资质认证规则',
      });
      return () => onBreadcrumbTailChange(null);
    }
    if (currentPage === 'certification-user-agreement') {
      onBreadcrumbTailChange({
        key: 'certification-user-agreement-detail',
        parentKey: 'certification-user-agreement',
        parentLabel: '资质认证',
        parentOnClick: () => {
          setAccountTab('certifications');
          navigateWorkspacePage(isLabelerUser(session.user) ? 'account-certifications' : 'account');
        },
        label: '用户使用协议',
      });
      return () => onBreadcrumbTailChange(null);
    }
    if (currentPage === 'certification-material-guide') {
      onBreadcrumbTailChange({
        key: 'certification-material-guide-detail',
        parentKey: 'certification-material-guide',
        parentLabel: '资质认证',
        parentOnClick: () => {
          setAccountTab('certifications');
          navigateWorkspacePage(isLabelerUser(session.user) ? 'account-certifications' : 'account');
        },
        label: '认证材料说明',
      });
      return () => onBreadcrumbTailChange(null);
    }
    if (currentPage === 'points-level-rules') {
      onBreadcrumbTailChange({
        key: 'points-level-rules-detail',
        parentKey: 'points-level-rules',
        parentLabel: '积分管理',
        parentOnClick: () => {
          setAccountTab('points');
          navigateWorkspacePage(isLabelerUser(session.user) ? 'account-points' : 'account');
        },
        label: '等级规则',
      });
      return () => onBreadcrumbTailChange(null);
    }
    if (currentPage === 'ai-review-task') {
      onBreadcrumbTailChange({
        key: 'ai-review-task-detail',
        parentKey: 'ai-review',
        parentLabel: 'AI预审',
        parentOnClick: () => navigateWorkspacePage('ai-review'),
        label: '任务明细',
      });
      return () => onBreadcrumbTailChange(null);
    }
    if (currentPage === 'manual-review') {
      return undefined;
    }
    onBreadcrumbTailChange(null);
    return undefined;
  }, [currentPage, navigateWorkspacePage, onBreadcrumbTailChange, session.user]);

  useEffect(() => {
    if (canAccessWorkspacePage(session.user, currentPage)) return;
    const fallbackPage = getDefaultWorkspacePage(session.user);
    if (fallbackPage !== currentPage) {
      setPage(fallbackPage);
    }
  }, [currentPage, session.user, setPage]);

  if (!session.accessToken) {
    return null;
  }

  return (
    <div className="workspace-app">
      {standaloneNav && (
        <nav className="workspace-standalone-nav" aria-label="工作台导航">
          {!isLabelerUser(session.user) && (
            <button type="button" className={currentPage === 'dashboard' ? 'active' : ''} onClick={() => navigateWorkspacePage('dashboard')}><DashboardOutlined aria-hidden="true" /> 主页面</button>
          )}
          {isLabelerUser(session.user) ? (
            <>
              <button type="button" className={currentPage === 'labeler-dashboard' ? 'active' : ''} onClick={() => navigateWorkspacePage('labeler-dashboard')}><DashboardOutlined aria-hidden="true" /> 主页面</button>
              <button type="button" className={currentPage === 'labeler-tasks' || currentPage === 'labeling' ? 'active' : ''} onClick={() => navigateWorkspacePage('labeler-tasks')}><SnippetsOutlined aria-hidden="true" /> {teamLabeler ? '我的项目' : '我的任务'}</button>
              <button type="button" className={currentPage === 'labeler-questions' ? 'active' : ''} onClick={() => navigateWorkspacePage('labeler-questions')}><HistoryOutlined aria-hidden="true" /> {teamLabeler ? '项目历史' : '任务历史'}</button>
              {!teamLabeler && (
                <>
                  <button type="button" className={currentPage === 'account-profile' ? 'active' : ''} onClick={() => navigateWorkspacePage('account-profile')}><UserOutlined aria-hidden="true" /> 基础信息</button>
                  <button type="button" className={currentPage === 'account-certifications' || currentPage === 'account-certification-form' ? 'active' : ''} onClick={() => navigateWorkspacePage('account-certifications')}><FileDoneOutlined aria-hidden="true" /> 资质认证</button>
                  <button type="button" className={currentPage === 'account-points' ? 'active' : ''} onClick={() => navigateWorkspacePage('account-points')}><TrophyOutlined aria-hidden="true" /> 积分管理</button>
                  <button type="button" className={currentPage === 'account-reputation' ? 'active' : ''} onClick={() => navigateWorkspacePage('account-reputation')}><CheckOutlined aria-hidden="true" /> 信誉分管理</button>
                </>
              )}
              {teamLabeler && (
                <>
                  <button type="button" className={currentPage === 'organization-info' ? 'active' : ''} onClick={() => navigateWorkspacePage('organization-info')}><DashboardOutlined aria-hidden="true" /> 企业信息</button>
                  <button type="button" className={currentPage === 'people-management' ? 'active' : ''} onClick={() => navigateWorkspacePage('people-management')}><UserOutlined aria-hidden="true" /> 人员管理</button>
                  <button type="button" className={currentPage === 'account' ? 'active' : ''} onClick={() => navigateWorkspacePage('account')}><UserOutlined aria-hidden="true" /> 账号管理</button>
                </>
              )}
            </>
          ) : (
            <button type="button" className={currentPage === 'account' ? 'active' : ''} onClick={() => navigateWorkspacePage('account')}><UserOutlined aria-hidden="true" /> 账号管理</button>
          )}
        </nav>
      )}
      {currentPage === 'dashboard' && <WorkspaceDashboardPage user={session.user} onNavigate={navigateWorkspacePage} />}
      {currentPage === 'labeler-dashboard' && (
        <LabelerDashboardPage
          user={session.user}
          teamLabeler={teamLabeler}
          onNavigate={navigateWorkspacePage}
          onOpenLabelingTask={openLabelingTask}
        />
      )}
      {(currentPage === 'account' || isLabelerAccountPage(currentPage)) && (
        <AccountPage
          session={session}
          user={session.user}
          activeTab={activeAccountTab}
          onTabChange={navigateAccountTab}
          enterpriseAccount={currentPage === 'account'}
          onOpenCertificationRules={() => {
            setAccountTab('certifications');
            if (isLabelerUser(session.user)) {
              openWorkspacePageInNewTab('certification-rules');
            } else {
              navigateWorkspacePage('certification-rules');
            }
          }}
          onOpenCertificationAgreement={() => {
            setAccountTab('certifications');
            if (isLabelerUser(session.user)) {
              openWorkspacePageInNewTab('certification-user-agreement');
            } else {
              navigateWorkspacePage('certification-user-agreement');
            }
          }}
          onOpenCertificationForm={(cert) => {
            setEditingCertification(cert ?? null);
            navigateWorkspacePage('account-certification-form');
          }}
          onSelectCertification={setEditingCertification}
        />
      )}
      {currentPage === 'account-certification-form' && (
        <CertificationPanel
          user={session.user}
          labeler
          formOnly
          editingCertification={editingCertification}
          onSelectCertification={setEditingCertification}
          onBack={() => navigateWorkspacePage('account-certifications')}
          onOpenRules={() => openWorkspacePageInNewTab('certification-rules')}
          onOpenAgreement={() => openWorkspacePageInNewTab('certification-user-agreement')}
        />
      )}
      {currentPage === 'certification-rules' && <CertificationRulesPage onBack={() => { setAccountTab('certifications'); navigateWorkspacePage(isLabelerUser(session.user) ? 'account-certifications' : 'account'); }} />}
      {currentPage === 'certification-material-guide' && <CertificationMaterialGuidePage onBack={() => { setAccountTab('certifications'); navigateWorkspacePage(isLabelerUser(session.user) ? 'account-certifications' : 'account'); }} />}
      {currentPage === 'certification-user-agreement' && <CertificationUserAgreementPage onBack={() => { setAccountTab('certifications'); navigateWorkspacePage(isLabelerUser(session.user) ? 'account-certifications' : 'account'); }} />}
      {currentPage === 'points-level-rules' && <PointsLevelRulesPage onBack={() => { setAccountTab('points'); navigateWorkspacePage(isLabelerUser(session.user) ? 'account-points' : 'account'); }} />}
      {currentPage === 'labeler-tasks' && <LabelerTasksPage onOpenLabelingTask={openLabelingTask} claimedTaskId={claimedLabelingTaskId} teamLabeler={teamLabeler} />}
      {currentPage === 'labeler-questions' && <LabelerQuestionsPage onOpenTasks={() => navigateWorkspacePage('labeler-tasks')} teamLabeler={teamLabeler} />}
      {currentPage === 'labeling' && <LabelingPage initialTaskId={activeLabelingTaskId} onComplete={() => navigateWorkspacePage('labeler-tasks')} onTaskFinished={() => navigateWorkspacePage('labeler-questions')} />}
      {currentPage === 'datasets' && (
        <DatasetManagementPage
          onBreadcrumbTailChange={onBreadcrumbTailChange}
          onOpenTemplate={() => navigateWorkspacePage('templates')}
          onOpenPublish={() => navigateWorkspacePage('publish-task')}
        />
      )}
      {currentPage === 'templates' && <TemplateDesignerPage onBreadcrumbTailChange={onBreadcrumbTailChange} />}
      {currentPage === 'publish-task' && <TaskPublishWorkspacePage onBreadcrumbTailChange={onBreadcrumbTailChange} onBack={() => navigateWorkspacePage('task-management')} />}
      {currentPage === 'task-management' && <TaskManagementPage onBreadcrumbTailChange={onBreadcrumbTailChange} />}
      {currentPage === 'ai-review' && (
        <AiReviewPage
          onOpenTask={(taskId) => {
            setActiveAiReviewTaskId(taskId);
            navigateWorkspacePage('ai-review-task');
          }}
        />
      )}
      {currentPage === 'ai-review-task' && (
        <AiReviewTaskDetailPage
          taskId={activeAiReviewTaskId}
          onBack={() => navigateWorkspacePage('ai-review')}
        />
      )}
      {currentPage === 'manual-review' && <ReviewQueuePage user={session.user} onBreadcrumbTailChange={onBreadcrumbTailChange} />}
      {currentPage === 'organization-info' && (
        <OrganizationProfilePage
          user={session.user}
          readonly={organizationReadonly}
          onOpenPeople={() => navigateWorkspacePage('people-management')}
          onOpenResources={() => navigateWorkspacePage('resource-config')}
          onOpenLogs={openOperationLogs}
        />
      )}
      {currentPage === 'resource-config' && <ResourceConfigPage onOpenLogs={openOperationLogs} onOpenTasks={() => navigateWorkspacePage('task-management')} />}
      {currentPage === 'people-management' && <PeopleManagementPage onOpenLogs={openOperationLogs} readonly={organizationReadonly} />}
      {currentPage === 'announcements' && <AnnouncementsPage user={session.user} />}
      {currentPage === 'personal-inbox' && <PersonalInboxPage />}
      {currentPage === 'operation-logs' && (
        <OperationLogsPage
          initialFilters={activeOperationLogFilters}
          onFiltersChange={onOperationLogFiltersChange ? setOperationLogFilters : undefined}
        />
      )}
    </div>
  );
}

export function WorkspaceBootstrap() {
  const session = getStoredSession(window.localStorage) ?? getStoredSession(window.sessionStorage);
  if (!session) return null;
  return <WorkspaceApp initialSession={session} />;
}

function AccountPage({
  session,
  user,
  activeTab,
  onTabChange,
  enterpriseAccount = false,
  onOpenCertificationRules,
  onOpenCertificationAgreement,
  onOpenCertificationForm,
  onSelectCertification,
}: {
  session: AuthSession;
  user: ApiUser;
  activeTab: AccountTab;
  onTabChange: (tab: AccountTab) => void;
  enterpriseAccount?: boolean;
  onOpenCertificationRules?: () => void;
  onOpenCertificationAgreement?: () => void;
  onOpenCertificationForm?: (cert?: Certification) => void;
  onSelectCertification?: (cert: Certification | null) => void;
}) {
  if (isLabelerUser(user) && !enterpriseAccount) {
    return (
      <LabelerAccountPage
        user={user}
        activeTab={activeTab}
        onOpenCertificationRules={onOpenCertificationRules}
        onOpenCertificationAgreement={onOpenCertificationAgreement}
        onOpenCertificationForm={onOpenCertificationForm}
        onSelectCertification={onSelectCertification}
      />
    );
  }
  return <EnterpriseAccountPage session={session} user={user} activeTab={activeTab} onTabChange={onTabChange} />;
}

function EnterpriseAccountPage({ session, user, activeTab, onTabChange }: { session: AuthSession; user: ApiUser; activeTab: AccountTab; onTabChange: (tab: AccountTab) => void }) {
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [currentMember, setCurrentMember] = useState<TeamMember | null>(null);
  const [oauthIdentities, setOauthIdentities] = useState<OAuthIdentityPayload[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, contextHolder] = antdMessage.useMessage();
  const overviewTeams = Array.isArray(overview?.teams) ? overview.teams : [];
  const team = overviewTeams.find((item) => item.team_id === overview?.default_team_id) ?? overviewTeams[0] ?? null;

  const loadAccount = useCallback(async () => {
    setLoading(true);
    try {
      const [profileData, identities] = await Promise.all([
        getMyProfile(),
        listOAuthIdentities().catch(() => ({ items: [] })),
      ]);
      setProfile(profileData);
      setOauthIdentities(identities.items);
      if (isEnterpriseUser(user) || isTeamLabelerUser(user)) {
        const data = await getAdminOverview();
        const loadedTeams = Array.isArray(data.teams) ? data.teams : [];
        setOverview({ ...data, teams: loadedTeams });
        const defaultTeam = loadedTeams.find((item) => item.team_id === data.default_team_id) ?? loadedTeams[0];
        if (defaultTeam) {
          const members = await getTeamMembers(defaultTeam.team_id, { status: 'active' });
          setCurrentMember(members.items.find((item) => item.is_current_user || item.user_id === user.user_id) ?? null);
        }
      }
    } catch {
      setProfile(null);
      setOauthIdentities([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAccount();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAccount]);

  const tabs = [
    { key: 'overview', label: '账号概览' },
    { key: 'profile', label: '基本资料' },
    { key: 'security', label: '账号安全' },
    { key: 'oauth', label: '第三方账号' },
  ];
  const safeTab = tabs.some((item) => item.key === activeTab) ? activeTab : 'overview';

  const updateStoredUser = (patch: Partial<ApiUser>) => {
    updateStoredSessionUser(patch);
    window.dispatchEvent(new CustomEvent('markup:session-updated'));
  };

  return (
    <main className="workspace-content personal-account-page workspace-fixed-page">
      {contextHolder}
      <section className="page-heading">
        <div>
          <p className="section-kicker">Account</p>
          <h1>账号管理</h1>
        </div>
        <Tag color={profile?.user?.email_verified ?? user.email_verified ? 'green' : 'orange'}>
          {profile?.user?.email_verified ?? user.email_verified ? '邮箱已验证' : '邮箱未验证'}
        </Tag>
      </section>
      <section className="account-center-panel workspace-fixed-scroll-panel">
        <Tabs
          className="account-center-tabs"
          activeKey={safeTab}
          animated={false}
          onChange={(key) => onTabChange(key as AccountTab)}
          items={tabs.map((item) => ({
            ...item,
            children: (
              <AccountTabPanel
                activeTab={item.key as AccountTab}
                session={session}
                user={user}
                profile={profile}
                team={team}
                member={currentMember}
                oauthIdentities={oauthIdentities}
                loading={loading}
                onReload={() => void loadAccount()}
                onStoredUserChange={updateStoredUser}
                onNotice={(type, text) => {
                  void notice[type](text);
                }}
              />
            ),
          }))}
        />
      </section>
    </main>
  );
}

function LabelerAccountPage({
  user,
  activeTab,
  onOpenCertificationRules,
  onOpenCertificationAgreement,
  onOpenCertificationForm,
  onSelectCertification,
}: {
  user: ApiUser;
  activeTab: AccountTab;
  onOpenCertificationRules?: () => void;
  onOpenCertificationAgreement?: () => void;
  onOpenCertificationForm?: (cert?: Certification) => void;
  onSelectCertification?: (cert: Certification | null) => void;
}) {
  const safeTab = activeTab === 'certifications' || activeTab === 'points' || activeTab === 'reputation' ? activeTab : 'profile';

  return (
    <main className="workspace-content labeler-account-layout">
      <section className="settings-panel">
        {safeTab === 'profile' && <ProfilePanel user={user} labeler />}
        {safeTab === 'certifications' && <CertificationPanel user={user} labeler onOpenRules={onOpenCertificationRules} onOpenAgreement={onOpenCertificationAgreement} onOpenForm={onOpenCertificationForm} onSelectCertification={onSelectCertification} />}
        {safeTab === 'points' && <PointsPanel labeler />}
        {safeTab === 'reputation' && <ReputationPanel />}
      </section>
    </main>
  );
}

function AccountTabPanel({
  activeTab,
  session,
  user,
  profile,
  team,
  member,
  oauthIdentities,
  loading,
  onReload,
  onStoredUserChange,
  onNotice,
}: {
  activeTab: AccountTab;
  session: AuthSession;
  user: ApiUser;
  profile: ProfilePayload | null;
  team: TeamDetail | null;
  member: TeamMember | null;
  oauthIdentities: OAuthIdentityPayload[];
  loading: boolean;
  onReload: () => void;
  onStoredUserChange: (patch: Partial<ApiUser>) => void;
  onNotice: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  if (activeTab === 'overview') return <AccountOverviewPanel user={user} profile={profile} team={team} member={member} oauthIdentities={oauthIdentities} loading={loading} />;
  if (activeTab === 'profile') return <AccountProfilePanel user={user} profile={profile} onReload={onReload} onStoredUserChange={onStoredUserChange} onNotice={onNotice} />;
  if (activeTab === 'security') return <AccountSecurityPanel session={session} onNotice={onNotice} />;
  return <OAuthAccountsPanel identities={oauthIdentities} onReload={onReload} onNotice={onNotice} />;
}

function AccountOverviewPanel({
  user,
  profile,
  team,
  member,
  oauthIdentities,
  loading,
}: {
  user: ApiUser;
  profile: ProfilePayload | null;
  team: TeamDetail | null;
  member: TeamMember | null;
  oauthIdentities: OAuthIdentityPayload[];
  loading: boolean;
}) {
  const displayName = profile?.profile.display_name || getUserDisplayName(user);
  const emailVerified = profile?.user.email_verified ?? user.email_verified;
  const accountStatus = profile?.user.status === 'active' ? '正常' : profile?.user.status || '未知';
  const linkedProviderCount = new Set(oauthIdentities.map((item) => item.provider).filter(Boolean)).size;
  return (
    <div className="account-overview-layout">
      <Card loading={loading} className="account-card account-overview-card account-hero-card">
        <Space align="start" size={16}>
          <Avatar size={72} src={profile?.user.avatar || user.avatar || undefined} icon={<UserOutlined />} />
          <div>
            <h2>{displayName}</h2>
            <p>{user.email}</p>
            <Space wrap>
              <Tag color="blue">{roleLabels[user.role] || user.role}</Tag>
              <Tag color={emailVerified ? 'green' : 'orange'}>
                {emailVerified ? '邮箱已验证' : '邮箱未验证'}
              </Tag>
            </Space>
          </div>
        </Space>
        <div className="account-hero-meta">
          <div>
            <span>默认企业</span>
            <strong>{team?.company_name || '暂无默认企业'}</strong>
          </div>
          <div>
            <span>企业身份</span>
            <strong>{getWorkspaceTeamRoleLabel(member)}</strong>
          </div>
          <div>
            <span>权限摘要</span>
            <strong>{member?.permission_count ?? user.permissions.length} 项权限</strong>
          </div>
        </div>
      </Card>
      <div className="account-grid two">
        <Card title="个人资料摘要" className="account-card">
          <Descriptions
            column={1}
            size="small"
            items={[
              { key: 'real_name', label: '真实姓名', children: profile?.profile.real_name || '-' },
              { key: 'phone', label: '手机号', children: profile?.profile.phone || '-' },
              { key: 'profession', label: '职位 / 岗位', children: profile?.profile.profession || '-' },
              { key: 'location', label: '所在地', children: profile?.profile.location || '-' },
              { key: 'bio', label: '个人简介', children: profile?.profile.bio || '-' },
            ]}
          />
        </Card>
        <Card title="登录与验证" className="account-card">
          <Descriptions
            column={1}
            size="small"
            items={[
              { key: 'username', label: '登录账号', children: user.username },
              { key: 'email', label: '登录邮箱', children: user.email },
              { key: 'email_status', label: '邮箱状态', children: emailVerified ? '已验证' : '未验证' },
              { key: 'oauth_count', label: '已绑定第三方账号', children: `${linkedProviderCount} 个` },
              { key: 'status', label: '账号状态', children: accountStatus },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}

function AccountProfilePanel({
  user,
  profile,
  onReload,
  onStoredUserChange,
  onNotice,
}: {
  user: ApiUser;
  profile: ProfilePayload | null;
  onReload: () => void;
  onStoredUserChange: (patch: Partial<ApiUser>) => void;
  onNotice: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [form] = Form.useForm();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.user.avatar ?? user.avatar ?? null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    form.setFieldsValue({
      display_name: profile?.profile.display_name || getUserDisplayName(user),
      real_name: profile?.profile.real_name || '',
      phone: profile?.profile.phone || '',
      profession: profile?.profile.profession || '',
      location: profile?.profile.location || '',
      bio: profile?.profile.bio || '',
    });
    const timer = window.setTimeout(() => {
      setAvatarUrl(profile?.user.avatar ?? user.avatar ?? null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [form, profile, user]);

  const uploadProps: UploadProps = {
    showUploadList: false,
    accept: 'image/*',
    beforeUpload: async (file) => {
      setUploading(true);
      try {
        const uploaded = await uploadProfileAvatar(file);
        setAvatarUrl(uploaded.url);
        form.setFieldValue('avatar', uploaded.url);
        onNotice('success', '头像已上传，保存资料后生效');
      } catch (err) {
        onNotice('error', err instanceof ApiClientError ? err.message : '头像上传失败');
      } finally {
        setUploading(false);
      }
      return Upload.LIST_IGNORE;
    },
  };

  const submit = async (values: { display_name: string; real_name?: string; phone?: string; profession?: string; location?: string; bio?: string }) => {
    setSaving(true);
    try {
      const updated = await updateMyProfile({
        avatar: avatarUrl,
        display_name: values.display_name,
        real_name: values.real_name,
        phone: values.phone,
        profession: values.profession,
        location: values.location,
        bio: values.bio,
      });
      onStoredUserChange({
        avatar: updated.user.avatar,
        username: updated.user.username,
        display_name: updated.user.display_name || updated.profile.display_name,
      });
      onReload();
      onNotice('success', '基本资料已保存');
    } catch (err) {
      onNotice('error', err instanceof ApiClientError ? err.message : '基本资料保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="account-card" title="基本资料">
      <div className="account-profile-form">
        <div className="avatar-uploader-block">
          <Avatar size={96} src={avatarUrl || undefined} icon={<UserOutlined />} />
          <div className="avatar-uploader-copy">
            <strong>个人头像</strong>
            <p>用于顶部身份卡和个人资料展示，仅维护当前登录账号的个人名片信息。</p>
          </div>
          <Upload {...uploadProps}>
            <Button icon={<UploadOutlined />} loading={uploading}>上传头像</Button>
          </Upload>
        </div>
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="display_name" label="显示名" rules={[{ required: true, message: '请输入显示名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="real_name" label="真实姓名">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="手机号"><Input /></Form.Item>
          <Form.Item name="profession" label="职位 / 岗位"><Input /></Form.Item>
          <Form.Item name="location" label="所在地"><Input /></Form.Item>
          <Form.Item name="bio" label="简介"><Input.TextArea rows={4} maxLength={1000} showCount /></Form.Item>
          <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={saving}>保存基本资料</Button>
        </Form>
      </div>
    </Card>
  );
}

function AccountSecurityPanel({ session, onNotice }: { session: AuthSession; onNotice: (type: 'success' | 'error' | 'info', text: string) => void }) {
  const [form] = Form.useForm();
  const [changing, setChanging] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const submitPassword = async (values: { old_password: string; new_password: string }) => {
    setChanging(true);
    try {
      await changePassword(values);
      form.resetFields();
      onNotice('success', '密码已修改，其他登录会话已撤销');
    } catch (err) {
      onNotice('error', err instanceof ApiClientError ? err.message : '密码修改失败');
    } finally {
      setChanging(false);
    }
  };

  const revokeSessions = () => {
    Modal.confirm({
      title: '退出全部其他登录会话',
      content: '将保留当前设备的登录状态，并撤销同账号在其他浏览器或设备上的刷新会话。',
      okText: '确认撤销',
      cancelText: '取消',
      onOk: async () => {
        setRevoking(true);
        try {
          const stored = getStoredSessionWithStorage();
          if (!stored?.session.refreshToken && !session.refreshToken) {
            throw new ApiClientError('当前会话已失效，请重新登录后再试', { code: 40101, status: 401 });
          }
          const result = await revokeOtherSessions();
          onNotice('success', `已撤销 ${result.revoked_count} 个其他会话`);
        } catch (err) {
          onNotice('error', err instanceof ApiClientError ? err.message : '会话撤销失败');
        } finally {
          setRevoking(false);
        }
      },
    });
  };

  return (
    <Card className="account-card" title="修改密码">
      <div className="account-security-layout">
        <div className="account-security-copy">
          <h3>更新登录密码</h3>
          <p>密码修改成功后会撤销旧刷新会话。若你怀疑账号在其他设备上仍有登录，可继续使用下方的会话撤销能力。</p>
        </div>
        <Form form={form} layout="vertical" onFinish={submitPassword}>
          <Form.Item name="old_password" label="当前密码" rules={[{ required: true, message: '请输入当前密码' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="new_password" label="新密码" rules={[{ required: true, min: 8, message: '请输入至少 8 位新密码' }]}>
            <Input.Password />
          </Form.Item>
          <Button type="primary" icon={<LockOutlined />} htmlType="submit" loading={changing}>修改密码</Button>
        </Form>
        <div className="account-session-action">
          <strong>其他登录会话</strong>
          <p>保留当前设备，强制退出同账号在其他浏览器或设备上的登录状态。</p>
          <Button danger icon={<LogoutOutlined />} loading={revoking} onClick={revokeSessions}>退出全部其他会话</Button>
        </div>
      </div>
    </Card>
  );
}

function OAuthAccountsPanel({ identities, onReload, onNotice }: { identities: OAuthIdentityPayload[]; onReload: () => void; onNotice: (type: 'success' | 'error' | 'info', text: string) => void }) {
  const providers = [
    { key: 'github', label: 'GitHub' },
    { key: 'google', label: 'Google' },
    { key: 'huggingface', label: 'Hugging Face' },
  ];

  const unlink = (provider: string) => {
    Modal.confirm({
      title: `解绑 ${provider}`,
      content: '解绑后将不能再使用该第三方账号登录 MarkUp，且不能移除最后一种可登录方式。',
      okText: '确认解绑',
      cancelText: '取消',
      onOk: async () => {
        try {
          await unlinkOAuthIdentity(provider);
          onReload();
          onNotice('success', '第三方账号已解绑');
        } catch (err) {
          onNotice('error', err instanceof ApiClientError ? err.message : '解绑失败');
        }
      },
    });
  };

  return (
    <div className="account-oauth-grid">
      {providers.map((provider) => {
        const identity = identities.find((item) => item.provider === provider.key);
        return (
          <Card className="account-card" key={provider.key}>
            <Space align="start" size={14}>
              <span className="oauth-provider-icon">
                <OAuthProviderIcon provider={provider.key as OAuthProviderKey} size={48} />
              </span>
              <div className="oauth-provider-body">
                <h3>{provider.label}</h3>
                {identity ? (
                  <>
                    <p>{identity.provider_username || identity.provider_email || identity.provider_user_id}</p>
                    <Tag color="green">已绑定</Tag>
                    <Button danger size="small" icon={<DisconnectOutlined />} onClick={() => unlink(provider.key)}>解绑</Button>
                  </>
                ) : (
                  <>
                    <p>绑定后可使用 {provider.label} 登录。当前账号已登录，授权完成后会直接绑定到当前 MarkUp 账号。</p>
                    <Button icon={<PlusOutlined />} href={`/api/v1/auth/oauth/${provider.key}/start?intent=bind_current_user&redirect_after_login=${encodeURIComponent('/workspace?page=account')}`}>发起绑定</Button>
                  </>
                )}
              </div>
            </Space>
          </Card>
        );
      })}
    </div>
  );
}

const chsiVerificationUrl = 'https://www.chsi.com.cn/xlcx/rhsq.jsp';
const labelerEducationOptions = ['博士', '硕士', '本科', '大专', '高中及其他'];
const bankBranchOptions = [
  '中国工商银行',
  '中国农业银行',
  '中国银行',
  '中国建设银行',
  '交通银行',
  '中国邮政储蓄银行',
  '招商银行',
  '中信银行',
  '中国光大银行',
  '华夏银行',
  '中国民生银行',
  '兴业银行',
  '广发银行',
  '平安银行',
  '上海浦东发展银行',
  '浙商银行',
  '恒丰银行',
  '渤海银行',
  '北京银行',
  '上海银行',
  '江苏银行',
  '南京银行',
  '宁波银行',
  '杭州银行',
  '广州银行',
  '成都银行',
  '重庆银行',
  '徽商银行',
  '齐鲁银行',
  '深圳农村商业银行',
  '上海农村商业银行',
  '北京农村商业银行',
];
const emptyLabelerBasicErrors = { education_summary: '', education_school: '', report: '' };
const domesticUniversitySeed = [
  '北京大学', '清华大学', '中国人民大学', '北京师范大学', '北京航空航天大学', '北京理工大学', '中国农业大学', '中央民族大学',
  '北京科技大学', '北京交通大学', '北京邮电大学', '北京化工大学', '北京林业大学', '北京中医药大学', '北京外国语大学', '中国传媒大学',
  '中央财经大学', '对外经济贸易大学', '中国政法大学', '北京工业大学', '首都师范大学', '首都医科大学', '北京语言大学', '华北电力大学',
  '南开大学', '天津大学', '天津医科大学', '天津师范大学', '天津工业大学', '天津财经大学',
  '河北大学', '燕山大学', '河北工业大学', '河北师范大学', '河北医科大学', '石家庄铁道大学',
  '山西大学', '太原理工大学', '中北大学', '山西医科大学', '内蒙古大学', '内蒙古工业大学',
  '大连理工大学', '东北大学', '辽宁大学', '大连海事大学', '中国医科大学', '沈阳农业大学', '沈阳工业大学', '东北财经大学',
  '吉林大学', '东北师范大学', '延边大学', '长春理工大学', '吉林农业大学',
  '哈尔滨工业大学', '哈尔滨工程大学', '东北林业大学', '东北农业大学', '黑龙江大学', '哈尔滨医科大学',
  '复旦大学', '上海交通大学', '同济大学', '华东师范大学', '华东理工大学', '东华大学', '上海外国语大学', '上海财经大学',
  '上海大学', '上海科技大学', '上海师范大学', '上海理工大学', '上海海事大学',
  '南京大学', '东南大学', '南京航空航天大学', '南京理工大学', '苏州大学', '河海大学', '江南大学', '中国矿业大学',
  '南京农业大学', '中国药科大学', '南京师范大学', '扬州大学', '江苏大学', '南京邮电大学', '南京信息工程大学', '南京医科大学',
  '浙江大学', '宁波大学', '浙江工业大学', '杭州电子科技大学', '浙江师范大学', '温州医科大学', '浙江工商大学', '中国美术学院',
  '中国科学技术大学', '合肥工业大学', '安徽大学', '安徽师范大学', '安徽医科大学',
  '厦门大学', '福州大学', '福建师范大学', '福建农林大学', '华侨大学',
  '南昌大学', '江西财经大学', '江西师范大学', '华东交通大学',
  '山东大学', '中国海洋大学', '中国石油大学（华东）', '山东师范大学', '青岛大学', '山东科技大学', '济南大学',
  '郑州大学', '河南大学', '河南师范大学', '河南农业大学',
  '武汉大学', '华中科技大学', '华中师范大学', '武汉理工大学', '中国地质大学（武汉）', '华中农业大学', '中南财经政法大学', '湖北大学', '武汉科技大学',
  '中南大学', '湖南大学', '湖南师范大学', '湘潭大学', '长沙理工大学', '湖南农业大学',
  '中山大学', '华南理工大学', '暨南大学', '华南师范大学', '深圳大学', '南方科技大学', '广州大学', '广东工业大学', '广州医科大学', '广东外语外贸大学',
  '广西大学', '广西师范大学', '桂林电子科技大学', '海南大学',
  '重庆大学', '西南大学', '重庆邮电大学', '重庆医科大学',
  '四川大学', '电子科技大学', '西南交通大学', '西南财经大学', '四川农业大学', '成都理工大学', '西南石油大学', '成都中医药大学',
  '贵州大学', '贵州师范大学', '云南大学', '昆明理工大学', '云南师范大学', '西藏大学',
  '西安交通大学', '西北工业大学', '西安电子科技大学', '西北大学', '陕西师范大学', '长安大学', '西北农林科技大学', '西安建筑科技大学',
  '兰州大学', '西北师范大学', '兰州交通大学', '青海大学', '宁夏大学', '新疆大学', '石河子大学', '新疆医科大学',
];

function PageIntro({ kicker, title, description, meta }: { kicker: string; title: string; description?: string; meta?: string }) {
  return (
    <section className="page-heading labeler-page-heading">
      <div>
        <p className="section-kicker">{kicker}{meta ? <span className="labeler-page-meta"> · {meta}</span> : null}</p>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
    </section>
  );
}

type LabelerNoticeApi = ReturnType<typeof notification.useNotification>[0];
type CertificationValidationErrors = Partial<Record<'real_name' | 'industry' | 'domain' | 'organization' | 'title' | 'registration_number' | 'documents' | 'agreement', string>>;
type BankValidationErrors = Partial<Record<'bank_name' | 'bank_card_number', string>>;
type LabelingNoticeMeta = { notify?: boolean; title?: string; description?: string };

function showLabelerNotice(notice: LabelerNoticeApi, type: 'success' | 'error' | 'warning' | 'info', message: string, description?: string) {
  notice[type]({ message, description, duration: 5, placement: 'topRight', closeIcon: true });
}

function ProfilePanel({ user, labeler = false }: { user: ApiUser; labeler?: boolean }) {
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [form, setForm] = useState({
    display_name: getUserDisplayName(user),
    real_name: '',
    id_number: '',
    gender: '',
    birthday: '',
    phone: '',
    location: '',
    education_summary: '',
    education_school: '',
    profession: '',
    work_years: '',
    expertise_tags: '',
    bio: '',
    notification_email: true,
  });
  const [educationReportMode, setEducationReportMode] = useState<'chsi' | 'manual'>('chsi');
  const [chsiReportDocs, setChsiReportDocs] = useState<Array<Record<string, unknown>>>([]);
  const [manualReportDocs, setManualReportDocs] = useState<Array<Record<string, unknown>>>([]);
  const [customUniversities, setCustomUniversities] = useState<string[]>([]);
  const [schoolSearchFocused, setSchoolSearchFocused] = useState(false);
  const [labelerProfileStep, setLabelerProfileStep] = useState<'identity' | 'education' | 'summary'>('identity');
  const [labelerProfileEditMode, setLabelerProfileEditMode] = useState<'identity' | 'education' | null>(null);
  const [basicInfoUploading, setBasicInfoUploading] = useState(false);
  const [labelerBasicErrors, setLabelerBasicErrors] = useState(emptyLabelerBasicErrors);
  const [, setMessage] = useState<string | null>(null);
  const [, setError] = useState<string | null>(null);
  const [noticeApi, noticeContext] = notification.useNotification();
  const schoolSearchRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void getMyProfile().then((data) => {
      setProfile(data);
      const reportDocuments = data.profile.education_report_documents || [];
      setForm({
        display_name: data.profile.display_name || getUserDisplayName(user),
        real_name: data.profile.real_name || '',
        id_number: '',
        gender: data.profile.gender || '',
        birthday: data.profile.birthday || '',
        bio: data.profile.bio || '',
        phone: data.profile.phone || '',
        location: data.profile.location || '',
        education_summary: data.profile.education_summary || '',
        education_school: data.profile.education_school || '',
        profession: data.profile.profession || '',
        work_years: data.profile.work_years || '',
        expertise_tags: (data.profile.expertise_tags || []).join('、'),
        notification_email: Boolean(data.profile.notification_settings?.email ?? true),
      });
      setEducationReportMode(data.profile.education_report_mode === 'manual' ? 'manual' : 'chsi');
      setChsiReportDocs(reportDocuments.filter((document) => String(document.type) !== 'manual_education_material'));
      setManualReportDocs(reportDocuments.filter((document) => String(document.type) === 'manual_education_material'));
      if (
        labeler
        && data.profile.real_name
        && data.profile.phone
        && data.profile.education_summary
        && data.profile.education_school
        && reportDocuments.length
      ) {
        setLabelerProfileStep('summary');
        setLabelerProfileEditMode(null);
      }
    }).catch(() => undefined);
  }, [labeler, user]);

  useEffect(() => {
    if (!schoolSearchFocused) return undefined;
    const closeSchoolSearch = (event: MouseEvent) => {
      if (!schoolSearchRef.current?.contains(event.target as Node)) {
        setSchoolSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', closeSchoolSearch);
    return () => document.removeEventListener('mousedown', closeSchoolSearch);
  }, [schoolSearchFocused]);

  const activeEducationDocs = educationReportMode === 'chsi' ? chsiReportDocs : manualReportDocs;
  const identityComplete = Boolean(form.real_name.trim() && form.id_number.trim() && form.phone.trim());
  const schoolKeyword = form.education_school.trim();
  const universityOptions = Array.from(new Set([...domesticUniversitySeed, ...customUniversities]));
  const schoolMatches = universityOptions
    .filter((school) => !schoolKeyword || school.includes(schoolKeyword))
    .slice(0, 8);
  const canAddSchool = Boolean(schoolKeyword) && !universityOptions.includes(schoolKeyword);
  const isEditingIdentity = labelerProfileEditMode === 'identity';
  const isEditingEducation = labelerProfileEditMode === 'education';
  const identityStepComplete = labelerProfileStep === 'education' || labelerProfileStep === 'summary' || isEditingEducation;
  const educationStepComplete = labelerProfileStep === 'summary' || isEditingIdentity;
  const basicInfoStatus = profile?.profile.labeler_basic_info_status || profile?.labeler_account?.basic_info_status || 'incomplete';
  const basicInfoPendingReview = basicInfoStatus === 'pending_review';
  const basicInfoApproved = basicInfoStatus === 'approved';
  const basicInfoLocked = labeler && basicInfoPendingReview;
  const showLabelerProfileSteps = !basicInfoLocked && labelerProfileStep !== 'summary';

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (labeler) {
      if (basicInfoLocked) {
        showLabelerNotice(noticeApi, 'info', '基础信息正在审核', '平台管理员审核完成前暂不能修改。');
        return;
      }
      if (!isEditingEducation && !identityComplete) {
        showLabelerNotice(noticeApi, 'warning', '请完整填写身份信息', '实名信息、证件号和联系电话都填写后，才能继续提交基础信息。');
        return;
      }
      const nextErrors = {
        education_summary: form.education_summary ? '' : '请选择最高学历',
        education_school: form.education_school.trim() ? '' : '请选择毕业院校',
        report: activeEducationDocs.length > 0 ? '' : '请上传学历认证材料',
      };
      setLabelerBasicErrors(nextErrors);
      if (Object.values(nextErrors).some(Boolean)) {
        showLabelerNotice(noticeApi, 'warning', '请补全学历信息', Object.values(nextErrors).filter(Boolean).join('、'));
        return;
      }
      try {
        const payload = isEditingEducation
          ? {
              education_summary: form.education_summary,
              education_school: form.education_school.trim(),
              education_report_mode: educationReportMode,
              education_report_documents: activeEducationDocs,
            }
          : {
              real_name: form.real_name.trim(),
              phone: form.phone.trim(),
              education_summary: form.education_summary,
              education_school: form.education_school.trim(),
              education_report_mode: educationReportMode,
              education_report_documents: activeEducationDocs,
            };
        const updated = await updateMyProfile(payload);
        setProfile(updated);
        setMessage('基础信息已提交平台审核');
        showLabelerNotice(noticeApi, 'success', '基础信息已提交', '平台管理员审核通过后即可接取任务。');
        setSchoolSearchFocused(false);
        setLabelerProfileEditMode(null);
        setLabelerProfileStep('summary');
      } catch (err) {
        const text = err instanceof ApiClientError ? err.message : '个人资料保存失败';
        setError(text);
        showLabelerNotice(noticeApi, 'error', '保存失败', text);
      }
      return;
    }
    try {
      const updated = await updateMyProfile({
        display_name: form.display_name,
        real_name: form.real_name,
        gender: form.gender,
        birthday: form.birthday,
        profession: form.profession,
        work_years: form.work_years,
        bio: form.bio,
        phone: form.phone,
        location: form.location,
        education_summary: form.education_summary,
        expertise_tags: form.expertise_tags.split(/[、,\s]+/).filter(Boolean),
        notification_settings: { email: form.notification_email },
      });
      setProfile(updated);
      setMessage('个人资料已保存');
      if (labeler) showLabelerNotice(noticeApi, 'success', '个人资料已保存');
    } catch (err) {
      const text = err instanceof ApiClientError ? err.message : '个人资料保存失败';
      setError(text);
      if (labeler) showLabelerNotice(noticeApi, 'error', '个人资料保存失败', text);
    }
  };

  const uploadEducationReport = async (mode: 'chsi' | 'manual', file: File) => {
    if (basicInfoLocked) {
      showLabelerNotice(noticeApi, 'info', '基础信息正在审核', '平台管理员审核完成前暂不能修改材料。');
      return;
    }
    setBasicInfoUploading(true);
    setError(null);
    setMessage(null);
    try {
      const uploaded = await uploadProfileMaterial(file, 'verification');
      const item = {
        file_id: uploaded.file_id,
        url: uploaded.url,
        type: mode === 'chsi' ? 'chsi_report' : 'manual_education_material',
        filename: uploaded.filename,
        content_type: uploaded.content_type,
        size: uploaded.size,
      };
      if (mode === 'chsi') setChsiReportDocs((current) => [...current, item]);
      if (mode === 'manual') setManualReportDocs((current) => [...current, item]);
      setLabelerBasicErrors((current) => ({ ...current, report: '' }));
      setMessage('证明材料已上传');
      showLabelerNotice(noticeApi, 'success', '证明材料已上传');
    } catch (err) {
      const text = err instanceof ApiClientError ? err.message : '证明材料上传失败';
      setError(text);
      showLabelerNotice(noticeApi, 'error', '上传失败', text);
    } finally {
      setBasicInfoUploading(false);
    }
  };

  const onEducationReportFileChange = (mode: 'chsi' | 'manual') => (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    void uploadEducationReport(mode, file).finally(() => {
      input.value = '';
    });
  };

  const removeEducationReport = (mode: 'chsi' | 'manual', index: number) => {
    if (basicInfoLocked) return;
    if (mode === 'chsi') {
      setChsiReportDocs((current) => current.filter((_, itemIndex) => itemIndex !== index));
    } else {
      setManualReportDocs((current) => current.filter((_, itemIndex) => itemIndex !== index));
    }
    setLabelerBasicErrors((current) => ({ ...current, report: '' }));
    setError(null);
    setMessage('证明材料已删除');
    showLabelerNotice(noticeApi, 'success', '证明材料已删除');
  };

  const selectSchool = (school: string) => {
    if (basicInfoLocked) return;
    setForm((current) => ({ ...current, education_school: school }));
    setSchoolSearchFocused(false);
    setLabelerBasicErrors((current) => ({ ...current, education_school: '' }));
  };

  const addCustomSchool = () => {
    if (basicInfoLocked) return;
    if (!canAddSchool) return;
    setCustomUniversities((current) => [...current, schoolKeyword]);
    selectSchool(schoolKeyword);
  };

  const submitIdentityInfo = async () => {
    setMessage(null);
    if (basicInfoLocked) {
      showLabelerNotice(noticeApi, 'info', '基础信息正在审核', '平台管理员审核完成前暂不能修改。');
      return;
    }
    if (!identityComplete) {
      showLabelerNotice(noticeApi, 'warning', '请完整填写身份信息', '实名信息、证件号和联系电话都需要填写。');
      return;
    }
    setError(null);
    if (isEditingIdentity) {
      try {
        const updated = await updateMyProfile({
          real_name: form.real_name.trim(),
          phone: form.phone.trim(),
        });
        setProfile(updated);
        setMessage('身份信息已保存');
        showLabelerNotice(noticeApi, 'success', '身份信息已保存');
        setLabelerProfileEditMode(null);
        setLabelerProfileStep('summary');
      } catch (err) {
        const text = err instanceof ApiClientError ? err.message : '身份信息保存失败';
        setError(text);
        showLabelerNotice(noticeApi, 'error', '保存失败', text);
      }
      return;
    }
    setLabelerProfileStep('education');
  };

  if (!labeler) {
    return (
      <form className="settings-section form-grid" onSubmit={submit}>
        <div className="section-title form-span">
          <div>
            <p className="section-kicker">Profile</p>
            <h2>个人中心</h2>
            <p>维护个人资料与联系方式。</p>
          </div>
          <span className={`status-tag ${(profile?.user?.email_verified ?? user.email_verified) ? 'success' : 'warning'}`}>{profile?.user?.email_verified ?? user.email_verified ? '邮箱已验证' : '邮箱未验证'}</span>
        </div>
        <label>显示名称<input value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} /></label>
        <label>手机号<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
        <label>所在地<input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></label>
        <label>学历摘要<input value={form.education_summary} onChange={(event) => setForm({ ...form, education_summary: event.target.value })} /></label>
        <label className="form-span">领域标签<input value={form.expertise_tags} onChange={(event) => setForm({ ...form, expertise_tags: event.target.value })} placeholder="法律、金融、医学" /></label>
        <label className="form-span">个人简介<textarea value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} /></label>
        <label className="checkbox-field form-span"><input type="checkbox" checked={form.notification_email} onChange={(event) => setForm({ ...form, notification_email: event.target.checked })} /> 接收账号与任务通知邮件</label>
        <button type="submit" className="primary-action form-span"><SaveOutlined aria-hidden="true" /> 保存个人资料</button>
      </form>
    );
  }

  return (
    <div className="settings-stack labeler-account-stack">
      {noticeContext}
      <PageIntro kicker="Profile" title="基础信息" />
      <form className={`settings-section xpert-basic-form account-neutral-panel ${basicInfoLocked ? 'is-locked' : ''}`} onSubmit={submit}>
        {labelerProfileStep !== 'summary' && (
        <div className="xpert-basic-header">
          <h2>欢迎加入 MarkUp 数据平台!</h2>
          <p>只需几分钟即可完成资料填写，完成后平台将根据技能领域为您分配任务，为您开启数据训练之旅!</p>
        </div>
        )}
        {basicInfoPendingReview && <p className="inline-message info">基础信息已提交平台管理员审核，审核完成前暂不能修改。</p>}
        {basicInfoApproved && <p className="inline-message success">基础信息已审核通过，可以正常接取任务。</p>}
        {showLabelerProfileSteps && (
        <div className="labeler-profile-steps" aria-label="基础信息填写步骤">
          <article className={identityStepComplete ? 'complete' : 'active'} role="button" tabIndex={0} onClick={() => { if (!basicInfoLocked) { setLabelerProfileStep('identity'); setLabelerProfileEditMode(labelerProfileEditMode ? 'identity' : identityStepComplete ? 'identity' : null); } }}>
            <span>{identityStepComplete ? '✓' : '1'}</span>
            <div>
              <strong>身份信息</strong>
              <p>填写实名、证件号和联系电话。</p>
            </div>
          </article>
          <article className={educationStepComplete ? 'complete' : labelerProfileStep === 'education' ? 'active' : 'locked'} role="button" tabIndex={0} onClick={() => { if ((identityComplete || labelerProfileEditMode) && !basicInfoLocked) { setLabelerProfileStep('education'); setLabelerProfileEditMode(labelerProfileEditMode ? 'education' : null); } }}>
            <span>{educationStepComplete ? '✓' : '2'}</span>
            <div>
              <strong>学历认证</strong>
              <p>选择最高学历、就读院校，并上传对应证明材料。</p>
            </div>
          </article>
        </div>
        )}

        {labelerProfileStep === 'identity' && (
          <section className="xpert-form-part">
            <div className="xpert-part-title">
              <h3>身份信息</h3>
              <p>用于测试阶段的实名信息展示和表单校验，当前不会采集或保存身份证号码；请勿上传真实敏感证件图片。</p>
            </div>
            <div className="identity-info-grid">
              <label className="xpert-field-block" htmlFor="identity-real-name">
                <strong>实名信息</strong>
                <input id="identity-real-name" aria-label="实名信息" disabled={basicInfoLocked} value={form.real_name} onChange={(event) => setForm({ ...form, real_name: event.target.value })} placeholder="请输入真实姓名" />
              </label>
              <label className="xpert-field-block" htmlFor="identity-id-number">
                <strong>身份证号</strong>
                <input id="identity-id-number" aria-label="身份证号" disabled={basicInfoLocked} value={form.id_number} onChange={(event) => setForm({ ...form, id_number: event.target.value })} placeholder="测试字段，不会保存" />
              </label>
              <label className="xpert-field-block" htmlFor="identity-phone">
                <strong>电话号码</strong>
                <input id="identity-phone" aria-label="电话号码" disabled={basicInfoLocked} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="请输入手机号" />
              </label>
            </div>
            <div className="xpert-submit-row">
              <button type="button" className="primary-action" disabled={basicInfoLocked} onClick={() => void submitIdentityInfo()}>{isEditingIdentity ? <><SaveOutlined aria-hidden="true" /> 保存身份信息</> : <><SendOutlined aria-hidden="true" /> 提交身份信息</>}</button>
              {isEditingIdentity && <button type="button" className="secondary-action" onClick={() => { setLabelerProfileEditMode(null); setLabelerProfileStep('summary'); setError(null); }}><CloseCircleOutlined aria-hidden="true" /> 取消</button>}
            </div>
          </section>
        )}

        {labelerProfileStep === 'education' && (
        <section className="xpert-form-part">
          <div className="xpert-part-title">
            <h3>学历信息</h3>
            <p>请填写最高学历和证明材料，审核通过后将用于任务准入和技能匹配。</p>
          </div>

        <fieldset className="xpert-field-block">
          <legend><span>*</span>最高学历（在读/已获得）</legend>
          <p>请填写您目前正在攻读的最高学历；若已毕业，请填写您已获得的最高学历证书。</p>
          <div className="education-choice-row" role="group" aria-label="最高学历">
            {labelerEducationOptions.map((option) => (
              <button
                type="button"
                className={form.education_summary === option ? 'active' : ''}
                key={option}
                disabled={basicInfoLocked}
                onClick={() => {
                  setForm({ ...form, education_summary: option });
                  setLabelerBasicErrors((current) => ({ ...current, education_summary: '' }));
                }}
              >
                {option}
              </button>
            ))}
          </div>
          {labelerBasicErrors.education_summary && <p className="basic-error">{labelerBasicErrors.education_summary}</p>}
        </fieldset>

        <div className="xpert-field-block education-school-field" ref={schoolSearchRef}>
          <strong><span>*</span>最高学历就读院校</strong>
          <p>请填写您已获得最高学历证书的学校；若当前仍在攻读最高学历，请填写目前就读的学校。</p>
          <div className="school-search-box">
            <input
              id="education-school"
              aria-label="最高学历就读院校"
              value={form.education_school}
              disabled={basicInfoLocked}
              onFocus={() => setSchoolSearchFocused(true)}
              onChange={(event) => {
                setForm({ ...form, education_school: event.target.value });
                setSchoolSearchFocused(true);
                setLabelerBasicErrors((current) => ({ ...current, education_school: '' }));
              }}
              placeholder="请输入最高学历名称"
              aria-invalid={Boolean(labelerBasicErrors.education_school)}
            />
            <SearchOutlined aria-hidden="true" />
          </div>
          {schoolSearchFocused && (
            <div className="school-search-panel">
              <div className="school-result-list">
                {schoolMatches.length ? schoolMatches.map((school) => (
                  <button type="button" key={school} onMouseDown={(event) => event.preventDefault()} onClick={() => selectSchool(school)}>{school}</button>
                )) : (
                  <div className="school-empty-state">暂无数据</div>
                )}
              </div>
              <div className="school-add-row">
                <input aria-label="新增学校名称" disabled={basicInfoLocked} value={form.education_school} onChange={(event) => setForm({ ...form, education_school: event.target.value })} placeholder="请输入学校全称" />
                <button type="button" className="primary-action" disabled={!canAddSchool || basicInfoLocked} onMouseDown={(event) => event.preventDefault()} onClick={addCustomSchool}><PlusOutlined aria-hidden="true" /> 添加学校</button>
              </div>
            </div>
          )}
          {labelerBasicErrors.education_school && <p className="basic-error">{labelerBasicErrors.education_school}</p>}
        </div>

        <section className="xpert-field-block" aria-labelledby="education-report-title">
          <h3 id="education-report-title"><span>*</span>学历/学籍验证报告</h3>
          <div className="report-copy">
            <p>1、【中国大陆地区高校学历认证请提供<a className="plain-report-link" href={chsiVerificationUrl} target="_blank" rel="noreferrer">学信网验证报告</a>】请上传PDF格式的您本人真实学历认证信息（单文件不超过1GB），仅支持<a href={chsiVerificationUrl} target="_blank" rel="noreferrer">学信网验证报告</a>。</p>
            <p>2、【海外 / 非指定学信网学历认证】：海外高校学历，以及非《教育部学籍在线验证报告》《教育部学历证书电子注册备案表》《中国高等教育学位在线验证报告》的学历，请选择「非学信网学历认证」。</p>
            <p>注意：平台会对您所填写和上传的内容进行审核校验，若存在伪造或信息不一致的情况将影响您正常使用平台功能及未来的任务分配与结算，请谨慎填写！审核通过或者审核中状态下，将不支持您对信息的二次编辑。</p>
          </div>

          {educationReportMode === 'chsi' ? (
            <>
              <label className={`xpert-upload-control ${basicInfoUploading ? 'is-disabled' : ''}`}>
                <span className="xpert-upload-button"><UploadOutlined aria-hidden="true" /> 点击上传</span>
                <input aria-label="学信网验证报告上传" type="file" accept=".pdf,image/*" disabled={basicInfoUploading || basicInfoLocked} onChange={onEducationReportFileChange('chsi')} />
              </label>
              <DocumentList documents={chsiReportDocs} onRemove={(index) => removeEducationReport('chsi', index)} />
              {labelerBasicErrors.report && <p className="basic-error">{labelerBasicErrors.report}</p>}
              <button type="button" className="secondary-action xpert-switch-button" onClick={() => { setEducationReportMode('manual'); setLabelerBasicErrors((current) => ({ ...current, report: '' })); }}>
                <FileSearchOutlined aria-hidden="true" /> 无学信网报告，选择非学信网学历认证
              </button>
            </>
          ) : (
            <>
              <button type="button" className="secondary-action xpert-switch-button" onClick={() => { setEducationReportMode('chsi'); setLabelerBasicErrors((current) => ({ ...current, report: '' })); }}>
                <ArrowLeftOutlined aria-hidden="true" /> 返回学信网认证
              </button>
              <div className="xpert-manual-report">
                <h3><span>*</span>非学信网学历认证材料</h3>
                <p>请上传PDF格式的您本人真实学历认证信息（单文件不超过1GB），非学信网验证报告人工审核时长较长，推荐优先进行学信网验证报告上传。</p>
                <p>注意：平台会对您所填写和上传的内容进行审核校验，若存在伪造或信息不一致的情况将影响您正常使用平台功能及未来的任务分配与结算，请谨慎填写！审核通过或者审核中状态下，将不支持您对信息的二次编辑。</p>
                <label className={`xpert-upload-control ${basicInfoUploading ? 'is-disabled' : ''}`}>
                  <span className="xpert-upload-button"><UploadOutlined aria-hidden="true" /> 点击上传</span>
                  <input aria-label="非学信网学历认证材料上传" type="file" accept=".pdf,image/*" disabled={basicInfoUploading || basicInfoLocked} onChange={onEducationReportFileChange('manual')} />
                </label>
                <DocumentList documents={manualReportDocs} onRemove={(index) => removeEducationReport('manual', index)} />
                {labelerBasicErrors.report && <p className="basic-error">{labelerBasicErrors.report}</p>}
              </div>
            </>
          )}
        </section>
        </section>
        )}

        {labelerProfileStep === 'summary' && (
          <section className="xpert-form-part labeler-profile-summary">
            <div className="xpert-part-title">
              <h3>已填写资料</h3>
              <p>{basicInfoPendingReview ? '基础信息已提交平台管理员审核，审核完成前暂不能修改。' : basicInfoApproved ? '基础信息已审核通过，可用于任务接取与匹配。' : '以下信息将作为任务匹配和账号校验的测试资料展示。身份证号仅保留在当前页面状态中，不会提交保存。'}</p>
            </div>
            <dl className="labeler-account-summary labeler-profile-summary-grid">
              <div>
                <dt>实名信息</dt>
                <dd>{form.real_name.trim() || '-'}</dd>
              </div>
              <div>
                <dt>身份证号</dt>
                <dd>{maskIdentityNumber(form.id_number) || '测试字段未保存'}</dd>
              </div>
              <div>
                <dt>电话号码</dt>
                <dd>{form.phone.trim() || '-'}</dd>
              </div>
              <div>
                <dt>最高学历</dt>
                <dd>{form.education_summary || '-'}</dd>
              </div>
              <div>
                <dt>就读院校</dt>
                <dd>{form.education_school.trim() || '-'}</dd>
              </div>
              <div>
                <dt>认证方式</dt>
                <dd>{educationReportMode === 'chsi' ? '学信网验证报告' : '非学信网学历认证'}</dd>
              </div>
              <div>
                <dt>证明材料</dt>
                <dd>{activeEducationDocs.length ? `${activeEducationDocs.length} 份` : '-'}</dd>
              </div>
            </dl>
            <div className="xpert-submit-row">
              <button type="button" className="secondary-action" disabled={basicInfoLocked} onClick={() => { setLabelerProfileEditMode('identity'); setLabelerProfileStep('identity'); setError(null); setMessage(null); }}><EditOutlined aria-hidden="true" /> 修改身份信息</button>
              <button type="button" className="secondary-action" disabled={basicInfoLocked} onClick={() => { setLabelerProfileEditMode('education'); setLabelerProfileStep('education'); setError(null); setMessage(null); }}><EditOutlined aria-hidden="true" /> 修改学历信息</button>
            </div>
          </section>
        )}

        {labelerProfileStep === 'education' && (
          <div className="xpert-submit-row">
            <button type="submit" className="primary-action" disabled={basicInfoUploading || basicInfoLocked}>{basicInfoUploading ? <><UploadOutlined aria-hidden="true" /> 上传中...</> : isEditingEducation ? <><SaveOutlined aria-hidden="true" /> 保存学历信息</> : <><SendOutlined aria-hidden="true" /> 提交审核</>}</button>
            {isEditingEducation && <button type="button" className="secondary-action" onClick={() => { setLabelerProfileEditMode(null); setLabelerProfileStep('summary'); setError(null); }}><CloseCircleOutlined aria-hidden="true" /> 取消</button>}
          </div>
        )}
      </form>
    </div>
  );
}

function maskIdentityNumber(value: string): string {
  const normalized = value.trim();
  if (!normalized) return '';
  if (normalized.length <= 6) return normalized;
  const hiddenLength = Math.max(normalized.length - 6, 4);
  return `${normalized.slice(0, 3)}${'*'.repeat(hiddenLength)}${normalized.slice(-3)}`;
}

function CertificationPanel({
  user,
  labeler = false,
  onOpenRules,
  onOpenAgreement,
  onOpenForm,
  onBack,
  formOnly = false,
  editingCertification,
  onSelectCertification,
}: {
  user?: ApiUser;
  labeler?: boolean;
  onOpenRules?: () => void;
  onOpenAgreement?: () => void;
  onOpenForm?: (cert?: Certification) => void;
  onBack?: () => void;
  formOnly?: boolean;
  editingCertification?: Certification | null;
  onSelectCertification?: (cert: Certification | null) => void;
}) {
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [educationForm, setEducationForm] = useState({ real_name: '', education_level: 'bachelor' as 'associate' | 'bachelor' | 'master' | 'doctor' | 'other', school: '', major: '', graduation_year: '2024', degree: '', document_url: '' });
  const [domainForm, setDomainForm] = useState({
    real_name: '',
    industry: '',
    domain: '',
    title: '',
    organization: '',
    registration_number: '',
    evidence_type: '',
    cert_name: '',
    description: '',
    document_url: '',
  });
  const [educationDocs, setEducationDocs] = useState<Array<Record<string, unknown>>>([]);
  const [domainDocs, setDomainDocs] = useState<Array<Record<string, unknown>>>([]);
  const [supplementDocs, setSupplementDocs] = useState<Array<Record<string, unknown>>>([]);
  const [uploading, setUploading] = useState<'education' | 'domain' | 'supplement' | null>(null);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [showCertificationForm, setShowCertificationForm] = useState(false);
  const [recordView, setRecordView] = useState<'card' | 'list'>('card');
  const [, setMessage] = useState<string | null>(null);
  const [, setError] = useState<string | null>(null);
  const [certErrors, setCertErrors] = useState<CertificationValidationErrors>({});
  const [noticeApi, noticeContext] = notification.useNotification();

  useEffect(() => {
    let active = true;
    void getMyProfile()
      .then((data) => {
        if (active) setProfile(data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!editingCertification) return;
    const submitted = editingCertification.submitted_data ?? {};
    const documents = Array.isArray(editingCertification.documents) ? editingCertification.documents : [];
    const supplementDocuments = Array.isArray(submitted.supplement_documents) ? submitted.supplement_documents.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')) : [];
    const mainDocuments = documents.filter((item) => item.type !== 'supplement_material');
    setDomainForm({
      real_name: String(submitted.real_name ?? ''),
      industry: String(submitted.industry ?? ''),
      domain: String(submitted.domain ?? editingCertification.cert_name ?? ''),
      title: String(submitted.title ?? ''),
      organization: String(submitted.organization ?? ''),
      registration_number: String(submitted.registration_number ?? ''),
      evidence_type: String(submitted.evidence_type ?? 'professional_qualification'),
      cert_name: editingCertification.cert_name ?? '',
      description: String(submitted.description ?? ''),
      document_url: '',
    });
    setDomainDocs(mainDocuments);
    setSupplementDocs(supplementDocuments.length ? supplementDocuments : documents.filter((item) => item.type === 'supplement_material'));
    setAgreementAccepted(Boolean(submitted.agreement_accepted));
    setShowCertificationForm(true);
  }, [editingCertification]);

  const appendCertification = (cert: Certification) => {
    setProfile((data) => (data ? { ...data, certifications: [cert, ...data.certifications] } : data));
  };

  const uploadMaterial = async (target: 'education' | 'domain' | 'supplement', file: File) => {
    setUploading(target);
    setError(null);
    setMessage(null);
    const previewUrl = file.type.startsWith('image/') && typeof URL !== 'undefined' && URL.createObjectURL
      ? URL.createObjectURL(file)
      : '';
    try {
      const uploaded = await uploadProfileMaterial(file, 'verification');
      const item = {
        file_id: uploaded.file_id,
        url: uploaded.url,
        preview_url: previewUrl,
        type: target === 'education' ? 'education_material' : target === 'domain' ? 'professional_qualification' : 'supplement_material',
        filename: uploaded.filename,
        content_type: uploaded.content_type,
        size: uploaded.size,
      };
      if (target === 'education') setEducationDocs((current) => [...current, item]);
      if (target === 'domain') {
        setDomainDocs((current) => [...current, item]);
        setCertErrors((current) => ({ ...current, documents: '' }));
      }
      if (target === 'supplement') setSupplementDocs((current) => [...current, item]);
      setMessage('证明材料已上传');
      if (labeler) showLabelerNotice(noticeApi, 'success', '材料已上传', '可点击缩略图左侧的放大按钮在线查看。');
    } catch (err) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setError(err instanceof ApiClientError ? err.message : '证明材料上传失败');
      if (labeler) showLabelerNotice(noticeApi, 'error', '材料上传失败', err instanceof ApiClientError ? err.message : '请稍后重试。');
    } finally {
      setUploading(null);
    }
  };

  const onFileChange = (target: 'education' | 'domain' | 'supplement') => (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    void uploadMaterial(target, file).finally(() => {
      input.value = '';
    });
  };

  const removeMaterial = (target: 'education' | 'domain' | 'supplement', index: number) => {
    if (target === 'education') {
      setEducationDocs((current) => current.filter((_, itemIndex) => itemIndex !== index));
    }
    if (target === 'domain') {
      setDomainDocs((current) => current.filter((_, itemIndex) => itemIndex !== index));
    }
    if (target === 'supplement') {
      setSupplementDocs((current) => current.filter((_, itemIndex) => itemIndex !== index));
    }
    setError(null);
    setMessage('证明材料已删除');
    if (labeler) showLabelerNotice(noticeApi, 'success', '证明材料已删除');
    if (target === 'domain') {
      setCertErrors((current) => ({ ...current, documents: '' }));
    }
  };

  const submitDomain = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (labeler) {
      const nextErrors: CertificationValidationErrors = {};
      if (!domainForm.real_name.trim()) nextErrors.real_name = '请填写与资质材料一致的真实姓名。';
      if (!domainForm.industry) nextErrors.industry = '请选择职业所属行业。';
      if (!domainForm.domain) nextErrors.domain = '请选择要认证的职业身份。';
      if (!domainForm.organization.trim()) nextErrors.organization = '请填写工作单位或所属机构。';
      if (!domainForm.title.trim()) nextErrors.title = '请填写科室、学科或职位信息。';
      if (!domainForm.registration_number.trim()) nextErrors.registration_number = '请填写证书编号、执业编号或登记编号。';
      if (domainDocs.length === 0) nextErrors.documents = '请上传至少一张清晰的专业资质材料。';
      if (!agreementAccepted) nextErrors.agreement = '请先同意 MarkUp 数据平台用户使用协议。';
      setCertErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) {
        showLabelerNotice(noticeApi, 'warning', '资质信息还未填写完整', '请根据红色提示补齐必填内容后再提交。');
        return;
      }
    } else if (!domainForm.real_name.trim() || !domainForm.cert_name.trim()) {
      setError('请完整填写领域认证信息');
      if (labeler) showLabelerNotice(noticeApi, 'warning', '请完整填写领域认证信息', '真实姓名和认证名称填写后再提交。');
      return;
    }
    const industryGroup = professionalIndustryGroups.find((item) => item.value === domainForm.industry);
    const documents = labeler
      ? [...domainDocs, ...supplementDocs]
      : [
          ...domainDocs,
          ...(domainForm.document_url ? [{ file_id: 'domain-external-url', url: domainForm.document_url, type: 'external_material' }] : []),
        ];
    try {
      const cert = await submitDomainCertification(labeler
        ? {
            domain: domainForm.domain,
            industry: industryGroup?.label ?? domainForm.industry,
            evidence_type: 'professional_qualification',
            cert_name: domainForm.domain,
            real_name: domainForm.real_name,
            title: domainForm.title,
            organization: domainForm.organization,
            display_type: 'detail',
            registration_number: domainForm.registration_number,
            agreement_accepted: agreementAccepted,
            supplement_documents: supplementDocs,
            documents,
          }
        : {
            domain: domainForm.domain,
            evidence_type: domainForm.evidence_type,
            cert_name: domainForm.cert_name,
            real_name: domainForm.real_name,
            title: domainForm.title,
            organization: domainForm.organization,
            description: domainForm.description,
            documents,
          });
      appendCertification(cert);
      if (labeler) {
        setShowCertificationForm(false);
        if (formOnly && onBack) onBack();
      }
      setMessage('领域认证已提交，等待审核');
      if (labeler) {
        setCertErrors({});
        showLabelerNotice(noticeApi, 'success', '资质认证已提交', '平台管理员审核完成后会更新认证状态。');
      }
    } catch (err) {
      const text = err instanceof ApiClientError ? err.message : '领域认证提交失败';
      setError(text);
      if (labeler) showLabelerNotice(noticeApi, 'error', '资质认证提交失败', text);
    }
  };
  const submitEducation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const documents = [
      ...educationDocs,
      ...(educationForm.document_url ? [{ file_id: 'education-external-url', url: educationForm.document_url, type: 'external_material' }] : []),
    ];
    try {
      const cert = await submitEducationCertification({
        real_name: educationForm.real_name,
        education_level: educationForm.education_level,
        school: educationForm.school,
        major: educationForm.major,
        graduation_year: Number(educationForm.graduation_year),
        degree: educationForm.degree,
        documents,
      });
      appendCertification(cert);
      setMessage('学历认证已提交，等待审核');
      if (labeler) showLabelerNotice(noticeApi, 'success', '学历认证已提交', '平台管理员审核完成后会更新认证状态。');
    } catch (err) {
      const text = err instanceof ApiClientError ? err.message : '学历认证提交失败';
      setError(text);
      if (labeler) showLabelerNotice(noticeApi, 'error', '学历认证提交失败', text);
    }
  };

  const nickname = profile?.user.display_name ?? user?.display_name ?? profile?.user.email ?? user?.email ?? '';
  const selectedIndustry = professionalIndustryGroups.find((item) => item.value === domainForm.industry);
  const labelerCertifications = (profile?.certifications ?? []).filter((cert) => cert.cert_type !== 'labeler_basic_info');
  const hasLabelerCertifications = labelerCertifications.length > 0;
  const shouldShowCertificationForm = formOnly || (!hasLabelerCertifications && !onOpenForm) || showCertificationForm;
  const certificationReadonly = Boolean(editingCertification && editingCertification.status === 'pending_review');
  const canSubmitDomain = !uploading;

  if (!labeler) {
    return (
      <div className="settings-stack">
        <section className="settings-section">
          <div className="section-title">
            <div>
              <p className="section-kicker">Certification</p>
              <h2>资质管理</h2>
              <p>参考个人账号认证页，将学历和领域能力作为独立申请模块。</p>
            </div>
          </div>
          <div className="cert-grid">
            <form className="cert-form" onSubmit={submitEducation}>
              <h3>学历认证</h3>
              <label>真实姓名<input value={educationForm.real_name} onChange={(event) => setEducationForm({ ...educationForm, real_name: event.target.value })} /></label>
              <label>学历<select value={educationForm.education_level} onChange={(event) => setEducationForm({ ...educationForm, education_level: event.target.value as typeof educationForm.education_level })}>{Object.entries(educationLevelLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label>学校<input value={educationForm.school} onChange={(event) => setEducationForm({ ...educationForm, school: event.target.value })} /></label>
              <label>专业<input value={educationForm.major} onChange={(event) => setEducationForm({ ...educationForm, major: event.target.value })} /></label>
              <label>毕业年份<input inputMode="numeric" value={educationForm.graduation_year} onChange={(event) => setEducationForm({ ...educationForm, graduation_year: event.target.value })} /></label>
              <label>学位<input value={educationForm.degree} onChange={(event) => setEducationForm({ ...educationForm, degree: event.target.value })} /></label>
              <label>证明材料链接<input value={educationForm.document_url} onChange={(event) => setEducationForm({ ...educationForm, document_url: event.target.value })} placeholder="https://..." /></label>
              <button type="submit" className="secondary-action" disabled={!educationForm.real_name || !educationForm.school}><SendOutlined aria-hidden="true" /> 提交学历认证</button>
            </form>
            <form className="cert-form" onSubmit={submitDomain}>
              <h3>领域认证</h3>
              <label>真实姓名<input value={domainForm.real_name} onChange={(event) => setDomainForm({ ...domainForm, real_name: event.target.value })} /></label>
              <label>领域代码<input value={domainForm.domain} onChange={(event) => setDomainForm({ ...domainForm, domain: event.target.value })} /></label>
              <label>认证名称<input value={domainForm.cert_name} onChange={(event) => setDomainForm({ ...domainForm, cert_name: event.target.value })} placeholder="法律文本标注认证" /></label>
              <label>职称/头衔<input value={domainForm.title} onChange={(event) => setDomainForm({ ...domainForm, title: event.target.value })} /></label>
              <label>机构<input value={domainForm.organization} onChange={(event) => setDomainForm({ ...domainForm, organization: event.target.value })} /></label>
              <label>材料链接<input value={domainForm.document_url} onChange={(event) => setDomainForm({ ...domainForm, document_url: event.target.value })} placeholder="https://..." /></label>
              <label>能力说明<textarea value={domainForm.description} onChange={(event) => setDomainForm({ ...domainForm, description: event.target.value })} /></label>
              <button type="submit" className="secondary-action" disabled={!domainForm.real_name || !domainForm.cert_name}><SendOutlined aria-hidden="true" /> 提交领域认证</button>
            </form>
          </div>
        </section>

        <section className="settings-section">
          <div className="section-title">
            <div>
              <h3>认证记录</h3>
              <p>展示已提交的学历与领域资质状态。</p>
            </div>
          </div>
          <div className="data-table" role="table" aria-label="认证记录">
            <div role="row" className="data-row cert-row head"><span>认证名称</span><span>类型</span><span>状态</span><span>提交时间</span></div>
            {(profile?.certifications.length ? profile.certifications : [{ cert_id: 'empty', cert_name: '暂无认证记录', cert_category: '-', cert_type: '-', status: '-', created_at: '-' } as Certification]).map((cert) => (
              <div role="row" className="data-row cert-row" key={cert.cert_id}>
                <span>{cert.cert_name}</span>
                <span>{cert.cert_category === 'education' ? '学历' : cert.cert_category === 'domain' ? '领域' : cert.cert_category}</span>
                <span><em className={`status-tag ${cert.status === 'approved' ? 'success' : 'info'}`}>{cert.status}</em></span>
                <span>{cert.created_at || '-'}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={`settings-stack labeler-cert-stack ${formOnly ? 'labeler-cert-form-page' : ''}`}>
      {noticeContext}
      {!formOnly && <PageIntro kicker="Certification" title="资质认证" />}
      {!formOnly && hasLabelerCertifications && (
        <section className="settings-section cert-record-section account-neutral-panel">
          <div className="section-title">
            <div>
              <h3>认证记录</h3>
            </div>
            <div className="cert-record-toolbar">
              <div className="segmented-control" aria-label="认证记录视图">
                <button type="button" className={recordView === 'card' ? 'active' : ''} onClick={() => setRecordView('card')}><SnippetsOutlined aria-hidden="true" /> 卡片视图</button>
                <button type="button" className={recordView === 'list' ? 'active' : ''} onClick={() => setRecordView('list')}><FileSearchOutlined aria-hidden="true" /> 列表视图</button>
              </div>
              <button type="button" className="secondary-action" onClick={() => { onSelectCertification?.(null); if (onOpenForm) onOpenForm(); else setShowCertificationForm(true); }}><PlusOutlined aria-hidden="true" /> 添加认证</button>
            </div>
          </div>
          {recordView === 'card' ? (
            <div className="cert-record-card-grid" aria-label="认证记录">
              {labelerCertifications.map((cert) => (
                <article className="cert-record-card" key={cert.cert_id}>
                  <div>
                    <span>{cert.cert_category === 'education' ? '学历认证' : cert.cert_category === 'domain' ? '领域认证' : cert.cert_category}</span>
                    <strong>{cert.cert_name}</strong>
                    <small>{cert.created_at || '-'}</small>
                  </div>
                  <em className={`status-tag ${certificationStatusClass(cert.status)}`}>{certificationStatusLabel(cert.status)}</em>
                  <button type="button" className="secondary-action" onClick={() => { onSelectCertification?.(cert); if (onOpenForm) onOpenForm(cert); else setShowCertificationForm(true); }}>
                    {cert.status === 'pending_review' ? <><EyeOutlined aria-hidden="true" /> 查看认证</> : <><EditOutlined aria-hidden="true" /> 查看/修改已有认证</>}
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="data-table cert-record-table" role="table" aria-label="认证记录列表">
              <div role="row" className="data-row cert-row head"><span>认证名称</span><span>类型</span><span>状态</span><span>提交时间</span><span>操作</span></div>
              {labelerCertifications.map((cert) => (
                <div role="row" className="data-row cert-row five" key={cert.cert_id}>
                  <span>{cert.cert_name}</span>
                  <span>{cert.cert_category === 'education' ? '学历认证' : cert.cert_category === 'domain' ? '领域认证' : cert.cert_category}</span>
                  <span><em className={`status-tag ${certificationStatusClass(cert.status)}`}>{certificationStatusLabel(cert.status)}</em></span>
                  <span>{cert.created_at || '-'}</span>
                  <span><button type="button" className="link-action" onClick={() => { onSelectCertification?.(cert); if (onOpenForm) onOpenForm(cert); else setShowCertificationForm(true); }}>
                    {cert.status === 'pending_review' ? <><EyeOutlined aria-hidden="true" /> 查看</> : <><EditOutlined aria-hidden="true" /> 查看/修改</>}
                  </button></span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {!formOnly && !hasLabelerCertifications && onOpenForm && !shouldShowCertificationForm && (
        <section className="settings-section cert-record-section account-neutral-panel">
          <Empty
            className="labeler-ant-empty-state"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span>暂无资质认证记录</span>}
          >
            <button type="button" className="primary-action" onClick={() => { onSelectCertification?.(null); onOpenForm(); }}><PlusOutlined aria-hidden="true" /> 添加认证</button>
          </Empty>
        </section>
      )}

      {shouldShowCertificationForm && (
        <section className="settings-section professional-cert-panel account-neutral-panel">
          <div className="professional-sticky-title">
            <h2>职业资质信息</h2>
            {(hasLabelerCertifications || formOnly) && <button type="button" className="secondary-action" onClick={() => { onSelectCertification?.(null); if (onBack) onBack(); else setShowCertificationForm(false); }}><ArrowLeftOutlined aria-hidden="true" /> 返回认证记录</button>}
          </div>
          {certificationReadonly && <Alert className="inline-message-ant" type="info" showIcon message="资质认证正在审核中" description="待平台管理员审核完成前，只能查看已提交内容，不能修改或重新提交。" />}
          <form className="professional-bili-form" onSubmit={submitDomain}>
            <div className="professional-form-row">
              <label className="professional-form-label" htmlFor="professional-nickname">昵称</label>
              <div className="professional-control">
                <input id="professional-nickname" aria-label="昵称" value={nickname} readOnly />
              </div>
            </div>

            <div className="professional-form-row">
              <label className="professional-form-label required" htmlFor="professional-real-name">真实姓名</label>
              <div className="professional-control">
                <input id="professional-real-name" aria-label="真实姓名" value={domainForm.real_name} disabled={certificationReadonly} onChange={(event) => { setDomainForm({ ...domainForm, real_name: event.target.value }); setCertErrors((current) => ({ ...current, real_name: '' })); }} placeholder="请填写真实姓名" aria-invalid={Boolean(certErrors.real_name)} />
                {certErrors.real_name && <p className="basic-error">{certErrors.real_name}</p>}
              </div>
            </div>

            <div className="professional-form-row">
              <label className="professional-form-label required" htmlFor="professional-industry">选择行业</label>
              <div className="professional-control">
                <div className="professional-select-row">
                  <select
                    id="professional-industry"
                    aria-label="行业领域"
                    value={domainForm.industry}
                    disabled={certificationReadonly}
                    onChange={(event) => { setDomainForm({ ...domainForm, industry: event.target.value, domain: '' }); setCertErrors((current) => ({ ...current, industry: '', domain: '' })); }}
                    aria-invalid={Boolean(certErrors.industry)}
                  >
                    <option value="">请选择</option>
                    {professionalIndustryGroups.map((group) => <option value={group.value} key={group.value}>{group.label}</option>)}
                  </select>
                  <select
                    aria-label="职业身份"
                    value={domainForm.domain}
                    onChange={(event) => { setDomainForm({ ...domainForm, domain: event.target.value }); setCertErrors((current) => ({ ...current, domain: '' })); }}
                    disabled={certificationReadonly || !selectedIndustry}
                    aria-invalid={Boolean(certErrors.domain)}
                  >
                    <option value="">请选择</option>
                    {selectedIndustry?.professions.map((profession) => <option value={profession} key={profession}>{profession}</option>)}
                  </select>
                </div>
                {certErrors.industry && <p className="basic-error">{certErrors.industry}</p>}
                {certErrors.domain && <p className="basic-error">{certErrors.domain}</p>}
                <p>补充职业信息，帮助平台为标注员匹配合适任务、判断专业任务准入，并展示专业能力标签。</p>
              </div>
            </div>

            <div className="professional-form-row">
              <label className="professional-form-label required" htmlFor="professional-organization">工作单位</label>
              <div className="professional-control">
                <input id="professional-organization" aria-label="工作单位" value={domainForm.organization} disabled={certificationReadonly} onChange={(event) => { setDomainForm({ ...domainForm, organization: event.target.value }); setCertErrors((current) => ({ ...current, organization: '' })); }} placeholder="如xxx医院等" aria-invalid={Boolean(certErrors.organization)} />
                {certErrors.organization && <p className="basic-error">{certErrors.organization}</p>}
                <p>按照相关法律法规，需要收集您的姓名、工作所在单位将会用于职业资质展示</p>
              </div>
            </div>

            <div className="professional-form-row">
              <label className="professional-form-label required" htmlFor="professional-title">科室/学科/职位</label>
              <div className="professional-control">
                <textarea id="professional-title" aria-label="科室/学科/职位" value={domainForm.title} disabled={certificationReadonly} onChange={(event) => { setDomainForm({ ...domainForm, title: event.target.value }); setCertErrors((current) => ({ ...current, title: '' })); }} placeholder="如XX科室XX医生/XX学科XX教授" aria-invalid={Boolean(certErrors.title)} />
                {certErrors.title && <p className="basic-error">{certErrors.title}</p>}
              </div>
            </div>

            <div className="professional-form-row">
              <label className="professional-form-label required" htmlFor="professional-registration">登记编号</label>
              <div className="professional-control">
                <input id="professional-registration" aria-label="登记编号" value={domainForm.registration_number} disabled={certificationReadonly} onChange={(event) => { setDomainForm({ ...domainForm, registration_number: event.target.value }); setCertErrors((current) => ({ ...current, registration_number: '' })); }} aria-invalid={Boolean(certErrors.registration_number)} />
                {certErrors.registration_number && <p className="basic-error">{certErrors.registration_number}</p>}
              </div>
            </div>

            <div className="professional-form-row">
              <span className="professional-form-label required">专业资质</span>
              <div className="professional-control professional-upload-field">
                <div className="professional-upload-gallery">
                  <label className={`professional-upload-tile ${uploading === 'domain' || certificationReadonly ? 'is-disabled' : ''}`}>
                    <PlusOutlined aria-hidden="true" />
                    <input aria-label="专业资质上传" type="file" accept="image/jpeg,image/png" disabled={uploading === 'domain' || certificationReadonly} onChange={onFileChange('domain')} />
                  </label>
                  <DocumentList documents={domainDocs} onRemove={certificationReadonly ? undefined : (index) => removeMaterial('domain', index)} variant="tiles" />
                </div>
                {certErrors.documents && <p className="basic-error">{certErrors.documents}</p>}
                <p>单文件不超过1GB，支持JPG/PNG等格式，最多上传5张图片</p>
              </div>
            </div>

            <div className="professional-form-row">
              <span className="professional-form-label">补充资料</span>
              <div className="professional-control professional-upload-field">
                <div className="professional-upload-gallery">
                  <label className={`professional-upload-tile ${uploading === 'supplement' || certificationReadonly ? 'is-disabled' : ''}`}>
                    <PlusOutlined aria-hidden="true" />
                    <input aria-label="补充资料上传" type="file" accept="image/jpeg,image/png" disabled={uploading === 'supplement' || certificationReadonly} onChange={onFileChange('supplement')} />
                  </label>
                  <DocumentList documents={supplementDocs} onRemove={certificationReadonly ? undefined : (index) => removeMaterial('supplement', index)} variant="tiles" />
                </div>
                <p>单文件不超过1GB，支持JPG/PNG等格式，最多上传5张图片</p>
                <p>上传补充证明材料有利于认证审核通过，如奖状、奖杯、聘用书等</p>
                <button type="button" className="professional-form-link" onClick={onOpenRules}><FileSearchOutlined aria-hidden="true" /> 查看资质认证说明</button>
              </div>
            </div>

            <div className="professional-form-row professional-submit-row">
              <span className="professional-form-label" />
              <div className="professional-control">
                {!certificationReadonly && <button type="submit" className="primary-action" disabled={!canSubmitDomain}>{uploading ? <><UploadOutlined aria-hidden="true" /> 上传中...</> : <><SendOutlined aria-hidden="true" /> 提交申请</>}</button>}
                <div className="professional-agreement">
                  <input id="professional-agreement" type="checkbox" checked={agreementAccepted} disabled={certificationReadonly} onChange={(event) => { setAgreementAccepted(event.target.checked); setCertErrors((current) => ({ ...current, agreement: '' })); }} aria-label="我已同意 MarkUp 数据平台用户使用协议" />
                  <label htmlFor="professional-agreement">
                    我已同意
                  </label>
                  <button type="button" className="professional-form-link inline" onClick={onOpenAgreement}><FileSearchOutlined aria-hidden="true" /> 《MarkUp 数据平台用户使用协议》</button>
                </div>
                {certErrors.agreement && <p className="basic-error">{certErrors.agreement}</p>}
              </div>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

function PointsPanel({ labeler = false }: { labeler?: boolean }) {
  const [points, setPoints] = useState<PointsPayload | null>(null);
  const [filter, setFilter] = useState<'all' | 'gain' | 'cost'>('all');
  const [pointsDetailTab, setPointsDetailTab] = useState<'income' | 'withdraw'>('income');
  const [withdrawStatus, setWithdrawStatus] = useState('请选择');
  const [incomeScene, setIncomeScene] = useState('请选择');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showBankModal, setShowBankModal] = useState(false);
  const [bankSearchOpen, setBankSearchOpen] = useState(false);
  const [bankName, setBankName] = useState('');
  const [bankCardNumber, setBankCardNumber] = useState('');
  const [boundBank, setBoundBank] = useState<{ bank_name: string; card_number: string } | null>(null);
  const [bankErrors, setBankErrors] = useState<BankValidationErrors>({});
  const [noticeApi, noticeContext] = notification.useNotification();
  const [incomeDateStart, setIncomeDateStart] = useState('');
  const [incomeDateEnd, setIncomeDateEnd] = useState('');
  const [withdrawSearch, setWithdrawSearch] = useState('');
  const [withdrawDateStart, setWithdrawDateStart] = useState('');
  const [withdrawDateEnd, setWithdrawDateEnd] = useState('');
  const [activeIncomeDateField, setActiveIncomeDateField] = useState<'start' | 'end'>('start');
  const [activeWithdrawDateField, setActiveWithdrawDateField] = useState<'start' | 'end'>('start');
  const [showWithdrawDatePicker, setShowWithdrawDatePicker] = useState(false);
  const incomeDateWrapRef = useRef<HTMLDivElement | null>(null);
  const withdrawDateWrapRef = useRef<HTMLDivElement | null>(null);
  const bankSearchWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void getPoints().then(setPoints).catch(() => setPoints({ wallet: { total_points: 0, available_points: 0, level: 'bronze' }, overview: emptyPointsOverview(), items: [] }));
  }, []);

  useEffect(() => {
    if (!showDatePicker) return undefined;
    const closeOnOutside = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!incomeDateWrapRef.current?.contains(event.target)) setShowDatePicker(false);
    };
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [showDatePicker]);

  useEffect(() => {
    if (!showWithdrawDatePicker) return undefined;
    const closeOnOutside = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!withdrawDateWrapRef.current?.contains(event.target)) setShowWithdrawDatePicker(false);
    };
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [showWithdrawDatePicker]);

  useEffect(() => {
    if (!bankSearchOpen) return undefined;
    const closeOnOutside = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!bankSearchWrapRef.current?.contains(event.target)) setBankSearchOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [bankSearchOpen]);

  if (!labeler) {
    const rows = points?.items.length ? points.items.filter((item) => {
      if (filter === 'gain') return item.change > 0;
      if (filter === 'cost') return item.change < 0;
      return true;
    }) : [{ ledger_id: 'empty', reason: '暂无积分流水', change: 0, balance_after: points?.wallet.available_points ?? 0, created_at: '-' }];

    return (
      <div className="settings-stack">
        <section className="settings-section">
          <div className="section-title">
            <div>
              <p className="section-kicker">Points</p>
              <h2>积分管理</h2>
              <p>查看等级、可用积分和积分流水。</p>
            </div>
            <div className="segmented-control" aria-label="积分流水筛选">
              <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}><FileSearchOutlined aria-hidden="true" /> 全部</button>
              <button type="button" className={filter === 'gain' ? 'active' : ''} onClick={() => setFilter('gain')}><TrophyOutlined aria-hidden="true" /> 收入</button>
              <button type="button" className={filter === 'cost' ? 'active' : ''} onClick={() => setFilter('cost')}><CreditCardOutlined aria-hidden="true" /> 支出</button>
            </div>
          </div>
          <div className="metric-grid compact">
            <article className="metric-card"><span>总积分</span><strong>{points?.wallet.total_points ?? 0}</strong><p>历史累计</p></article>
            <article className="metric-card"><span>可用积分</span><strong>{points?.wallet.available_points ?? 0}</strong><p>可兑换余额</p></article>
          </div>
          <div className="data-table" role="table" aria-label="积分流水">
            <div role="row" className="data-row head"><span>原因</span><span>变动</span><span>余额</span><span>时间</span></div>
            {rows.map((item) => (
              <div role="row" className="data-row four" key={item.ledger_id}>
                <span>{item.reason}</span><span>{item.change}</span><span>{item.balance_after}</span><span>{item.created_at || '-'}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  const overview = points?.overview ?? {
    ...emptyPointsOverview(),
    total_points: points?.wallet.total_points ?? 0,
    available_points: points?.wallet.available_points ?? 0,
    level: points?.wallet.level ?? 'bronze',
    next_level_gap: nextLevelGap(points?.wallet.total_points ?? 0),
    updated_at: points?.wallet.updated_at ?? null,
  };
  const incomePages = [1, 2, 3, 4];
  const withdrawStatusOptions = ['已提现', '未提现', '提现中', '银行退票', '提现失败'];
  const incomeSceneOptions = ['线上任务', '线下任务', '邀请好友'];
  const incomeRows = (points?.items ?? []).filter((item) => item.change > 0).filter((item) => {
    const scene = String(item.metadata?.scene ?? '线上任务');
    if (incomeScene !== '请选择' && scene !== incomeScene) return false;
    if (incomeDateStart && item.created_at && item.created_at.slice(0, 10) < incomeDateStart) return false;
    if (incomeDateEnd && item.created_at && item.created_at.slice(0, 10) > incomeDateEnd) return false;
    return true;
  });
  const normalizedBankName = bankName.trim();
  const bankBranchMatches = bankBranchOptions.filter((option) => !normalizedBankName || option.includes(normalizedBankName));
  const canAddCustomBank = normalizedBankName.length > 0 && !bankBranchOptions.some((option) => option === normalizedBankName);
  const openIncomeDatePicker = (field: 'start' | 'end') => {
    setActiveIncomeDateField(field);
    setShowDatePicker(true);
  };
  const openWithdrawDatePicker = (field: 'start' | 'end') => {
    setActiveWithdrawDateField(field);
    setShowWithdrawDatePicker(true);
  };
  const selectDateRangeValue = (
    value: string,
    activeField: 'start' | 'end',
    startValue: string,
    endValue: string,
    setters: {
      setStart: (next: string) => void;
      setEnd: (next: string) => void;
      setActive: (next: 'start' | 'end') => void;
      setOpen: (next: boolean) => void;
    },
  ) => {
    if (activeField === 'start' || !startValue || endValue) {
      setters.setStart(value);
      setters.setEnd('');
      setters.setActive('end');
      return;
    }
    if (value < startValue) {
      setters.setStart(value);
      setters.setEnd('');
      setters.setActive('end');
      return;
    }
    setters.setEnd(value);
    setters.setOpen(false);
  };
  const selectIncomeDate = (value: string) => selectDateRangeValue(value, activeIncomeDateField, incomeDateStart, incomeDateEnd, {
    setStart: setIncomeDateStart,
    setEnd: setIncomeDateEnd,
    setActive: setActiveIncomeDateField,
    setOpen: setShowDatePicker,
  });
  const selectWithdrawDate = (value: string) => selectDateRangeValue(value, activeWithdrawDateField, withdrawDateStart, withdrawDateEnd, {
    setStart: setWithdrawDateStart,
    setEnd: setWithdrawDateEnd,
    setActive: setActiveWithdrawDateField,
    setOpen: setShowWithdrawDatePicker,
  });
  const clearIncomeFilters = () => {
    setWithdrawStatus('请选择');
    setIncomeScene('请选择');
    setIncomeDateStart('');
    setIncomeDateEnd('');
    setActiveIncomeDateField('start');
    setShowDatePicker(false);
  };
  const clearWithdrawFilters = () => {
    setWithdrawSearch('');
    setWithdrawDateStart('');
    setWithdrawDateEnd('');
    setActiveWithdrawDateField('start');
    setShowWithdrawDatePicker(false);
  };
  const selectBankBranch = (value: string) => {
    setBankName(value);
    setBankErrors((current) => ({ ...current, bank_name: '' }));
    setBankSearchOpen(false);
  };
  const bindBankCard = () => {
    const nextErrors: BankValidationErrors = {};
    if (!bankName.trim()) nextErrors.bank_name = '请选择开户行。';
    if (!bankCardNumber.trim()) nextErrors.bank_card_number = '请输入银行卡号。';
    else if (!/^\d{12,24}$/.test(bankCardNumber.replace(/\s+/g, ''))) nextErrors.bank_card_number = '银行卡号应为 12 到 24 位数字。';
    setBankErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      showLabelerNotice(noticeApi, 'warning', '银行卡信息还未填写完整', '请根据红色提示补齐必填内容后再确认。');
      return;
    }
    setBoundBank({ bank_name: bankName.trim(), card_number: bankCardNumber.replace(/\s+/g, '') });
    setShowBankModal(false);
    setBankSearchOpen(false);
    showLabelerNotice(noticeApi, 'success', '银行卡已绑定', '提现账户已更新。');
  };
  const renderDatePicker = (kind: 'income' | 'withdraw' = 'income') => {
    const startValue = kind === 'income' ? incomeDateStart : withdrawDateStart;
    const endValue = kind === 'income' ? incomeDateEnd : withdrawDateEnd;
    const onSelect = kind === 'income' ? selectIncomeDate : selectWithdrawDate;
    return (
    <div className="points-date-popover" role="dialog" aria-label="日期范围选择">
      <div className="points-calendar-grid">
        {['2026-05', '2026-06'].map((month, monthIndex) => (
          <div className="points-calendar-month" key={month}>
            <div className="points-calendar-title">
              <button type="button" aria-label={monthIndex === 0 ? '上一年' : '下一月'}>{monthIndex === 0 ? <ArrowLeftOutlined aria-hidden="true" /> : <ArrowRightOutlined aria-hidden="true" />}</button>
              <button type="button" aria-label={monthIndex === 0 ? '上一月' : '下一年'}>{monthIndex === 0 ? <ArrowLeftOutlined aria-hidden="true" /> : <ArrowRightOutlined aria-hidden="true" />}</button>
              <strong>{month}</strong>
            </div>
            <div className="points-calendar-week">
              {['一', '二', '三', '四', '五', '六', '日'].map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="points-calendar-days">
              {Array.from({ length: 35 }, (_, index) => {
                const day = index - (monthIndex === 0 ? 3 : 0) + 1;
                const disabled = day < 1 || day > (monthIndex === 0 ? 31 : 30);
                const value = `${month}-${String(day).padStart(2, '0')}`;
                const selected = !disabled && (value === startValue || value === endValue);
                const inRange = !disabled && startValue && endValue && value > startValue && value < endValue;
                return (
                  <button
                    type="button"
                    className={[disabled ? 'muted' : '', selected ? 'selected' : '', inRange ? 'in-range' : ''].filter(Boolean).join(' ')}
                    disabled={disabled}
                    key={`${month}-${index}`}
                    onClick={() => onSelect(value)}
                  >
                    {disabled ? Math.abs(day) + 1 : day}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="points-date-help">如何快速开始标注任务?</div>
    </div>
    );
  };

  return (
    <div className="settings-stack labeler-points-stack points-income-page">
      {noticeContext}
      <PageIntro kicker="Income" title="积分管理" />
      <section className="settings-section points-income-panel account-neutral-panel">
        <div className="points-income-cards">
          <article className="points-income-card">
            <h3>累计收入</h3>
            <div className="points-income-pair">
              <div>
                <span>至今累计</span>
                <strong>{overview.total_points}</strong>
                <small>积分</small>
              </div>
              <div>
                <span>本月收入累计</span>
                <strong>{overview.month_points}</strong>
                <small>积分</small>
              </div>
            </div>
          </article>
          <article className="points-income-card withdraw">
            <h3>提现</h3>
            <button type="button" className={`points-bind-link ${boundBank ? 'is-bound' : ''}`} onClick={() => { setShowBankModal(true); setBankErrors({}); setBankName(boundBank?.bank_name ?? bankName); setBankCardNumber(boundBank?.card_number ?? bankCardNumber); }}>
              <BankOutlined aria-hidden="true" /> {boundBank ? `${boundBank.bank_name} · ${maskBankCard(boundBank.card_number)}` : '未绑定银行卡 →'}
            </button>
            <div>
              <span>可提现积分</span>
              <strong>{overview.available_points}</strong>
              <small>积分</small>
            </div>
            <button type="button" className="primary-action" disabled><CreditCardOutlined aria-hidden="true" /> 去提现</button>
          </article>
        </div>
        <div className="points-income-detail">
          <div className="points-detail-tabs" role="tablist" aria-label="积分明细类型">
            <button type="button" className={pointsDetailTab === 'income' ? 'active' : ''} onClick={() => setPointsDetailTab('income')}><TrophyOutlined aria-hidden="true" /> 收入明细</button>
            <button type="button" className={pointsDetailTab === 'withdraw' ? 'active' : ''} onClick={() => setPointsDetailTab('withdraw')}><CreditCardOutlined aria-hidden="true" /> 提现明细</button>
          </div>
          {pointsDetailTab === 'income' ? (
            <>
              <div className="points-income-filter" aria-label="积分收入筛选">
                <select aria-label="任务名称筛选"><option>任务名称</option></select>
                <div className="points-search-control">
                  <SearchOutlined aria-hidden="true" />
                  <input aria-label="搜索任务名称或记录编号" placeholder="搜索任务名称或记录编号" />
                </div>
                <label className="points-select-field">提现状态<select aria-label="提现状态" value={withdrawStatus} onChange={(event) => setWithdrawStatus(event.target.value)}>
                  <option>请选择</option>
                  {withdrawStatusOptions.map((option) => <option key={option}>{option}</option>)}
                </select></label>
                <label className="points-select-field">收入场景<select aria-label="收入场景" value={incomeScene} onChange={(event) => setIncomeScene(event.target.value)}>
                  <option>请选择</option>
                  {incomeSceneOptions.map((option) => <option key={option}>{option}</option>)}
                </select></label>
                <div className="points-date-filter-wrap" ref={incomeDateWrapRef}>
                  <label className="points-date-filter">到账日期<input aria-label="开始日期" placeholder="开始日期" value={incomeDateStart} readOnly onClick={() => openIncomeDatePicker('start')} onFocus={() => openIncomeDatePicker('start')} /><span>-</span><input aria-label="结束日期" placeholder="结束日期" value={incomeDateEnd} readOnly onClick={() => openIncomeDatePicker('end')} onFocus={() => openIncomeDatePicker('end')} /><CalendarOutlined aria-hidden="true" /></label>
                  {showDatePicker && renderDatePicker()}
                </div>
                <button type="button" className="secondary-action" onClick={clearIncomeFilters}><CloseCircleOutlined aria-hidden="true" /> 清空</button>
              </div>
              <div className="points-income-table" role="table" aria-label="收入明细">
                <div role="row" className="points-table-row head">
                  <span>收入说明/记录编号</span><span>收入场景</span><span>任务名称</span><span>税前积分</span><span>提现状态</span><span>到账时间</span><span>操作</span>
                </div>
                {incomeRows.length ? incomeRows.map((item) => (
                  <div role="row" className="points-table-row points-income-ledger-row" key={item.ledger_id}>
                    <span><strong>{item.reason}</strong><small>记录编号 {formatShortId(item.ledger_id)}</small></span>
                    <span>{String(item.metadata?.scene ?? '线上任务')}</span>
                    <span>{String(item.metadata?.task_title ?? '-')}</span>
                    <span>{item.change}</span>
                    <span>未提现</span>
                    <span>{item.created_at ? formatDateTime(item.created_at) : '-'}</span>
                    <span>-</span>
                  </div>
                )) : (
                  <div role="row" className="points-table-empty">
                    <div>
                      <strong>暂无数据，请先认领高报酬任务</strong>
                    </div>
                  </div>
                )}
                <div className="points-table-footer">
                  <div className="points-pagination" aria-label="收入明细分页">
                    {incomePages.map((pageNumber) => <button type="button" className={pageNumber === 1 ? 'active' : ''} key={pageNumber}>{pageNumber}</button>)}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="points-withdraw-filter" aria-label="提现明细筛选">
                <div className="points-search-control points-withdraw-search">
                  <SearchOutlined aria-hidden="true" />
                  <input aria-label="搜索提现名称或记录编号" placeholder="搜索提现名称或记录编号" value={withdrawSearch} onChange={(event) => setWithdrawSearch(event.target.value)} />
                </div>
                <div aria-hidden="true" />
                <div aria-hidden="true" />
                <div className="points-date-filter-wrap" ref={withdrawDateWrapRef}>
                  <label className="points-date-filter">提现日期<input aria-label="提现开始日期" placeholder="开始日期" value={withdrawDateStart} readOnly onClick={() => openWithdrawDatePicker('start')} onFocus={() => openWithdrawDatePicker('start')} /><span>-</span><input aria-label="提现结束日期" placeholder="结束日期" value={withdrawDateEnd} readOnly onClick={() => openWithdrawDatePicker('end')} onFocus={() => openWithdrawDatePicker('end')} /><CalendarOutlined aria-hidden="true" /></label>
                  {showWithdrawDatePicker && renderDatePicker('withdraw')}
                </div>
                <button type="button" className="secondary-action" onClick={clearWithdrawFilters}><CloseCircleOutlined aria-hidden="true" /> 清空</button>
              </div>
              <div className="points-income-table withdraw-table" role="table" aria-label="提现明细">
                <div role="row" className="points-table-row withdraw-head">
                  <span>提现单号</span><span>提现金额(积分)</span><span>税后金额(积分)</span><span>到账状态</span><span>提现时间</span>
                </div>
                <div role="row" className="points-table-empty">
                  <div>
                    <strong>暂无数据，请先认领高报酬任务</strong>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
          {showBankModal && (
        <div className="bank-modal-backdrop" role="presentation">
          <div className="bank-modal" role="dialog" aria-modal="true" aria-labelledby="bank-modal-title">
            <button type="button" className="bank-modal-close" aria-label="关闭提现方式" onClick={() => { setShowBankModal(false); setBankSearchOpen(false); }}><CloseOutlined aria-hidden="true" /></button>
            <h2 id="bank-modal-title">绑定银行卡</h2>
            <div className="bank-modal-row">
              <label htmlFor="bank-branch"><span>*</span>开户行</label>
              <div className="bank-search-field" ref={bankSearchWrapRef}>
                <input id="bank-branch" value={bankName} onFocus={() => setBankSearchOpen(true)} onChange={(event) => { setBankName(event.target.value); setBankSearchOpen(true); setBankErrors((current) => ({ ...current, bank_name: '' })); }} placeholder="请搜索并选择要绑定的银行支行名称" aria-invalid={Boolean(bankErrors.bank_name)} />
                {bankSearchOpen && <div className="bank-search-results" role="listbox" aria-label="开户行搜索结果">
                  {bankBranchMatches.length ? bankBranchMatches.map((option) => (
                    <button type="button" key={option} onClick={() => selectBankBranch(option)}>{option}</button>
                  )) : <p>暂无匹配开户行，可直接添加当前输入。</p>}
                  {canAddCustomBank && <button type="button" className="bank-search-add" onClick={() => selectBankBranch(normalizedBankName)}>添加并使用“{normalizedBankName}”</button>}
                </div>}
                {bankErrors.bank_name && <p className="basic-error">{bankErrors.bank_name}</p>}
              </div>
            </div>
            <div className="bank-modal-row">
              <label htmlFor="bank-card-number"><span>*</span>银行卡号</label>
              <div>
                <input id="bank-card-number" value={bankCardNumber} onChange={(event) => { setBankCardNumber(event.target.value); setBankErrors((current) => ({ ...current, bank_card_number: '' })); }} placeholder="请输入要绑定的银行卡号" aria-invalid={Boolean(bankErrors.bank_card_number)} />
                {bankErrors.bank_card_number && <p className="basic-error">{bankErrors.bank_card_number}</p>}
              </div>
            </div>
            <div className="bank-modal-actions">
              <button type="button" className="secondary-action" onClick={() => { setShowBankModal(false); setBankSearchOpen(false); }}><CloseCircleOutlined aria-hidden="true" /> 取消</button>
              <button type="button" className="primary-action" onClick={bindBankCard}><CheckOutlined aria-hidden="true" /> 确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function ReputationPanel() {
  const [reputation, setReputation] = useState<ReputationPayload | null>(null);
  const [appealLedger, setAppealLedger] = useState<string | null>(null);
  const [appealReason, setAppealReason] = useState('');
  const [noticeApi, noticeContext] = notification.useNotification();

  const loadReputation = useCallback(async () => {
    try {
      setReputation(await getReputation());
    } catch {
      setReputation({
        wallet: { score: 100 },
        overview: { score: 100, max_score: 100, min_score: 0, claim_min_score: 80, month_gain: 0, month_deduction: 0, can_claim_task: true },
        items: [],
        rules: [],
      });
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadReputation();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadReputation]);

  const submitAppeal = async () => {
    if (!appealLedger || appealReason.trim().length < 5) return;
    try {
      await submitReputationAppeal({ ledger_id: appealLedger, reason: appealReason.trim() });
      showLabelerNotice(noticeApi, 'success', '申诉已提交', '平台管理员处理完成后会更新信誉分记录。');
      setAppealLedger(null);
      setAppealReason('');
      await loadReputation();
    } catch (err) {
      const text = err instanceof ApiClientError ? err.message : '申诉提交失败';
      showLabelerNotice(noticeApi, 'error', '申诉提交失败', text);
    }
  };

  const overview = reputation?.overview ?? { score: 100, max_score: 100, min_score: 0, claim_min_score: 80, month_gain: 0, month_deduction: 0, can_claim_task: true };
  const reputationItems = reputation?.items ?? [];
  const reputationRules = reputation?.rules?.length ? reputation.rules : defaultReputationRules();

  return (
    <div className="settings-stack labeler-points-stack points-income-page reputation-page">
      {noticeContext}
      <PageIntro kicker="Reputation" title="信誉分管理" />
      <section className="settings-section points-income-panel account-neutral-panel">
        <div className="points-income-cards reputation-cards">
          <article className="points-income-card reputation-score-card">
            <h3>信誉分</h3>
            <div className="points-income-pair">
              <div>
                <span>当前信誉分</span>
                <strong>{overview.score}</strong>
                <small>分</small>
              </div>
              <div>
                <span>本月扣分</span>
                <strong>{overview.month_deduction}</strong>
                <small>分</small>
              </div>
            </div>
            <p className={overview.can_claim_task ? 'reputation-status ok' : 'reputation-status danger'}>
              {overview.can_claim_task ? '当前可正常接取任务' : `低于 ${overview.claim_min_score} 分，暂不可接取任务`}
            </p>
          </article>
          <article className="points-income-card reputation-rules-card">
            <h3>信誉分规则</h3>
            <ul className="reputation-rules-list">
              {reputationRules.map((rule) => <li key={rule.title}><strong>{rule.title}</strong><span>{rule.description}</span></li>)}
            </ul>
          </article>
        </div>
        <div className="points-income-detail">
          <div className="points-detail-tabs" role="tablist" aria-label="信誉分明细类型">
            <button type="button" className="active"><CheckOutlined aria-hidden="true" /> 信誉分变动明细</button>
          </div>
          <div className="points-income-table reputation-table" role="table" aria-label="信誉分变动明细">
            <div role="row" className="points-table-row reputation-head">
              <span>变动说明/记录编号</span><span>关联任务</span><span>变动</span><span>剩余信誉分</span><span>时间</span><span>操作</span>
            </div>
            {reputationItems.length ? reputationItems.map((item) => (
              <div role="row" className="points-table-row reputation-row" key={item.ledger_id}>
                <span><strong>{item.reason}</strong><small>记录编号 {formatShortId(item.ledger_id)}</small></span>
                <span>{String(item.metadata?.task_title ?? '-')}</span>
                <span className={item.change > 0 ? 'positive-change' : item.change < 0 ? 'negative-change' : ''}>{item.change > 0 ? `+${item.change}` : item.change}</span>
                <span>{item.balance_after}</span>
                <span>{item.created_at ? formatDateTime(item.created_at) : '-'}</span>
                <span>
                  {item.change < 0 ? (
                    <button type="button" className="link-action" disabled={item.appeal_status === 'pending'} onClick={() => { setAppealLedger(item.ledger_id); setAppealReason(''); }}>
                      <FileSearchOutlined aria-hidden="true" /> {item.appeal_status === 'pending' ? '申诉中' : '申诉'}
                    </button>
                  ) : <span className="muted-table-text">-</span>}
                </span>
              </div>
            )) : (
              <div role="row" className="points-table-empty"><div><strong>暂无信誉分变动</strong><span>保持稳定提交后，信誉分会维持在健康状态。</span></div></div>
            )}
          </div>
        </div>
      </section>
      {appealLedger && (
        <div className="bank-modal-backdrop" role="presentation">
          <div className="bank-modal" role="dialog" aria-modal="true" aria-labelledby="reputation-appeal-title">
            <button type="button" className="bank-modal-close" aria-label="关闭信誉分申诉" onClick={() => setAppealLedger(null)}><CloseOutlined aria-hidden="true" /></button>
            <h2 id="reputation-appeal-title">信誉分申诉</h2>
            <div className="bank-modal-row reputation-appeal-row">
              <label htmlFor="reputation-appeal-reason"><span>*</span>申诉理由（至少 5 个字）</label>
              <textarea id="reputation-appeal-reason" value={appealReason} onChange={(event) => setAppealReason(event.target.value)} placeholder="请说明为什么该扣分需要平台管理员复核，至少填写 5 个字" />
              <small className="form-help">当前 {appealReason.trim().length}/5 字，提交后会进入平台管理员的信誉分申诉审核队列。</small>
            </div>
            <div className="bank-modal-actions">
              <button type="button" className="secondary-action" onClick={() => setAppealLedger(null)}><CloseCircleOutlined aria-hidden="true" /> 取消</button>
              <button type="button" className="primary-action" disabled={appealReason.trim().length < 5} onClick={() => void submitAppeal()}><SendOutlined aria-hidden="true" /> 确认申诉</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function CertificationRulesPage({ onBack }: { onBack: () => void }) {
  return (
    <main className="workspace-content account-guide-page">
      <section className="page-heading">
        <div>
          <p className="section-kicker">Certification guide</p>
          <h1>MarkUp 职业资质认证说明</h1>
          <p>职业资质认证用于确认标注员在特定行业中的真实身份、从业经历和专业能力，审核通过后可用于任务匹配、空间标签和专业任务准入。</p>
        </div>
        <button type="button" className="secondary-action" onClick={onBack}><ArrowLeftOutlined aria-hidden="true" /> 返回资质认证</button>
      </section>
      <section className="settings-section account-neutral-panel professional-guide-hero">
        <div>
          <h2>认证后会展示什么</h2>
          <p>通过认证后，MarkUp 会在个人资料与可见的任务协作场景中展示“职业资质”标签，并用于任务匹配、空间标签和专业任务准入。</p>
        </div>
        <div className="professional-career-visual" aria-hidden="true">
          <span>财经</span><span>司法</span><span>心理</span><span>医疗</span><span>教育</span>
        </div>
      </section>
      <section className="settings-section account-neutral-panel">
        <div className="section-title">
          <div>
            <h2>哪些职业可以申请</h2>
            <p>当前支持财经、司法、心理、医疗和教育五类职业方向。</p>
          </div>
        </div>
        <div className="rule-list professional-rule-list">
          {professionalIndustryGroups.map((group) => (
            <article key={group.value}>
              <strong>{group.label}</strong>
              <p>{group.professions.join('、')}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="settings-section account-neutral-panel">
        <div className="section-title">
          <div>
            <h2>材料与审核规则</h2>
            <p>审核由 MarkUp 平台运营方完成，企业管理员无法审批、查看或修改标注员个人认证材料。</p>
          </div>
        </div>
        <ul className="account-rule-steps">
          <li><span>1</span><p>真实姓名、工作单位、职位或登记编号需与提交材料保持一致，材料应清晰、完整、可辨认。</p></li>
          <li><span>2</span><p>专业资质材料可包括职业资格证、执业证明、聘书、工作证明、公开可核验的行业任职信息等。</p></li>
          <li><span>3</span><p>补充资料不是必填项，但奖项、聘书、项目证明等材料有助于平台判断资质与任务方向的关联度。</p></li>
          <li><span>4</span><p>如发现伪造、冒用、过期或与本人不一致的材料，平台会驳回申请；已通过认证也可能被复核或撤销。</p></li>
          <li><span>5</span><p>审核通过或审核中状态下，认证信息不支持二次编辑。如需修改，请等待审核结束后重新提交。</p></li>
        </ul>
      </section>
    </main>
  );
}

function CertificationUserAgreementPage({ onBack }: { onBack: () => void }) {
  return (
    <main className="workspace-content account-guide-page">
      <section className="page-heading">
        <div>
          <p className="section-kicker">User agreement</p>
          <h1>MarkUp 数据平台用户使用协议</h1>
          <p>本协议用于说明您在使用 MarkUp 数据平台、提交个人资料与参与数据标注任务时的基本权利义务。</p>
        </div>
        <button type="button" className="secondary-action" onClick={onBack}><ArrowLeftOutlined aria-hidden="true" /> 返回资质认证</button>
      </section>
      <section className="settings-section account-neutral-panel agreement-article">
        <article><h2>一、服务说明</h2><p>MarkUp 为用户提供账号管理、资质认证、任务领取、数据标注、审核协作、积分结算等服务。平台会根据用户角色、企业关系和任务权限展示不同功能。</p></article>
        <article><h2>二、账号与认证</h2><p>您应使用本人真实、合法、有效的信息完成账号注册和资质申请。提交职业资质时，您确认材料来源合法，且与本人身份、工作单位、职业身份或专业能力相符。</p></article>
        <article><h2>三、用户内容与材料</h2><p>您在平台上传的认证材料、任务内容、标注结果和反馈信息应符合法律法规，不得包含伪造证明、侵权内容、恶意代码、违法信息或与认证无关的敏感材料。</p></article>
        <article><h2>四、数据与隐私</h2><p>平台会为账号安全、资质审核、任务分配、质量评估和结算目的处理必要信息。平台运营方会按最小必要原则访问认证材料，企业管理员不能审批标注员个人资质。</p></article>
        <article><h2>五、禁止行为</h2><p>不得冒用他人身份，不得买卖、出租或共享账号，不得绕过权限访问未授权任务，不得泄露任务数据，不得通过脚本、刷量或其他异常方式影响平台统计与结算。</p></article>
        <article><h2>六、违规处理</h2><p>如用户违反本协议或平台规则，平台可根据情节采取驳回认证、限制任务、暂停结算、冻结账号、撤销资质、保留日志并追究责任等处理措施。</p></article>
        <article><h2>七、协议更新</h2><p>平台可能根据业务、法规或安全要求调整本协议。重要更新会通过站内通知或页面提示展示，您继续使用平台即视为接受更新后的规则。</p></article>
      </section>
    </main>
  );
}

function CertificationMaterialGuidePage({ onBack }: { onBack: () => void }) {
  return (
    <main className="workspace-content account-guide-page">
      <section className="page-heading">
        <div>
          <p className="section-kicker">Material guide</p>
          <h1>认证材料说明</h1>
          <p>上传材料前请确认图片或 PDF 清晰完整，并遮挡身份证号、住址等非必要敏感信息。</p>
        </div>
        <button type="button" className="secondary-action" onClick={onBack}><ArrowLeftOutlined aria-hidden="true" /> 返回资质认证</button>
      </section>
      <section className="settings-section account-neutral-panel">
        <div className="section-title">
          <div>
            <h2>可提交材料</h2>
            <p>以下材料类型可作为学历或专业资质审核依据。</p>
          </div>
        </div>
        <div className="material-guide-grid">
          <article><strong>学历材料</strong><p>学信网截图、毕业证书、学位证书、在读证明或学校开具的证明。</p></article>
          <article><strong>职业资格</strong><p>律师证、医师资格证、教师资格证、会计证、翻译资格证等。</p></article>
          <article><strong>项目经历</strong><p>项目证明、合同节选、工作证明、实习证明、公开作品链接或作品集截图。</p></article>
          <article><strong>研究成果</strong><p>论文、专利、竞赛获奖、开源项目贡献、技术博客或课程结业证明。</p></article>
        </div>
      </section>
      <section className="settings-section account-neutral-panel">
        <div className="section-title">
          <div>
            <h2>上传要求</h2>
            <p>材料不合规会影响审核效率。</p>
          </div>
        </div>
        <ul className="account-rule-steps">
          <li><span>1</span><p>图片建议使用 PNG/JPG，文件内容应保持完整边缘和关键字段。</p></li>
          <li><span>2</span><p>PDF 或图片中需要能看出姓名、机构、证书或项目名称、时间等审核要素。</p></li>
          <li><span>3</span><p>外部链接应可访问，若需要登录或已过期，审核将无法通过。</p></li>
          <li><span>4</span><p>请勿上传身份证正反面、银行卡、住址等与认证无关的敏感材料。</p></li>
        </ul>
      </section>
    </main>
  );
}

const pointsLevelRules = [
  { level: 'Bronze', name: '青铜标注员', threshold: '0+', rights: '可参与基础标注任务，查看个人积分概览。' },
  { level: 'Silver', name: '白银标注员', threshold: '300+', rights: '优先匹配稳定任务，可进入部分专业方向候选池。' },
  { level: 'Gold', name: '黄金标注员', threshold: '1000+', rights: '优先参与高质量任务和试点项目，获得更高任务推荐权重。' },
];

function PointsLevelRulesPage({ onBack }: { onBack: () => void }) {
  return (
    <main className="workspace-content account-guide-page">
      <section className="page-heading">
        <div>
          <p className="section-kicker">Level rules</p>
          <h1>MarkUp 积分等级制度</h1>
          <p>积分等级用于衡量标注员的持续贡献和任务完成质量，平台会结合累计积分、任务质量、违规记录和运营规则进行等级展示与任务匹配。</p>
        </div>
        <button type="button" className="secondary-action" onClick={onBack}><ArrowLeftOutlined aria-hidden="true" /> 返回积分管理</button>
      </section>
      <section className="settings-section account-neutral-panel">
        <div className="section-title">
          <div>
            <h2>等级划分</h2>
            <p>当前按累计积分展示等级。</p>
          </div>
        </div>
        <div className="points-level-grid">
          {pointsLevelRules.map((rule) => (
            <article key={rule.level}>
              <span>{rule.level}</span>
              <strong>{rule.name}</strong>
              <p>累计积分 {rule.threshold}</p>
              <small>{rule.rights}</small>
            </article>
          ))}
        </div>
      </section>
      <section className="settings-section account-neutral-panel">
        <div className="section-title">
          <div>
            <h2>积分如何影响等级</h2>
            <p>积分等级不是结算承诺，而是平台进行任务准入、任务推荐和账号成长展示时的参考。</p>
          </div>
        </div>
        <ul className="account-rule-steps">
          <li><span>1</span><p>完成任务并通过验收后，积分进入已结算统计；待结算积分不会立即计入当前等级。</p></li>
          <li><span>2</span><p>发生任务驳回、质量异常、违规操作或运营调整时，平台可能扣减积分或限制等级权益。</p></li>
          <li><span>3</span><p>等级门槛会随平台任务规模调整，调整前会通过站内公告或规则页提示。</p></li>
          <li><span>4</span><p>达到下一等级门槛后，个人积分页会显示新的等级状态。</p></li>
        </ul>
      </section>
    </main>
  );
}

function DocumentList({ documents, onRemove, variant = 'list' }: { documents: Array<Record<string, unknown>>; onRemove?: (index: number) => void; variant?: 'list' | 'tiles' }) {
  if (!documents.length) {
    return variant === 'tiles' ? null : <p className="material-list empty">尚未上传材料</p>;
  }
  if (variant === 'tiles') {
    return (
      <div className="material-thumb-list" aria-label="已上传材料">
        {documents.map((document, index) => {
          const filename = String(document.filename ?? document.file_id ?? `材料 ${index + 1}`);
          const materialUrl = document.url ? String(document.url) : '';
          const previewUrl = document.preview_url ? String(document.preview_url) : '';
          const contentType = String(document.content_type ?? '');
          const isImage = contentType.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(filename);
          return (
            <figure className="material-thumb" key={`${String(document.file_id ?? document.url ?? index)}`}>
              {isImage && previewUrl ? <img src={previewUrl} alt={filename} /> : <span className="material-thumb-placeholder">{isImage ? '图片' : '材料'}</span>}
              {materialUrl ? (
                <button type="button" className="material-thumb-preview" aria-label={`查看 ${filename}`} onClick={() => void openProfileMaterial(materialUrl)}>
                  <FileSearchOutlined aria-hidden="true" />
                </button>
              ) : null}
              {onRemove ? (
                <button type="button" className="material-thumb-remove" aria-label={`删除 ${filename}`} onClick={() => onRemove(index)}>
                  <CloseOutlined aria-hidden="true" />
                </button>
              ) : null}
              <figcaption title={filename}>{filename}</figcaption>
            </figure>
          );
        })}
      </div>
    );
  }
  return (
    <ul className="material-list">
      {documents.map((document, index) => {
        const filename = String(document.filename ?? document.file_id ?? `材料 ${index + 1}`);
        const materialUrl = document.url ? String(document.url) : '';
        return (
          <li key={`${String(document.file_id ?? document.url ?? index)}`}>
            <span title={filename}>{filename}</span>
            {(materialUrl || onRemove) && (
              <div className="material-actions">
                {materialUrl ? <button type="button" className="link-action" onClick={() => void openProfileMaterial(materialUrl)}><EyeOutlined aria-hidden="true" /> 查看</button> : null}
                {onRemove ? <button type="button" className="link-action danger" aria-label={`删除 ${filename}`} onClick={() => onRemove(index)}><CloseOutlined aria-hidden="true" /> 删除</button> : null}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function certificationStatusClass(status: string): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'danger';
  if (status === 'not_submitted') return 'warning';
  return 'info';
}

function certificationStatusLabel(status: string): string {
  if (status === 'approved') return '已通过';
  if (status === 'rejected') return '未通过';
  if (status === 'pending_review') return '审核中';
  if (status === 'not_submitted') return '未提交';
  return status;
}

function emptyPointsOverview() {
  return {
    total_points: 0,
    available_points: 0,
    settled_points: 0,
    pending_points: 0,
    spent_points: 0,
    today_points: 0,
    month_points: 0,
    level: 'bronze',
    next_level_gap: 300,
    updated_at: null,
  };
}

function defaultReputationRules(): Array<{ title: string; description: string }> {
  return [
    { title: '初始与上下限', description: '信誉分初始为 100 分，最高 100 分，最低 0 分。' },
    { title: '自然恢复', description: '信誉分低于 100 分时，每天自然恢复 1 分，恢复到满分后停止。' },
    { title: '质量加分', description: '每累计 50 道题被审核通过并正式收录，信誉分增加 1 分。' },
    { title: '终审不合格', description: '同一道题经过三轮打回后仍未通过终审，每题扣 5 分；若任务已结束，该题不再重新流转。' },
    { title: '超时扣分', description: '领取后超时未完成的题目按题扣分，每个超时题目扣 5 分。' },
    { title: '超额放弃', description: '超过当前任务免扣信誉分放弃次数后，继续放弃题目每题扣 5 分。' },
    { title: '接单限制', description: '信誉分低于 80 分时仍可浏览任务广场，但不能接取新任务。' },
  ];
}

function nextLevelGap(totalPoints: number): number {
  if (totalPoints >= 1000) return 0;
  if (totalPoints >= 300) return 1000 - totalPoints;
  return 300 - totalPoints;
}

function maskBankCard(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 4) return digits || '已绑定';
  return `尾号 ${digits.slice(-4)}`;
}

async function openProfileMaterial(url: string) {
  if (/^https?:\/\//i.test(url)) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  const response = await authenticatedFetch(profileMaterialApiPath(url));
  if (!response.ok) return;
  const blob = await response.blob();
  if (typeof URL === 'undefined' || !URL.createObjectURL) return;
  const blobUrl = URL.createObjectURL(blob);
  window.open(blobUrl, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

function profileMaterialApiPath(url: string): string {
  const apiBase = getApiBaseUrl();
  if (url.startsWith(apiBase)) return url.slice(apiBase.length) || '/';
  if (url.startsWith('/api/v1')) return url.slice('/api/v1'.length) || '/';
  return url;
}

function LabelerTasksPage({ onOpenLabelingTask, claimedTaskId, teamLabeler = false }: { onOpenLabelingTask: (taskId: string) => void; claimedTaskId?: string; teamLabeler?: boolean }) {
  const [keyword, setKeyword] = useState('');
  const [myTasks, setMyTasks] = useState<LabelerTaskListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshAttempt, setRefreshAttempt] = useState(0);
  const [confirmRemovingTask, setConfirmRemovingTask] = useState<LabelerTaskListPayload['items'][number] | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'card'>('card');

  const loadMyTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMyLabelingTasks();
      setMyTasks(data);
      if (claimedTaskId && !data.items.some((item) => item.task.task_id === claimedTaskId) && refreshAttempt < 3) {
        window.setTimeout(() => setRefreshAttempt((current) => current + 1), 500);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '我的任务加载失败');
    } finally {
      setLoading(false);
    }
  }, [claimedTaskId, refreshAttempt]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMyTasks();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMyTasks]);

  useEffect(() => {
    const timer = window.setTimeout(() => setRefreshAttempt(0), 0);
    return () => window.clearTimeout(timer);
  }, [claimedTaskId]);

  const filteredMyTasks = useMemo(() => {
    const items = myTasks?.items ?? [];
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) return items;
    return items.filter(({ task }) => (
      task.title.toLowerCase().includes(normalizedKeyword)
      || task.description.toLowerCase().includes(normalizedKeyword)
      || task.tags.some((tag) => tag.toLowerCase().includes(normalizedKeyword))
    ));
  }, [keyword, myTasks]);
  const syncingClaimedTask = Boolean(claimedTaskId && myTasks && !myTasks.items.some((item) => item.task.task_id === claimedTaskId) && refreshAttempt < 3);
  const pageTitle = teamLabeler ? '我的项目' : '我的任务';
  const taskColumns = useMemo<TableColumnsType<LabelerTaskListPayload['items'][number]>>(() => [
    {
      title: '任务',
      render: (_, item) => (
        <span className="table-title-button labeler-task-title-cell" aria-label={`任务 ${item.task.title}`}>
          <SnippetsOutlined aria-hidden="true" />
          <strong>{item.task.title}</strong>
          <small>{item.task.description || '暂无任务说明'}</small>
        </span>
      ),
    },
    {
      title: '状态',
      width: 120,
      render: (_, item) => {
        const needsRevision = Boolean(item.needs_revision) || item.progress.rejected > 0;
        const taskPaused = item.task.status === 'paused';
        const taskFinished = item.task.status === 'finished';
        const pendingReview = item.progress.total > 0 && item.progress.remaining === 0 && !needsRevision && item.task_submitted !== false;
        return <Tag color={taskFinished ? 'default' : taskPaused ? 'warning' : needsRevision ? 'error' : pendingReview ? 'processing' : 'blue'}>{taskFinished ? '已结束' : taskPaused ? '已暂停' : needsRevision ? '待修改' : pendingReview ? '待审核' : '可批注'}</Tag>;
      },
    },
    {
      title: '题目进度',
      width: 220,
      render: (_, item) => {
        const progressPercent = safeProgressPercent(item.progress.percent);
        return (
          <div className="labeler-task-table-progress">
            <span>{item.progress.submitted}/{item.progress.total}</span>
            <Progress percent={progressPercent} showInfo={false} size="small" />
            <small>剩余 {item.progress.remaining} · 打回 {item.progress.rejected}</small>
          </div>
        );
      },
    },
    { title: '难度', width: 100, render: (_, item) => formatTaskDifficulty(item.task.difficulty) },
    { title: '最近更新', width: 180, render: (_, item) => item.last_updated_at ? formatDateTime(item.last_updated_at) : '-' },
    {
      title: '操作',
      key: 'actions',
      width: 138,
      fixed: 'right',
      className: 'workspace-table-action-cell',
      render: (_, item) => {
        const needsRevision = Boolean(item.needs_revision) || item.progress.rejected > 0;
        const taskPaused = item.task.status === 'paused';
        const taskFinished = item.task.status === 'finished';
        const pendingReview = item.progress.total > 0 && item.progress.remaining === 0 && !needsRevision && item.task_submitted !== false;
        const untouched = item.progress.submitted === 0 && item.progress.rejected === 0;
        const taskDistributionStopped = taskPaused || taskFinished;
        const canContinueStoppedTask = taskDistributionStopped && item.progress.remaining > 0;
        const buttonDisabled = pendingReview || (taskDistributionStopped && !canContinueStoppedTask);
        const actionLabel = taskDistributionStopped && !canContinueStoppedTask ? (taskFinished ? '已结束' : '已暂停') : needsRevision ? '待修改' : pendingReview ? '待审核' : untouched ? '开始' : '继续';
        return (
          <WorkspaceTableActions
            visible={[{
              key: 'open',
              label: actionLabel,
              icon: needsRevision ? <EditOutlined /> : <FileSearchOutlined />,
              danger: needsRevision,
              disabled: buttonDisabled,
              onClick: () => onOpenLabelingTask(item.task.task_id),
            }]}
            menu={taskFinished && !canContinueStoppedTask ? [{
              key: 'remove',
              label: '移除任务',
              icon: <CloseOutlined />,
              danger: true,
              onClick: () => setConfirmRemovingTask(item),
            }] : []}
          />
        );
      },
    },
  ], [onOpenLabelingTask]);

  return (
    <main className="workspace-content labeler-task-console">
      <PageIntro kicker="Tasks" title={pageTitle} />

      <section className="labeler-task-surface">
        <div className="labeler-task-toolbar">
          <h2>{pageTitle}</h2>
          <div className="labeler-task-actions">
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索任务" aria-label="搜索任务" />
            <Segmented<'table' | 'card'>
              className="production-view-switch"
              aria-label="我的任务展示方式"
              value={viewMode}
              onChange={setViewMode}
              options={[
                { label: '表格', value: 'table', icon: <BarsOutlined /> },
                { label: '卡片', value: 'card', icon: <AppstoreOutlined /> },
              ]}
            />
            <button type="button" className="secondary-action" onClick={() => void loadMyTasks()}><ReloadOutlined aria-hidden="true" /> 刷新</button>
            <a className="primary-action labeler-market-link" href="/tasks"><SnippetsOutlined aria-hidden="true" /> 任务广场</a>
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className={viewMode === 'table' ? 'labeler-task-table-shell production-table-shell workspace-fixed-table-panel' : 'labeler-task-grid production-card-shell'} aria-busy={loading}>
          {loading || syncingClaimedTask ? (
            <LabelerEmptyState title="正在加载任务" description="正在同步你已经领取的批注任务。" />
          ) : filteredMyTasks.length && viewMode === 'table' ? (
            <Table<LabelerTaskListPayload['items'][number]>
              className="workspace-fixed-table labeler-my-task-table"
              rowKey={(item) => item.task.task_id}
              dataSource={filteredMyTasks}
              columns={taskColumns}
              pagination={{ pageSize: 10, showSizeChanger: true }}
              tableLayout="fixed"
            />
          ) : filteredMyTasks.length ? filteredMyTasks.map((item) => {
            const progressPercent = safeProgressPercent(item.progress.percent);
            const needsRevision = Boolean(item.needs_revision) || item.progress.rejected > 0;
            const taskPaused = item.task.status === 'paused';
            const taskFinished = item.task.status === 'finished';
            const pendingReview = item.progress.total > 0 && item.progress.remaining === 0 && !needsRevision && item.task_submitted !== false;
            const untouched = item.progress.submitted === 0 && item.progress.rejected === 0;
            const taskDistributionStopped = taskPaused || taskFinished;
            const canContinueStoppedTask = taskDistributionStopped && item.progress.remaining > 0;
            const buttonDisabled = pendingReview || (taskDistributionStopped && !canContinueStoppedTask);
            return (
              <Card className={`production-card labeler-task-card ${taskPaused ? 'is-paused' : ''} ${taskFinished ? 'is-finished' : ''}`} key={item.task.task_id}>
                {taskFinished && !canContinueStoppedTask && (
                  <button
                    type="button"
                    className="labeler-task-dismiss"
                    aria-label={`删除已结束任务 ${item.task.title}`}
                    onClick={() => setConfirmRemovingTask(item)}
                  >
                    <CloseOutlined aria-hidden="true" />
                  </button>
                )}
                <div className="production-card-topline">
                  <div className="production-card-badges">
                    <Tag color={taskFinished ? 'default' : taskPaused ? 'warning' : needsRevision ? 'error' : pendingReview ? 'processing' : 'blue'}>{taskFinished ? '已结束' : taskPaused ? '已暂停' : needsRevision ? '待修改' : pendingReview ? '待审核' : '可批注'}</Tag>
                    <Tag color="cyan">{formatTaskDifficulty(item.task.difficulty)}</Tag>
                  </div>
                  <span className="production-card-status">{item.last_updated_at ? formatDateTime(item.last_updated_at) : '尚无更新'}</span>
                </div>
                <div className="production-card-body">
                  <p className="section-kicker">{formatTaskCategory(item.task.category)} · {formatTaskDifficulty(item.task.difficulty)}</p>
                  <h2>{item.task.title}</h2>
                  <p>{item.task.description || '暂无任务说明'}</p>
                </div>
                <div className="production-card-metrics labeler-task-meta">
                  <span><strong>{item.progress.total}</strong><small>总题数</small></span>
                  <span><strong>{item.progress.submitted}</strong><small>已提交</small></span>
                  <span><strong>{item.progress.remaining}</strong><small>待处理</small></span>
                </div>
                <div className="production-card-progress" aria-label={`任务进度 ${progressPercent}%`}>
                  <div><strong>{progressPercent}%</strong><span>打回 {item.progress.rejected}</span></div>
                  <Progress percent={progressPercent} showInfo={false} size="small" />
                </div>
                <div className="production-card-actions labeler-task-card-footer">
                  <small>{item.last_updated_at ? `最近更新 ${formatDateTime(item.last_updated_at)}` : '尚无更新时间'}</small>
                  <button
                    type="button"
                    className={needsRevision ? 'primary-action danger-action' : 'primary-action'}
                    disabled={buttonDisabled}
                    onClick={() => {
                      if (!buttonDisabled) onOpenLabelingTask(item.task.task_id);
                    }}
                  >
                    {taskDistributionStopped && !canContinueStoppedTask ? <><CheckOutlined aria-hidden="true" /> {taskFinished ? '已结束' : '已暂停'}</> : needsRevision ? <><EditOutlined aria-hidden="true" /> 待修改</> : pendingReview ? <><FileSearchOutlined aria-hidden="true" /> 待审核</> : untouched ? <><EditOutlined aria-hidden="true" /> 开始批注</> : <><EditOutlined aria-hidden="true" /> 继续批注</>}
                  </button>
                </div>
              </Card>
            );
          }) : (
            <LabelerEmptyState
              title="暂无任务"
              description="在任务广场领取任务后，会在这里继续批注和提交。"
              action={<a className="primary-action labeler-market-link" href="/tasks"><SnippetsOutlined aria-hidden="true" /> 任务广场</a>}
            />
          )}
        </div>
      </section>
      {confirmRemovingTask && (
        <div className="confirm-modal-backdrop" role="presentation">
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="remove-finished-task-title">
            <h2 id="remove-finished-task-title">删除已结束任务</h2>
            <p>是否确定删除任务「{confirmRemovingTask.task.title}」？删除后该任务会从“我的任务”消失，但仍可在“任务历史”查看记录。</p>
            <div className="confirm-modal-actions">
              <button type="button" className="secondary-action" onClick={() => setConfirmRemovingTask(null)}><CloseCircleOutlined aria-hidden="true" /> 取消</button>
              <button
                type="button"
                className="primary-action danger-action"
                onClick={() => {
                  setMyTasks((current) => current ? {
                    ...current,
                    items: current.items.filter((item) => item.task.task_id !== confirmRemovingTask.task.task_id),
                  } : current);
                  setConfirmRemovingTask(null);
                }}
              >
                <CloseOutlined aria-hidden="true" /> 确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function LabelerQuestionsPage({ onOpenTasks, teamLabeler = false }: { onOpenTasks: () => void; teamLabeler?: boolean }) {
  const [contributions, setContributions] = useState<LabelerContributionsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let ignore = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void getLabelerContributions()
        .then((data) => {
          if (!ignore) setContributions(data);
        })
        .catch((err) => {
          if (!ignore) setError(err instanceof ApiClientError ? err.message : '任务历史加载失败');
        })
        .finally(() => {
          if (!ignore) setLoading(false);
        });
    }, 0);
    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, []);

  const items = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const recentItems = groupContributionItemsByTask(contributions?.recent_items ?? []);
    if (!normalizedKeyword) return recentItems;
    return recentItems.filter((item) => item.task_title.toLowerCase().includes(normalizedKeyword) || item.task_id.toLowerCase().includes(normalizedKeyword));
  }, [contributions, keyword]);
  const toggleTaskDetail = (taskId: string) => {
    setExpandedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };
  const pageTitle = teamLabeler ? '项目历史' : '任务历史';

  return (
    <main className="workspace-content labeler-task-console">
      <PageIntro kicker="History" title={pageTitle} />

      <section className="labeler-task-surface">
        <div className="labeler-task-toolbar">
          <h2>{pageTitle}</h2>
          <div className="labeler-task-actions">
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索任务" aria-label="搜索任务" />
            <button type="button" className="secondary-action" onClick={onOpenTasks}><SnippetsOutlined aria-hidden="true" /> 我的任务</button>
          </div>
        </div>
        {error && <p className="form-error">{error}</p>}
        {loading ? (
          <LabelerEmptyState title="正在加载题目" description="正在同步你已经提交过的题目。" />
        ) : items.length ? (
          <div className="labeler-review-task-list">
            <div className="labeler-review-task-head" aria-hidden="true">
              <span>任务</span>
              <span>状态</span>
              <span>题目统计</span>
              <span>最近更新</span>
              <span>操作</span>
            </div>
            {items.map((item) => {
              const stats = getReviewTaskStats(item);
              const expanded = expandedTaskIds.has(item.task_id);
              return (
                <article className="labeler-review-task-item" key={item.submission_id}>
                  <div className="labeler-review-task-row">
                    <div className="labeler-review-task-title">
                      <h3>{item.task_title}</h3>
                      <p>{reviewTaskDescription(item.status)}</p>
                    </div>
                    <div>
                      <span className={`review-task-status ${item.status}`}>{labelReviewTaskStatus(item.status)}</span>
                    </div>
                    <div className="labeler-review-task-stats">
                      <span>共 {stats.total} 题</span>
                      <span>待审核 {stats.submitted}</span>
                      <span>已通过 {stats.approved}</span>
                      <span>打回 {stats.rejected}</span>
                    </div>
                    <small>{item.updated_at ? formatDateTime(item.updated_at) : '-'}</small>
                    <div className="labeler-review-task-actions">
                      <button type="button" className="secondary-action" onClick={() => toggleTaskDetail(item.task_id)}>
                        {expanded ? <><ArrowLeftOutlined aria-hidden="true" /> 收起题目</> : <><EyeOutlined aria-hidden="true" /> 展开题目</>}
                      </button>
                    </div>
                  </div>
                  {expanded && (
                    <div className="labeler-review-question-list" aria-label={`${item.task_title} 题目明细`}>
                      {(item.questions ?? []).length ? (item.questions ?? []).map((question) => (
                        <div className="labeler-review-question-row" key={question.question_id}>
                          <div>
                            <strong>#{question.row_index + 1}</strong>
                            <span>{question.content_summary || `题目 #${question.row_index + 1}`}</span>
                          </div>
                          <div>
                            <span className={`review-question-status ${question.status}`}>{labelReviewTaskStatus(question.status)}</span>
                            <small>{question.updated_at ? formatDateTime(question.updated_at) : '-'}</small>
                          </div>
                        </div>
                      )) : (
                        <p className="labeler-review-question-empty">暂无题目明细</p>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <LabelerEmptyState title="暂无题目" description="完成任务并确认提交后，待审核和审核完毕的任务会显示在这里。" />
        )}
      </section>
    </main>
  );
}

function LabelerEmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="labeler-empty-state labeler-ant-empty-state">
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={<span className="labeler-empty-copy">{title}，{description}</span>}
      />
      {action}
    </div>
  );
}

function formatTaskCategory(category: string): string {
  const labels: Record<string, string> = { text: '文本', image: '图像', audio: '音频', multimodal: '多模态' };
  return labels[category] || category || '通用';
}

function formatTaskDifficulty(difficulty: string): string {
  const labels: Record<string, string> = { easy: '简单', medium: '中等', hard: '困难' };
  return labels[difficulty] || difficulty || '中等';
}

function formatDateTime(value: string): string {
  return formatApiDateTime(value, {}, value);
}

type LabelerContributionItem = LabelerContributionsPayload['recent_items'][number];

function groupContributionItemsByTask(items: LabelerContributionItem[]): LabelerContributionItem[] {
  const grouped = new Map<string, LabelerContributionItem>();
  for (const item of items) {
    const questionItems = normalizeContributionQuestions(item);
    const existing = grouped.get(item.task_id);
    if (!existing) {
      grouped.set(item.task_id, {
        ...item,
        submission_id: item.submission_id || `task:${item.task_id}`,
        question_id: '',
        row_index: null,
        questions: questionItems,
      });
      continue;
    }
    const mergedQuestions = mergeContributionQuestions(existing.questions ?? [], questionItems);
    grouped.set(item.task_id, {
      ...existing,
      status: mergeReviewTaskStatus(existing.status, item.status),
      submitted_at: earliestDate(existing.submitted_at, item.submitted_at),
      updated_at: latestDate(existing.updated_at, item.updated_at),
      questions: mergedQuestions,
      progress: mergeReviewProgress(existing.progress, item.progress, mergedQuestions),
      status_counts: mergeReviewCounts(existing.status_counts, item.status_counts, mergedQuestions),
    });
  }
  return Array.from(grouped.values()).map((item) => {
    const questions = item.questions ?? [];
    return {
      ...item,
      progress: item.progress && item.progress.total > 0 ? item.progress : progressFromContributionQuestions(questions),
      status_counts: item.status_counts && (item.status_counts.submitted + item.status_counts.approved + item.status_counts.rejected > 0)
        ? item.status_counts
        : countsFromContributionQuestions(questions),
    };
  });
}

function normalizeContributionQuestions(item: LabelerContributionItem): NonNullable<LabelerContributionItem['questions']> {
  if (item.questions?.length) return item.questions;
  if (!item.question_id) return [];
  return [{
    question_id: item.question_id,
    row_index: item.row_index ?? 0,
    status: item.status,
    question_status: item.status,
    content_summary: item.task_title,
    submitted_at: item.submitted_at ?? null,
    updated_at: item.updated_at ?? null,
  }];
}

function mergeContributionQuestions(
  current: NonNullable<LabelerContributionItem['questions']>,
  incoming: NonNullable<LabelerContributionItem['questions']>,
): NonNullable<LabelerContributionItem['questions']> {
  const byId = new Map<string, NonNullable<LabelerContributionItem['questions']>[number]>();
  for (const question of current) byId.set(question.question_id, question);
  for (const question of incoming) byId.set(question.question_id, question);
  return Array.from(byId.values()).sort((a, b) => a.row_index - b.row_index);
}

function mergeReviewTaskStatus(current: string, incoming: string): string {
  if (current === 'finished' || incoming === 'finished') return 'finished';
  if (current === 'rejected' || incoming === 'rejected') return 'rejected';
  if (current === 'submitted' || incoming === 'submitted') return 'submitted';
  if (current === 'approved' && incoming === 'approved') return 'approved';
  return current || incoming;
}

function mergeReviewProgress(
  current: LabelerContributionItem['progress'],
  incoming: LabelerContributionItem['progress'],
  questions: NonNullable<LabelerContributionItem['questions']>,
) {
  const currentTotal = current?.total ?? 0;
  const incomingTotal = incoming?.total ?? 0;
  if (currentTotal > 0 && incomingTotal > 0 && currentTotal === incomingTotal) return current;
  return progressFromContributionQuestions(questions);
}

function mergeReviewCounts(
  current: LabelerContributionItem['status_counts'],
  incoming: LabelerContributionItem['status_counts'],
  questions: NonNullable<LabelerContributionItem['questions']>,
) {
  const currentTotal = (current?.submitted ?? 0) + (current?.approved ?? 0) + (current?.rejected ?? 0);
  const incomingTotal = (incoming?.submitted ?? 0) + (incoming?.approved ?? 0) + (incoming?.rejected ?? 0);
  if (currentTotal > 0 && incomingTotal > 0 && currentTotal === incomingTotal) return current;
  return countsFromContributionQuestions(questions);
}

function progressFromContributionQuestions(questions: NonNullable<LabelerContributionItem['questions']>) {
  const total = questions.length;
  const submitted = questions.filter((question) => ['submitted', 'approved', 'rejected'].includes(question.status)).length;
  const rejected = questions.filter((question) => question.status === 'rejected').length;
  return {
    total,
    submitted,
    rejected,
    remaining: Math.max(total - submitted, 0),
    percent: total ? Math.round((submitted / total) * 100) : 0,
  };
}

function safeProgressPercent(value: unknown): number {
  const next = Number(value);
  if (!Number.isFinite(next)) return 0;
  return Math.max(0, Math.min(100, Math.round(next)));
}

function countsFromContributionQuestions(questions: NonNullable<LabelerContributionItem['questions']>) {
  return {
    submitted: questions.filter((question) => question.status === 'submitted').length,
    approved: questions.filter((question) => question.status === 'approved').length,
    rejected: questions.filter((question) => question.status === 'rejected').length,
  };
}

function latestDate(left?: string | null, right?: string | null): string | null {
  if (!left) return right ?? null;
  if (!right) return left;
  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}

function earliestDate(left?: string | null, right?: string | null): string | null {
  if (!left) return right ?? null;
  if (!right) return left;
  return new Date(left).getTime() <= new Date(right).getTime() ? left : right;
}

function getReviewTaskStats(item: LabelerContributionsPayload['recent_items'][number]) {
  const questionCount = item.questions?.length ?? 0;
  return {
    total: item.progress?.total || questionCount,
    submitted: item.status_counts?.submitted ?? item.questions?.filter((question) => question.status === 'submitted').length ?? 0,
    approved: item.status_counts?.approved ?? item.questions?.filter((question) => question.status === 'approved').length ?? 0,
    rejected: item.status_counts?.rejected ?? item.questions?.filter((question) => question.status === 'rejected').length ?? 0,
  };
}

function schemaHasLabelingAiAssist(schema?: TemplateSchemaPayload | null) {
  if (!schema) return false;
  return schema.tabs.some((tab) => tab.components.some((component) => component.type === 'LLMComponent'));
}

function schemaAnswerComponentsByField(schema?: TemplateSchemaPayload | null) {
  const entries = schema?.tabs
    .flatMap((tab) => tab.components)
    .filter((component) => !['ShowItem', 'LLMComponent', 'GroupContainer'].includes(component.type))
    .map((component) => [component.field, component] as const) ?? [];
  return new Map(entries);
}

function formatAiAssistAnswer(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item)).join('、') || '空';
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value ?? '空');
}

function labelReviewTaskStatus(status: string): string {
  if (status === 'finished') return '已结束';
  if (status === 'approved') return '已通过';
  if (status === 'rejected') return '未通过';
  if (status === 'submitted') return '待审核';
  return labelQuestionStatus(status, status);
}

function reviewTaskDescription(status: string): string {
  if (status === 'finished') return '任务已结束，历史题目记录保留。';
  if (status === 'approved') return '任务审核已通过。';
  if (status === 'rejected') return '任务未通过，请查看题目详情。';
  return '任务已提交，等待审核处理。';
}

function labelingOfflineDraftKey(questionId: string) {
  return `markup:labeling-offline-draft:${questionId}`;
}

function labelingOfflineDraftPayload(questionId: string, answers: Record<string, unknown>) {
  return JSON.stringify({ question_id: questionId, answers, saved_at: new Date().toISOString() });
}

function readLabelingOfflineDraft(questionId: string): { answers: Record<string, unknown>; saved_at?: string } | null {
  try {
    const raw = window.localStorage.getItem(labelingOfflineDraftKey(questionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { answers?: unknown; saved_at?: string };
    return parsed && typeof parsed.answers === 'object' && parsed.answers !== null
      ? { answers: parsed.answers as Record<string, unknown>, saved_at: parsed.saved_at }
      : null;
  } catch {
    return null;
  }
}

function LabelingPage({ initialTaskId, onComplete, onTaskFinished }: { initialTaskId?: string; onComplete?: () => void; onTaskFinished?: () => void }) {
  const [taskId, setTaskId] = useState(() => initialTaskId || window.localStorage.getItem('markup:lastLabelingTaskId') || '');
  const [pendingTaskId, setPendingTaskId] = useState(taskId);
  const [workbench, setWorkbench] = useState<LabelingWorkbenchPayload | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<LabelingQuestionPayload | null>(null);
  const [rejection, setRejection] = useState<LabelingRejectionPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<TemplateValidationPayload['field_errors']>([]);
  const [loading, setLoading] = useState(false);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const [aiAssisting, setAiAssisting] = useState(false);
  const [aiAssistResult, setAiAssistResult] = useState<LabelingAiAssistPayload | null>(null);
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
  const [aiCustomPrompt, setAiCustomPrompt] = useState('');
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [, setMessageState] = useState<string | null>(null);
  const [, setErrorState] = useState<string | null>(null);
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false);
  const [abandonConfirmOpen, setAbandonConfirmOpen] = useState(false);
  const [finishingTask, setFinishingTask] = useState(false);
  const [noticeApi, noticeContext] = notification.useNotification();
  const feedbackTimerRef = useRef<number | null>(null);
  const [invalidQuestionIds, setInvalidQuestionIds] = useState<Set<string>>(() => new Set());

  const schema = workbench?.template.schema;
  const activeQuestionId = currentQuestion?.question_id ?? workbench?.current_question.question_id ?? '';
  const questionItems = useMemo(() => workbench?.questions ?? [], [workbench?.questions]);
  const activeIndex = questionItems.findIndex((question) => question.question_id === activeQuestionId);
  const pendingQuestionIds = useMemo(() => new Set(questionItems
    .filter((question) => !isQuestionResolved(question.status, question.submission_status))
    .map((question) => question.question_id)), [questionItems]);
  const questionListCoversTask = workbench ? questionItems.length >= workbench.progress.total : questionItems.length > 0;
  const allQuestionsSubmitted = questionListCoversTask && questionItems.length > 0 && pendingQuestionIds.size === 0;
  const hasLabelingAiAssist = useMemo(() => schemaHasLabelingAiAssist(schema), [schema]);
  const answerComponentsByField = useMemo(() => schemaAnswerComponentsByField(schema), [schema]);
  const setMessage = useCallback((value: string | null, meta: LabelingNoticeMeta = {}) => {
    if (feedbackTimerRef.current) {
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
    setMessageState(value);
    if (value && meta.notify !== false) {
      showLabelerNotice(noticeApi, 'success', meta.title || value, meta.description);
    }
    if (value) {
      feedbackTimerRef.current = window.setTimeout(() => {
        setMessageState(null);
        feedbackTimerRef.current = null;
      }, 5000);
    }
  }, [noticeApi]);
  const setError = useCallback((value: string | null, meta: LabelingNoticeMeta = {}) => {
    if (feedbackTimerRef.current) {
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
    setErrorState(value);
    if (value && meta.notify !== false) {
      showLabelerNotice(noticeApi, 'error', meta.title || value, meta.description);
    }
    if (value) {
      feedbackTimerRef.current = window.setTimeout(() => {
        setErrorState(null);
        feedbackTimerRef.current = null;
      }, 5000);
    }
  }, [noticeApi]);
  const notifySuccess = useCallback((title: string, description?: string) => {
    showLabelerNotice(noticeApi, 'success', title, description);
  }, [noticeApi]);
  const notifyError = useCallback((title: string, description?: string) => {
    showLabelerNotice(noticeApi, 'error', title, description);
  }, [noticeApi]);

  useEffect(() => () => {
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
  }, []);

  useEffect(() => {
    if (!activeQuestionId || !dirty) return;
    try {
      window.localStorage.setItem(labelingOfflineDraftKey(activeQuestionId), labelingOfflineDraftPayload(activeQuestionId, answers));
    } catch {
      // Local fallback is best-effort only.
    }
  }, [activeQuestionId, answers, dirty]);

  useEffect(() => {
    if (!initialTaskId || initialTaskId === taskId) return;
    const timer = window.setTimeout(() => {
      setTaskId(initialTaskId);
      setPendingTaskId(initialTaskId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialTaskId, taskId]);

  const loadWorkbench = useCallback(async (nextTaskId: string) => {
    if (!nextTaskId.trim()) {
      setError('请输入已领取任务入口码。');
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const data = await getLabelingWorkbench(nextTaskId.trim());
      setWorkbench(data);
      setCurrentQuestion(data.current_question);
      setRejection(await loadRejectionIfNeeded(data.current_question));
      const localDraft = readLabelingOfflineDraft(data.current_question.question_id);
      setAnswers({ ...(localDraft?.answers || data.current_question.submission?.draft || data.current_question.submission?.answers || {}) });
      setFieldErrors([]);
      setInvalidQuestionIds(new Set());
      setAiAssistResult(null);
      setAiCustomPrompt('');
      setDirty(false);
      setLastSavedAt(data.current_question.submission?.updated_at ?? null);
      setTaskId(nextTaskId.trim());
      setPendingTaskId(nextTaskId.trim());
      window.localStorage.setItem('markup:lastLabelingTaskId', nextTaskId.trim());
      if (localDraft) {
        setDirty(true);
        setMessage('已恢复本地草稿。', { title: '已恢复本地草稿', description: '检测到上次离线或网络异常时保存的答案，请确认后保存或提交。' });
      }
    } catch (err) {
      setWorkbench(null);
      setCurrentQuestion(null);
      setError(err instanceof ApiClientError ? err.message : '标注工作台加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadQuestion = useCallback(async (questionId: string) => {
    if (!questionId || questionId === activeQuestionId) return;
    setQuestionLoading(true);
    setError(null);
    setMessage(null);
    try {
      const data = await getLabelingQuestion(questionId);
      setCurrentQuestion(data);
      setRejection(await loadRejectionIfNeeded(data));
      const localDraft = readLabelingOfflineDraft(questionId);
      setAnswers({ ...(localDraft?.answers || data.submission?.draft || data.submission?.answers || {}) });
      setFieldErrors([]);
      setAiAssistResult(null);
      setAiCustomPrompt('');
      setInvalidQuestionIds((current) => {
        if (!current.has(questionId)) return current;
        const next = new Set(current);
        next.delete(questionId);
        return next;
      });
      setDirty(false);
      setLastSavedAt(data.submission?.updated_at ?? null);
      if (localDraft) {
        setDirty(true);
        setMessage('已恢复本地草稿。', { title: '已恢复本地草稿', description: '检测到本题有未同步的本地答案，请确认后保存或提交。' });
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '题目加载失败');
    } finally {
      setQuestionLoading(false);
    }
  }, [activeQuestionId]);

  const saveDraft = useCallback(async (silent = false) => {
    if (!activeQuestionId || !dirty) return;
    setSaving(true);
    if (!silent) {
      setError(null);
      setMessage(null);
    }
    try {
      const saved = await saveLabelingDraft(activeQuestionId, answers);
      setDirty(false);
      setLastSavedAt(saved.updated_at ?? new Date().toISOString());
      window.localStorage.removeItem(labelingOfflineDraftKey(activeQuestionId));
      if (!silent) setMessage('草稿已保存。');
      setWorkbench((current) => updateWorkbenchQuestion(current, activeQuestionId, 'claimed', saved.status, saved.updated_at));
      setCurrentQuestion((current) => current ? { ...current, status: 'claimed', submission: saved } : current);
    } catch (err) {
      try {
        window.localStorage.setItem(labelingOfflineDraftKey(activeQuestionId), labelingOfflineDraftPayload(activeQuestionId, answers));
      } catch {
        // Local fallback is best-effort only.
      }
      if (!silent) setError(err instanceof ApiClientError ? err.message : '草稿保存失败', { title: '草稿暂未同步', description: '已尽量保存在本地，网络恢复后请再次保存。' });
    } finally {
      setSaving(false);
    }
  }, [activeQuestionId, answers, dirty]);

  const submitCurrent = async () => {
    if (!activeQuestionId) return;
    const submittedQuestionId = activeQuestionId;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const submitted = await submitLabelingQuestion(submittedQuestionId, answers);
      setDirty(false);
      window.localStorage.removeItem(labelingOfflineDraftKey(submittedQuestionId));
      setFieldErrors([]);
      setLastSavedAt(submitted.updated_at ?? submitted.submitted_at ?? new Date().toISOString());
      setWorkbench((current) => updateWorkbenchQuestion(current, submittedQuestionId, 'submitted', submitted.status, submitted.updated_at));
      setCurrentQuestion((current) => current ? { ...current, status: 'submitted', submission: submitted } : current);
      setInvalidQuestionIds((current) => {
        if (!current.has(submittedQuestionId)) return current;
        const next = new Set(current);
        next.delete(submittedQuestionId);
        return next;
      });
      setRejection(null);
      const isFinishingTask = questionListCoversTask && activeIndex >= 0 && pendingQuestionIds.size === 1 && pendingQuestionIds.has(submittedQuestionId);
      const nextEditableQuestion = questionItems.slice(activeIndex + 1).find((question) => question.question_id !== submittedQuestionId && isQuestionEditable(question.status, question.submission_status))
        ?? questionItems.find((question) => question.question_id !== submittedQuestionId && isQuestionEditable(question.status, question.submission_status));
      if (nextEditableQuestion) {
        await loadQuestion(nextEditableQuestion.question_id);
        setMessage('标注已提交，已自动进入下一题。');
      } else {
        setMessage(isFinishingTask ? '全部题目已提交，请点击完成返回我的任务。' : '标注已提交，等待后续 AI 预审或人工审核。');
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        const errors = extractTemplateFieldErrors(err.detail);
        setFieldErrors(errors);
        if (errors.length) {
          setInvalidQuestionIds((current) => new Set(current).add(submittedQuestionId));
        }
        setError(errors.length ? '答案校验未通过，请根据字段提示修改。' : err.message);
      } else {
        setError('提交失败，请稍后重试');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const runAiAssist = async (component?: TemplateComponentSchema) => {
    if (!activeQuestionId) return;
    if (aiAssistUsage.limit <= 0) {
      notifyError('AI 辅助暂不可用', '本任务当前没有可用的 AI 辅助额度。');
      return;
    }
    if (aiAssistUsage.remaining <= 0) {
      notifyError('AI 辅助次数已用尽', `本任务 AI 辅助额度为 ${aiAssistUsage.limit} 次，当前已全部使用。`);
      return;
    }
    if (!String(component?.config.provider_id || '').trim()) {
      notifyError('AI Provider 未选择', '请先让模板 Owner 在该 LLM 组件中选择 Provider。');
      return;
    }
    setAiAssisting(true);
    setError(null);
    setMessage(null);
    try {
      const componentPrompt = String(component?.config.prompt_hint || '').trim();
      const prompt = [componentPrompt ? `模板 AI 组件提示：${componentPrompt}` : '', aiCustomPrompt.trim()].filter(Boolean).join('\n\n');
      const result = await generateLabelingAiAssist(activeQuestionId, { prompt, component_id: component?.id });
      setAiAssistResult(result);
      if (result.assist_usage) {
        setWorkbench((current) => current ? {
          ...current,
          progress: {
            ...current.progress,
            ai_assist_percent: result.assist_usage?.percent ?? current.progress.ai_assist_percent,
            ai_assist_limit: result.assist_usage?.limit ?? current.progress.ai_assist_limit,
            ai_assist_used: result.assist_usage?.used ?? current.progress.ai_assist_used,
            ai_assist_remaining: result.assist_usage?.remaining ?? current.progress.ai_assist_remaining,
          },
        } : current);
      }
      setMessage(null);
      notifySuccess('AI 已生成参考建议', '请核对后选择应用到当前答案。');
    } catch (err) {
      const text = err instanceof ApiClientError ? err.message : 'AI 辅助生成失败，请稍后重试';
      setError(text);
      notifyError('AI 辅助生成失败', text);
    } finally {
      setAiAssisting(false);
    }
  };

  const applyAiAssistAnswers = (fields?: string[]) => {
    if (!aiAssistResult) return;
    const selectedFields = fields?.length ? fields : Object.keys(aiAssistResult.answers);
    const selectedSet = new Set(selectedFields);
    setAnswers((current) => {
      const next = { ...current };
      selectedFields.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(aiAssistResult.answers, field)) {
          next[field] = aiAssistResult.answers[field];
        }
      });
      return next;
    });
    setFieldErrors((current) => current.filter((item) => {
      const field = item.field ? String(item.field) : '';
      const componentId = item.component_id ? String(item.component_id) : '';
      return !selectedSet.has(field) && !selectedSet.has(componentId);
    }));
    setDirty(true);
    notifySuccess(fields?.length === 1 ? '已应用 AI 单项建议' : '已应用 AI 全部建议');
  };

  const completeTask = () => {
    if (pendingQuestionIds.size > 0) {
      setError('还有未提交题目，请先完成红色标记的题目。');
      return;
    }
    setFinishConfirmOpen(true);
  };

  const confirmAbandonQuestion = async () => {
    if (!activeQuestionId) return;
    const abandoningQuestionId = activeQuestionId;
    setAbandoning(true);
    setError(null);
    setMessage(null);
    try {
      const taskStillDistributing = workbench?.task.status === 'published';
      const abandoned = await abandonLabelingQuestion(abandoningQuestionId);
      const updatedQuestionItems = questionItems.map((question) => (
        question.question_id === abandoningQuestionId
          ? { ...question, status: 'abandoned', submission_status: 'abandoned', updated_at: abandoned.question.submission?.updated_at ?? question.updated_at }
          : question
      ));
      const updatedListCoversTask = workbench ? updatedQuestionItems.length >= abandoned.progress.total : updatedQuestionItems.length > 0;
      const updatedPendingQuestions = updatedQuestionItems.filter((question) => !isQuestionResolved(question.status, question.submission_status));
      const taskReadyToComplete = updatedListCoversTask && updatedQuestionItems.length > 0 && updatedPendingQuestions.length === 0;
      const nonAbandonedQuestions = [...updatedQuestionItems]
        .filter((question) => !isQuestionAbandoned(question.status, question.submission_status))
        .sort((a, b) => a.row_index - b.row_index);
      const lastNonAbandonedQuestion = nonAbandonedQuestions[nonAbandonedQuestions.length - 1];
      const abandonedIndex = updatedQuestionItems.findIndex((question) => question.question_id === abandoningQuestionId);
      const nextEditableQuestion = updatedQuestionItems.slice(Math.max(abandonedIndex + 1, 0)).find((question) => isQuestionEditable(question.status, question.submission_status))
        ?? updatedQuestionItems.find((question) => isQuestionEditable(question.status, question.submission_status));
      setAbandonConfirmOpen(false);
      setDirty(false);
      setFieldErrors([]);
      setRejection(null);
      setLastSavedAt(abandoned.question.submission?.updated_at ?? new Date().toISOString());
      setWorkbench((current) => {
        if (!current) return current;
        const updated = updateWorkbenchQuestion(current, activeQuestionId, 'abandoned', 'abandoned', abandoned.question.submission?.updated_at);
        if (!updated) return current;
        return {
          ...updated,
          progress: abandoned.progress,
        };
      });
      setCurrentQuestion(abandoned.question);
      setInvalidQuestionIds((current) => {
        if (!current.has(abandoningQuestionId)) return current;
        const next = new Set(current);
        next.delete(abandoningQuestionId);
        return next;
      });
      if (taskReadyToComplete && !lastNonAbandonedQuestion) {
        setTaskId('');
        setPendingTaskId('');
        setWorkbench(null);
        setCurrentQuestion(null);
        window.localStorage.removeItem('markup:lastLabelingTaskId');
        onComplete?.();
        return;
      }
      if (taskReadyToComplete && lastNonAbandonedQuestion && lastNonAbandonedQuestion.question_id !== abandoningQuestionId) {
        await loadQuestion(lastNonAbandonedQuestion.question_id);
        setMessage('题目已放弃', { description: '其余题目已处理完成，请点击完成提交任务。' });
        return;
      }
      if (nextEditableQuestion && nextEditableQuestion.question_id !== abandoningQuestionId) {
        await loadQuestion(nextEditableQuestion.question_id);
        setMessage('题目已放弃', { description: '已自动进入下一道可编辑题目。' });
        return;
      }
      setMessage('题目已放弃', { description: taskStillDistributing ? '题目已重新回到任务广场。' : '任务已停止发放，该题目不会再回到任务广场。' });
    } catch (err) {
      const text = err instanceof ApiClientError ? err.message : '放弃题目失败，请稍后重试';
      setError(text, { title: '放弃题目失败' });
    } finally {
      setAbandoning(false);
    }
  };

  const confirmTaskFinished = async () => {
    if (!taskId) return;
    setFinishingTask(true);
    setError(null);
    try {
      await completeLabelingTask(taskId);
      setFinishConfirmOpen(false);
      setTaskId('');
      setPendingTaskId('');
      setWorkbench(null);
      setCurrentQuestion(null);
      window.localStorage.removeItem('markup:lastLabelingTaskId');
      onTaskFinished?.();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '任务提交失败，请稍后重试');
    } finally {
      setFinishingTask(false);
    }
  };

  const goSiblingQuestion = (offset: number) => {
    const target = questionItems[activeIndex + offset];
    if (target) void loadQuestion(target.question_id);
  };

  useEffect(() => {
    if (!taskId) return undefined;
    const timer = window.setTimeout(() => {
      void loadWorkbench(taskId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadWorkbench, taskId]);

  useEffect(() => {
    if (!dirty || !activeQuestionId) return undefined;
    const timer = window.setInterval(() => {
      void saveDraft(true);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [activeQuestionId, dirty, saveDraft]);

  const currentStatus = currentQuestion?.status ?? 'idle';
  const isRejectedQuestion = currentQuestion?.status === 'rejected' || currentQuestion?.submission?.status === 'rejected';
  const isAbandonedQuestion = currentQuestion?.status === 'abandoned' || currentQuestion?.submission?.status === 'abandoned';
  const isCurrentQuestionLocked = isQuestionLocked(currentQuestion?.status ?? '', currentQuestion?.submission?.status);
  const abandonLimit = workbench ? effectiveAbandonLimit(workbench) : 0;
  const abandonUsed = workbench?.progress.abandon_used ?? workbench?.progress.abandoned ?? questionItems.filter((question) => isQuestionAbandoned(question.status, question.submission_status)).length;
  const freeAbandonRemaining = Math.max(abandonLimit - abandonUsed, 0);
  const aiAssistUsage = {
    percent: workbench?.progress.ai_assist_percent ?? 5,
    limit: workbench?.progress.ai_assist_limit ?? 0,
    used: workbench?.progress.ai_assist_used ?? 0,
    remaining: workbench?.progress.ai_assist_remaining ?? 0,
  };
  const aiAssistRequestDisabled = saving || submitting || abandoning || isAbandonedQuestion || isCurrentQuestionLocked;
  const aiAssistApplyDisabled = saving || submitting || abandoning || isAbandonedQuestion || isCurrentQuestionLocked;
  const aiAssistDisabledReason = aiAssistUsage.limit <= 0
    ? '本任务当前没有可用的 AI 辅助额度'
    : aiAssistUsage.remaining <= 0
      ? 'AI 辅助次数已用尽'
      : isCurrentQuestionLocked
        ? '当前题目已锁定'
        : isAbandonedQuestion
          ? '已放弃题目不能继续使用 AI 辅助'
          : undefined;
  const aiAssistAnswerEntries = Object.entries(aiAssistResult?.answers ?? {});
  const canAbandonCurrentQuestion = !isCurrentQuestionLocked && !isAbandonedQuestion;
  const abandonWillDeductReputation = freeAbandonRemaining <= 0 && !isAbandonedQuestion;
  const timelineItems = useMemo(() => buildLabelingTimeline(workbench, currentQuestion, rejection), [currentQuestion, rejection, workbench]);
  const autosaveText = useMemo(() => {
    if (saving) return '正在保存...';
    if (dirty) return '有未保存修改';
    if (lastSavedAt) return `已保存 ${formatApiTime(lastSavedAt)}`;
    return '尚未保存草稿';
  }, [dirty, lastSavedAt, saving]);

  return (
    <main className="workspace-content labeling-workbench-page">
      {noticeContext}
      <section className="page-heading">
        <div>
          <p className="section-kicker">Labeling</p>
          <h1>标注页面</h1>
          <p>打开已领取任务并完成标注。</p>
        </div>
        <div className="labeling-task-loader" role="search" aria-label="加载标注任务">
          <button type="button" className="secondary-action labeling-back-action" onClick={onComplete}>
            <ArrowLeftOutlined aria-hidden="true" /> 返回我的任务
          </button>
          <input value={pendingTaskId} onChange={(event) => setPendingTaskId(event.target.value)} placeholder="输入已领取任务入口码" aria-label="已领取任务入口码" />
          <button type="button" className="primary-action" disabled={loading || pendingTaskId.trim().length === 0} onClick={() => void loadWorkbench(pendingTaskId)}>
            {loading ? <><ReloadOutlined aria-hidden="true" /> 加载中...</> : <><FileSearchOutlined aria-hidden="true" /> 打开任务</>}
          </button>
        </div>
      </section>

      {!workbench || !currentQuestion || !schema ? (
        <>
        <section className="dashboard-placeholder">
          <div>
            <h2>{loading ? '正在加载标注工作台' : '打开一个已领取任务'}</h2>
            <p>从我的任务进入会自动打开；也可输入任务入口码作为兜底。</p>
          </div>
        </section>
        </>
      ) : (
        <section className="labeling-triage-shell" aria-label="标注工作区">
          <aside className="labeling-side-panel labeling-question-panel">
            <div className="labeling-side-head">
              <span className={`status-tag ${isAbandonedQuestion ? 'neutral' : 'info'}`}>{labelQuestionStatus(currentStatus, currentQuestion.submission?.status)}</span>
              <h2>{workbench.task.title}</h2>
              <p>题目 #{currentQuestion.row_index + 1} · 模板版本 {workbench.template.version} · {autosaveText}</p>
            </div>
            <div className="labeling-progress-card">
              <div>
                <strong>{workbench.progress.submitted}/{workbench.progress.total}</strong>
                <p>剩余 {workbench.progress.remaining} · 打回 {workbench.progress.rejected}</p>
              </div>
              <Progress className="labeling-progress-ant" percent={safeProgressPercent(workbench.progress.percent)} showInfo={false} size="small" strokeColor="var(--ws-labeling)" trailColor="var(--ws-line)" aria-label={`标注进度 ${safeProgressPercent(workbench.progress.percent)}%`} />
              <span className="labeling-abandon-quota">免扣信誉分放弃 {freeAbandonRemaining}/{abandonLimit} 题</span>
              {hasLabelingAiAssist && (
                <span className={`labeling-ai-quota ${aiAssistUsage.remaining <= 0 ? 'is-empty' : ''}`}>
                  AI 辅助剩余 {aiAssistUsage.remaining}/{aiAssistUsage.limit} 次
                  <small>按领取题数 {aiAssistUsage.percent}% 向上取整</small>
                </span>
              )}
            </div>
            <div className="labeling-question-list vertical">
              {questionItems.map((question) => (
                <button
                  type="button"
                  key={question.question_id}
                  className={[
                    question.question_id === activeQuestionId ? 'active' : '',
                    isQuestionComplete(question.status, question.submission_status) ? 'submitted' : '',
                    isQuestionAbandoned(question.status, question.submission_status) ? 'abandoned' : '',
                    isQuestionRejected(question.status, question.submission_status) ? 'rejected' : '',
                    invalidQuestionIds.has(question.question_id) ? 'invalid' : '',
                  ].filter(Boolean).join(' ')}
                  disabled={questionLoading}
                  onClick={() => void loadQuestion(question.question_id)}
                >
                  <FileSearchOutlined aria-hidden="true" />
                  <strong>#{question.row_index + 1}</strong>
                  <span>{labelQuestionStatus(question.status, question.submission_status)}</span>
                </button>
              ))}
            </div>
          </aside>

          <section className="labeling-center-panel">
          <div className="annotation-card live-annotation-card">
            {isRejectedQuestion && (
              <div className="rejection-review-panel" role="status" aria-label="打回详情">
                <div>
                  <span className="status-tag danger">{rejection?.latest?.decision === 'revise' ? '要求修改' : '已打回'}</span>
                  <h3>上一轮审核意见</h3>
                </div>
                <p>{rejection?.latest?.comment || '审核员未留下具体说明，请按任务要求重新检查答案。'}</p>
                <small>
                  {rejection?.latest?.reviewer_id ? `审核员 ${rejection.latest.reviewer_id}` : '审核员'}
                  {rejection?.latest?.created_at ? ` · ${formatApiDateTime(rejection.latest.created_at)}` : ''}
                  {rejection?.current_round ? ` · 第 ${rejection.current_round} 轮` : ''}
                </small>
              </div>
            )}

            {isAbandonedQuestion && (
              <div className="rejection-review-panel abandoned-panel" role="status" aria-label="放弃状态">
                <div>
                  <span className="status-tag neutral">已放弃</span>
                  <h3>该题目已放弃</h3>
                </div>
                <p>放弃后此题不会产生积分，也不能继续编辑；{workbench?.task.status === 'published' ? '题目已重新回到任务广场等待其他批注员领取。' : '任务已停止发放，该题目不会再回到任务广场。'}</p>
              </div>
            )}

            <TemplateRenderer
              schema={schema}
              content={currentQuestion.content}
              answers={answers}
              errors={fieldErrors}
              readonly={isAbandonedQuestion}
              componentBindings={workbench?.task.component_bindings}
              hideAiComponent={false}
              aiAssistLoading={aiAssisting}
              aiAssistDisabled={aiAssistRequestDisabled}
              aiAssistDisabledReason={aiAssistDisabledReason}
              onAiAssistRequest={(component) => void runAiAssist(component)}
              onAnswerChange={(field, value) => {
                if (isAbandonedQuestion) return;
                setAnswers((current) => ({ ...current, [field]: value }));
                setDirty(true);
                setFieldErrors((current) => current.filter((item) => item.field !== field && item.component_id !== field));
              }}
            />

            {hasLabelingAiAssist && (
              <Card
                className="labeling-ai-assist-card"
                size="small"
                title={<Space size={8}><Tag color="blue">AI</Tag><span>AI 建议结果</span></Space>}
                extra={(
                  <Space size={8}>
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => setAiPromptOpen((value) => !value)}
                    >
                      自定义提示
                    </Button>
                    <Button
                      size="small"
                      disabled={!aiAssistAnswerEntries.length || aiAssistApplyDisabled}
                      icon={<CheckOutlined />}
                      onClick={() => applyAiAssistAnswers()}
                    >
                      应用全部
                    </Button>
                  </Space>
                )}
              >
                {aiPromptOpen && (
                  <div className="labeling-ai-custom-prompt">
                    <Input.TextArea
                      value={aiCustomPrompt}
                      onChange={(event) => setAiCustomPrompt(event.target.value)}
                      maxLength={2000}
                      showCount
                      rows={4}
                      placeholder="输入给大模型的额外要求，例如：重点分析视频前 10 秒、只判断图片中红圈区域、按更保守标准输出。"
                    />
                  </div>
                )}
                <p className="labeling-ai-assist-summary">
                  {aiAssistResult ? aiAssistResult.explanation : (aiAssistDisabledReason ? `AI 辅助入口已按模板显示在题目中。${aiAssistDisabledReason}。` : 'AI 辅助入口已按模板显示在题目中；生成后可在这里核对并应用建议，不会自动修改当前答案。')}
                </p>
                {aiAssistResult && (
                  <>
                    {aiAssistAnswerEntries.length ? (
                      <Descriptions
                        className="labeling-ai-answer-descriptions"
                        size="small"
                        column={1}
                        bordered
                        items={aiAssistAnswerEntries.map(([field, value]) => {
                          const component = answerComponentsByField.get(field);
                          return {
                            key: field,
                            label: (
                              <span className="labeling-ai-answer-label">
                                <strong>{component?.label || field}</strong>
                                {component?.label && <small>{field}</small>}
                              </span>
                            ),
                            children: (
                              <div className="labeling-ai-answer-note">
                                <strong>{formatAiAssistAnswer(value)}</strong>
                                {aiAssistResult.field_explanations[field] && <span>{aiAssistResult.field_explanations[field]}</span>}
                                <Button
                                  size="small"
                                  type="link"
                                  icon={<CheckOutlined />}
                                  disabled={aiAssistApplyDisabled}
                                  onClick={() => applyAiAssistAnswers([field])}
                                >
                                  应用此项
                                </Button>
                              </div>
                            ),
                          };
                        })}
                      />
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="AI 未返回可应用的答案字段" />
                    )}
                    {Boolean(aiAssistResult.annotated_images?.length) && (
                      <div className="labeling-ai-annotated-images">
                        {aiAssistResult.annotated_images?.map((image) => (
                          <figure key={image.source_id}>
                            <img src={image.annotated_url} alt={image.label} />
                            <figcaption>{image.label}</figcaption>
                          </figure>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </Card>
            )}

            <div className="annotation-actions">
              <button type="button" className="secondary-action" disabled={activeIndex <= 0 || questionLoading} onClick={() => goSiblingQuestion(-1)}><ArrowLeftOutlined aria-hidden="true" /> 上一题</button>
              <button type="button" className="secondary-action" disabled={activeIndex < 0 || activeIndex >= questionItems.length - 1 || questionLoading} onClick={() => goSiblingQuestion(1)}><ArrowRightOutlined aria-hidden="true" /> 下一题</button>
              <span className="annotation-action-spacer" aria-hidden="true" />
              <button type="button" className="secondary-action" disabled={saving || submitting || abandoning || isAbandonedQuestion || !dirty} onClick={() => void saveDraft(false)}>
                {saving ? <><ReloadOutlined aria-hidden="true" /> 保存中...</> : <><SaveOutlined aria-hidden="true" /> 保存草稿</>}
              </button>
              <button
                type="button"
                className="secondary-action danger-action"
                disabled={saving || submitting || abandoning || !canAbandonCurrentQuestion}
                onClick={() => setAbandonConfirmOpen(true)}
              >
                {abandoning ? <><ReloadOutlined aria-hidden="true" /> 放弃中...</> : <><StopOutlined aria-hidden="true" /> 放弃题目</>}
              </button>
              <button
                type="button"
                className="primary-action"
                disabled={saving || submitting || abandoning || isAbandonedQuestion || (isCurrentQuestionLocked && !allQuestionsSubmitted)}
                onClick={() => allQuestionsSubmitted ? completeTask() : void submitCurrent()}
              >
                {allQuestionsSubmitted ? <><CheckOutlined aria-hidden="true" /> 完成</> : isCurrentQuestionLocked ? <><CheckOutlined aria-hidden="true" /> 已提交</> : submitting ? <><ReloadOutlined aria-hidden="true" /> 提交中...</> : isRejectedQuestion ? <><SendOutlined aria-hidden="true" /> 重新提交</> : <><SendOutlined aria-hidden="true" /> 提交标注</>}
              </button>
            </div>
          </div>
          </section>

          <aside className="labeling-side-panel labeling-timeline-panel">
            <div className="labeling-side-head">
              <span className="status-tag info">时间线</span>
              <h2>当前任务时间线</h2>
              <p>跟踪本题提交、AI 预审与人工审核状态。</p>
            </div>
            <Timeline
              className="labeling-task-timeline"
              items={timelineItems.map((item) => ({
                color: item.color,
                children: (
                  <div className="labeling-timeline-item">
                    <strong>{item.title}</strong>
                    {item.time && <span>{formatDateTime(item.time)}</span>}
                    {item.description && <p>{item.description}</p>}
                  </div>
                ),
              }))}
            />
          </aside>
        </section>
      )}
      {finishConfirmOpen && (
        <div className="labeling-confirm-backdrop" role="presentation">
          <div className="labeling-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="labeling-finish-title">
            <h2 id="labeling-finish-title">确认提交任务</h2>
            <p>点击完成后，任务将进入待审核状态，是否确认提交？</p>
            <div className="inline-actions">
              <button type="button" className="secondary-action" disabled={finishingTask} onClick={() => setFinishConfirmOpen(false)}><CloseCircleOutlined aria-hidden="true" /> 取消</button>
              <button type="button" className="primary-action" disabled={finishingTask} onClick={() => void confirmTaskFinished()}>{finishingTask ? <><ReloadOutlined aria-hidden="true" /> 提交中...</> : <><CheckOutlined aria-hidden="true" /> 确认提交</>}</button>
            </div>
          </div>
        </div>
      )}
      {abandonConfirmOpen && (
        <div className="labeling-confirm-backdrop" role="presentation">
          <div className="labeling-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="labeling-abandon-title">
            <h2 id="labeling-abandon-title">确认放弃题目</h2>
            <p>放弃后将无法获得该题积分，也不能再编辑此题；{workbench?.task.status === 'published' ? '题目会重新进入任务广场。' : '任务已停止发放，该题目不会再回到任务广场。'}</p>
            <p>{abandonWillDeductReputation ? '本次已超过免扣信誉分放弃次数，确认后将扣除 5 点信誉分。' : '免扣信誉分次数用完后继续放弃，每道题会扣除 5 点信誉分。'}</p>
            <div className="inline-actions">
              <button type="button" className="secondary-action" disabled={abandoning} onClick={() => setAbandonConfirmOpen(false)}><CloseCircleOutlined aria-hidden="true" /> 取消</button>
              <button type="button" className="primary-action danger-primary-action" disabled={abandoning} onClick={() => void confirmAbandonQuestion()}>{abandoning ? <><ReloadOutlined aria-hidden="true" /> 放弃中...</> : <><StopOutlined aria-hidden="true" /> 确认放弃</>}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function extractTemplateFieldErrors(detail: unknown): TemplateValidationPayload['field_errors'] {
  if (!detail || typeof detail !== 'object' || !('field_errors' in detail)) return [];
  const errors = (detail as { field_errors?: unknown }).field_errors;
  if (!Array.isArray(errors)) return [];
  return errors.filter((item): item is TemplateValidationPayload['field_errors'][number] => Boolean(item && typeof item === 'object' && 'message' in item));
}

async function loadRejectionIfNeeded(question: LabelingQuestionPayload): Promise<LabelingRejectionPayload | null> {
  if (question.status !== 'rejected' && question.submission?.status !== 'rejected') return null;
  try {
    return await getLabelingRejection(question.question_id);
  } catch {
    return null;
  }
}

function buildLabelingTimeline(
  workbench: LabelingWorkbenchPayload | null,
  question: LabelingQuestionPayload | null,
  rejection: LabelingRejectionPayload | null,
): Array<{ title: string; description?: string | null; time?: string | null; color: string }> {
  if (!workbench || !question) {
    return [{ title: '等待加载任务', description: '打开任务后展示当前题目的流转记录。', color: 'gray' }];
  }
  if (workbench.timeline?.length) {
    return workbench.timeline.map((item) => ({
      title: item.title,
      description: item.description,
      time: item.time,
      color: item.status === 'error' ? 'red' : item.status === 'finish' ? 'green' : item.status === 'wait' ? 'gray' : 'blue',
    }));
  }
  const submission = question.submission;
  const items: Array<{ title: string; description?: string | null; time?: string | null; color: string }> = [
    {
      title: '题目已领取',
      description: `进入任务「${workbench.task.title}」的批注流程。`,
      time: question.created_at ?? question.updated_at,
      color: 'green',
    },
  ];
  if (submission?.submitted_at) {
    items.push({
      title: '任务已提交',
      description: `第 ${submission.current_round || 1} 轮提交，等待预审或人工审核。`,
      time: submission.submitted_at,
      color: 'blue',
    });
    items.push({
      title: 'AI 预审',
      description: '若发布方开启 AI 预审，提交后会先生成建议结果，再进入人工审核。',
      time: submission.submitted_at,
      color: 'purple',
    });
  } else if (submission?.status === 'draft') {
    items.push({
      title: '草稿已保存',
      description: '当前答案仍可继续编辑和提交。',
      time: submission.updated_at,
      color: 'blue',
    });
  }
  if (rejection?.history?.length) {
    [...rejection.history].reverse().forEach((item, index) => {
      items.push({
        title: `第 ${item.round ?? index + 1} 次被打回`,
        description: item.comment || '审核员要求修改后重新提交。',
        time: item.created_at,
        color: 'red',
      });
    });
  } else if (submission?.status === 'submitted') {
    items.push({
      title: '待人工审核',
      description: '审核员将根据任务规则处理当前提交。',
      time: submission.updated_at,
      color: 'blue',
    });
  }
  if (submission?.status === 'approved') {
    items.push({ title: '审核通过', description: '题目已通过审核，可等待积分结算。', time: submission.updated_at, color: 'green' });
  }
  if (submission?.status === 'abandoned') {
    items.push({ title: '题目已放弃', description: '当前批注员不能继续编辑；任务仍开放时才会重新流转。', time: submission.abandoned_at ?? submission.updated_at, color: 'gray' });
  }
  return items;
}

function updateWorkbenchQuestion(workbench: LabelingWorkbenchPayload | null, questionId: string, status: string, submissionStatus?: string, updatedAt?: string | null): LabelingWorkbenchPayload | null {
  if (!workbench) return workbench;
  const questions = workbench.questions.map((question) => (
    question.question_id === questionId ? { ...question, status, submission_status: submissionStatus, updated_at: updatedAt ?? question.updated_at } : question
  ));
  const submitted = questions.filter((question) => isQuestionComplete(question.status, question.submission_status)).length;
  const rejected = questions.filter((question) => isQuestionRejected(question.status, question.submission_status)).length;
  const abandoned = questions.filter((question) => isQuestionAbandoned(question.status, question.submission_status)).length;
  return {
    ...workbench,
    questions,
    progress: {
      ...workbench.progress,
      submitted,
      rejected,
      abandoned,
      remaining: Math.max(questions.length - submitted - abandoned, 0),
      percent: questions.length ? Math.round((submitted / questions.length) * 100) : 0,
      abandon_used: abandoned,
      abandon_remaining: Math.max((workbench.progress.abandon_limit ?? 0) - abandoned, 0),
    },
  };
}

function isQuestionComplete(status: string, submissionStatus?: string | null): boolean {
  return submissionStatus === 'submitted' || submissionStatus === 'approved' || status === 'submitted' || status === 'approved';
}

function isQuestionResolved(status: string, submissionStatus?: string | null): boolean {
  return isQuestionComplete(status, submissionStatus) || isQuestionAbandoned(status, submissionStatus);
}

function effectiveAbandonLimit(workbench: LabelingWorkbenchPayload): number {
  const backendLimit = workbench.progress.abandon_limit;
  if (typeof backendLimit === 'number' && backendLimit > 0) return backendLimit;
  const total = workbench.progress.total || workbench.questions.length;
  if (total <= 0) return 0;
  const difficulty = normalizeTaskDifficulty(workbench.task.difficulty);
  const rate = difficulty === 'easy' ? 0.02 : difficulty === 'hard' ? 0.1 : 0.05;
  return Math.max(1, Math.ceil(total * rate));
}

function normalizeTaskDifficulty(value: string): 'easy' | 'medium' | 'hard' {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'easy' || normalized === 'simple' || normalized === 'low' || value === '简单') return 'easy';
  if (normalized === 'hard' || normalized === 'difficult' || value === '困难') return 'hard';
  return 'medium';
}

function isQuestionEditable(status: string, submissionStatus?: string | null): boolean {
  if (isQuestionAbandoned(status, submissionStatus)) return false;
  return submissionStatus === 'rejected' || status === 'rejected' || submissionStatus === 'draft' || status === 'claimed';
}

function isQuestionLocked(status: string, submissionStatus?: string | null): boolean {
  return isQuestionAbandoned(status, submissionStatus) || (isQuestionComplete(status, submissionStatus) && submissionStatus !== 'rejected' && status !== 'rejected');
}

function isQuestionRejected(status: string, submissionStatus?: string | null): boolean {
  return submissionStatus === 'rejected' || status === 'rejected';
}

function isQuestionAbandoned(status: string, submissionStatus?: string | null): boolean {
  return submissionStatus === 'abandoned' || status === 'abandoned';
}

function labelQuestionStatus(status: string, submissionStatus?: string | null): string {
  if (submissionStatus === 'abandoned' || status === 'abandoned') return '已放弃';
  if (submissionStatus === 'submitted' || status === 'submitted') return '已提交';
  if (submissionStatus === 'approved' || status === 'approved') return '已通过';
  if (submissionStatus === 'rejected' || status === 'rejected') return '已打回';
  if (submissionStatus === 'draft') return '草稿';
  if (status === 'claimed') return '待标注';
  return status || '未开始';
}
