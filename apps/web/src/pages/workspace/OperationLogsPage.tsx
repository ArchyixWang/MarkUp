import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, DatePicker, Drawer, Input, Modal, Select, Space, Tag, Typography } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { EyeOutlined } from '@ant-design/icons';
import { EnhancedTable } from '../../components/ui/EnhancedTable';
import { ApiClientError } from '../../services/apiClient';
import { exportAuditLogs, getAdminOverview, getAuditLog, listAuditLogs } from '../../services/workspaceService';
import type { AuditLogPayload, TeamDetail } from '../../types/api';
import { apiDateTimeValue, formatApiDateTime } from '../../utils/dateTime';
import { WorkspaceLoading } from './WorkspaceLoading';
import { workspacePopupContainer } from './workspaceListHelpers';
import { WorkspaceTableActions } from './WorkspaceTableActions';
import { WorkspaceEntityReference, WorkspaceSecondaryCode, WorkspaceTechnicalInfo, formatShortId } from './workspaceDisplay';

const { RangePicker } = DatePicker;

export type OperationLogFilters = {
  keyword?: string;
  entity_type?: string;
  entity_id?: string;
  operator_id?: string;
  risk_level?: string;
  action?: string;
  start_date?: string;
  end_date?: string;
};

type FilterState = {
  keyword: string;
  entityType: string;
  entityId: string;
  operatorId: string;
  riskLevel: string;
  action: string;
  startDate: string;
  endDate: string;
};

type PaginationState = {
  current: number;
  pageSize: number;
  total: number;
};

const entityLabels: Record<string, string> = {
  team: '企业',
  team_member: '成员',
  task: '任务',
  template: '模板',
  dataset: '数据集',
  question: '题目',
  submission: '提交',
  review: '审核',
  ai_review: 'AI 预审',
  ai_resource: 'AI 资源',
  system_agent: '系统 Agent',
  points_budget: '积分钱包',
  notification: '通知',
  export: '导出',
  upload: '上传',
  membership: '会员',
  audit_log: '操作日志',
};

const riskLabels: Record<string, string> = {
  normal: '常规',
  important: '重要',
  high: '高风险',
};

const riskColors: Record<string, string> = {
  normal: 'default',
  important: 'gold',
  high: 'red',
};

const actionLabels: Record<string, string> = {
  audit_log_exported: '导出操作日志',
  budget_alert_updated: '更新预算预警',
  budget_limit_updated: '更新预算限制',
  budget_requested: '申请预算',
  dataset_imported: '导入数据集',
  invitation_resent: '重发邀请',
  invitation_revoked: '撤销邀请',
  labeling_task_completed: '完成标注任务',
  labeling_ai_assist_generated: 'AI 辅助标注生成',
  member_account_imported: '导入成员账号',
  member_batch_import_completed: '完成成员批量导入',
  member_imported: '导入已有成员',
  member_invited: '邀请成员',
  member_role_batch_updated: '批量更新成员角色',
  member_security_reminder_sent: '发送安全提醒',
  member_updated: '更新成员',
  notification_deleted: '删除通知',
  notification_deleted_for_user: '删除个人通知',
  notification_mark_all_read: '全部标记已读',
  notification_revoked: '撤回通知',
  notification_starred_batch: '批量星标通知',
  points_budget_alert_updated: '更新积分预警',
  points_budget_recharged: '充值积分预算',
  questions_batch_created: '批量创建题目',
  questions_batch_deleted: '批量删除题目',
  question_deleted: '删除题目',
  question_updated: '更新题目',
  ai_review_batch_triggered: '批量触发 AI 预审',
  ai_review_job_created: 'AI 预审任务创建',
  ai_review_job_processed: 'AI 预审完成',
  ai_review_job_requeued: 'AI 预审任务重试',
  ai_review_submission_released_to_review: 'AI 预审放行复核',
  submission_reviewed: '审核提交',
  submission_submitted: '提交标注',
  task_assistance_requested: '请求任务协助',
  task_auto_saved: '自动保存任务',
  task_bundle_claimed: '领取题目包',
  task_created: '创建任务',
  task_deleted: '删除任务',
  task_finished: '结束任务',
  task_owner_transferred: '转移任务负责人',
  task_paused: '暂停任务',
  task_published: '发布任务',
  task_resumed: '恢复任务',
  task_updated: '更新任务',
  system_agent_settings_updated: 'Agent 设置更新',
  team_verification_submitted: '提交企业认证',
  template_published: '发布模板',
};

