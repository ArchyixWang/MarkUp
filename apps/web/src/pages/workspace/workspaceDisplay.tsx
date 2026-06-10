import type { ReactNode } from 'react';
import { Collapse, Descriptions, Tooltip, Typography } from 'antd';

const entityTypeLabels: Record<string, string> = {
  ai_job: 'AI 预审',
  audit_log: '操作日志',
  dataset: '数据集',
  export: '导出任务',
  member: '成员',
  notification: '通知',
  points_budget: '积分钱包',
  question: '题目',
  review: '审核',
  submission: '提交记录',
  task: '任务',
  team: '企业',
  team_member: '成员',
  template: '模板',
  upload: '上传文件',
};

export type TechnicalInfoItem = {
  key: string;
  label: ReactNode;
  value?: ReactNode | null;
};

export function entityTypeLabel(type?: string | null): string {
  if (!type) return '对象';
  return entityTypeLabels[type] ?? type;
}

export function formatShortId(value?: string | null): string {
  if (!value) return '-';
  const normalized = String(value).trim();
  if (!normalized) return '-';
  return normalized.length > 12 ? `${normalized.slice(0, 6)}...${normalized.slice(-4)}` : normalized;
}

export function WorkspaceSecondaryCode({ label = '编号', value }: { label?: string; value?: string | null }) {
  if (!value) return null;
  return (
    <Tooltip title={`${label}: ${value}`}>
      <Typography.Text type="secondary" className="workspace-secondary-code">
        {label} {formatShortId(value)}
      </Typography.Text>
    </Tooltip>
  );
}

export function WorkspaceEntityReference({
  type,
  id,
  label,
}: {
  type?: string | null;
  id?: string | null;
  label?: ReactNode;
}) {
  if (!type && !id && !label) return <>无</>;
  return (
    <span className="workspace-entity-reference">
      <Typography.Text>{label ?? entityTypeLabel(type)}</Typography.Text>
      {id ? <WorkspaceSecondaryCode label="编号" value={id} /> : null}
    </span>
  );
}

export function WorkspaceTechnicalInfo({ items }: { items: TechnicalInfoItem[] }) {
  const visibleItems = items.filter((item) => item.value !== null && item.value !== undefined && item.value !== '');
  if (!visibleItems.length) return null;
  return (
    <Collapse
      ghost
      size="small"
      className="workspace-technical-info"
      items={[{
        key: 'technical',
        label: '技术信息',
        children: (
          <Descriptions size="small" column={1}>
            {visibleItems.map((item) => (
              <Descriptions.Item key={item.key} label={item.label}>
                {item.value}
              </Descriptions.Item>
            ))}
          </Descriptions>
        ),
      }]}
    />
  );
}
