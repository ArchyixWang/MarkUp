import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Empty, Progress, Space, Spin, Statistic, Tag, Tooltip, Typography } from 'antd';
import { Column, Pie } from '@ant-design/charts';
import {
  ApiOutlined,
  AuditOutlined,
  BellOutlined,
  DatabaseOutlined,
  FileDoneOutlined,
  ReloadOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { ApiClientError } from '../../services/apiClient';
import { EnhancedTable } from '../../components/ui/EnhancedTable';
import { getAdminOverview, getTeamDashboard } from '../../services/workspaceService';
import type { ApiUser, TeamDashboardPayload } from '../../types/api';
import { formatApiShortDateTime, parseApiDateTime } from '../../utils/dateTime';
import type { WorkspacePage } from './WorkspaceApp';
import { WorkspaceSecondaryCode } from './workspaceDisplay';
import { canAccessWorkspacePage } from '../../app/workspaceNavigation';

type DashboardTask = TeamDashboardPayload['production']['recent_tasks'][number];
type DashboardShortcut = TeamDashboardPayload['shortcuts'][number];
type DashboardExport = TeamDashboardPayload['exports']['recent_exports'][number];
type DashboardAiJob = TeamDashboardPayload['ai']['recent_jobs'][number];
type DashboardNotification = TeamDashboardPayload['governance']['notifications'][number];
type DashboardAuditLog = TeamDashboardPayload['governance']['audit_logs'][number];
type ChartDatum = { label: string; value: number; type?: string };

const roleLabels: Record<string, string> = {
  team_admin: '企业管理员',
  owner: '任务负责人',
  reviewer: '审核员',
  agent: 'Agent',
};

const teamStatusLabels: Record<string, string> = {
  active: '正常',
  disabled: '已停用',
  pending: '待完善',
};

const verificationStatusLabels: Record<string, string> = {
  verified: '已认证',
  pending_review: '认证审核中',
  rejected: '认证未通过',
  unverified: '未认证',
};

const taskStatusLabels: Record<string, string> = {
  draft: '草稿',
  pending_review: '待发布审核',
  published: '已发布',
  paused: '已暂停',
  finished: '已完成',
};

const asyncStatusLabels: Record<string, string> = {
  pending: '等待中',
  processing: '处理中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

const priorityLabels: Record<string, string> = {
  normal: '普通',
  important: '重要',
  urgent: '紧急',
  high: '高风险',
};

const statusColorMap: Record<string, string> = {
  info: 'blue',
  success: 'green',
  processing: 'blue',
  warning: 'gold',
  error: 'red',
  draft: 'default',
  pending_review: 'gold',
  published: 'green',
  paused: 'orange',
  finished: 'blue',
  completed: 'green',
  failed: 'red',
  pending: 'gold',
  active: 'green',
  normal: 'blue',
  important: 'gold',
  urgent: 'red',
  high: 'red',
  verified: 'green',
  unverified: 'default',
};

const chartPalette = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#0891b2', '#7c3aed'];
const reviewPalette = ['#d97706', '#16a34a', '#dc2626', '#2563eb'];
const testRuntime = import.meta.env.MODE === 'test';

export function WorkspaceDashboardPage({ user, onNavigate }: { user: ApiUser; onNavigate: (page: WorkspacePage) => void }) {
  const [dashboard, setDashboard] = useState<TeamDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const overview = await getAdminOverview();
      const teamId = overview.default_team_id ?? overview.teams[0]?.team_id;
      if (!teamId) {
        setDashboard(null);
        setError('请先完成企业企业配置。');
        return;
      }
      setDashboard(await getTeamDashboard(teamId));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '企业看板加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  const visibleShortcuts = useMemo(
    () => (dashboard?.shortcuts ?? []).filter((item) => canAccessWorkspacePage(user, item.target_page as WorkspacePage)),
    [dashboard?.shortcuts, user],
  );
  const primaryShortcut = useMemo(
    () => visibleShortcuts.find((item) => item.kind === 'primary') ?? visibleShortcuts[0],
    [visibleShortcuts],
  );
  const viewerRole = dashboard?.viewer_role ?? '';
  const isReviewer = viewerRole === 'reviewer';
  const isAgent = viewerRole === 'agent';
  const teamTitle = dashboard?.team.company_name ?? `欢迎回来，${user.display_name || user.username}`;

  return (
    <main className="workspace-content workspace-dashboard-page workspace-fixed-page">
      <section className="page-heading dashboard-heading">
        <div>
          <p className="section-kicker">DASHBOARD</p>
          <h1>企业工作台</h1>
          <p>
            {dashboard
              ? `${teamTitle} · ${teamStatusLabels[dashboard.team.status || ''] || dashboard.team.status || '状态未同步'} · ${formatDateTime(dashboard.generated_at)}`
              : '正在读取企业生产、审核、AI、导出和资源状态。'}
          </p>
        </div>
        <Space wrap>
          {dashboard ? (
            <Tag color={statusColorMap[dashboard.team.verification_status || ''] || 'default'}>
              {verificationStatusLabels[dashboard.team.verification_status || ''] || '认证状态未同步'}
            </Tag>
          ) : null}
          {dashboard ? <Tag color="blue">{roleLabels[dashboard.viewer_role] || dashboard.viewer_role}</Tag> : null}
          <Tooltip title="刷新企业看板">
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadDashboard()}>
              刷新
            </Button>
          </Tooltip>
          {primaryShortcut ? (
            <Button type="primary" icon={shortcutIcon(primaryShortcut.target_page)} onClick={() => onNavigate(primaryShortcut.target_page as WorkspacePage)}>
              {primaryShortcut.label}
            </Button>
          ) : null}
        </Space>
      </section>

      <div className="dashboard-scroll-area">
        {error ? (
          <Alert
            className="inline-message-ant"
            type="error"
            showIcon
            message={error}
            action={<Button size="small" onClick={() => void loadDashboard()}>重试</Button>}
          />
        ) : null}

        <Spin spinning={loading && !dashboard}>
          {dashboard ? (
            <div className="dashboard-cockpit">
              <KpiStrip data={dashboard} />

              <section className={`dashboard-chart-grid dashboard-chart-grid--${viewerRole || 'default'}`} aria-label="企业图表">
                <div className="dashboard-chart-primary">
                  {isReviewer ? <ReviewChart data={dashboard} /> : isAgent ? <AiExportChart data={dashboard} /> : <ProductionFunnelChart data={dashboard} />}
                </div>
                <div className="dashboard-chart-secondary">
                  {isReviewer ? <AiExportChart data={dashboard} compact /> : <TaskStatusChart data={dashboard} />}
                  <ResourceQuotaPanel data={dashboard} />
                </div>
              </section>

              <section className="dashboard-main-grid" aria-label="企业看板详情">
                <div className="dashboard-left-column">
                  {isReviewer ? <ReviewFocusPanel data={dashboard} /> : <RecentTasksTable tasks={dashboard.production.recent_tasks} />}
                  {isAgent ? <RecentAiJobsTable jobs={dashboard.ai.recent_jobs} /> : <RecentExportsTable exports={dashboard.exports.recent_exports} />}
                </div>
                <div className="dashboard-right-column">
                  <GovernancePanel data={dashboard} shortcuts={visibleShortcuts} onNavigate={onNavigate} />
                  <ResourceStatusPanel data={dashboard} />
                </div>
              </section>
            </div>
          ) : loading ? null : (
            <Card className="dashboard-empty-card">
              <Empty description="暂无可展示的企业看板数据" />
            </Card>
          )}
        </Spin>
      </div>
    </main>
  );
}