const agentAuditActions = new Set([
  'ai_review_batch_triggered',
  'ai_review_job_created',
  'ai_review_job_processed',
  'ai_review_job_requeued',
  'ai_review_submission_released_to_review',
  'labeling_ai_assist_generated',
  'system_agent_settings_updated',
]);

const defaultPageSize = 20;

export function OperationLogsPage({
  initialFilters,
  onFiltersChange,
}: {
  initialFilters?: OperationLogFilters;
  onFiltersChange?: (filters?: OperationLogFilters) => void;
}) {
  const initialFilterState = useMemo(() => filtersFromProps(initialFilters), [initialFilters]);
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [items, setItems] = useState<AuditLogPayload[]>([]);
  const [selected, setSelected] = useState<AuditLogPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [keyword, setKeyword] = useState(initialFilterState.keyword);
  const [entityType, setEntityType] = useState(initialFilterState.entityType);
  const [entityId, setEntityId] = useState(initialFilterState.entityId);
  const [operatorId, setOperatorId] = useState(initialFilterState.operatorId);
  const [riskLevel, setRiskLevel] = useState(initialFilterState.riskLevel);
  const [action, setAction] = useState(initialFilterState.action);
  const [startDate, setStartDate] = useState(initialFilterState.startDate);
  const [endDate, setEndDate] = useState(initialFilterState.endDate);
  const [pagination, setPagination] = useState<PaginationState>({
    current: 1,
    pageSize: defaultPageSize,
    total: 0,
  });

  const sourceFilterTags = useMemo(() => buildSourceFilterTags(initialFilterState), [initialFilterState]);

  useEffect(() => {
    setKeyword(initialFilterState.keyword);
    setEntityType(initialFilterState.entityType);
    setEntityId(initialFilterState.entityId);
    setOperatorId(initialFilterState.operatorId);
    setRiskLevel(initialFilterState.riskLevel);
    setAction(initialFilterState.action);
    setStartDate(initialFilterState.startDate);
    setEndDate(initialFilterState.endDate);
    setPagination((current) => ({ ...current, current: 1 }));
  }, [initialFilterState]);

  useEffect(() => {
    let active = true;
    void getAdminOverview()
      .then((overview) => {
        if (!active) return;
        const currentTeam = overview.teams[0] ?? null;
        setTeam(currentTeam);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiClientError ? err.message : '操作日志加载失败');
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!team) {
      return;
    }
    void loadLogs(team, currentFilters(), pagination.current, pagination.pageSize, true);
    // We intentionally react to stateful filters and pagination changes here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team, keyword, entityType, entityId, operatorId, riskLevel, action, startDate, endDate, pagination.current, pagination.pageSize]);

  function currentFilters(): FilterState {
    return { keyword, entityType, entityId, operatorId, riskLevel, action, startDate, endDate };
  }

  async function loadLogs(
    targetTeam: TeamDetail,
    filters: FilterState,
    page: number,
    pageSize: number,
    syncFilters = true,
  ) {
    if (syncFilters) {
      onFiltersChange?.(filtersToExternal(filters));
    }
    setTableLoading(true);
    setError(null);
    try {
      const response = await listAuditLogs(targetTeam.team_id, queryFromFilters(filters, page, pageSize));
      setItems(Array.isArray(response.items) ? response.items : []);
      setPagination({
        current: response.pagination?.page ?? page,
        pageSize: response.pagination?.page_size ?? pageSize,
        total: response.pagination?.total ?? 0,
      });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '操作日志加载失败');
    } finally {
      setTableLoading(false);
    }
  }

  function handleSearchSubmit() {
    setPagination((current) => ({ ...current, current: 1 }));
  }

  function handleResetFilters() {
    setKeyword('');
    setEntityType('all');
    setEntityId('');
    setOperatorId('');
    setRiskLevel('all');
    setAction('');
    setStartDate('');
    setEndDate('');
    setPagination((current) => ({ ...current, current: 1, pageSize: defaultPageSize }));
  }

  function clearSourceFilters() {
    setEntityType('all');
    setEntityId('');
    setOperatorId('');
    setAction('');
    setPagination((current) => ({ ...current, current: 1 }));
  }

  function updateDateRange(_dates: null | [Dayjs | null, Dayjs | null], dateStrings: [string, string]) {
    const [nextStartDate, nextEndDate] = dateStrings;
    if (!nextStartDate || !nextEndDate) {
      setStartDate('');
      setEndDate('');
      setPagination((current) => ({ ...current, current: 1 }));
      return;
    }
    setStartDate(nextStartDate);
    setEndDate(nextEndDate);
    setPagination((current) => ({ ...current, current: 1 }));
  }

  async function openDetail(item: AuditLogPayload) {
    if (!team) return;
    setSelected(item);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const detail = await getAuditLog(team.team_id, item.log_id);
      setSelected(detail);
    } catch (err) {
      setDetailError(err instanceof ApiClientError ? err.message : '日志详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  }

  function exportLogs() {
    Modal.confirm({
      title: '导出操作日志',
      content: '将按当前筛选条件导出 CSV，并记录本次日志导出操作。',
      okText: '导出 CSV',
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        if (!team) return;
        setExporting(true);
        setError(null);
        try {
          const filters = currentFilters();
          const blob = await exportAuditLogs(team.team_id, {
            keyword: filters.keyword || undefined,
            entity_type: filters.entityType,
            entity_id: filters.entityId || undefined,
            operator_id: filters.operatorId || undefined,
            risk_level: filters.riskLevel,
            action: filters.action || undefined,
            start_date: filters.startDate || undefined,
            end_date: filters.endDate || undefined,
            export_format: 'csv',
          });
          downloadBlob(blob, 'operation_logs.csv');
          setMessage('操作日志 CSV 已生成下载');
        } catch (err) {
          setError(err instanceof ApiClientError ? err.message : '操作日志导出失败');
        } finally {
          setExporting(false);
        }
      },
    });
  }

  const columns = useMemo<ColumnsType<AuditLogPayload>>(
    () => [
      {
        title: '时间',
        dataIndex: 'created_at',
        key: 'created_at',
        width: 176,
        sorter: (left, right) => compareDateTime(left.created_at, right.created_at),
        render: (value) => formatTime(value),
      },
      {
        title: '动作',
        dataIndex: 'action',
        key: 'action',
        width: 220,
        filters: buildTableFilterOptions(items.map((item) => item.action)),
        filterSearch: true,
        onFilter: (value, item) => item.action === String(value),
        render: (_, item) => (
          <div className="audit-action-cell">
            <Space size={8} wrap>
              <Typography.Text strong>{formatActionLabel(item.action)}</Typography.Text>
              <Tag color={riskColors[item.risk_level || 'normal']}>
                {riskLabels[item.risk_level || 'normal'] ?? item.risk_level ?? '常规'}
              </Tag>
            </Space>
            <Typography.Text className="workspace-cell-subtext" type="secondary">{item.action}</Typography.Text>
          </div>
        ),
      },
      {
        title: '实体',
        dataIndex: 'entity_type',
        key: 'entity_type',
        width: 180,
        filters: buildTableFilterOptions(items.map((item) => item.entity_type)).map((item) => ({
          ...item,
          text: entityLabels[item.value] ?? item.value,
        })),
        filterSearch: true,
        onFilter: (value, item) => item.entity_type === String(value),
        render: (_, item) => (
          <WorkspaceEntityReference type={item.entity_type} id={item.entity_id} label={entityLabels[item.entity_type] ?? item.entity_type} />
        ),
      },
      {
        title: '操作人',
        dataIndex: 'operator_id',
        key: 'operator_id',
        width: 160,
        sorter: (left, right) => formatAuditOperator(left).localeCompare(formatAuditOperator(right), 'zh-CN'),
        render: (_value, item) => formatAuditOperator(item),
      },
      {
        title: '变更摘要',
        dataIndex: 'summary',
        key: 'summary',
        ellipsis: true,
        render: (value) => value || '未记录字段级变更',
      },
      {
        title: '来源',
        dataIndex: 'request_id',
        key: 'request_id',
        width: 220,
        render: (_, item) => (
          <div>
            <Typography.Text>{item.ip_address || '-'}</Typography.Text>
            {item.request_id ? <WorkspaceSecondaryCode label="请求编号" value={item.request_id} /> : <div className="workspace-cell-subtext">无请求编号</div>}
          </div>
        ),
      },
      {
        title: '操作',
        key: 'operations',
        width: 92,
        fixed: 'right',
        className: 'workspace-table-action-cell',
        render: (_, item) => (
          <WorkspaceTableActions
            visible={[{ key: 'detail', label: '查看详情', icon: <EyeOutlined />, onClick: () => void openDetail(item) }]}
          />
        ),
      },
    ],
    [items],
  );

  if (loading) {
    return (
      <main className="workspace-content operation-logs-page workspace-loading-page">
        <WorkspaceLoading tip="正在加载操作日志" />
      </main>
    );
  }

  if (!team) {
    return (
      <main className="workspace-content operation-logs-page">
        <Alert className="inline-message-ant" type="warning" showIcon title="请先完成企业初始化后再查看操作日志。" />
      </main>
    );
  }

  return (
    <main className="workspace-content operation-logs-page production-list-page workspace-fixed-page">
      <section className="page-heading">
        <div>
          <p className="section-kicker">Operation Logs</p>
          <h1>操作日志</h1>
          <p>按企业范围查询关键写操作，支持关键词、动作、实体、风险等级与时间筛选。</p>
        </div>
        <div className="page-actions">
          <Button loading={exporting} onClick={exportLogs}>
            导出日志
          </Button>
          <Button onClick={() => void loadLogs(team, currentFilters(), pagination.current, pagination.pageSize)}>
            刷新
          </Button>
        </div>
      </section>

      {message ? (
        <Alert className="inline-message-ant" type="success" showIcon closable onClose={() => setMessage(null)} title={message} />
      ) : null}
      {error ? (
        <Alert
          className="inline-message-ant"
          type="error"
          showIcon
          closable
          onClose={() => setError(null)}
          title={error}
          action={
            <Button size="small" onClick={() => void loadLogs(team, currentFilters(), pagination.current, pagination.pageSize)}>
              重试
            </Button>
          }
        />
      ) : null}

      <div className="operation-log-toolbar production-filter-bar workspace-fixed-toolbar">
        <Input.Search
          className="production-filter-search"
          aria-label="搜索日志"
          allowClear
          placeholder="搜索对象、操作人或请求编号"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onSearch={handleSearchSubmit}
        />
        <Select
          className="production-filter-select"
          aria-label="实体类型"
          value={entityType}
          onChange={(value) => {
            setEntityType(value);
            setPagination((current) => ({ ...current, current: 1 }));
          }}
          getPopupContainer={workspacePopupContainer}
          options={[
            { value: 'all', label: '全部实体' },
            ...Object.entries(entityLabels).map(([value, label]) => ({ value, label })),
          ]}
        />
        <Select
          className="production-filter-select"
          aria-label="风险等级"
          value={riskLevel}
          onChange={(value) => {
            setRiskLevel(value);
            setPagination((current) => ({ ...current, current: 1 }));
          }}
          getPopupContainer={workspacePopupContainer}
          options={[
            { value: 'all', label: '全部风险' },
            { value: 'normal', label: '常规' },
            { value: 'important', label: '重要' },
            { value: 'high', label: '高风险' },
          ]}
        />
        <RangePicker
          aria-label="时间范围"
          value={startDate && endDate ? [dayjs(startDate), dayjs(endDate)] : null}
          format="YYYY-MM-DD"
          onChange={updateDateRange}
          getPopupContainer={workspacePopupContainer}
          presets={[
            { label: '最近 7 天', value: [dayjs().subtract(6, 'day'), dayjs()] },
            { label: '最近 30 天', value: [dayjs().subtract(29, 'day'), dayjs()] },
            { label: '最近 90 天', value: [dayjs().subtract(89, 'day'), dayjs()] },
          ]}
        />
        <Input aria-label="对象标识（高级）" placeholder="对象标识（高级）" value={entityId} onChange={(event) => setEntityId(event.target.value)} />
        <Input aria-label="操作人标识（高级）" placeholder="操作人标识（高级）" value={operatorId} onChange={(event) => setOperatorId(event.target.value)} />
        <Input aria-label="动作类型" placeholder="动作类型" value={action} onChange={(event) => setAction(event.target.value)} />
        <Button onClick={handleSearchSubmit}>查询</Button>
        <Button onClick={handleResetFilters}>重置筛选</Button>
      </div>

      <section className="workspace-table-panel production-table-shell workspace-fixed-table-panel">
        {sourceFilterTags.length > 0 ? (
          <div className="source-filter-row" aria-label="来源筛选">
            <span>来源筛选</span>
            <Space size={6} wrap>
              {sourceFilterTags.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
              <Button size="small" onClick={clearSourceFilters}>
                清除来源筛选
              </Button>
            </Space>
          </div>
        ) : null}

        <EnhancedTable
          className="workspace-fixed-table"
          rowKey="log_id"
          loading={tableLoading}
          dataSource={items}
          columns={columns}
          locale={{ emptyText: '当前筛选条件下暂无操作日志' }}
          rowClassName={(record) => (record.risk_level === 'high' ? 'audit-row-high' : '')}
          tableLayout="fixed"
          scroll={{ x: 1320, y: 'calc(var(--workspace-table-body-height) - 56px)' }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => {
              setPagination({
                current: page,
                pageSize: pageSize ?? pagination.pageSize,
                total: pagination.total,
              });
            },
          }}
          onChange={(nextPagination) => {
            const config = nextPagination as TablePaginationConfig;
            if (
              typeof config.current === 'number'
              && typeof config.pageSize === 'number'
              && (config.current !== pagination.current || config.pageSize !== pagination.pageSize)
            ) {
              setPagination({
                current: config.current,
                pageSize: config.pageSize,
                total: pagination.total,
              });
            }
          }}
        />
      </section>

      <Drawer
        title="日志详情"
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null);
          setDetailError(null);
        }}
        size="large"
      >
        {selected ? (
          <div className="detail-drawer-content">
            {detailError ? <Alert className="inline-message-ant" type="error" showIcon title={detailError} /> : null}
            {detailLoading ? <WorkspaceLoading tip="正在加载日志详情" /> : null}
            <div className="tag-row">
              <Tag>{entityLabels[selected.entity_type] ?? selected.entity_type}</Tag>
              <Tag color={riskColors[selected.risk_level || 'normal']}>
                {riskLabels[selected.risk_level || 'normal'] ?? selected.risk_level ?? '常规'}
              </Tag>
            </div>
            <h2>{formatActionLabel(selected.action)}</h2>
            <Typography.Text className="workspace-cell-subtext" type="secondary">{selected.action}</Typography.Text>
            <dl>
              <dt>时间</dt>
              <dd>{formatTime(selected.created_at)}</dd>
              <dt>实体</dt>
              <dd>
                <WorkspaceEntityReference type={selected.entity_type} id={selected.entity_id} label={entityLabels[selected.entity_type] ?? selected.entity_type} />
              </dd>
              <dt>操作人</dt>
              <dd>{formatAuditOperator(selected)}</dd>
              <dt>请求编号</dt>
              <dd>{selected.request_id ? formatShortId(selected.request_id) : '-'}</dd>
              <dt>来源 IP</dt>
              <dd>{selected.ip_address || '-'}</dd>
              <dt>User-Agent</dt>
              <dd>{selected.user_agent || '-'}</dd>
              <dt>变更摘要</dt>
              <dd>{selected.summary || '未记录字段级变更'}</dd>
            </dl>
            <WorkspaceTechnicalInfo
              items={[
                { key: 'entity_id', label: '对象 ID', value: selected.entity_id },
                { key: 'operator_id', label: '操作人 ID', value: selected.operator_id || '系统' },
                { key: 'request_id', label: 'Request ID', value: selected.request_id },
              ]}
            />
            <h3>字段 Diff</h3>
            <div className="audit-diff-list">{renderDiff(selected.changes)}</div>
          </div>
        ) : null}
      </Drawer>
    </main>
  );
}

