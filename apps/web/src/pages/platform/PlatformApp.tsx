import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Statistic,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
  Card,
} from 'antd';
import { Area } from '@ant-design/charts';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import {
  ApiOutlined,
  AuditOutlined,
  BarChartOutlined,
  CheckCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  LinkOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  StarOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { AiProviderConfigPayload } from '../../types/api';
import { EnhancedTable } from '../../components/ui/EnhancedTable';
import {
  applyProviderKindDefaults,
  buildProviderApiBase,
  buildProviderCapabilityProfile,
  buildProviderFormValuesFromConfig,
  buildProviderRuntimeConfig,
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
  providerKindOptions,
  providerStatusColors,
  renderProviderAccessFields,
  renderProviderProtocolFields,
  renderProviderRuntimeDetails,
  syncProviderProtocolDraft,
  type ProviderFormValues,
} from '../../features/ai/providerConfigShared';
import {
  createPlatformAiProviderConfig,
  deletePlatformAiProviderConfig,
  duplicatePlatformAiProviderConfig,
  getPlatformAgentEmbeddingSetting,
  getPlatformCommissionSetting,
  getPlatformWorkbench,
  listPlatformAiProviderConfigs,
  listPlatformCertifications,
  listPlatformReputationAppeals,
  listPlatformSettlements,
  listPlatformTeamVerificationQueue,
  reviewPlatformCertification,
  reviewPlatformPaymentRequest,
  reviewPlatformReputationAppeal,
  reviewPlatformTeamVerification,
  setPlatformAiProviderConfigStatus,
  testDraftPlatformAiProviderConfig,
  testPlatformAiProviderConfig,
  updatePlatformAiProviderConfig,
  updatePlatformAgentEmbeddingSetting,
  updatePlatformCommissionSetting,
  type PlatformAgentEmbeddingSetting,
  type PlatformCertification,
  type PlatformPaymentRequest,
  type PlatformReputationAppeal,
  type PlatformSettlement,
  type PlatformTeamVerification,
  type PlatformWorkbench,
  type ProviderConnectionTestResult,
} from '../../services/platformService';
import { ApiClientError, authenticatedFetch, getApiBaseUrl } from '../../services/apiClient';
import { formatApiDateTime } from '../../utils/dateTime';
import { workspacePopupContainer } from '../workspace/workspaceListHelpers';
import './PlatformApp.css';

const { RangePicker } = DatePicker;

export type PlatformPage = 'overview' | 'settlements' | 'verification' | 'providers' | 'settings';

interface PlatformAppProps {
  page: PlatformPage;
}

export function PlatformApp({ page }: PlatformAppProps) {
  const meta = platformPageMeta[page];
  let content: ReactNode;
  if (page === 'settlements') content = <PlatformSettlementsPage />;
  else if (page === 'verification') content = <PlatformVerificationPage />;
  else if (page === 'providers') content = <PlatformProvidersPage />;
  else if (page === 'settings') content = <PlatformSettingsPage />;
  else content = <PlatformOverviewPage />;

  return (
    <main className="workspace-content workspace-fixed-page platform-workspace-content">
      <section className="page-heading platform-page-heading">
        <div>
          <p className="section-kicker">Platform Ops</p>
          <h1>{meta.title}</h1>
          <p>{meta.description}</p>
        </div>
        <Space className="page-heading-actions" wrap>
          <Tag color={meta.tagColor}>{meta.tag}</Tag>
        </Space>
      </section>
      {content}
    </main>
  );
}

const platformPageMeta: Record<PlatformPage, { title: string; description: string; tag: string; tagColor: string }> = {
  overview: {
    title: '经营总览',
    description: '平台经营、审核待办和最近结算的密集扫描入口。',
    tag: '运营后台',
    tagColor: 'blue',
  },
  settlements: {
    title: '结算流水',
    description: '按企业、标注员、状态和时间追踪平台服务费流水。',
    tag: '财务',
    tagColor: 'green',
  },
  verification: {
    title: '认证审核',
    description: '先核验企业与标注员材料，再提交通过或拒绝结论。',
    tag: '审核',
    tagColor: 'gold',
  },
  providers: {
    title: 'AI Provider',
    description: '维护平台共享模型路由、默认配置和连通性测试。',
    tag: '平台共享',
    tagColor: 'purple',
  },
  settings: {
    title: '平台规则',
    description: '配置平台服务费率与问答 Agent 的 Embedding 能力。',
    tag: '配置',
    tagColor: 'default',
  },
};

type DateRangeValue = [Dayjs | null, Dayjs | null] | null;

interface PlatformPaginationState {
  page: number;
  page_size: number;
  total: number;
}

interface SettlementFilterValues {
  keyword?: string;
  status?: string;
  team_id?: string;
  date_range?: DateRangeValue;
}

interface TeamVerificationFilterValues {
  keyword?: string;
  status?: string;
  date_range?: DateRangeValue;
}

interface CertificationFilterValues {
  keyword?: string;
  status?: string;
  cert_category?: string;
}

type ReviewTarget =
  | { kind: 'team'; item: PlatformTeamVerification; decision: 'approved' | 'rejected' }
  | { kind: 'certification'; item: PlatformCertification; decision: 'approved' | 'rejected' };

interface ReviewFormValues {
  comment?: string;
}

const defaultPagination: PlatformPaginationState = {
  page: 1,
  page_size: 10,
  total: 0,
};

function dateRangeParams(range?: DateRangeValue) {
  if (!range?.[0] && !range?.[1]) return {};
  return {
    start_date: range?.[0]?.format('YYYY-MM-DD'),
    end_date: range?.[1]?.format('YYYY-MM-DD'),
  };
}

function PlatformOverviewPage() {
  const [data, setData] = useState<PlatformWorkbench | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await getPlatformWorkbench());
    } catch (err) {
      setError(err instanceof Error ? err.message : '平台总览加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (loading) return <div className="platform-loading"><Spin tip="正在加载平台经营数据" /></div>;
  if (error) return <Alert type="error" showIcon message={error} action={<Button onClick={() => void load()}>重试</Button>} />;
  if (!data) return <Empty description="暂无平台经营数据" />;

  const todoCount = data.summary.pending_team_verifications + data.summary.pending_certifications;

  return (
    <div className="dashboard-scroll-area platform-overview-scroll">
      <div className="dashboard-cockpit">
        <section className="dashboard-kpi-strip" aria-label="平台运营指标">
          <OverviewKpiItem icon={<WalletOutlined />} label="累计服务费" value={formatPoints(data.summary.total_commission_points)} />
          <OverviewKpiItem icon={<BarChartOutlined />} label="近 30 天服务费" value={formatPoints(data.summary.month_commission_points)} />
          <OverviewKpiItem icon={<AuditOutlined />} label="运营待办" value={String(todoCount)} suffix="项" tone={todoCount > 0 ? 'warning' : 'success'} />
          <OverviewKpiItem icon={<SafetyCertificateOutlined />} label="待审企业" value={String(data.summary.pending_team_verifications)} suffix="个" tone="warning" />
          <OverviewKpiItem icon={<StarOutlined />} label="待审资质" value={String(data.summary.pending_certifications)} suffix="条" tone="warning" />
          <OverviewKpiItem icon={<SettingOutlined />} label="服务费率" value={`${data.commission_setting.commission_rate_percent}%`} />
        </section>

        <section className="dashboard-chart-grid platform-overview-chart-grid" aria-label="平台经营概览">
          <div className="dashboard-chart-primary">
            <Card
              className="dashboard-panel dashboard-chart-card dashboard-trend-card"
              title="近 30 天服务费趋势"
              extra={<Button size="small" href="/platform?page=settlements">查看全部</Button>}
            >
              <SettlementTrend items={data.settlement_trend} />
            </Card>
          </div>

          <div className="dashboard-chart-secondary platform-overview-secondary">
            <Card className="dashboard-panel dashboard-chart-card dashboard-chart-card--compact" title="审核待办" extra={<Tag color={todoCount > 0 ? 'gold' : 'green'}>{todoCount} 项</Tag>}>
              <div className="platform-dashboard-todos">
                <OverviewTodoItem
                  label="企业认证"
                  count={data.summary.pending_team_verifications}
                  unit="个"
                  href="/platform?page=verification"
                />
                <OverviewTodoItem
                  label="资质审核"
                  count={data.summary.pending_certifications}
                  unit="条"
                  href="/platform?page=verification"
                />
              </div>
            </Card>

            <Card className="dashboard-panel platform-summary-card" title="运营摘要">
              <OverviewSummary items={data.settlement_trend} commissionRate={data.commission_setting.commission_rate_percent} />
            </Card>
          </div>
        </section>

        <section className="dashboard-main-grid platform-overview-main" aria-label="平台结算详情">
          <div className="dashboard-left-column">
            <Card className="dashboard-panel dashboard-table-panel" title="最近结算" extra={<Button size="small" href="/platform?page=settlements">查看全部</Button>}>
              <SettlementTable data={data.recent_settlements} compact className="platform-dashboard-table" pagination={false} />
            </Card>
          </div>

          <div className="dashboard-right-column">
            <Card className="dashboard-panel" title="平台规则">
              <div className="platform-rule-stack">
                <div>
                  <span>服务费率</span>
                  <strong>{data.commission_setting.commission_rate_percent}%</strong>
                </div>
                <div>
                  <span>结算口径</span>
                  <strong>平台服务费</strong>
                </div>
                <div>
                  <span>审核入口</span>
                  <strong>认证审核</strong>
                </div>
              </div>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
}

function OverviewKpiItem({
  icon,
  label,
  value,
  suffix,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  suffix?: string;
  tone?: 'success' | 'warning';
}) {
  return (
    <div className={`dashboard-kpi-item dashboard-kpi-item--${tone || 'info'}`}>
      <span className="dashboard-kpi-icon">{icon}</span>
      <Statistic title={label} value={value} suffix={suffix} />
    </div>
  );
}

function OverviewTodoItem({ label, count, unit, href }: { label: string; count: number; unit: string; href: string }) {
  return (
    <a className="platform-dashboard-todo-item" href={href}>
      <span>{label}</span>
      <strong>{count}<small>{unit}</small></strong>
      <Tag color={count > 0 ? 'gold' : 'green'}>{count > 0 ? '待处理' : '已清空'}</Tag>
    </a>
  );
}

function OverviewSummary({
  items,
  commissionRate,
}: {
  items: PlatformWorkbench['settlement_trend'];
  commissionRate: number;
}) {
  const total = items.reduce((sum, item) => sum + Number(item.commission_points || 0), 0);
  const maxItem = items.reduce((current, item) => (
    Number(item.commission_points || 0) > Number(current.commission_points || 0) ? item : current
  ), items[0] ?? { date: '-', commission_points: 0, commission_yuan: 0 });
  const last7Total = items.slice(-7).reduce((sum, item) => sum + Number(item.commission_points || 0), 0);
  return (
    <div className="platform-dashboard-summary">
      <div>
        <span>近 30 天合计</span>
        <strong>{formatPoints(total)}</strong>
      </div>
      <div>
        <span>最高单日</span>
        <strong>{formatPoints(maxItem.commission_points)}</strong>
        <small>{maxItem.date}</small>
      </div>
      <div>
        <span>最近 7 天</span>
        <strong>{formatPoints(last7Total)}</strong>
      </div>
      <div>
        <span>当前服务费率</span>
        <strong>{commissionRate}%</strong>
      </div>
    </div>
  );
}

function PlatformProvidersPage() {
  const [providers, setProviders] = useState<AiProviderConfigPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<ProviderConnectionTestResult | null>(null);
  const [form] = Form.useForm<ProviderFormValues>();
  const providerKindValue = Form.useWatch('provider_kind', form) ?? providerKindOptions[0].value;

  const visibleProviders = useMemo(
    () => providers.filter((item) => item.scope === 'platform'),
    [providers],
  );
  const selectedProvider = useMemo(
    () => visibleProviders.find((item) => item.provider_id === selectedProviderId) ?? visibleProviders[0] ?? null,
    [selectedProviderId, visibleProviders],
  );

  const providerSummary = useMemo(() => {
    const enabledCount = visibleProviders.filter((item) => item.status === 'enabled').length;
    const configuredCount = visibleProviders.filter((item) => item.api_key_configured).length;
    const defaultRoute = visibleProviders.find((item) => item.is_platform_default);
    const successCount = visibleProviders.filter((item) => item.last_test_status === 'success').length;
    return {
      total: visibleProviders.length,
      enabledCount,
      configuredCount,
      defaultRoute: defaultRoute ? getProviderDisplayName(defaultRoute) : '未设置',
      successCount,
    };
  }, [visibleProviders]);

  async function loadProviders(options?: { preserveSelection?: boolean }) {
    setLoading(true);
    setError(null);
    try {
      const response = await listPlatformAiProviderConfigs();
      const platformProviders = response.items.filter((item) => item.scope === 'platform');
      setProviders(platformProviders);
      setSelectedProviderId((current) => {
        if (options?.preserveSelection && current && platformProviders.some((item) => item.provider_id === current)) {
          return current;
        }
        return platformProviders[0]?.provider_id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '平台 Provider 列表加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProviders();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function openCreateDrawer() {
    setDrawerMode('create');
    setDrawerError(null);
    setTestResult(null);
    form.setFieldsValue(getProviderInitialValues());
    setDrawerOpen(true);
  }

  function openEditDrawer(item: AiProviderConfigPayload) {
    setDrawerMode('edit');
    setDrawerError(null);
    setTestResult(null);
    setSelectedProviderId(item.provider_id);
    form.setFieldsValue(buildProviderFormValuesFromConfig(item));
    setDrawerOpen(true);
  }

  function buildProviderPayload(values: ProviderFormValues) {
    return {
      route_name: values.route_name.trim(),
      provider_kind: values.provider_kind,
      protocol_profile: values.protocol_profile,
      scope: 'platform' as const,
      is_platform_default: Boolean(values.is_platform_default),
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
  }

  async function submitProvider(values: ProviderFormValues) {
    setSubmitting(true);
    setDrawerError(null);
    try {
      const payload = buildProviderPayload(values);
      const saved = drawerMode === 'edit' && selectedProvider
        ? await updatePlatformAiProviderConfig(selectedProvider.provider_id, payload)
        : await createPlatformAiProviderConfig(payload);
      await loadProviders({ preserveSelection: true });
      setSelectedProviderId(saved.provider_id);
      setDrawerOpen(false);
      form.resetFields();
      setTestResult(null);
      message.success(drawerMode === 'edit' ? '平台 Provider 已更新' : '平台 Provider 已创建');
    } catch (err) {
      setDrawerError(getProviderErrorMessage(err, '平台 Provider 保存失败'));
    } finally {
      setSubmitting(false);
    }
  }

  async function runDraftTest() {
    setTesting(true);
    setDrawerError(null);
    try {
      const values = await form.validateFields();
      const payload = {
        route_name: values.route_name.trim(),
        provider_kind: values.provider_kind,
        protocol_profile: values.protocol_profile,
        scope: 'platform' as const,
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
        drawerMode === 'edit' && selectedProvider && !form.isFieldsTouched()
          ? await testPlatformAiProviderConfig(selectedProvider.provider_id)
          : await testDraftPlatformAiProviderConfig(payload);
      setTestResult(result);
      message.success(`连接测试成功：${result.model} / ${result.latency_ms}ms`);
    } catch (err) {
      setDrawerError(getProviderErrorMessage(err, '连接测试失败'));
      setTestResult(extractFailedTestResult(err));
    } finally {
      setTesting(false);
    }
  }

  async function runSavedProviderTest(item: AiProviderConfigPayload) {
    setActionLoadingId(item.provider_id);
    try {
      const result = await testPlatformAiProviderConfig(item.provider_id);
      setTestResult(result);
      await loadProviders({ preserveSelection: true });
      message.success(`连接测试成功：${result.model} / ${result.latency_ms}ms`);
    } catch (err) {
      message.error(getProviderErrorMessage(err, '连接测试失败'));
      setTestResult(extractFailedTestResult(err));
      await loadProviders({ preserveSelection: true });
    } finally {
      setActionLoadingId(null);
    }
  }

  async function duplicateProvider(item: AiProviderConfigPayload) {
    setActionLoadingId(item.provider_id);
    try {
      const created = await duplicatePlatformAiProviderConfig(item.provider_id);
      await loadProviders({ preserveSelection: true });
      setSelectedProviderId(created.provider_id);
      message.success('平台 Provider 副本已创建');
    } catch (err) {
      message.error(getProviderErrorMessage(err, '复制 Provider 失败'));
    } finally {
      setActionLoadingId(null);
    }
  }

  async function toggleProviderStatus(item: AiProviderConfigPayload) {
    const nextStatus = item.status === 'enabled' ? 'disabled' : 'enabled';
    setActionLoadingId(item.provider_id);
    try {
      await setPlatformAiProviderConfigStatus(item.provider_id, nextStatus);
      await loadProviders({ preserveSelection: true });
      message.success(nextStatus === 'enabled' ? '平台 Provider 已启用' : '平台 Provider 已停用');
    } catch (err) {
      message.error(getProviderErrorMessage(err, '切换 Provider 状态失败'));
    } finally {
      setActionLoadingId(null);
    }
  }

  async function togglePlatformDefault(item: AiProviderConfigPayload) {
    setActionLoadingId(item.provider_id);
    try {
      await updatePlatformAiProviderConfig(item.provider_id, { is_platform_default: !item.is_platform_default });
      await loadProviders({ preserveSelection: true });
      message.success(item.is_platform_default ? '已取消平台默认路由' : '已设为平台默认路由');
    } catch (err) {
      message.error(getProviderErrorMessage(err, '更新默认路由失败'));
    } finally {
      setActionLoadingId(null);
    }
  }

  async function removeProvider(item: AiProviderConfigPayload) {
    Modal.confirm({
      title: '删除平台 Provider',
      content: `确认删除 ${getProviderDisplayName(item)} 吗？删除后无法恢复。`,
      okButtonProps: { danger: true },
      onOk: async () => {
        setActionLoadingId(item.provider_id);
        try {
          await deletePlatformAiProviderConfig(item.provider_id);
          await loadProviders();
          message.success('平台 Provider 已删除');
        } catch (err) {
          message.error(getProviderErrorMessage(err, '删除 Provider 失败'));
        } finally {
          setActionLoadingId(null);
        }
      },
    });
  }

  return (
    <div className="platform-page">
      <div className="platform-toolbar">
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void loadProviders({ preserveSelection: true })}>
            刷新
          </Button>
          <Button type="primary" icon={<ApiOutlined />} onClick={openCreateDrawer}>
            新增 Provider
          </Button>
        </Space>
      </div>

      <div className="platform-provider-metrics">
        <div className="platform-metric"><Statistic title="平台路由总数" value={providerSummary.total} /></div>
        <div className="platform-metric"><Statistic title="启用中" value={providerSummary.enabledCount} /></div>
        <div className="platform-metric"><Statistic title="已配置 Key" value={providerSummary.configuredCount} /></div>
        <div className="platform-metric"><Statistic title="最近测试成功" value={providerSummary.successCount} /></div>
      </div>

      {loading ? (
        <div className="platform-loading"><Spin description="正在加载平台 Provider" /></div>
      ) : error ? (
        <Alert type="error" showIcon title={error} action={<Button onClick={() => void loadProviders()}>重试</Button>} />
      ) : (
        <div className="platform-provider-layout">
          <section className="platform-panel platform-provider-list">
            <div className="platform-panel-head">
              <strong>平台共享路由</strong>
              <Tag color="gold">{providerSummary.defaultRoute}</Tag>
            </div>
            {visibleProviders.length === 0 ? (
              <Empty
                description="当前还没有平台级 Provider"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              >
                <Button type="primary" onClick={openCreateDrawer}>立即新增</Button>
              </Empty>
            ) : (
              <div className="platform-provider-list-scroll">
                {visibleProviders.map((item) => {
                  const active = selectedProvider?.provider_id === item.provider_id;
                  return (
                    <button
                      key={item.provider_id}
                      type="button"
                      className={`platform-provider-list-item${active ? ' is-active' : ''}`}
                      onClick={() => setSelectedProviderId(item.provider_id)}
                    >
                      <div className="platform-provider-card-head">
                        <strong>{getProviderDisplayName(item)}</strong>
                        <Tag color={providerStatusColors[item.status] || 'default'}>{item.status}</Tag>
                      </div>
                      <div className="platform-provider-card-meta">
                        <span>{getProviderKind(item)}</span>
                      </div>
                      <Space wrap size={[6, 6]}>
                        {item.is_platform_default ? <Tag color="gold">平台默认</Tag> : null}
                        <Tag color={item.api_key_configured ? 'green' : 'default'}>
                          {item.api_key_configured ? 'Key 已配置' : '缺少 Key'}
                        </Tag>
                        <Tag color={item.last_test_status === 'success' ? 'green' : item.last_test_status === 'failed' ? 'red' : 'default'}>
                          {getProviderTestStatusLabel(item.last_test_status)}
                        </Tag>
                      </Space>
                      <div className="platform-provider-card-pricing">
                        输入 {formatMoneyByMillion(item.pricing?.input_price_per_million ?? 0)} / 输出 {formatMoneyByMillion(item.pricing?.output_price_per_million ?? 0)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="platform-panel">
            {!selectedProvider ? (
              <Empty description="请选择一个平台 Provider" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <div className="platform-provider-detail">
                <div className="platform-provider-action-row">
                  <div>
                    <Space wrap size={[8, 8]}>
                      <Tag color="blue">平台共享</Tag>
                      {selectedProvider.is_platform_default ? <Tag color="gold">平台默认</Tag> : null}
                      <Tag color={selectedProvider.api_key_configured ? 'green' : 'default'}>
                        {selectedProvider.api_key_configured ? 'API Key 已配置' : 'API Key 未配置'}
                      </Tag>
                      <Tag color={providerStatusColors[selectedProvider.status] || 'default'}>{selectedProvider.status}</Tag>
                    </Space>
                    <h2 className="platform-provider-detail-title">{getProviderDisplayName(selectedProvider)}</h2>
                    <div className="platform-provider-detail-subtitle">
                      {getProviderKind(selectedProvider)}
                    </div>
                  </div>

                  <Space wrap>
                    <Button icon={<EditOutlined />} onClick={() => openEditDrawer(selectedProvider)}>编辑</Button>
                    <Button icon={<CopyOutlined />} loading={actionLoadingId === selectedProvider.provider_id} onClick={() => void duplicateProvider(selectedProvider)}>复制</Button>
                    <Button
                      icon={<StarOutlined />}
                      loading={actionLoadingId === selectedProvider.provider_id}
                      onClick={() => void togglePlatformDefault(selectedProvider)}
                    >
                      {selectedProvider.is_platform_default ? '取消默认' : '设为默认'}
                    </Button>
                    <Button
                      icon={selectedProvider.status === 'enabled' ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                      loading={actionLoadingId === selectedProvider.provider_id}
                      onClick={() => void toggleProviderStatus(selectedProvider)}
                    >
                      {selectedProvider.status === 'enabled' ? '停用' : '启用'}
                    </Button>
                    <Button
                      icon={<CheckCircleOutlined />}
                      loading={actionLoadingId === selectedProvider.provider_id}
                      onClick={() => void runSavedProviderTest(selectedProvider)}
                    >
                      测试连接
                    </Button>
                    <Button
                      danger
                      icon={<DeleteOutlined />}
                      loading={actionLoadingId === selectedProvider.provider_id}
                      onClick={() => void removeProvider(selectedProvider)}
                    >
                      删除
                    </Button>
                  </Space>
                </div>

                {testResult ? (
                  <Alert
                    type={testResult.status === 'success' ? 'success' : 'error'}
                    showIcon
                    title={testResult.status === 'success' ? `最近检测成功：${testResult.latency_ms}ms` : '检测失败'}
                    description={testResult.request_id ? `request_id: ${testResult.request_id}` : undefined}
                  />
                ) : null}

                <div className="platform-provider-detail-grid">
                  <section className="platform-detail-section">
                    <strong>基础信息</strong>
                    <Descriptions size="small" column={1}>
                      <Descriptions.Item label="Provider 名称">{getProviderDisplayName(selectedProvider)}</Descriptions.Item>
                      <Descriptions.Item label="Provider 类型">{getProviderKind(selectedProvider)}</Descriptions.Item>
                      <Descriptions.Item label="作用域">平台</Descriptions.Item>
                      <Descriptions.Item label="备注">{selectedProvider.remark || '-'}</Descriptions.Item>
                    </Descriptions>
                  </section>

                  <section className="platform-detail-section">
                    <strong>Access & Runtime</strong>
                    <Descriptions size="small" column={1}>
                      <Descriptions.Item label={getProviderOptionMeta(getProviderKind(selectedProvider)).endpointLabel}>
                        {selectedProvider.api_base || '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="API Key">{maskStoredApiKey(selectedProvider.api_key_configured)}</Descriptions.Item>
                      <Descriptions.Item label="Temperature">{selectedProvider.runtime_config?.temperature ?? 0}</Descriptions.Item>
                      <Descriptions.Item label="Max Output Tokens">{selectedProvider.runtime_config?.max_output_tokens ?? '-'}</Descriptions.Item>
                      <Descriptions.Item label="Timeout">{selectedProvider.runtime_config?.timeout_ms ? `${selectedProvider.runtime_config.timeout_ms} ms` : '-'}</Descriptions.Item>
                    </Descriptions>
                    <div className="platform-provider-runtime-extra">
                      {renderProviderRuntimeDetails(selectedProvider, { formatFullNumber: formatFullNumber })}
                    </div>
                  </section>

                  <section className="platform-detail-section">
                    <strong>Pricing & Capabilities</strong>
                    <Descriptions size="small" column={1}>
                      <Descriptions.Item label="Input / 1M">{formatMoneyByMillion(selectedProvider.pricing?.input_price_per_million ?? 0)}</Descriptions.Item>
                      <Descriptions.Item label="Output / 1M">{formatMoneyByMillion(selectedProvider.pricing?.output_price_per_million ?? 0)}</Descriptions.Item>
                      <Descriptions.Item label="Cache Hit / 1M">{formatMoneyByMillion(selectedProvider.pricing?.cache_hit_price_per_million ?? 0)}</Descriptions.Item>
                    </Descriptions>
                    <Space wrap size={[8, 8]} className="platform-provider-capabilities">
                      {(selectedProvider.capabilities?.length ? selectedProvider.capabilities : ['text']).map((item) => (
                        <Tag key={item}>{getProviderCapabilityLabel(item)}</Tag>
                      ))}
                    </Space>
                  </section>
                </div>

                <section className="platform-detail-section">
                  <strong>Latest Test</strong>
                  <Descriptions size="small" column={2}>
                    <Descriptions.Item label="Status">{getProviderTestStatusLabel(selectedProvider.last_test_status)}</Descriptions.Item>
                    <Descriptions.Item label="Latency">
                      {selectedProvider.last_test_latency_ms ? `${selectedProvider.last_test_latency_ms} ms` : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Tested At">{formatTime(selectedProvider.last_test_at)}</Descriptions.Item>
                    <Descriptions.Item label="request_id">{selectedProvider.last_request_id || '-'}</Descriptions.Item>
                    <Descriptions.Item label="Error" span={2}>{selectedProvider.last_test_error || '-'}</Descriptions.Item>
                  </Descriptions>
                </section>
              </div>
            )}
          </section>
        </div>
      )}

      <Drawer
        title={drawerMode === 'edit' ? '编辑平台 Provider' : '新增平台 Provider'}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerError(null);
          setTestResult(null);
        }}
        size="large"
      >
        <div className="platform-drawer-stack">
          {drawerError ? <Alert type="error" showIcon title={drawerError} /> : null}
          {testResult ? (
            <Alert
              type={testResult.status === 'success' ? 'success' : 'error'}
              showIcon
              title={testResult.status === 'success' ? `连接测试成功：${testResult.latency_ms}ms` : '连接测试失败'}
              description={testResult.request_id ? `request_id: ${testResult.request_id}` : undefined}
            />
          ) : null}
          <Alert type="info" showIcon title={`${getProviderOptionMeta(providerKindValue).intro} 一条平台配置只绑定一条共享模型路由。`} />

          <Form<ProviderFormValues>
            form={form}
            layout="vertical"
            onFinish={(values) => void submitProvider(values)}
            initialValues={getProviderInitialValues()}
          >
            <section className="platform-detail-section">
              <strong>基础信息</strong>
              <div className="platform-provider-form-grid">
                <Form.Item name="route_name" label="配置名称" rules={[{ required: true, message: '请输入配置名称' }]}>
                  <Input placeholder="例如：平台默认法务审核路由" />
                </Form.Item>
                <Form.Item name="provider_kind" label="Provider 类型" rules={[{ required: true, message: '请选择 Provider 类型' }]}>
                  <Select
                    getPopupContainer={workspacePopupContainer}
                    options={providerKindOptions.map((item) => ({ value: item.value, label: item.label }))}
                    onChange={(value) => applyProviderKindDefaults(form, value)}
                  />
                </Form.Item>
                <Form.Item
                  name="model_id"
                  label={getProviderOptionMeta(providerKindValue).modelLabel}
                  rules={[{ required: true, message: `请输入${getProviderOptionMeta(providerKindValue).modelLabel}` }]}
                >
                  <Input
                    placeholder={getProviderModelPlaceholder(providerKindValue)}
                    onChange={(event) => {
                      if (providerKindValue !== 'Azure OpenAI') return;
                      const deploymentName = event.target.value.trim();
                      const resourceName = form.getFieldValue('azure_resource_name')?.trim();
                      if (resourceName && deploymentName) {
                        form.setFieldValue('api_base', `https://${resourceName}.openai.azure.com/openai/deployments/${deploymentName}`);
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
                <Form.Item name="is_platform_default" label="平台默认路由">
                  <Select
                    getPopupContainer={workspacePopupContainer}
                    options={[
                      { label: '否', value: false },
                      { label: '是', value: true },
                    ]}
                  />
                </Form.Item>
                <Form.Item name="remark" label="备注" className="platform-form-span-all">
                  <Input.TextArea rows={2} maxLength={200} placeholder="写明适用业务、上游账号或维护备注" />
                </Form.Item>
              </div>
            </section>

            <section className="platform-detail-section">
              <strong>鉴权与接入</strong>
              <div className="platform-provider-form-grid">
                <Form.Item name="api_base" label={getProviderOptionMeta(providerKindValue).endpointLabel}>
                  <Input placeholder="https://api.example.com/v1" />
                </Form.Item>
                <Form.Item name="api_key" label="API Key">
                  <Input.Password
                    placeholder={drawerMode === 'edit' ? '默认掩码显示，输入新值即轮换' : getProviderOptionMeta(providerKindValue).keyHint}
                    visibilityToggle
                  />
                </Form.Item>
                {renderProviderAccessFields(providerKindValue, form)}
              </div>
            </section>

            <section className="platform-detail-section">
              <strong>价格配置</strong>
              <div className="platform-provider-form-grid">
                <Form.Item name="input_price_per_million" label="每百万输入价格" rules={[{ required: true, message: '请输入输入价格' }]}>
                  <InputNumber min={0} precision={4} className="platform-full-input" addonAfter="元 / 1M tokens" />
                </Form.Item>
                <Form.Item name="output_price_per_million" label="每百万输出价格" rules={[{ required: true, message: '请输入输出价格' }]}>
                  <InputNumber min={0} precision={4} className="platform-full-input" addonAfter="元 / 1M tokens" />
                </Form.Item>
                <Form.Item name="cache_hit_price_per_million" label="每百万 Cache 命中价格" rules={[{ required: true, message: '请输入 Cache 命中价格' }]}>
                  <InputNumber min={0} precision={4} className="platform-full-input" addonAfter="元 / 1M tokens" />
                </Form.Item>
              </div>
            </section>

            <section className="platform-detail-section">
              <strong>模型与运行参数</strong>
              <div className="platform-provider-form-grid">
                <Form.Item name="temperature" label="Temperature">
                  <InputNumber min={0} max={2} step={0.1} precision={1} className="platform-full-input" />
                </Form.Item>
                <Form.Item name="max_output_tokens" label="Max Output Tokens">
                  <InputNumber min={1} step={1} className="platform-full-input" />
                </Form.Item>
                <Form.Item name="timeout_ms" label="Timeout">
                  <InputNumber min={1000} step={1000} className="platform-full-input" addonAfter="ms" />
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
                <Form.Item name="capabilities" label="能力声明" className="platform-form-span-all">
                  <Select
                    mode="multiple"
                    getPopupContainer={workspacePopupContainer}
                    options={providerCapabilityOptions}
                    placeholder="选择该共享路由支持的能力"
                    onChange={(value) => {
                      syncProviderProtocolDraft(form, { capabilities: value });
                    }}
                  />
                </Form.Item>
                {renderProviderProtocolFields(form)}
              </div>
            </section>

            <Space>
              <Button onClick={() => setDrawerOpen(false)}>取消</Button>
              <Button icon={<CheckCircleOutlined />} loading={testing} onClick={() => void runDraftTest()}>
                测试连接
              </Button>
              <Button type="primary" htmlType="submit" loading={submitting}>
                {drawerMode === 'edit' ? '保存配置' : '创建配置'}
              </Button>
            </Space>
          </Form>
        </div>
      </Drawer>
    </div>
  );
}

function SettlementTrend({ items }: { items: PlatformWorkbench['settlement_trend'] }) {
  const chartData = items.map((item) => ({
    ...item,
    date_label: item.date.slice(5),
  }));
  return (
    <div className="platform-trend">
      <div className="platform-trend-chart">
        {chartData.length > 0 ? (
          <Area
            data={chartData}
            xField="date_label"
            yField="commission_points"
            height={150}
            autoFit
            tooltip={{
              title: (datum: { date?: string }) => datum.date ?? '',
              items: [
                {
                  field: 'commission_points',
                  name: '服务费',
                  valueFormatter: (value: number) => formatPoints(value),
                },
              ],
            }}
            axis={{
              x: { labelAutoHide: true },
              y: { labelFormatter: (value: string) => formatCompactNumber(Number(value)) },
            }}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无趋势数据" />
        )}
      </div>
    </div>
  );
}

function PlatformSettlementsPage() {
  const [form] = Form.useForm<SettlementFilterValues>();
  const [items, setItems] = useState<PlatformSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PlatformSettlement | null>(null);
  const [filters, setFilters] = useState<SettlementFilterValues>({});
  const [pagination, setPagination] = useState<PlatformPaginationState>(defaultPagination);

  async function load(nextPagination = pagination, nextFilters = filters) {
    setLoading(true);
    try {
      const data = await listPlatformSettlements({
        page: nextPagination.page,
        page_size: nextPagination.page_size,
        keyword: nextFilters.keyword?.trim(),
        status: nextFilters.status,
        team_id: nextFilters.team_id?.trim(),
        ...dateRangeParams(nextFilters.date_range),
      });
      setItems(data.items);
      setPagination({
        page: data.pagination.page,
        page_size: data.pagination.page_size,
        total: data.pagination.total,
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [filters, pagination.page, pagination.page_size]);

  function submitFilters(values: SettlementFilterValues) {
    setFilters(values);
    setPagination((current) => ({ ...current, page: 1 }));
  }

  function resetFilters() {
    form.resetFields();
    submitFilters({});
  }

  return (
    <div className="platform-page">
      <Form form={form} className="platform-filterbar" layout="inline" onFinish={submitFilters}>
        <Form.Item name="keyword">
          <Input allowClear placeholder="企业 / 标注员 / 来源 ID" />
        </Form.Item>
        <Form.Item name="team_id">
          <Input allowClear placeholder="企业 ID" />
        </Form.Item>
        <Form.Item name="status">
          <Select
            allowClear
            placeholder="状态"
            getPopupContainer={workspacePopupContainer}
            options={[
              { label: '已完成', value: 'completed' },
              { label: '待处理', value: 'pending' },
            ]}
          />
        </Form.Item>
        <Form.Item name="date_range">
          <RangePicker allowClear />
        </Form.Item>
        <Form.Item className="platform-filterbar-actions">
          <Space>
            <Button htmlType="submit" type="primary">筛选</Button>
            <Button onClick={resetFilters}>重置</Button>
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
          </Space>
        </Form.Item>
      </Form>
      <SettlementTable
        data={items}
        loading={loading}
        onSelect={setSelected}
        pagination={{
          current: pagination.page,
          pageSize: pagination.page_size,
          total: pagination.total,
          showQuickJumper: true,
          showSizeChanger: true,
          onChange: (page, pageSize) => setPagination({ page, page_size: pageSize, total: pagination.total }),
        }}
      />
      {selected ? (
        <Drawer title="结算流水详情" open onClose={() => setSelected(null)} width={520}>
          <SettlementDescriptions item={selected} />
        </Drawer>
      ) : null}
    </div>
  );
}

function PlatformVerificationPage() {
  return (
    <Tabs
      className="platform-tabs"
      animated={false}
      items={[
        { key: 'teams', label: '企业认证', children: <TeamVerificationPanel /> },
        { key: 'certifications', label: '标注员资质', children: <CertificationPanel /> },
        { key: 'reputation', label: '信誉分申诉', children: <ReputationAppealPanel /> },
      ]}
    />
  );
}

function TeamVerificationPanel() {
  const [form] = Form.useForm<TeamVerificationFilterValues>();
  const [reviewForm] = Form.useForm<ReviewFormValues>();
  const [items, setItems] = useState<PlatformTeamVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PlatformTeamVerification | null>(null);
  const [filters, setFilters] = useState<TeamVerificationFilterValues>({ status: 'pending_review' });
  const [pagination, setPagination] = useState<PlatformPaginationState>(defaultPagination);
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  async function load(nextPagination = pagination, nextFilters = filters) {
    setLoading(true);
    try {
      const data = await listPlatformTeamVerificationQueue({
        page: nextPagination.page,
        page_size: nextPagination.page_size,
        keyword: nextFilters.keyword?.trim(),
        status: nextFilters.status,
        ...dateRangeParams(nextFilters.date_range),
      });
      setItems(data.items);
      setPagination({
        page: data.pagination.page,
        page_size: data.pagination.page_size,
        total: data.pagination.total,
      });
    } finally {
      setLoading(false);
    }
  }

  function openReview(item: PlatformTeamVerification, decision: 'approved' | 'rejected') {
    setSelected(item);
    reviewForm.resetFields();
    setReviewTarget({ kind: 'team', item, decision });
  }

  async function submitReview(values: ReviewFormValues) {
    if (!reviewTarget || reviewTarget.kind !== 'team') return;
    setReviewSubmitting(true);
    try {
      await reviewPlatformTeamVerification(reviewTarget.item.team_id, {
        decision: reviewTarget.decision,
        comment: values.comment?.trim(),
      });
      message.success('企业认证已处理');
      setReviewTarget(null);
      setSelected(null);
      reviewForm.resetFields();
      await load();
    } finally {
      setReviewSubmitting(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [filters, pagination.page, pagination.page_size]);

  function submitFilters(values: TeamVerificationFilterValues) {
    setFilters(values);
    setPagination((current) => ({ ...current, page: 1 }));
  }

  function resetFilters() {
    const values = { status: 'pending_review' };
    form.setFieldsValue(values);
    submitFilters(values);
  }

  const columns: ColumnsType<PlatformTeamVerification> = [
    { title: '企业', dataIndex: 'company_name', width: 180 },
    { title: '主体名称', dataIndex: 'legal_name', width: 180 },
    { title: '统一社会信用代码', dataIndex: 'registration_number', width: 180 },
    { title: '联系人', dataIndex: 'verification_contact', width: 120 },
    { title: '状态', dataIndex: 'verification_status', width: 120, render: (value) => <StatusTag status={String(value)} /> },
  ];
  return (
    <div className="platform-page">
      <Form
        form={form}
        className="platform-filterbar"
        layout="inline"
        initialValues={{ status: 'pending_review' }}
        onFinish={submitFilters}
      >
        <Form.Item name="keyword">
          <Input allowClear placeholder="企业 / 主体 / 联系人" />
        </Form.Item>
        <Form.Item name="status">
          <Select
            allowClear
            placeholder="状态"
            getPopupContainer={workspacePopupContainer}
            options={[
              { label: '待审核', value: 'pending_review' },
              { label: '已认证', value: 'verified' },
              { label: '已拒绝', value: 'rejected' },
            ]}
          />
        </Form.Item>
        <Form.Item name="date_range">
          <RangePicker allowClear />
        </Form.Item>
        <Form.Item className="platform-filterbar-actions">
          <Space>
            <Button htmlType="submit" type="primary">筛选</Button>
            <Button onClick={resetFilters}>重置</Button>
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
          </Space>
        </Form.Item>
      </Form>
      <EnhancedTable
        rowKey="team_id"
        loading={loading}
        columns={columns}
        dataSource={items}
        pagination={{
          current: pagination.page,
          pageSize: pagination.page_size,
          total: pagination.total,
          showQuickJumper: true,
          showSizeChanger: true,
          onChange: (page, pageSize) => setPagination({ page, page_size: pageSize, total: pagination.total }),
        }}
        onRow={(record) => ({ onClick: () => setSelected(record) })}
      />
      {selected ? (
        <Drawer
          title="企业认证详情"
          open
          onClose={() => setSelected(null)}
          width={620}
          extra={selected.verification_status === 'pending_review' ? (
            <Space>
              <Button type="primary" onClick={() => openReview(selected, 'approved')}>通过</Button>
              <Button danger onClick={() => openReview(selected, 'rejected')}>拒绝</Button>
            </Space>
          ) : null}
        >
          <TeamVerificationDescriptions item={selected} />
        </Drawer>
      ) : null}
      <ReviewModal
        form={reviewForm}
        target={reviewTarget}
        submitting={reviewSubmitting}
        onCancel={() => setReviewTarget(null)}
        onSubmit={submitReview}
      />
    </div>
  );
}

function CertificationPanel() {
  const [form] = Form.useForm<CertificationFilterValues>();
  const [reviewForm] = Form.useForm<ReviewFormValues>();
  const [items, setItems] = useState<PlatformCertification[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PlatformCertification | null>(null);
  const [filters, setFilters] = useState<CertificationFilterValues>({ status: 'pending_review' });
  const [pagination, setPagination] = useState<PlatformPaginationState>(defaultPagination);
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  async function load(nextPagination = pagination, nextFilters = filters) {
    setLoading(true);
    try {
      const data = await listPlatformCertifications({
        page: nextPagination.page,
        page_size: nextPagination.page_size,
        keyword: nextFilters.keyword?.trim(),
        status: nextFilters.status,
        cert_category: nextFilters.cert_category,
      });
      setItems(data.items);
      setPagination({
        page: data.pagination.page,
        page_size: data.pagination.page_size,
        total: data.pagination.total,
      });
    } finally {
      setLoading(false);
    }
  }

  function openReview(item: PlatformCertification, decision: 'approved' | 'rejected') {
    setSelected(item);
    reviewForm.resetFields();
    setReviewTarget({ kind: 'certification', item, decision });
  }

  async function submitReview(values: ReviewFormValues) {
    if (!reviewTarget || reviewTarget.kind !== 'certification') return;
    setReviewSubmitting(true);
    try {
      await reviewPlatformCertification(reviewTarget.item.cert_id, {
        decision: reviewTarget.decision,
        reviewer_notes: values.comment?.trim(),
      });
      message.success('资质审核已处理');
      setReviewTarget(null);
      setSelected(null);
      reviewForm.resetFields();
      await load();
    } finally {
      setReviewSubmitting(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [filters, pagination.page, pagination.page_size]);

  function submitFilters(values: CertificationFilterValues) {
    setFilters(values);
    setPagination((current) => ({ ...current, page: 1 }));
  }

  function resetFilters() {
    const values = { status: 'pending_review' };
    form.setFieldsValue(values);
    submitFilters(values);
  }

  const columns: ColumnsType<PlatformCertification> = [
    { title: '申请人', width: 160, render: (_, item) => item.user.display_name || item.user.username },
    { title: '类型', dataIndex: 'cert_category', width: 120 },
    { title: '资质名称', dataIndex: 'cert_name', width: 220 },
    { title: '状态', dataIndex: 'status', width: 120, render: (value) => <StatusTag status={String(value)} /> },
  ];
  return (
    <div className="platform-page">
      <Form
        form={form}
        className="platform-filterbar"
        layout="inline"
        initialValues={{ status: 'pending_review' }}
        onFinish={submitFilters}
      >
        <Form.Item name="keyword">
          <Input allowClear placeholder="申请人 / 邮箱" />
        </Form.Item>
        <Form.Item name="cert_category">
          <Select
            allowClear
            placeholder="类型"
            getPopupContainer={workspacePopupContainer}
            options={[
              { label: '基础信息', value: 'basic_info' },
              { label: '学历', value: 'education' },
              { label: '领域', value: 'domain' },
            ]}
          />
        </Form.Item>
        <Form.Item name="status">
          <Select
            allowClear
            placeholder="状态"
            getPopupContainer={workspacePopupContainer}
            options={[
              { label: '待审核', value: 'pending_review' },
              { label: '已通过', value: 'approved' },
              { label: '已拒绝', value: 'rejected' },
            ]}
          />
        </Form.Item>
        <Form.Item className="platform-filterbar-actions">
          <Space>
            <Button htmlType="submit" type="primary">筛选</Button>
            <Button onClick={resetFilters}>重置</Button>
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
          </Space>
        </Form.Item>
      </Form>
      <EnhancedTable
        rowKey="cert_id"
        loading={loading}
        columns={columns}
        dataSource={items}
        pagination={{
          current: pagination.page,
          pageSize: pagination.page_size,
          total: pagination.total,
          showQuickJumper: true,
          showSizeChanger: true,
          onChange: (page, pageSize) => setPagination({ page, page_size: pageSize, total: pagination.total }),
        }}
        onRow={(record) => ({ onClick: () => setSelected(record) })}
      />
      {selected ? (
        <Drawer
          title="资质审核详情"
          open
          onClose={() => setSelected(null)}
          width={620}
          extra={selected.status === 'pending_review' ? (
            <Space>
              <Button type="primary" onClick={() => openReview(selected, 'approved')}>通过</Button>
              <Button danger onClick={() => openReview(selected, 'rejected')}>拒绝</Button>
            </Space>
          ) : null}
        >
          <CertificationDescriptions item={selected} />
        </Drawer>
      ) : null}
      <ReviewModal
        form={reviewForm}
        target={reviewTarget}
        submitting={reviewSubmitting}
        onCancel={() => setReviewTarget(null)}
        onSubmit={submitReview}
      />
    </div>
  );
}

function ReputationAppealPanel() {
  const [items, setItems] = useState<PlatformReputationAppeal[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await listPlatformReputationAppeals({ status: 'pending', page_size: 50 });
      setItems(data.items);
    } finally {
      setLoading(false);
    }
  }

  async function review(item: PlatformReputationAppeal, decision: 'approved' | 'rejected') {
    let reviewerNotes = '';
    Modal.confirm({
      title: decision === 'approved' ? '通过信誉分申诉' : '拒绝信誉分申诉',
      content: (
        <div className="platform-review-modal-body">
          <Alert type={decision === 'approved' ? 'success' : 'warning'} showIcon message={decision === 'approved' ? '通过后会返还该扣分流水扣除的全部信誉分。' : '拒绝后该扣分保持不变。'} />
          <Input.TextArea rows={3} placeholder="审核备注" onChange={(event) => { reviewerNotes = event.target.value; }} />
        </div>
      ),
      okText: decision === 'approved' ? '通过并返还' : '拒绝',
      okButtonProps: { danger: decision === 'rejected' },
      onOk: async () => {
        await reviewPlatformReputationAppeal(item.appeal_id, { decision, reviewer_notes: reviewerNotes });
        message.success(decision === 'approved' ? '申诉已通过，信誉分已返还' : '申诉已拒绝');
        await load();
      },
    });
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const columns: ColumnsType<PlatformReputationAppeal> = [
    { title: '申诉人', width: 160, render: (_, item) => item.user?.display_name || item.user?.username || item.user?.email || item.user?.user_id || '-' },
    { title: '扣分原因', width: 260, render: (_, item) => item.ledger?.reason || '-' },
    { title: '扣分', width: 90, render: (_, item) => item.ledger?.change ?? '-' },
    { title: '申诉理由', dataIndex: 'reason', ellipsis: true },
    { title: '状态', dataIndex: 'status', width: 120, render: (value) => <StatusTag status={String(value)} /> },
    { title: '提交时间', dataIndex: 'created_at', width: 170, render: (value) => value || '-' },
    {
      title: '操作',
      width: 190,
      render: (_, item) => (
        <Space>
          <Button size="small" type="primary" disabled={item.status !== 'pending'} onClick={() => void review(item, 'approved')}>通过</Button>
          <Button size="small" danger disabled={item.status !== 'pending'} onClick={() => void review(item, 'rejected')}>拒绝</Button>
        </Space>
      ),
    },
  ];
  return (
    <div className="platform-page">
      <div className="platform-toolbar">
        <Alert type="info" showIcon message="通过申诉后，系统会自动按原扣分数返还信誉分，并写入返还流水。" />
        <Button onClick={() => void load()}>刷新</Button>
      </div>
      <EnhancedTable rowKey="appeal_id" loading={loading} columns={columns} dataSource={items} pagination={{ pageSize: 10, showQuickJumper: true }} />
    </div>
  );
}

interface PlatformSettingsFormValues {
  commission_rate_percent: number;
}

interface AgentEmbeddingFormValues {
  api_base?: string;
  api_key?: string;
  model: string;
}

function PlatformSettingsPage() {
  const [commissionForm] = Form.useForm<PlatformSettingsFormValues>();
  const [embeddingForm] = Form.useForm<AgentEmbeddingFormValues>();
  const [embeddingSetting, setEmbeddingSetting] = useState<PlatformAgentEmbeddingSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingCommission, setSavingCommission] = useState(false);
  const [savingEmbedding, setSavingEmbedding] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [commissionSetting, agentEmbeddingSetting] = await Promise.all([
        getPlatformCommissionSetting(),
        getPlatformAgentEmbeddingSetting(),
      ]);
      commissionForm.setFieldsValue({ commission_rate_percent: commissionSetting.commission_rate_bps / 100 });
      embeddingForm.setFieldsValue({
        api_base: agentEmbeddingSetting.api_base ?? undefined,
        api_key: undefined,
        model: agentEmbeddingSetting.model || 'text-embedding-3-small',
      });
      setEmbeddingSetting(agentEmbeddingSetting);
    } finally {
      setLoading(false);
    }
  }

  async function submitCommission(values: PlatformSettingsFormValues) {
    setSavingCommission(true);
    try {
      await updatePlatformCommissionSetting(Math.round(values.commission_rate_percent * 100));
      message.success('平台服务费率已更新');
      await load();
    } finally {
      setSavingCommission(false);
    }
  }

  async function submitEmbedding(values: AgentEmbeddingFormValues) {
    setSavingEmbedding(true);
    try {
      const apiKey = values.api_key?.trim();
      const updated = await updatePlatformAgentEmbeddingSetting({
        api_base: values.api_base?.trim() || null,
        model: values.model.trim(),
        ...(apiKey ? { api_key: apiKey } : {}),
      });
      setEmbeddingSetting(updated);
      embeddingForm.setFieldsValue({
        api_base: updated.api_base ?? undefined,
        api_key: undefined,
        model: updated.model || 'text-embedding-3-small',
      });
      message.success('平台问答 Agent Embedding 配置已更新');
    } catch (err) {
      message.error(getProviderErrorMessage(err, 'Embedding 配置保存失败'));
    } finally {
      setSavingEmbedding(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="platform-settings">
      <Spin spinning={loading}>
        <div className="platform-settings-grid">
          <section className="platform-panel">
            <div className="platform-panel-head">
              <strong>平台服务费</strong>
            </div>
            <Alert type="info" showIcon message="服务费由需求方额外承担，标注员奖励不变。" />
            <Form form={commissionForm} layout="vertical" onFinish={(values) => void submitCommission(values)} className="platform-settings-form">
              <Form.Item
                name="commission_rate_percent"
                label="平台服务费率"
                rules={[{ required: true, message: '请输入服务费率' }]}
              >
                <InputNumber min={0} max={100} precision={2} addonAfter="%" className="platform-rate-input" />
              </Form.Item>
              <Button type="primary" htmlType="submit" icon={<SettingOutlined />} loading={savingCommission}>保存服务费设置</Button>
            </Form>
          </section>

          <section className="platform-panel">
            <div className="platform-panel-head">
              <strong>平台问答 Agent Embedding</strong>
              <Tag color={embeddingSetting?.api_key_configured ? 'green' : 'gold'}>
                {embeddingSetting?.api_key_configured ? 'Key 已配置' : '未配置 Key'}
              </Tag>
            </div>
            <Alert
              type="info"
              showIcon
              message="Embedding 配置用于公开文档 RAG 检索；平台默认对话模型仍在 Provider 页面配置。"
            />
            <Form form={embeddingForm} layout="vertical" onFinish={(values) => void submitEmbedding(values)} className="platform-settings-form platform-settings-form-wide">
              <Form.Item
                name="api_base"
                label="Embedding API Base"
              >
                <Input placeholder="https://api.openai.com/v1" autoComplete="off" />
              </Form.Item>
              <Form.Item
                name="model"
                label="Embedding 模型"
                rules={[
                  { required: true, message: '请输入 Embedding 模型' },
                  {
                    validator: (_, value) => (String(value ?? '').trim()
                      ? Promise.resolve()
                      : Promise.reject(new Error('Embedding 模型不能为空'))),
                  },
                ]}
              >
                <Input placeholder="text-embedding-3-small" autoComplete="off" />
              </Form.Item>
              <Form.Item
                name="api_key"
                label="Embedding API Key"
                extra={embeddingSetting?.api_key_configured ? '留空会保留当前已保存的 API Key。' : '保存后密钥会加密存储，不会在页面回显。'}
                rules={[
                  {
                    validator: (_, value) => {
                      if (embeddingSetting?.api_key_configured || String(value ?? '').trim()) return Promise.resolve();
                      return Promise.reject(new Error('首次配置 Embedding 时必须填写 API Key'));
                    },
                  },
                ]}
              >
                <Input.Password
                  placeholder={embeddingSetting?.api_key_configured ? '已配置，留空不变' : '请输入 Embedding API Key'}
                  autoComplete="new-password"
                />
              </Form.Item>
              <Button type="primary" htmlType="submit" icon={<SettingOutlined />} loading={savingEmbedding}>保存 Embedding 配置</Button>
            </Form>
          </section>
        </div>
      </Spin>
    </div>
  );
}

function SettlementTable({
  data,
  loading,
  compact,
  onSelect,
  pagination,
  className,
}: {
  data: PlatformSettlement[];
  loading?: boolean;
  compact?: boolean;
  onSelect?: (item: PlatformSettlement) => void;
  pagination?: false | TablePaginationConfig;
  className?: string;
}) {
  const columns = useMemo<ColumnsType<PlatformSettlement>>(() => [
    { title: '企业', dataIndex: 'team_name', width: 180, ellipsis: true },
    { title: '标注员', dataIndex: 'labeler_name', width: 140, ellipsis: true },
    { title: '奖励', dataIndex: 'reward_points', width: 120, render: formatPoints },
    { title: '服务费', dataIndex: 'amount_points', width: 140, render: formatPoints },
    { title: '费率', dataIndex: 'commission_rate_bps', width: 100, render: (value) => `${Number(value) / 100}%` },
    { title: '状态', dataIndex: 'status', width: 100, render: (value) => <StatusTag status={String(value)} /> },
    { title: '时间', dataIndex: 'created_at', width: 170, render: formatTime },
  ], []);
  return (
    <EnhancedTable
      rowKey="ledger_id"
      size={compact ? 'small' : 'middle'}
      className={className}
      loading={loading}
      columns={compact ? [columns[0], columns[1], columns[2], columns[3], columns[6]] : columns}
      dataSource={data}
      pagination={compact ? false : pagination ?? { pageSize: 10, showQuickJumper: true }}
      scroll={compact ? { x: 'max-content', y: 218 } : undefined}
      onRow={(record) => ({ onClick: () => onSelect?.(record) })}
    />
  );
}

function SettlementDescriptions({ item }: { item: PlatformSettlement }) {
  return (
    <Descriptions column={1} bordered size="small">
      <Descriptions.Item label="企业">{item.team_name || item.team_id}</Descriptions.Item>
      <Descriptions.Item label="标注员">{item.labeler_name || item.labeler_id}</Descriptions.Item>
      <Descriptions.Item label="奖励积分">{formatPoints(item.reward_points)}</Descriptions.Item>
      <Descriptions.Item label="平台服务费">{formatPoints(item.amount_points)}</Descriptions.Item>
      <Descriptions.Item label="服务费率">{item.commission_rate_bps / 100}%</Descriptions.Item>
      <Descriptions.Item label="来源">{item.source_type} / {item.source_id}</Descriptions.Item>
      <Descriptions.Item label="时间">{formatTime(item.created_at)}</Descriptions.Item>
    </Descriptions>
  );
}

function TeamVerificationDescriptions({ item }: { item: PlatformTeamVerification }) {
  return (
    <div className="platform-drawer-stack">
      <Descriptions column={1} bordered size="small">
        <Descriptions.Item label="企业">{item.company_name}</Descriptions.Item>
        <Descriptions.Item label="主体名称">{item.legal_name || '-'}</Descriptions.Item>
        <Descriptions.Item label="统一社会信用代码">{item.registration_number || '-'}</Descriptions.Item>
        <Descriptions.Item label="联系人">{item.verification_contact || '-'}</Descriptions.Item>
        <Descriptions.Item label="联系电话">{item.verification_phone || '-'}</Descriptions.Item>
        <Descriptions.Item label="状态"><StatusTag status={item.verification_status} /></Descriptions.Item>
        <Descriptions.Item label="提交时间">{formatTime(item.verification_submitted_at || item.created_at)}</Descriptions.Item>
        <Descriptions.Item label="历史备注">{item.verification_review_comment || '-'}</Descriptions.Item>
      </Descriptions>
      <section className="platform-detail-section">
        <strong>认证材料</strong>
        <MaterialList items={item.verification_materials} teamId={item.team_id} />
      </section>
    </div>
  );
}

function CertificationDescriptions({ item }: { item: PlatformCertification }) {
  return (
    <div className="platform-drawer-stack">
      <Descriptions column={1} bordered size="small">
        <Descriptions.Item label="申请人">{item.user.display_name || item.user.username}</Descriptions.Item>
        <Descriptions.Item label="邮箱">{item.user.email || '-'}</Descriptions.Item>
        <Descriptions.Item label="类型">{item.cert_category}</Descriptions.Item>
        <Descriptions.Item label="资质名称">{item.cert_name}</Descriptions.Item>
        <Descriptions.Item label="状态"><StatusTag status={item.status} /></Descriptions.Item>
        <Descriptions.Item label="提交时间">{formatTime(item.created_at)}</Descriptions.Item>
        <Descriptions.Item label="审核备注">{item.reviewer_notes || '-'}</Descriptions.Item>
      </Descriptions>
      <section className="platform-detail-section">
        <strong>申请信息</strong>
        <pre className="platform-json-block">{JSON.stringify(item.submitted_data || {}, null, 2)}</pre>
      </section>
      <section className="platform-detail-section">
        <strong>证明材料</strong>
        <MaterialList items={item.documents} />
      </section>
    </div>
  );
}

function MaterialList({ items, teamId }: { items: unknown[]; teamId?: string }) {
  if (!items?.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无材料" />;
  return (
    <div className="platform-material-list">
      {items.map((item, index) => {
        const material = normalizeMaterial(item, index, teamId ? 'team' : 'profile');
        return (
          <div className="platform-material-item" key={material.key}>
            <div className="platform-material-icon" aria-hidden="true">
              {material.url ? <LinkOutlined /> : <FileTextOutlined />}
            </div>
            <div className="platform-material-main">
              <Typography.Text strong ellipsis={{ tooltip: material.name }}>
                {material.name}
              </Typography.Text>
              <div className="platform-material-meta">
                {material.type ? <Tag>{material.type}</Tag> : null}
                {material.sizeLabel ? <Tag>{material.sizeLabel}</Tag> : null}
                {material.fileId ? (
                  <Tooltip title={material.fileId}>
                    <Tag>文件 ID</Tag>
                  </Tooltip>
                ) : null}
                {!material.type && !material.sizeLabel && !material.fileId ? <span>{material.summary}</span> : null}
              </div>
            </div>
            {material.url ? (
              <Button
                size="small"
                icon={<EyeOutlined />}
                onClick={() => void openMaterialUrl(material.url, teamId)}
              >
                查看
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

interface NormalizedMaterial {
  key: string;
  name: string;
  url: string | null;
  type: string | null;
  sizeLabel: string | null;
  fileId: string | null;
  summary: string;
}

function normalizeMaterial(item: unknown, index: number, source: 'team' | 'profile'): NormalizedMaterial {
  if (typeof item === 'string') {
    const value = item.trim();
    return {
      key: `${index}-${value}`,
      name: filenameFromUrl(value) || value || `材料 ${index + 1}`,
      url: value || null,
      type: inferMaterialType(value),
      sizeLabel: null,
      fileId: null,
      summary: value || '未命名材料',
    };
  }

  if (isRecord(item)) {
    const url = pickString(item, ['url', 'file_url', 'download_url', 'preview_url', 'href', 'src', 'path']);
    const name = pickString(item, ['filename', 'file_name', 'name', 'title', 'label', 'original_name'])
      || (url ? filenameFromUrl(url) : null)
      || `材料 ${index + 1}`;
    const type = pickString(item, ['content_type', 'mime_type', 'mime', 'type', 'category']) || inferMaterialType(url || name);
    const fileId = pickString(item, ['file_id', 'id']);
    const size = pickNumber(item, ['size', 'size_bytes', 'file_size']);
    return {
      key: `${index}-${fileId || url || name}`,
      name,
      url: url || materialUrlFromFileId(fileId, source),
      type,
      sizeLabel: formatFileSize(size),
      fileId,
      summary: summarizeMaterialRecord(item),
    };
  }

  return {
    key: `${index}-${String(item)}`,
    name: `材料 ${index + 1}`,
    url: null,
    type: null,
    sizeLabel: null,
    fileId: null,
    summary: String(item ?? '-'),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function summarizeMaterialRecord(record: Record<string, unknown>): string {
  const entries = Object.entries(record)
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`);
  return entries.length ? entries.join(' / ') : '结构化材料';
}

function filenameFromUrl(url: string): string | null {
  const cleaned = url.split('?')[0]?.split('#')[0] || '';
  const name = cleaned.split('/').filter(Boolean).at(-1);
  if (!name) return null;
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function inferMaterialType(value: string | null): string | null {
  if (!value) return null;
  const lowered = value.toLowerCase();
  if (lowered.includes('pdf') || lowered.endsWith('.pdf')) return 'PDF';
  if (/\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(lowered) || lowered.startsWith('image/')) return '图片';
  if (/\.(docx?|xlsx?|pptx?)$/i.test(lowered)) return '文档';
  return null;
}

function formatFileSize(size: number | null): string | null {
  if (!size || size <= 0) return null;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

async function openMaterialUrl(url: string | null, teamId?: string) {
  if (!url) return;
  if (/^(https?:|data:|blob:)/i.test(url)) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  try {
    const response = await authenticatedFetch(materialApiPath(url), {
      headers: teamId ? { 'X-Team-ID': teamId } : undefined,
    });
    if (!response.ok) throw new Error('材料打开失败');
    openBlobMaterial(await response.blob(), filenameFromDisposition(response.headers.get('Content-Disposition')) || filenameFromUrl(url) || 'material');
  } catch (err) {
    message.error(err instanceof Error ? err.message : '材料打开失败');
  }
}

function materialUrlFromFileId(fileId: string | null, source: 'team' | 'profile'): string | null {
  if (!fileId) return null;
  if (source === 'profile') return `/api/v1/profile/certifications/materials/${encodeURIComponent(fileId)}/download`;
  return `/api/v1/uploads/${encodeURIComponent(fileId)}/download`;
}

function materialApiPath(url: string): string {
  const apiBase = getApiBaseUrl();
  if (url.startsWith(apiBase)) return url.slice(apiBase.length) || '/';
  if (url.startsWith('/api/v1')) return url.slice('/api/v1'.length) || '/';
  return url;
}

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const asciiMatch = header.match(/filename="([^"]+)"/i) || header.match(/filename=([^;]+)/i);
  return asciiMatch?.[1]?.trim() || null;
}

function openBlobMaterial(blob: Blob, filename: string) {
  if (typeof URL === 'undefined' || !URL.createObjectURL) return;
  const blobUrl = URL.createObjectURL(blob);
  const opened = window.open(blobUrl, '_blank', 'noopener,noreferrer');
  if (opened) {
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    return;
  }
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(blobUrl);
}

function ReviewModal({
  form,
  target,
  submitting,
  onCancel,
  onSubmit,
}: {
  form: ReturnType<typeof Form.useForm<ReviewFormValues>>[0];
  target: ReviewTarget | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (values: ReviewFormValues) => Promise<void>;
}) {
  const isReject = target?.decision === 'rejected';
  const actionLabel = target?.decision === 'approved' ? '通过' : '拒绝';
  return (
    <Modal
      title={target ? `${actionLabel}${reviewTargetLabel(target)}` : '审核'}
      open={Boolean(target)}
      okText={actionLabel}
      okButtonProps={{ danger: isReject, loading: submitting }}
      confirmLoading={submitting}
      onCancel={onCancel}
      onOk={() => form.submit()}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={(values) => void onSubmit(values)} preserve={false}>
        <Form.Item
          name="comment"
          label="审核备注"
          rules={isReject ? [{ required: true, whitespace: true, message: '拒绝时必须填写原因' }] : undefined}
        >
          <Input.TextArea rows={4} maxLength={300} showCount placeholder={isReject ? '请填写拒绝原因' : '可填写处理备注'} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function reviewTargetLabel(target: ReviewTarget) {
  if (target.kind === 'team') return '企业认证';
  return '资质认证';
}

function StatusTag({ status }: { status: string }) {
  const color = status === 'completed' || status === 'approved' || status === 'verified'
    ? 'green'
    : status === 'pending' || status === 'pending_review'
      ? 'gold'
      : status === 'rejected'
        ? 'red'
        : 'default';
  const labels: Record<string, string> = {
    completed: '已完成',
    approved: '已通过',
    verified: '已认证',
    pending: '待处理',
    pending_review: '待审核',
    rejected: '已拒绝',
    enabled: '启用',
    disabled: '停用',
  };
  return <Tag color={color}>{labels[status] || status}</Tag>;
}

function formatPoints(value?: number | string | null) {
  return `${Number(value || 0).toLocaleString('zh-CN')} 积分`;
}

function formatMoneyByMillion(value: number) {
  return `${Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 4 })} 元 / 1M tokens`;
}

function formatFullNumber(value: number) {
  return Number(value || 0).toLocaleString('zh-CN');
}

function formatCompactNumber(value: number) {
  return Number(value || 0).toLocaleString('zh-CN', { notation: 'compact', maximumFractionDigits: 1 });
}

function formatTime(value?: string | null) {
  return formatApiDateTime(value);
}

function getProviderErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiClientError) {
    return error.requestId ? `${error.message}（request_id: ${error.requestId}）` : error.message;
  }
  return error instanceof Error ? error.message : fallback;
}

function extractFailedTestResult(error: unknown): ProviderConnectionTestResult | null {
  if (!(error instanceof ApiClientError)) return null;
  const detail = (error.detail && typeof error.detail === 'object') ? error.detail as Record<string, unknown> : null;
  const requestId = typeof detail?.request_id === 'string'
    ? detail.request_id
    : error.requestId;
  const latency = typeof detail?.latency_ms === 'number' ? detail.latency_ms : 0;
  return {
    route_name: '',
    provider_kind: '',
    model: '',
    latency_ms: latency,
    status: 'failed',
    request_id: requestId,
  };
}
