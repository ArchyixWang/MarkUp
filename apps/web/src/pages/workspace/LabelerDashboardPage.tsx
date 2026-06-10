import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Progress, Space, Spin, Statistic, Tag, Tooltip, Typography } from 'antd';
import { Column, Pie } from '@ant-design/charts';
import { BellOutlined, CheckCircleOutlined, EditOutlined, FileDoneOutlined, HistoryOutlined, ReloadOutlined, SafetyCertificateOutlined, TrophyOutlined } from '@ant-design/icons';
import { ApiClientError } from '../../services/apiClient';
import { EnhancedTable } from '../../components/ui/EnhancedTable';
import { getAdminOverview, getPersonalLabelerDashboard, getTeamLabelerDashboard } from '../../services/workspaceService';
import type {
  ApiUser,
  LabelerContributionsPayload,
  LabelerDashboardLabeling,
  LabelerDashboardQuality,
  LabelerDashboardSummaryCard,
  LabelerDashboardTodoItem,
  LabelerTaskListPayload,
  PersonalLabelerDashboardPayload,
  TeamLabelerDashboardPayload,
} from '../../types/api';
import type { WorkspacePage } from './WorkspaceApp';
import { WorkspaceSecondaryCode } from './workspaceDisplay';
import { WorkspaceTableActions } from './WorkspaceTableActions';

type LabelerDashboardPayload = TeamLabelerDashboardPayload | PersonalLabelerDashboardPayload;
type LabelerTaskItem = LabelerTaskListPayload['items'][number];
type LabelerRecordItem = LabelerContributionsPayload['recent_items'][number];
type ChartDatum = { label: string; value: number };

const chartPalette = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#0891b2'];
const statusColors: Record<string, string> = {
  success: 'green',
  processing: 'blue',
  warning: 'gold',
  error: 'red',
  approved: 'green',
  submitted: 'blue',
  rejected: 'red',
  draft: 'default',
  claimed: 'gold',
  finished: 'green',
};
const submissionStatusLabels: Record<string, string> = {
  submitted: '待审核',
  approved: '已通过',
  rejected: '已打回',
  draft: '草稿',
  claimed: '待标注',
  finished: '已完成',
};
const testRuntime = import.meta.env.MODE === 'test';

export function LabelerDashboardPage({
  user,
  teamLabeler,
  onNavigate,
  onOpenLabelingTask,
}: {
  user: ApiUser;
  teamLabeler: boolean;
  onNavigate: (page: WorkspacePage) => void;
  onOpenLabelingTask: (taskId: string) => void;
}) {
  const [dashboard, setDashboard] = useState<LabelerDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (teamLabeler) {
        const overview = await getAdminOverview();
        const overviewTeams = Array.isArray(overview.teams) ? overview.teams : [];
        const teamId = overview.default_team_id ?? overviewTeams[0]?.team_id ?? user.default_team_id ?? user.team_id;
        if (!teamId) {
          setDashboard(null);
          setError('请先加入企业项目后查看工作台。');
          return;
        }
        setDashboard(normalizeLabelerDashboard(await getTeamLabelerDashboard(teamId)));
        return;
      }
      setDashboard(normalizeLabelerDashboard(await getPersonalLabelerDashboard()));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '标注看板加载失败');
    } finally {
      setLoading(false);
    }
  }, [teamLabeler, user.default_team_id, user.team_id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  const recentTasks = dashboard?.recent_tasks ?? [];
  const primaryTask = recentTasks.find((item) => item.progress.remaining > 0 || item.needs_revision) ?? recentTasks[0];
  const isTeamDashboard = dashboard?.viewer_role === 'team_labeler';
  const title = isTeamDashboard ? '企业项目工作台' : '个人标注工作台';
  const subtitle = dashboard
    ? isTeamDashboard
      ? `${dashboard.team.company_name} · ${dashboard.profile.display_name} · ${formatDateTime(dashboard.generated_at)}`
      : `${dashboard.profile.display_name || user.display_name || user.username} · ${formatDateTime(dashboard.generated_at)}`
    : teamLabeler
      ? '正在读取你的公司项目、提交质量和企业通知。'
      : '正在读取你的标注任务、收益、资质和信誉分。';

  return (
    <main className="workspace-content workspace-dashboard-page labeler-dashboard-page workspace-fixed-page">
      <section className="page-heading dashboard-heading">
        <div>
          <p className="section-kicker">DASHBOARD</p>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <Space wrap>
          {dashboard ? <Tag color={isTeamDashboard ? 'blue' : 'green'}>{isTeamDashboard ? '企业内 Labeler' : '个人 Labeler'}</Tag> : null}
          <Tooltip title="刷新标注看板">
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadDashboard()}>
              刷新
            </Button>
          </Tooltip>
          <Button
            type="primary"
            icon={<EditOutlined />}
            disabled={!primaryTask}
            onClick={() => primaryTask ? onOpenLabelingTask(primaryTask.task.task_id) : onNavigate('labeler-tasks')}
          >
            {isTeamDashboard ? '继续公司项目' : '继续标注'}
          </Button>
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
            <div className="dashboard-cockpit labeler-dashboard-cockpit">
              <LabelerKpiStrip data={dashboard} />

              <section className="dashboard-chart-grid labeler-dashboard-chart-grid" aria-label="标注图表">
                <div className="dashboard-chart-primary">
                  <LabelingProgressChart data={dashboard.labeling} />
                </div>
                <div className="dashboard-chart-secondary">
                  <SubmissionStatusChart data={dashboard.labeling.submission_distribution} />
                  <QualityPanel data={dashboard} />
                </div>
              </section>

              <section className="dashboard-main-grid" aria-label="标注看板详情">
                <div className="dashboard-left-column">
                  <LabelerTasksTable tasks={dashboard.recent_tasks} onOpenLabelingTask={onOpenLabelingTask} title={isTeamDashboard ? '我的公司项目' : '我的任务'} />
                  <LabelerRecordsTable records={dashboard.recent_records} />
                </div>
                <div className="dashboard-right-column">
                  <LabelerTodoPanel data={dashboard} onNavigate={onNavigate} />
                  {isTeamDashboard ? <TeamLabelerNoticePanel data={dashboard} /> : <PersonalGrowthPanel data={dashboard} />}
                </div>
              </section>
            </div>
          ) : loading ? null : (
            <Card className="dashboard-empty-card">
              <Empty description="暂无可展示的标注看板数据" />
            </Card>
          )}
        </Spin>
      </div>
    </main>
  );
}