function KpiStrip({ data }: { data: TeamDashboardPayload }) {
  const icons = [<RocketOutlined />, <AuditOutlined />, <ApiOutlined />, <DatabaseOutlined />, <WalletOutlined />, <TeamOutlined />];
  return (
    <section className="dashboard-kpi-strip" aria-label="企业指标">
      {data.summary_cards.map((item, index) => (
        <div key={item.key} className={`dashboard-kpi-item dashboard-kpi-item--${item.status}`}>
          <span className="dashboard-kpi-icon">{icons[index] ?? <SafetyCertificateOutlined />}</span>
          <Statistic title={item.label} value={item.value} />
          {item.hint ? <Typography.Text type="secondary">{item.hint}</Typography.Text> : null}
        </div>
      ))}
    </section>
  );
}

function ProductionFunnelChart({ data }: { data: TeamDashboardPayload }) {
  const questions = data.production.questions;
  const chartData = [
    { label: '题目总量', value: questions.total },
    { label: '已领取', value: questions.claimed },
    { label: '已提交', value: questions.submitted },
    { label: '已通过', value: questions.approved },
  ];
  const total = chartData.reduce((sum, item) => sum + Math.max(0, Number(item.value || 0)), 0);
  const max = Math.max(...chartData.map((item) => item.value), 1);

  return (
    <Card className="dashboard-panel dashboard-chart-card dashboard-conversion-card" title="生产漏斗" extra={<Typography.Text type="secondary">打回 {formatNumber(questions.rejected)} 题</Typography.Text>}>
      {total ? (
        <div className="dashboard-conversion-chart" role="img" aria-label="生产漏斗">
          {chartData.map((item, index) => (
            <div key={item.label} className="dashboard-conversion-row">
              <span className="dashboard-conversion-label">{item.label}</span>
              <div className="dashboard-conversion-track">
                <span
                  className="dashboard-conversion-bar"
                  style={{
                    '--dashboard-conversion-color': chartPalette[index % chartPalette.length],
                    '--dashboard-conversion-width': `${Math.max(item.value ? 8 : 0, (item.value / max) * 100)}%`,
                  } as React.CSSProperties}
                />
              </div>
              <strong>{formatNumber(item.value)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="生产漏斗暂无数据" />
      )}
    </Card>
  );
}

function TaskStatusChart({ data }: { data: TeamDashboardPayload }) {
  const tasks = data.production.tasks;
  const chartData = (['draft', 'pending_review', 'published', 'paused', 'finished'] as const).map((key) => ({
    label: taskStatusLabels[key],
    value: tasks[key],
  })).filter((item) => item.value > 0);

  return (
    <DashboardChart title="任务状态分布" subtitle={`总任务 ${formatNumber(tasks.total)}`} data={chartData} compact>
      <Column
        data={chartData}
        xField="label"
        yField="value"
        colorField="label"
        height={150}
        autoFit
        legend={false}
        scale={{ color: { range: chartPalette } }}
        label={{ text: 'value', position: 'top' }}
        padding={[18, 8, 28, 8]}
        axis={{ x: { labelAutoRotate: false, tick: false }, y: false }}
      />
    </DashboardChart>
  );
}

function ReviewChart({ data }: { data: TeamDashboardPayload }) {
  const chartData = [
    { label: '待审', value: data.review.pending },
    { label: '通过', value: data.review.approved },
    { label: '打回', value: data.review.rejected },
    { label: '已处理', value: data.review.completed },
  ];

  return (
    <DashboardChart title="审核结果分布" subtitle={`可见任务 ${formatNumber(data.review.task_count || 0)}`} data={chartData}>
      <Pie
        data={chartData}
        angleField="value"
        colorField="label"
        height={150}
        autoFit
        innerRadius={0.58}
        scale={{ color: { range: reviewPalette } }}
        label={{ text: 'value', position: 'outside' }}
        legend={{ color: { position: 'bottom' } }}
      />
    </DashboardChart>
  );
}

function AiExportChart({ data, compact = false }: { data: TeamDashboardPayload; compact?: boolean }) {
  const chartData = [
    { label: 'AI 等待', value: data.ai.jobs.pending, type: 'AI 预审' },
    { label: 'AI 处理', value: data.ai.jobs.processing, type: 'AI 预审' },
    { label: 'AI 完成', value: data.ai.jobs.completed, type: 'AI 预审' },
    { label: 'AI 失败', value: data.ai.jobs.failed, type: 'AI 预审' },
    { label: '导出等待', value: data.exports.pending, type: '导出' },
    { label: '导出处理', value: data.exports.processing, type: '导出' },
    { label: '导出完成', value: data.exports.completed, type: '导出' },
    { label: '导出失败', value: data.exports.failed, type: '导出' },
  ];

  return (
    <DashboardChart title="AI / 导出状态" subtitle={`AI 钱包 ${formatPoints(data.ai.wallet.balance_points)}`} data={chartData} compact={compact}>
      <Column
        data={chartData}
        xField="label"
        yField="value"
        colorField="type"
        height={150}
        autoFit
        scale={{ color: { range: ['#2563eb', '#0891b2'] } }}
        axis={{ x: { labelAutoRotate: false }, y: { tick: false } }}
      />
    </DashboardChart>
  );
}

function ResourceQuotaPanel({ data }: { data: TeamDashboardPayload }) {
  const usage = data.resources.membership.usage;
  const limits = data.resources.membership.limits;
  const quotaItems = (['members', 'active_tasks', 'storage_bytes'] as const).map((key) => {
    const current = Number(usage[key] || 0);
    const limit = Number(limits[key] || 0);
    const percent = limit ? Math.min(100, Math.round((current / limit) * 100)) : 0;
    return { key, current, limit, percent };
  });

  return (
    <Card className="dashboard-panel dashboard-quota-panel" title="资源额度">
      <div className="dashboard-quota-grid">
        {quotaItems.map((item) => (
          <div key={item.key} className={`dashboard-quota-item dashboard-quota-item--${quotaStatus(item.percent)}`} role="img" aria-label={`${limitLabel(item.key)}额度 ${item.percent}%`}>
            <div className="dashboard-quota-head">
              <span>{limitLabel(item.key)}</span>
              <strong>{item.percent}%</strong>
            </div>
            <Progress percent={item.percent} size="small" showInfo={false} strokeColor={quotaColor(item.percent)} />
            <div className="dashboard-quota-meta">
              <strong>{formatLimitValue(item.key, item.current)}</strong>
              <span>/ {formatLimitValue(item.key, item.limit)}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DashboardChart({ title, subtitle, data, compact = false, children }: { title: string; subtitle?: string; data: ChartDatum[]; compact?: boolean; children: React.ReactNode }) {
  const total = data.reduce((sum, item) => sum + Math.max(0, Number(item.value || 0)), 0);
  return (
    <Card className={`dashboard-panel dashboard-chart-card${compact ? ' dashboard-chart-card--compact' : ''}`} title={title} extra={subtitle ? <Typography.Text type="secondary">{subtitle}</Typography.Text> : null}>
      {total ? (
        <div className="dashboard-chart-canvas">
          {testRuntime ? <ChartFallback title={title} data={data} /> : children}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`${title}暂无数据`} />
      )}
    </Card>
  );
}

function ChartFallback({ title, data }: { title: string; data: ChartDatum[] }) {
  const max = Math.max(...data.map((item) => item.value), 1);
  return (
    <div role="img" aria-label={title} className="dashboard-chart-fallback">
      {data.map((item, index) => (
        <span key={`${item.label}-${index}`}>
          <em>{item.label}</em>
          <strong style={{ width: `${Math.max(8, (item.value / max) * 100)}%` }}>{formatNumber(item.value)}</strong>
        </span>
      ))}
    </div>
  );
}

function RecentTasksTable({ tasks }: { tasks: DashboardTask[] }) {
  return (
    <Card className="dashboard-panel dashboard-table-panel" title="最近活跃任务">
      <EnhancedTable<DashboardTask>
        rowKey="task_id"
        size="small"
        dataSource={tasks}
        pagination={false}
        enableColumnResize={false}
        scroll={{ x: 640, y: 218 }}
        locale={{ emptyText: '暂无任务' }}
        columns={[
          { title: '任务', dataIndex: 'title', ellipsis: true },
          { title: '状态', dataIndex: 'status', width: 112, render: (value: string) => <Tag color={statusColorMap[value] || 'default'}>{taskStatusLabels[value] || value}</Tag> },
          { title: '通过', dataIndex: 'approved', width: 72 },
          { title: '进度', dataIndex: 'progress_percent', width: 150, render: (value: number) => <Progress percent={value} size="small" /> },
          { title: '更新', dataIndex: 'updated_at', width: 120, render: formatDate },
        ]}
      />
    </Card>
  );
}

function RecentExportsTable({ exports }: { exports: DashboardExport[] }) {
  return (
    <Card className="dashboard-panel dashboard-table-panel" title="最近导出">
      <EnhancedTable<DashboardExport>
        rowKey="export_id"
        size="small"
        dataSource={exports}
        pagination={false}
        enableColumnResize={false}
        scroll={{ x: 620, y: 198 }}
        locale={{ emptyText: '暂无导出记录' }}
        columns={[
          { title: '文件', dataIndex: 'filename', ellipsis: true, render: (value: string, record) => value || `${record.format.toUpperCase()} 导出` },
          { title: '格式', dataIndex: 'format', width: 80, render: (value: string) => <Tag>{value.toUpperCase()}</Tag> },
          { title: '状态', dataIndex: 'status', width: 96, render: (value: string) => <Tag color={statusColorMap[value] || 'default'}>{asyncStatusLabels[value] || value}</Tag> },
          { title: '进度', dataIndex: 'progress', width: 118, render: (value: number) => <Progress percent={value} size="small" /> },
          { title: '更新', dataIndex: 'updated_at', width: 120, render: formatDate },
        ]}
      />
    </Card>
  );
}

function RecentAiJobsTable({ jobs }: { jobs: DashboardAiJob[] }) {
  return (
    <Card className="dashboard-panel dashboard-table-panel" title="最近 AI 预审">
      <EnhancedTable<DashboardAiJob>
        rowKey="job_id"
        size="small"
        dataSource={jobs}
        pagination={false}
        enableColumnResize={false}
        scroll={{ x: 560, y: 198 }}
        locale={{ emptyText: '暂无 AI 预审记录' }}
        columns={[
          {
            title: '预审任务',
            dataIndex: 'job_id',
            ellipsis: true,
            render: (_value: string, record) => (
              <span className="workspace-entity-reference">
                <Typography.Text>AI 预审</Typography.Text>
                <WorkspaceSecondaryCode label="编号" value={record.job_id} />
              </span>
            ),
          },
          { title: '状态', dataIndex: 'status', width: 96, render: (value: string) => <Tag color={statusColorMap[value] || 'default'}>{asyncStatusLabels[value] || value}</Tag> },
          {
            title: '关联提交',
            dataIndex: 'submission_id',
            ellipsis: true,
            render: (value: string) => <WorkspaceSecondaryCode label="提交编号" value={value} />,
          },
          { title: '更新', dataIndex: 'updated_at', width: 120, render: formatDate },
        ]}
      />
    </Card>
  );
}

function ReviewFocusPanel({ data }: { data: TeamDashboardPayload }) {
  const stats = [
    { label: '待审核', value: data.review.pending, status: 'warning' },
    { label: '已处理', value: data.review.completed, status: 'processing' },
    { label: '通过', value: data.review.approved, status: 'success' },
    { label: '打回', value: data.review.rejected, status: 'error' },
  ];
  return (
    <Card className="dashboard-panel" title="审核焦点">
      <div className="dashboard-focus-grid">
        {stats.map((item) => (
          <div key={item.label} className={`dashboard-focus-item dashboard-focus-item--${item.status}`}>
            <span>{item.label}</span>
            <strong>{formatNumber(item.value)}</strong>
          </div>
        ))}
      </div>
      <Typography.Text type="secondary">当前角色可见任务 {formatNumber(data.review.task_count || 0)} 个，可见提交 {formatNumber(data.review.total_visible || 0)} 条。</Typography.Text>
    </Card>
  );
}

function GovernancePanel({ data, shortcuts, onNavigate }: { data: TeamDashboardPayload; shortcuts: DashboardShortcut[]; onNavigate: (page: WorkspacePage) => void }) {
  return (
    <Card className="dashboard-panel dashboard-governance-panel" title="企业治理">
      <Space wrap className="dashboard-shortcuts">
        {shortcuts.map((item: DashboardShortcut) => (
          <Button key={item.key} type={item.kind === 'primary' ? 'primary' : 'default'} icon={shortcutIcon(item.target_page)} onClick={() => onNavigate(item.target_page as WorkspacePage)}>
            {item.label}
          </Button>
        ))}
      </Space>

      <div className="dashboard-mini-table">
        <Typography.Text strong><BellOutlined /> 最近通知</Typography.Text>
        <EnhancedTable<DashboardNotification>
          rowKey="notification_id"
          size="small"
          dataSource={data.governance.notifications}
          pagination={false}
          showHeader={false}
          enableColumnResize={false}
          scroll={{ x: 360, y: 126 }}
          locale={{ emptyText: '暂无通知' }}
          columns={[
            {
              title: '通知',
              dataIndex: 'title',
              ellipsis: true,
              render: (value: string, record) => (
                <Space size={6}>
                  <span>{value}</span>
                  <Tag color={record.priority === 'urgent' ? 'red' : record.priority === 'important' ? 'gold' : 'blue'}>{priorityLabels[record.priority] || record.notification_type}</Tag>
                </Space>
              ),
            },
            { title: '时间', dataIndex: 'created_at', width: 94, render: formatDate },
          ]}
        />
      </div>

      <div className="dashboard-mini-table">
        <Typography.Text strong>重要操作日志</Typography.Text>
        <EnhancedTable<DashboardAuditLog>
          rowKey="log_id"
          size="small"
          dataSource={data.governance.audit_logs}
          pagination={false}
          showHeader={false}
          enableColumnResize={false}
          scroll={{ x: 360, y: 126 }}
          locale={{ emptyText: '当前角色暂无可见审计日志' }}
          columns={[
            {
              title: '操作',
              dataIndex: 'summary',
              ellipsis: true,
              render: (value: string | null | undefined, record) => (
                <Space size={6}>
                  <span>{value || record.action}</span>
                  <Tag color={statusColorMap[record.risk_level || ''] || 'default'}>{priorityLabels[record.risk_level || 'normal'] || '普通'}</Tag>
                </Space>
              ),
            },
            { title: '时间', dataIndex: 'created_at', width: 94, render: formatDate },
          ]}
        />
      </div>
    </Card>
  );
}

function ResourceStatusPanel({ data }: { data: TeamDashboardPayload }) {
  return (
    <Card className="dashboard-panel" title="资源状态">
      <div className="dashboard-resource-wallet">
        <Statistic title="企业积分可用" value={data.resources.points_wallet.available_points} suffix="积分" />
        <Statistic title="AI 钱包余额" value={data.ai.wallet.balance_points} suffix="积分" />
      </div>
      <div className="dashboard-resource-meta">
        <span>预扣 <strong>{formatPoints(data.resources.points_wallet.reserved_points)}</strong></span>
        <span>花销 <strong>{formatPoints(data.resources.points_wallet.spent_points)}</strong></span>
        <span>Provider 可用 <strong>{data.ai.providers.enabled}/{data.ai.providers.total}</strong></span>
      </div>
    </Card>
  );
}


function shortcutIcon(page: string) {
  if (page === 'manual-review') return <AuditOutlined />;
  if (page === 'ai-review' || page === 'resource-config') return <ApiOutlined />;
  if (page === 'people-management') return <TeamOutlined />;
  if (page === 'announcements') return <BellOutlined />;
  if (page === 'datasets') return <DatabaseOutlined />;
  if (page === 'task-management' || page === 'export-center') return <FileDoneOutlined />;
  return <RocketOutlined />;
}

function formatDateTime(value?: string | null) {
  return formatApiShortDateTime(value);
}

function formatDate(value?: string | null) {
  return formatDateTime(value);
}

function parseApiDate(value: string) {
  return parseApiDateTime(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value || 0);
}

function formatPoints(value?: number | null) {
  return `${formatNumber(Number(value || 0))} 积分`;
}

function formatBytes(value: number) {
  if (!value) return '0 GB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1)} ${units[unitIndex]}`;
}

function limitLabel(key: keyof TeamDashboardPayload['resources']['membership']['usage']) {
  if (key === 'members') return '成员';
  if (key === 'active_tasks') return '活跃任务';
  return '存储';
}

function formatLimitValue(key: keyof TeamDashboardPayload['resources']['membership']['usage'], value: number) {
  return key === 'storage_bytes' ? formatBytes(value) : formatNumber(value);
}

function quotaStatus(percent: number) {
  if (percent >= 100) return 'error';
  if (percent >= 80) return 'warning';
  return 'normal';
}

function quotaColor(percent: number) {
  if (percent >= 100) return '#dc2626';
  if (percent >= 80) return '#d97706';
  return '#2563eb';
}
