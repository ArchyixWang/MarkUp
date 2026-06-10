import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App,
  Avatar,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Dropdown,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Segmented,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Upload,
} from 'antd';
import type { InputRef } from 'antd/es/input';
import type { ColumnsType } from 'antd/es/table';
import {
  ApiOutlined,
  AlipayCircleOutlined,
  BankOutlined,
  CloudServerOutlined,
  CheckCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  InfoCircleOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  QrcodeOutlined,
  ReloadOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  UploadOutlined,
  WalletOutlined,
  WechatOutlined,
} from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import ExcelJS from 'exceljs';
import { ApiClientError } from '../../services/apiClient';
import { sendEmailCode } from '../../services/authService';
import {
  changeTeamPointsPaymentPassword,
  createAiProviderConfig,
  deleteAiProviderConfig,
  duplicateAiProviderConfig,
  estimateAiCost,
  getAdminOverview,
  getAgentSettings,
  getTeamAiWallet,
  getAiCostReport,
  getTeamMembership,
  getTeamPointsBudget,
  getTeamPointsPaymentPasswordStatus,
  getTeamPointsWalletLedger,
  listTeamAiHistory,
  listAiProviderConfigs,
  rechargeTeamPointsBudget,
  resetTeamPointsPaymentPassword,
  cancelTeamMembershipScheduledChange,
  setAiProviderConfigStatus,
  setTeamPointsBudgetAlert,
  setTeamPointsPaymentPassword,
  testDraftAiProviderConfig,
  testAiProviderConfig,
  subscribeTeamMembership,
  updateAgentSettings,
  updateAiProviderConfig,
  uploadTeamAgentAvatar,
  transferTeamPointsToAiWallet,
  withdrawTeamPointsBudget,
} from '../../services/workspaceService';
import { apiDateTimeValue, formatApiDateTime } from '../../utils/dateTime';
import { getStoredSession } from '../../stores/authStore';
import type {
  AgentSettingsPayload,
  AiCostReportPayload,
  AiProviderConfigPayload,
  RechargeTeamPointsBudgetRequest,
  TeamAiHistoryItem,
  TeamAiWalletPayload,
  TeamDetail,
  TeamMembershipPayload,
  TeamMembershipPlanOption,
  TeamMembershipSubscribeRequest,
  TeamPointsBudgetPayload,
  TeamPointsPaymentPasswordStatusPayload,
  TeamPointsWalletLedgerItem,
  WithdrawTeamPointsBudgetRequest,
} from '../../types/api';
import type { OperationLogFilters } from './OperationLogsPage';
import { WorkspaceLoading } from './WorkspaceLoading';
import { workspacePopupContainer } from './workspaceListHelpers';
import { formatShortId } from './workspaceDisplay';
import { EnhancedTable } from '../../components/ui/EnhancedTable';
import {
  applyProviderKindDefaults,
  buildProviderApiBase,
  buildProviderCapabilityProfile,
  buildProviderFormValuesFromConfig,
  buildProviderRuntimeConfig,
  formatProviderPricingSummary,
  getProviderCapabilityLabel,
  getProviderDisplayName,
  getProviderInitialValues,
  getProviderKind,
  getProviderModelId,
  getProviderModelPlaceholder,
  getProviderOptionMeta,
  getProviderRouteName,
  getProviderTestStatusLabel,
  maskStoredApiKey,
  providerCapabilityOptions,
  providerFormGridStyle,
  providerKindOptions,
  providerStatusColors,
  renderProviderAccessFields,
  renderProviderProtocolFields,
  renderProviderRuntimeDetails,
  syncProviderProtocolDraft,
  type ProviderFormValues,
} from '../../features/ai/providerConfigShared';

type TabKey = 'membership' | 'points' | 'ai-overview' | 'providers';
type PaymentMethod = RechargeTeamPointsBudgetRequest['payment_method'];
type RechargeStep = 'method' | 'amount' | 'confirm';
type AiRechargeStep = 'amount' | 'confirm';
type WithdrawMethod = WithdrawTeamPointsBudgetRequest['payout_method'];
type PaymentPasswordMode = 'set' | 'change' | 'reset';
type LedgerExportFormat = 'csv' | 'excel' | 'json';
type ProviderViewMode = 'team' | 'platform';

const AGENT_AVATAR_ACCEPT = 'image/jpeg,image/png,image/gif';

type LedgerFilters = {
  transactionType: 'all' | string;
  paymentMethod: 'all' | string;
  status: 'all' | string;
  keyword: string;
  dateRange: [Dayjs | null, Dayjs | null] | null;
};

type RechargeFormValues = {
  amount?: string;
  payment_method?: PaymentMethod;
};

type AlertFormValues = {
  enabled: boolean;
  threshold?: string;
};

type MembershipFormValues = {
  payment_password?: string;
};

type AiWalletRechargeFormValues = {
  amount?: string;
  payment_password?: string;
};

type WithdrawFormValues = {
  amount?: string;
  payout_method: WithdrawMethod;
  account_name?: string;
  account_no: string;
  bank_name?: string;
  note?: string;
  payment_password: string;
};

type PaymentPasswordFormValues = {
  current_password?: string;
  new_password?: string;
  confirm_password?: string;
  email?: string;
  email_code?: string;
};

type EstimateFormValues = {
  provider_id: string;
  prompt_chars?: string;
  completion_chars?: string;
  cache_hit_chars?: string;
};

type AgentFormValues = {
  display_name: string;
  avatar: string;
  preset_avatar_key?: string;
};

type MethodOption<T extends string> = {
  value: T;
  label: string;
  intro: string;
  icon: typeof WechatOutlined;
};

type LightweightDateRange = [Dayjs | null, Dayjs | null] | null;

const MAX_POINTS_INPUT = 9_000_000_000_000_000;
const MAX_INPUT_LENGTH = 16;

const paymentMethodOptions: Array<MethodOption<PaymentMethod>> = [
  {
    value: 'wechat',
    label: '微信支付',
    icon: WechatOutlined,
    intro: '适合快速充值，展示扫码支付流程。',
  },
  {
    value: 'alipay',
    label: '支付宝',
    icon: AlipayCircleOutlined,
    intro: '适合线上快捷支付，展示支付摘要。',
  },
  {
    value: 'bank_transfer',
    label: '对公转账',
    icon: BankOutlined,
    intro: '适合企业财务转账，展示收款账户与附言。',
  },
];

const withdrawMethodOptions: Array<MethodOption<WithdrawMethod>> = [
  {
    value: 'wechat',
    label: '微信提现',
    icon: WechatOutlined,
    intro: '仅维护收款账号。',
  },
  {
    value: 'alipay',
    label: '支付宝提现',
    icon: AlipayCircleOutlined,
    intro: '仅维护收款账号。',
  },
  {
    value: 'bank_transfer',
    label: '对公转账',
    icon: BankOutlined,
    intro: '维护户名、账号与开户行。',
  },
];

const bankTransferDetails = {
  companyName: 'MarkUp 数据标注平台有限公司',
  bankName: '招商银行上海张江支行',
  accountName: 'MarkUp 数据标注平台有限公司',
  accountNumber: '1109 2233 4455 6677',
  remarkPrefix: 'MARKUP-POINTS',
};

const summaryToneStyles: Record<string, { borderColor: string; background: string }> = {
  wallet: { borderColor: 'rgba(5, 5, 5, 0.08)', background: '#ffffff' },
  warning: { borderColor: 'rgba(5, 5, 5, 0.08)', background: '#ffffff' },
  danger: { borderColor: 'rgba(5, 5, 5, 0.08)', background: '#ffffff' },
  success: { borderColor: 'rgba(5, 5, 5, 0.08)', background: '#ffffff' },
  ai: { borderColor: 'rgba(5, 5, 5, 0.08)', background: '#ffffff' },
};