function LabelerKpiStrip({ data }: { data: LabelerDashboardPayload }) {
  const icons = [<FileDoneOutlined />, <EditOutlined />, <HistoryOutlined />, <CheckCircleOutlined />, <TrophyOutlined />, <SafetyCertificateOutlined />];
  return (
    <section className="dashboard-kpi-strip" aria-label="标注指标">
      {data.summary_cards.map((item, index) => (
        <div key={item.key} className={`dashboard-kpi-item dashboard-kpi-item--${item.status}`}>
          <span className="dashboard-kpi-icon">{icons[index] ?? <FileDoneOutlined />}</span>
          <Statistic title={item.label} value={item.value} />
          {item.hint ? <Typography.Text type="secondary">{item.hint}</Typography.Text> : null}
        </div>
      ))}
    </section>
  );
}

function LabelingProgressChart({ data }: { data: LabelerDashboardPayload['labeling'] }) {
  const chartData = data.status_distribution.length ? data.status_distribution : [
    { label: '待处理', value: data.pending_questions },
    { label: '已提交', value: data.submitted_questions },
    { label: '已通过', value: data.approved_questions },
    { label: '待修改', value: data.rejected_questions },
  ].filter((item) => item.value > 0);

  return (
    <DashboardChart title="任务进度分布" subtitle={`完成率 ${data.completion_percent}%`} data={chartData}>
      <Column
        data={chartData}
        xField="label"
        yField="value"
        colorField="label"
        height={160}
        autoFit
        legend={false}
        scale={{ color: { range: chartPalette } }}
        label={{ text: 'value', position: 'top' }}
        padding={[18, 8, 30, 8]}
        axis={{ x: { labelAutoRotate: false, tick: false }, y: false }}
      />
    </DashboardChart>
  );
}

function SubmissionStatusChart({ data }: { data: ChartDatum[] }) {
  return (
    <DashboardChart title="提交状态分布" data={data} compact>
      <Pie
        data={data}
        angleField="value"
        colorField="label"
        height={150}
        autoFit
        innerRadius={0.58}
        scale={{ color: { range: chartPalette } }}
        label={{ text: 'value', position: 'outside' }}
        legend={{ color: { position: 'bottom' } }}
      />
    </DashboardChart>
  );
}

