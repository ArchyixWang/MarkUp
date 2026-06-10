import { useCallback, useEffect, useMemo, useState, type Key } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Card,
  Checkbox,
  Empty,
  Form,
  Input,
  InputNumber,
  message as antdMessage,
  Modal,
  Progress,
  Radio,
  Segmented,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Table,
  Timeline,
  Tooltip,
  Typography,
} from 'antd';
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownOutlined,
  EditOutlined,
  FileSearchOutlined,
  ReloadOutlined,
  SwapOutlined,
  TableOutlined,
  UpOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { AppShellBreadcrumbItem } from '../../components/layout/AppShell';
import { ApiClientError } from '../../services/apiClient';
import { EnhancedTable } from '../../components/ui/EnhancedTable';
import { getReviewDiff, getReviewHistory, getReviewQueue, getReviewStats, getReviewSubmission, submitBatchReviewDecision, submitReviewDecision } from '../../services/reviewService';
import { getAdminOverview, getTeamMembers, listAiProviderConfigs, requestTaskAssistance } from '../../services/workspaceService';
import type { AiProviderConfigPayload, ApiUser, DataBindingPayload, ReviewDiffResponse, ReviewHistoryResponse, ReviewQueueItem, ReviewQueueResponse, ReviewStatsResponse, ReviewSubmissionDetail, TaskPayload, TeamMember, TemplateComponentSchema } from '../../types/api';
import { formatApiDateTime } from '../../utils/dateTime';
import { WorkspaceSummaryStrip } from './WorkspaceListPrimitives';
import { WorkspaceMediaPreview, resolveWorkspaceMediaPreviewValue } from './WorkspaceMediaPreview';

type AiQueueFilter = 'all' | 'pass' | 'reject' | 'manual';
type QueueStatusFilter = 'submitted' | 'processed';
type ReviewDecision = 'approved' | 'rejected' | 'revise';
type ReviewTaskViewMode = 'table' | 'card';
type ReviewAuditTimelineItem = ReviewHistoryResponse['items'][number];
type ReviseFormValues = { answers?: Record<string, unknown> };

interface ReviewAuditRoundGroup {
  round: number;
  title: string;
  items: Array<{
    key: string;
    actor: string;
    time: string;
    action: string;
    note?: string;
    decision?: string | null;
  }>;
}

interface ReviewAnswerField {
  field: string;
  label: string;
  type?: TemplateComponentSchema['type'] | 'Unknown';
  required?: boolean;
  options: Array<{ value: string; label: string }>;
  value: unknown;
  structured: boolean;
}

interface ReviewAuditTableRow {
  key: string;
  group: 'question' | 'answer';
  field: string;
  label: string;
  type: string;
  value: unknown;
  required?: boolean;
  source?: string;
  options?: Array<{ value: string; label: string }>;
}

const emptyQueue: ReviewQueueResponse = {
  items: [],
  summary: { pending: 0, rounds: [], tasks: 0, ai_suggestions: { pass: 0, reject: 0, manual: 0 } },
};

const decisionLabels: Record<ReviewDecision | string, string> = {
  approved: '通过',
  rejected: '打回',
  revise: '直接修订',
};

const aiSuggestionLabels: Record<string, { label: string; color: string }> = {
  pass: { label: 'AI建议通过', color: 'success' },
  reject: { label: 'AI建议打回', color: 'warning' },
  manual: { label: '待人工审核', color: 'processing' },
};

const aiReviewStatusLabels: Record<string, string> = {
  pending: '待处理',
  processing: '处理中',
  completed: '已完成',
  failed: '失败',
};

function formatAnswerValue(value: unknown) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return value;
}

function isObjectValue(value: unknown) {
  return typeof value === 'object' && value !== null;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isBase64DataUrl(value: string) {
  return /^data:[^;,]+;base64,/i.test(value.trim());
}

function isLikelyLongBase64(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 160 && /^[A-Za-z0-9+/=\r\n]+$/.test(trimmed);
}

function summarizeHiddenBinary(value: string) {
  const trimmed = value.trim();
  const mime = isBase64DataUrl(trimmed) ? trimmed.slice(5, trimmed.indexOf(';base64,')) : 'base64';
  const bytes = Math.round((trimmed.split(';base64,').pop() || trimmed).length * 0.75);
  return `${mime} · 约 ${formatReviewFileSize(bytes)}，编码已隐藏`;
}

function formatReviewSummaryText(value: string | null | undefined, fallback: string) {
  const raw = String(value || fallback || '').trim();
  if (!raw) return '-';
  return raw
    .replace(/data:([A-Za-z0-9.+/-]+);base64,[A-Za-z0-9+/=\r\n]+/g, (_match, mime) => `[${mime} 编码已隐藏]`)
    .replace(/[A-Za-z0-9+/=]{220,}/g, '[base64 编码已隐藏]');
}

function formatReviewQueueSummary(value: string | null | undefined) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (isBase64DataUrl(raw) || isLikelyLongBase64(raw)) return '';
  const cleaned = raw
    .replace(/data:([A-Za-z0-9.+/-]+);base64,[A-Za-z0-9+/=\r\n]+/g, '')
    .replace(/[A-Za-z0-9+/=]{220,}/g, '')
    .replace(/\[(?:[^\]]+)?编码已隐藏\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || /^[-·,，。;；|]+$/.test(cleaned)) return '';
  return cleaned;
}

function reviewQueueItemTitle(item: ReviewQueueItem) {
  const title = String(item.title || '').trim();
  if (title && title !== item.task_title) return title;
  return `题目 #${(item.row_index ?? 0) + 1}`;
}

function formatReviewFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '未知大小';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function maskBase64ForDisplay(value: unknown): unknown {
  if (typeof value === 'string') {
    if (isBase64DataUrl(value) || isLikelyLongBase64(value)) return `[${summarizeHiddenBinary(value)}]`;
    return value;
  }
  if (Array.isArray(value)) return value.map(maskBase64ForDisplay);
  if (isRecordValue(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, maskBase64ForDisplay(item)]));
  }
  return value;
}

function renderStructuredDiffValue(value: unknown): React.ReactNode {
  const masked = maskBase64ForDisplay(value);
  if (answerValueIsEmpty(masked)) return <Typography.Text type="secondary">未填写</Typography.Text>;
  if (typeof masked === 'string' || typeof masked === 'number' || typeof masked === 'boolean') {
    return <Typography.Text>{String(masked)}</Typography.Text>;
  }
  if (Array.isArray(masked)) {
    if (masked.length === 0) return <Typography.Text type="secondary">空列表</Typography.Text>;
    return (
      <div className="review-diff-structured-list">
        {masked.map((item, index) => (
          <div className="review-diff-structured-row" key={`${index}-${typeof item}`}>
            <span>#{index + 1}</span>
            <div className="review-diff-structured-value">{typeof item === 'object' && item !== null ? renderStructuredDiffValue(item) : String(item)}</div>
          </div>
        ))}
      </div>
    );
  }
  if (isRecordValue(masked)) {
    const entries = Object.entries(masked).filter(([, item]) => !answerValueIsEmpty(item));
    if (!entries.length) return <Typography.Text type="secondary">空对象</Typography.Text>;
    return (
      <div className="review-diff-structured-list">
        {entries.map(([key, item]) => (
          <div className="review-diff-structured-row" key={key}>
            <span>{key}</span>
            <div className="review-diff-structured-value">{renderStructuredDiffValue(item)}</div>
          </div>
        ))}
      </div>
    );
  }
  return <Typography.Text>{String(masked)}</Typography.Text>;
}