export function ResourceConfigPage({
  onOpenLogs,
}: {
  onOpenLogs?: (filters?: OperationLogFilters) => void;
  onOpenTasks?: () => void;
}) {
  const { message, modal } = App.useApp();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('membership');
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const [pointsWallet, setPointsWallet] = useState<TeamPointsBudgetPayload | null>(null);
  const [membership, setMembership] = useState<TeamMembershipPayload | null>(null);
  const [pointsLedger, setPointsLedger] = useState<TeamPointsWalletLedgerItem[]>([]);
  const [paymentPasswordStatus, setPaymentPasswordStatus] =
    useState<TeamPointsPaymentPasswordStatusPayload | null>(null);

  const [aiWallet, setAiWallet] = useState<TeamAiWalletPayload | null>(null);
  const [aiHistory, setAiHistory] = useState<TeamAiHistoryItem[]>([]);
  const [costReport, setCostReport] = useState<AiCostReportPayload | null>(null);
  const [providers, setProviders] = useState<AiProviderConfigPayload[]>([]);
  const [agentSettings, setAgentSettings] = useState<AgentSettingsPayload | null>(null);

  const [providerDrawerOpen, setProviderDrawerOpen] = useState(false);
  const [estimateDrawerOpen, setEstimateDrawerOpen] = useState(false);
  const [agentDrawerOpen, setAgentDrawerOpen] = useState(false);
  const [pointsRechargeDrawerOpen, setPointsRechargeDrawerOpen] = useState(false);
  const [aiWalletRechargeDrawerOpen, setAiWalletRechargeDrawerOpen] = useState(false);
  const [pointsWithdrawDrawerOpen, setPointsWithdrawDrawerOpen] = useState(false);
  const [pointsAlertDrawerOpen, setPointsAlertDrawerOpen] = useState(false);
  const [paymentPasswordDrawerOpen, setPaymentPasswordDrawerOpen] = useState(false);
  const [membershipDrawerOpen, setMembershipDrawerOpen] = useState(false);
  const [membershipContactOpen, setMembershipContactOpen] = useState(false);

  const [pointsRechargeSubmitting, setPointsRechargeSubmitting] = useState(false);
  const [aiWalletRechargeSubmitting, setAiWalletRechargeSubmitting] = useState(false);
  const [pointsWithdrawSubmitting, setPointsWithdrawSubmitting] = useState(false);
  const [pointsAlertSubmitting, setPointsAlertSubmitting] = useState(false);
  const [paymentPasswordSubmitting, setPaymentPasswordSubmitting] = useState(false);
  const [membershipSubmitting, setMembershipSubmitting] = useState(false);
  const [paymentPasswordCodeSending, setPaymentPasswordCodeSending] = useState(false);
  const [agentSaving, setAgentSaving] = useState(false);
  const [agentUploading, setAgentUploading] = useState(false);

  const [pointsRechargeError, setPointsRechargeError] = useState<string | null>(null);
  const [aiWalletRechargeError, setAiWalletRechargeError] = useState<string | null>(null);
  const [pointsWithdrawError, setPointsWithdrawError] = useState<string | null>(null);
  const [pointsAlertError, setPointsAlertError] = useState<string | null>(null);
  const [paymentPasswordError, setPaymentPasswordError] = useState<string | null>(null);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [estimateResult, setEstimateResult] = useState<string | null>(null);

  const [rechargeStep, setRechargeStep] = useState<RechargeStep>('method');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('wechat');
  const [pointsRechargeAmountDraft, setPointsRechargeAmountDraft] = useState('');
  const [confirmedRechargeAmount, setConfirmedRechargeAmount] = useState<number | null>(null);
  const [mockOrderId, setMockOrderId] = useState('');
  const [aiRechargeStep, setAiRechargeStep] = useState<AiRechargeStep>('amount');
  const [confirmedAiRechargeAmount, setConfirmedAiRechargeAmount] = useState<number | null>(null);
  const [paymentPasswordMode, setPaymentPasswordMode] = useState<PaymentPasswordMode>('set');
  const [withdrawMethodDraft, setWithdrawMethodDraft] = useState<WithdrawMethod>('wechat');
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [providerListStatus, setProviderListStatus] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [providerViewMode, setProviderViewMode] = useState<ProviderViewMode>('team');
  const [providerDrawerMode, setProviderDrawerMode] = useState<'create' | 'edit'>('create');
  const [providerKindDraft, setProviderKindDraft] = useState(providerKindOptions[0].value);
  const [providerSubmitting, setProviderSubmitting] = useState(false);
  const [providerTesting, setProviderTesting] = useState(false);
  const [providerActionLoadingId, setProviderActionLoadingId] = useState<string | null>(null);
  const [membershipTargetPlan, setMembershipTargetPlan] = useState<TeamMembershipPlanOption | null>(null);
  const [providerDrawerError, setProviderDrawerError] = useState<string | null>(null);
  const [providerTestResult, setProviderTestResult] = useState<{
    route_name?: string;
    provider_kind?: string;
    model: string;
    latency_ms: number;
    status: string;
    request_id?: string | null;
  } | null>(null);
  const [agentAvatarDraft, setAgentAvatarDraft] = useState('');
  const [ledgerFilters, setLedgerFilters] = useState<LedgerFilters>({
    transactionType: 'all',
    paymentMethod: 'all',
    status: 'all',
    keyword: '',
    dateRange: null,
  });
  const [aiHistoryKeyword, setAiHistoryKeyword] = useState('');
  const [aiHistoryDateRange, setAiHistoryDateRange] = useState<LightweightDateRange>(null);
  const [pointsRechargeForm] = Form.useForm<RechargeFormValues>();
  const [membershipForm] = Form.useForm<MembershipFormValues>();
  const [aiWalletRechargeForm] = Form.useForm<AiWalletRechargeFormValues>();
  const [pointsWithdrawForm] = Form.useForm<WithdrawFormValues>();
  const [pointsAlertForm] = Form.useForm<AlertFormValues>();
  const pointsAlertThresholdRef = useRef('');
  const pointsAlertThresholdInputRef = useRef<InputRef>(null);
  const [pointsAlertThresholdDraft, setPointsAlertThresholdDraft] = useState('');
  const [paymentPasswordForm] = Form.useForm<PaymentPasswordFormValues>();
  const [providerForm] = Form.useForm<ProviderFormValues>();
  const [estimateForm] = Form.useForm<EstimateFormValues>();
  const [agentForm] = Form.useForm<AgentFormValues>();

  const storedSession = useMemo(
    () => getStoredSession(window.localStorage) ?? getStoredSession(window.sessionStorage),
    [],
  );
  const canOpenAgentSettings =
    Boolean(storedSession?.user.permissions?.includes('team:manage')) ||
    storedSession?.user.role === 'admin' ||
    storedSession?.user.role === 'platform_admin' ||
    storedSession?.user.role === 'team_admin' ||
    storedSession?.user.team_role === 'team_admin';
  const canEditAgentSettings =
    storedSession?.user.role === 'admin' ||
    storedSession?.user.role === 'platform_admin' ||
    storedSession?.user.role === 'team_admin' ||
    storedSession?.user.team_role === 'team_admin';
  const canViewWalletSecurity =
    Boolean(storedSession?.user.permissions?.includes('budget:view')) ||
    Boolean(storedSession?.user.permissions?.includes('budget:manage')) ||
    storedSession?.user.role === 'team_admin' ||
    storedSession?.user.role === 'owner' ||
    storedSession?.user.role === 'admin';

  const walletStatus = useMemo(() => getWalletStatus(pointsWallet), [pointsWallet]);
  const providerEnabledCount = useMemo(
    () => providers.filter((item) => item.status === 'enabled').length,
    [providers],
  );
  const activeProviderId = useMemo(
    () => {
      if (providers.some((item) => item.provider_id === selectedProviderId)) {
        return selectedProviderId;
      }

      const firstTeamProvider = providers.find((item) => item.scope === 'team');
      const firstPlatformProvider = providers.find((item) => item.scope === 'platform');
      return firstTeamProvider?.provider_id ?? firstPlatformProvider?.provider_id ?? null;
    },
    [providers, selectedProviderId],
  );
  const selectedProvider = useMemo(
    () => providers.find((item) => item.provider_id === activeProviderId) ?? null,
    [activeProviderId, providers],
  );
  const visibleProviders = useMemo(
    () =>
      providers.filter((item) => {
        if (item.scope !== 'team') {
          return false;
        }
        const matchesStatus = providerListStatus === 'all' || item.status === providerListStatus;
        return matchesStatus;
      }),
    [providerListStatus, providers],
  );
  const walletSummaryItems = useMemo(
    () => [
      { key: 'balance', label: '积分余额', value: pointsWallet?.balance_points ?? 0, tone: 'wallet' },
      { key: 'reserved', label: '预扣积分', value: pointsWallet?.reserved_points ?? 0, tone: 'warning' },
      { key: 'spent', label: '花销统计', value: pointsWallet?.spent_points ?? 0, tone: 'danger' },
      { key: 'available', label: '可用余额', value: pointsWallet?.available_points ?? 0, tone: 'success' },
    ],
    [pointsWallet],
  );

  const aiMetricItems = useMemo(
    () => [
      { key: 'tokens', label: '累计 Token', value: costReport?.total_tokens ?? 0 },
      { key: 'cost', label: '本月成本', value: costReport?.total_cost ?? 0, isCost: true },
      { key: 'calls', label: '最近调用数', value: aiHistory.filter((item) => item.record_type === 'ai_call').length },
      { key: 'providers', label: '可用 Provider', value: providerEnabledCount },
    ],
    [aiHistory, costReport, providerEnabledCount],
  );
  const platformProviders = useMemo(
    () => providers.filter((item) => item.scope === 'platform'),
    [providers],
  );
  const providerOptionsInView = useMemo(
    () => (providerViewMode === 'platform' ? platformProviders : visibleProviders),
    [platformProviders, providerViewMode, visibleProviders],
  );

  const filteredPointsLedger = useMemo(
    () => filterLedgerItems(pointsLedger, ledgerFilters),
    [ledgerFilters, pointsLedger],
  );
  const filteredAiHistory = useMemo(
    () => filterAiHistoryItems(aiHistory, aiHistoryKeyword, aiHistoryDateRange),
    [aiHistory, aiHistoryDateRange, aiHistoryKeyword],
  );
  const maxWithdrawablePoints = pointsWallet?.available_points ?? 0;
  const hasActiveLedgerFilters =
    ledgerFilters.transactionType !== 'all' ||
    ledgerFilters.paymentMethod !== 'all' ||
    ledgerFilters.status !== 'all' ||
    Boolean(ledgerFilters.keyword.trim()) ||
    Boolean(ledgerFilters.dateRange?.[0] || ledgerFilters.dateRange?.[1]);
  const hasActiveAiHistoryFilters =
    Boolean(aiHistoryKeyword.trim()) || Boolean(aiHistoryDateRange?.[0] || aiHistoryDateRange?.[1]);
  function resetLedgerFilters() {
    setLedgerFilters({
      transactionType: 'all',
      paymentMethod: 'all',
      status: 'all',
      keyword: '',
      dateRange: null,
    });
  }

  function resetAiHistoryFilters() {
    setAiHistoryKeyword('');
    setAiHistoryDateRange(null);
  }

  const loadSharedData = useCallback(async (targetTeam: TeamDetail) => {
    const [nextCostReport, nextProviders, nextAgentSettings, nextPasswordStatus, nextAiWallet] = await Promise.all([
      getAiCostReport(targetTeam.team_id).catch(() => null),
      listAiProviderConfigs(targetTeam.team_id).catch(() => ({ items: [] })),
      getAgentSettings(targetTeam.team_id).catch(() => null),
      getTeamPointsPaymentPasswordStatus(targetTeam.team_id).catch(() => null),
      getTeamAiWallet(targetTeam.team_id).catch(() => null),
    ]);

    setCostReport(nextCostReport);
    setProviders(nextProviders.items);
    setPaymentPasswordStatus(nextPasswordStatus);
    setAgentSettings(nextAgentSettings);
    setAiWallet(nextAiWallet);

    if (nextAgentSettings) {
      setAgentAvatarDraft(nextAgentSettings.avatar);
    }
  }, []);

  const loadPointsData = useCallback(async (targetTeam: TeamDetail) => {
    const [wallet, ledger] = await Promise.all([
      getTeamPointsBudget(targetTeam.team_id),
      getTeamPointsWalletLedger(targetTeam.team_id),
    ]);
    setPointsWallet(wallet);
    setPointsLedger(ledger.items);
  }, []);

  const loadMembershipData = useCallback(async (targetTeam: TeamDetail) => {
    const [nextMembership, wallet] = await Promise.all([
      getTeamMembership(targetTeam.team_id),
      getTeamPointsBudget(targetTeam.team_id).catch(() => null),
    ]);
    setMembership(nextMembership);
    if (wallet) {
      setPointsWallet(wallet);
    }
  }, []);

  const loadAiHistory = useCallback(async (targetTeam: TeamDetail) => {
    const response = await listTeamAiHistory(targetTeam.team_id);
    setAiHistory(response.items);
  }, []);

  const loadCurrentTab = useCallback(async (targetTab: TabKey, targetTeam: TeamDetail) => {
    setTabLoading(true);
    setPageError(null);

    try {
      await loadSharedData(targetTeam);

      if (targetTab === 'membership') {
        await loadMembershipData(targetTeam);
      }

      if (targetTab === 'points') {
        await loadPointsData(targetTeam);
      }

      if (targetTab === 'ai-overview') {
        await loadAiHistory(targetTeam);
      }

    } catch (error) {
      setPageError(getErrorMessage(error, '资源配置加载失败'));
    } finally {
      setTabLoading(false);
    }
  }, [loadAiHistory, loadMembershipData, loadPointsData, loadSharedData]);

  useEffect(() => {
    let active = true;
    void getAdminOverview()
      .then(async (overview) => {
        if (!active) return;
        const currentTeam = overview.teams[0] ?? null;
        setTeam(currentTeam);
        setMembership(currentTeam?.membership ?? null);
        if (currentTeam) {
          await loadCurrentTab('membership', currentTeam);
        }
      })
      .catch((error) => {
        if (active) {
          setPageError(getErrorMessage(error, '企业信息加载失败'));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [loadCurrentTab]);

  function deferFormSync(callback: () => void) {
    window.setTimeout(callback, 0);
  }

  function openPointsRechargeDrawer() {
    setPointsRechargeError(null);
    setRechargeStep('method');
    setSelectedPaymentMethod('wechat');
    setPointsRechargeAmountDraft('');
    setConfirmedRechargeAmount(null);
    setMockOrderId('');
    setPointsRechargeDrawerOpen(true);
    deferFormSync(() => {
      pointsRechargeForm.setFieldsValue({
        amount: '',
        payment_method: 'wechat',
      });
    });
  }

  function openAiWalletRechargeDrawer() {
    setAiWalletRechargeError(null);
    setAiRechargeStep('amount');
    setConfirmedAiRechargeAmount(null);
    setAiWalletRechargeDrawerOpen(true);
    deferFormSync(() => {
      aiWalletRechargeForm.setFieldsValue({
        amount: '',
        payment_password: '',
      });
    });
  }

  function openPointsWithdrawDrawer() {
    if (!paymentPasswordStatus?.is_set) {
      message.warning('未设置支付密码，暂不可提现');
      return;
    }

    setPointsWithdrawError(null);
    setWithdrawMethodDraft('wechat');
    setPointsWithdrawDrawerOpen(true);
    deferFormSync(() => {
      pointsWithdrawForm.setFieldsValue({
        amount: '',
        payout_method: 'wechat',
        account_name: '',
        account_no: '',
        bank_name: '',
        note: '',
        payment_password: '',
      });
    });
  }

  function openPointsAlertDrawer() {
    setPointsAlertError(null);
    const alertEnabled = Boolean(pointsWallet?.alert_enabled);
    const threshold = alertEnabled && pointsWallet?.alert_threshold ? String(pointsWallet.alert_threshold) : '';
    pointsAlertThresholdRef.current = threshold;
    setPointsAlertThresholdDraft(threshold);
    setPointsAlertDrawerOpen(true);
    deferFormSync(() => {
      pointsAlertForm.setFieldsValue({
        enabled: alertEnabled,
      });
    });
  }

  function openPaymentPasswordDrawer(mode?: PaymentPasswordMode) {
    const nextMode = mode ?? (paymentPasswordStatus?.is_set ? 'change' : 'set');
    setPaymentPasswordError(null);
    setPaymentPasswordMode(nextMode);
    setPaymentPasswordDrawerOpen(true);
    deferFormSync(() => {
      paymentPasswordForm.setFieldsValue({
        current_password: '',
        new_password: '',
        confirm_password: '',
        email: storedSession?.user.email ?? '',
        email_code: '',
      });
    });
  }

  function openMembershipDrawer(plan: TeamMembershipPlanOption) {
    if (!plan.purchasable || plan.plan === 'more') {
      setMembershipContactOpen(true);
      return;
    }

    if (!paymentPasswordStatus?.is_set) {
      message.warning('未设置企业钱包支付密码，请先在积分管理中设置');
      return;
    }

    setMembershipTargetPlan(plan);
    setMembershipError(null);
    setMembershipDrawerOpen(true);
    deferFormSync(() => {
      membershipForm.setFieldsValue({ payment_password: '' });
    });
  }

  function scheduleFreeDowngrade() {
    if (!team) return;
    modal.confirm({
      title: '预约降级到 Free',
      content: '降级不会退款，将在当前会员有效期结束后生效；既有资源保留，但超额后会阻断新增成员、发布任务和继续导入数据集。',
      okText: '确认预约',
      cancelText: '取消',
      onOk: async () => {
        const nextMembership = await subscribeTeamMembership(team.team_id, { target_plan: 'free' });
        setMembership(nextMembership);
        message.success('已预约降级');
      },
    });
  }

  async function handleMembershipSubscribe() {
    if (!team || !membershipTargetPlan || membershipTargetPlan.plan === 'more') return;
    setMembershipSubmitting(true);
    setMembershipError(null);

    try {
      const values = await membershipForm.validateFields();
      const nextMembership = await subscribeTeamMembership(team.team_id, {
        target_plan: membershipTargetPlan.plan as TeamMembershipSubscribeRequest['target_plan'],
        payment_password: values.payment_password,
      });
      setMembership(nextMembership);
      membershipForm.resetFields();
      setMembershipDrawerOpen(false);
      await loadPointsData(team);
      message.success('会员套餐已更新');
    } catch (error) {
      setMembershipError(getErrorMessage(error, '会员套餐更新失败'));
    } finally {
      setMembershipSubmitting(false);
    }
  }

  async function handleCancelScheduledMembershipChange() {
    if (!team) return;
    const nextMembership = await cancelTeamMembershipScheduledChange(team.team_id);
    setMembership(nextMembership);
    message.success('已取消预约变更');
  }

  function restoreAgentDefaults() {
    if (!agentSettings) return;
    agentForm.setFieldsValue({
      display_name: agentSettings.default_display_name,
      avatar: agentSettings.default_avatar_url,
      preset_avatar_key: agentSettings.preset_avatar_options[0]?.key,
    });
    setAgentAvatarDraft(agentSettings.default_avatar_url);
  }

  function openAgentDrawer() {
    setAgentError(null);
    setAgentDrawerOpen(true);
    deferFormSync(() => {
      agentForm.setFieldsValue({
        display_name: agentSettings?.display_name ?? '',
        avatar: agentSettings?.avatar ?? '',
        preset_avatar_key: agentSettings?.preset_avatar_key ?? undefined,
      });
      setAgentAvatarDraft(agentSettings?.avatar ?? '');
    });
  }

  function goToConfirmStep() {
    try {
      const nextAmount = getValidPointsAmount(pointsRechargeForm.getFieldValue('amount'), '充值积分');
      setConfirmedRechargeAmount(nextAmount);
      setMockOrderId(buildMockOrderId());
      setRechargeStep('confirm');
      pointsRechargeForm.setFields([{ name: 'amount', errors: [] }]);
    } catch (error) {
      pointsRechargeForm.setFields([
        {
          name: 'amount',
          errors: [error instanceof Error ? error.message : '请输入有效充值积分'],
        },
      ]);
    }
  }

  function goToAiRechargeConfirmStep() {
    try {
      const nextAmount = getValidPointsAmount(aiWalletRechargeForm.getFieldValue('amount'), 'AI 充值积分');
      setConfirmedAiRechargeAmount(nextAmount);
      setAiRechargeStep('confirm');
      aiWalletRechargeForm.setFields([{ name: 'amount', errors: [] }]);
    } catch (error) {
      aiWalletRechargeForm.setFields([
        {
          name: 'amount',
          errors: [error instanceof Error ? error.message : '请输入有效充值积分'],
        },
      ]);
    }
  }

  async function confirmRecharge() {
    if (!team || confirmedRechargeAmount === null) return;

    setPointsRechargeSubmitting(true);
    setPointsRechargeError(null);
    try {
      await rechargeTeamPointsBudget(team.team_id, {
        amount: confirmedRechargeAmount,
        payment_method: selectedPaymentMethod,
      });
      await loadPointsData(team);
      pointsRechargeForm.resetFields();
      setPointsRechargeDrawerOpen(false);
      setRechargeStep('method');
      setConfirmedRechargeAmount(null);
      setMockOrderId('');
      message.success(`积分充值成功，已增加 ${formatFullNumber(confirmedRechargeAmount)} 积分`);
    } catch (error) {
      setPointsRechargeError(getErrorMessage(error, '积分充值失败'));
    } finally {
      setPointsRechargeSubmitting(false);
    }
  }

  async function confirmAiWalletRecharge() {
    if (!team || confirmedAiRechargeAmount === null) return;

    setAiWalletRechargeSubmitting(true);
    setAiWalletRechargeError(null);
    try {
      const paymentPassword = sanitizeIntegerInput(aiWalletRechargeForm.getFieldValue('payment_password') ?? '').slice(0, 6);
      if (!/^\d{6}$/.test(paymentPassword)) {
        aiWalletRechargeForm.setFields([
          {
            name: 'payment_password',
            errors: ['请输入 6 位支付密码'],
          },
        ]);
        return;
      }
      const nextWallet = await transferTeamPointsToAiWallet(team.team_id, {
        amount: confirmedAiRechargeAmount,
        payment_password: paymentPassword,
      });
      setAiWallet(nextWallet);
      await Promise.all([loadPointsData(team), loadAiHistory(team)]);
      aiWalletRechargeForm.resetFields();
      setAiWalletRechargeDrawerOpen(false);
      setAiRechargeStep('amount');
      setConfirmedAiRechargeAmount(null);
      message.success(`AI 积分充值成功，已转入 ${formatFullNumber(confirmedAiRechargeAmount)} 积分`);
    } catch (error) {
      setAiWalletRechargeError(getErrorMessage(error, 'AI 积分充值失败'));
    } finally {
      setAiWalletRechargeSubmitting(false);
    }
  }

  async function submitPointsAlert(values: AlertFormValues) {
    if (!team) return;

    setPointsAlertSubmitting(true);
    setPointsAlertError(null);
    try {
      if (values.enabled) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
      const domThreshold = pointsAlertThresholdInputRef.current?.input?.value ?? '';
      const rawThreshold = pointsAlertThresholdRef.current || pointsAlertThresholdDraft || domThreshold || values.threshold || '';
      const threshold = values.enabled ? getValidPointsAmount(rawThreshold, '最低可用余额') : 0;
      const updated = await setTeamPointsBudgetAlert(team.team_id, {
        enabled: values.enabled,
        threshold,
      });
      setPointsWallet(updated);
      setPointsAlertDrawerOpen(false);
      message.success(values.enabled ? '预警设置已更新' : '预警已关闭');
    } catch (error) {
      setPointsAlertError(getErrorMessage(error, '预警设置失败'));
    } finally {
      setPointsAlertSubmitting(false);
    }
  }

  async function submitPointsWithdraw(values: WithdrawFormValues) {
    if (!team) return;

    try {
      const amount = getValidPointsAmount(values.amount, '提现积分');
      if (amount > maxWithdrawablePoints) {
        throw new Error(`提现积分不能超过可用余额 ${formatFullNumber(maxWithdrawablePoints)}`);
      }
      const payoutMethod = values.payout_method;
      const accountNo = values.account_no.trim();
      const paymentPassword = sanitizeIntegerInput(values.payment_password).slice(0, 6);
      const accountName = values.account_name?.trim();
      const bankName = values.bank_name?.trim();

      await modal.confirm({
        title: '确认提现',
        centered: true,
        okText: '确认提现',
        cancelText: '取消',
        content: (
          <Descriptions column={1} size="small">
            <Descriptions.Item label="提现积分">{formatFullNumber(amount)}</Descriptions.Item>
            <Descriptions.Item label="提现方式">{getLedgerMethodLabel(payoutMethod)}</Descriptions.Item>
            <Descriptions.Item label="收款账号">{accountNo}</Descriptions.Item>
            {isBankTransferWithdraw(payoutMethod) ? (
              <>
                <Descriptions.Item label="收款户名">{accountName || '-'}</Descriptions.Item>
                <Descriptions.Item label="开户行">{bankName || '-'}</Descriptions.Item>
              </>
            ) : null}
          </Descriptions>
        ),
        onOk: async () => {
          setPointsWithdrawSubmitting(true);
          setPointsWithdrawError(null);
          try {
            await withdrawTeamPointsBudget(team.team_id, {
              amount,
              payout_method: payoutMethod,
              account_no: accountNo,
              account_name: isBankTransferWithdraw(payoutMethod) ? accountName : undefined,
              bank_name: isBankTransferWithdraw(payoutMethod) ? bankName : undefined,
              note: values.note?.trim() || undefined,
              payment_password: paymentPassword,
            });
            await loadPointsData(team);
            pointsWithdrawForm.resetFields();
            setPointsWithdrawDrawerOpen(false);
            message.success('提现成功');
          } catch (error) {
            setPointsWithdrawError(getErrorMessage(error, '积分提现失败'));
            throw error;
          } finally {
            setPointsWithdrawSubmitting(false);
          }
        },
      });
    } catch (error) {
      if (!(error instanceof ApiClientError)) {
        setPointsWithdrawError(error instanceof Error ? error.message : '积分提现失败');
      }
    }
  }

  async function sendPaymentPasswordResetCode() {
    const email = paymentPasswordForm.getFieldValue('email')?.trim();
    if (!email) {
      paymentPasswordForm.setFields([{ name: 'email', errors: ['请输入邮箱'] }]);
      return;
    }

    setPaymentPasswordCodeSending(true);
    try {
      await sendEmailCode({
        email,
        purpose: 'team_payment_password_reset',
      });
      message.success('验证码已发送');
    } catch (error) {
      setPaymentPasswordError(getErrorMessage(error, '验证码发送失败'));
    } finally {
      setPaymentPasswordCodeSending(false);
    }
  }

  async function submitPaymentPassword(values: PaymentPasswordFormValues) {
    if (!team) return;

    setPaymentPasswordSubmitting(true);
    setPaymentPasswordError(null);
    try {
      let nextStatus: TeamPointsPaymentPasswordStatusPayload;
      if (paymentPasswordMode === 'set') {
        nextStatus = await setTeamPointsPaymentPassword(team.team_id, {
          new_password: sanitizeIntegerInput(values.new_password ?? '').slice(0, 6),
          confirm_password: sanitizeIntegerInput(values.confirm_password ?? '').slice(0, 6),
        });
      } else if (paymentPasswordMode === 'change') {
        nextStatus = await changeTeamPointsPaymentPassword(team.team_id, {
          current_password: sanitizeIntegerInput(values.current_password ?? '').slice(0, 6),
          new_password: sanitizeIntegerInput(values.new_password ?? '').slice(0, 6),
          confirm_password: sanitizeIntegerInput(values.confirm_password ?? '').slice(0, 6),
        });
      } else {
        nextStatus = await resetTeamPointsPaymentPassword(team.team_id, {
          email: values.email?.trim() || '',
          email_code: (values.email_code ?? '').trim(),
          new_password: sanitizeIntegerInput(values.new_password ?? '').slice(0, 6),
          confirm_password: sanitizeIntegerInput(values.confirm_password ?? '').slice(0, 6),
        });
      }

      setPaymentPasswordStatus(nextStatus);
      paymentPasswordForm.resetFields();
      setPaymentPasswordDrawerOpen(false);
      message.success(
        paymentPasswordMode === 'set'
          ? '支付密码已设置'
          : paymentPasswordMode === 'change'
            ? '支付密码已修改'
            : '支付密码已重置',
      );
    } catch (error) {
      setPaymentPasswordError(getErrorMessage(error, '支付密码操作失败'));
    } finally {
      setPaymentPasswordSubmitting(false);
    }
  }

  function getCurrentProviderMeta(kind = providerKindDraft) {
    return getProviderOptionMeta(kind);
  }

  function applyProviderKindToDraft(kind: string) {
    setProviderKindDraft(kind);
    applyProviderKindDefaults(providerForm, kind);
  }

  async function submitProvider(values: ProviderFormValues) {
    if (!team) return;

    setProviderSubmitting(true);
    setProviderDrawerError(null);
    try {
      const payload = {
        route_name: values.route_name.trim(),
        provider_kind: values.provider_kind,
        protocol_profile: values.protocol_profile,
        scope: 'team' as const,
        team_id: team.team_id,
        api_base: buildProviderApiBase(values),
        api_key: values.api_key?.trim() || undefined,
        model_id: values.model_id.trim(),
        pricing: {
          input_price_per_million: Number(values.input_price_per_million ?? 0),
          output_price_per_million: Number(values.output_price_per_million ?? 0),
          cache_hit_price_per_million: Number(values.cache_hit_price_per_million ?? 0),
        },
        capabilities: values.capabilities ?? ['text'],
        transport_modes: values.transport_modes ?? [],
        supports_streaming: values.supports_streaming ?? true,
        capability_profile: buildProviderCapabilityProfile(values),
        runtime_config: buildProviderRuntimeConfig(values),
        status: values.status ?? 'enabled',
        remark: values.remark?.trim() || undefined,
      };

      const saved =
        providerDrawerMode === 'edit' && selectedProvider
          ? await updateAiProviderConfig(team.team_id, selectedProvider.provider_id, payload)
          : await createAiProviderConfig(payload);
      const nextProviders = await listAiProviderConfigs(team.team_id);
      setProviders(nextProviders.items);
      setSelectedProviderId(saved.provider_id);
      providerForm.resetFields();
      setProviderDrawerOpen(false);
      setProviderTestResult(null);
      message.success(providerDrawerMode === 'edit' ? 'Provider 配置已更新' : 'Provider 配置已新增');
    } catch (error) {
      setProviderDrawerError(getErrorMessage(error, 'Provider 保存失败'));
    } finally {
      setProviderSubmitting(false);
    }
  }

  async function runProviderDraftTest() {
    if (!team) return;

    setProviderTesting(true);
    setProviderDrawerError(null);
    try {
      const values = await providerForm.validateFields();
      const payload = {
        route_name: values.route_name.trim(),
        provider_kind: values.provider_kind,
        protocol_profile: values.protocol_profile,
        scope: 'team' as const,
        team_id: team.team_id,
        api_base: buildProviderApiBase(values),
        api_key: values.api_key?.trim() || undefined,
        model_id: values.model_id.trim(),
        capabilities: values.capabilities ?? ['text'],
        transport_modes: values.transport_modes ?? [],
        supports_streaming: values.supports_streaming ?? true,
        capability_profile: buildProviderCapabilityProfile(values),
        runtime_config: buildProviderRuntimeConfig(values),
        message: 'ping',
      };
      const result =
        providerDrawerMode === 'edit' && selectedProvider && !providerForm.isFieldsTouched()
          ? await testAiProviderConfig(team.team_id, selectedProvider.provider_id)
          : await testDraftAiProviderConfig(team.team_id, payload);
      setProviderTestResult(result);
      message.success(`连接测试成功：${result.model} / ${result.latency_ms}ms`);
    } catch (error) {
      setProviderDrawerError(getErrorMessage(error, '连接测试失败'));
      setProviderTestResult(extractFailedProviderTestResult(error));
    } finally {
      setProviderTesting(false);
    }
  }

  async function runProviderTest(item: AiProviderConfigPayload) {
    if (!team) return;

    setProviderActionLoadingId(item.provider_id);
    try {
      const result = await testAiProviderConfig(team.team_id, item.provider_id);
      setProviderTestResult(result);
      await Promise.all([loadAiHistory(team), loadSharedData(team)]);
      message.success(`连接测试成功：${result.model} / ${result.latency_ms}ms`);
    } catch (error) {
      message.error(getErrorMessage(error, '连接测试失败'));
      setProviderTestResult(extractFailedProviderTestResult(error));
    } finally {
      setProviderActionLoadingId(null);
    }
  }

  async function submitEstimate(values: EstimateFormValues) {
    try {
      const promptChars = getValidPointsAmount(values.prompt_chars ?? '0', '提示词字符数', true);
      const completionChars = getValidPointsAmount(values.completion_chars ?? '0', '回复字符数', true);
      const cacheHitChars = getValidPointsAmount(values.cache_hit_chars ?? '0', 'Cache 命中字符数', true);
      const result = await estimateAiCost({
        provider_id: values.provider_id,
        prompt_chars: promptChars,
        completion_chars: completionChars,
        cache_hit_chars: cacheHitChars,
      });
      setEstimateResult(`预计 ${formatCompactNumber(result.estimated_tokens)} Token / ${formatCostNumber(result.estimated_cost)}`);
      setEstimateDrawerOpen(false);
      message.success('成本估算完成');
    } catch (error) {
      message.error(getErrorMessage(error, '成本估算失败'));
    }
  }

  function openCreateProviderDrawer() {
    const initialKind = providerKindOptions[0].value;
    setProviderDrawerMode('create');
    setProviderDrawerError(null);
    setProviderTestResult(null);
    setProviderKindDraft(initialKind);
    setProviderDrawerOpen(true);
    deferFormSync(() => {
      providerForm.setFieldsValue(getProviderInitialValues(initialKind));
    });
  }

  function openEditProviderDrawer(item: AiProviderConfigPayload) {
    const providerKind = getProviderKind(item);
    setProviderDrawerMode('edit');
    setProviderDrawerError(null);
    setProviderTestResult(null);
    setSelectedProviderId(item.provider_id);
    setProviderKindDraft(providerKind);
    setProviderDrawerOpen(true);
    deferFormSync(() => {
      providerForm.setFieldsValue(buildProviderFormValuesFromConfig(item));
    });
  }

  async function duplicateProvider(item: AiProviderConfigPayload) {
    if (!team) return;
    setProviderActionLoadingId(item.provider_id);
    try {
      const created = await duplicateAiProviderConfig(team.team_id, item.provider_id);
      const nextProviders = await listAiProviderConfigs(team.team_id);
      setProviders(nextProviders.items);
      setSelectedProviderId(created.provider_id);
      message.success('Provider 副本已创建');
    } catch (error) {
      message.error(getErrorMessage(error, '复制 Provider 失败'));
    } finally {
      setProviderActionLoadingId(null);
    }
  }

  async function toggleProviderStatus(item: AiProviderConfigPayload) {
    if (!team) return;
    const nextStatus = item.status === 'enabled' ? 'disabled' : 'enabled';
    setProviderActionLoadingId(item.provider_id);
    try {
      const updated = await setAiProviderConfigStatus(team.team_id, item.provider_id, nextStatus);
      setProviders((current) => current.map((entry) => (entry.provider_id === item.provider_id ? updated : entry)));
      message.success(nextStatus === 'enabled' ? 'Provider 已启用' : 'Provider 已停用');
    } catch (error) {
      message.error(getErrorMessage(error, '更新 Provider 状态失败'));
    } finally {
      setProviderActionLoadingId(null);
    }
  }

  async function removeProvider(item: AiProviderConfigPayload) {
    if (!team) return;
    setProviderActionLoadingId(item.provider_id);
    try {
      await deleteAiProviderConfig(team.team_id, item.provider_id);
      const nextProviders = await listAiProviderConfigs(team.team_id);
      setProviders(nextProviders.items);
      if (selectedProviderId === item.provider_id) {
        setSelectedProviderId(nextProviders.items[0]?.provider_id ?? null);
      }
      message.success('Provider 已删除');
    } catch (error) {
      message.error(getErrorMessage(error, '删除 Provider 失败'));
    } finally {
      setProviderActionLoadingId(null);
    }
  }

  async function handleAgentAvatarUpload(file: File) {
    if (!team) return;
    if (!isAllowedAgentAvatar(file)) {
      setAgentError('Agent 头像仅支持 JPG、PNG 或 GIF');
      return;
    }
    setAgentUploading(true);
    setAgentError(null);
    try {
      const uploaded = await uploadTeamAgentAvatar(team.team_id, file);
      agentForm.setFieldValue('avatar', uploaded.url);
      setAgentAvatarDraft(uploaded.url);
      message.success('头像已上传');
    } catch (error) {
      setAgentError(getErrorMessage(error, '头像上传失败'));
    } finally {
      setAgentUploading(false);
    }
  }

  async function submitAgentSettings(values: AgentFormValues) {
    if (!team) return;
    setAgentSaving(true);
    setAgentError(null);
    try {
      const updated = await updateAgentSettings(team.team_id, {
        display_name: values.display_name.trim(),
        avatar: values.avatar.trim(),
        preset_avatar_key: values.preset_avatar_key?.trim() || null,
      });
      setAgentSettings(updated);
      agentForm.setFieldsValue({
        display_name: updated.display_name,
        avatar: updated.avatar,
        preset_avatar_key: updated.preset_avatar_key ?? undefined,
      });
      setAgentAvatarDraft(updated.avatar);
      setAgentDrawerOpen(false);
      message.success('Agent 设置已保存');
    } catch (error) {
      setAgentError(getErrorMessage(error, 'Agent 设置保存失败'));
    } finally {
      setAgentSaving(false);
    }
  }

  async function handleLedgerExport(format: LedgerExportFormat) {
    if (filteredPointsLedger.length === 0) {
      message.warning('当前筛选条件下暂无可导出的流水');
      return;
    }

    try {
      const exportedCount = await exportLedgerRows(filteredPointsLedger, format);
      message.success(`已导出 ${exportedCount} 条流水`);
    } catch (error) {
      message.error(getErrorMessage(error, '流水导出失败'));
    }
  }

  if (loading) {
    return (
      <main className="workspace-content resource-config-page workspace-loading-page">
        <WorkspaceLoading tip="正在加载资源配置" />
      </main>
    );
  }

  if (!team) {
    return (
      <main className="workspace-content resource-config-page">
        <Alert className="inline-message-ant" type="warning" showIcon title="请先完成企业配置" />
      </main>
    );
  }

  return (
    <main className="workspace-content resource-config-page workspace-fixed-page">
      <section className="page-heading">
        <div>
          <p className="section-kicker">Resource Config</p>
          <h1>资源配置</h1>
        </div>
        <div className="page-actions">
          <Button icon={<ReloadOutlined />} onClick={() => team && void loadCurrentTab(activeTab, team)}>
            刷新
          </Button>
          <Button
            icon={<InfoCircleOutlined />}
            onClick={() =>
              onOpenLogs?.({
                entity_type:
                  activeTab === 'membership' ? 'membership' : activeTab === 'points' ? 'points_budget' : 'ai_resource',
              })
            }
          >
            查看操作日志
          </Button>
        </div>
      </section>

      {pageError ? <Alert className="inline-message-ant" type="error" showIcon title={pageError} /> : null}

      <section className="resource-config-panel workspace-fixed-scroll-panel">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            const nextKey = key as TabKey;
            setActiveTab(nextKey);
            if (team) {
              void loadCurrentTab(nextKey, team);
            }
          }}
          items={[
            { key: 'membership', label: '会员与额度', children: renderMembershipTab() },
            { key: 'points', label: '积分管理', children: renderPointsTab() },
            { key: 'ai-overview', label: 'AI 资源', children: renderAiOverviewTab() },
            { key: 'providers', label: 'AI Provider', children: renderProviderTab() },
          ]}
        />
      </section>

      <Drawer
        title={membershipTargetPlan ? `${membershipTargetPlan.name} 会员购买 / 续费` : '会员购买 / 续费'}
        open={membershipDrawerOpen}
        forceRender
        onClose={() => {
          setMembershipDrawerOpen(false);
          setMembershipTargetPlan(null);
          setMembershipError(null);
          membershipForm.resetFields();
        }}
        size={480}
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {membershipError ? <Alert type="error" showIcon title={membershipError} /> : null}
          {membershipTargetPlan ? (
            <Card size="small">
              <Descriptions column={1} size="small">
                <Descriptions.Item label="目标套餐">{membershipTargetPlan.name}</Descriptions.Item>
                <Descriptions.Item label="年费">
                  {formatFullNumber(membershipTargetPlan.annual_fee_points ?? 0)} 积分
                </Descriptions.Item>
                <Descriptions.Item label="企业钱包可用余额">
                  {formatFullNumber(pointsWallet?.available_points ?? 0)} 积分
                </Descriptions.Item>
              </Descriptions>
            </Card>
          ) : null}
          {membershipTargetPlan && pointsWallet && (membershipTargetPlan.annual_fee_points ?? 0) > pointsWallet.available_points ? (
            <Alert type="warning" showIcon title="企业钱包可用余额不足，请先到积分管理中充值。" />
          ) : null}
          <Form form={membershipForm} layout="vertical">
            <Form.Item
              label="企业钱包支付密码"
              name="payment_password"
              rules={[{ required: true, message: '请输入企业钱包支付密码' }]}
            >
              <Input.Password maxLength={64} placeholder="请输入支付密码" />
            </Form.Item>
          </Form>
          <Space>
            <Button onClick={() => setMembershipDrawerOpen(false)}>取消</Button>
            <Button
              type="primary"
              loading={membershipSubmitting}
              disabled={Boolean(
                membershipTargetPlan &&
                  pointsWallet &&
                  (membershipTargetPlan.annual_fee_points ?? 0) > pointsWallet.available_points,
              )}
              onClick={() => void handleMembershipSubscribe()}
            >
              确认支付
            </Button>
          </Space>
        </div>
      </Drawer>

      <Modal
        title="联系平台定制"
        open={membershipContactOpen}
        onCancel={() => setMembershipContactOpen(false)}
        footer={
          <Button type="primary" onClick={() => setMembershipContactOpen(false)}>
            知道了
          </Button>
        }
      >
        <p style={{ margin: 0 }}>
          More 套餐面向超大规模企业、私有部署和定制化 SLA。请联系平台运营沟通成员、任务、存储与服务支持方案。
        </p>
      </Modal>

      <Drawer
        title="积分充值"
        open={pointsRechargeDrawerOpen}
        forceRender
        onClose={() => {
          setPointsRechargeDrawerOpen(false);
          setRechargeStep('method');
          setConfirmedRechargeAmount(null);
          setMockOrderId('');
        }}
        size={560}
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {pointsRechargeError ? (
            <Alert type="error" showIcon title={pointsRechargeError} />
          ) : null}

          <Space wrap size={[8, 8]}>
            <Tag color={rechargeStep === 'method' ? 'blue' : 'default'}>1. 选择方式</Tag>
            <Tag color={rechargeStep === 'amount' ? 'blue' : 'default'}>2. 填写积分</Tag>
            <Tag color={rechargeStep === 'confirm' ? 'blue' : 'default'}>3. 完成充值</Tag>
          </Space>

          <Form<RechargeFormValues> form={pointsRechargeForm} layout="vertical" initialValues={{ payment_method: 'wechat' }}>
            {rechargeStep === 'method' ? (
              <div style={methodGridStyle}>
                {paymentMethodOptions.map((option) => {
                  const Icon = option.icon;
                  const active = option.value === selectedPaymentMethod;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setSelectedPaymentMethod(option.value);
                        pointsRechargeForm.setFieldValue('payment_method', option.value);
                        setRechargeStep('amount');
                      }}
                      style={buildMethodCardStyle(active)}
                    >
                      <span style={buildMethodIconStyle(option.value)}>
                        <Icon />
                      </span>
                      <strong>{option.label}</strong>
                      <span style={{ color: '#8c8c8c', lineHeight: 1.5 }}>{option.intro}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {rechargeStep === 'amount' ? (
              <div style={{ display: 'grid', gap: 16 }}>
                <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                  <Space>
                    <span style={buildMethodIconStyle(selectedPaymentMethod)}>
                      {selectedPaymentMethod === 'wechat' ? (
                        <WechatOutlined />
                      ) : selectedPaymentMethod === 'alipay' ? (
                        <AlipayCircleOutlined />
                      ) : (
                        <BankOutlined />
                      )}
                    </span>
                    <strong>
                      {paymentMethodOptions.find((item) => item.value === selectedPaymentMethod)?.label ?? '微信支付'}
                    </strong>
                  </Space>
                  <Button onClick={() => setRechargeStep('method')}>切换方式</Button>
                </Space>

                <Tag color="gold" style={{ width: 'fit-content', margin: 0 }}>
                  1 积分 = 1 元
                </Tag>

                <Form.Item
                  name="amount"
                  label="本次充值积分"
                  rules={[
                    { required: true, message: '请输入本次充值积分' },
                    {
                      validator: (_, value) => {
                        try {
                          getValidPointsAmount(value, '充值积分');
                          return Promise.resolve();
                        } catch (error) {
                          return Promise.reject(error);
                        }
                      },
                    },
                  ]}
                >
                  <Input
                    inputMode="numeric"
                    maxLength={MAX_INPUT_LENGTH}
                    placeholder={`1 - ${formatFullNumber(MAX_POINTS_INPUT)}`}
                    onChange={(event) => {
                      const nextValue = sanitizeIntegerInput(event.target.value);
                      setPointsRechargeAmountDraft(nextValue);
                      pointsRechargeForm.setFieldValue('amount', nextValue);
                    }}
                  />
                </Form.Item>

                <Card size="small">
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="充值积分">
                      {pointsRechargeAmountDraft
                        ? formatFullNumber(Number(sanitizeIntegerInput(pointsRechargeAmountDraft)))
                        : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="支付金额">
                      {pointsRechargeAmountDraft
                        ? `${formatFullNumber(Number(sanitizeIntegerInput(pointsRechargeAmountDraft)))} 元`
                        : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="支付方式">
                      {paymentMethodOptions.find((item) => item.value === selectedPaymentMethod)?.label ?? '-'}
                    </Descriptions.Item>
                  </Descriptions>
                </Card>

                <Space>
                  <Button onClick={() => setRechargeStep('method')}>上一步</Button>
                  <Button type="primary" onClick={goToConfirmStep}>
                    下一步
                  </Button>
                </Space>
              </div>
            ) : null}

            {rechargeStep === 'confirm' && confirmedRechargeAmount !== null ? (
              renderRechargeConfirmation({
                method: selectedPaymentMethod,
                amount: confirmedRechargeAmount,
                orderId: mockOrderId,
                submitting: pointsRechargeSubmitting,
                onBack: () => setRechargeStep('amount'),
                onConfirm: () => void confirmRecharge(),
              })
            ) : null}
          </Form>
        </div>
      </Drawer>

      <Drawer
        title="积分提现"
        open={pointsWithdrawDrawerOpen}
        forceRender
        onClose={() => setPointsWithdrawDrawerOpen(false)}
        size={560}
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {pointsWithdrawError ? <Alert type="error" showIcon title={pointsWithdrawError} /> : null}

          <Form<WithdrawFormValues>
            form={pointsWithdrawForm}
            layout="vertical"
            initialValues={{ payout_method: 'wechat' }}
            onFinish={(values) => void submitPointsWithdraw(values)}
          >
            <Card size="small">
              <Descriptions column={2} size="small">
                <Descriptions.Item label="积分余额">
                  {renderCompactValue(pointsWallet?.balance_points ?? 0)}
                </Descriptions.Item>
                <Descriptions.Item label="预扣积分">
                  {renderCompactValue(pointsWallet?.reserved_points ?? 0)}
                </Descriptions.Item>
                <Descriptions.Item label="可提现余额">
                  {renderCompactValue(maxWithdrawablePoints)}
                </Descriptions.Item>
                <Descriptions.Item label="支付密码">
                  {paymentPasswordStatus?.is_set ? '已设置' : '未设置'}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Form.Item label="提现方式" required>
              <div style={methodGridStyle}>
                {withdrawMethodOptions.map((option) => {
                  const Icon = option.icon;
                  const active = withdrawMethodDraft === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setWithdrawMethodDraft(option.value);
                        pointsWithdrawForm.setFieldValue('payout_method', option.value);
                      }}
                      style={buildMethodCardStyle(active)}
                    >
                      <span style={buildMethodIconStyle(option.value)}>
                        <Icon />
                      </span>
                      <strong>{option.label}</strong>
                      <span style={{ color: '#8c8c8c', lineHeight: 1.5 }}>{option.intro}</span>
                    </button>
                  );
                })}
              </div>
            </Form.Item>

            <Form.Item name="payout_method" hidden>
              <Input />
            </Form.Item>

            <Form.Item
              name="amount"
              label="提现积分"
              rules={[
                { required: true, message: '请输入提现积分' },
                {
                  validator: (_, value) => {
                    try {
                      const nextAmount = getValidPointsAmount(value, '提现积分');
                      if (pointsWallet && nextAmount > maxWithdrawablePoints) {
                        throw new Error(`提现积分不能超过可提现余额 ${formatFullNumber(maxWithdrawablePoints)}`);
                      }
                      return Promise.resolve();
                    } catch (error) {
                      return Promise.reject(error);
                    }
                  },
                },
              ]}
            >
              <Input
                inputMode="numeric"
                maxLength={MAX_INPUT_LENGTH}
                placeholder={`1 - ${formatFullNumber(MAX_POINTS_INPUT)}`}
                onChange={(event) => {
                  pointsWithdrawForm.setFieldValue('amount', sanitizeIntegerInput(event.target.value));
                }}
              />
            </Form.Item>

            {isBankTransferWithdraw(withdrawMethodDraft) ? (
              <>
                <Form.Item
                  name="account_name"
                  label="收款户名"
                  rules={[{ required: true, message: '请输入收款户名' }]}
                >
                  <Input placeholder="请输入收款户名" />
                </Form.Item>
                <Form.Item
                  name="account_no"
                  label="收款账号"
                  rules={[{ required: true, message: '请输入收款账号' }]}
                >
                  <Input placeholder="请输入收款账号" />
                </Form.Item>
                <Form.Item
                  name="bank_name"
                  label="开户行"
                  rules={[{ required: true, message: '请输入开户行' }]}
                >
                  <Input placeholder="请输入开户行" />
                </Form.Item>
              </>
            ) : (
              <Form.Item
                name="account_no"
                label="收款账号"
                rules={[{ required: true, message: '请输入收款账号' }]}
              >
                <Input placeholder="请输入收款账号" />
              </Form.Item>
            )}

            <Form.Item name="note" label="备注">
              <Input maxLength={100} placeholder="选填" />
            </Form.Item>

            <Form.Item
              name="payment_password"
              label="支付密码"
              rules={[
                { required: true, message: '请输入支付密码' },
                {
                  validator: (_, value) =>
                    /^\d{6}$/.test(sanitizeIntegerInput(value ?? ''))
                      ? Promise.resolve()
                      : Promise.reject(new Error('支付密码为 6 位数字')),
                },
              ]}
            >
              <Input.Password
                inputMode="numeric"
                maxLength={6}
                placeholder="请输入 6 位支付密码"
                onChange={(event) => {
                  pointsWithdrawForm.setFieldValue(
                    'payment_password',
                    sanitizeIntegerInput(event.target.value).slice(0, 6),
                  );
                }}
              />
            </Form.Item>

            <Space>
              <Button onClick={() => setPointsWithdrawDrawerOpen(false)}>取消</Button>
              <Button type="primary" htmlType="submit" loading={pointsWithdrawSubmitting}>
                确认提现
              </Button>
            </Space>
          </Form>
        </div>
      </Drawer>

      <Drawer
        title="AI 积分充值"
        open={aiWalletRechargeDrawerOpen}
        forceRender
        onClose={() => {
          setAiWalletRechargeDrawerOpen(false);
          setAiRechargeStep('amount');
          setConfirmedAiRechargeAmount(null);
        }}
        size={560}
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <Card size="small">
            <Descriptions column={2} size="small">
              <Descriptions.Item label="企业积分余额">
                {renderCompactValue(pointsWallet?.balance_points ?? 0)}
              </Descriptions.Item>
              <Descriptions.Item label="预扣积分">
                {renderCompactValue(pointsWallet?.reserved_points ?? 0)}
              </Descriptions.Item>
              <Descriptions.Item label="可支配余额">
                {renderCompactValue(pointsWallet?.available_points ?? 0)}
              </Descriptions.Item>
              <Descriptions.Item label="AI 钱包余额">{formatAiWalletPoints(aiWallet?.balance_points ?? 0)}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{formatDateTime(aiWallet?.updated_at)}</Descriptions.Item>
            </Descriptions>
          </Card>

          {aiWalletRechargeError ? <Alert type="error" showIcon title={aiWalletRechargeError} /> : null}

          <Space wrap size={[8, 8]}>
            <Tag color={aiRechargeStep === 'amount' ? 'blue' : 'default'}>1. 填写转入积分</Tag>
            <Tag color={aiRechargeStep === 'confirm' ? 'blue' : 'default'}>2. 确认转入</Tag>
          </Space>

          <Form<AiWalletRechargeFormValues> form={aiWalletRechargeForm} layout="vertical">
            {aiRechargeStep === 'amount' ? (
              <div style={{ display: 'grid', gap: 16 }}>
                <Alert type="info" showIcon title="AI 积分转入会直接从企业积分钱包扣减等额可支配余额，不经过微信、支付宝或对公转账。" />

                <Form.Item
                  name="amount"
                  label="本次转入积分"
                  rules={[
                    { required: true, message: '请输入本次转入积分' },
                    {
                      validator: (_, value) => {
                        try {
                          getValidPointsAmount(value, 'AI 充值积分');
                          return Promise.resolve();
                        } catch (error) {
                          return Promise.reject(error);
                        }
                      },
                    },
                  ]}
                >
                  <Input
                    inputMode="numeric"
                    maxLength={MAX_INPUT_LENGTH}
                    placeholder={`1 - ${formatFullNumber(MAX_POINTS_INPUT)}`}
                    onChange={(event) => {
                      aiWalletRechargeForm.setFieldValue('amount', sanitizeIntegerInput(event.target.value));
                    }}
                  />
                </Form.Item>

                <Card size="small">
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="转入积分">
                      {aiWalletRechargeForm.getFieldValue('amount')
                        ? formatFullNumber(Number(sanitizeIntegerInput(aiWalletRechargeForm.getFieldValue('amount'))))
                        : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="企业钱包扣减">
                      {aiWalletRechargeForm.getFieldValue('amount')
                        ? `${formatFullNumber(Number(sanitizeIntegerInput(aiWalletRechargeForm.getFieldValue('amount'))))} 积分`
                        : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="转入目标">AI 调用钱包</Descriptions.Item>
                  </Descriptions>
                </Card>

                <Space>
                  <Button onClick={() => setAiWalletRechargeDrawerOpen(false)}>取消</Button>
                  <Button type="primary" onClick={goToAiRechargeConfirmStep}>
                    下一步
                  </Button>
                </Space>
              </div>
            ) : null}

            {aiRechargeStep === 'confirm' && confirmedAiRechargeAmount !== null ? (
              <div style={{ display: 'grid', gap: 16 }}>
                <Card size="small">
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="转入积分">{formatFullNumber(confirmedAiRechargeAmount)} 积分</Descriptions.Item>
                    <Descriptions.Item label="扣减账户">企业积分钱包可支配余额</Descriptions.Item>
                    <Descriptions.Item label="转入账户">AI 调用钱包</Descriptions.Item>
                  </Descriptions>
                </Card>
                <Alert type="info" showIcon title="确认后会从企业积分钱包直接扣减，并同步增加 AI 调用钱包余额。" />
                <Form.Item
                  name="payment_password"
                  label="企业钱包支付密码"
                  rules={[
                    { required: true, message: '请输入支付密码' },
                    {
                      validator: (_, value) =>
                        /^\d{6}$/.test(sanitizeIntegerInput(value ?? ''))
                          ? Promise.resolve()
                          : Promise.reject(new Error('支付密码为 6 位数字')),
                    },
                  ]}
                >
                  <Input.Password
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="请输入 6 位支付密码"
                    onChange={(event) => {
                      aiWalletRechargeForm.setFieldValue(
                        'payment_password',
                        sanitizeIntegerInput(event.target.value).slice(0, 6),
                      );
                    }}
                  />
                </Form.Item>
                <Space>
                  <Button onClick={() => setAiRechargeStep('amount')}>上一步</Button>
                  <Button type="primary" loading={aiWalletRechargeSubmitting} onClick={() => void confirmAiWalletRecharge()}>
                    确认转入
                  </Button>
                </Space>
              </div>
            ) : null}
          </Form>
        </div>
      </Drawer>

      <Drawer
        title="预警设置"
        open={pointsAlertDrawerOpen}
        forceRender
        onClose={() => setPointsAlertDrawerOpen(false)}
        size={480}
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {pointsAlertError ? <Alert type="error" showIcon title={pointsAlertError} /> : null}

          <Form<AlertFormValues>
            form={pointsAlertForm}
            layout="vertical"
            initialValues={{
              enabled: Boolean(pointsWallet?.alert_enabled),
              threshold: pointsWallet?.alert_threshold ? String(pointsWallet.alert_threshold) : '',
            }}
            onFinish={(values) => void submitPointsAlert(values)}
          >
            <Form.Item name="enabled" label="启用预警" valuePropName="checked">
              <Switch />
            </Form.Item>

            <Form.Item
              noStyle
              shouldUpdate={(prev, next) => prev.enabled !== next.enabled}
            >
              {({ getFieldValue }) =>
                getFieldValue('enabled') ? (
                  <Form.Item label="最低可用余额" required htmlFor="points-alert-threshold">
                    <Input
                      ref={pointsAlertThresholdInputRef}
                      id="points-alert-threshold"
                      value={pointsAlertThresholdDraft}
                      inputMode="numeric"
                      maxLength={MAX_INPUT_LENGTH}
                      placeholder={`1 - ${formatFullNumber(MAX_POINTS_INPUT)}`}
                      onChange={(event) => {
                        const nextValue = sanitizeIntegerInput(event.target.value);
                        pointsAlertThresholdRef.current = nextValue;
                        setPointsAlertThresholdDraft(nextValue);
                      }}
                    />
                  </Form.Item>
                ) : null
              }
            </Form.Item>

            <Space>
              <Button onClick={() => setPointsAlertDrawerOpen(false)}>取消</Button>
              <Button type="primary" htmlType="submit" loading={pointsAlertSubmitting}>
                保存
              </Button>
            </Space>
          </Form>
        </div>
      </Drawer>

      <Drawer
        title="支付密码"
        open={paymentPasswordDrawerOpen}
        forceRender
        onClose={() => setPaymentPasswordDrawerOpen(false)}
        size={480}
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <Space wrap>
            <Button
              type={paymentPasswordMode === 'set' ? 'primary' : 'default'}
              disabled={Boolean(paymentPasswordStatus?.is_set)}
              onClick={() => setPaymentPasswordMode('set')}
            >
              首次设置
            </Button>
            <Button
              type={paymentPasswordMode === 'change' ? 'primary' : 'default'}
              disabled={!paymentPasswordStatus?.is_set}
              onClick={() => setPaymentPasswordMode('change')}
            >
              修改
            </Button>
            <Button
              type={paymentPasswordMode === 'reset' ? 'primary' : 'default'}
              disabled={!paymentPasswordStatus?.is_set}
              onClick={() => setPaymentPasswordMode('reset')}
            >
              重置
            </Button>
          </Space>

          {paymentPasswordError ? <Alert type="error" showIcon title={paymentPasswordError} /> : null}

          <Form<PaymentPasswordFormValues>
            form={paymentPasswordForm}
            layout="vertical"
            onFinish={(values) => void submitPaymentPassword(values)}
          >
            {paymentPasswordMode === 'change' ? (
              <Form.Item
                name="current_password"
                label="当前支付密码"
                rules={[
                  { required: true, message: '请输入当前支付密码' },
                  {
                    validator: (_, value) =>
                      /^\d{6}$/.test(sanitizeIntegerInput(value ?? ''))
                        ? Promise.resolve()
                        : Promise.reject(new Error('支付密码为 6 位数字')),
                  },
                ]}
              >
                <Input.Password
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) => {
                    paymentPasswordForm.setFieldValue(
                      'current_password',
                      sanitizeIntegerInput(event.target.value).slice(0, 6),
                    );
                  }}
                />
              </Form.Item>
            ) : null}

            {paymentPasswordMode === 'reset' ? (
              <>
                <Form.Item name="email" label="邮箱" rules={[{ required: true, message: '请输入邮箱' }]}>
                  <Input />
                </Form.Item>
                <Form.Item
                  name="email_code"
                  label="邮箱验证码"
                  rules={[{ required: true, message: '请输入邮箱验证码' }]}
                >
                  <Space.Compact style={{ width: '100%' }}>
                    <Input placeholder="请输入邮箱验证码" />
                    <Button loading={paymentPasswordCodeSending} onClick={() => void sendPaymentPasswordResetCode()}>
                      发送验证码
                    </Button>
                  </Space.Compact>
                </Form.Item>
              </>
            ) : null}

            <Form.Item
              name="new_password"
              label="新支付密码"
              rules={[
                { required: true, message: '请输入新支付密码' },
                {
                  validator: (_, value) =>
                    /^\d{6}$/.test(sanitizeIntegerInput(value ?? ''))
                      ? Promise.resolve()
                      : Promise.reject(new Error('支付密码为 6 位数字')),
                },
              ]}
            >
              <Input.Password
                inputMode="numeric"
                maxLength={6}
                placeholder="请输入 6 位数字"
                onChange={(event) => {
                  paymentPasswordForm.setFieldValue(
                    'new_password',
                    sanitizeIntegerInput(event.target.value).slice(0, 6),
                  );
                }}
              />
            </Form.Item>

            <Form.Item
              name="confirm_password"
              label="确认支付密码"
              dependencies={['new_password']}
              rules={[
                { required: true, message: '请再次输入支付密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if ((value ?? '') === (getFieldValue('new_password') ?? '')) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('两次输入的支付密码不一致'));
                  },
                }),
              ]}
            >
              <Input.Password
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => {
                  paymentPasswordForm.setFieldValue(
                    'confirm_password',
                    sanitizeIntegerInput(event.target.value).slice(0, 6),
                  );
                }}
              />
            </Form.Item>

            <Space>
              <Button onClick={() => setPaymentPasswordDrawerOpen(false)}>取消</Button>
              <Button type="primary" htmlType="submit" loading={paymentPasswordSubmitting}>
                保存
              </Button>
            </Space>
          </Form>
        </div>
      </Drawer>

      <Drawer
        title={providerDrawerMode === 'edit' ? '编辑 Provider 配置' : '新增 Provider 配置'}
        open={providerDrawerOpen}
        forceRender
        onClose={() => {
          setProviderDrawerOpen(false);
          setProviderDrawerError(null);
          setProviderTesting(false);
          setProviderTestResult(null);
        }}
        size={760}
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {providerDrawerError ? <Alert type="error" showIcon title={providerDrawerError} /> : null}
          {providerTestResult ? (
            <Alert
              type={providerTestResult.status === 'success' ? 'success' : 'error'}
              showIcon
              title={
                providerTestResult.status === 'success'
                  ? `连接测试成功：${providerTestResult.latency_ms}ms`
                  : '连接测试失败'
              }
              description={providerTestResult.request_id ? `请求编号：${formatShortId(providerTestResult.request_id)}` : undefined}
            />
          ) : null}
          <Alert type="info" showIcon title={`${getCurrentProviderMeta().intro} 一条配置绑定一个可直接被任务选择的模型路由。`} />
        <Form<ProviderFormValues>
          form={providerForm}
          layout="vertical"
          onFinish={(values) => void submitProvider(values)}
          initialValues={getProviderInitialValues(providerKindOptions[0].value)}
        >
          <Card size="small" title="基础信息">
            <div style={providerFormGridStyle}>
              <Form.Item name="route_name" label="配置名称" rules={[{ required: true, message: '请输入配置名称' }]}>
                <Input placeholder="例如：法务审核主路由" />
              </Form.Item>
              <Form.Item name="provider_kind" label="Provider 类型" rules={[{ required: true, message: '请选择 Provider 类型' }]}>
                <Select
                  getPopupContainer={workspacePopupContainer}
                  options={providerKindOptions.map((item) => ({ value: item.value, label: item.label }))}
                  onChange={(value) => {
                    applyProviderKindToDraft(value);
                  }}
                />
              </Form.Item>
              <Form.Item
                name="model_id"
                label={getCurrentProviderMeta().modelLabel}
                rules={[{ required: true, message: `请输入${getCurrentProviderMeta().modelLabel}` }]}
              >
                <Input
                  placeholder={getProviderModelPlaceholder(providerKindDraft)}
                  onChange={(event) => {
                    if (providerKindDraft !== 'Azure OpenAI') {
                      return;
                    }
                    const deploymentName = event.target.value.trim();
                    const resourceName = providerForm.getFieldValue('azure_resource_name')?.trim();
                    if (resourceName && deploymentName) {
                      providerForm.setFieldValue(
                        'api_base',
                        `https://${resourceName}.openai.azure.com/openai/deployments/${deploymentName}`,
                      );
                    }
                  }}
                />
              </Form.Item>
              <Form.Item name="status" label="状态">
                <Select
                  getPopupContainer={workspacePopupContainer}
                  options={[
                    { label: '启用', value: 'enabled' },
                    { label: '停用', value: 'disabled' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="remark" label="备注" style={{ gridColumn: '1 / -1' }}>
                <Input.TextArea rows={2} maxLength={200} placeholder="写明用途、适用企业或维护备注" />
              </Form.Item>
            </div>
          </Card>

          <Card size="small" title="鉴权与接入">
            <div style={providerFormGridStyle}>
              <Form.Item name="api_base" label={getCurrentProviderMeta().endpointLabel}>
                <Input placeholder="https://api.example.com/v1" />
              </Form.Item>
              <Form.Item name="api_key" label="API Key">
                <Input.Password
                  placeholder={providerDrawerMode === 'edit' ? '默认掩码显示，输入新值即轮换' : getCurrentProviderMeta().keyHint}
                  visibilityToggle
                />
              </Form.Item>
              {renderProviderAccessFields(providerKindDraft, providerForm)}
            </div>
          </Card>

          <Card size="small" title="价格配置">
            <div style={providerFormGridStyle}>
              <Form.Item name="input_price_per_million" label="每百万输入价格" rules={[{ required: true, message: '请输入输入价格' }]}>
                <InputNumber min={0} precision={4} style={{ width: '100%' }} suffix="元 / 1M tokens" />
              </Form.Item>
              <Form.Item name="output_price_per_million" label="每百万输出价格" rules={[{ required: true, message: '请输入输出价格' }]}>
                <InputNumber min={0} precision={4} style={{ width: '100%' }} suffix="元 / 1M tokens" />
              </Form.Item>
              <Form.Item name="cache_hit_price_per_million" label="每百万 Cache 命中价格" rules={[{ required: true, message: '请输入 Cache 命中价格' }]}>
                <InputNumber min={0} precision={4} style={{ width: '100%' }} suffix="元 / 1M tokens" />
              </Form.Item>
            </div>
          </Card>

          <Card size="small" title="模型与运行参数">
            <div style={providerFormGridStyle}>
              <Form.Item name="temperature" label="Temperature">
                <InputNumber min={0} max={2} step={0.1} precision={1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="max_output_tokens" label="Max Output Tokens">
                <InputNumber min={1} step={1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="timeout_ms" label="Timeout">
                <InputNumber min={1000} step={1000} style={{ width: '100%' }} suffix="ms" />
              </Form.Item>
              <Form.Item name="reasoning_effort" label="Reasoning">
                <Select
                  getPopupContainer={workspacePopupContainer}
                  options={[
                    { label: 'Off', value: 'off' },
                    { label: 'Minimal', value: 'minimal' },
                    { label: 'Low', value: 'low' },
                    { label: 'Medium', value: 'medium' },
                    { label: 'High', value: 'high' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="capabilities" label="能力声明" style={{ gridColumn: '1 / -1' }}>
                <Select
                  mode="multiple"
                  getPopupContainer={workspacePopupContainer}
                  options={providerCapabilityOptions}
                  placeholder="选择该路由支持的能力"
                  onChange={(value) => {
                    syncProviderProtocolDraft(providerForm, { capabilities: value });
                  }}
                />
              </Form.Item>
              {renderProviderProtocolFields(providerForm)}
            </div>
          </Card>

          <Space>
            <Button onClick={() => setProviderDrawerOpen(false)}>取消</Button>
            <Button icon={<ReloadOutlined />} loading={providerTesting} onClick={() => void runProviderDraftTest()}>
              测试连接
            </Button>
            <Button type="primary" htmlType="submit" loading={providerSubmitting}>
              {providerDrawerMode === 'edit' ? '保存配置' : '创建配置'}
            </Button>
          </Space>
        </Form>
        </div>
      </Drawer>

      <Drawer
        title="成本估算"
        open={estimateDrawerOpen}
        forceRender
        onClose={() => setEstimateDrawerOpen(false)}
        size={480}
      >
        <Form<EstimateFormValues>
          form={estimateForm}
          layout="vertical"
          onFinish={(values) => void submitEstimate(values)}
          initialValues={{ provider_id: selectedProvider?.provider_id ?? providers[0]?.provider_id ?? '' }}
        >
          <Form.Item name="provider_id" label="Provider 路由" rules={[{ required: true, message: '请选择 Provider 路由' }]}>
            <Select
              getPopupContainer={workspacePopupContainer}
              options={providers.map((provider) => ({
                value: provider.provider_id,
                label:
                  provider.scope === 'platform'
                    ? `${getProviderDisplayName(provider)} · 平台共享`
                    : `${getProviderDisplayName(provider)} / ${getProviderKind(provider)} / ${getProviderModelId(provider)}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="prompt_chars" label="提示词字符数">
            <Input
              inputMode="numeric"
              maxLength={MAX_INPUT_LENGTH}
              placeholder="0"
              onChange={(event) => {
                estimateForm.setFieldValue('prompt_chars', sanitizeIntegerInput(event.target.value));
              }}
            />
          </Form.Item>
          <Form.Item name="completion_chars" label="回复字符数">
            <Input
              inputMode="numeric"
              maxLength={MAX_INPUT_LENGTH}
              placeholder="0"
              onChange={(event) => {
                estimateForm.setFieldValue('completion_chars', sanitizeIntegerInput(event.target.value));
              }}
            />
          </Form.Item>
          <Form.Item name="cache_hit_chars" label="Cache 命中字符数">
            <Input
              inputMode="numeric"
              maxLength={MAX_INPUT_LENGTH}
              placeholder="0"
              onChange={(event) => {
                estimateForm.setFieldValue('cache_hit_chars', sanitizeIntegerInput(event.target.value));
              }}
            />
          </Form.Item>
          <Space>
            <Button onClick={() => setEstimateDrawerOpen(false)}>取消</Button>
            <Button type="primary" htmlType="submit">
              估算
            </Button>
          </Space>
        </Form>
      </Drawer>

      <Drawer
        title="Agent 设置"
        open={agentDrawerOpen}
        forceRender
        onClose={() => setAgentDrawerOpen(false)}
        size={520}
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {agentError ? <Alert type="error" showIcon title={agentError} /> : null}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Avatar size={64} src={agentAvatarDraft || undefined} icon={<WalletOutlined />} />
            <Upload
              showUploadList={false}
              accept={AGENT_AVATAR_ACCEPT}
              disabled={!canEditAgentSettings}
              beforeUpload={(file) => {
                void handleAgentAvatarUpload(file as File);
                return Upload.LIST_IGNORE;
              }}
            >
              <Button icon={<UploadOutlined />} loading={agentUploading}>
                上传头像
              </Button>
            </Upload>
          </div>

          <Form<AgentFormValues> form={agentForm} layout="vertical" onFinish={(values) => void submitAgentSettings(values)}>
            <Form.Item name="display_name" label="显示名称" rules={[{ required: true, message: '请输入显示名称' }]}>
              <Input />
            </Form.Item>

            <Form.Item name="preset_avatar_key" label="预设头像">
              <Select
                allowClear
                getPopupContainer={workspacePopupContainer}
                options={(agentSettings?.preset_avatar_options ?? []).map((item) => ({
                  value: item.key,
                  label: item.label,
                }))}
                onChange={(value) => {
                  const selected = agentSettings?.preset_avatar_options.find((item) => item.key === value);
                  if (selected) {
                    agentForm.setFieldsValue({
                      preset_avatar_key: selected.key,
                      avatar: selected.url,
                    });
                    setAgentAvatarDraft(selected.url);
                  }
                }}
              />
            </Form.Item>

            <Form.Item name="avatar" label="头像地址" rules={[{ required: true, message: '请提供头像地址' }]}>
              <Input />
            </Form.Item>

            <Space>
              <Button onClick={restoreAgentDefaults} disabled={!canEditAgentSettings}>恢复默认</Button>
              <Button onClick={() => setAgentDrawerOpen(false)}>取消</Button>
              <Button type="primary" htmlType="submit" loading={agentSaving} disabled={!canEditAgentSettings}>
                保存
              </Button>
            </Space>
          </Form>
        </div>
      </Drawer>

    </main>
  );

  function renderMembershipTab() {
    const effectivePlan = membership?.effective_plan ?? team?.membership?.effective_plan ?? 'free';
    const currentPlan = membership?.current_plan ?? team?.membership?.current_plan ?? 'free';
    const showBookPlan = currentPlan !== effectivePlan;
    const plans = membership?.plans ?? defaultMembershipPlans();
    const limits = membership?.limits ?? { members: 3, active_tasks: 3, storage_bytes: 3 * 1024 ** 3 };
    const usage = membership?.usage ?? { members: team?.member_count ?? 0, active_tasks: 0, storage_bytes: 0 };
    const overLimitItems = membership?.over_limit_items ?? [];

    return (
      <div style={tabStackStyle}>
        <Card size="small">
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <Space wrap size={[8, 8]}>
                <span style={{ color: '#595959', fontSize: 13 }}>当前套餐</span>
                <Tag color={getMembershipPlanColor(effectivePlan)}>{getMembershipPlanLabel(effectivePlan)}</Tag>
                {showBookPlan ? <Tag>{`账面套餐 ${getMembershipPlanLabel(currentPlan)}`}</Tag> : null}
                {membership?.status === 'expired' ? <Tag color="red">已到期，按 Free 额度执行</Tag> : null}
              </Space>
              <Space size={8} wrap>
                <span style={{ color: '#595959', fontSize: 13 }}>企业钱包可用余额</span>
                <strong style={{ fontSize: 18, lineHeight: 1.2 }}>
                  {formatFullNumber(pointsWallet?.available_points ?? 0)} 积分
                </strong>
              </Space>
            </div>
            <Descriptions size="small" column={2}>
              <Descriptions.Item label="有效期">{formatDateTime(membership?.expires_at)}</Descriptions.Item>
              <Descriptions.Item label="预约变更">
                {membership?.next_plan ? (
                  <Space>
                    <Tag color="gold">到期后降级到 {getMembershipPlanLabel(membership.next_plan)}</Tag>
                    <Button size="small" onClick={() => void handleCancelScheduledMembershipChange()}>
                      取消预约
                    </Button>
                  </Space>
                ) : (
                  '-'
                )}
              </Descriptions.Item>
            </Descriptions>
          </div>
        </Card>

        {overLimitItems.length ? (
          <Alert
            type="warning"
            showIcon
            title="当前资源已超出有效套餐额度，既有资源保留，但新增成员、发布/恢复任务或继续导入数据集会被阻断。"
          />
        ) : null}

        <div style={membershipUsageGridStyle}>
          {renderMembershipUsageCard('成员', usage.members, limits.members, '人')}
          {renderMembershipUsageCard('活跃生产任务', usage.active_tasks, limits.active_tasks, '个')}
          {renderMembershipUsageCard('数据集存储', usage.storage_bytes, limits.storage_bytes, '', true)}
        </div>

        <div style={membershipPlanGridStyle}>
          {plans.map((plan) => {
            const isCurrent = plan.plan === effectivePlan && plan.plan !== 'more';
            const isFree = plan.plan === 'free';
            const fee = plan.annual_fee_points ?? 0;
            const insufficient = Boolean(plan.purchasable && pointsWallet && fee > pointsWallet.available_points);
            return (
              <Card
                key={plan.plan}
                size="small"
                title={
                  <Space>
                    <span>{plan.name}</span>
                    {isCurrent ? <Tag color="blue">当前</Tag> : null}
                  </Space>
                }
              >
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="年费">
                    {plan.contact_only ? '联系平台定制' : `${formatFullNumber(fee)} 积分 / 年`}
                  </Descriptions.Item>
                  <Descriptions.Item label="成员上限">
                    {plan.member_limit === null || plan.member_limit === undefined ? '定制' : `${plan.member_limit} 人`}
                  </Descriptions.Item>
                  <Descriptions.Item label="活跃任务">
                    {plan.active_task_limit === null || plan.active_task_limit === undefined ? '定制' : `${plan.active_task_limit} 个`}
                  </Descriptions.Item>
                  <Descriptions.Item label="数据集存储">
                    {plan.storage_bytes_limit ? formatStorageBytes(plan.storage_bytes_limit) : '定制'}
                  </Descriptions.Item>
                </Descriptions>
                <div style={{ marginTop: 12 }}>
                  {plan.contact_only ? (
                    <Button block icon={<InfoCircleOutlined />} onClick={() => openMembershipDrawer(plan)}>
                      联系平台定制
                    </Button>
                  ) : isCurrent ? (
                    <Button block disabled>
                      当前套餐
                    </Button>
                  ) : isFree ? (
                    <Button block onClick={scheduleFreeDowngrade}>
                      预约降级
                    </Button>
                  ) : (
                    <Tooltip title={insufficient ? '企业钱包可用余额不足，请先充值' : undefined}>
                      <Button block type="primary" icon={<WalletOutlined />} onClick={() => openMembershipDrawer(plan)}>
                        购买 / 续费
                      </Button>
                    </Tooltip>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  function renderPointsTab() {
    return (
      <div style={tabStackStyle}>
        <div style={summaryGridStyle}>
          {walletSummaryItems.map((item) => renderSummaryCard(item.key, item.label, item.value, item.tone))}
        </div>

        <div style={actionStripStyle}>
          <Space wrap size={[8, 8]}>
            <Button type="primary" icon={<WalletOutlined />} onClick={openPointsRechargeDrawer}>
              积分充值
            </Button>
            <Button
              icon={<BankOutlined />}
              onClick={openPointsWithdrawDrawer}
              disabled={!pointsWallet || maxWithdrawablePoints <= 0}
            >
              积分提现
            </Button>
            {canViewWalletSecurity ? (
              <Button icon={<SettingOutlined />} onClick={() => openPaymentPasswordDrawer()}>
                支付密码
              </Button>
            ) : null}
            <Button icon={<InfoCircleOutlined />} onClick={openPointsAlertDrawer}>
              预警设置
            </Button>
            <Button icon={<EyeOutlined />} onClick={() => onOpenLogs?.({ entity_type: 'points_budget' })}>
              积分审计
            </Button>
          </Space>

          <Space wrap size={[8, 8]} align="center">
            {renderStatusBadge(walletStatus.label, walletStatus.emphasis)}
            {pointsWallet?.alert_enabled ? (
              renderStatusBadge(`预警余额 ${formatCompactNumber(pointsWallet.alert_threshold)}`)
            ) : (
              renderStatusBadge('预警关闭')
            )}
            {canViewWalletSecurity ? (
              renderStatusBadge(`支付密码${paymentPasswordStatus?.is_set ? '已设置' : '未设置'}`)
            ) : null}
          </Space>
        </div>

        <div style={ledgerToolbarStyle}>
          <Input.Search
            value={ledgerFilters.keyword}
            onChange={(event) =>
              setLedgerFilters((current) => ({ ...current, keyword: event.target.value }))
            }
            placeholder="搜索备注、流水号或关联对象"
            allowClear
            style={{ minWidth: 240, flex: 1 }}
            aria-label="流水关键词"
          />
          <DatePicker.RangePicker
            value={ledgerFilters.dateRange}
            onChange={(value) =>
              setLedgerFilters((current) => ({
                ...current,
                dateRange: value ? [value[0], value[1]] : null,
              }))
            }
            style={{ minWidth: 260 }}
            getPopupContainer={workspacePopupContainer}
            allowClear
          />
          <Button icon={<ReloadOutlined />} onClick={resetLedgerFilters} disabled={!hasActiveLedgerFilters}>
            重置筛选
          </Button>
          <Dropdown
            menu={{
              items: [
                { key: 'csv', label: '导出 CSV' },
                { key: 'excel', label: '导出 XLSX' },
                { key: 'json', label: '导出 JSON' },
              ],
              onClick: ({ key }) => handleLedgerExport(key as LedgerExportFormat),
            }}
            trigger={['click']}
          >
            <Button icon={<DownloadOutlined />} aria-label="导出流水">
              导出流水
            </Button>
          </Dropdown>
        </div>

        <EnhancedTable<TeamPointsWalletLedgerItem>
          className="workspace-fixed-table"
          loading={tabLoading}
          rowKey="ledger_id"
          dataSource={filteredPointsLedger}
          locale={{ emptyText: '暂无钱包流水' }}
          pagination={{ pageSize: 10, showSizeChanger: true, showQuickJumper: true, placement: ['bottomEnd'] }}
          scroll={{ x: 'max-content', y: 'calc(var(--workspace-table-body-height) - 222px)' }}
          columns={buildPointsLedgerColumns(ledgerFilters)}
          onChange={(_, tableFilters) =>
            setLedgerFilters((current) => ({
              ...current,
              transactionType: getSingleTableFilterValue(tableFilters.transaction_type),
              paymentMethod: getSingleTableFilterValue(tableFilters.payment_method),
              status: getSingleTableFilterValue(tableFilters.status),
            }))
          }
        />
      </div>
    );
  }

  function renderAiOverviewTab() {
    return (
      <div style={tabStackStyle}>
        <div style={summaryGridStyle}>
          {aiMetricItems.map((item) =>
            renderSummaryCard(
              item.key,
              item.label,
              item.value,
              'ai',
              item.isCost ? formatCostNumber(item.value) : undefined,
            ),
          )}
        </div>

        <div style={resourceStatusStripStyle}>
          <Space wrap size={[12, 12]} align="center">
            <div style={{ display: 'grid', gap: 4 }}>
              <span style={{ color: '#8c8c8c', fontSize: 12 }}>AI 调用积分钱包</span>
              <strong style={{ fontSize: 22, lineHeight: 1.2 }}>{formatAiWalletPoints(aiWallet?.balance_points ?? 0)}</strong>
            </div>
            {renderStatusBadge(aiWallet && aiWallet.balance_points > 0 ? '可调用平台共享路由' : '余额不足')}
            {estimateResult ? renderStatusBadge(estimateResult) : null}
          </Space>
          <span style={{ color: '#8c8c8c', fontSize: 12 }}>最近更新 {formatDateTime(aiWallet?.updated_at)}</span>
        </div>

        <div style={actionStripStyle}>
          <Space wrap size={[8, 8]}>
            <Button type="primary" icon={<WalletOutlined />} onClick={openAiWalletRechargeDrawer}>
              AI 积分充值
            </Button>
            <Dropdown
              trigger={['click']}
              menu={{
                items: [{ key: 'audit', label: 'AI 审计', icon: <InfoCircleOutlined /> }],
                onClick: () => onOpenLogs?.({ entity_type: 'ai_resource' }),
              }}
            >
              <Button icon={<SettingOutlined />}>更多操作</Button>
            </Dropdown>
          </Space>
        </div>

        <div style={ledgerToolbarStyle}>
          <Input.Search
            value={aiHistoryKeyword}
            onChange={(event) => setAiHistoryKeyword(event.target.value)}
            placeholder="搜索 Provider / 请求号 / 路由"
            allowClear
            style={{ minWidth: 240, flex: 1 }}
            aria-label="AI 历史关键词"
          />
          <DatePicker.RangePicker
            value={aiHistoryDateRange}
            onChange={(value) => setAiHistoryDateRange(value ? [value[0], value[1]] : null)}
            style={{ minWidth: 260 }}
            getPopupContainer={workspacePopupContainer}
            allowClear
          />
          <Button icon={<ReloadOutlined />} onClick={resetAiHistoryFilters} disabled={!hasActiveAiHistoryFilters}>
            重置筛选
          </Button>
        </div>

        <EnhancedTable<TeamAiHistoryItem>
          className="workspace-fixed-table"
          loading={tabLoading}
          rowKey="history_id"
          dataSource={filteredAiHistory}
          locale={{ emptyText: '暂无调用历史' }}
          pagination={{ pageSize: 10, showSizeChanger: true, showQuickJumper: true, placement: ['bottomEnd'] }}
          scroll={{ x: 'max-content', y: 'calc(var(--workspace-table-body-height) - 205px)' }}
          columns={buildAiHistoryColumns(aiHistory)}
        />
      </div>
    );
  }

  function renderProviderTab() {
    const currentProvider = selectedProvider;
    const actionBusy = providerActionLoadingId === currentProvider?.provider_id;
    const providerReadOnly = Boolean(currentProvider && currentProvider.team_can_manage === false);
    const teamProviderCount = visibleProviders.length;
    const inPlatformView = providerViewMode === 'platform';

    return (
      <div style={providerPageShellStyle}>
        <div style={providerStickyActionStripStyle}>
          <Space wrap size={[8, 8]}>
            <Button size="small" type="primary" onClick={() => openCreateProviderDrawer()}>
              新增配置
            </Button>
            <Segmented<ProviderViewMode>
              size="small"
              value={providerViewMode}
              onChange={(value) => setProviderViewMode(value)}
              options={[
                { label: '企业自配', value: 'team' },
                { label: '平台 Provider', value: 'platform' },
              ]}
            />
            <Button size="small" icon={<SettingOutlined />} onClick={openAgentDrawer} disabled={!canOpenAgentSettings}>
              Agent 设置
            </Button>
          </Space>
          <Space wrap size={[8, 8]}>
            <Tag variant="filled" color="blue">平台共享 {platformProviders.length}</Tag>
            <Tag variant="filled" color="geekblue">企业自配 {teamProviderCount}</Tag>
            <Tag variant="filled" color="green">启用中 {providerEnabledCount}</Tag>
          </Space>
        </div>

        <div style={providerPageContentStyle}>
          <div style={providerCenterLayoutStyle}>
            <div style={providerListPaneStyle}>
              <Card
                title={inPlatformView ? '平台 Provider' : '配置列表'}
                size="small"
                style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
                extra={
                  inPlatformView ? (
                    <Tag variant="filled" color="blue">{platformProviders.length}</Tag>
                  ) : (
                    <Space size={6}>
                      <Tag>{teamProviderCount}</Tag>
                      <Select
                        size="small"
                        value={providerListStatus}
                        onChange={(value) => setProviderListStatus(value)}
                        options={[
                          { label: '全部状态', value: 'all' },
                          { label: '启用中', value: 'enabled' },
                          { label: '已停用', value: 'disabled' },
                        ]}
                        variant="borderless"
                        popupMatchSelectWidth={false}
                        getPopupContainer={workspacePopupContainer}
                        style={{ minWidth: 104 }}
                      />
                    </Space>
                  )
                }
                styles={{ body: { padding: 8, display: 'grid', gap: 6, flex: 1, minHeight: 0, overflow: 'auto', alignContent: 'start' } }}
              >
                {providerOptionsInView.length === 0 ? (
                  <Alert type="info" showIcon title={inPlatformView ? '当前还没有可见的平台 Provider。' : '当前还没有企业自配 Provider。'} />
                ) : (
                  providerOptionsInView.map((item) => (
                    <button
                      key={item.provider_id}
                      type="button"
                      onClick={() => setSelectedProviderId(item.provider_id)}
                      style={providerListCardStyle(item.provider_id === currentProvider?.provider_id)}
                    >
                      <div style={{ display: 'grid', gap: 5, textAlign: 'left' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                          <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                            <strong
                              style={{
                                fontSize: 13,
                                color: '#1f1f1f',
                                lineHeight: 1.35,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {getProviderDisplayName(item)}
                            </strong>
                            {item.scope === 'platform' ? null : (
                              <span style={providerMetaLineStyle}>
                                {getProviderKind(item)} / {getProviderModelId(item)}
                              </span>
                            )}
                          </div>
                          <Tag color={providerStatusColors[item.status] || 'default'}>{item.status === 'enabled' ? '启用中' : item.status === 'disabled' ? '已停用' : item.status}</Tag>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {item.is_platform_default ? <Tag variant="filled" color="gold">默认</Tag> : null}
                          {item.team_can_manage === false ? <Tag variant="filled">只读</Tag> : null}
                          <Tag variant="filled" color={item.api_key_configured ? 'green' : 'default'}>
                            {item.api_key_configured ? 'Key' : '无 Key'}
                          </Tag>
                          <Tag variant="filled" color={providerStatusColors[item.last_test_status ?? 'missing'] || 'default'}>
                            {getProviderTestStatusLabel(item.last_test_status)}
                          </Tag>
                        </div>
                        <div style={providerMetaLineStyle}>{formatProviderPricingSummary(item, formatMoneyByMillion)}</div>
                        {inPlatformView ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {(item.capabilities?.length ? item.capabilities : ['text']).map((capability) => (
                              <Tag key={`${item.provider_id}-${capability}`} variant="filled" color="cyan">
                                {getProviderCapabilityLabel(capability)}
                              </Tag>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </button>
                  ))
                )}
              </Card>
            </div>

            <div style={providerDetailPaneStyle}>
              <Card
                size="small"
                style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                title={
                  currentProvider
                    ? getProviderDisplayName(currentProvider)
                    : 'Provider 详情'
                }
                extra={
                  currentProvider ? (
                    providerReadOnly ? (
                      currentProvider.scope === 'platform' ? (
                        <Tag variant="filled" color="blue">平台共享</Tag>
                      ) : null
                    ) : (
                      <Space wrap size={[8, 8]}>
                        <Button size="small" icon={<EditOutlined />} onClick={() => openEditProviderDrawer(currentProvider)}>
                          编辑
                        </Button>
                        <Button
                          size="small"
                          icon={<ReloadOutlined />}
                          loading={actionBusy}
                          onClick={() => void runProviderTest(currentProvider)}
                        >
                          连通性检测
                        </Button>
                        <Dropdown
                          trigger={['click']}
                          menu={{
                            items: [
                              { key: 'duplicate', label: '复制配置', icon: <CopyOutlined /> },
                              {
                                key: 'status',
                                label: currentProvider.status === 'enabled' ? '停用配置' : '启用配置',
                                icon:
                                  currentProvider.status === 'enabled' ? <PauseCircleOutlined /> : <PlayCircleOutlined />,
                              },
                              { key: 'delete', label: '删除配置', icon: <DeleteOutlined />, danger: true },
                            ],
                            onClick: ({ key }) => {
                              if (key === 'duplicate') {
                                void duplicateProvider(currentProvider);
                                return;
                              }
                              if (key === 'status') {
                                void toggleProviderStatus(currentProvider);
                                return;
                              }
                              if (key === 'delete') {
                                modal.confirm({
                                  title: '删除 Provider 配置',
                                  content: `删除后将移除 Provider “${getProviderDisplayName(currentProvider)}”。`,
                                  okText: '删除',
                                  okButtonProps: { danger: true },
                                  cancelText: '取消',
                                  onOk: async () => removeProvider(currentProvider),
                                });
                              }
                            },
                          }}
                        >
                          <Button size="small" loading={actionBusy} icon={<SettingOutlined />}>
                            更多
                          </Button>
                        </Dropdown>
                      </Space>
                    )
                  ) : null
                }
                styles={{ body: { padding: 10, flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overflowX: 'hidden' } }}
              >
                {currentProvider ? (
                  currentProvider.scope === 'platform' ? (
                    <div style={providerDetailBodyStackStyle}>
                      <Space wrap size={[8, 8]}>
                        <Tag variant="filled" color="blue">平台共享</Tag>
                        {currentProvider.is_platform_default ? <Tag variant="filled" color="gold">平台默认</Tag> : null}
                        <Tag variant="filled" color={providerStatusColors[currentProvider.status] || 'default'}>
                          {currentProvider.status === 'enabled' ? '启用中' : currentProvider.status === 'disabled' ? '已停用' : currentProvider.status}
                        </Tag>
                      </Space>
                      <div style={providerSharedCompactGridStyle}>
                        <div style={providerSharedCompactCellStyle}>
                          <span style={providerMetaLineStyle}>输入费率</span>
                          <strong>{formatMoneyByMillion(currentProvider.pricing?.input_price_per_million ?? 0)}</strong>
                        </div>
                        <div style={providerSharedCompactCellStyle}>
                          <span style={providerMetaLineStyle}>输出费率</span>
                          <strong>{formatMoneyByMillion(currentProvider.pricing?.output_price_per_million ?? 0)}</strong>
                        </div>
                        <div style={providerSharedCompactCellStyle}>
                          <span style={providerMetaLineStyle}>Cache 命中</span>
                          <strong>{formatMoneyByMillion(currentProvider.pricing?.cache_hit_price_per_million ?? 0)}</strong>
                        </div>
                        <div style={providerSharedCompactCellStyle}>
                          <span style={providerMetaLineStyle}>模态能力</span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {(currentProvider.capabilities?.length ? currentProvider.capabilities : ['text']).map((capability) => (
                              <Tag key={capability} color={capability === 'text' ? 'blue' : 'cyan'}>
                                {getProviderCapabilityLabel(capability)}
                              </Tag>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                  <div style={providerManagedDetailLayoutStyle}>
                    <div style={providerHeroStyle}>
                      <div style={providerHeroMainStyle}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          <Tag color="blue">{getProviderKind(currentProvider)}</Tag>
                          <Tag variant="filled">企业自有</Tag>
                          <Tag color={providerStatusColors[currentProvider.status] || 'default'}>
                            {currentProvider.status === 'enabled' ? '启用中' : currentProvider.status === 'disabled' ? '已停用' : currentProvider.status}
                          </Tag>
                          <Tag color={currentProvider.api_key_configured ? 'green' : 'default'}>
                            {currentProvider.api_key_configured ? 'API Key 已配置' : 'API Key 未配置'}
                          </Tag>
                        </div>
                        <div style={{ fontSize: 13, color: '#595959' }}>{currentProvider.remark || '用于任务侧直接选择的 Provider 配置。'}</div>
                        <div style={providerHeroSummaryGridStyle}>
                          <div style={providerHeroSummaryItemStyle}>
                            <span style={providerMetaLineStyle}>Provider 名称</span>
                            <strong>{getProviderDisplayName(currentProvider)}</strong>
                          </div>
                          <div style={providerHeroSummaryItemStyle}>
                            <span style={providerMetaLineStyle}>模型</span>
                            <strong>{getProviderModelId(currentProvider)}</strong>
                          </div>
                          <div style={providerHeroSummaryItemStyle}>
                            <span style={providerMetaLineStyle}>{getProviderOptionMeta(getProviderKind(currentProvider)).endpointLabel}</span>
                            <strong style={providerHeroLongValueStyle}>{currentProvider.api_base || '-'}</strong>
                          </div>
                          <div style={providerHeroSummaryItemStyle}>
                            <span style={providerMetaLineStyle}>更新时间</span>
                            <strong>{formatDateTime(currentProvider.updated_at)}</strong>
                          </div>
                        </div>
                      </div>
                      <div style={providerStatClusterStyle}>
                        <div style={providerMiniStatStyle}>
                          <span>输入费率</span>
                          <strong>{formatMoneyByMillion(currentProvider.pricing?.input_price_per_million ?? 0)}</strong>
                        </div>
                        <div style={providerMiniStatStyle}>
                          <span>输出费率</span>
                          <strong>{formatMoneyByMillion(currentProvider.pricing?.output_price_per_million ?? 0)}</strong>
                        </div>
                        <div style={providerMiniStatStyle}>
                          <span>Cache 命中</span>
                          <strong>{formatMoneyByMillion(currentProvider.pricing?.cache_hit_price_per_million ?? 0)}</strong>
                        </div>
                      </div>
                    </div>

                    <div style={providerSectionGridStyle}>
                      <Card size="small" title={<Space><ApiOutlined />基础信息</Space>} styles={{ body: { padding: 10 } }}>
                        <Descriptions size="small" column={2}>
                          <Descriptions.Item label="Provider 名称">{getProviderDisplayName(currentProvider)}</Descriptions.Item>
                          <Descriptions.Item label="Provider 类型">{getProviderKind(currentProvider)}</Descriptions.Item>
                          <Descriptions.Item label="模型">{getProviderModelId(currentProvider)}</Descriptions.Item>
                          <Descriptions.Item label="作用域">企业</Descriptions.Item>
                        </Descriptions>
                      </Card>

                      <Card size="small" title={<Space><CloudServerOutlined />鉴权与接入</Space>} styles={{ body: { padding: 10 } }}>
                        <Descriptions size="small" column={2}>
                          <Descriptions.Item label={getProviderOptionMeta(getProviderKind(currentProvider)).endpointLabel}>
                            {currentProvider.api_base || '-'}
                          </Descriptions.Item>
                          <Descriptions.Item label="API Key">{maskStoredApiKey(currentProvider.api_key_configured)}</Descriptions.Item>
                          <Descriptions.Item label="更新时间">{formatDateTime(currentProvider.updated_at)}</Descriptions.Item>
                        </Descriptions>
                      </Card>
                      <Card size="small" title={<Space><CloudServerOutlined />专属接入参数</Space>} styles={{ body: { padding: 10 } }}>
                        {renderProviderRuntimeDetails(currentProvider, { formatFullNumber })}
                      </Card>
                    </div>

                    <div style={providerManagedBottomGridStyle}>
                      <Card size="small" title={<Space><RobotOutlined />模型与运行参数</Space>} styles={{ body: { padding: 10 } }}>
                        <Descriptions size="small" column={2}>
                          <Descriptions.Item label="Temperature">{formatOptionalNumber(currentProvider.runtime_config?.temperature)}</Descriptions.Item>
                          <Descriptions.Item label="Max Output Tokens">{formatOptionalNumber(currentProvider.runtime_config?.max_output_tokens)}</Descriptions.Item>
                          <Descriptions.Item label="Timeout">{currentProvider.runtime_config?.timeout_ms ? `${currentProvider.runtime_config.timeout_ms} ms` : '-'}</Descriptions.Item>
                          <Descriptions.Item label="Reasoning">{String(currentProvider.runtime_config?.reasoning_effort || '-')}</Descriptions.Item>
                          <Descriptions.Item label="协议模板">{currentProvider.protocol_profile || '-'}</Descriptions.Item>
                        </Descriptions>
                      </Card>

                      <Card size="small" title={<Space><SafetyCertificateOutlined />能力声明</Space>} styles={{ body: { padding: 10 } }}>
                        <Space wrap>
                          {(currentProvider.capabilities?.length ? currentProvider.capabilities : ['text']).map((capability) => (
                            <Tag key={capability} color={capability === 'text' ? 'blue' : 'cyan'}>
                              {getProviderCapabilityLabel(capability)}
                            </Tag>
                          ))}
                        </Space>
                      </Card>

                      <Card
                        size="small"
                        title={<Space><ThunderboltOutlined />最近测试</Space>}
                        styles={{ body: { padding: 10, height: '100%', display: 'grid', alignContent: 'start' } }}
                      >
                        <Descriptions size="small" column={2}>
                          <Descriptions.Item label="测试状态">{getProviderTestStatusLabel(currentProvider.last_test_status)}</Descriptions.Item>
                          <Descriptions.Item label="测试时间">{formatDateTime(currentProvider.last_test_at)}</Descriptions.Item>
                          <Descriptions.Item label="延迟">{currentProvider.last_test_latency_ms ? `${currentProvider.last_test_latency_ms} ms` : '-'}</Descriptions.Item>
                          <Descriptions.Item label="请求编号">{currentProvider.last_request_id ? formatShortId(currentProvider.last_request_id) : '-'}</Descriptions.Item>
                        </Descriptions>
                        {currentProvider.last_test_error ? <Alert type="error" showIcon title={currentProvider.last_test_error} style={{ marginTop: 12 }} /> : null}
                      </Card>
                    </div>
                  </div>
                )
                ) : (
                  <Alert type="info" showIcon title="请选择左侧配置查看详情" />
                )}
              </Card>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderSummaryCard(key: string, label: string, value: number, tone: string, textOverride?: string) {
    const toneStyle = summaryToneStyles[tone] ?? summaryToneStyles.wallet;
    const fullValue = textOverride ?? formatFullNumber(value);
    const displayValue = textOverride ?? formatCompactNumber(value);

    return (
      <Card
        key={key}
        size="small"
        styles={{ body: { padding: 14 } }}
        style={{
          borderRadius: 16,
          borderColor: toneStyle.borderColor,
          background: toneStyle.background,
          minWidth: 0,
        }}
      >
        <div style={{ display: 'grid', gap: 8 }}>
          <span style={{ color: '#595959', fontSize: 13 }}>{label}</span>
          <Tooltip title={fullValue}>
            <strong
              aria-label={fullValue}
              style={{
                fontSize: 26,
                lineHeight: 1.2,
                letterSpacing: '-0.02em',
                display: 'block',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {displayValue}
            </strong>
          </Tooltip>
        </div>
      </Card>
    );
  }
}

const tabStackStyle = {
  display: 'grid',
  gap: 16,
} satisfies React.CSSProperties;

const providerPageShellStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
  minHeight: 0,
  height: '100%',
  background: '#ffffff',
  borderRadius: 14,
  border: '1px solid rgba(5, 5, 5, 0.06)',
  overflow: 'hidden',
} satisfies React.CSSProperties;

const providerPageContentStyle = {
  display: 'grid',
  gridTemplateRows: 'minmax(0, 1fr)',
  gap: 0,
  padding: 8,
  background: '#ffffff',
  minHeight: 0,
  overflow: 'hidden',
} satisfies React.CSSProperties;

const summaryGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: 10,
} satisfies React.CSSProperties;

const membershipUsageGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
} satisfies React.CSSProperties;

const membershipPlanGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
} satisfies React.CSSProperties;

const actionStripStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
  padding: 10,
  border: '1px solid rgba(5, 5, 5, 0.06)',
  borderRadius: 14,
  background: '#ffffff',
} satisfies React.CSSProperties;

const resourceStatusStripStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
  padding: 10,
  border: '1px solid rgba(5, 5, 5, 0.06)',
  borderRadius: 14,
  background: '#ffffff',
} satisfies React.CSSProperties;

const providerStickyActionStripStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
  padding: '10px 12px',
  position: 'sticky',
  top: 0,
  zIndex: 8,
  background: '#ffffff',
  borderRadius: '14px 14px 0 0',
  borderBottom: '1px solid rgba(5, 5, 5, 0.06)',
  boxShadow: '0 6px 14px rgba(0, 0, 0, 0.04)',
} satisfies React.CSSProperties;

const providerCenterLayoutStyle = {
  display: 'grid',
  gridTemplateColumns: '240px minmax(0, 1fr)',
  gap: 8,
  alignItems: 'stretch',
  minHeight: 0,
  height: '100%',
} satisfies React.CSSProperties;

const providerListPaneStyle = {
  minWidth: 0,
  minHeight: 0,
  display: 'grid',
  height: '100%',
} satisfies React.CSSProperties;

const providerDetailPaneStyle = {
  minWidth: 0,
  minHeight: 0,
  display: 'grid',
  height: '100%',
  overflow: 'hidden',
} satisfies React.CSSProperties;

const providerSharedGridStyle = {
  display: 'grid',
  gap: 8,
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
} satisfies React.CSSProperties;

const providerSectionGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 8,
} satisfies React.CSSProperties;

const providerManagedDetailLayoutStyle = {
  display: 'grid',
  gap: 8,
  alignContent: 'start',
} satisfies React.CSSProperties;

const providerManagedBottomGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 8,
  alignItems: 'start',
} satisfies React.CSSProperties;

const providerHeroStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
  flexWrap: 'wrap',
  padding: 8,
  borderRadius: 12,
  border: '1px solid rgba(5, 5, 5, 0.08)',
  background: '#fafafa',
  alignItems: 'stretch',
} satisfies React.CSSProperties;

const providerHeroMainStyle = {
  display: 'grid',
  gap: 8,
  flex: '1 1 420px',
  minWidth: 0,
} satisfies React.CSSProperties;

const providerHeroSummaryGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 8,
  minWidth: 0,
} satisfies React.CSSProperties;

const providerHeroSummaryItemStyle = {
  display: 'grid',
  gap: 4,
  padding: '8px 10px',
  borderRadius: 10,
  border: '1px solid rgba(5, 5, 5, 0.06)',
  background: '#ffffff',
  minWidth: 0,
} satisfies React.CSSProperties;

const providerHeroLongValueStyle = {
  display: 'block',
  minWidth: 0,
  overflowWrap: 'anywhere',
  lineHeight: 1.4,
} satisfies React.CSSProperties;

const providerStatClusterStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(88px, 1fr))',
  gap: 4,
  minWidth: 0,
} satisfies React.CSSProperties;

const providerMiniStatStyle = {
  display: 'grid',
  gap: 2,
  padding: '6px 8px',
  borderRadius: 8,
  background: '#ffffff',
  border: '1px solid rgba(5, 5, 5, 0.06)',
  minWidth: 0,
} satisfies React.CSSProperties;

const providerMetaLineStyle = {
  fontSize: 11,
  color: '#595959',
  lineHeight: 1.4,
} satisfies React.CSSProperties;

const providerSharedDetailStackStyle = {
  display: 'grid',
  gap: 10,
  alignContent: 'start',
} satisfies React.CSSProperties;

const providerDetailBodyStackStyle = {
  display: 'grid',
  gap: 8,
  alignContent: 'start',
} satisfies React.CSSProperties;

const providerSharedCompactGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
} satisfies React.CSSProperties;

const providerSharedCompactCellStyle = {
  display: 'grid',
  gap: 6,
  alignContent: 'start',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid rgba(5, 5, 5, 0.06)',
  background: '#fafafa',
  minWidth: 0,
} satisfies React.CSSProperties;

const providerSharedNameOnlyStyle = {
  minHeight: 34,
  display: 'flex',
  alignItems: 'center',
  textAlign: 'left',
} satisfies React.CSSProperties;

const ledgerToolbarStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  alignItems: 'center',
  padding: '4px 0',
} satisfies React.CSSProperties;

const methodGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: 12,
} satisfies React.CSSProperties;

function buildMethodCardStyle(active: boolean): React.CSSProperties {
  return {
    display: 'grid',
    gap: 10,
    alignContent: 'start',
    padding: 16,
    borderRadius: 16,
    border: `1px solid ${active ? '#1677ff' : 'rgba(5, 5, 5, 0.08)'}`,
    background: active ? '#f0f5ff' : '#ffffff',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'border-color 0.2s ease, background-color 0.2s ease',
  };
}

function buildMethodIconStyle(value: string): React.CSSProperties {
  const background =
    value === 'wechat'
      ? '#f6ffed'
      : value === 'alipay'
        ? '#e6f4ff'
        : '#fff7e6';
  const color =
    value === 'wechat'
      ? '#389e0d'
      : value === 'alipay'
        ? '#1677ff'
        : '#d48806';

  return {
    width: 40,
    height: 40,
    borderRadius: 12,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background,
    color,
    fontSize: 20,
  };
}

function providerListCardStyle(active: boolean): React.CSSProperties {
  return {
    width: '100%',
    border: `1px solid ${active ? '#1677ff' : 'rgba(5, 5, 5, 0.08)'}`,
    background: active ? '#f0f5ff' : '#ffffff',
    borderRadius: 12,
    padding: 8,
    cursor: 'pointer',
    transition: 'border-color 0.2s ease, background-color 0.2s ease',
  };
}

function formatMoneyByMillion(value: number): string {
  return `${value.toLocaleString('zh-CN', { maximumFractionDigits: 4 })} 元 / 1M`;
}

function getAiHistoryProviderName(item: TeamAiHistoryItem): string {
  const providerName = item.provider_name?.trim();
  if (item.record_type === 'ai_call') {
    return providerName || item.route_name?.trim() || item.source_label?.trim() || '未关联 Provider';
  }
  if (item.record_type === 'transfer_in') {
    return '企业积分钱包';
  }
  return providerName || item.source_label?.trim() || item.route_name?.trim() || '余额调整';
}

function getAiHistoryRequestId(item: TeamAiHistoryItem): string {
  const requestId = item.request_id?.trim();
  if (!requestId) {
    return '-';
  }
  if (requestId === item.source_label?.trim() || requestId === item.route_name?.trim()) {
    return '-';
  }
  return requestId;
}

function formatAiWalletPoints(value: number): string {
  return `${value.toLocaleString('zh-CN', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 4,
  })} 积分`;
}

function renderAiHistoryDelta(value: number) {
  if (value === 0) {
    return <span style={{ color: '#8c8c8c', fontWeight: 600 }}>0 积分</span>;
  }
  const positive = value >= 0;
  return (
    <span style={{ color: positive ? '#389e0d' : '#cf1322', fontWeight: 600 }}>
      {positive ? '+' : ''}
      {formatAiWalletPoints(value)}
    </span>
  );
}

function getAiWalletStatusColor(balancePoints: number): string {
  return balancePoints > 0 ? 'blue' : 'red';
}

function formatOptionalNumber(value: number | undefined): string {
  return typeof value === 'number' ? String(value) : '-';
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    return error.requestId ? `${error.message}（请求编号：${formatShortId(error.requestId)}）` : error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

function extractFailedProviderTestResult(error: unknown) {
  if (!(error instanceof ApiClientError)) {
    return null;
  }
  const detail = error.detail && typeof error.detail === 'object'
    ? error.detail as Record<string, unknown>
    : null;
  return {
    provider_id: '',
    route_name: '',
    provider_kind: '',
    model: '',
    latency_ms: typeof detail?.latency_ms === 'number' ? detail.latency_ms : 0,
    status: 'failed',
    request_id: typeof detail?.request_id === 'string' ? detail.request_id : error.requestId,
  };
}

function getWalletStatus(
  pointsWallet: TeamPointsBudgetPayload | null,
): { label: string; emphasis?: boolean } {
  if (!pointsWallet) {
    return { label: '钱包数据不可用' };
  }

  if (pointsWallet.available_points <= 0) {
    return { label: '可用余额耗尽' };
  }

  if (pointsWallet.alert_enabled && pointsWallet.available_points <= pointsWallet.alert_threshold) {
    return { label: '接近预警', emphasis: true };
  }

  return { label: '余额充足', emphasis: true };
}

function isBankTransferWithdraw(method: WithdrawMethod | undefined): boolean {
  return method === 'bank_transfer';
}

function formatCompactNumber(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1_000_000_000_000) {
    return `${trimCompact(value / 1_000_000_000_000)}T`;
  }
  if (absValue >= 1_000_000_000) {
    return `${trimCompact(value / 1_000_000_000)}B`;
  }
  if (absValue >= 1_000_000) {
    return `${trimCompact(value / 1_000_000)}M`;
  }
  if (absValue >= 1_000) {
    return `${trimCompact(value / 1_000)}K`;
  }
  return formatFullNumber(value);
}

function trimCompact(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 100) return value.toFixed(0);
  if (absValue >= 10) return value.toFixed(1).replace(/\.0$/, '');
  return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function formatFullNumber(value: number): string {
  return Math.trunc(value).toLocaleString('zh-CN');
}

function formatCostNumber(value: number): string {
  return `${value.toFixed(6)}`;
}

function sanitizeIntegerInput(value: string): string {
  return value.replace(/[^\d]/g, '').slice(0, MAX_INPUT_LENGTH);
}

function getValidPointsAmount(value: unknown, fieldLabel: string, allowZero = false): number {
  const numericValue = Number(typeof value === 'string' ? sanitizeIntegerInput(value) : value);
  const minValue = allowZero ? 0 : 1;

  if (Number.isFinite(numericValue) && numericValue >= minValue && numericValue <= MAX_POINTS_INPUT) {
    return numericValue;
  }

  throw new Error(`${fieldLabel}需在 ${formatFullNumber(minValue)} - ${formatFullNumber(MAX_POINTS_INPUT)} 之间`);
}

function renderCompactValue(value: number | null) {
  if (value === null) return <strong>-</strong>;
  const compact = formatCompactNumber(value);
  const full = formatFullNumber(value);
  return (
    <Tooltip title={full}>
      <strong aria-label={full}>{compact}</strong>
    </Tooltip>
  );
}

function renderStatusBadge(label: string, emphasis = false) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 30,
        padding: '0 12px',
        borderRadius: 999,
        border: `1px solid ${emphasis ? 'rgba(22, 119, 255, 0.22)' : 'rgba(5, 5, 5, 0.08)'}`,
        background: emphasis ? 'rgba(22, 119, 255, 0.05)' : '#fafafa',
        color: emphasis ? '#1677ff' : '#595959',
        fontSize: 12,
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

function buildMockOrderId(): string {
  return `RCG-${Date.now().toString().slice(-8)}`;
}

function buildBankRemark(orderId: string): string {
  return `${bankTransferDetails.remarkPrefix}-${orderId}`;
}

function formatDateTime(value?: string | null) {
  return formatApiDateTime(value);
}

function defaultMembershipPlans(): TeamMembershipPlanOption[] {
  return [
    { plan: 'free', name: 'Free', annual_fee_points: 0, member_limit: 3, active_task_limit: 3, storage_bytes_limit: 3 * 1024 ** 3, purchasable: false, contact_only: false },
    { plan: 'basic', name: 'Basic', annual_fee_points: 999, member_limit: 10, active_task_limit: 5, storage_bytes_limit: 20 * 1024 ** 3, purchasable: true, contact_only: false },
    { plan: 'pro', name: 'Pro', annual_fee_points: 3999, member_limit: 50, active_task_limit: 30, storage_bytes_limit: 500 * 1024 ** 3, purchasable: true, contact_only: false },
    { plan: 'enterprise', name: 'Enterprise', annual_fee_points: 19999, member_limit: 300, active_task_limit: 200, storage_bytes_limit: 2 * 1024 ** 4, purchasable: true, contact_only: false },
    { plan: 'more', name: 'More', annual_fee_points: null, member_limit: null, active_task_limit: null, storage_bytes_limit: null, purchasable: false, contact_only: true },
  ];
}

function getMembershipPlanLabel(plan: string | null | undefined): string {
  const labels: Record<string, string> = {
    free: 'Free',
    basic: 'Basic',
    pro: 'Pro',
    enterprise: 'Enterprise',
    more: 'More',
  };
  return labels[plan || ''] || plan || '-';
}

function getMembershipPlanColor(plan: string | null | undefined): string {
  if (plan === 'enterprise') return 'purple';
  if (plan === 'pro') return 'blue';
  if (plan === 'basic') return 'green';
  if (plan === 'free') return 'default';
  return 'gold';
}

function formatStorageBytes(value: number): string {
  if (value >= 1024 ** 4) {
    return `${trimCompact(value / 1024 ** 4)} TB`;
  }
  if (value >= 1024 ** 3) {
    return `${trimCompact(value / 1024 ** 3)} GB`;
  }
  if (value >= 1024 ** 2) {
    return `${trimCompact(value / 1024 ** 2)} MB`;
  }
  return `${formatFullNumber(value)} B`;
}

function renderMembershipUsageCard(label: string, current: number, limit: number, suffix: string, isStorage = false) {
  const percent = limit > 0 ? Math.min(100, Math.round((current / limit) * 100)) : 0;
  const overLimit = current > limit;
  const currentText = isStorage ? formatStorageBytes(current) : `${formatFullNumber(current)}${suffix}`;
  const limitText = isStorage ? formatStorageBytes(limit) : `${formatFullNumber(limit)}${suffix}`;
  return (
    <Card size="small">
      <Space orientation="vertical" style={{ width: '100%' }} size={8}>
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <strong>{label}</strong>
          <Tag color={overLimit ? 'red' : 'blue'}>{currentText} / {limitText}</Tag>
        </Space>
        <Progress percent={percent} status={overLimit ? 'exception' : 'active'} showInfo={false} />
      </Space>
    </Card>
  );
}

function renderRechargeConfirmation({
  method,
  amount,
  orderId,
  submitting,
  onBack,
  onConfirm,
  extraContent,
}: {
  method: PaymentMethod;
  amount: number;
  orderId: string;
  submitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
  extraContent?: React.ReactNode;
}) {
  const methodMeta = paymentMethodOptions.find((item) => item.value === method) ?? paymentMethodOptions[0];
  const Icon = methodMeta.icon;
  const amountText = formatFullNumber(amount);
  const transferRemark = buildBankRemark(orderId);

  const summaryCard = (
    <Card size="small">
      <Descriptions column={1} size="small">
        <Descriptions.Item label="充值积分">{amountText}</Descriptions.Item>
        <Descriptions.Item label="支付方式">{methodMeta.label}</Descriptions.Item>
        <Descriptions.Item label="支付金额">{amountText} 元</Descriptions.Item>
        <Descriptions.Item label="换算比例">1 积分 = 1 元</Descriptions.Item>
        <Descriptions.Item label="订单号">{orderId}</Descriptions.Item>
      </Descriptions>
    </Card>
  );

  if (method === 'wechat') {
    return (
      <div style={{ display: 'grid', gap: 16 }}>
        <Space>
          <span style={buildMethodIconStyle('wechat')}>
            <Icon />
          </span>
          <strong>微信支付</strong>
        </Space>
        {summaryCard}
        {extraContent}
        <Card size="small">
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <div
              style={{
                width: 140,
                height: 140,
                borderRadius: 16,
                background: '#f5f5f5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 8,
                color: '#595959',
              }}
            >
              <QrcodeOutlined style={{ fontSize: 36 }} />
              <span>模拟付款码</span>
            </div>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="金额">{amountText} 元</Descriptions.Item>
              <Descriptions.Item label="订单号">{orderId}</Descriptions.Item>
              <Descriptions.Item label="有效期">15 分钟</Descriptions.Item>
            </Descriptions>
          </div>
        </Card>
        <Space>
          <Button onClick={onBack}>返回修改</Button>
          <Button type="primary" icon={<CheckCircleOutlined />} loading={submitting} onClick={onConfirm}>
            我已完成支付
          </Button>
        </Space>
      </div>
    );
  }

  if (method === 'alipay') {
    return (
      <div style={{ display: 'grid', gap: 16 }}>
        <Space>
          <span style={buildMethodIconStyle('alipay')}>
            <Icon />
          </span>
          <strong>支付宝</strong>
        </Space>
        {summaryCard}
        {extraContent}
        <Card size="small">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="支付产品">企业积分充值</Descriptions.Item>
            <Descriptions.Item label="支付金额">{amountText} 元</Descriptions.Item>
            <Descriptions.Item label="订单号">{orderId}</Descriptions.Item>
          </Descriptions>
        </Card>
        <Space>
          <Button onClick={onBack}>返回修改</Button>
          <Button icon={<AlipayCircleOutlined />}>打开支付宝</Button>
          <Button type="primary" icon={<CheckCircleOutlined />} loading={submitting} onClick={onConfirm}>
            支付完成
          </Button>
        </Space>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Space>
        <span style={buildMethodIconStyle('bank_transfer')}>
          <Icon />
        </span>
        <strong>对公转账</strong>
      </Space>
      {summaryCard}
      {extraContent}
      <Card size="small">
        <Descriptions column={1} size="small">
          <Descriptions.Item label="企业名称">{bankTransferDetails.companyName}</Descriptions.Item>
          <Descriptions.Item label="开户行">{bankTransferDetails.bankName}</Descriptions.Item>
          <Descriptions.Item label="收款账户">
            <span style={{ display: 'inline-block', wordBreak: 'break-all' }}>
              {bankTransferDetails.accountNumber}
            </span>
          </Descriptions.Item>
          <Descriptions.Item label="账户名称">{bankTransferDetails.accountName}</Descriptions.Item>
          <Descriptions.Item label="转账附言">
            <span style={{ display: 'inline-block', wordBreak: 'break-all' }}>
              {transferRemark}
            </span>
          </Descriptions.Item>
          <Descriptions.Item label="到账说明">确认后记为充值成功。</Descriptions.Item>
        </Descriptions>
      </Card>
      <Space>
        <Button onClick={onBack}>返回修改</Button>
        <Button type="primary" icon={<CheckCircleOutlined />} loading={submitting} onClick={onConfirm}>
          我已完成转账
        </Button>
      </Space>
    </div>
  );
}

function getLedgerTypeLabel(type: string): string {
  const normalizedType = normalizeLedgerTransactionType(type);
  if (normalizedType === 'recharge') return '充值';
  if (normalizedType === 'membership_fee') return '会员年费';
  if (normalizedType === 'ai_wallet_transfer') return '转入 AI 钱包';
  if (normalizedType === 'withdraw') return '提现';
  if (normalizedType === 'reward_reserve') return '预扣积分';
  if (normalizedType === 'reward_release') return '释放预扣';
  if (normalizedType === 'reward_spend') return '实扣积分';
  return type || '-';
}

function getLedgerTypeColor(type: string): string {
  const normalizedType = normalizeLedgerTransactionType(type);
  if (normalizedType === 'recharge') return 'green';
  if (normalizedType === 'membership_fee') return 'purple';
  if (normalizedType === 'ai_wallet_transfer') return 'cyan';
  if (normalizedType === 'withdraw') return 'orange';
  if (normalizedType === 'reward_reserve') return 'gold';
  if (normalizedType === 'reward_release') return 'blue';
  if (normalizedType === 'reward_spend') return 'red';
  return 'default';
}

function getAiHistoryTypeLabel(type: string): string {
  if (type === 'transfer_in') return '钱包划转';
  if (type === 'ai_call') return 'AI 调用';
  if (type === 'adjustment') return '余额调整';
  return type || '-';
}

function getAiHistoryTypeColor(type: string): string {
  if (type === 'transfer_in') return 'green';
  if (type === 'ai_call') return 'blue';
  if (type === 'adjustment') return 'orange';
  return 'default';
}

function getLedgerMethodLabel(value: string | null | undefined): string {
  const normalizedMethod = normalizeLedgerMethod(value);
  if (normalizedMethod === 'wechat') return '微信';
  if (normalizedMethod === 'alipay') return '支付宝';
  if (normalizedMethod === 'bank_transfer') return '对公转账';
  if (normalizedMethod === 'task_publish') return '任务发布';
  if (normalizedMethod === 'submission_review') return '审核结算';
  if (normalizedMethod === 'reward_release') return '释放预扣';
  return value || '-';
}

function filterLedgerItems(items: TeamPointsWalletLedgerItem[], filters: LedgerFilters): TeamPointsWalletLedgerItem[] {
  const keyword = filters.keyword.trim().toLowerCase();
  const startAt = filters.dateRange?.[0]?.startOf('day').valueOf() ?? null;
  const endAt = filters.dateRange?.[1]?.endOf('day').valueOf() ?? null;

  return items.filter((item) => {
    if (
      filters.transactionType !== 'all' &&
      normalizeLedgerTransactionType(item.transaction_type) !== filters.transactionType
    ) {
      return false;
    }

    const itemMethod = normalizeLedgerMethod(item.payment_method || item.source_type || '');
    if (filters.paymentMethod !== 'all' && itemMethod !== filters.paymentMethod) {
      return false;
    }

    if (filters.status !== 'all' && item.status !== filters.status) {
      return false;
    }

    if (keyword) {
      const haystack = [
        item.note,
        item.reference_no,
        item.source_id,
        item.operator_id,
        item.transaction_type,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (!haystack.includes(keyword)) {
        return false;
      }
    }

    if (startAt !== null || endAt !== null) {
      const createdAt = apiDateTimeValue(item.created_at);
      if (!createdAt) {
        return false;
      }
      if (startAt !== null && createdAt < startAt) {
        return false;
      }
      if (endAt !== null && createdAt > endAt) {
        return false;
      }
    }

    return true;
  });
}

function buildLedgerExportRows(items: TeamPointsWalletLedgerItem[]) {
  return items.map((item) => ({
    时间: formatDateTime(item.created_at),
    类型: getLedgerTypeLabel(item.transaction_type),
    收支方向: item.direction === 'in' ? '收入' : '支出',
    金额: formatFullNumber(item.amount),
    余额: formatFullNumber(item.balance_after),
    方式: getLedgerMethodLabel(item.payment_method || item.source_type),
    状态: item.status,
    备注: item.note || '-',
    流水号: item.reference_no || '-',
    关联对象: item.source_id || '-',
  }));
}

async function exportLedgerRows(
  items: TeamPointsWalletLedgerItem[],
  format: LedgerExportFormat,
): Promise<number> {
  const rows = buildLedgerExportRows(items);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  if (format === 'json') {
    downloadBlob(
      `points-ledger-${stamp}.json`,
      new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json;charset=utf-8' }),
    );
    return rows.length;
  }

  if (format === 'excel') {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MarkUp';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('流水');
    const headers = Object.keys(rows[0] ?? {});
    worksheet.columns = headers.map((header) => ({
      header,
      key: header,
      width: Math.max(header.length * 2, 16),
    }));
    rows.forEach((row) => worksheet.addRow(row));
    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(
      `points-ledger-${stamp}.xlsx`,
      new Blob([normalizeWorkbookBuffer(buffer)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );
    return rows.length;
  }

  const headers = Object.keys(rows[0] ?? {});
  const csv = [
    '\uFEFF' + headers.join(','),
    ...rows.map((row) =>
      headers
        .map((header) => `"${String(row[header as keyof typeof row] ?? '').replace(/"/g, '""')}"`)
        .join(','),
    ),
  ].join('\n');
  downloadBlob(
    `points-ledger-${stamp}.csv`,
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
  );
  return rows.length;
}

function normalizeWorkbookBuffer(
  buffer: ArrayBuffer | Uint8Array,
): ArrayBuffer {
  if (buffer instanceof ArrayBuffer) {
    return buffer;
  }

  return Uint8Array.from(buffer).buffer;
}

function downloadBlob(filename: string, blob: Blob) {
  const blobUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(blobUrl);
}

function buildPointsLedgerColumns(filters: LedgerFilters): ColumnsType<TeamPointsWalletLedgerItem> {
  return [
    {
      key: 'created_at',
      title: '流水时间',
      width: 180,
      sorter: (left, right) => compareDateTime(left.created_at, right.created_at),
      defaultSortOrder: 'descend',
      render: (_, item) => formatDateTime(item.created_at),
    },
    {
      key: 'transaction_type',
      title: '类型',
      width: 110,
      filters: [
        { text: '充值', value: 'recharge' },
        { text: '会员年费', value: 'membership_fee' },
        { text: '转入 AI 钱包', value: 'ai_wallet_transfer' },
        { text: '提现', value: 'withdraw' },
        { text: '预扣积分', value: 'reward_reserve' },
        { text: '释放预扣', value: 'reward_release' },
        { text: '实扣积分', value: 'reward_spend' },
      ],
      filterMultiple: false,
      filterSearch: true,
      filteredValue: filters.transactionType === 'all' ? null : [filters.transactionType],
      onFilter: (value, item) => normalizeLedgerTransactionType(item.transaction_type) === String(value),
      render: (_, item) => (
        <Tag color={getLedgerTypeColor(item.transaction_type)}>{getLedgerTypeLabel(item.transaction_type)}</Tag>
      ),
    },
    {
      key: 'direction',
      title: '收支',
      width: 140,
      sorter: (left, right) => compareNumber(left.amount, right.amount),
      render: (_, item) => (
        <span
          style={{
            color: item.direction === 'in' ? '#389e0d' : '#cf1322',
            fontWeight: 600,
          }}
        >
          {item.direction === 'in' ? '+' : '-'}
          {formatCompactNumber(item.amount)}
        </span>
      ),
    },
    {
      key: 'balance_after',
      title: '余额',
      width: 150,
      sorter: (left, right) => compareNumber(left.balance_after, right.balance_after),
      render: (_, item) => renderCompactValue(item.balance_after),
    },
    {
      key: 'payment_method',
      title: '方式',
      width: 140,
      filters: [
        { text: '微信', value: 'wechat' },
        { text: '支付宝', value: 'alipay' },
        { text: '对公转账', value: 'bank_transfer' },
        { text: '任务发布', value: 'task_publish' },
        { text: '审核结算', value: 'submission_review' },
        { text: '释放预扣', value: 'reward_release' },
      ],
      filterMultiple: false,
      filterSearch: true,
      filteredValue: filters.paymentMethod === 'all' ? null : [filters.paymentMethod],
      onFilter: (value, item) => normalizeLedgerMethod(item.payment_method || item.source_type) === String(value),
      render: (_, item) => getLedgerMethodLabel(item.payment_method || item.source_type),
    },
    {
      key: 'status',
      title: '状态',
      width: 100,
      filters: [
        { text: '已完成', value: 'completed' },
        { text: '处理中', value: 'pending' },
        { text: '已失败', value: 'failed' },
      ],
      filterMultiple: false,
      filteredValue: filters.status === 'all' ? null : [filters.status],
      onFilter: (value, item) => item.status === String(value),
      render: (_, item) => (
        <Tag color={item.status === 'completed' ? 'green' : item.status === 'failed' ? 'red' : 'gold'}>
          {item.status}
        </Tag>
      ),
    },
    {
      key: 'note',
      title: '备注',
      width: 280,
      ellipsis: { showTitle: false },
      sorter: (left, right) => compareText(left.note, right.note),
      render: (_, item) => (
        <Tooltip title={item.note || '-'}>
          <div className="table-title-cell">
            <strong>{item.note || '-'}</strong>
            <small>{item.reference_no || item.source_id || '-'}</small>
          </div>
        </Tooltip>
      ),
    },
  ];
}

function buildAiHistoryColumns(items: TeamAiHistoryItem[]): ColumnsType<TeamAiHistoryItem> {
  return [
    {
      key: 'created_at',
      title: '时间',
      width: 180,
      sorter: (left, right) => compareDateTime(left.created_at, right.created_at),
      defaultSortOrder: 'descend',
      render: (_, item) => formatDateTime(item.created_at),
    },
    {
      key: 'record_type',
      title: '类型',
      width: 120,
      filters: [
        { text: '钱包划转', value: 'transfer_in' },
        { text: 'AI 调用', value: 'ai_call' },
        { text: '余额调整', value: 'adjustment' },
      ],
      filterSearch: true,
      onFilter: (value, item) => item.record_type === String(value),
      render: (_, item) => (
        <Tag color={getAiHistoryTypeColor(item.record_type)}>{getAiHistoryTypeLabel(item.record_type)}</Tag>
      ),
    },
    {
      key: 'provider_name',
      title: 'Provider',
      width: 220,
      filters: buildFilterOptions(items.map((item) => getAiHistoryProviderName(item))),
      filterSearch: true,
      onFilter: (value, item) => getAiHistoryProviderName(item) === String(value),
      sorter: (left, right) => compareText(getAiHistoryProviderName(left), getAiHistoryProviderName(right)),
      ellipsis: { showTitle: false },
      render: (_, item) => getAiHistoryProviderName(item),
    },
    {
      key: 'tokens',
      title: 'Token',
      width: 120,
      sorter: (left, right) => compareNumber(left.tokens, right.tokens),
      render: (_, item) => (typeof item.tokens === 'number' ? renderCompactValue(item.tokens) : '-'),
    },
    {
      key: 'points_delta',
      title: '积分变动',
      width: 150,
      sorter: (left, right) => compareNumber(left.points_delta, right.points_delta),
      render: (_, item) => renderAiHistoryDelta(item.points_delta),
    },
    {
      key: 'balance_after',
      title: 'AI 钱包余额',
      width: 150,
      sorter: (left, right) => compareNumber(left.balance_after, right.balance_after),
      render: (_, item) =>
        typeof item.balance_after === 'number' ? formatAiWalletPoints(item.balance_after) : '-',
    },
    {
      key: 'status',
      title: '状态',
      width: 100,
      filters: buildFilterOptions(items.map((item) => item.status)),
      filterSearch: true,
      onFilter: (value, item) => item.status === String(value),
      render: (_, item) => <Tag color={providerStatusColors[item.status] || 'default'}>{item.status}</Tag>,
    },
    {
      key: 'request_id',
      title: '请求编号',
      width: 220,
      ellipsis: { showTitle: false },
      render: (_, item) => {
        const requestId = getAiHistoryRequestId(item);
        return <Tooltip title={requestId}>{formatShortId(requestId)}</Tooltip>;
      },
    },
  ];
}

function filterAiHistoryItems(
  items: TeamAiHistoryItem[],
  keyword: string,
  dateRange: LightweightDateRange,
): TeamAiHistoryItem[] {
  const normalizedKeyword = keyword.trim().toLowerCase();
  const startAt = dateRange?.[0]?.startOf('day').valueOf() ?? null;
  const endAt = dateRange?.[1]?.endOf('day').valueOf() ?? null;

  return items.filter((item) => {
    if (normalizedKeyword) {
      const haystack = [
        item.provider_name,
        getAiHistoryProviderName(item),
        item.route_name,
        item.request_id,
        item.source_label,
        item.record_type,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (!haystack.includes(normalizedKeyword)) {
        return false;
      }
    }

    if (startAt !== null || endAt !== null) {
      const createdAt = apiDateTimeValue(item.created_at);
      if (!createdAt) {
        return false;
      }
      if (startAt !== null && createdAt < startAt) {
        return false;
      }
      if (endAt !== null && createdAt > endAt) {
        return false;
      }
    }

    return true;
  });
}

function getSingleTableFilterValue(value: Array<React.Key | boolean> | null | undefined): string {
  if (Array.isArray(value) && value.length > 0 && value[0] !== null && value[0] !== undefined) {
    return String(value[0]);
  }
  return 'all';
}

function isAllowedAgentAvatar(file: File): boolean {
  const contentType = file.type.toLowerCase();
  const filename = file.name.toLowerCase();
  return /\.(jpe?g|png|gif)$/.test(filename) && ['image/jpeg', 'image/png', 'image/gif'].includes(contentType);
}

function buildFilterOptions(values: Array<string | null | undefined>) {
  return Array.from(
    new Map(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
        .map((value) => [value, { text: value, value }]),
    ).values(),
  );
}

function compareDateTime(a?: string | null, b?: string | null): number {
  return apiDateTimeValue(a) - apiDateTimeValue(b);
}

function compareNumber(a?: number | null, b?: number | null): number {
  return (a ?? 0) - (b ?? 0);
}

function compareText(a?: string | null, b?: string | null): number {
  return (a ?? '').localeCompare(b ?? '', 'zh-CN');
}

function normalizeLedgerTransactionType(type: string | null | undefined): string {
  if (!type) {
    return '';
  }

  if (['reward_reserve', 'points_reserve', 'task_reward_reserve'].includes(type)) {
    return 'reward_reserve';
  }

  if (['reward_release', 'points_release', 'task_reward_release'].includes(type)) {
    return 'reward_release';
  }

  if (['reward_spend', 'reward_settlement', 'task_reward_spend'].includes(type)) {
    return 'reward_spend';
  }

  return type;
}

function normalizeLedgerMethod(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  if (['task_publish', 'task_publish_reserve', 'reward_reserve'].includes(value)) {
    return 'task_publish';
  }

  if (['submission_review', 'reward_settlement', 'reward_spend'].includes(value)) {
    return 'submission_review';
  }

  if (['reward_release', 'task_reward_release'].includes(value)) {
    return 'reward_release';
  }

  return value;
}