function QualityPanel({ data }: { data: LabelerDashboardPayload }) {
  return (
    <Card className="dashboard-panel dashboard-quota-panel" title="质量状态">
      <div className="dashboard-quota-grid labeler-quality-grid">
        {[
          { key: 'approval', label: '通过率', value: data.quality.approval_rate, color: '#16a34a' },
          { key: 'rework', label: '返工率', value: data.quality.rework_rate, color: '#d97706' },
          { key: 'complete', label: '完成率', value: data.labeling.completion_percent, color: '#2563eb' },
        ].map((item) => (
          <div key={item.key} className="dashboard-quota-item">
            <div className="dashboard-quota-head">
              <span>{item.label}</span>
              <strong>{item.value}%</strong>
            </div>
            <Progress percent={item.value} size="small" showInfo={false} strokeColor={item.color} />
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
      {data.map((item) => (
        <span key={item.label}>
          <em>{item.label}</em>
          <strong style={{ width: `${Math.max(8, (item.value / max) * 100)}%` }}>{formatNumber(item.value)}</strong>
        </span>
      ))}
    </div>
  );
}

function LabelerTasksTable({ tasks, title, onOpenLabelingTask }: { tasks: LabelerTaskItem[]; title: string; onOpenLabelingTask: (taskId: string) => void }) {
  return (
    <Card className="dashboard-panel dashboard-table-panel" title={title}>
      <EnhancedTable<LabelerTaskItem>
        rowKey={(record) => record.task.task_id}
        size="small"
        dataSource={tasks}
        pagination={false}
        enableColumnResize={false}
        scroll={{ x: 640, y: 218 }}
        locale={{ emptyText: '暂无任务' }}
        columns={[
          { title: '任务', dataIndex: ['task', 'title'], ellipsis: true },
          { title: '进度', dataIndex: 'progress', width: 150, render: (value: LabelerTaskItem['progress']) => <Progress percent={value.percent} size="small" /> },
          { title: '待处理', dataIndex: ['progress', 'remaining'], width: 82 },
          { title: '状态', dataIndex: 'needs_revision', width: 96, render: (_value: boolean, record) => record.needs_revision ? <Tag color="red">待修改</Tag> : record.task_submitted ? <Tag color="blue">待审核</Tag> : <Tag color="gold">进行中</Tag> },
          { title: '更新', dataIndex: 'last_updated_at', width: 116, render: formatDate },
          {
            title: '操作',
            key: 'actions',
            width: 92,
            fixed: 'right',
            className: 'workspace-table-action-cell',
            render: (_value, record) => (
              <WorkspaceTableActions
                visible={[{
                  key: 'continue',
                  label: '继续',
                  icon: <EditOutlined />,
                  onClick: () => onOpenLabelingTask(record.task.task_id),
                }]}
              />
            ),
          },
        ]}
      />
    </Card>
  );
}

function LabelerRecordsTable({ records }: { records: LabelerRecordItem[] }) {
  return (
    <Card className="dashboard-panel dashboard-table-panel" title="最近提交记录">
      <EnhancedTable<LabelerRecordItem>
        rowKey="submission_id"
        size="small"
        dataSource={records}
        pagination={false}
        enableColumnResize={false}
        scroll={{ x: 620, y: 198 }}
        locale={{ emptyText: '暂无提交记录' }}
        columns={[
          { title: '任务', dataIndex: 'task_title', ellipsis: true },
          { title: '记录', dataIndex: 'submission_id', width: 118, render: (value: string) => <WorkspaceSecondaryCode label="编号" value={value} /> },
          { title: '状态', dataIndex: 'status', width: 96, render: (value: string) => <Tag color={statusColors[value] || 'default'}>{submissionStatusLabels[value] || value}</Tag> },
          { title: '题目', dataIndex: 'row_index', width: 74, render: (value?: number | null) => value ? `第 ${value} 题` : '-' },
          { title: '更新', dataIndex: 'updated_at', width: 116, render: formatDate },
        ]}
      />
    </Card>
  );
}

function LabelerTodoPanel({ data, onNavigate }: { data: LabelerDashboardPayload; onNavigate: (page: WorkspacePage) => void }) {
  return (
    <Card className="dashboard-panel dashboard-governance-panel" title="当前待办">
      <Space wrap className="dashboard-shortcuts">
        {data.shortcuts.map((item) => (
          <Button
            key={item.key}
            type={item.kind === 'primary' ? 'primary' : 'default'}
            icon={shortcutIcon(item.target_page)}
            onClick={() => {
              if (item.target_url) {
                window.location.assign(item.target_url);
              } else if (item.target_page) {
                onNavigate(item.target_page as WorkspacePage);
              }
            }}
          >
            {item.label}
          </Button>
        ))}
      </Space>
      <div className="labeler-dashboard-todos">
        {data.todo_items.length ? data.todo_items.map((item) => (
          <button key={item.key} type="button" className={`labeler-dashboard-todo labeler-dashboard-todo--${item.type}`} onClick={() => item.target_page ? onNavigate(item.target_page as WorkspacePage) : undefined}>
            <span>{item.title}</span>
            <strong>{item.count}</strong>
          </button>
        )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待办" />}
      </div>
    </Card>
  );
}

function TeamLabelerNoticePanel({ data }: { data: TeamLabelerDashboardPayload }) {
  return (
    <Card className="dashboard-panel dashboard-table-panel" title="企业通知">
      <EnhancedTable<TeamLabelerDashboardPayload['notifications'][number]>
        rowKey="notification_id"
        size="small"
        dataSource={data.notifications}
        pagination={false}
        showHeader={false}
        enableColumnResize={false}
        scroll={{ x: 360, y: 198 }}
        locale={{ emptyText: '暂无企业通知' }}
        columns={[
          {
            title: '通知',
            dataIndex: 'title',
            ellipsis: true,
            render: (value: string, record) => (
              <Space size={6}>
                <BellOutlined />
                <span>{value}</span>
                <Tag color={record.priority === 'urgent' ? 'red' : record.priority === 'important' ? 'gold' : 'blue'}>{record.priority || '普通'}</Tag>
              </Space>
            ),
          },
          { title: '时间', dataIndex: 'created_at', width: 94, render: formatDate },
        ]}
      />
    </Card>
  );
}

function PersonalGrowthPanel({ data }: { data: PersonalLabelerDashboardPayload }) {
  return (
    <Card className="dashboard-panel dashboard-table-panel" title="成长与收益">
      <div className="dashboard-resource-wallet labeler-growth-wallet">
        <Statistic title="可用积分" value={data.points.wallet.available_points} suffix="积分" />
        <Statistic title="信誉分" value={data.profile.reputation_score ?? 100} suffix="分" />
      </div>
      <div className="dashboard-mini-table">
        <Typography.Text strong>推荐任务</Typography.Text>
        <EnhancedTable<PersonalLabelerDashboardPayload['recommended_tasks'][number]>
          rowKey="task_id"
          size="small"
          dataSource={data.recommended_tasks}
          pagination={false}
          showHeader={false}
          enableColumnResize={false}
          scroll={{ x: 360, y: 126 }}
          locale={{ emptyText: '暂无推荐任务' }}
          columns={[
            { title: '任务', dataIndex: 'title', ellipsis: true },
            { title: '奖励', dataIndex: 'unit_points', width: 84, render: (value: number) => `${value} 分/题` },
          ]}
        />
      </div>
    </Card>
  );
}

function shortcutIcon(page?: string) {
  if (page === 'account-points') return <TrophyOutlined />;
  if (page === 'account-certifications') return <SafetyCertificateOutlined />;
  if (page === 'labeler-questions') return <HistoryOutlined />;
  return <EditOutlined />;
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = parseApiDate(value);
  if (!date) return '-';
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDate(value?: string | null) {
  return formatDateTime(value);
}

function parseApiDate(value: string) {
  const normalized = /Z$|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatNumber(value: number | string) {
  return Number(value || 0).toLocaleString('zh-CN');
}

function normalizeLabelerDashboard(payload: LabelerDashboardPayload): LabelerDashboardPayload {
  return payload.viewer_role === 'team_labeler'
    ? normalizeTeamLabelerDashboard(payload)
    : normalizePersonalLabelerDashboard(payload);
}

function normalizeTeamLabelerDashboard(payload: TeamLabelerDashboardPayload): TeamLabelerDashboardPayload {
  return {
    ...payload,
    team: {
      team_id: payload.team?.team_id ?? '',
      company_name: payload.team?.company_name ?? '企业项目',
      status: payload.team?.status ?? null,
      verification_status: payload.team?.verification_status ?? null,
    },
    profile: {
      user_id: payload.profile?.user_id ?? '',
      username: payload.profile?.username ?? '',
      display_name: payload.profile?.display_name ?? payload.profile?.username ?? '',
      avatar: payload.profile?.avatar ?? null,
      email: payload.profile?.email ?? null,
      basic_info_status: payload.profile?.basic_info_status ?? null,
      reputation_score: payload.profile?.reputation_score ?? 100,
      labeler_account: payload.profile?.labeler_account,
    },
    summary_cards: normalizeSummaryCards(payload.summary_cards),
    todo_items: normalizeTodoItems(payload.todo_items),
    labeling: normalizeLabeling(payload.labeling),
    quality: normalizeQuality(payload.quality),
    recent_tasks: normalizeTaskItems(payload.recent_tasks),
    recent_records: normalizeArray(payload.recent_records),
    notifications: normalizeArray(payload.notifications),
    shortcuts: normalizeArray(payload.shortcuts),
    generated_at: payload.generated_at ?? '',
  };
}

function normalizePersonalLabelerDashboard(payload: PersonalLabelerDashboardPayload): PersonalLabelerDashboardPayload {
  const profile = {
    user_id: payload.profile?.user_id ?? '',
    username: payload.profile?.username ?? '',
    display_name: payload.profile?.display_name ?? payload.profile?.username ?? '',
    avatar: payload.profile?.avatar ?? null,
    email: payload.profile?.email ?? null,
    basic_info_status: payload.profile?.basic_info_status ?? null,
    reputation_score: payload.profile?.reputation_score ?? 100,
    labeler_account: payload.profile?.labeler_account,
  };
  return {
    ...payload,
    profile,
    summary_cards: normalizeSummaryCards(payload.summary_cards),
    todo_items: normalizeTodoItems(payload.todo_items),
    labeling: normalizeLabeling(payload.labeling),
    quality: normalizeQuality(payload.quality),
    points: {
      wallet: {
        total_points: payload.points?.wallet?.total_points ?? 0,
        available_points: payload.points?.wallet?.available_points ?? 0,
        level: payload.points?.wallet?.level ?? 'bronze',
        updated_at: payload.points?.wallet?.updated_at ?? null,
      },
      overview: payload.points?.overview,
      recent_items: normalizeArray(payload.points?.recent_items),
    },
    certifications: {
      summary: payload.certifications?.summary,
      items: normalizeArray(payload.certifications?.items),
    },
    recent_tasks: normalizeTaskItems(payload.recent_tasks),
    recent_records: normalizeArray(payload.recent_records),
    recommended_tasks: normalizeArray(payload.recommended_tasks),
    shortcuts: normalizeArray(payload.shortcuts),
    generated_at: payload.generated_at ?? '',
  };
}

function normalizeLabeling(value?: Partial<LabelerDashboardLabeling> | null): LabelerDashboardLabeling {
  return {
    total_tasks: numberOrZero(value?.total_tasks),
    active_tasks: numberOrZero(value?.active_tasks),
    total_questions: numberOrZero(value?.total_questions),
    pending_questions: numberOrZero(value?.pending_questions),
    submitted_questions: numberOrZero(value?.submitted_questions),
    approved_questions: numberOrZero(value?.approved_questions),
    rejected_questions: numberOrZero(value?.rejected_questions),
    completion_percent: clampPercent(value?.completion_percent),
    status_distribution: normalizeArray(value?.status_distribution),
    submission_distribution: normalizeArray(value?.submission_distribution),
  };
}

function normalizeQuality(value?: Partial<LabelerDashboardQuality> | null): LabelerDashboardQuality {
  return {
    approval_rate: clampPercent(value?.approval_rate),
    rework_rate: clampPercent(value?.rework_rate),
    pending_review: numberOrZero(value?.pending_review),
    reviewed: numberOrZero(value?.reviewed),
    accuracy_rate: clampPercent(value?.accuracy_rate),
  };
}

function normalizeSummaryCards(value?: LabelerDashboardSummaryCard[] | null): LabelerDashboardSummaryCard[] {
  return normalizeArray(value);
}

function normalizeTodoItems(value?: LabelerDashboardTodoItem[] | null): LabelerDashboardTodoItem[] {
  return normalizeArray(value);
}

function normalizeTaskItems(value?: LabelerTaskItem[] | null): LabelerTaskItem[] {
  return normalizeArray(value)
    .filter((item) => item?.task?.task_id)
    .map((item) => ({
      ...item,
      progress: {
        total: numberOrZero(item.progress?.total),
        submitted: numberOrZero(item.progress?.submitted),
        rejected: numberOrZero(item.progress?.rejected),
        abandoned: numberOrZero(item.progress?.abandoned),
        remaining: numberOrZero(item.progress?.remaining),
        percent: clampPercent(item.progress?.percent),
        abandon_limit: item.progress?.abandon_limit,
        abandon_used: item.progress?.abandon_used,
        abandon_remaining: item.progress?.abandon_remaining,
      },
    }));
}

function normalizeArray<T>(value?: T[] | null): T[] {
  return Array.isArray(value) ? value : [];
}

function numberOrZero(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function clampPercent(value: unknown): number {
  return Math.min(100, Math.max(0, numberOrZero(value)));
}