function answerValueIsEmpty(value: unknown) {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

function allTemplateComponents(detail: ReviewSubmissionDetail | null): TemplateComponentSchema[] {
  const schema = detail?.question.template_schema;
  if (!schema) return [];
  return [
    ...(schema.tabs ?? []).flatMap((tab) => tab.components ?? []),
    ...(schema.components ?? []),
  ].filter((component) => Boolean(component.field));
}

function componentForField(detail: ReviewSubmissionDetail | null, field: string): TemplateComponentSchema | null {
  return allTemplateComponents(detail).find((component) => component.field === field || component.id === field) ?? null;
}

function reviewFieldLabel(detail: ReviewSubmissionDetail | null, field: string) {
  return componentForField(detail, field)?.label || field;
}

function reviewFieldTypeLabel(type?: TemplateComponentSchema['type'] | string) {
  const labels: Record<string, string> = {
    TextInput: '文本输入',
    TextArea: '长文本',
    RichEditor: '富文本',
    SingleSelect: '单选',
    MultiSelect: '多选',
    TagSelect: '标签',
    Rating: '评分',
    DatePicker: '日期',
    JsonEditor: 'JSON',
    ImageUpload: '图片上传',
    AudioUpload: '音频上传',
    VideoUpload: '视频上传',
    ImageMaskAnnotation: '图片 Mask',
    ShowItem: '展示项',
  };
  return labels[String(type || '')] || String(type || '字段');
}

function reviewChangeTypeLabel(type: string) {
  if (type === 'added') return '新增';
  if (type === 'removed') return '移除';
  if (type === 'changed') return '变更';
  if (type === 'unchanged') return '未变';
  return type || '-';
}

function reviewChangeTypeColor(type: string) {
  if (type === 'added') return 'green';
  if (type === 'removed') return 'red';
  if (type === 'changed') return 'orange';
  return 'default';
}

const nonAnswerReviewComponentTypes = new Set<TemplateComponentSchema['type']>(['ShowItem', 'LLMComponent', 'GroupContainer']);

function buildReviewAnswerFields(detail: ReviewSubmissionDetail | null): ReviewAnswerField[] {
  const answers = detail?.submission.answers ?? {};
  const components = allTemplateComponents(detail).filter((component) => !nonAnswerReviewComponentTypes.has(component.type));
  const byField = new Map<string, TemplateComponentSchema>();
  components.forEach((component) => {
    if (!byField.has(component.field)) byField.set(component.field, component);
  });
  Object.keys(answers).forEach((field) => {
    if (!byField.has(field)) {
      byField.set(field, {
        id: field,
        field,
        label: field,
        type: 'TextInput',
        required: false,
        config: {},
        options: [],
        version: '1.0',
      });
    }
  });

  return Array.from(byField.values()).map((component) => {
    const value = answers[component.field];
    const structured = isObjectValue(value) && !(
      (component.type === 'MultiSelect' || component.type === 'TagSelect')
      && Array.isArray(value)
      && (component.options ?? []).length > 0
    );
    return {
      field: component.field,
      label: component.label || component.field,
      type: component.type || 'Unknown',
      required: component.required,
      options: component.options ?? [],
      value,
      structured,
    };
  });
}

function buildReviewAuditRows(detail: ReviewSubmissionDetail | null): ReviewAuditTableRow[] {
  if (!detail) return [];
  const content = detail.question.content ?? {};
  const answerFields = buildReviewAnswerFields(detail);
  const questionRows = buildReviewQuestionRows(detail, content);
  const answeredFields = new Set(answerFields.map((field) => field.field));
  const answerRows = answerFields.map((field) => ({
    key: `answer-${field.field}`,
    group: 'answer' as const,
    field: field.field,
    label: field.label,
    type: reviewFieldTypeLabel(field.type),
    value: field.value,
    required: field.required,
    source: 'Labeler 答案',
    options: field.options,
  }));
  const unmappedQuestionRows = Object.entries(content)
    .filter(([key]) => !['media', 'attachments', 'derived_context', '_bindings'].includes(key))
    .filter(([key]) => !questionRows.some((row) => row.field === key) && !answeredFields.has(key))
    .slice(0, 12)
    .map(([key, value]) => ({
      key: `question-content-${key}`,
      group: 'question' as const,
      field: key,
      label: key,
      type: inferReviewValueType(value),
      value,
      source: '题目字段',
    }));
  return [...questionRows, ...unmappedQuestionRows, ...answerRows];
}

function buildReviewQuestionRows(detail: ReviewSubmissionDetail, content: Record<string, unknown>): ReviewAuditTableRow[] {
  const seen = new Set<string>();
  const showItems = allTemplateComponents(detail).filter((component) => component.type === 'ShowItem');
  const rows: ReviewAuditTableRow[] = [];
  showItems.forEach((component) => {
    resolveReviewShowItemValues(component, content).forEach((item, index) => {
      const key = item.field || item.label || `${component.id}-${index}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({
        key: `question-${component.id}-${key}`,
        group: 'question',
        field: key,
        label: item.label || component.label || key,
        type: inferReviewValueType(item.value),
        value: item.value,
        source: component.label || '题目展示',
      });
    });
  });
  if (!rows.length) {
    Object.entries(content)
      .filter(([key]) => !['media', 'attachments', 'derived_context', '_bindings'].includes(key))
      .slice(0, 12)
      .forEach(([key, value]) => {
        seen.add(key);
        rows.push({
          key: `question-${key}`,
          group: 'question',
          field: key,
          label: key,
          type: inferReviewValueType(value),
          value,
          source: '题目字段',
        });
      });
  }
  return rows;
}

function resolveReviewShowItemValues(component: TemplateComponentSchema, content: Record<string, unknown>): Array<{ field: string; label: string; value: unknown }> {
  const materialized = normalizeReviewMaterializedShowItems(content[component.id] ?? content[component.field]);
  if (materialized.length) return materialized;

  const values: Array<{ field: string; label: string; value: unknown }> = [];
  const displayFields = Array.isArray(component.config.display_fields) ? component.config.display_fields : [];
  displayFields.forEach((item, index) => {
    if (typeof item === 'string') {
      const field = item.trim();
      if (!field) return;
      values.push({ field, label: field, value: content[field] });
      return;
    }
    if (!isRecordValue(item)) return;
    const binding = isDataBindingPayload(item.binding) ? item.binding : bindingFromReviewDisplayField(String(item.field || item.column || item.key || ''));
    const field = binding?.field || binding?.column_name || binding?.key || String(item.field || item.column || item.key || `field_${index + 1}`);
    values.push({
      field,
      label: String(item.label || reviewBindingDisplayName(binding) || field),
      value: binding ? resolveReviewBindingValue(binding, content) : content[field],
    });
  });
  if (values.length) return values.filter((item) => !answerValueIsEmpty(item.value));

  const binding = isDataBindingPayload(component.config.binding) ? component.config.binding : null;
  if (binding) {
    const field = binding.field || binding.column_name || binding.key || component.field;
    const value = resolveReviewBindingValue(binding, content);
    if (!answerValueIsEmpty(value)) {
      return [{ field: field || component.field, label: component.label || reviewBindingDisplayName(binding) || field || component.field, value }];
    }
  }

  const contentField = String(component.config.content_field || component.field || '').trim();
  if (contentField && !answerValueIsEmpty(content[contentField])) {
    return [{ field: contentField, label: component.label || contentField, value: content[contentField] }];
  }
  if (!answerValueIsEmpty(content[component.field])) {
    return [{ field: component.field, label: component.label || component.field, value: content[component.field] }];
  }
  return [];
}

function normalizeReviewMaterializedShowItems(value: unknown): Array<{ field: string; label: string; value: unknown }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index): { field: string; label: string; value: unknown } | null => {
      if (!isRecordValue(item) || !('value' in item)) return null;
      const binding = isDataBindingPayload(item.binding) ? item.binding : null;
      const field = String(item.field || item.key || binding?.field || binding?.column_name || binding?.key || `field_${index + 1}`);
      return {
        field,
        label: String(item.label || reviewBindingDisplayName(binding) || field),
        value: item.value,
      };
    })
    .filter(isNonEmptyReviewShowItem);
}

function isNonEmptyReviewShowItem(item: { field: string; label: string; value: unknown } | null): item is { field: string; label: string; value: unknown } {
  return item !== null && !answerValueIsEmpty(item.value);
}

function bindingFromReviewDisplayField(field: string): DataBindingPayload | null {
  const key = field.trim();
  if (!key) return null;
  return { source_type: 'column', column_name: key, field: key };
}

function isDataBindingPayload(value: unknown): value is DataBindingPayload {
  return isRecordValue(value) && typeof value.source_type === 'string';
}

function reviewBindingDisplayName(binding: DataBindingPayload | null) {
  if (!binding) return '';
  return binding.column_name || binding.field || binding.key || binding.media_type || binding.source_type;
}

function resolveReviewBindingValue(binding: DataBindingPayload, content: Record<string, unknown>) {
  if (binding.source_type === 'column') {
    const key = binding.column_name || binding.field || '';
    return key ? content[key] : undefined;
  }
  if (binding.source_type === 'media') {
    const mediaItems = Array.isArray(content.media) ? content.media : [];
    const match = mediaItems.find((item) => reviewMediaRefMatchesBinding(item, binding));
    if (match) return match;
    const key = binding.field || binding.column_name || '';
    return key ? content[key] : undefined;
  }
  if (binding.source_type === 'derived_context') {
    const derived = isRecordValue(content.derived_context) ? content.derived_context : {};
    const key = binding.key || binding.field || '';
    return key ? derived[key] : undefined;
  }
  if (binding.source_type === 'attachment') {
    const attachments = isRecordValue(content.attachments) ? content.attachments : {};
    const key = binding.key || binding.field || '';
    return key ? attachments[key] : undefined;
  }
  const key = binding.field || binding.column_name || binding.key || '';
  return key ? content[key] : undefined;
}

function reviewMediaRefMatchesBinding(item: unknown, binding: DataBindingPayload) {
  if (!isRecordValue(item)) return false;
  if (binding.media_type && normalizeReviewMediaKind(item.type || item.media_type) !== normalizeReviewMediaKind(binding.media_type)) return false;
  if (binding.field) return item.field === binding.field;
  if (binding.role && item.role !== binding.role) return false;
  return true;
}

function normalizeReviewMediaKind(value: unknown) {
  const raw = String(value || '').toLowerCase();
  if (raw.includes('image')) return 'image';
  if (raw.includes('audio')) return 'audio';
  if (raw.includes('video')) return 'video';
  if (raw.includes('document')) return 'document';
  return raw || 'file';
}

function inferReviewValueType(value: unknown) {
  const media = resolveWorkspaceMediaPreviewValue(value);
  if (media) return media.kind === 'file' ? '文件' : reviewFieldTypeLabel(`${media.kind}Upload`);
  if (isImageMaskAnswerValue(value)) return '图片 Mask';
  if (Array.isArray(value)) return '列表';
  if (isRecordValue(value)) return '结构化';
  if (typeof value === 'number') return '数字';
  if (typeof value === 'boolean') return '布尔';
  return '文本';
}

function diffCopyForRound(round: number | null | undefined) {
  if (!round || round <= 1) {
    return {
      title: '第一轮原始填写内容',
      previousTitle: '草稿/填写过程',
      currentTitle: '第一轮提交',
    };
  }
  return {
    title: `第 ${round} 轮与上一轮差异`,
    previousTitle: '上一轮',
    currentTitle: `第 ${round} 轮提交`,
  };
}

function extractAiReviewComment(selectedItem: ReviewQueueItem | null | undefined, selectedAi: ReviewSubmissionDetail['ai_review'] | ReviewQueueItem['ai_review'] | null | undefined) {
  const result = selectedAi?.result ?? {};
  const candidates = [
    selectedItem?.ai_reason,
    result.reason,
    result.comment,
    result.summary,
    result.review_comment,
    result.feedback,
    result.suggestion_reason,
  ];
  const found = candidates.find((item) => typeof item === 'string' && item.trim());
  return found ? String(found) : '';
}

function extractAiReviewActions(selectedAi: ReviewSubmissionDetail['ai_review'] | ReviewQueueItem['ai_review'] | null | undefined): string[] {
  const result = selectedAi?.result ?? {};
  const raw = result.suggested_actions ?? result.actions ?? result.suggestions;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 6);
}

function isImageMaskAnswerValue(value: unknown) {
  return isRecordValue(value) && (value.type === 'image_mask_annotation' || Array.isArray(value.annotations));
}

interface ReviewDiffValueOptions {
  compareLeftValue?: unknown;
  compareRightValue?: unknown;
  compareLeftTitle?: string;
  compareRightTitle?: string;
}

function ReviewImageMaskDiffValue({
  value,
  detail,
  component,
  field,
  label,
  compareLeftValue,
  compareRightValue,
  compareLeftTitle = '上一轮',
  compareRightTitle = '本轮提交',
}: {
  value: unknown;
  detail: ReviewSubmissionDetail | null;
  component: TemplateComponentSchema | null;
  field: string;
  label: string;
} & ReviewDiffValueOptions) {
  const [compareOpen, setCompareOpen] = useState(false);
  if (answerValueIsEmpty(value)) return <Typography.Text type="secondary">未填写</Typography.Text>;
  const canCompare = !answerValueIsEmpty(compareLeftValue) || !answerValueIsEmpty(compareRightValue);
  const renderMaskPreview = (nextValue: unknown) => <ReviewMaskPreview value={nextValue} detail={detail} component={component} field={field} label={label} />;
  return (
    <div className="review-diff-mask-preview">
      {canCompare ? (
        <Tooltip title="左右放大对比">
          <Button
            aria-label="左右放大对比"
            className="review-diff-mask-compare-button"
            icon={<SwapOutlined />}
            size="small"
            type="text"
            onClick={() => setCompareOpen(true)}
          />
        </Tooltip>
      ) : null}
      <ReviewMaskPreview value={value} detail={detail} component={component} field={field} label={label} />
      <Modal
        centered
        className="review-mask-compare-modal"
        footer={null}
        open={compareOpen}
        title={`${label} 左右放大对比`}
        width="min(1280px, calc(100vw - 48px))"
        onCancel={() => setCompareOpen(false)}
      >
        <div className="review-mask-compare-grid">
          <section className="review-mask-compare-panel">
            <Typography.Text strong>{compareLeftTitle}</Typography.Text>
            {renderMaskPreview(compareLeftValue)}
          </section>
          <section className="review-mask-compare-panel">
            <Typography.Text strong>{compareRightTitle}</Typography.Text>
            {renderMaskPreview(compareRightValue)}
          </section>
        </div>
      </Modal>
    </div>
  );
}

function ReviewMaskPreview({
  value,
  detail,
  component,
  field,
  label,
}: {
  value: unknown;
  detail: ReviewSubmissionDetail | null;
  component: TemplateComponentSchema | null;
  field: string;
  label: string;
}) {
  if (answerValueIsEmpty(value)) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未填写" />;
  const answer = normalizeReviewMaskAnswer(value);
  const imageSource = reviewImageCandidateFromValue(answer.image_source) || resolveReviewMaskSource(component, detail?.question.content ?? {}, field, detail?.task.component_bindings);
  const imageUrl = reviewImageSourceUrl(imageSource);
  if (!imageUrl) {
    return (
      <div className="review-mask-lite is-empty">
        <Tag color="orange">未找到底图</Tag>
        {renderStructuredDiffValue(value)}
      </div>
    );
  }
  return (
    <div className="review-mask-lite" aria-label={`${label} mask 预览`}>
      <img src={imageUrl} alt={`${label} 标注底图`} draggable={false} />
      <svg className="review-mask-lite-overlay" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
        {answer.annotations.map((annotation, index) => renderReviewMaskAnnotation(annotation, index))}
      </svg>
      <Tag className="review-mask-lite-count" color="blue">{answer.annotations.length} 个标注</Tag>
    </div>
  );
}

function renderImageMaskDiffValue(value: unknown, detail: ReviewSubmissionDetail | null, component: TemplateComponentSchema | null, field: string, label: string, options: ReviewDiffValueOptions = {}) {
  if (answerValueIsEmpty(value)) return <Typography.Text type="secondary">未填写</Typography.Text>;
  return (
    <ReviewImageMaskDiffValue
      value={value}
      detail={detail}
      component={component}
      field={field}
      label={label}
      {...options}
    />
  );
}

type ReviewMaskAnnotation =
  | { id?: string; type: 'rect'; x: number; y: number; width: number; height: number; label?: string }
  | { id?: string; type: 'brush'; points: Array<{ x: number; y: number }>; strokeWidth?: number; label?: string };

function normalizeReviewMaskAnswer(value: unknown): { image_source?: unknown; annotations: ReviewMaskAnnotation[] } {
  if (!isRecordValue(value)) return { annotations: [] };
  return {
    image_source: value.image_source,
    annotations: Array.isArray(value.annotations) ? value.annotations.filter(isReviewMaskAnnotation) : [],
  };
}

function isReviewMaskAnnotation(value: unknown): value is ReviewMaskAnnotation {
  if (!isRecordValue(value)) return false;
  if (value.type === 'rect') return ['x', 'y', 'width', 'height'].every((key) => typeof value[key] === 'number');
  if (value.type === 'brush') return Array.isArray(value.points);
  return false;
}

function resolveReviewMaskSource(component: TemplateComponentSchema | null, content: Record<string, unknown>, field: string, componentBindings?: TaskPayload['component_bindings']): unknown {
  const taskBinding = component ? componentBindings?.[component.id]?.mask_image : null;
  if (taskBinding) {
    const value = resolveReviewBindingValue(taskBinding, content);
    return reviewImageCandidateFromValue(value);
  }
  const binding = isDataBindingPayload(component?.config.source_binding) ? component?.config.source_binding : null;
  if (binding) {
    const value = resolveReviewBindingValue(binding, content);
    const media = reviewImageCandidateFromValue(value);
    if (media) return media;
  }
  const sourceField = String(component?.config.source_field || component?.config.image_field || '').trim();
  if (sourceField) {
    const media = reviewImageCandidateFromValue(content[sourceField]);
    if (media) return media;
  }
  if (field) {
    const media = reviewImageCandidateFromValue(content[field]);
    if (media) return media;
  }
  const media = reviewImageCandidateFromValue(Array.isArray(content.media) ? content.media : []);
  if (media) return media;
  for (const [key, current] of Object.entries(content)) {
    if (key === 'media' || current == null) continue;
    const currentMedia = reviewImageCandidateFromValue(current);
    if (currentMedia) return currentMedia;
  }
  return null;
}

function reviewImageCandidateFromValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    for (const item of value) {
      const media = reviewImageCandidateFromValue(item);
      if (media) return media;
    }
    return null;
  }
  const media = resolveWorkspaceMediaPreviewValue(value);
  return media?.kind === 'image' ? media : null;
}

function reviewImageSourceUrl(source: unknown): string {
  if (!source) return '';
  if (typeof source === 'string') return source;
  if (isRecordValue(source)) {
    const media = resolveWorkspaceMediaPreviewValue(source);
    return String(media?.url || source.url || source.src || source.href || '');
  }
  return '';
}

function renderReviewMaskAnnotation(annotation: ReviewMaskAnnotation, index: number) {
  const key = annotation.id || `mask-${index}`;
  if (annotation.type === 'rect') {
    return (
      <rect
        key={key}
        x={annotation.x}
        y={annotation.y}
        width={annotation.width}
        height={annotation.height}
        fill="#2563eb"
        fillOpacity={0.32}
        stroke="#2563eb"
        strokeWidth={0.004}
      />
    );
  }
  return (
    <polyline
      key={key}
      points={annotation.points.map((point) => `${point.x},${point.y}`).join(' ')}
      fill="none"
      stroke="#2563eb"
      strokeOpacity={0.72}
      strokeWidth={typeof annotation.strokeWidth === 'number' ? annotation.strokeWidth : 0.018}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function renderReviewDiffValue(value: unknown, detail: ReviewSubmissionDetail | null, field: string, options: ReviewDiffValueOptions = {}) {
  if (answerValueIsEmpty(value)) return <Typography.Text type="secondary">未填写</Typography.Text>;
  const component = componentForField(detail, field);
  const label = component?.label || field;
  if (component?.type === 'ImageMaskAnnotation' || isImageMaskAnswerValue(value)) {
    return renderImageMaskDiffValue(value, detail, component, field, label, options);
  }
  const media = resolveWorkspaceMediaPreviewValue(value);
  if (media) {
    return <WorkspaceMediaPreview value={media} mode="inline" compact showUrl={false} showActions={false} className="review-diff-media-preview" />;
  }
  if (typeof value === 'string') {
    if (isBase64DataUrl(value) || isLikelyLongBase64(value)) {
      if (isBase64DataUrl(value)) {
        const mediaValue = resolveWorkspaceMediaPreviewValue(value);
        if (mediaValue) return <WorkspaceMediaPreview value={mediaValue} mode="inline" compact showUrl={false} showActions={false} className="review-diff-media-preview" />;
      }
      return <Tag color="default">{summarizeHiddenBinary(value)}</Tag>;
    }
    return <Typography.Paragraph className="review-diff-text-value">{value}</Typography.Paragraph>;
  }
  if (Array.isArray(value)) {
    const mediaItems = value.map(resolveWorkspaceMediaPreviewValue).filter(Boolean);
    if (mediaItems.length === value.length && mediaItems.length > 0) {
      return (
        <Space direction="vertical" size={8} className="review-diff-media-list">
          {mediaItems.map((item, index) => (
            <WorkspaceMediaPreview key={`${item?.url || index}`} value={item} mode="inline" compact showUrl={false} showActions={false} className="review-diff-media-preview" />
          ))}
        </Space>
      );
    }
    return renderStructuredDiffValue(value);
  }
  if (isRecordValue(value)) {
    const objectMedia = resolveWorkspaceMediaPreviewValue(value);
    if (objectMedia) return <WorkspaceMediaPreview value={objectMedia} mode="inline" compact showUrl={false} showActions={false} className="review-diff-media-preview" />;
    return renderStructuredDiffValue(value);
  }
  return <Typography.Text>{String(value)}</Typography.Text>;
}

function renderReviewAuditValue(row: ReviewAuditTableRow, detail: ReviewSubmissionDetail | null) {
  const optionLabel = (value: unknown) => row.options?.find((item) => item.value === String(value))?.label || String(value);
  if (row.options?.length && Array.isArray(row.value)) {
    if (!row.value.length) return <Typography.Text type="secondary">未填写</Typography.Text>;
    return (
      <Space size={[4, 4]} wrap>
        {row.value.map((item, index) => <Tag color="blue" key={`${row.field}-${index}-${String(item)}`}>{optionLabel(item)}</Tag>)}
      </Space>
    );
  }
  if (row.options?.length && !answerValueIsEmpty(row.value) && (typeof row.value === 'string' || typeof row.value === 'number' || typeof row.value === 'boolean')) {
    return <Tag color="blue">{optionLabel(row.value)}</Tag>;
  }
  return renderReviewDiffValue(row.value, detail, row.field);
}

function formatTime(value?: string | null) {
  return formatApiDateTime(value);
}

function formatShortReviewId(value?: string | null) {
  if (!value) return '-';
  return value.length > 10 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function formatCompactReviewActor(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '系统';
  if (/^(AI Agent|系统|Labeler)$/i.test(raw)) return raw;
  if (raw.includes('@')) {
    const [name] = raw.split('@');
    return name.length > 14 ? `${name.slice(0, 12)}...` : name;
  }
  const looksLikeSystemId = /^[a-f0-9]{24}$/i.test(raw)
    || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)
    || /^(user|labeler|reviewer|admin|operator|team|task|submission)[-_]/i.test(raw)
    || raw.length > 22;
  if (looksLikeSystemId) return `账号 ${formatShortReviewId(raw)}`;
  return raw.length > 16 ? `${raw.slice(0, 14)}...` : raw;
}

function formatCompactQueueLabeler(item: ReviewQueueItem) {
  if (item.labeler_name) return item.labeler_name.length > 12 ? `${item.labeler_name.slice(0, 10)}...` : item.labeler_name;
  return `标注员 ${formatShortReviewId(item.labeler_id)}`;
}

function formatAiScore(value?: string | number | null) {
  if (value === undefined || value === null || value === '') return '-';
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return `${Math.round(numeric)}`;
  return String(value);
}

function formatAiDimensionReason(record: Record<string, unknown>) {
  const value = record.reason ?? record.comment ?? record.explanation ?? record.summary;
  if (value === undefined || value === null || value === '') return '-';
  return String(value);
}

function stringConfigValue(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function resolveTaskAiProvider(task: TaskPayload | null | undefined, providers: AiProviderConfigPayload[]) {
  const aiConfig = task?.ai_config ?? {};
  const providerId = stringConfigValue(aiConfig.provider_id) || stringConfigValue(aiConfig.providerId);
  const provider = providerId ? providers.find((item) => item.provider_id === providerId) : undefined;
  const providerName = provider?.provider_name
    || provider?.route_name
    || stringConfigValue(aiConfig.provider_name)
    || stringConfigValue(aiConfig.route_name)
    || provider?.provider_kind
    || provider?.provider
    || providerId
    || '未配置 Provider';
  const modelName = provider?.model_id
    || provider?.default_model
    || stringConfigValue(aiConfig.model)
    || stringConfigValue(aiConfig.model_id)
    || '未配置模型';
  return {
    provider,
    providerName,
    modelName,
  };
}

function queueTitle(filter: AiQueueFilter, status: QueueStatusFilter) {
  if (status === 'processed') return '已处理提交';
  if (filter === 'all') return '待审核提交';
  return aiSuggestionLabels[filter]?.label ?? '待人工审核';
}

function queueItemMatchesKeyword(item: ReviewQueueItem, keyword: string) {
  const text = keyword.trim().toLowerCase();
  if (!text) return true;
  return [
    item.submission_id,
    item.task_title,
    item.labeler_id,
    item.labeler_name,
    item.title,
    item.summary,
    item.ai_reason,
    ...(item.tags ?? []),
    ...(item.risk_flags ?? []),
  ].some((value) => String(value ?? '').toLowerCase().includes(text));
}

interface ReviewAssistanceTaskGroup {
  task_id: string;
  task_title: string;
  submission_ids: string[];
}

type ReviewTaskStatusFilter = 'all' | 'pending' | 'processed';

interface ReviewTaskGroup {
  task_id: string;
  task_title: string;
  total: number;
  pending: number;
  processed: number;
  approved: number;
  rejected: number;
  pass: number;
  manual: number;
  reject: number;
  aiPending: number;
  aiProcessing: number;
  aiCompleted: number;
  aiFailed: number;
  firstRound: number;
  reReview: number;
  finalReview: number;
  labelers: Set<string>;
  responsibleReviewers: Map<string, string>;
  latestAt?: string | null;
  rounds: Set<number>;
  tags: string[];
}

function buildReviewAssistanceTaskGroups(items: ReviewQueueItem[], selectedRowKeys: Key[]): ReviewAssistanceTaskGroup[] {
  const selectedIds = new Set(selectedRowKeys.map((key) => String(key)));
  const groups = new Map<string, ReviewAssistanceTaskGroup>();
  items.forEach((item) => {
    if (!selectedIds.has(item.submission_id)) return;
    const group = groups.get(item.task_id);
    if (group) {
      group.submission_ids.push(item.submission_id);
      return;
    }
    groups.set(item.task_id, {
      task_id: item.task_id,
      task_title: item.task_title,
      submission_ids: [item.submission_id],
    });
  });
  return Array.from(groups.values());
}

function reviewTaskGroupMatchesKeyword(group: ReviewTaskGroup, keyword: string) {
  const text = keyword.trim().toLowerCase();
  if (!text) return true;
  return [
    group.task_id,
    group.task_title,
    ...Array.from(group.responsibleReviewers.values()),
    ...group.tags,
  ].some((value) => String(value ?? '').toLowerCase().includes(text));
}

function buildReviewTaskGroups(items: ReviewQueueItem[]): ReviewTaskGroup[] {
  const groups = new Map<string, ReviewTaskGroup>();
  items.forEach((item) => {
    const group = groups.get(item.task_id) ?? {
      task_id: item.task_id,
      task_title: item.task_title,
      total: 0,
      pending: 0,
      processed: 0,
      approved: 0,
      rejected: 0,
      pass: 0,
      manual: 0,
      reject: 0,
      aiPending: 0,
      aiProcessing: 0,
      aiCompleted: 0,
      aiFailed: 0,
      firstRound: 0,
      reReview: 0,
      finalReview: 0,
      labelers: new Set<string>(),
      responsibleReviewers: new Map<string, string>(),
      latestAt: null,
      rounds: new Set<number>(),
      tags: [],
    };
    group.total += 1;
    if (item.status === 'submitted') group.pending += 1;
    else group.processed += 1;
    if (item.status === 'approved') group.approved += 1;
    if (item.status === 'rejected') group.rejected += 1;
    const suggestion = item.ai_suggestion === 'pass' || item.ai_suggestion === 'reject' ? item.ai_suggestion : 'manual';
    group[suggestion] += 1;
    if (item.ai_status === 'pending') group.aiPending += 1;
    if (item.ai_status === 'processing') group.aiProcessing += 1;
    if (item.ai_status === 'completed') group.aiCompleted += 1;
    if (item.ai_status === 'failed') group.aiFailed += 1;
    if (item.current_round <= 1) group.firstRound += 1;
    else if (item.current_round === 2) group.reReview += 1;
    else group.finalReview += 1;
    if (item.labeler_id) group.labelers.add(item.labeler_id);
    const reviewers = item.responsible_reviewers?.length
      ? item.responsible_reviewers.map((reviewer) => ({ id: reviewer.user_id, name: reviewer.display_name || reviewer.email || reviewer.user_id }))
      : (item.responsible_reviewer_ids ?? []).map((id, index) => ({ id, name: item.responsible_reviewer_names?.[index] || id }));
    reviewers.forEach((reviewer) => {
      if (reviewer.id) group.responsibleReviewers.set(reviewer.id, reviewer.name);
    });
    if (item.current_round) group.rounds.add(item.current_round);
    const latestAt = item.updated_at || item.submitted_at || null;
    if (latestAt && (!group.latestAt || latestAt > group.latestAt)) group.latestAt = latestAt;
    group.tags = Array.from(new Set([...group.tags, ...(item.tags ?? [])])).slice(0, 6);
    groups.set(item.task_id, group);
  });
  return Array.from(groups.values()).sort((left, right) => String(right.latestAt || '').localeCompare(String(left.latestAt || '')));
}

function reviewTaskGroupVisibleByStatus(group: ReviewTaskGroup, status: ReviewTaskStatusFilter) {
  if (status === 'pending') return group.pending > 0;
  if (status === 'processed') return group.processed > 0;
  return true;
}

function reviewTaskRoundLabel(rounds: Set<number>) {
  const values = Array.from(rounds).sort((left, right) => left - right);
  return values.length ? values.join(' / ') : '-';
}

function reviewTaskResponsibleLabel(group: ReviewTaskGroup) {
  const names = Array.from(group.responsibleReviewers.values()).filter(Boolean);
  if (!names.length) return '未指定责任人';
  if (names.length <= 2) return names.join('、');
  return `${names.slice(0, 2).join('、')} 等 ${names.length} 人`;
}

function reviewTaskProgressPercent(group: ReviewTaskGroup) {
  return group.total > 0 ? Math.round((group.processed / group.total) * 100) : 0;
}

function reviewTaskRoundDetail(group: ReviewTaskGroup) {
  return [
    group.firstRound ? `初审 ${group.firstRound}` : null,
    group.reReview ? `复审 ${group.reReview}` : null,
    group.finalReview ? `终审 ${group.finalReview}` : null,
  ].filter(Boolean).join(' / ') || '暂无轮次';
}

function reviewTaskAiStatusDetail(group: ReviewTaskGroup) {
  return [
    group.aiCompleted ? `完成 ${group.aiCompleted}` : null,
    group.aiPending ? `待处理 ${group.aiPending}` : null,
    group.aiProcessing ? `处理中 ${group.aiProcessing}` : null,
    group.aiFailed ? `失败 ${group.aiFailed}` : null,
  ].filter(Boolean).join(' / ') || '无 AI 预审';
}

function reviewerMemberLabel(member: TeamMember) {
  return member.display_name || member.username || member.email || member.user_id;
}

function reviewRoundViewLabel(round: number | null | undefined) {
  if (!round || round <= 0) return '未选择轮次视角';
  if (round === 1) return '第一轮初审视角';
  if (round === 2) return '第二轮复审视角';
  return `第 ${round} 轮审核视角`;
}

function reviewStageFromRound(round: number | null | undefined): 'all_stages' | 'initial_review' | 're_review' | 'final_review' {
  if (!round || round <= 0) return 'all_stages';
  if (round === 1) return 'initial_review';
  if (round === 2) return 're_review';
  return 'final_review';
}

function timelineItemColor(decision?: string | null) {
  if (decision === 'approved' || decision === 'revise') return 'green';
  if (decision === 'rejected') return 'red';
  return 'blue';
}

function buildReviewAuditRoundGroups({
  historyItems,
  detail,
  selectedItem,
  selectedAi,
}: {
  historyItems: ReviewAuditTimelineItem[];
  detail: ReviewSubmissionDetail | null;
  selectedItem?: ReviewQueueItem | null;
  selectedAi?: ReviewSubmissionDetail['ai_review'] | ReviewQueueItem['ai_review'] | null;
}): ReviewAuditRoundGroup[] {
  const rounds = new Set<number>();
  historyItems.forEach((item) => rounds.add(Number(item.round || 1)));
  const currentRound = Number(detail?.submission.current_round || selectedItem?.current_round || 0);
  if (currentRound > 0) rounds.add(currentRound);
  if (!rounds.size) return [];

  return Array.from(rounds)
    .sort((left, right) => left - right)
    .map((round) => {
      const items: ReviewAuditRoundGroup['items'] = [];
      if (round === currentRound && detail) {
        items.push({
          key: `submission-${detail.submission.submission_id}-${round}`,
          actor: selectedItem?.labeler_name || selectedItem?.labeler_id || detail.submission.labeler_id || 'Labeler',
          time: formatTime(selectedItem?.submitted_at || detail.submission.updated_at || detail.submission.created_at),
          action: `第 ${round} 轮提交`,
          note: formatReviewSummaryText(selectedItem?.summary, '提交当前轮次答案'),
        });
        if (selectedAi) {
          items.push({
            key: `ai-${selectedAi.job_id}-${round}`,
            actor: 'AI Agent',
            time: formatTime(selectedAi.updated_at || selectedAi.created_at),
            action: `${aiReviewStatusLabels[selectedAi.status] || selectedAi.status} · AI ${formatAiScore(selectedItem?.ai_score)} · ${aiSuggestionLabels[selectedItem?.ai_suggestion || 'manual']?.label ?? '待人工审核'}`,
            note: selectedItem?.ai_reason || undefined,
          });
        }
      }
      historyItems
        .filter((item) => Number(item.round || 1) === round)
        .forEach((item) => {
          items.push({
            key: item.history_id,
            actor: item.operator_name || item.operator_id || '系统',
            time: formatTime(item.created_at),
            action: decisionLabels[item.decision || ''] || item.action,
            note: item.comment || undefined,
            decision: item.decision,
          });
        });
      return {
        round,
        title: reviewRoundViewLabel(round),
        items,
      };
    });
}

export function ReviewQueuePage({
  user,
  onBreadcrumbTailChange,
}: {
  user: ApiUser;
  onBreadcrumbTailChange?: (tail: AppShellBreadcrumbItem | null) => void;
}) {
  const [teamId, setTeamId] = useState<string | undefined>(() => user.team_id || user.default_team_id || undefined);
  const [queue, setQueue] = useState<ReviewQueueResponse>(emptyQueue);
  const [submittedQueue, setSubmittedQueue] = useState<ReviewQueueResponse>(emptyQueue);
  const [taskSubmittedQueue, setTaskSubmittedQueue] = useState<ReviewQueueResponse>(emptyQueue);
  const [taskProcessedQueue, setTaskProcessedQueue] = useState<ReviewQueueResponse>(emptyQueue);
  const [stats, setStats] = useState<ReviewStatsResponse | null>(null);
  const [detail, setDetail] = useState<ReviewSubmissionDetail | null>(null);
  const [history, setHistory] = useState<ReviewHistoryResponse | null>(null);
  const [diff, setDiff] = useState<ReviewDiffResponse | null>(null);
  const [aiProviders, setAiProviders] = useState<AiProviderConfigPayload[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskStatusFilter, setTaskStatusFilter] = useState<ReviewTaskStatusFilter>('all');
  const [taskViewMode, setTaskViewMode] = useState<ReviewTaskViewMode>('table');
  const [activeFilter, setActiveFilter] = useState<AiQueueFilter>('all');
  const [queueStatus, setQueueStatus] = useState<QueueStatusFilter>('submitted');
  const [keyword, setKeyword] = useState('');
  const [selectedReviewRound, setSelectedReviewRound] = useState<number | null>(null);
  const [headingCollapsed, setHeadingCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reviewComment, setReviewComment] = useState('');
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [assistOpen, setAssistOpen] = useState(false);
  const [assistSubmitting, setAssistSubmitting] = useState(false);
  const [assistTargetReviewerId, setAssistTargetReviewerId] = useState<string | undefined>();
  const [assistReason, setAssistReason] = useState('');
  const [reviewerMembers, setReviewerMembers] = useState<TeamMember[]>([]);
  const [reviewerLoading, setReviewerLoading] = useState(false);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reviseInitialValues, setReviseInitialValues] = useState<ReviseFormValues>({ answers: {} });
  const [reviseComment, setReviseComment] = useState('');
  const [reviseCommentError, setReviseCommentError] = useState<string | null>(null);
  const [reviseSubmitting, setReviseSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messageApi, messageContextHolder] = antdMessage.useMessage({ duration: 5, maxCount: 3, top: 76 });
  const [batchForm] = Form.useForm<{ decision: ReviewDecision; comment?: string }>();
  const [reviseForm] = Form.useForm<ReviseFormValues>();

  useEffect(() => {
    if (!error) return;
    messageApi.open({ type: 'error', content: error, duration: 5 });
    setError(null);
  }, [error, messageApi]);

  useEffect(() => {
    if (!message) return;
    messageApi.open({ type: 'success', content: message, duration: 5 });
    setMessage(null);
  }, [message, messageApi]);

  const enterprise = ['admin', 'platform_admin', 'owner', 'team_admin'].includes(user.role)
    || user.permissions.includes('team:create')
    || user.permissions.includes('team:manage');
  const canSubmitReview = user.permissions.includes('review:submit') && user.team_role === 'reviewer';
  const assignedOnly = canSubmitReview;
  const canRequestAssistance = user.permissions.includes('task:manage')
    || (user.permissions.includes('submission:view') && (user.team_role === 'reviewer' || user.role === 'reviewer'));

  const loadQueue = useCallback(async (
    nextTeamId = teamId,
    filter = activeFilter,
    searchText = keyword,
    status = queueStatus,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const queueParams = {
        assigned_only: assignedOnly,
        status,
        stage: 'all_stages' as const,
        ai_suggestion: status === 'submitted' && filter !== 'all' ? filter : undefined,
        keyword: searchText.trim() || undefined,
      };
      const [nextQueue, nextSubmittedQueue, nextTaskSubmittedQueue, nextTaskProcessedQueue, nextStats] = await Promise.all([
        getReviewQueue(nextTeamId, queueParams),
        getReviewQueue(nextTeamId, {
          assigned_only: assignedOnly,
          status: 'submitted',
          stage: reviewStageFromRound(selectedReviewRound),
          keyword: searchText.trim() || undefined,
        }),
        getReviewQueue(nextTeamId, {
          assigned_only: assignedOnly,
          status: 'submitted',
          stage: 'all_stages',
        }),
        getReviewQueue(nextTeamId, {
          assigned_only: assignedOnly,
          status: 'processed',
          stage: 'all_stages',
        }),
        getReviewStats(nextTeamId, { assigned_only: assignedOnly }),
      ]);
      setQueue(nextQueue);
      setSubmittedQueue(nextSubmittedQueue);
      setTaskSubmittedQueue(nextTaskSubmittedQueue);
      setTaskProcessedQueue(nextTaskProcessedQueue);
      setStats(nextStats);
      setSelectedRowKeys((keys) => keys.filter((key) => nextQueue.items.some((item) => item.submission_id === key)));
      if (selectedId && !nextQueue.items.some((item) => item.submission_id === selectedId)) {
        setSelectedId(null);
        setDetail(null);
        setHistory(null);
        setDiff(null);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '审核队列加载失败');
    } finally {
      setLoading(false);
    }
  }, [activeFilter, assignedOnly, keyword, queueStatus, selectedId, selectedReviewRound, teamId]);

  useEffect(() => {
    let ignore = false;
    async function bootstrap() {
      if (!enterprise) {
        const scopedTeamId = teamId || user.team_id || user.default_team_id;
        if (!scopedTeamId) {
          setError('审核队列需要当前账号加入一个企业；当前账号没有可用企业作用域。');
          setQueue(emptyQueue);
          setSubmittedQueue(emptyQueue);
          setStats(null);
          return;
        }
        setTeamId(scopedTeamId);
        await loadQueue(scopedTeamId);
        return;
      }
      try {
        const overview = await getAdminOverview();
        const nextTeamId = overview.default_team_id || overview.teams[0]?.team_id;
        if (ignore) return;
        if (!nextTeamId) {
          setTeamId(undefined);
          setError('审核队列需要当前账号加入一个企业企业；当前管理员账号没有可用企业作用域。');
          setQueue(emptyQueue);
          setSubmittedQueue(emptyQueue);
          setStats(null);
          return;
        }
        setTeamId(nextTeamId);
        await loadQueue(nextTeamId);
      } catch (err) {
        if (!ignore) setError(err instanceof ApiClientError ? err.message : '企业信息加载失败');
      }
    }
    void bootstrap();
    return () => {
      ignore = true;
    };
  }, [enterprise, loadQueue]);

  useEffect(() => {
    const activeTeamId = teamId || detail?.task.team_id;
    if (!activeTeamId) return;
    let ignore = false;
    listAiProviderConfigs(activeTeamId)
      .then((payload) => {
        if (!ignore) setAiProviders(payload.items ?? []);
      })
      .catch(() => {
        if (!ignore) setAiProviders([]);
      });
    return () => {
      ignore = true;
    };
  }, [detail?.task.team_id, teamId]);

  useEffect(() => {
    if (!assistOpen || !teamId) return;
    let ignore = false;
    setReviewerLoading(true);
    getTeamMembers(teamId, { role: 'reviewer', status: 'active' })
      .then((payload) => {
        if (ignore) return;
        setReviewerMembers(Array.isArray(payload.items) ? payload.items : []);
      })
      .catch(() => {
        if (ignore) return;
        setReviewerMembers([]);
      })
      .finally(() => {
        if (!ignore) setReviewerLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [assistOpen, teamId]);

  const openDetail = useCallback(async (submissionId: string) => {
    setSelectedId(submissionId);
    setDetailLoading(true);
    setError(null);
    setReviewComment('');
    setHistory(null);
    setDiff(null);
    setSelectedReviewRound(null);
    try {
      const [nextDetail, nextHistory, nextDiff] = await Promise.all([
        getReviewSubmission(teamId, submissionId, { assigned_only: assignedOnly }),
        getReviewHistory(teamId, submissionId, { assigned_only: assignedOnly }),
        getReviewDiff(teamId, submissionId, { assigned_only: assignedOnly }),
      ]);
      setDetail(nextDetail);
      setHistory(nextHistory);
      setDiff(nextDiff);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '审核详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  }, [assignedOnly, teamId]);

  const filteredQueueItems = useMemo(
    () => queue.items.filter((item) => (
      (!selectedTaskId || item.task_id === selectedTaskId)
      && queueItemMatchesKeyword(item, keyword)
    )),
    [keyword, queue.items, selectedTaskId],
  );

  useEffect(() => {
    if (!selectedTaskId || selectedId || !filteredQueueItems.length) return;
    const timer = window.setTimeout(() => {
      void openDetail(filteredQueueItems[0].submission_id);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [filteredQueueItems, openDetail, selectedId, selectedTaskId]);

  const refresh = () => void loadQueue(teamId, activeFilter, keyword, queueStatus);

  const submitDecision = async (decision: ReviewDecision) => {
    if (!selectedId) return;
    if (!canSubmitReview) {
      setError('当前账号不可提交审核结果');
      return;
    }
    if (decision === 'rejected' && !reviewComment.trim()) {
      setError('打回必须填写原因');
      return;
    }
    const values = { decision, comment: reviewComment.trim() || undefined };
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const nextDetail = await submitReviewDecision(teamId, selectedId, values);
      setDetail(nextDetail);
      const [nextHistory, nextDiff] = await Promise.all([
        getReviewHistory(teamId, selectedId, { assigned_only: assignedOnly }),
        getReviewDiff(teamId, selectedId, { assigned_only: assignedOnly }),
      ]);
      setHistory(nextHistory);
      setDiff(nextDiff);
      setMessage(`审核已${decisionLabels[values.decision]}`);
      await loadQueue(teamId, activeFilter, keyword, queueStatus);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '审核提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const openReviseModal = () => {
    if (!detail) return;
    if (!canSubmitReview) {
      setError('当前账号不可提交审核结果');
      return;
    }
    const answerValues = buildReviewAnswerFields(detail).reduce<Record<string, unknown>>((acc, item) => {
      acc[item.field] = formatAnswerValue(item.value);
      return acc;
    }, {});
    setReviseInitialValues({
      answers: answerValues,
    });
    setReviseComment('');
    setReviseCommentError(null);
    setReviseOpen(true);
  };

  useEffect(() => {
    if (!reviseOpen) return;
    reviseForm.setFieldsValue(reviseInitialValues);
  }, [reviseForm, reviseInitialValues, reviseOpen]);

  const submitReviseDecision = async () => {
    if (!selectedId) return;
    if (!canSubmitReview) {
      setError('当前账号不可提交审核结果');
      return;
    }
    let values: ReviseFormValues;
    try {
      values = await reviseForm.validateFields();
    } catch {
      return;
    }
    const comment = reviseComment.trim();
    if (!comment) {
      const nextError = '直接修订必须填写修订说明';
      setReviseCommentError(nextError);
      setError(nextError);
      return;
    }
    const fields = buildReviewAnswerFields(detail);
    const revisedAnswers: Record<string, unknown> = {};
    const fieldErrors: Array<{ name: ['answers', string]; errors: string[] }> = [];
    fields.forEach((field) => {
      const value = values.answers?.[field.field];
      if (field.structured) {
        try {
          revisedAnswers[field.field] = value === '' || value === undefined || value === null ? null : JSON.parse(String(value));
        } catch {
          fieldErrors.push({ name: ['answers', field.field], errors: ['请输入合法 JSON'] });
        }
        return;
      }
      revisedAnswers[field.field] = value;
    });
    if (fieldErrors.length) {
      reviseForm.setFields(fieldErrors);
      return;
    }
    setReviseSubmitting(true);
    setReviseCommentError(null);
    setError(null);
    setMessage(null);
    try {
      const nextDetail = await submitReviewDecision(teamId, selectedId, {
        decision: 'revise',
        comment,
        revised_answers: revisedAnswers,
      });
      setDetail(nextDetail);
      const [nextHistory, nextDiff] = await Promise.all([
        getReviewHistory(teamId, selectedId, { assigned_only: assignedOnly }),
        getReviewDiff(teamId, selectedId, { assigned_only: assignedOnly }),
      ]);
      setHistory(nextHistory);
      setDiff(nextDiff);
      setReviseOpen(false);
      setMessage('已完成直接修订并入库');
      await loadQueue(teamId, activeFilter, keyword, queueStatus);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '直接修订失败');
    } finally {
      setReviseSubmitting(false);
    }
  };

  const submitBatchDecision = async () => {
    if (!canSubmitReview) {
      setError('当前账号不可提交审核结果');
      return;
    }
    const values = await batchForm.validateFields();
    setBatchSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const result = await submitBatchReviewDecision(teamId, {
        submission_ids: selectedRowKeys.map(String),
        decision: values.decision,
        comment: values.comment,
      });
      setMessage(`批量审核完成：成功 ${result.success_count} 条，失败 ${result.failed_count} 条`);
      setBatchOpen(false);
      setSelectedRowKeys([]);
      await loadQueue(teamId, activeFilter, keyword, queueStatus);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '批量审核失败');
    } finally {
      setBatchSubmitting(false);
    }
  };

  const submitAssistanceRequest = async () => {
    if (!teamId || !selectedAssistanceTaskGroups.length || !assistTargetReviewerId) return;
    setAssistSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const results = await Promise.allSettled(selectedAssistanceTaskGroups.map((group) => requestTaskAssistance(teamId, group.task_id, {
        target_reviewer_id: assistTargetReviewerId,
        submission_ids: group.submission_ids,
        reason: assistReason.trim() || undefined,
      })));
      const successCount = results.filter((result) => result.status === 'fulfilled').length;
      const failedCount = results.length - successCount;
      const targetReviewer = reviewerMembers.find((member) => member.user_id === assistTargetReviewerId);
      if (!successCount) {
        setError('请求协助失败');
        return;
      }
      setAssistOpen(false);
      setAssistTargetReviewerId(undefined);
      setAssistReason('');
      setSelectedRowKeys([]);
      await loadQueue(teamId, activeFilter, keyword, queueStatus);
      setMessage(`已请求 ${targetReviewer ? reviewerMemberLabel(targetReviewer) : 'Reviewer'} 协助 ${successCount} 个任务${failedCount ? `，失败 ${failedCount} 个` : ''}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '请求协助失败');
    } finally {
      setAssistSubmitting(false);
    }
  };

  const openAssistanceModal = () => {
    if (!selectedAssistanceTaskGroups.length) return;
    setAssistTargetReviewerId(reviewerOptions[0]?.value);
    setAssistReason('');
    setAssistOpen(true);
  };

  const reviewTaskGroups = useMemo(
    () => buildReviewTaskGroups([...taskSubmittedQueue.items, ...taskProcessedQueue.items]),
    [taskProcessedQueue.items, taskSubmittedQueue.items],
  );

  const filteredReviewTaskGroups = useMemo(
    () => reviewTaskGroups.filter((group) => reviewTaskGroupVisibleByStatus(group, taskStatusFilter) && reviewTaskGroupMatchesKeyword(group, keyword)),
    [keyword, reviewTaskGroups, taskStatusFilter],
  );

  const selectedTaskGroup = useMemo(
    () => reviewTaskGroups.find((group) => group.task_id === selectedTaskId) ?? null,
    [reviewTaskGroups, selectedTaskId],
  );

  const selectedAssistanceTaskGroups = useMemo(
    () => buildReviewAssistanceTaskGroups(filteredQueueItems, selectedRowKeys),
    [filteredQueueItems, selectedRowKeys],
  );
  const reviewerOptions = useMemo(
    () => reviewerMembers
      .filter((member) => member.user_id !== user.user_id)
      .map((member) => ({ value: member.user_id, label: reviewerMemberLabel(member) })),
    [reviewerMembers, user.user_id],
  );

  useEffect(() => {
    if (assistOpen && !assistTargetReviewerId && reviewerOptions.length) {
      setAssistTargetReviewerId(reviewerOptions[0].value);
    }
  }, [assistOpen, assistTargetReviewerId, reviewerOptions]);

  const openTaskReviewQueue = useCallback((group: ReviewTaskGroup) => {
    const nextStatus: QueueStatusFilter = group.pending > 0 ? 'submitted' : 'processed';
    setSelectedTaskId(group.task_id);
    setQueueStatus(nextStatus);
    setActiveFilter('all');
    setSelectedId(null);
    setDetail(null);
    setHistory(null);
    setDiff(null);
    setSelectedRowKeys([]);
    setHeadingCollapsed(false);
    void loadQueue(teamId, 'all', keyword, nextStatus);
  }, [keyword, loadQueue, teamId]);

  const backToTaskList = useCallback(() => {
    setSelectedTaskId(null);
    setSelectedId(null);
    setDetail(null);
    setHistory(null);
    setDiff(null);
    setSelectedRowKeys([]);
    setHeadingCollapsed(false);
  }, []);

  const reviewTaskTableColumns = useMemo<ColumnsType<ReviewTaskGroup>>(
    () => [
      {
        title: '任务名称',
        dataIndex: 'task_title',
        key: 'task_title',
        width: 280,
        fixed: 'left',
        render: (_, group) => (
          <button type="button" className="review-task-title-button" onClick={() => openTaskReviewQueue(group)}>
            <strong>{group.task_title}</strong>
            <span>任务 ID {formatShortReviewId(group.task_id)}</span>
          </button>
        ),
      },
      {
        title: '状态',
        key: 'status',
        width: 110,
        render: (_, group) => (
          <Tag color={group.pending ? 'processing' : 'success'}>{group.pending ? '待审核' : '已处理'}</Tag>
        ),
      },
      {
        title: '责任人',
        key: 'responsibleReviewers',
        width: 180,
        render: (_, group) => (
          <span className="task-meta-stack review-task-owner-cell">
            <small>{reviewTaskResponsibleLabel(group)}</small>
            <small>{group.responsibleReviewers.size ? `${group.responsibleReviewers.size} 位 Reviewer` : '待分配 Reviewer'}</small>
          </span>
        ),
      },
      {
        title: '处理进度',
        key: 'progress',
        width: 210,
        render: (_, group) => {
          const progressPercent = reviewTaskProgressPercent(group);
          return (
            <span className="review-task-table-progress">
              <strong>{group.processed}/{group.total} 已处理 · {progressPercent}%</strong>
              <Progress
                percent={progressPercent}
                size="small"
                success={{ percent: group.total > 0 ? Math.round((group.approved / group.total) * 100) : 0 }}
              />
            </span>
          );
        },
      },
      {
        title: '条目状态',
        key: 'counts',
        width: 160,
        render: (_, group) => (
          <span className="task-meta-stack">
            <small>待审核 {group.pending}</small>
            <small>通过 {group.approved} / 打回 {group.rejected}</small>
          </span>
        ),
      },
      {
        title: 'AI 预审',
        key: 'ai_suggestions',
        width: 220,
        render: (_, group) => (
          <span className="task-meta-stack">
            <small>建议：通过 {group.pass} / 打回 {group.reject} / 人工 {group.manual}</small>
            <small>{reviewTaskAiStatusDetail(group)}</small>
          </span>
        ),
      },
      {
        title: 'Labeler / 轮次',
        key: 'labelers',
        width: 190,
        render: (_, group) => (
          <span className="task-meta-stack">
            <small>{group.labelers.size} 位 Labeler</small>
            <small>{reviewTaskRoundDetail(group)}</small>
          </span>
        ),
      },
      {
        title: '标签',
        key: 'tags',
        width: 180,
        render: (_, group) => (
          <Space size={[4, 4]} wrap>
            {group.tags.slice(0, 3).map((tag) => <Tag color="blue" key={tag}>{tag}</Tag>)}
            {!group.tags.length && <Tag>暂无标签</Tag>}
          </Space>
        ),
      },
      {
        title: '最近更新',
        key: 'latestAt',
        width: 150,
        render: (_, group) => formatTime(group.latestAt),
      },
      {
        title: '操作',
        key: 'actions',
        width: 116,
        fixed: 'right',
        className: 'workspace-table-action-cell',
        render: (_, group) => (
          <Button type="primary" size="small" icon={<FileSearchOutlined />} onClick={() => openTaskReviewQueue(group)}>
            {canSubmitReview ? '进入审核' : '查看详情'}
          </Button>
        ),
      },
    ],
    [canSubmitReview, openTaskReviewQueue],
  );

  useEffect(() => {
    if (!onBreadcrumbTailChange) return undefined;
    if (selectedTaskGroup) {
      onBreadcrumbTailChange({
        key: `manual-review-task-${selectedTaskGroup.task_id}`,
        parentKey: 'manual-review',
        parentLabel: '审核任务管理',
        parentOnClick: backToTaskList,
        label: selectedTaskGroup.task_title || '审核任务',
      });
      return () => onBreadcrumbTailChange(null);
    }
    onBreadcrumbTailChange({
      key: 'manual-review',
      parentKey: 'manual-review',
      parentLabel: '审核任务管理',
      label: '审核任务管理',
    });
    return () => onBreadcrumbTailChange(null);
  }, [backToTaskList, onBreadcrumbTailChange, selectedTaskGroup]);

  const selectedItem = useMemo(
    () => queue.items.find((item) => item.submission_id === selectedId) ?? filteredQueueItems.find((item) => item.submission_id === selectedId),
    [filteredQueueItems, queue.items, selectedId],
  );

  const selectedAi = selectedItem?.ai_review ?? detail?.ai_review ?? null;
  const selectedAiResult = selectedAi?.result ?? {};
  const dimensionScores = Array.isArray(selectedAiResult.dimension_scores) ? selectedAiResult.dimension_scores : [];
  const selectedAiProvider = useMemo(() => resolveTaskAiProvider(detail?.task, aiProviders), [aiProviders, detail?.task]);
  const aiReviewComment = extractAiReviewComment(selectedItem, selectedAi);
  const aiReviewActions = useMemo(() => extractAiReviewActions(selectedAi), [selectedAi]);
  const reviewDiffItems = useMemo(() => diff?.items ?? [], [diff?.items]);
  const auditRoundGroups = useMemo(
    () => buildReviewAuditRoundGroups({ historyItems: history?.items ?? [], detail, selectedItem, selectedAi }),
    [detail, history?.items, selectedAi, selectedItem],
  );
  const activeReviewRound = selectedReviewRound ?? detail?.submission.current_round ?? history?.summary.current_round ?? null;
  const activeReviewRoundLabel = reviewRoundViewLabel(activeReviewRound);
  const activeDiffCopy = diffCopyForRound(activeReviewRound);
  const reviewAuditRows = useMemo(() => buildReviewAuditRows(detail), [detail]);
  const reviseAnswerFields = useMemo(() => buildReviewAnswerFields(detail), [detail]);
  const selectedIsPending = detail?.submission.status === 'submitted' || selectedItem?.status === 'submitted';
  const currentQueueTitle = queueTitle(activeFilter, queueStatus);
  const queueFilterSubmittedItems = useMemo(
    () => taskSubmittedQueue.items.filter((item) => (
      (!selectedTaskId || item.task_id === selectedTaskId)
      && queueItemMatchesKeyword(item, keyword)
    )),
    [keyword, selectedTaskId, taskSubmittedQueue.items],
  );
  const queueFilterProcessedItems = useMemo(
    () => taskProcessedQueue.items.filter((item) => (
      (!selectedTaskId || item.task_id === selectedTaskId)
      && queueItemMatchesKeyword(item, keyword)
    )),
    [keyword, selectedTaskId, taskProcessedQueue.items],
  );
  const queueFilterCounts = useMemo(() => ({
    all: queueFilterSubmittedItems.length,
    pass: queueFilterSubmittedItems.filter((item) => item.ai_suggestion === 'pass').length,
    reject: queueFilterSubmittedItems.filter((item) => item.ai_suggestion === 'reject').length,
    manual: queueFilterSubmittedItems.filter((item) => item.ai_suggestion === 'manual' || !item.ai_suggestion).length,
    processed: queueFilterProcessedItems.length,
  }), [queueFilterProcessedItems, queueFilterSubmittedItems]);
  const passRate = stats && stats.completed > 0 ? Math.round((stats.approved / stats.completed) * 100) : 0;
  const canOpenAssistModal = canRequestAssistance && queueStatus === 'submitted' && selectedAssistanceTaskGroups.length > 0;
  const assistButtonHint = !canRequestAssistance
    ? '当前账号没有任务管理权限，不能请求协助'
    : queueStatus === 'processed'
      ? '已处理列表不能继续请求协助'
      : !selectedAssistanceTaskGroups.length
        ? '请先勾选要协助的提交'
        : '把所选任务加入目标 Reviewer 的可审核范围';

  const queueFilterValue = queueStatus === 'processed' ? 'processed' : activeFilter;
  const queueFilterOptions = [
    { value: 'all', label: `待审核 ${queueFilterCounts.all}` },
    { value: 'pass', label: `AI建议通过 ${queueFilterCounts.pass}` },
    { value: 'reject', label: `AI建议打回 ${queueFilterCounts.reject}` },
    { value: 'manual', label: `待人工审核 ${queueFilterCounts.manual}` },
    { value: 'processed', label: `已处理 ${queueFilterCounts.processed}` },
  ];
  const handleQueueFilterChange = (value: AiQueueFilter | 'processed') => {
    if (value === 'processed') {
      setQueueStatus('processed');
      setActiveFilter('all');
      void loadQueue(teamId, 'all', keyword, 'processed');
      return;
    }
    setQueueStatus('submitted');
    setActiveFilter(value);
    void loadQueue(teamId, value, keyword, 'submitted');
  };

  if (!selectedTaskId) {
    const taskSummaryItems = [
      { key: 'tasks', label: '审核任务', value: reviewTaskGroups.length, active: taskStatusFilter === 'all', onClick: () => setTaskStatusFilter('all') },
      { key: 'pending', label: '待审核条目', value: stats?.pending ?? taskSubmittedQueue.summary.pending, active: taskStatusFilter === 'pending', onClick: () => setTaskStatusFilter('pending') },
      { key: 'processed', label: '已处理条目', value: stats?.completed ?? taskProcessedQueue.items.length, active: taskStatusFilter === 'processed', onClick: () => setTaskStatusFilter('processed') },
      { key: 'pass', label: 'AI建议通过', value: taskSubmittedQueue.summary.ai_suggestions?.pass ?? 0 },
      { key: 'reject', label: 'AI建议打回', value: taskSubmittedQueue.summary.ai_suggestions?.reject ?? 0 },
      { key: 'manual', label: '待人工判断', value: taskSubmittedQueue.summary.ai_suggestions?.manual ?? 0 },
    ];

    return (
      <main className="workspace-content production-page production-list-page review-task-management-page workspace-fixed-page">
        {messageContextHolder}
        <section className="page-heading">
          <div>
            <p className="section-kicker">Manual Review Tasks</p>
            <h1>审核任务管理</h1>
          </div>
          <div className="page-heading-actions">
            <Space wrap>
              <Button icon={<ReloadOutlined />} onClick={refresh} loading={loading}>刷新</Button>
            </Space>
          </div>
        </section>

        <WorkspaceSummaryStrip items={taskSummaryItems} ariaLabel="审核任务摘要" />

        <section className="production-filter-bar workspace-fixed-toolbar">
          <Input.Search
            className="production-filter-search"
            allowClear
            value={keyword}
            placeholder="搜索审核任务名称、标签或任务 ID"
            onChange={(event) => setKeyword(event.target.value)}
            onSearch={(value) => setKeyword(value)}
          />
          <Segmented<ReviewTaskStatusFilter>
            className="production-view-switch"
            aria-label="审核任务状态"
            value={taskStatusFilter}
            onChange={setTaskStatusFilter}
            options={[
              { value: 'all', label: '全部任务' },
              { value: 'pending', label: '待审核' },
              { value: 'processed', label: '已处理' },
            ]}
          />
          <Segmented<ReviewTaskViewMode>
            className="production-view-switch review-task-view-switch"
            aria-label="审核任务展示方式"
            value={taskViewMode}
            onChange={setTaskViewMode}
            options={[
              { value: 'table', label: '表格', icon: <TableOutlined /> },
              { value: 'card', label: '卡片', icon: <AppstoreOutlined /> },
            ]}
          />
        </section>

        {taskViewMode === 'table' ? (
          <section className="production-table-shell workspace-fixed-table-panel review-task-table-shell" aria-label="审核任务表格">
            <EnhancedTable<ReviewTaskGroup>
              className="workspace-fixed-table review-task-table"
              rowKey="task_id"
              loading={loading}
              dataSource={filteredReviewTaskGroups}
              columns={reviewTaskTableColumns}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                placement: ['bottomEnd'],
                showTotal: (total) => `共 ${total} 个审核任务`,
              }}
              scroll={{ x: 1516, y: 'calc(var(--workspace-table-body-height) - 60px)' }}
              locale={{ emptyText: <Empty description="暂无可审核任务" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              onRow={(group) => ({
                onDoubleClick: () => openTaskReviewQueue(group),
              })}
            />
          </section>
        ) : (
          <section className="production-card-shell workspace-fixed-table-panel review-task-card-shell" aria-label="审核任务卡片列表">
            <Spin spinning={loading}>
              <div className="production-card-scroll">
                {filteredReviewTaskGroups.length ? (
                  <div className="production-card-grid">
                    {filteredReviewTaskGroups.map((group) => {
                      const progressPercent = reviewTaskProgressPercent(group);
                      return (
                        <Card
                          key={group.task_id}
                          className="production-card review-task-card"
                          onClick={() => openTaskReviewQueue(group)}
                        >
                          <div className="production-card-topline">
                            <div className="production-card-badges">
                              <Tag color={group.pending ? 'processing' : 'success'}>{group.pending ? '待审核' : '已处理'}</Tag>
                              <Tag icon={<UserOutlined />} color={group.responsibleReviewers.size ? 'purple' : 'default'}>{reviewTaskResponsibleLabel(group)}</Tag>
                              <Tag color="blue">{group.labelers.size} 位 Labeler</Tag>
                              <Tag>轮次 {reviewTaskRoundLabel(group.rounds)}</Tag>
                            </div>
                            <Button
                              type="primary"
                              size="small"
                              icon={<FileSearchOutlined />}
                              onClick={(event) => {
                                event.stopPropagation();
                                openTaskReviewQueue(group);
                              }}
                            >
                              {canSubmitReview ? '进入审核' : '查看详情'}
                            </Button>
                          </div>
                          <div className="production-card-body">
                            <h3>{group.task_title}</h3>
                            <p>责任人 {reviewTaskResponsibleLabel(group)} · 最近更新 {formatTime(group.latestAt)}</p>
                            <p>任务 ID {formatShortReviewId(group.task_id)} · {reviewTaskRoundDetail(group)}</p>
                          </div>
                          <div className="production-card-progress">
                            <div><strong>{group.processed}/{group.total}</strong><span>处理进度 · {progressPercent}%</span></div>
                            <Progress
                              percent={progressPercent}
                              size="small"
                              showInfo={false}
                              success={{ percent: group.total > 0 ? Math.round((group.approved / group.total) * 100) : 0 }}
                            />
                          </div>
                          <div className="production-card-metrics review-task-metrics" aria-label="审核任务关键指标">
                            <span><strong>{group.pending}</strong><small>待审核</small></span>
                            <span><strong>{group.approved}</strong><small>通过</small></span>
                            <span><strong>{group.rejected}</strong><small>打回</small></span>
                            <span><strong>{group.pass}/{group.reject}</strong><small>AI通过/打回</small></span>
                            <span><strong>{group.aiCompleted}/{group.aiFailed}</strong><small>AI完成/失败</small></span>
                          </div>
                          <div className="review-task-card-detail">
                            <span>{reviewTaskAiStatusDetail(group)}</span>
                            <span>人工判断 {group.manual}</span>
                          </div>
                          <div className="production-card-tags">
                            {group.tags.slice(0, 4).map((tag) => <Tag color="blue" key={tag}>{tag}</Tag>)}
                            {!group.tags.length && <Tag>暂无标签</Tag>}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <Empty className="review-queue-empty" description="暂无可审核任务" />
                )}
              </div>
            </Spin>
          </section>
        )}
      </main>
    );
  }

  return (
    <main className={`workspace-content review-queue-page reviewer-review-page ${headingCollapsed ? 'review-heading-collapsed' : ''}`}>
      {messageContextHolder}
      {!headingCollapsed && (
        <section className="page-heading review-page-heading">
          <div>
            <p className="section-kicker">Manual Review</p>
            <h1>{selectedTaskGroup?.task_title || '人工审核'}</h1>
          </div>
          <div className="page-heading-actions review-heading-actions">
            <Space wrap>
              <Tooltip title="返回审核任务管理">
                <Button
                  aria-label="返回审核任务管理"
                  className="review-back-icon-button"
                  type="text"
                  icon={<ArrowLeftOutlined />}
                  onClick={backToTaskList}
                />
              </Tooltip>
              <Button icon={<ReloadOutlined />} onClick={refresh} loading={loading}>刷新</Button>
            </Space>
          </div>
        </section>
      )}

      <section className="production-filter-bar review-workbench-toolbar">
        <Input.Search
          className="production-filter-search"
          allowClear
          value={keyword}
          placeholder="搜索提交、任务、标注员、标题、风险标签"
          onChange={(event) => setKeyword(event.target.value)}
          onSearch={(value) => { setKeyword(value); void loadQueue(teamId, activeFilter, value, queueStatus); }}
        />
        <Space className="review-toolbar-actions">
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            disabled={!canSubmitReview || !selectedRowKeys.length || queueStatus === 'processed'}
            onClick={() => {
              batchForm.setFieldsValue({ decision: 'approved', comment: '' });
              setBatchOpen(true);
            }}
          >
            批量通过
          </Button>
          <Button
            danger
            icon={<CloseCircleOutlined />}
            disabled={!canSubmitReview || !selectedRowKeys.length || queueStatus === 'processed'}
            onClick={() => {
              batchForm.setFieldsValue({ decision: 'rejected', comment: '' });
              setBatchOpen(true);
            }}
          >
            批量打回
          </Button>
          <Tooltip title={assistButtonHint}>
            <span>
              <Button
                disabled={!canOpenAssistModal}
                icon={<SwapOutlined />}
                onClick={openAssistanceModal}
              >
                请求协助
              </Button>
            </span>
          </Tooltip>
          <Button
            icon={headingCollapsed ? <DownOutlined /> : <UpOutlined />}
            onClick={() => setHeadingCollapsed((value) => !value)}
          >
            {headingCollapsed ? '展开标题栏' : '收起标题栏'}
          </Button>
          {headingCollapsed && (
            <Tooltip title="返回审核任务管理">
              <Button
                aria-label="返回审核任务管理"
                className="review-back-icon-button"
                type="text"
                icon={<ArrowLeftOutlined />}
                onClick={backToTaskList}
              />
            </Tooltip>
          )}
        </Space>
      </section>

      <section className="review-workbench-shell">
        <aside className="review-queue-column">
          <div className="review-column-title">
            <div>
              <strong>{currentQueueTitle}</strong>
            </div>
            <div className="review-queue-title-actions">
              <Tag className="review-queue-selected-tag" color={selectedRowKeys.length ? 'blue' : 'default'}>
                已选 {selectedRowKeys.length}
              </Tag>
              <Select
                aria-label="审核队列筛选"
                size="small"
                value={queueFilterValue}
                options={queueFilterOptions}
                onChange={handleQueueFilterChange}
                popupMatchSelectWidth={false}
              />
              <Checkbox
                aria-label="选择当前队列全部提交"
                indeterminate={selectedRowKeys.length > 0 && selectedRowKeys.length < filteredQueueItems.length}
                checked={Boolean(filteredQueueItems.length) && selectedRowKeys.length === filteredQueueItems.length}
                onChange={(event) => setSelectedRowKeys(event.target.checked ? filteredQueueItems.map((item) => item.submission_id) : [])}
              />
            </div>
          </div>
          <Spin spinning={loading}>
            {filteredQueueItems.length ? (
              <div className="review-queue-list" role="list">
                {filteredQueueItems.map((item) => {
                  const suggestion = aiSuggestionLabels[item.ai_suggestion || 'manual'] ?? aiSuggestionLabels.manual;
                  const checked = selectedRowKeys.includes(item.submission_id);
                  const active = item.submission_id === selectedId;
                  const queueSummary = formatReviewQueueSummary(item.summary);
                  const aiReason = formatReviewQueueSummary(item.ai_reason);
                  return (
                    <div key={item.submission_id} role="listitem" className={`review-queue-item ${active ? 'active' : ''}`} onClick={() => void openDetail(item.submission_id)}>
                      <div className="review-queue-select" onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={checked}
                          onChange={(event) => {
                            setSelectedRowKeys((keys) => event.target.checked
                              ? Array.from(new Set([...keys, item.submission_id]))
                              : keys.filter((key) => key !== item.submission_id));
                          }}
                        />
                      </div>
                      <div className="review-queue-main">
                        <div className="review-queue-meta">
                          <span>#{(item.row_index ?? 0) + 1}</span>
                          <span title={item.labeler_name || item.labeler_id || undefined}>{formatCompactQueueLabeler(item)}</span>
                          <span>{formatTime(item.submitted_at || item.updated_at)}</span>
                        </div>
                        <strong>{reviewQueueItemTitle(item)}</strong>
                        {queueSummary ? <p>{queueSummary}</p> : null}
                        {aiReason ? <p className="review-queue-ai-reason">AI：{aiReason}</p> : null}
                        <div className="review-queue-tags">
                          <Tag>第 {item.current_round} 轮</Tag>
                          <Tag color={suggestion.color}>{suggestion.label}</Tag>
                          <Tag color="purple">AI {formatAiScore(item.ai_score)}</Tag>
                          {(item.risk_flags ?? []).slice(0, 2).map((flag) => <Tag color="red" key={flag}>{flag}</Tag>)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty className="review-queue-empty" description="当前队列暂无待审提交" />
            )}
          </Spin>
        </aside>

        <section className="review-detail-column">
          {detailLoading ? (
            <div className="review-detail-loading"><Spin description="正在加载审核详情" /></div>
          ) : !detail ? (
            <Empty className="review-detail-empty" description="请选择左侧一条提交进行审核" />
          ) : (
            <>
              <header className="review-detail-header">
                <div>
                  <p>题目 #{(detail.question.row_index ?? 0) + 1} · {activeReviewRoundLabel}</p>
                  <h2>{selectedItem?.title || detail.task.title}</h2>
                  <span>{detail.task.title} · 提交于 {formatTime(selectedItem?.submitted_at || detail.submission.updated_at || detail.submission.created_at)}</span>
                </div>
                <Tag color={selectedIsPending ? 'processing' : detail.submission.status === 'approved' ? 'success' : 'error'}>
                  {selectedIsPending ? '待审核' : detail.submission.status === 'approved' ? '已入库' : '已打回'}
                </Tag>
              </header>

              <div className="review-detail-scroll">
                <div className="review-oneflow">
                  {(activeReviewRound ?? 1) > 1 ? (
                    <section className="review-flow-diff">
                      <div className="review-flow-section-head">
                        <div>
                          <strong>{activeDiffCopy.title}</strong>
                        </div>
                        <Tag color="blue">{diff?.summary?.changed ?? 0} 个变化</Tag>
                      </div>
                      <Table<ReviewDiffResponse['items'][number]>
                        rowKey="field"
                        size="small"
                        pagination={false}
                        className="review-round-diff-table"
                        dataSource={reviewDiffItems}
                        columns={[
                          {
                            title: '字段',
                            dataIndex: 'field',
                            width: 180,
                            render: (field: string) => {
                              const component = componentForField(detail, field);
                              return (
                                <span className="review-diff-field-cell">
                                  <strong>{reviewFieldLabel(detail, field)}</strong>
                                  <small>{reviewFieldTypeLabel(component?.type)}</small>
                                </span>
                              );
                            },
                          },
                          {
                            title: '差异',
                            dataIndex: 'change_type',
                            width: 86,
                            render: (value: string) => <Tag color={reviewChangeTypeColor(value)}>{reviewChangeTypeLabel(value)}</Tag>,
                          },
                          {
                            title: activeDiffCopy.previousTitle,
                            dataIndex: 'previous_value',
                            render: (value: unknown, item: ReviewDiffResponse['items'][number]) => renderReviewDiffValue(value, detail, item.field, {
                              compareLeftValue: item.previous_value,
                              compareRightValue: item.current_value,
                              compareLeftTitle: activeDiffCopy.previousTitle,
                              compareRightTitle: activeDiffCopy.currentTitle,
                            }),
                          },
                          {
                            title: activeDiffCopy.currentTitle,
                            dataIndex: 'current_value',
                            render: (value: unknown, item: ReviewDiffResponse['items'][number]) => renderReviewDiffValue(value, detail, item.field, {
                              compareLeftValue: item.previous_value,
                              compareRightValue: item.current_value,
                              compareLeftTitle: activeDiffCopy.previousTitle,
                              compareRightTitle: activeDiffCopy.currentTitle,
                            }),
                          },
                        ]}
                        locale={{ emptyText: '暂无可对比字段' }}
                      />
                    </section>
                  ) : null}

                  <section className="review-audit-table-panel review-current-submission-panel">
                    <div className="review-flow-section-head">
                      <div>
                        <strong>{(activeReviewRound ?? 1) > 1 ? '当前题目与本轮答案' : '题目与答案'}</strong>
                      </div>
                      <Tag color="blue">第 {activeReviewRound || 1} 轮</Tag>
                    </div>
                    <Table<ReviewAuditTableRow>
                      rowKey="key"
                      size="small"
                      pagination={false}
                      className="review-audit-table"
                      dataSource={reviewAuditRows}
                      scroll={{ x: 760 }}
                      columns={[
                        {
                          title: '类别',
                          dataIndex: 'group',
                          width: 78,
                          render: (group: ReviewAuditTableRow['group']) => (
                            <Tag color={group === 'question' ? 'cyan' : 'blue'}>{group === 'question' ? '题目' : '答案'}</Tag>
                          ),
                        },
                        {
                          title: '字段',
                          dataIndex: 'label',
                          width: 180,
                          render: (_value: string, row) => (
                            <span className="review-audit-field-cell">
                              <strong title={row.label}>{row.label}</strong>
                              <small title={`${row.field}${row.required ? ' · 必填' : ''}`}>{row.field}{row.required ? ' · 必填' : ''}</small>
                            </span>
                          ),
                        },
                        {
                          title: '类型',
                          dataIndex: 'type',
                          width: 96,
                          render: (value: string) => <Typography.Text className="review-audit-type-text">{value}</Typography.Text>,
                        },
                        {
                          title: '内容',
                          dataIndex: 'value',
                          render: (_value: unknown, row) => (
                            <div className="review-audit-value-cell">{renderReviewAuditValue(row, detail)}</div>
                          ),
                        },
                      ]}
                      locale={{ emptyText: '当前提交没有可展示的题目或答案' }}
                    />
                  </section>

                  <section className="review-flow-ai">
                    <div className="review-flow-section-head">
                      <div>
                        <strong>AI 预审评语</strong>
                        <span>{selectedAi ? `${aiReviewStatusLabels[selectedAi.status] || selectedAi.status} · ${formatTime(selectedAi.updated_at || selectedAi.created_at)}` : '尚未生成 AI 预审任务'}</span>
                      </div>
                      <Space size={6} wrap>
                        <Tag color="blue">{selectedAiProvider.providerName}</Tag>
                        <Tag color={aiSuggestionLabels[selectedItem?.ai_suggestion || 'manual']?.color ?? 'processing'}>
                          {aiSuggestionLabels[selectedItem?.ai_suggestion || 'manual']?.label ?? '待人工审核'}
                        </Tag>
                      </Space>
                    </div>
                    {selectedAi ? (
                      <>
                        <div className="review-ai-decision-strip">
                          <span><small>总分</small><strong>{formatAiScore(selectedItem?.ai_score)}</strong></span>
                          <span><small>模型</small><strong>{selectedAiProvider.modelName}</strong></span>
                          <span><small>风险</small><strong>{(selectedItem?.risk_flags ?? []).length || '无'}</strong></span>
                        </div>
                        {aiReviewComment ? (
                          <div className="review-ai-comment">{aiReviewComment}</div>
                        ) : (
                          <Alert type="info" showIcon title="AI 暂未返回可读评语" />
                        )}
                        {aiReviewActions.length ? (
                          <div className="review-ai-actions">
                            {aiReviewActions.map((item) => <Tag color="blue" key={item}>{item}</Tag>)}
                          </div>
                        ) : null}
                        {dimensionScores.length ? (
                          <Table<Record<string, unknown>>
                            size="small"
                            className="review-ai-dimension-table"
                            pagination={false}
                            dataSource={dimensionScores as Array<Record<string, unknown>>}
                            rowKey={(record, index) => `${record.dimension || index}`}
                            columns={[
                              { title: '维度', dataIndex: 'dimension', width: 130 },
                              { title: '评分', dataIndex: 'score', width: 70 },
                              { title: '原因', dataIndex: 'reason', render: (_value: unknown, record: Record<string, unknown>) => formatAiDimensionReason(record) },
                            ]}
                          />
                        ) : null}
                      </>
                    ) : (
                      <Alert
                        className="review-ai-empty-strip"
                        type="info"
                        showIcon
                        title="无 AI 预审"
                      />
                    )}
                  </section>

                  <footer className="review-decision-footer review-decision-inline">
                    <div className="review-decision-form">
                      <Typography.Text className="review-decision-label" strong>审核意见</Typography.Text>
                      <Input.TextArea
                        autoSize={{ minRows: 1, maxRows: 2 }}
                        value={reviewComment}
                        placeholder={!canSubmitReview ? '当前账号不可提交审核' : selectedIsPending ? '说明通过依据或打回原因' : '该提交已处理，不能重复审核'}
                        disabled={!canSubmitReview || !selectedIsPending}
                        onChange={(event) => setReviewComment(event.target.value)}
                        aria-label="审核意见"
                      />
                    </div>
                    <Space className="review-decision-actions">
                      <Button danger icon={<CloseCircleOutlined />} loading={submitting} disabled={!canSubmitReview || !selectedIsPending} onClick={() => void submitDecision('rejected')}>打回</Button>
                      <Button icon={<EditOutlined />} loading={reviseSubmitting} disabled={!canSubmitReview || !selectedIsPending} onClick={openReviseModal}>直接修订</Button>
                      <Button type="primary" icon={<CheckCircleOutlined />} loading={submitting} disabled={!canSubmitReview || !selectedIsPending} onClick={() => void submitDecision('approved')}>通过入库</Button>
                      <Button icon={<DownOutlined />} onClick={() => {
                        const index = filteredQueueItems.findIndex((item) => item.submission_id === selectedId);
                        const next = filteredQueueItems[index + 1] || filteredQueueItems[0];
                        if (next) void openDetail(next.submission_id);
                      }}>下一条</Button>
                    </Space>
                  </footer>
                </div>
              </div>
            </>
          )}
        </section>

        <aside className="review-overview-column">
          <div className="review-column-title">
            <div>
              <strong>账号概览</strong>
              <span>{enterprise ? '企业范围' : '分配范围'}</span>
            </div>
            <Avatar size={34} icon={<UserOutlined />} src={user.avatar || undefined} />
          </div>
          <div className="review-overview-grid">
            <div><span>今日已审</span><strong>{stats?.completed ?? 0}</strong></div>
            <div><span>通过率</span><strong>{passRate}%</strong></div>
            <div><span>待审</span><strong>{stats?.pending ?? 0}</strong></div>
            <div><span>涉及任务</span><strong>{stats?.task_count ?? 0}</strong></div>
          </div>
          <div className="review-audit-timeline">
            <div className="review-side-section-head">
              <strong>当前提交审计时间线</strong>
              <span>{selectedItem ? `${activeReviewRoundLabel} · #${(selectedItem.row_index ?? 0) + 1}` : '未选择'}</span>
            </div>
            {auditRoundGroups.length ? (
              <div className="review-audit-round-list" aria-label="按轮次分组的审计时间线">
                {auditRoundGroups.map((group) => {
                  const active = group.round === activeReviewRound;
                  return (
                    <div
                      key={group.round}
                      role="button"
                      tabIndex={0}
                      className={`review-audit-round-group ${active ? 'active' : ''}`}
                      onClick={() => setSelectedReviewRound(group.round)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedReviewRound(group.round);
                        }
                      }}
                      aria-pressed={active}
                    >
                      <div className="review-audit-round-head">
                        <strong>{group.title}</strong>
                        <Tag color={active ? 'blue' : 'default'}>{group.items.length} 条</Tag>
                      </div>
                      <Timeline
                        items={group.items.map((item) => ({
                          color: timelineItemColor(item.decision),
                          content: (
                            <div className="review-history-item">
                              <div className="review-history-person">
                                <strong title={item.actor}>{formatCompactReviewActor(item.actor)}</strong>
                                <span>{item.time}</span>
                              </div>
                              <p className="review-history-action" title={item.action}>{item.action}</p>
                              {item.note ? <p title={item.note}>{item.note}</p> : null}
                            </div>
                          ),
                        }))}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前提交暂无审计记录" />
            )}
          </div>
        </aside>
      </section>

      <Modal
        centered
        title={`批量审核 ${selectedRowKeys.length} 条提交`}
        open={batchOpen}
        forceRender
        confirmLoading={batchSubmitting}
        onOk={() => void submitBatchDecision()}
        onCancel={() => setBatchOpen(false)}
        okText="提交批量审核"
      >
        <Form form={batchForm} layout="vertical" initialValues={{ decision: 'approved', comment: '' }}>
          <Form.Item name="decision" label="审核结论">
            <Radio.Group optionType="button">
              <Radio.Button value="approved">通过</Radio.Button>
              <Radio.Button value="rejected">打回</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item shouldUpdate noStyle>
            {() => {
              const decision = batchForm.getFieldValue('decision');
              return (
                <Form.Item
                  name="comment"
                  label="批量审核意见"
                  rules={decision === 'approved' ? [] : [{ required: true, message: '批量打回必须填写原因' }]}
                >
                  <Input.TextArea rows={4} placeholder="说明批量通过依据或统一打回原因" />
                </Form.Item>
              );
            }}
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        centered
        title="请求协助"
        open={assistOpen}
        confirmLoading={assistSubmitting}
        okButtonProps={{ disabled: !assistTargetReviewerId || !selectedAssistanceTaskGroups.length }}
        okText="提交请求"
        cancelText="取消"
        onOk={() => void submitAssistanceRequest()}
        onCancel={() => {
          setAssistOpen(false);
          setAssistTargetReviewerId(undefined);
          setAssistReason('');
        }}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            title="会把所选任务加入目标 Reviewer 的可审核范围，不会修改已处理结果。"
          />
          {!reviewerLoading && !reviewerOptions.length && (
            <Alert
              type="warning"
              showIcon
              title="当前团队暂无可用 Reviewer，请先在人员管理中启用 Reviewer。"
            />
          )}
          <div className="review-assist-summary">
            <Typography.Text strong>已选择 {selectedRowKeys.length} 条提交，涉及 {selectedAssistanceTaskGroups.length} 个任务</Typography.Text>
            <div style={{ marginTop: 8 }}>
              <Space size={[8, 8]} wrap>
                {selectedAssistanceTaskGroups.map((group) => (
                  <Tag key={group.task_id}>{group.task_title} · {group.submission_ids.length} 条</Tag>
                ))}
              </Space>
            </div>
          </div>
          <Form layout="vertical">
            <Form.Item label="目标 Reviewer" required>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder={reviewerLoading ? '正在加载 Reviewer...' : '请选择 Reviewer'}
                value={assistTargetReviewerId}
                loading={reviewerLoading}
                options={reviewerOptions}
                onChange={(value) => setAssistTargetReviewerId(value)}
                notFoundContent={reviewerLoading ? <Spin size="small" /> : '当前团队暂无可用 Reviewer'}
              />
            </Form.Item>
            <Form.Item label="请求说明">
              <Input.TextArea
                rows={4}
                value={assistReason}
                onChange={(event) => setAssistReason(event.target.value)}
                placeholder="可填写原因，例如当前任务量过大、需要补充审核或临时协助处理"
              />
            </Form.Item>
          </Form>
        </Space>
      </Modal>

      <Modal
        centered
        width={760}
        title="直接修订并入库"
        open={reviseOpen}
        forceRender
        confirmLoading={reviseSubmitting}
        onOk={() => void submitReviseDecision()}
        onCancel={() => setReviseOpen(false)}
        okText="保存修订并入库"
      >
        <Form form={reviseForm} layout="vertical" className="review-revise-form">
          <div className="review-revise-answer-grid">
            {reviseAnswerFields.length ? reviseAnswerFields.map((field) => {
              const commonRules = field.required ? [{ required: true, message: `请填写${field.label}` }] : [];
              const itemName: ['answers', string] = ['answers', field.field];
              if (field.type === 'SingleSelect' && field.options.length) {
                return (
                  <Form.Item key={field.field} name={itemName} label={field.label} rules={commonRules}>
                    <Select
                      allowClear
                      placeholder={`请选择${field.label}`}
                      options={field.options}
                    />
                  </Form.Item>
                );
              }
              if ((field.type === 'MultiSelect' || field.type === 'TagSelect') && field.options.length) {
                return (
                  <Form.Item key={field.field} name={itemName} label={field.label} rules={commonRules}>
                    <Select
                      mode="multiple"
                      allowClear
                      placeholder={`请选择${field.label}`}
                      options={field.options}
                    />
                  </Form.Item>
                );
              }
              if (typeof field.value === 'number') {
                return (
                  <Form.Item key={field.field} name={itemName} label={field.label} rules={commonRules}>
                    <InputNumber className="review-revise-number" placeholder={`请输入${field.label}`} />
                  </Form.Item>
                );
              }
              if (typeof field.value === 'boolean') {
                return (
                  <Form.Item key={field.field} name={itemName} label={field.label} valuePropName="checked">
                    <Switch checkedChildren="是" unCheckedChildren="否" />
                  </Form.Item>
                );
              }
              return (
                <Form.Item
                  key={field.field}
                  name={itemName}
                  label={field.label}
                  rules={commonRules}
                  extra={field.structured ? '复杂对象或数组字段请保持合法 JSON。' : undefined}
                >
                  <Input.TextArea
                    rows={field.structured || field.type === 'TextArea' ? 4 : 2}
                    placeholder={`请输入${field.label}`}
                    spellCheck={false}
                  />
                </Form.Item>
              );
            }) : (
              <Alert type="warning" showIcon title="当前提交没有可修订的答案字段" />
            )}
          </div>
          <Form.Item
            label="修订说明"
            required
            validateStatus={!reviseComment.trim() && reviseCommentError ? 'error' : undefined}
            help={!reviseComment.trim() && reviseCommentError ? reviseCommentError : undefined}
          >
            <Input.TextArea
              aria-label="修订说明"
              rows={3}
              placeholder="说明修订了哪些字段以及入库依据"
              value={reviseComment}
              onChange={(event) => {
                setReviseComment(event.target.value);
                if (reviseCommentError) setReviseCommentError(null);
              }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </main>
  );
}