function filtersFromProps(filters?: OperationLogFilters): FilterState {
  return {
    keyword: filters?.keyword ?? '',
    entityType: filters?.entity_type ?? 'all',
    entityId: filters?.entity_id ?? '',
    operatorId: filters?.operator_id ?? '',
    riskLevel: filters?.risk_level ?? 'all',
    action: filters?.action ?? '',
    startDate: filters?.start_date ?? '',
    endDate: filters?.end_date ?? '',
  };
}

function filtersToExternal(filters: FilterState): OperationLogFilters {
  return {
    keyword: filters.keyword || undefined,
    entity_type: filters.entityType !== 'all' ? filters.entityType : undefined,
    entity_id: filters.entityId || undefined,
    operator_id: filters.operatorId || undefined,
    risk_level: filters.riskLevel !== 'all' ? filters.riskLevel : undefined,
    action: filters.action || undefined,
    start_date: filters.startDate || undefined,
    end_date: filters.endDate || undefined,
  };
}

function queryFromFilters(filters: FilterState, page: number, pageSize: number) {
  return {
    keyword: filters.keyword || undefined,
    entity_type: filters.entityType,
    entity_id: filters.entityId || undefined,
    operator_id: filters.operatorId || undefined,
    risk_level: filters.riskLevel,
    action: filters.action || undefined,
    start_date: filters.startDate || undefined,
    end_date: filters.endDate || undefined,
    page,
    page_size: pageSize,
  };
}

