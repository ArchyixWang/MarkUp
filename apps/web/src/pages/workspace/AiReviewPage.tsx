import type { Key } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Descriptions, Drawer, Empty, Input, Pagination, Progress, Segmented, Select, Space, Spin, Statistic, Switch, Tag, Tooltip, Typography, message } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { AppstoreOutlined, ArrowLeftOutlined, EyeOutlined, FileSearchOutlined, ReloadOutlined, RetweetOutlined, TableOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { EnhancedTable } from '../../components/ui/EnhancedTable';
import { ApiClientError } from '../../services/apiClient';
import { batchTriggerAiReview, getAiReviewJob, getAiReviewTaskOverviews, getAiReviewTaskSubmissions, retryAiReviewJob, triggerAiReview } from '../../services/aiReviewService';
import { getAdminOverview } from '../../services/workspaceService';
import type { AiReviewJobPayload, AiReviewTaskOverviewPayload, AiReviewTaskOverviewResponse, AiReviewTaskSubmissionPayload, AiReviewTaskSubmissionsResponse } from '../../types/api';
import { apiDateTimeValue, formatApiShortDateTime } from '../../utils/dateTime';
import { WorkspaceTableActions } from './WorkspaceTableActions';
import { WorkspaceSecondaryCode, WorkspaceTechnicalInfo, formatShortId } from './workspaceDisplay';

type AiReviewViewMode = 'table' | 'card';
type AiReviewOverviewQuery = {
  page?: number;
  pageSize?: number;
  keyword?: string;
  taskStatus?: string;
  aiStatus?: string;
  providerId?: string;
  onlyAnomalies?: boolean;
};

type AiReviewDetailQuery = {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
  suggestion?: string;
};

const emptyOverview: AiReviewTaskOverviewResponse = {
  items: [],
  summary: {
    task_total: 0,
    ai_enabled: 0,
    job_total: 0,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    manual: 0,
    status_counts: {},
    suggestion_counts: {},
    concurrency: { limit: 3, processing: 0, available: 3, queued: 0 },
  },
  pagination: { page: 1, page_size: 20, total: 0, total_pages: 1 },
};

const emptyTaskDetail: AiReviewTaskSubmissionsResponse = {
  task: {
    task_id: '',
    team_id: '',
    title: '',
    status: '',
    owner_id: '',
    ai_enabled: false,
    total_questions: 0,
    submission_total: 0,
    submitted_count: 0,
    job_total: 0,
    coverage_rate: 0,
    status_counts: {},
    suggestion_counts: {},
    pending_count: 0,
    processing_count: 0,
    completed_count: 0,
    failed_count: 0,
    manual_count: 0,
  },
  items: [],
  summary: { submission_total: 0, job_total: 0, status_counts: {}, suggestion_counts: {} },
  pagination: { page: 1, page_size: 20, total: 0, total_pages: 1 },
};

const statusOptions = ['pending', 'processing', 'completed', 'failed'] as const;
const taskStatusOptions = ['published'] as const;
const suggestionOptions = ['pass', 'reject', 'manual'] as const;

const statusLabels: Record<string, string> = {
  not_created: '未入队',
  pending: '待处理',
  processing: '处理中',
  completed: '已完成',
  failed: '失败',
};

const statusColors: Record<string, string> = {
  not_created: 'default',
  pending: 'blue',
  processing: 'processing',
  completed: 'success',
  failed: 'error',
};

const taskStatusLabels: Record<string, string> = {
  draft: '草稿',
  pending_review: '待审核',
  published: '收集中',
  paused: '已暂停',
  finished: '已结束',
};

const suggestionLabels: Record<string, { label: string; color: string }> = {
  pass: { label: '建议通过', color: 'success' },
  reject: { label: '建议打回', color: 'error' },
  manual: { label: '人工复核', color: 'warning' },
};

function isBatchTriggerableSubmission(item: AiReviewTaskSubmissionPayload) {
  return item.ai_status === 'not_created' || (item.ai_status === 'failed' && Boolean(item.ai_job?.job_id));
}

export function AiReviewPage({ onOpenTask }: { onOpenTask?: (taskId: string) => void }) {
  const [messageApi, contextHolder] = message.useMessage();
  const [teamId, setTeamId] = useState<string | undefined>();
  const [data, setData] = useState<AiReviewTaskOverviewResponse>(emptyOverview);
  const [viewMode, setViewMode] = useState<AiReviewViewMode>('table');
  const [keyword, setKeyword] = useState('');
  const [taskStatus, setTaskStatus] = useState<string | undefined>();
  const [aiStatus, setAiStatus] = useState<string | undefined>();
  const [providerId, setProviderId] = useState('');
  const [onlyAnomalies, setOnlyAnomalies] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async (nextTeamId = teamId, overrides: AiReviewOverviewQuery = {}) => {
    setLoading(true);
    setError(null);
    const nextPage = overrides.page ?? page;
    const nextPageSize = overrides.pageSize ?? pageSize;
    const nextKeyword = overrides.keyword ?? keyword;
    const nextTaskStatus = Object.prototype.hasOwnProperty.call(overrides, 'taskStatus') ? overrides.taskStatus : taskStatus;
    const nextAiStatus = Object.prototype.hasOwnProperty.call(overrides, 'aiStatus') ? overrides.aiStatus : aiStatus;
    const nextProviderId = overrides.providerId ?? providerId;
    const nextOnlyAnomalies = overrides.onlyAnomalies ?? onlyAnomalies;
    try {
      const result = await getAiReviewTaskOverviews(nextTeamId, {
        keyword: nextKeyword.trim() || undefined,
        task_status: nextTaskStatus,
        ai_status: nextAiStatus,
        provider_id: nextProviderId.trim() || undefined,
        only_anomalies: nextOnlyAnomalies,
        page: nextPage,
        page_size: nextPageSize,
      });
      setData(result);
      setPage(result.pagination.page);
      setPageSize(result.pagination.page_size);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'AI 预审任务加载失败');
    } finally {
      setLoading(false);
    }
  }, [aiStatus, keyword, onlyAnomalies, page, pageSize, providerId, taskStatus, teamId]);

  useEffect(() => {
    let ignore = false;
    async function bootstrap() {
      setBootstrapping(true);
      setError(null);
      try {
        const overview = await getAdminOverview();
        const nextTeamId = overview.default_team_id || overview.teams[0]?.team_id;
        if (ignore) return;
        if (!nextTeamId) {
          setTeamId(undefined);
          setData(emptyOverview);
          setError('AI 预审需要企业作用域；当前账号没有可用企业。');
          return;
        }
        setTeamId(nextTeamId);
        const result = await getAiReviewTaskOverviews(nextTeamId, { page: 1, page_size: pageSize });
        if (!ignore) setData(result);
      } catch (err) {
        if (!ignore) {
          setData(emptyOverview);
          setError(err instanceof ApiClientError ? err.message : '企业信息加载失败');
        }
      } finally {
        if (!ignore) setBootstrapping(false);
      }
    }
    void bootstrap();
    return () => {
      ignore = true;
    };
  }, [pageSize]);

  const summaryItems = useMemo(() => [
    { key: 'task_total', label: '任务数', value: data.summary.task_total, tone: 'normal' },
    { key: 'ai_enabled', label: '已开启 AI', value: data.summary.ai_enabled, tone: 'normal' },
    { key: 'pending', label: '待处理', value: data.summary.pending, tone: data.summary.pending > 0 ? 'processing' : 'normal' },
    { key: 'processing', label: '处理中', value: data.summary.processing, tone: data.summary.processing > 0 ? 'processing' : 'normal' },
    { key: 'failed', label: '失败', value: data.summary.failed, tone: data.summary.failed > 0 ? 'danger' : 'normal' },
    { key: 'manual', label: '人工复核', value: data.summary.manual, tone: data.summary.manual > 0 ? 'warning' : 'normal' },
    {
      key: 'concurrency',
      label: '并发上限',
      value: data.summary.concurrency?.limit ?? 3,
      hint: `处理中 ${data.summary.concurrency?.processing ?? data.summary.processing} · 排队 ${data.summary.concurrency?.queued ?? data.summary.pending}`,
      tone: 'normal',
    },
  ], [data.summary]);

  const columns = useMemo<ColumnsType<AiReviewTaskOverviewPayload>>(() => [
    {
      title: '任务',
      dataIndex: 'title',
      key: 'title',
      width: 280,
      ellipsis: true,
      render: (_, item) => (
        <div className="ai-review-task-title">
          <Typography.Text strong ellipsis>{item.title || '未命名任务'}</Typography.Text>
          <WorkspaceSecondaryCode label="任务编号" value={item.task_id} />
        </div>
      ),
    },
    {
      title: '任务状态',
      dataIndex: 'status',
      key: 'status',
      width: 104,
      render: (value: string) => <Tag>{taskStatusLabels[value] || value}</Tag>,
    },
    {
      title: 'AI 配置',
      key: 'ai_config',
      width: 170,
      render: (_, item) => (
        <Space size={4} wrap>
          <Tag color={item.ai_enabled ? 'blue' : 'default'}>{item.ai_enabled ? '已开启' : '未开启'}</Tag>
          {item.provider_name ? <Tag>{item.provider_name}</Tag> : null}
        </Space>
      ),
    },
    {
      title: '覆盖率',
      key: 'coverage',
      width: 150,
      render: (_, item) => (
        <div className="ai-review-coverage">
          <Progress percent={Math.round((item.coverage_rate || 0) * 100)} size="small" />
          <small>{item.job_total}/{item.submitted_count || 0} 已入队</small>
        </div>
      ),
    },
    {
      title: '状态分布',
      key: 'status_counts',
      width: 240,
      render: (_, item) => <AiReviewStatusInline counts={item.status_counts} />,
    },
    {
      title: '建议',
      key: 'suggestions',
      width: 210,
      render: (_, item) => <AiReviewSuggestionInline counts={item.suggestion_counts} />,
    },
    {
      title: '更新时间',
      dataIndex: 'last_activity_at',
      key: 'last_activity_at',
      width: 136,
      sorter: (a, b) => getTimeValue(a.last_activity_at) - getTimeValue(b.last_activity_at),
      render: (value: string | null | undefined) => formatDateTime(value),
    },
    {
      title: '操作',
      key: 'actions',
      width: 92,
      fixed: 'right',
      className: 'workspace-table-action-cell',
      render: (_, item) => (
        <WorkspaceTableActions
          visible={[{ key: 'detail', label: '查看预审明细', icon: <EyeOutlined />, onClick: () => onOpenTask?.(item.task_id) }]}
        />
      ),
    },
  ], [onOpenTask]);

  const handleTableChange = (pagination: TablePaginationConfig) => {
    const nextPage = pagination.current ?? 1;
    const nextPageSize = pagination.pageSize ?? pageSize;
    setPage(nextPage);
    setPageSize(nextPageSize);
    void loadOverview(teamId, { page: nextPage, pageSize: nextPageSize });
  };

  return (
    <main className="workspace-content ai-review-page workspace-fixed-page">
      {contextHolder}
      <section className="page-heading">
        <div>
          <p className="section-kicker">AI Review</p>
          <h1>AI预审</h1>
        </div>
        <Space className="page-heading-actions">
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadOverview(teamId)}>
            刷新
          </Button>
        </Space>
      </section>

      <section className="ai-review-summary-strip" aria-label="AI 预审摘要">
        {summaryItems.map((item) => (
          <button
            className={`ai-review-summary-cell is-${item.tone}`}
            key={item.key}
            type="button"
            onClick={() => {
              const nextStatus = statusOptions.includes(item.key as typeof statusOptions[number]) ? item.key : undefined;
              setAiStatus(nextStatus);
              setPage(1);
              void loadOverview(teamId, { page: 1, aiStatus: nextStatus });
            }}
          >
            <Statistic title={item.label} value={item.value} />
            {'hint' in item && item.hint ? <small>{item.hint}</small> : null}
          </button>
        ))}
      </section>

      <section className="ai-review-console">
        {error && (
          <Alert
            action={<Button size="small" onClick={() => void loadOverview(teamId)}>重试</Button>}
            className="ai-review-error"
            message={error}
            showIcon
            type="error"
          />
        )}
        <div className="ai-review-control-bar">
          <Space size={8} className="ai-review-filter-group">
            <Input.Search
              allowClear
              className="ai-review-keyword-filter"
              placeholder="搜索任务名称"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onSearch={(value) => { setPage(1); void loadOverview(teamId, { page: 1, keyword: value }); }}
            />
            <Select
              allowClear
              className="ai-review-status-filter"
              placeholder="任务状态"
              value={taskStatus}
              onChange={(nextStatus) => { setTaskStatus(nextStatus); setPage(1); void loadOverview(teamId, { page: 1, taskStatus: nextStatus }); }}
              options={taskStatusOptions.map((value) => ({ value, label: taskStatusLabels[value] }))}
            />
            <Select
              allowClear
              className="ai-review-status-filter"
              placeholder="AI 状态"
              value={aiStatus}
              onChange={(nextStatus) => { setAiStatus(nextStatus); setPage(1); void loadOverview(teamId, { page: 1, aiStatus: nextStatus }); }}
              options={statusOptions.map((value) => ({ value, label: statusLabels[value] }))}
            />
            <Input
              allowClear
              className="ai-review-provider-filter"
              placeholder="Provider 名称或模型"
              value={providerId}
              onChange={(event) => setProviderId(event.target.value)}
              onPressEnter={() => { setPage(1); void loadOverview(teamId, { page: 1, providerId }); }}
            />
            <Space size={4} className="ai-review-switch-filter">
              <Switch size="small" checked={onlyAnomalies} onChange={(checked) => { setOnlyAnomalies(checked); setPage(1); void loadOverview(teamId, { page: 1, onlyAnomalies: checked }); }} />
              <span>只看异常</span>
            </Space>
          </Space>
          <Segmented<AiReviewViewMode>
            aria-label="AI 预审展示方式"
            value={viewMode}
            onChange={setViewMode}
            options={[
              { label: '表格', value: 'table', icon: <TableOutlined /> },
              { label: '卡片', value: 'card', icon: <AppstoreOutlined /> },
            ]}
          />
        </div>

        {bootstrapping ? (
          <div className="ai-review-loading">
            <Spin description="正在加载 AI 预审任务" />
          </div>
        ) : viewMode === 'table' ? (
          <div className="ai-review-table-shell workspace-fixed-table-panel">
            <EnhancedTable<AiReviewTaskOverviewPayload>
              className="workspace-fixed-table ai-review-table"
              columns={columns}
              dataSource={data.items}
              enableColumnResize={false}
              loading={loading}
              locale={{ emptyText: <Empty description="暂无 AI 预审任务" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              pagination={{
                current: page,
                pageSize,
                total: data.pagination.total,
                showQuickJumper: true,
                showSizeChanger: true,
                placement: ['bottomEnd'],
                showTotal: (total) => `共 ${total} 个任务`,
              }}
              rowKey="task_id"
              scroll={{ y: 'var(--workspace-table-body-height)' }}
              onChange={handleTableChange}
              onRow={(record) => ({
                onDoubleClick: () => onOpenTask?.(record.task_id),
              })}
            />
          </div>
        ) : (
          <section className="production-card-shell ai-review-card-shell workspace-fixed-table-panel" aria-label="AI 预审任务卡片列表">
            <div className="production-card-scroll">
              {data.items.length ? (
                <div className="production-card-grid ai-review-card-grid">
                  {data.items.map((item) => (
                    <Card className="production-card ai-review-task-card" key={item.task_id} role="button" tabIndex={0} onClick={() => onOpenTask?.(item.task_id)}>
                      <div className="production-card-topline">
                        <div className="production-card-badges">
                          <Tag color={item.ai_enabled ? 'blue' : 'default'}>{item.ai_enabled ? '已开启 AI' : '未开启 AI'}</Tag>
                          <Tag>{taskStatusLabels[item.status] || item.status}</Tag>
                        </div>
                        <span className="production-card-status">{formatDateTime(item.last_activity_at)}</span>
                      </div>
                      <div className="production-card-body">
                        <h3>{item.title}</h3>
                        <p>{item.description || `任务编号 ${formatShortId(item.task_id)}`}</p>
                      </div>
                      <div className="production-card-metrics" aria-label="任务 AI 预审指标">
                        <span><strong>{item.submitted_count}</strong><small>提交</small></span>
                        <span><strong>{item.job_total}</strong><small>入队</small></span>
                        <span><strong>{item.failed_count}</strong><small>失败</small></span>
                      </div>
                      <Progress percent={Math.round((item.coverage_rate || 0) * 100)} size="small" />
                      <div className="production-card-tags">
                        <AiReviewStatusInline counts={item.status_counts} />
                      </div>
                      <div className="production-card-actions">
                        <Button type="primary" size="small" onClick={(event) => { event.stopPropagation(); onOpenTask?.(item.task_id); }}>查看预审明细</Button>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <Empty className="production-card-empty" description="暂无 AI 预审任务" />
              )}
            </div>
            <div className="production-card-pagination">
              <Pagination
                current={page}
                pageSize={pageSize}
                total={data.pagination.total}
                showQuickJumper
                showSizeChanger
                onChange={(nextPage, nextPageSize) => {
                  setPage(nextPage);
                  setPageSize(nextPageSize);
                  void loadOverview(teamId, { page: nextPage, pageSize: nextPageSize });
                }}
              />
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

export function AiReviewTaskDetailPage({ taskId, onBack }: { taskId?: string; onBack?: () => void }) {
  const [messageApi, contextHolder] = message.useMessage();
  const [teamId, setTeamId] = useState<string | undefined>();
  const [data, setData] = useState<AiReviewTaskSubmissionsResponse>(emptyTaskDetail);
  const [status, setStatus] = useState<string | undefined>();
  const [suggestion, setSuggestion] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [selectedJob, setSelectedJob] = useState<AiReviewJobPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effectiveTaskId = taskId || new URLSearchParams(window.location.search).get('task_id') || '';

  const loadDetail = useCallback(async (nextTeamId = teamId, overrides: AiReviewDetailQuery = {}) => {
    if (!effectiveTaskId) {
      setError('缺少任务 ID，无法加载 AI 预审明细。');
      return;
    }
    setLoading(true);
    setError(null);
    const nextPage = overrides.page ?? page;
    const nextPageSize = overrides.pageSize ?? pageSize;
    const nextKeyword = overrides.keyword ?? keyword;
    const nextStatus = Object.prototype.hasOwnProperty.call(overrides, 'status') ? overrides.status : status;
    const nextSuggestion = Object.prototype.hasOwnProperty.call(overrides, 'suggestion') ? overrides.suggestion : suggestion;
    try {
      const result = await getAiReviewTaskSubmissions(nextTeamId, effectiveTaskId, {
        status: nextStatus,
        suggestion: nextSuggestion,
        keyword: nextKeyword.trim() || undefined,
        page: nextPage,
        page_size: nextPageSize,
      });
      setData(result);
      setPage(result.pagination.page);
      setPageSize(result.pagination.page_size);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'AI 预审明细加载失败');
    } finally {
      setLoading(false);
    }
  }, [effectiveTaskId, keyword, page, pageSize, status, suggestion, teamId]);

  useEffect(() => {
    let ignore = false;
    async function bootstrap() {
      setBootstrapping(true);
      setError(null);
      try {
        const overview = await getAdminOverview();
        const nextTeamId = overview.default_team_id || overview.teams[0]?.team_id;
        if (ignore) return;
        setTeamId(nextTeamId);
        if (!nextTeamId) {
          setError('AI 预审需要企业作用域；当前账号没有可用企业。');
          return;
        }
        if (effectiveTaskId) {
          const result = await getAiReviewTaskSubmissions(nextTeamId, effectiveTaskId, { page: 1, page_size: pageSize });
          if (!ignore) setData(result);
        }
      } catch (err) {
        if (!ignore) setError(err instanceof ApiClientError ? err.message : '企业信息加载失败');
      } finally {
        if (!ignore) setBootstrapping(false);
      }
    }
    void bootstrap();
    return () => {
      ignore = true;
    };
  }, [effectiveTaskId, pageSize]);

  const openJob = async (jobId: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      setSelectedJob(await getAiReviewJob(teamId, jobId));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'AI 预审结果加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const retryJob = async (jobId: string) => {
    setActionLoading(true);
    try {
      await retryAiReviewJob(teamId, jobId);
      messageApi.success('已重新入队');
      await loadDetail(teamId);
    } catch (err) {
      messageApi.error(err instanceof ApiClientError ? err.message : '重新入队失败');
    } finally {
      setActionLoading(false);
    }
  };

  const triggerOne = useCallback(async (submissionId: string) => {
    setActionLoading(true);
    try {
      await triggerAiReview(teamId, submissionId);
      messageApi.success('已触发 AI 预审');
      await loadDetail(teamId);
    } catch (err) {
      messageApi.error(err instanceof ApiClientError ? err.message : '触发 AI 预审失败');
    } finally {
      setActionLoading(false);
    }
  }, [loadDetail, messageApi, teamId]);

  const triggerSelected = async () => {
    const selected = data.items.filter((item) => selectedRowKeys.includes(item.submission_id));
    if (!selected.length) {
      messageApi.warning('请选择需要触发的提交');
      return;
    }
    const triggerable = selected.filter((item) => item.ai_status === 'not_created');
    const retryable = selected.filter((item) => item.ai_status === 'failed' && item.ai_job?.job_id);
    const skippedCount = selected.length - triggerable.length - retryable.length;
    if (!triggerable.length && !retryable.length) {
      messageApi.warning('所选提交当前没有可触发或可重试的 AI 预审');
      return;
    }
    setActionLoading(true);
    try {
      const batchResult = triggerable.length
        ? await batchTriggerAiReview(teamId, triggerable.map((item) => item.submission_id))
        : { success_count: 0, failed_count: 0 };
      const retryResults = await Promise.allSettled(retryable.map((item) => retryAiReviewJob(teamId, item.ai_job!.job_id)));
      const retrySuccessCount = retryResults.filter((result) => result.status === 'fulfilled').length;
      const retryFailedCount = retryResults.length - retrySuccessCount;
      const successCount = batchResult.success_count + retrySuccessCount;
      const failedCount = batchResult.failed_count + retryFailedCount;
      if (failedCount > 0 || skippedCount > 0) {
        messageApi.warning(`已处理 ${successCount} 条，失败 ${failedCount} 条，跳过 ${skippedCount} 条`);
      } else {
        messageApi.success(`已触发 ${successCount} 条 AI 预审`);
      }
      setSelectedRowKeys([]);
      await loadDetail(teamId);
    } catch (err) {
      messageApi.error(err instanceof ApiClientError ? err.message : '批量触发失败');
    } finally {
      setActionLoading(false);
    }
  };

  const columns = useMemo<ColumnsType<AiReviewTaskSubmissionPayload>>(() => [
    {
      title: '提交记录',
      dataIndex: 'submission_id',
      key: 'submission_id',
      width: 170,
      render: (value: string, item, index) => renderSubmissionReference(value, item, (page - 1) * pageSize + index + 1),
    },
    {
      title: '题目',
      dataIndex: 'question_id',
      key: 'question_id',
      width: 138,
      render: (value: string, _item, index) => renderBusinessReference(`题目 ${((page - 1) * pageSize + index + 1)}`, value, '题目编号'),
    },
    {
      title: '标注员',
      dataIndex: 'labeler_id',
      key: 'labeler_id',
      width: 132,
      render: (value: string) => renderBusinessReference('标注员', value, '用户编号'),
    },
    {
      title: 'AI 状态',
      dataIndex: 'ai_status',
      key: 'ai_status',
      width: 104,
      render: (value: string) => <Tag color={statusColors[value] || 'default'}>{statusLabels[value] || value}</Tag>,
    },
    {
      title: 'AI 建议',
      dataIndex: 'ai_suggestion',
      key: 'ai_suggestion',
      width: 116,
      render: (value?: string | null) => value ? <Tag color={suggestionLabels[value]?.color || 'default'}>{suggestionLabels[value]?.label || value}</Tag> : '-',
    },
    { title: '评分', dataIndex: 'ai_score', key: 'ai_score', width: 80, render: (value) => value ?? '-' },
    { title: '失败原因', dataIndex: 'error', key: 'error', ellipsis: true, render: (value?: string | null) => value ? <Tooltip title={value}><Typography.Text type="danger" ellipsis>{value}</Typography.Text></Tooltip> : '-' },
    { title: '更新时间', dataIndex: 'updated_at', key: 'updated_at', width: 136, render: formatDateTime },
    {
      title: '操作',
      key: 'actions',
      width: 138,
      fixed: 'right',
      className: 'workspace-table-action-cell',
      render: (_, item) => (
        <WorkspaceTableActions
          visible={[
            ...(item.ai_job ? [{ key: 'result', label: '查看结果', icon: <EyeOutlined />, onClick: () => void openJob(item.ai_job!.job_id) }] : []),
            ...(!item.ai_job ? [{ key: 'trigger', label: '触发预审', icon: <ThunderboltOutlined />, loading: actionLoading, onClick: () => void triggerOne(item.submission_id) }] : []),
          ]}
          menu={item.ai_job?.job_id && item.ai_status === 'failed'
            ? [{ key: 'retry', label: '重新入队', icon: <RetweetOutlined />, loading: actionLoading, onClick: () => void retryJob(item.ai_job!.job_id) }]
            : []}
        />
      ),
    },
  ], [actionLoading, loadDetail, page, pageSize, teamId, triggerOne]);

  const handleTableChange = (pagination: TablePaginationConfig) => {
    const nextPage = pagination.current ?? 1;
    const nextPageSize = pagination.pageSize ?? pageSize;
    setPage(nextPage);
    setPageSize(nextPageSize);
    void loadDetail(teamId, { page: nextPage, pageSize: nextPageSize });
  };

  const selectedActionableCount = data.items.filter((item) => selectedRowKeys.includes(item.submission_id) && isBatchTriggerableSubmission(item)).length;

  return (
    <main className="workspace-content ai-review-page ai-review-detail-page workspace-fixed-page">
      {contextHolder}
      <section className="page-heading">
        <div>
          <p className="section-kicker">AI Review Detail</p>
          <h1>{data.task.title || 'AI预审任务明细'}</h1>
        </div>
        <Space className="page-heading-actions">
          <Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回</Button>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadDetail(teamId)}>刷新</Button>
          <Button type="primary" icon={<ThunderboltOutlined />} loading={actionLoading} disabled={selectedActionableCount === 0} onClick={() => void triggerSelected()}>批量触发{selectedActionableCount ? ` (${selectedActionableCount})` : ''}</Button>
        </Space>
      </section>

      <section className="ai-review-detail-summary">
        <Statistic title="提交数" value={data.task.submitted_count || data.summary.submission_total} />
        <Statistic title="已入队" value={data.task.job_total} />
        <Statistic title="待处理" value={data.task.pending_count} />
        <Statistic title="处理中" value={data.task.processing_count} />
        <Statistic title="失败" value={data.task.failed_count} />
        <Statistic title="人工复核" value={data.task.manual_count} />
        <Statistic title="并发上限" value={data.summary.concurrency?.limit ?? 3} suffix={`处理中 ${data.summary.concurrency?.processing ?? data.task.processing_count}`} />
        <div className="ai-review-detail-progress">
          <span>覆盖率</span>
          <Progress percent={Math.round((data.task.coverage_rate || 0) * 100)} size="small" />
        </div>
      </section>

      <section className="ai-review-console">
        {error && <Alert className="ai-review-error" title={error} type="error" showIcon action={<Button size="small" onClick={() => void loadDetail(teamId)}>重试</Button>} />}
        <div className="ai-review-control-bar">
          <Space size={8} className="ai-review-filter-group">
            <Input.Search allowClear className="ai-review-keyword-filter" placeholder="搜索提交、题目或标注员" value={keyword} onChange={(event) => setKeyword(event.target.value)} onSearch={(value) => { setPage(1); void loadDetail(teamId, { page: 1, keyword: value }); }} />
            <Select allowClear className="ai-review-status-filter" placeholder="AI 状态" value={status} onChange={(value) => { setStatus(value); setPage(1); void loadDetail(teamId, { page: 1, status: value }); }} options={['not_created', ...statusOptions].map((value) => ({ value, label: statusLabels[value] }))} />
            <Select allowClear className="ai-review-status-filter" placeholder="AI 建议" value={suggestion} onChange={(value) => { setSuggestion(value); setPage(1); void loadDetail(teamId, { page: 1, suggestion: value }); }} options={suggestionOptions.map((value) => ({ value, label: suggestionLabels[value].label }))} />
          </Space>
          <AiReviewStatusInline counts={data.summary.status_counts} />
        </div>

        <div className="ai-review-table-shell workspace-fixed-table-panel">
          {bootstrapping ? (
            <div className="ai-review-loading"><Spin description="正在加载 AI 预审明细" /></div>
          ) : (
            <EnhancedTable<AiReviewTaskSubmissionPayload>
              className="workspace-fixed-table ai-review-table"
              columns={columns}
              dataSource={data.items}
              enableColumnResize={false}
              loading={loading}
              locale={{ emptyText: <Empty description="暂无提交明细" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              pagination={{
                current: page,
                pageSize,
                total: data.pagination.total,
                showQuickJumper: true,
                showSizeChanger: true,
                placement: ['bottomEnd'],
                showTotal: (total) => `共 ${total} 条`,
              }}
              rowKey="submission_id"
              scroll={{ y: 'var(--workspace-table-body-height)' }}
              rowSelection={{
                selectedRowKeys,
                onChange: setSelectedRowKeys,
                getCheckboxProps: (record) => ({
                  disabled: !isBatchTriggerableSubmission(record),
                  title: isBatchTriggerableSubmission(record) ? '加入本次批量触发' : '该提交当前状态不支持批量触发',
                }),
              }}
              onChange={handleTableChange}
            />
          )}
        </div>
      </section>

      <Drawer
        className="ai-review-detail-drawer"
        open={Boolean(selectedJob) || detailLoading}
        title="AI 预审结果"
        width={720}
        extra={selectedJob ? <Tag color={statusColors[selectedJob.status] || 'default'}>{statusLabels[selectedJob.status] || selectedJob.status}</Tag> : null}
        onClose={() => setSelectedJob(null)}
      >
        {detailLoading ? (
          <div className="ai-review-loading"><Spin description="正在加载 AI 预审结果" /></div>
        ) : !selectedJob ? (
          <Empty description="请选择一条结果" />
        ) : (
          <div className="ai-review-detail-stack">
            <section className="ai-review-detail-section">
              <h3>预审摘要</h3>
              <Descriptions bordered size="small" column={1}>
                <Descriptions.Item label="状态">{statusLabels[selectedJob.status] || selectedJob.status}</Descriptions.Item>
                <Descriptions.Item label="评分">{formatScore(selectedJob)}</Descriptions.Item>
                <Descriptions.Item label="重试次数">{selectedJob.retry_count}</Descriptions.Item>
                <Descriptions.Item label="更新时间">{formatDateTime(selectedJob.updated_at)}</Descriptions.Item>
              </Descriptions>
              <WorkspaceTechnicalInfo
                items={[
                  { key: 'job_id', label: 'Job ID', value: selectedJob.job_id },
                  { key: 'submission_id', label: '提交 ID', value: selectedJob.submission_id },
                  { key: 'question_id', label: '题目 ID', value: selectedJob.question_id },
                  { key: 'labeler_id', label: '标注员 ID', value: selectedJob.labeler_id },
                ]}
              />
            </section>
            {selectedJob.error ? <Alert showIcon type="error" title="执行错误" description={selectedJob.error} /> : null}
            <section className="ai-review-detail-section"><h3>评分维度</h3><pre>{formatJson(selectedJob.dimensions)}</pre></section>
            <section className="ai-review-detail-section"><h3>Prompt</h3><pre>{selectedJob.prompt || '未配置 Prompt'}</pre></section>
            <section className="ai-review-detail-section"><h3>结构化结果</h3><pre>{formatJson(selectedJob.result)}</pre></section>
          </div>
        )}
      </Drawer>
    </main>
  );
}

function AiReviewStatusInline({ counts }: { counts: Record<string, number> }) {
  return (
    <Space size={4} wrap className="ai-review-status-inline">
      {statusOptions.map((status) => (
        <Tag color={statusColors[status]} key={status}>{statusLabels[status]} {counts?.[status] ?? 0}</Tag>
      ))}
    </Space>
  );
}

function AiReviewSuggestionInline({ counts }: { counts: Record<string, number> }) {
  return (
    <Space size={4} wrap className="ai-review-status-inline">
      {suggestionOptions.map((suggestion) => (
        <Tag color={suggestionLabels[suggestion].color} key={suggestion}>{suggestionLabels[suggestion].label} {counts?.[suggestion] ?? 0}</Tag>
      ))}
    </Space>
  );
}

function renderBusinessReference(label: string, id: string | null | undefined, codeLabel: string) {
  if (!id) return '-';
  return (
    <div className="ai-review-task-title">
      <Typography.Text ellipsis>{label}</Typography.Text>
      <WorkspaceSecondaryCode label={codeLabel} value={id} />
    </div>
  );
}

function renderSubmissionReference(value: string | null | undefined, item: AiReviewTaskSubmissionPayload, index: number) {
  const submittedAt = formatDateTime(item.submitted_at || item.updated_at);
  return (
    <div className="ai-review-task-title">
      <Typography.Text ellipsis>{`第 ${index} 条提交`}</Typography.Text>
      <Typography.Text type="secondary" ellipsis>{submittedAt}</Typography.Text>
      <WorkspaceSecondaryCode label="提交编号" value={value} />
    </div>
  );
}

function formatDateTime(value: string | null | undefined): string {
  return formatApiShortDateTime(value);
}

function getTimeValue(value: string | null | undefined): number {
  return apiDateTimeValue(value);
}

function getScoreValue(job: AiReviewJobPayload): unknown {
  const result = job.result || {};
  return result.total_score ?? result.score ?? result.ai_score ?? result.final_score ?? null;
}

function formatScore(job: AiReviewJobPayload): string {
  const score = getScoreValue(job);
  if (score === null || score === undefined || score === '') return '-';
  if (typeof score === 'number') return Number.isInteger(score) ? String(score) : score.toFixed(1);
  return String(score);
}

function formatJson(value: unknown): string {
  if (value === null || value === undefined || value === '') return '暂无数据';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