function buildSourceFilterTags(filters: FilterState): string[] {
  const tags: string[] = [];
  if (filters.entityType !== 'all') tags.push(`实体：${entityLabels[filters.entityType] ?? filters.entityType}`);
  if (filters.entityId) tags.push(`对象标识：${formatShortId(filters.entityId)}`);
  if (filters.operatorId) tags.push(`操作人：${formatShortId(filters.operatorId)}`);
  if (filters.action) tags.push(`动作：${filters.action}`);
  return tags;
}

function renderDiff(changes: Record<string, unknown>) {
  const entries = Object.entries(changes || {});
  if (entries.length === 0) {
    return <p className="muted-text">该操作未记录字段级变更。</p>;
  }
  return entries.map(([key, value]) => {
    if (value && typeof value === 'object' && 'from' in value && 'to' in value) {
      const diff = value as { from?: unknown; to?: unknown };
      return (
        <div className="audit-diff-item" key={key}>
          <strong>{key}</strong>
          <span>{formatDiffValue(diff.from)}</span>
          <span>{formatDiffValue(diff.to)}</span>
        </div>
      );
    }
    return (
      <div className="audit-diff-item" key={key}>
        <strong>{key}</strong>
        <span>{formatDiffValue(value)}</span>
      </div>
    );
  });
}

function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function formatActionLabel(action: string): string {
  return actionLabels[action] ?? action;
}

function formatAuditOperator(log: AuditLogPayload): string {
  if (!log.operator_id && isAgentAuditLog(log)) {
    const agentActor = log.changes?.agent_actor;
    return typeof agentActor === 'string' && agentActor.trim() ? agentActor : 'MarkUp Agent';
  }
  return log.operator_name || log.operator_id || '系统';
}

function isAgentAuditLog(log: AuditLogPayload): boolean {
  return agentAuditActions.has(log.action) || typeof log.changes?.agent_actor === 'string';
}

function formatTime(value?: string | null): string {
  return formatApiDateTime(value);
}

function compareDateTime(left?: string | null, right?: string | null) {
  return apiDateTimeValue(left) - apiDateTimeValue(right);
}

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

function downloadBlob(blob: Blob, filename: string) {
  if (typeof URL === 'undefined' || !URL.createObjectURL) return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
