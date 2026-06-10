import { type DragEvent, type FormEvent, type Key, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Alert, App, Button as AntButton, Card as AntCard, Checkbox, Collapse, DatePicker, Descriptions, Divider, Drawer, Dropdown, Empty, Form, Input, InputNumber, Modal, Pagination, Popconfirm, Progress, Radio, Segmented, Select, Space, Spin, Steps, Switch, Table, Tabs, Tag, Tooltip, Upload } from 'antd';
import type { ModalFuncProps, UploadProps } from 'antd';
import {
  AlignLeftOutlined,
  AimOutlined,
  AppstoreOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  AudioOutlined,
  CheckCircleOutlined,
  CheckSquareOutlined,
  CodeOutlined,
  CopyOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  DownloadOutlined,
  DownOutlined,
  DragOutlined,
  EditOutlined,
  EyeOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  FontSizeOutlined,
  FormOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  GiftOutlined,
  MoreOutlined,
  OrderedListOutlined,
  PictureOutlined,
  PlusOutlined,
  RobotOutlined,
  RocketOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
  SlidersOutlined,
  TableOutlined,
  TagsOutlined,
  UploadOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import type { AppShellBreadcrumbItem } from '../../components/layout/AppShell';
import { ApiClientError } from '../../services/apiClient';
import type { UploadProgressInfo } from '../../services/apiClient';
import { formatApiDateTime } from '../../utils/dateTime';
import {
  batchCreateTaskQuestions,
  batchDeleteTaskQuestions,
  bindDatasetMediaAsset,
  cancelExportJob,
  changeTaskStatus,
  copyTask,
  copyTemplate,
  createExportJob,
  createTask,
  createTemplate,
  deleteDataset,
  deleteTaskQuestion,
  deleteTask,
  deleteTemplate,
  downloadDataset,
  downloadExportJob,
  evaluateTaskDifficulty,
  exportTaskQuestions,
  exportTaskList,
  generateAiReviewInputPrompt,
  generateAiReviewMatrix as generateAiReviewMatrixRequest,
  generateLabelingAiAssistPreview,
  getAdminOverview,
  getDataset,
  getTeamAiWallet,
  getTeamMembers,
  getTaskQuestion,
  getTaskReadiness,
  getTaskStats,
  getTemplate,
  getTemplatePreview,
  getTemplateReadiness,
  getTemplateVersionDiff,
  listAiProviderConfigs,
  importTaskQuestions,
  listAuditLogs,
  listDatasets,
  listExportJobs,
  listTaskQuestions,
  listTasks,
  listTemplateVersions,
  listTemplates,
  publishTask,
  publishTemplate,
  patchUploadDataset,
  transferTaskOwner,
  updateTask,
  updateTaskInternalLabelers,
  updateTaskQuestion,
  updateDataset,
  updateDatasetTable,
  updateTemplate,
  validateTemplateAnswers,
  uploadFile,
  uploadDataset,
} from '../../services/workspaceService';
import type {
  DatasetPayload,
  DatasetColumn,
  DataBindingPayload,
  DatasetMediaRef,
  AiProviderConfigPayload,
  AuditLogPayload,
  ExportJobPayload,
  TaskQuestionPayload,
  TaskReadinessPayload,
  TaskStatsPayload,
  TaskPublishDraftContext,
  TaskPayload,
  TemplateComponentSchema,
  TemplateComponentType,
  TemplateLinkageRule,
  TemplatePayload,
  TemplateReadinessPayload,
  TemplateSchemaPayload,
  TemplateTabSchema,
  TemplateValidationPayload,
  TemplateValidationRulePayload,
  TemplateVersionDiffPayload,
  TemplateVersionPayload,
  TeamDetail,
  TeamMember,
  TaskDifficultyEvaluateResponse,
} from '../../types/api';
import { EnhancedTable } from '../../components/ui/EnhancedTable';
import { TemplateRenderer } from './TemplateRenderer';
import { TemplateAiAssistant } from './TemplateAiAssistant';
import { TaskPublishAiAssistant } from './TaskPublishAiAssistant';
import { WorkspaceLoading } from './WorkspaceLoading';
import { WorkspaceSummaryStrip } from './WorkspaceListPrimitives';
import { WorkspaceMediaPreview } from './WorkspaceMediaPreview';
import { fixedTablePagination, workspacePopupContainer } from './workspaceListHelpers';
import { WorkspaceTableActions } from './WorkspaceTableActions';
import { WorkspaceSecondaryCode } from './workspaceDisplay';
import { providerSupportsCapability, providerSupportsTaskCategory } from '../../features/ai/providerConfigShared';

const { RangePicker } = DatePicker;

const palette: Array<{ type: TemplateComponentType; label: string; fieldPrefix: string; group: string; description: string; behavior: string; modality?: string; icon: ReactNode }> = [
  { type: 'ShowItem', label: '智能展示块', fieldPrefix: 'show', group: '展示', description: '一次展示多个文本、媒体或上下文字段', behavior: '只展示', modality: '多字段/多模态', icon: <EyeOutlined /> },
  { type: 'TextInput', label: '单行输入', fieldPrefix: 'text', group: '文本', description: '短文本答案字段', behavior: '进入答案', icon: <FontSizeOutlined /> },
  { type: 'TextArea', label: '多行文本', fieldPrefix: 'textarea', group: '文本', description: '长文本和理由说明', behavior: '进入答案', icon: <AlignLeftOutlined /> },
  { type: 'SingleSelect', label: '单选', fieldPrefix: 'single', group: '选择', description: '枚举单选答案', behavior: '进入答案', icon: <CheckCircleOutlined /> },
  { type: 'MultiSelect', label: '多选', fieldPrefix: 'multi', group: '选择', description: '多项枚举答案', behavior: '进入答案', icon: <CheckSquareOutlined /> },
  { type: 'TagSelect', label: '标签选择', fieldPrefix: 'tag', group: '选择', description: '标签化答案字段', behavior: '进入答案', icon: <TagsOutlined /> },
  { type: 'Scale', label: '量表评分', fieldPrefix: 'scale', group: '选择', description: '1-5、1-10 或自定义区间评分', behavior: '进入答案', modality: '数值答案', icon: <SlidersOutlined /> },
  { type: 'Ranking', label: '排序题', fieldPrefix: 'ranking', group: '选择', description: '对候选项进行优先级排序', behavior: '进入答案', modality: '有序列表', icon: <OrderedListOutlined /> },
  { type: 'RichEditor', label: '富文本编辑器', fieldPrefix: 'rich', group: '文本', description: '带格式长文本', behavior: '进入答案', icon: <FileTextOutlined /> },
  { type: 'FileUpload', label: '文件上传', fieldPrefix: 'file', group: '上传', description: '附件材料采集', behavior: '进入答案', modality: '可采集多模态附件', icon: <UploadOutlined /> },
  { type: 'ImageUpload', label: '图片上传', fieldPrefix: 'image', group: '上传', description: '图片材料采集', behavior: '进入答案', modality: '图片输入', icon: <PictureOutlined /> },
  { type: 'ImageMaskAnnotation', label: '图片 Mask 标注', fieldPrefix: 'mask', group: '标注', description: '在图片上勾画框或涂抹 mask', behavior: '进入答案', modality: '图片标注', icon: <PictureOutlined /> },
  { type: 'AudioUpload', label: '音频上传', fieldPrefix: 'audio', group: '上传', description: '音频材料采集', behavior: '进入答案', modality: '音频输入', icon: <AudioOutlined /> },
  { type: 'VideoUpload', label: '视频上传', fieldPrefix: 'video', group: '上传', description: '视频材料采集', behavior: '进入答案', modality: '视频输入', icon: <VideoCameraOutlined /> },
  { type: 'JsonEditor', label: 'JSON 编辑器', fieldPrefix: 'json', group: '结构化', description: '结构化 JSON 答案', behavior: '进入答案', icon: <CodeOutlined /> },
  { type: 'LLMComponent', label: 'LLM 辅助', fieldPrefix: 'llm', group: 'AI', description: '模型辅助输出', behavior: '辅助参考', modality: '读取当前题目上下文', icon: <ExperimentOutlined /> },
  { type: 'GroupContainer', label: '分组容器', fieldPrefix: 'group', group: '布局', description: '把相关物料组织成一个清晰分区', behavior: '容器布局', modality: '不进入答案', icon: <AppstoreOutlined /> },
];

const materialGroups = ['展示', '文本', '选择', '上传', '标注', '结构化', 'AI', '布局'];
const nonAnswerComponentTypes = new Set<TemplateComponentType>(['ShowItem', 'LLMComponent', 'GroupContainer']);

const taskCategoryOptions = [
  { value: 'text', label: '文本' },
  { value: 'image', label: '图片' },
  { value: 'audio', label: '音频' },
  { value: 'video', label: '视频' },
];

const taskDifficultyOptions = [
  { value: 'easy', label: '简单' },
  { value: 'medium', label: '中等' },
  { value: 'hard', label: '困难' },
];

const taskDistributionOptions = [
  { value: 'first_come_all', label: '包大小分配' },
  { value: 'quota_grab', label: '企业内流转' },
];

const taskRewardModeOptions = [
  { value: 'item', label: '按条' },
  { value: 'task', label: '按任务' },
];

const platformFeeRate = 0.1;
const taskManagementTableScrollX = 1648;
const defaultRendererPreviewImage = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#dbeafe"/><stop offset="1" stop-color="#f8fafc"/></linearGradient></defs><rect width="640" height="360" fill="url(#bg)"/><rect x="76" y="64" width="488" height="232" rx="24" fill="#fff" stroke="#93c5fd" stroke-width="6"/><circle cx="182" cy="151" r="48" fill="#38bdf8"/><path d="M96 284 242 182l74 62 66-82 162 122z" fill="#2563eb" opacity=".78"/><text x="320" y="330" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="#1e3a8a">MarkUp preview image</text></svg>',
)}`;
type TaskResultExportFormat = 'json' | 'jsonl' | 'csv' | 'excel';

const taskResultExportFields = [
  { key: 'question_id', label: '题目编号', description: '导出题目的技术标识' },
  { key: 'row_index', label: '数据行号', description: '对应任务题目行序号' },
  { key: 'status', label: '题目状态', description: '待领取、已提交、已入库、打回等状态' },
  { key: 'assigned_to', label: '领取人', description: '题目当前分配或领取的标注员' },
  { key: 'content.*', label: '原始数据字段', description: '任务题目中的源数据动态字段' },
  { key: 'submission_id', label: '提交记录编号', description: '标注员提交记录技术标识' },
  { key: 'labeler_id', label: '标注员 ID', description: '提交结果的标注员' },
  { key: 'answers.*', label: '标注答案字段', description: 'Labeler 提交的动态答案字段' },
  { key: 'submitted_at', label: '提交时间', description: '标注员提交时间' },
  { key: 'submission_status', label: '提交状态', description: '提交记录状态' },
  { key: 'submission_updated_at', label: '提交更新时间', description: '提交或审核后的更新时间' },
  { key: 'review_records', label: '审核记录', description: '人工审核结论、意见、轮次和时间' },
] as const;

const defaultTaskResultExportFieldKeys = taskResultExportFields
  .filter((field) => field.key !== 'review_records')
  .map((field) => field.key);

const taskQualificationDomainOptions = [
  { value: '司法', label: '司法' },
  { value: '心理', label: '心理' },
  { value: '医疗', label: '医疗' },
  { value: '教育', label: '教育' },
];

const defaultTaskAgreementText = [
  '标注员接取本任务前，应确认已阅读任务说明、数据处理要求、保密要求与质量标准。',
  '标注员承诺仅在 MarkUp 平台授权范围内使用任务数据，不复制、传播、转存或用于与任务无关的用途。',
  '标注员应在领取后按任务配置的完成时限提交标注结果；如无法继续完成，应及时联系发布企业处理。',
  '标注结果应基于真实理解和任务规则独立完成，不得恶意提交、批量灌水或绕过平台质检流程。',
].join('\n\n');

const taskPublishSteps = [
  { title: '基础信息', description: '标题、说明、分类与截止', icon: <FormOutlined /> },
  { title: '模板与数据', description: '绑定模板、数据集与列映射', icon: <DatabaseOutlined /> },
  { title: '分发与奖励', description: '领取方式、资质与积分', icon: <GiftOutlined /> },
  { title: 'AI 预审', description: 'Provider、评分矩阵与阈值', icon: <SafetyCertificateOutlined /> },
  { title: '人工复审', description: '审核员与复审分配', icon: <TagsOutlined /> },
  { title: '用户协议', description: '接单前同意任务协议', icon: <FileTextOutlined /> },
  { title: '确认发布', description: '检查并发布任务', icon: <RocketOutlined /> },
] as const;

function buildTaskPublishFormState(task?: TaskPayload | null) {
  const rewardRule = asRecord(task?.reward_rule);
  const aiConfig = asRecord(task?.ai_config);
  const qualificationRules = asRecord(task?.qualification_rules);
  const agreementConfig = asRecord(task?.agreement_config);
  const claimConfig = asRecord(task?.claim_config);
  const reviewConfig = asRecord(task?.review_config);
  const thresholds = asRecord(aiConfig.thresholds);
  const selectedDimensions = stringArrayFromUnknown(aiConfig.selected_dimensions);
  const customDimensions = stringArrayFromUnknown(aiConfig.custom_dimensions);
  const reviewMatrix = Array.isArray(aiConfig.review_matrix)
    ? aiConfig.review_matrix.filter(isRecord).map((row, index) => ({
      key: stringFromRecord(row, 'key', stringFromRecord(row, 'dimension', `dimension_${index + 1}`)),
      dimension: stringFromRecord(row, 'dimension', `维度 ${index + 1}`),
      definition: stringFromRecord(row, 'definition'),
      scoring_standard: stringFromRecord(row, 'scoring_standard'),
      deduction_rule: stringFromRecord(row, 'deduction_rule'),
      reject_condition: stringFromRecord(row, 'reject_condition'),
      manual_condition: stringFromRecord(row, 'manual_condition'),
    }))
    : [];
  const deadlineMode = task ? stringFromRecord(claimConfig, 'deadline_mode', task.deadline ? 'date' : 'long_term') : 'date';
  const agreementRequired = booleanFromRecord(agreementConfig, 'required', true);
  const agreementUseDefault = booleanFromRecord(agreementConfig, 'use_default_template', true);
  const categoryValues = normalizeTaskCategoryValues(qualificationRules.category_tags, task?.category);
  const reviewerIds = task?.reviewer_ids ?? [];
  const initialDistribution = task?.distribution === 'quota_grab' ? 'quota_grab' : 'first_come_all';
  const assignment = task?.assignment ?? {};
  const internalLabelerIds = stringArrayFromUnknown(assignment.target_labeler_ids);

  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    tags: task?.tags?.join(', ') ?? '',
    tag_items: task?.tags ?? [],
    tag_input: '',
    category: deriveTaskCategory(categoryValues),
    category_values: categoryValues,
    difficulty: task?.difficulty ?? '',
    deadline: task?.deadline ?? '',
    deadline_long_term: deadlineMode === 'long_term',
    completion_hours: stringFromRecord(claimConfig, 'completion_hours'),
    labeling_ai_assist_percent: stringFromRecord(claimConfig, 'labeling_ai_assist_percent', stringFromRecord(aiConfig, 'labeler_assist_ratio', '5')),
    template_id: task?.template_id ?? '',
    dataset_id: task?.dataset_id ?? '',
    distribution: initialDistribution as 'first_come_all' | 'quota_grab',
    share_enabled: Boolean(assignment.enabled && initialDistribution === 'first_come_all'),
    internal_labeler_ids: internalLabelerIds,
    internal_labeler_allocations: normalizeLabelerAllocations(internalLabelerIds, assignment.target_labeler_allocations),
    reward_mode: rewardRule.mode === 'task' ? 'task' as const : 'item' as const,
    total_points: stringFromRecord(rewardRule, 'total_points'),
    points_per_item: stringFromRecord(rewardRule, 'points_per_item'),
    expire_hours: String(assignment.expire_hours ?? ''),
    reviewer_ids: reviewerIds,
    review_allocations: normalizeReviewerAllocations(reviewerIds, reviewConfig.reviewer_allocations),
    required_certs: task?.required_certs?.join(', ') ?? '',
    min_completed_tasks: stringFromRecord(qualificationRules, 'min_completed_tasks'),
    min_accuracy_rate: stringFromRecord(qualificationRules, 'min_accuracy_rate'),
    qualification_notes: stringFromRecord(qualificationRules, 'notes'),
    ai_enabled: booleanFromRecord(aiConfig, 'enabled', false),
    ai_provider_id: stringFromRecord(aiConfig, 'provider_id'),
    ai_model: stringFromRecord(aiConfig, 'model'),
    ai_prompt: stringFromRecord(aiConfig, 'prompt'),
    ai_selected_dimensions: selectedDimensions.length ? selectedDimensions : ['准确性', '完整性', '格式规范'],
    ai_custom_dimension_input: '',
    ai_custom_dimensions: customDimensions,
    ai_input_prompt: stringFromRecord(aiConfig, 'input_prompt'),
    ai_input_confirmed: booleanFromRecord(aiConfig, 'input_confirmed', false),
    ai_review_matrix: reviewMatrix,
    ai_matrix_confirmed: booleanFromRecord(aiConfig, 'matrix_confirmed', false),
    ai_pass_threshold: stringFromRecord(thresholds, 'pass', stringFromRecord(aiConfig, 'review_threshold', '85')),
    ai_reject_threshold: stringFromRecord(thresholds, 'reject', '60'),
    ai_manual_min: stringFromRecord(thresholds, 'manual_min', '60'),
    ai_manual_max: stringFromRecord(thresholds, 'manual_max', '84'),
    ai_threshold: stringFromRecord(aiConfig, 'review_threshold', stringFromRecord(thresholds, 'pass', '85')),
    agreement_required: agreementRequired,
    agreement_use_default: agreementUseDefault,
    agreement_text: agreementUseDefault ? defaultTaskAgreementText : stringFromRecord(agreementConfig, 'text', defaultTaskAgreementText),
    agreement_file_name: stringFromRecord(agreementConfig, 'file_name'),
  };
}

interface AiReviewMatrixRow {
  key: string;
  dimension: string;
  definition: string;
  scoring_standard: string;
  deduction_rule: string;
  reject_condition: string;
  manual_condition: string;
}

interface ReviewerAllocationDraft {
  reviewer_id: string;
  quota: string;
  item_count?: number;
}

interface LabelerAllocationDraft {
  labeler_id: string;
  quota: string;
  item_count?: number;
}

interface RewardCostSummary {
  rewardMode: 'item' | 'task';
  platformFeeRate: number;
  workerReceiveRate: number;
  workerPointsPerItem: number | null;
  workerTotalPoints: number | null;
  companyCostPerItem: number | null;
  companyTotalCost: number | null;
  platformFeePerItem: number | null;
  platformFeeTotal: number | null;
  standardItemCount: number;
  canCalculate: boolean;
  hasRewardValue: boolean;
  needsStandardItemCount: boolean;
}

const aiReviewPresetDimensions = [
  '准确性',
  '完整性',
  '一致性',
  '格式规范',
  '证据充分性',
  '逻辑合理性',
  '安全合规',
];

const aiReviewOutputSchema = {
  decision: 'pass | reject | manual',
  reason: 'string',
  dimension_scores: [
    { dimension: 'string', score: 0, reason: 'string' },
  ],
  risk_flags: ['string'],
  suggested_actions: ['string'],
};

const defaultSchema = (): TemplateSchemaPayload => ({
  schema_version: '1.1',
  tabs: [
    {
      id: 'tab_read',
      title: '第一页',
      components: [],
    },
    {
      id: 'tab_label',
      title: '第二页',
      components: [],
    },
  ],
  components: [],
  validation_rules: {},
  linkage_rules: [],
  llm_config: {},
});

function templateDraftFingerprintOf(formState: { name: string; description: string; dataset_id: string }, schemaState: TemplateSchemaPayload): string {
  return JSON.stringify({
    name: formState.name,
    description: formState.description,
    dataset_id: formState.dataset_id,
    schema: schemaState,
  });
}

function componentFactory(type: TemplateComponentType, field: string, label: string): TemplateComponentSchema {
  return {
    id: `${field}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    field,
    label,
    required: !nonAnswerComponentTypes.has(type),
    config: type === 'ShowItem'
      ? { content_field: '', display_mode: 'auto', layout: 'dense', max_items: 10 }
      : type === 'LLMComponent'
        ? { mode: 'labeling_ai_assist' }
      : type === 'GroupContainer'
        ? { description: '把相关展示项、答案字段和提示组织成一个清晰分区。', style: 'section' }
        : type === 'Scale'
          ? { min: 1, max: 5, step: 1, min_label: '非常不符合', max_label: '非常符合' }
          : type === 'Ranking'
            ? { description: '请拖动或使用按钮调整选项顺序。' }
        : type === 'ImageMaskAnnotation'
          ? { source_field: 'image_url', mode: 'rect', brush_size: 18, stroke_color: '#1677ff', mask_opacity: 0.36, description: '请在图片中勾画目标区域，或切换涂抹模式标记 mask。' }
          : {},
    options: ['SingleSelect', 'MultiSelect', 'TagSelect'].includes(type)
      ? [{ value: 'option_1', label: '选项一' }, { value: 'option_2', label: '选项二' }]
      : type === 'Scale'
        ? [{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }, { value: '5', label: '5' }]
      : type === 'Ranking'
        ? [{ value: 'option_1', label: '选项一' }, { value: 'option_2', label: '选项二' }, { value: 'option_3', label: '选项三' }]
      : [],
    version: '1.0',
  };
}

type DesignerPresetSequenceItem = {
  type: TemplateComponentType;
  fieldPrefix: string;
  label: string;
  required?: boolean;
  config?: Record<string, unknown>;
  options?: Array<{ value: string; label: string }>;
};

type DesignerQuickCombo = {
  key: string;
  label: string;
  description: string;
  icon: ReactNode;
  items: DesignerPresetSequenceItem[];
};

function createSequencePresetComponent(spec: DesignerPresetSequenceItem, index: number, currentLength: number): TemplateComponentSchema {
  const field = `${spec.fieldPrefix}_${currentLength + index + 1}`;
  const base = componentFactory(spec.type, field, spec.label);
  return {
    ...base,
    required: typeof spec.required === 'boolean' ? spec.required : base.required,
    config: { ...base.config, ...(spec.config ?? {}) },
    options: spec.options ? spec.options.map((option) => ({ ...option })) : base.options,
  };
}

function insertDesignerPresetSequence(
  schema: TemplateSchemaPayload,
  tabId: string,
  items: DesignerPresetSequenceItem[],
  targetComponentId?: string,
  position: 'before' | 'after' = 'after',
): { schema: TemplateSchemaPayload; firstInsertedId: string; lastInsertedId: string } {
  let nextSchema = schema;
  let anchorId = targetComponentId;
  let firstInsertedId = '';
  let lastInsertedId = '';
  items.forEach((item, index) => {
    const targetTab = nextSchema.tabs.find((tab) => tab.id === tabId) ?? nextSchema.tabs[0];
    const component = createSequencePresetComponent(item, index, targetTab?.components.length ?? 0);
    if (!targetTab) {
      nextSchema = normalizeLlmComponentsLast({ ...nextSchema, tabs: [{ id: tabId || 'tab_read', title: '第一页', components: [component] }] });
    } else if (anchorId) {
      nextSchema = position === 'before'
        ? insertComponentBefore(nextSchema, tabId, component, anchorId)
        : insertComponentAfter(nextSchema, tabId, component, anchorId);
      anchorId = component.id;
    } else {
      nextSchema = updateActiveTab(nextSchema, tabId, { ...targetTab, components: [...targetTab.components, component] });
    }
    firstInsertedId = firstInsertedId || component.id;
    lastInsertedId = component.id;
  });
  return { schema: normalizeLlmComponentsLast(nextSchema), firstInsertedId, lastInsertedId };
}

function uploadAcceptByType(type: TemplateComponentType): string {
  if (type === 'ImageUpload') return 'image/*';
  if (type === 'AudioUpload') return 'audio/*';
  if (type === 'VideoUpload') return 'video/*';
  return '.pdf,.doc,.docx,.txt,.csv,.json,image/*,audio/*,video/*';
}

function useOwnerTeam() {
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getAdminOverview()
      .then((data) => setTeam(data.teams[0] ?? null))
      .catch((err) => setError(err instanceof ApiClientError ? err.message : '企业信息加载失败'))
      .finally(() => setLoading(false));
  }, []);

  return { team, loading, error };
}

interface DatasetManagementPageProps {
  onBreadcrumbTailChange?: (tail: AppShellBreadcrumbItem | null) => void;
  onOpenTemplate?: () => void;
  onOpenPublish?: () => void;
}

type DatasetDetailTab = 'sample' | 'table' | 'media' | 'mapping' | 'publish';
type TaskManagementMode = { type: 'list' } | { type: 'new' } | { type: 'edit'; task: TaskPayload };
type ProductionViewMode = 'table' | 'card';
type DatasetUploadProgressMode = 'import' | 'patch';
type DatasetUploadProgressState = UploadProgressInfo & {
  fileCount: number;
  totalBytes: number;
  mode: DatasetUploadProgressMode;
};

const productionViewOptions = [
  { label: '表格', value: 'table' as const, icon: <TableOutlined /> },
  { label: '卡片', value: 'card' as const, icon: <AppstoreOutlined /> },
];

const productionCardPageSizeOptions = [6, 9, 12, 18];

function initialProductionViewMode(): ProductionViewMode {
  if (typeof window === 'undefined') return 'table';
  return window.matchMedia('(max-width: 768px)').matches ? 'card' : 'table';
}

function safeCardPage(total: number, page: number, pageSize: number): number {
  return Math.min(page, Math.max(1, Math.ceil(total / pageSize) || 1));
}

function paginateCards<T>(items: T[], page: number, pageSize: number): T[] {
  const safePage = safeCardPage(items.length, page, pageSize);
  return items.slice((safePage - 1) * pageSize, safePage * pageSize);
}

function uploadFileUid(file: Pick<File, 'name' | 'size' | 'lastModified'>): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function totalUploadFileBytes(files: File[]): number {
  return files.reduce((total, item) => total + item.size, 0);
}

function sortedUploadFiles(files: File[]): File[] {
  return [...files].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN', { numeric: true, sensitivity: 'base' }));
}

function formatUploadBytes(value?: number | null): string {
  if (!value || value <= 0) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function renderDatasetUploadProgress(progress: DatasetUploadProgressState | null, files: File[]): ReactNode {
  if (!progress && files.length === 0) return null;
  const totalBytes = progress?.total || progress?.totalBytes || totalUploadFileBytes(files);
  const loadedBytes = progress?.loaded ?? 0;
  const percent = progress ? Math.max(0, Math.min(100, progress.percent)) : 0;
  const fileCount = progress?.fileCount ?? files.length;
  return (
    <section className="dataset-upload-progress-panel" aria-label="上传进度">
      <div className="dataset-upload-progress-header">
        <strong>{progress ? '正在上传并解析' : '待上传文件'}</strong>
        <span>{fileCount} 个文件 · {formatUploadBytes(totalBytes)}</span>
      </div>
      {progress ? (
        <Progress
          percent={percent}
          size="small"
          status={percent >= 100 ? 'success' : 'active'}
          aria-label="上传进度"
        />
      ) : null}
      <div className="dataset-upload-progress-meta">
        {progress ? (
          <span>{progress.lengthComputable ? `${formatUploadBytes(loadedBytes)} / ${formatUploadBytes(totalBytes)}` : '浏览器无法获取总大小，正在上传...'}</span>
        ) : (
          <span>点击弹窗底部按钮后开始上传。</span>
        )}
      </div>
    </section>
  );
}

function activateCardFromKeyboard(event: ReactKeyboardEvent<HTMLElement>, action: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  action();
}

function resolveToastKey(scope: string, kind: 'success' | 'error') {
  return `${scope}-${kind}`;
}

function useWorkspaceToast(scope: string) {
  const { message } = App.useApp();
  return useCallback((kind: 'success' | 'error', content: string) => {
    const toastConfig = {
      key: resolveToastKey(scope, kind),
      type: kind,
      content,
      duration: 5,
    };
    if (typeof message.open === 'function') {
      message.open(toastConfig);
      return;
    }
    message[kind]?.(content, 5);
  }, [message, scope]);
}

function useActionErrorToast(
  actionError: string | null,
  setActionError: (value: string | null) => void,
  showToast: (kind: 'success' | 'error', content: string) => void,
) {
  useEffect(() => {
    if (!actionError) return undefined;
    showToast('error', actionError);
    const timer = window.setTimeout(() => setActionError(null), 0);
    return () => window.clearTimeout(timer);
  }, [actionError, setActionError, showToast]);
}

export function DatasetManagementPage({ onBreadcrumbTailChange, onOpenTemplate, onOpenPublish }: DatasetManagementPageProps = {}) {
  const showToast = useWorkspaceToast('dataset');
  const { team, loading, error } = useOwnerTeam();
  const [datasets, setDatasets] = useState<DatasetPayload[]>([]);
  const [selected, setSelected] = useState<DatasetPayload | null>(null);
  const [editing, setEditing] = useState<DatasetPayload | null>(null);
  const [detailTab, setDetailTab] = useState<DatasetDetailTab>('sample');
  const [sampleKeyword, setSampleKeyword] = useState('');
  const [sampleFilter, setSampleFilter] = useState<'all' | 'media' | 'issues'>('all');
  const [datasetMetaForm, setDatasetMetaForm] = useState({ name: '', description: '' });
  const [query, setQuery] = useState('');
  const [formatFilter, setFormatFilter] = useState('all');
  const [viewMode, setViewMode] = useState<ProductionViewMode>(() => initialProductionViewMode());
  const [cardPage, setCardPage] = useState(1);
  const [cardPageSize, setCardPageSize] = useState(9);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewPageSize, setPreviewPageSize] = useState(10);
  const [sampleIndex, setSampleIndex] = useState(0);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [tableDraftRows, setTableDraftRows] = useState<Array<Record<string, unknown>>>([]);
  const [tableDraftColumns, setTableDraftColumns] = useState<DatasetColumn[]>([]);
  const [tableEditorDirty, setTableEditorDirty] = useState(false);
  const [tableEditorFullscreen, setTableEditorFullscreen] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [unsaved, setUnsaved] = useState(false);
  const [autoSaveState, setAutoSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [form, setForm] = useState({ name: '', description: '', media: '' });
  const [importOpen, setImportOpen] = useState(false);
  const [patchUploadOpen, setPatchUploadOpen] = useState(false);
  const [patchFile, setPatchFile] = useState<File | null>(null);
  const [patchMediaFiles, setPatchMediaFiles] = useState<File[]>([]);
  const [patchForm, setPatchForm] = useState({ primaryKey: '', media: '' });
  const [patchSubmitting, setPatchSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<DatasetUploadProgressState | null>(null);
  const [mediaBindingSubmitting, setMediaBindingSubmitting] = useState(false);
  const [variableOpen, setVariableOpen] = useState(false);
  const [backConfirmOpen, setBackConfirmOpen] = useState(false);
  const [variableForm, setVariableForm] = useState({
    name: 'display_title',
    data_type: 'text',
    source_column: '',
    default_value: '',
    expression: '{value}',
    comment: '发布映射用展示变量',
    use_in_mapping: true,
  });
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const autoSaveTimerRef = useRef<number | null>(null);
  const activeDataset = editing ?? selected;
  const mappingColumns = useMemo(() => activeDataset?.columns.filter((column) => column.use_in_mapping !== false) ?? [], [activeDataset]);
  const derivedColumns = useMemo(() => activeDataset?.columns.filter((column) => column.derived) ?? [], [activeDataset]);
  const sourceColumns = useMemo(() => activeDataset?.columns.filter((column) => !column.derived) ?? [], [activeDataset]);
  const firstPreviewRow = activeDataset?.preview_rows[0] ?? activeDataset?.rows?.[0] ?? {};
  const variablePreview = activeDataset ? previewDerivedValue(firstPreviewRow, variableForm.source_column, variableForm.default_value, variableForm.expression) : '';
  const activeRows = activeDataset?.rows ?? activeDataset?.preview_rows ?? [];
  const filteredSampleEntries = useMemo(() => {
    const keyword = sampleKeyword.trim().toLowerCase();
    return activeRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => {
        const mediaCount = rowMedia(row).length;
        const hasIssue = datasetRowHasIssue(row);
        if (sampleFilter === 'media' && mediaCount === 0) return false;
        if (sampleFilter === 'issues' && !hasIssue) return false;
        if (!keyword) return true;
        return [
          row.row_id,
          row.external_id,
          row.id,
          ...Object.entries(row)
            .filter(([key]) => !['media', 'attachments', 'derived_context', '_bindings'].includes(key))
            .slice(0, 8)
            .map(([, value]) => cellText(value)),
        ].some((value) => String(value ?? '').toLowerCase().includes(keyword));
      });
  }, [activeRows, sampleFilter, sampleKeyword]);
  const safeSampleEntry = filteredSampleEntries[Math.min(sampleIndex, Math.max(0, filteredSampleEntries.length - 1))];
  const safeSampleIndex = safeSampleEntry?.index ?? Math.min(sampleIndex, Math.max(0, activeRows.length - 1));
  const activeSample = safeSampleEntry?.row ?? activeRows[safeSampleIndex] ?? {};
  const activeMediaSummary = activeDataset ? datasetMediaSummary(activeDataset) : { types: [], bound: 0, unbound: 0, failed: 0 };
  const importUploadFiles = useMemo(() => [file, ...mediaFiles].filter((item): item is File => Boolean(item)), [file, mediaFiles]);
  const patchUploadFiles = useMemo(() => [patchFile, ...patchMediaFiles].filter((item): item is File => Boolean(item)), [patchFile, patchMediaFiles]);
  const currentImportProgress = uploadProgress?.mode === 'import' ? uploadProgress : null;
  const currentPatchProgress = uploadProgress?.mode === 'patch' ? uploadProgress : null;
  const datasetFileUploadProps: UploadProps = {
    accept: '.csv,.xlsx,.json,.jsonl',
    maxCount: 1,
    multiple: false,
    fileList: file ? [{ uid: uploadFileUid(file), name: file.name, size: file.size, type: file.type, status: 'done' }] : [],
    beforeUpload: (nextFile) => {
      setFile(nextFile);
      return false;
    },
    onRemove: () => {
      setFile(null);
      return true;
    },
  };
  const mediaUploadProps: UploadProps = {
    accept: 'image/*,audio/*,video/*',
    multiple: true,
    fileList: sortedUploadFiles(mediaFiles).map((mediaFile) => ({ uid: uploadFileUid(mediaFile), name: mediaFile.name, size: mediaFile.size, type: mediaFile.type, status: 'done' })),
    beforeUpload: (nextFile) => {
      if (!isAllowedDatasetMediaFile(nextFile)) {
        showToast('error', '多模态素材仅支持安全的图片、音频或视频文件。');
        return Upload.LIST_IGNORE;
      }
      setMediaFiles((current) => {
        const uid = uploadFileUid(nextFile);
        if (current.some((item) => uploadFileUid(item) === uid)) return current;
        return [...current, nextFile];
      });
      return false;
    },
    onRemove: (removedFile) => {
      setMediaFiles((current) => current.filter((item) => uploadFileUid(item) !== removedFile.uid));
      return true;
    },
  };
  const patchFileUploadProps: UploadProps = {
    accept: '.csv,.xlsx,.json,.jsonl',
    maxCount: 1,
    multiple: false,
    fileList: patchFile ? [{ uid: uploadFileUid(patchFile), name: patchFile.name, size: patchFile.size, type: patchFile.type, status: 'done' }] : [],
    beforeUpload: (nextFile) => {
      setPatchFile(nextFile);
      return false;
    },
    onRemove: () => {
      setPatchFile(null);
      return true;
    },
  };
  const patchMediaUploadProps: UploadProps = {
    accept: 'image/*,audio/*,video/*',
    multiple: true,
    fileList: sortedUploadFiles(patchMediaFiles).map((mediaFile) => ({ uid: uploadFileUid(mediaFile), name: mediaFile.name, size: mediaFile.size, type: mediaFile.type, status: 'done' })),
    beforeUpload: (nextFile) => {
      if (!isAllowedDatasetMediaFile(nextFile)) {
        showToast('error', '多模态素材仅支持安全的图片、音频或视频文件。');
        return Upload.LIST_IGNORE;
      }
      setPatchMediaFiles((current) => {
        const uid = uploadFileUid(nextFile);
        if (current.some((item) => uploadFileUid(item) === uid)) return current;
        return [...current, nextFile];
      });
      return false;
    },
    onRemove: (removedFile) => {
      setPatchMediaFiles((current) => current.filter((item) => uploadFileUid(item) !== removedFile.uid));
      return true;
    },
  };
  const filteredDatasets = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return datasets.filter((dataset) => {
      const matchesFormat = formatFilter === 'all' || dataset.source_format.toLowerCase() === formatFilter;
      if (!matchesFormat) return false;
      if (!keyword) return true;
      return [
        dataset.name,
        dataset.description ?? '',
        dataset.source_format,
        ...dataset.columns.map((column) => column.name),
      ].some((value) => value.toLowerCase().includes(keyword));
    });
  }, [datasets, formatFilter, query]);
  const datasetStats = useMemo(() => ({
    count: datasets.length,
    rows: datasets.reduce((total, dataset) => total + dataset.row_count, 0),
    mapping: datasets.reduce((total, dataset) => total + dataset.columns.filter((column) => column.use_in_mapping !== false).length, 0),
    derived: datasets.reduce((total, dataset) => total + dataset.columns.filter((column) => column.derived).length, 0),
  }), [datasets]);
  const safeDatasetCardPage = safeCardPage(filteredDatasets.length, cardPage, cardPageSize);
  const visibleDatasetCards = paginateCards(filteredDatasets, cardPage, cardPageSize);

  const backToList = useCallback(() => {
    if (unsaved || tableEditorDirty) {
      setBackConfirmOpen(true);
      return;
    }
    setEditing(null);
    setUnsaved(false);
    setTableEditorDirty(false);
    setTableEditorFullscreen(false);
    setActionError(null);
  }, [tableEditorDirty, unsaved]);

  const confirmBackToList = useCallback(() => {
    setBackConfirmOpen(false);
    setEditing(null);
    setUnsaved(false);
    setTableEditorDirty(false);
    setTableEditorFullscreen(false);
    setActionError(null);
  }, []);

  useEffect(() => {
    if (!team) return;
    void listDatasets(team.team_id)
      .then((data) => {
        setDatasets(data.items);
        setSelected((current) => {
          if (!current) return data.items[0] ?? null;
          const fresh = data.items.find((item) => item.dataset_id === current.dataset_id);
          return fresh ? mergeDatasetPayload(current, fresh) : current;
        });
      })
      .catch(() => setDatasets([]));
  }, [team]);

  useEffect(() => {
    if (!editing) {
      onBreadcrumbTailChange?.(null);
      return;
    }
    onBreadcrumbTailChange?.({
      key: editing.dataset_id,
      parentKey: 'datasets',
      label: editing.name || '数据集详情',
      parentLabel: '数据集管理',
      parentOnClick: backToList,
      title: editing.name || '数据集详情',
    });
    return () => onBreadcrumbTailChange?.(null);
  }, [editing, onBreadcrumbTailChange, backToList]);

  useActionErrorToast(actionError, setActionError, showToast);

  useEffect(() => {
    if (!editing) {
      setTableDraftRows([]);
      setTableDraftColumns([]);
      setTableEditorDirty(false);
      return;
    }
    setTableDraftRows(cloneDatasetRows(editing.rows ?? editing.preview_rows ?? []));
    setTableDraftColumns(editing.columns);
    setTableEditorDirty(false);
    setPatchForm((current) => ({ ...current, primaryKey: current.primaryKey || editing.columns[0]?.name || '' }));
  }, [editing?.dataset_id]);

  const openDatasetDetail = async (dataset: DatasetPayload, initialTab: DatasetDetailTab = 'sample') => {
    if (!team) return;
    setActionError(null);
    try {
      const detail = dataset.rows ? dataset : await getDataset(team.team_id, dataset.dataset_id);
      setSelected(detail);
      setEditing(detail);
      setTableEditorFullscreen(false);
      setDatasetMetaForm({ name: detail.name, description: detail.description ?? '' });
      setTableDraftRows(cloneDatasetRows(detail.rows ?? detail.preview_rows ?? []));
      setTableDraftColumns(detail.columns);
      setTableEditorDirty(false);
      setColumnWidths((current) => loadDatasetColumnWidths(detail.dataset_id, detail.columns, current));
      setDetailTab(initialTab);
      setPreviewPage(1);
      setSampleIndex(0);
      setSampleKeyword('');
      setSampleFilter('all');
      setUnsaved(false);
      setDatasets((items) => items.map((item) => item.dataset_id === detail.dataset_id ? mergeDatasetPayload(item, detail) : item));
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '数据集详情加载失败');
    }
  };

  const updateActiveDataset = (dataset: DatasetPayload, dirty = true) => {
    setEditing(dataset);
    setSelected(dataset);
    if (dirty) setUnsaved(true);
  };

  const refreshDatasets = async () => {
    if (!team) return;
    setActionError(null);
    try {
      const data = await listDatasets(team.team_id);
      setDatasets(data.items);
      setSelected((current) => {
        if (!current) return data.items[0] ?? null;
        const fresh = data.items.find((item) => item.dataset_id === current.dataset_id);
        return fresh ? mergeDatasetPayload(current, fresh) : data.items[0] ?? current;
      });
      setEditing((current) => {
        if (!current) return current;
        const fresh = data.items.find((item) => item.dataset_id === current.dataset_id);
        return fresh ? mergeDatasetPayload(current, fresh) : current;
      });
      showToast('success', '数据集列表已刷新。');
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '数据集刷新失败');
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!team || !file) return;
    setSubmitting(true);
    setActionError(null);
    const uploadFiles = [file, ...mediaFiles];
    const totalBytes = totalUploadFileBytes(uploadFiles);
    setUploadProgress({ mode: 'import', fileCount: uploadFiles.length, totalBytes, loaded: 0, total: totalBytes, percent: 0, lengthComputable: totalBytes > 0 });
    try {
      const mediaAssets = form.media.split('\n').map((line) => line.trim()).filter(Boolean).map((url) => ({ url, type: inferMediaType(url) }));
      const created = await uploadDataset(team.team_id, { name: form.name, description: form.description, file, mediaFiles, mediaAssets }, (progress) => {
        setUploadProgress({
          mode: 'import',
          fileCount: uploadFiles.length,
          totalBytes,
          loaded: progress.loaded,
          total: progress.total || totalBytes,
          percent: progress.percent,
          lengthComputable: progress.lengthComputable,
        });
      });
      setUploadProgress((current) => current?.mode === 'import' ? { ...current, loaded: current.total || totalBytes, total: current.total || totalBytes, percent: 100 } : current);
      const createdWithLocalMedia = created;
      setDatasets((items) => [createdWithLocalMedia, ...items]);
      setSelected(createdWithLocalMedia);
      setEditing(null);
      setDatasetMetaForm({ name: createdWithLocalMedia.name, description: createdWithLocalMedia.description ?? '' });
      setColumnWidths((current) => loadDatasetColumnWidths(createdWithLocalMedia.dataset_id, createdWithLocalMedia.columns, current));
      setDetailTab('sample');
      setPreviewPage(1);
      setSampleIndex(0);
      setUnsaved(false);
      setAutoSaveState('idle');
      setForm({ name: '', description: '', media: '' });
      setFile(null);
      setMediaFiles([]);
      showToast('success', '数据集已导入，已返回数据集管理列表。');
      setImportOpen(false);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '数据集导入失败');
    } finally {
      setSubmitting(false);
      window.setTimeout(() => setUploadProgress((current) => current?.mode === 'import' ? null : current), 500);
    }
  };

  const saveDatasetChanges = useCallback(async (autoSaved = false) => {
    if (!team || !activeDataset) return false;
    setActionError(null);
    if (autoSaved) setAutoSaveState('saving');
    try {
      const response = await updateDataset(team.team_id, activeDataset.dataset_id, {
        name: datasetMetaForm.name.trim() || activeDataset.name,
        description: datasetMetaForm.description,
        columns: activeDataset.columns.map((column) => ({ name: column.name, comment: column.comment, use_in_mapping: column.use_in_mapping })),
      });
      const updated = preserveDatasetMultimodalState(activeDataset, response);
      setSelected((current) => current?.dataset_id === updated.dataset_id ? mergeDatasetPayload(current, updated) : updated);
      setEditing((current) => current?.dataset_id === updated.dataset_id ? mergeDatasetPayload(current, updated) : current);
      setDatasetMetaForm({ name: updated.name, description: updated.description ?? '' });
      setDatasets((items) => items.map((item) => (item.dataset_id === updated.dataset_id ? mergeDatasetPayload(item, updated) : item)));
      setUnsaved(false);
      if (autoSaved) {
        setAutoSaveState('saved');
        showToast('success', '数据集已自动保存。');
      } else {
        setAutoSaveState('idle');
        showToast('success', '数据集基础信息、列备注和参与映射设置已保存。');
      }
      return true;
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '数据集保存失败');
      setAutoSaveState('error');
      return false;
    }
  }, [activeDataset, datasetMetaForm.description, datasetMetaForm.name, team]);

  const saveDatasetTableChanges = async () => {
    if (!team || !activeDataset) return;
    setSubmitting(true);
    setActionError(null);
    try {
      const updated = await updateDatasetTable(team.team_id, activeDataset.dataset_id, {
        columns: tableDraftColumns.map((column) => ({
          name: column.name,
          data_type: column.data_type,
          comment: column.comment,
          use_in_mapping: column.use_in_mapping,
        })),
        rows: tableDraftRows,
      });
      setSelected((current) => current?.dataset_id === updated.dataset_id ? mergeDatasetPayload(current, updated) : updated);
      setEditing((current) => current?.dataset_id === updated.dataset_id ? mergeDatasetPayload(current, updated) : current);
      setDatasets((items) => items.map((item) => (item.dataset_id === updated.dataset_id ? mergeDatasetPayload(item, updated) : item)));
      setTableDraftRows(cloneDatasetRows(updated.rows ?? updated.preview_rows ?? []));
      setTableDraftColumns(updated.columns);
      setColumnWidths((current) => loadDatasetColumnWidths(updated.dataset_id, updated.columns, current));
      setPreviewPage(1);
      setSampleIndex(0);
      setTableEditorDirty(false);
      showToast('success', '数据表行列修改已保存，多模态预览和上下文已刷新。');
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '数据表保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const submitPatchUpload = async () => {
    if (!team || !activeDataset || !patchFile) return;
    setPatchSubmitting(true);
    setActionError(null);
    const uploadFiles = [patchFile, ...patchMediaFiles];
    const totalBytes = totalUploadFileBytes(uploadFiles);
    setUploadProgress({ mode: 'patch', fileCount: uploadFiles.length, totalBytes, loaded: 0, total: totalBytes, percent: 0, lengthComputable: totalBytes > 0 });
    try {
      const mediaAssets = patchForm.media.split('\n').map((line) => line.trim()).filter(Boolean).map((url) => ({ url, type: inferMediaType(url) }));
      const updated = await patchUploadDataset(team.team_id, activeDataset.dataset_id, {
        primaryKey: patchForm.primaryKey,
        file: patchFile,
        mediaFiles: patchMediaFiles,
        mediaAssets,
      }, (progress) => {
        setUploadProgress({
          mode: 'patch',
          fileCount: uploadFiles.length,
          totalBytes,
          loaded: progress.loaded,
          total: progress.total || totalBytes,
          percent: progress.percent,
          lengthComputable: progress.lengthComputable,
        });
      });
      setUploadProgress((current) => current?.mode === 'patch' ? { ...current, loaded: current.total || totalBytes, total: current.total || totalBytes, percent: 100 } : current);
      setSelected((current) => current?.dataset_id === updated.dataset_id ? mergeDatasetPayload(current, updated) : updated);
      setEditing((current) => current?.dataset_id === updated.dataset_id ? mergeDatasetPayload(current, updated) : current);
      setDatasets((items) => items.map((item) => (item.dataset_id === updated.dataset_id ? mergeDatasetPayload(item, updated) : item)));
      setTableDraftRows(cloneDatasetRows(updated.rows ?? updated.preview_rows ?? []));
      setTableDraftColumns(updated.columns);
      setColumnWidths((current) => loadDatasetColumnWidths(updated.dataset_id, updated.columns, current));
      setPreviewPage(1);
      setSampleIndex(0);
      setTableEditorDirty(false);
      setPatchFile(null);
      setPatchMediaFiles([]);
      setPatchForm({ primaryKey: patchForm.primaryKey, media: '' });
      setPatchUploadOpen(false);
      const summary = updated.merge_summary;
      showToast('success', summary ? `补上传合并完成：命中 ${summary.matched_rows} 行，追加 ${summary.appended_rows} 行。` : '补上传合并完成。');
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '补上传合并失败');
    } finally {
      setPatchSubmitting(false);
      window.setTimeout(() => setUploadProgress((current) => current?.mode === 'patch' ? null : current), 500);
    }
  };

  const bindMediaAssetToRow = async (payload: {
    asset_index: number;
    row_index: number;
    role?: 'primary' | 'context' | 'evidence';
    field?: string | null;
    media_type?: string | null;
  }) => {
    if (!team || !activeDataset) return;
    setMediaBindingSubmitting(true);
    setActionError(null);
    try {
      const updated = await bindDatasetMediaAsset(team.team_id, activeDataset.dataset_id, payload);
      setSelected((current) => current?.dataset_id === updated.dataset_id ? mergeDatasetPayload(current, updated) : updated);
      setEditing((current) => current?.dataset_id === updated.dataset_id ? mergeDatasetPayload(current, updated) : current);
      setDatasets((items) => items.map((item) => (item.dataset_id === updated.dataset_id ? mergeDatasetPayload(item, updated) : item)));
      setTableDraftRows(cloneDatasetRows(updated.rows ?? updated.preview_rows ?? []));
      setTableDraftColumns(updated.columns);
      setColumnWidths((current) => loadDatasetColumnWidths(updated.dataset_id, updated.columns, current));
      setPreviewPage(1);
      setSampleIndex(Math.min(payload.row_index, Math.max(0, (updated.rows ?? updated.preview_rows ?? []).length - 1)));
      setTableEditorDirty(false);
      setUnsaved(false);
      showToast('success', '素材已绑定到数据行，行级媒体和上下文已刷新。');
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '素材绑定失败');
    } finally {
      setMediaBindingSubmitting(false);
    }
  };

  const updateColumnWidth = (datasetId: string, columnName: string, width: number) => {
    setColumnWidths((current) => {
      const next = { ...current, [columnName]: clampColumnWidth(width) };
      saveDatasetColumnWidths(datasetId, next);
      return next;
    });
  };

  useEffect(() => {
    if (!editing || !unsaved) return undefined;
    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = window.setTimeout(() => {
      void saveDatasetChanges(true);
    }, 5000);
    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [editing, saveDatasetChanges, unsaved]);

  const addDerivedColumn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!team || !activeDataset) return;
    setActionError(null);
    try {
      const response = await updateDataset(team.team_id, activeDataset.dataset_id, {
        derived_columns: [{
          name: variableForm.name.trim(),
          data_type: variableForm.data_type,
          comment: variableForm.comment,
          use_in_mapping: variableForm.use_in_mapping,
          source_column: variableForm.source_column || null,
          default_value: variableForm.default_value || null,
          expression: variableForm.expression || null,
        }],
      });
      const updated = preserveDatasetMultimodalState(activeDataset, response);
      setSelected((current) => current?.dataset_id === updated.dataset_id ? mergeDatasetPayload(current, updated) : updated);
      setEditing((current) => current?.dataset_id === updated.dataset_id ? mergeDatasetPayload(current, updated) : current);
      setColumnWidths((current) => loadDatasetColumnWidths(updated.dataset_id, updated.columns, current));
      setDatasets((items) => items.map((item) => (item.dataset_id === updated.dataset_id ? mergeDatasetPayload(item, updated) : item)));
      setUnsaved(false);
      showToast('success', `变量 ${variableForm.name.trim()} 已添加，可在模板预览和发布映射中使用。`);
      setVariableForm((current) => ({ ...current, name: nextVariableName(updated.columns), comment: '' }));
      setVariableOpen(false);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '变量添加失败');
    }
  };

  const removeDataset = async (dataset: DatasetPayload) => {
    if (!team) return;
    try {
      await deleteDataset(team.team_id, dataset.dataset_id);
      setDatasets((items) => items.filter((item) => item.dataset_id !== dataset.dataset_id));
      if (selected?.dataset_id === dataset.dataset_id) setSelected(null);
      if (editing?.dataset_id === dataset.dataset_id) setEditing(null);
      showToast('success', `数据集 ${dataset.name} 已删除。`);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '数据集删除失败');
    }
  };

  const downloadSelected = async (format: 'json' | 'jsonl' | 'csv', dataset = activeDataset) => {
    if (!team || !dataset) return;
    try {
      const blob = await downloadDataset(team.team_id, dataset.dataset_id, format);
      const filename = `${dataset.name}.${format}`;
      downloadBlob(blob, filename);
      showToast('success', `数据集已准备下载：${filename}`);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '数据集下载失败');
    }
  };

  if (loading) return <main className="workspace-content workspace-loading-page"><WorkspaceLoading tip="正在加载企业信息" /></main>;
  if (error || !team) return <main className="workspace-content workspace-status-page"><Alert className="workspace-page-alert" type="warning" showIcon title={error || '请先完成企业企业配置。'} /></main>;

  const formatOptions = Array.from(new Set(datasets.map((dataset) => dataset.source_format.toLowerCase()).filter(Boolean)));
  const datasetColumns: ColumnsType<DatasetPayload> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      sorter: (left: DatasetPayload, right: DatasetPayload) => compareText(left.name, right.name),
      render: (_: unknown, dataset: DatasetPayload) => (
        <button type="button" className="table-link-cell" onClick={() => setSelected(dataset)}>
          <DatabaseOutlined aria-hidden="true" />
          <strong>{dataset.name}</strong>
          <span>{dataset.description || '暂无简介'}</span>
        </button>
      ),
    },
    {
      title: '格式/状态',
      key: 'format_status',
      width: 132,
      filters: buildTableFilterOptions(datasets.map((dataset) => dataset.source_format.toUpperCase())),
      filterSearch: true,
      onFilter: (value: boolean | React.Key, dataset: DatasetPayload) => dataset.source_format.toUpperCase() === String(value),
      render: (_: unknown, dataset: DatasetPayload) => (
        <span className="task-meta-stack">
          <small><Tag color="blue">{dataset.source_format.toUpperCase()}</Tag></small>
          {dataset.status !== 'ready' ? <small><Tag color={dataset.status === 'failed' ? 'red' : 'default'}>{dataset.status}</Tag></small> : null}
        </span>
      ),
    },
    {
      title: '负责人',
      key: 'owner',
      width: 138,
      sorter: (left: DatasetPayload, right: DatasetPayload) => compareText(datasetResponsibleDisplayName(left), datasetResponsibleDisplayName(right)),
      render: (_: unknown, dataset: DatasetPayload) => <Tag color="blue">{datasetResponsibleDisplayName(dataset)}</Tag>,
    },
    {
      title: '数据规模',
      key: 'scale',
      width: 150,
      sorter: (left: DatasetPayload, right: DatasetPayload) => compareNumber(left.row_count, right.row_count),
      render: (_: unknown, dataset: DatasetPayload) => (
        <span className="task-progress-cell">
          <strong>{dataset.row_count} 行</strong>
          <small>{dataset.columns.length} 字段 · {datasetMediaSummary(dataset).bound} 已绑定媒体</small>
        </span>
      ),
    },
    {
      title: '字段配置',
      key: 'mapping',
      width: 180,
      filters: [
        { text: '有衍生变量', value: 'derived' },
        { text: '可映射字段 > 0', value: 'ready' },
      ],
      onFilter: (value: boolean | React.Key, dataset: DatasetPayload) => {
        const ready = dataset.columns.filter((column) => column.use_in_mapping !== false).length;
        const derived = dataset.columns.filter((column) => column.derived).length;
        if (value === 'derived') return derived > 0;
        if (value === 'ready') return ready > 0;
        return true;
      },
      render: (_: unknown, dataset: DatasetPayload) => {
        const ready = dataset.columns.filter((column) => column.use_in_mapping !== false).length;
        const derived = dataset.columns.filter((column) => column.derived).length;
        return (
          <span className="task-meta-stack">
            <small>{ready} 个可映射字段</small>
            <small>{derived > 0 ? `${derived} 个渲染变量` : '暂无渲染变量'}</small>
          </span>
        );
      },
    },
    {
      title: '最近更新',
      key: 'updated_at',
      width: 150,
      sorter: (left: DatasetPayload, right: DatasetPayload) => compareDateTime(left.updated_at || left.created_at, right.updated_at || right.created_at),
      render: (_: unknown, dataset: DatasetPayload) => formatDateTime(dataset.updated_at || dataset.created_at),
    },
    {
      title: '操作',
      key: 'actions',
      width: 116,
      fixed: 'right',
      className: 'workspace-table-action-cell',
      render: (_: unknown, dataset: DatasetPayload) => (
        <WorkspaceTableActions
          visible={[
            { key: 'edit', label: '修改数据集', icon: <EditOutlined />, onClick: () => void openDatasetDetail(dataset) },
            {
              key: 'delete',
              label: '删除数据集',
              icon: <DeleteOutlined />,
              danger: true,
              onClick: () => void removeDataset(dataset),
              confirm: { title: '删除数据集', content: '删除后可能影响草稿任务或模板映射，确定继续？', okText: '删除' },
            },
          ]}
          menu={[
            { key: 'json', label: '下载 JSON', icon: <DownloadOutlined />, onClick: () => void downloadSelected('json', dataset) },
            { key: 'jsonl', label: '下载 JSONL', icon: <DownloadOutlined />, onClick: () => void downloadSelected('jsonl', dataset) },
            { key: 'csv', label: '下载 CSV', icon: <DownloadOutlined />, onClick: () => void downloadSelected('csv', dataset) },
          ]}
        />
      ),
    },
  ];

  const fieldColumns = activeDataset ? [
    {
      title: '映射',
      key: 'mapping',
      width: 86,
      render: (_: unknown, column: DatasetColumn) => (
        <Checkbox
          aria-label={`${column.name} 参与映射`}
          checked={column.use_in_mapping !== false}
          onChange={(event) => updateActiveDataset({
            ...activeDataset,
            columns: activeDataset.columns.map((item) => item.name === column.name ? { ...item, use_in_mapping: event.target.checked } : item),
          })}
        />
      ),
    },
    {
      title: '原始字段名',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, column: DatasetColumn) => (
        <div className="field-name-cell">
          <strong>{name}</strong>
          {column.derived ? <Tag color="purple">派生变量</Tag> : <Tag>原始列</Tag>}
        </div>
      ),
    },
    {
      title: '类型',
      dataIndex: 'data_type',
      key: 'data_type',
      width: 100,
      render: (type: string) => <Tag color="blue">{type}</Tag>,
    },
    {
      title: '来源',
      dataIndex: 'source_column',
      key: 'source',
      width: 150,
      render: (source: string | null | undefined) => source || '原始列',
    },
    {
      title: '备注 / 展示说明',
      dataIndex: 'comment',
      key: 'comment',
      render: (_: unknown, column: DatasetColumn) => (
        <Input
          aria-label={`${column.name} 备注`}
          value={column.comment || ''}
          placeholder="例如：模板展示标题、发布映射候选"
          onChange={(event) => updateActiveDataset({
            ...activeDataset,
            columns: activeDataset.columns.map((item) => item.name === column.name ? { ...item, comment: event.target.value } : item),
          })}
        />
      ),
    },
  ] : [];

  return (
    <main className={[
      'workspace-content production-page production-list-page dataset-workbench-page workspace-fixed-page',
      tableEditorFullscreen ? 'dataset-table-editor-fullscreen-active' : '',
    ].filter(Boolean).join(' ')}>
      {!editing && (
        <>
          <section className="page-heading dataset-list-heading">
            <div>
              <p className="section-kicker">Datasets</p>
              <h1>数据集管理</h1>
            </div>
            <div className="page-actions">
              <AntButton icon={<ReloadOutlined />} onClick={() => void refreshDatasets()}>刷新</AntButton>
              <AntButton icon={<UploadOutlined />} type="primary" onClick={() => setImportOpen(true)}>导入数据集</AntButton>
            </div>
          </section>

          <WorkspaceSummaryStrip
            ariaLabel="数据集状态概览"
            items={[
              { key: 'count', label: '数据集', value: datasetStats.count },
              { key: 'rows', label: '总行数', value: datasetStats.rows },
              { key: 'mapping', label: '可映射字段', value: datasetStats.mapping },
              { key: 'derived', label: '渲染变量', value: datasetStats.derived },
            ]}
          />
        </>
      )}

      {!editing && (
        <>
          <section className="production-filter-bar workspace-fixed-toolbar">
            <Input.Search className="production-filter-search" allowClear placeholder="搜索名称、简介或字段" value={query} onChange={(event) => { setQuery(event.target.value); setCardPage(1); }} />
            <Select
              className="production-filter-select"
              value={formatFilter}
              onChange={(value) => { setFormatFilter(value); setCardPage(1); }}
              getPopupContainer={workspacePopupContainer}
              options={[{ value: 'all', label: '全部格式' }, ...formatOptions.map((format) => ({ value: format, label: format.toUpperCase() }))]}
            />
            <Segmented<ProductionViewMode>
              className="production-view-switch"
              aria-label="数据集展示方式"
              value={viewMode}
              onChange={setViewMode}
              options={productionViewOptions}
            />
          </section>
          {viewMode === 'table' ? (
            <section className="production-table-shell workspace-fixed-table-panel">
              <EnhancedTable
                className="workspace-fixed-table"
                dataSource={filteredDatasets}
                columns={datasetColumns}
                rowKey="dataset_id"
                locale={{ emptyText: '暂无数据集，先导入一个文件。' }}
                pagination={fixedTablePagination(filteredDatasets.length)}
                scroll={{ y: 'calc(var(--workspace-table-body-height) - 84px)' }}
                tableLayout="fixed"
              />
            </section>
          ) : (
            <section className="production-card-shell workspace-fixed-table-panel" aria-label="数据集卡片列表">
              <div className="production-card-scroll">
                {filteredDatasets.length ? (
                  <div className="production-card-grid">
                    {visibleDatasetCards.map((dataset) => {
                      const ready = dataset.columns.filter((column) => column.use_in_mapping !== false).length;
                      const derived = dataset.columns.filter((column) => column.derived).length;
                      return (
                        <AntCard
                          className="production-card dataset-production-card"
                          key={dataset.dataset_id}
                          role="button"
                          tabIndex={0}
                          onClick={() => void openDatasetDetail(dataset)}
                          onKeyDown={(event) => activateCardFromKeyboard(event, () => { void openDatasetDetail(dataset); })}
                        >
                          <div className="production-card-topline">
                            <div className="production-card-badges">
                              <Tag color="blue">{dataset.source_format.toUpperCase()}</Tag>
                              {dataset.status !== 'ready' ? <Tag color={dataset.status === 'failed' ? 'red' : 'default'}>{dataset.status}</Tag> : null}
                            </div>
                            <span className="production-card-status">{formatDateTime(dataset.updated_at || dataset.created_at)}</span>
                          </div>
                          <div className="production-card-body">
                            <h3>{dataset.name}</h3>
                            <p>{dataset.description || '暂无简介'}</p>
                          </div>
                          <div className="production-card-owner">
                            <span>最新修改人</span>
                            <Tag color="blue">{datasetResponsibleDisplayName(dataset)}</Tag>
                          </div>
                          <div className="production-card-metrics" aria-label="数据集关键指标">
                            <span><strong>{dataset.row_count}</strong><small>行数</small></span>
                            <span><strong>{dataset.columns.length}</strong><small>字段</small></span>
                            <span><strong>{ready}</strong><small>可映射</small></span>
                            <span><strong>{datasetMediaSummary(dataset).bound}</strong><small>媒体</small></span>
                          </div>
                          <div className="production-card-tags">
                            {derived > 0 ? <Tag color="purple">{derived} 渲染变量</Tag> : <Tag>无渲染变量</Tag>}
                            <Tag color={ready > 0 ? 'green' : 'orange'}>{ready > 0 ? '映射就绪' : '待配置映射'}</Tag>
                            {datasetMediaSummary(dataset).types.map((type) => <Tag key={type} color={mediaTypeColor(type)}>{mediaTypeLabel(type)}</Tag>)}
                          </div>
                          <div className="production-card-actions dataset-card-actions">
                            <AntButton icon={<EditOutlined />} size="small" type="primary" onClick={(event) => { event.stopPropagation(); void openDatasetDetail(dataset); }}>修改</AntButton>
                            <Dropdown
                              getPopupContainer={() => document.body}
                              menu={{
                                items: [
                                  { key: 'json', label: '下载 JSON' },
                                  { key: 'jsonl', label: '下载 JSONL' },
                                  { key: 'csv', label: '下载 CSV' },
                                ],
                                onClick: ({ key }) => void downloadSelected(key as 'json' | 'jsonl' | 'csv', dataset),
                              }}
                            >
                              <AntButton icon={<DownloadOutlined />} size="small" onClick={(event) => event.stopPropagation()}>导出</AntButton>
                            </Dropdown>
                            <Popconfirm title="删除数据集" description="删除后可能影响草稿任务或模板映射，确定继续？" onConfirm={() => void removeDataset(dataset)}>
                              <AntButton icon={<DeleteOutlined />} size="small" danger onClick={(event) => event.stopPropagation()}>删除</AntButton>
                            </Popconfirm>
                          </div>
                        </AntCard>
                      );
                    })}
                  </div>
                ) : (
                  <Empty className="production-card-empty" description="暂无数据集，先导入一个文件。" />
                )}
              </div>
              <div className="production-card-pagination">
                <Pagination
                  current={safeDatasetCardPage}
                  pageSize={cardPageSize}
                  total={filteredDatasets.length}
                  showSizeChanger
                  showQuickJumper
                  pageSizeOptions={productionCardPageSizeOptions.map(String)}
                  onChange={(page, pageSize) => {
                    setCardPage(page);
                    setCardPageSize(pageSize);
                  }}
                />
              </div>
            </section>
          )}
        </>
      )}

      {editing && (
        <section className={`dataset-detail-page${tableEditorFullscreen ? ' dataset-table-fullscreen-page' : ''}`}>
          {tableEditorFullscreen ? (
            <DatasetTableEditor
              columns={userEditableDatasetColumns(tableDraftColumns)}
              rows={tableDraftRows}
              newColumnName={newColumnName}
              dirty={tableEditorDirty}
              saving={submitting}
              fullscreen
              onToggleFullscreen={() => setTableEditorFullscreen(false)}
              onNewColumnNameChange={setNewColumnName}
              onColumnsChange={(columns) => {
                setTableDraftColumns(mergeVisibleDatasetColumns(tableDraftColumns, columns));
                setTableEditorDirty(true);
              }}
              onRowsChange={(rows) => {
                setTableDraftRows(rows);
                setTableEditorDirty(true);
              }}
              onSave={() => void saveDatasetTableChanges()}
              onReset={() => {
                setTableDraftRows(cloneDatasetRows(editing.rows ?? editing.preview_rows ?? []));
                setTableDraftColumns(editing.columns);
                setTableEditorDirty(false);
              }}
            />
          ) : (
            <>
              <DatasetDetailWorkbench
                dataset={editing}
                activeTab={detailTab}
                filteredSampleEntries={filteredSampleEntries}
                sampleIndex={safeSampleIndex}
                sampleKeyword={sampleKeyword}
                sampleFilter={sampleFilter}
                activeSample={activeSample}
                mappingColumns={mappingColumns}
                derivedColumns={derivedColumns}
                mediaSummary={activeMediaSummary}
                unsaved={unsaved}
                tableEditorDirty={tableEditorDirty}
                autoSaveState={autoSaveState}
                datasetMetaForm={datasetMetaForm}
                fieldColumns={fieldColumns}
                tableDraftColumns={tableDraftColumns}
                tableDraftRows={tableDraftRows}
                newColumnName={newColumnName}
                submitting={submitting}
                mediaBindingSubmitting={mediaBindingSubmitting}
                onTabChange={setDetailTab}
                onSampleKeywordChange={setSampleKeyword}
                onSampleFilterChange={setSampleFilter}
                onSampleIndexChange={setSampleIndex}
                onMetaFormChange={(next) => { setDatasetMetaForm(next); setUnsaved(true); }}
                onBack={backToList}
                onPatchUpload={() => setPatchUploadOpen(true)}
                onDownload={(format) => void downloadSelected(format, editing)}
                onOpenTemplate={onOpenTemplate}
                onOpenPublish={onOpenPublish}
                onSave={() => void saveDatasetChanges(false)}
                onTableFullscreen={() => setTableEditorFullscreen(true)}
                onNewColumnNameChange={setNewColumnName}
                onTableColumnsChange={(columns) => {
                  setTableDraftColumns(columns);
                  setTableEditorDirty(true);
                }}
                onTableRowsChange={(rows) => {
                  setTableDraftRows(rows);
                  setTableEditorDirty(true);
                }}
                onSaveTable={() => void saveDatasetTableChanges()}
                onResetTable={() => {
                  setTableDraftRows(cloneDatasetRows(editing.rows ?? editing.preview_rows ?? []));
                  setTableDraftColumns(editing.columns);
                  setTableEditorDirty(false);
                }}
                onAddVariable={() => setVariableOpen(true)}
                onBindAsset={(payload) => void bindMediaAssetToRow(payload)}
              />
            </>
          )}
        </section>
      )}

      <Modal
        title="返回数据集管理？"
        open={backConfirmOpen}
        centered
        okText="确认返回"
        cancelText="继续编辑"
        onOk={confirmBackToList}
        onCancel={() => setBackConfirmOpen(false)}
      >
        <p>当前数据集还有未保存修改，返回后将放弃本次未保存内容。</p>
      </Modal>

      <Modal
        title="导入数据集"
        modalRender={(node) => <div aria-label="导入数据集">{node}</div>}
        open={importOpen}
        centered
        destroyOnHidden
        width={820}
        className="dataset-import-modal"
        confirmLoading={submitting}
        okText="导入并解析"
        cancelText="取消"
        okButtonProps={{ disabled: !file || form.name.trim().length < 2 }}
        onCancel={() => {
          if (submitting) return;
          setImportOpen(false);
        }}
        onOk={() => {
          const fakeEvent = { preventDefault() {} } as FormEvent<HTMLFormElement>;
          void submit(fakeEvent);
        }}
      >
        <Form layout="vertical" className="dataset-modal-form">
          <Divider className="dataset-import-divider" plain>基础信息</Divider>
          <Form.Item label="数据集名称" required>
            <Input aria-label="数据集名称" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Form.Item>
          <Form.Item label="简介">
            <Input.TextArea aria-label="简介" value={form.description} autoSize={{ minRows: 2, maxRows: 4 }} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </Form.Item>
          <Divider className="dataset-import-divider" plain>数据文件</Divider>
          <Form.Item label="数据文件 / Manifest" required extra={file ? `已选择：${file.name}` : '普通表格可直接导入；多模态数据推荐 Manifest JSONL。支持 CSV、Excel、JSON、JSONL；Manifest JSONL 可声明 data/media/attachments/derived_context，图片、音频、视频 URL 会自动识别为行级媒体。'}>
            <Upload.Dragger {...datasetFileUploadProps} className="dataset-upload-dragger" aria-label="表格文件">
              <p className="ant-upload-drag-icon"><UploadOutlined /></p>
              <p className="ant-upload-text">点击或拖拽数据文件到这里</p>
              <p className="ant-upload-hint">CSV / Excel / JSON / JSONL；Manifest JSONL 适合图片、音频、视频混合数据。</p>
            </Upload.Dragger>
          </Form.Item>
          <Divider className="dataset-import-divider" plain>追加素材</Divider>
          <Form.Item label="追加图片/音频/视频素材" extra={mediaFiles.length ? `已选择 ${mediaFiles.length} 个文件` : '可选。建议通过 Manifest 或同名 URL/文件名列绑定到具体样本；单独上传但无法绑定到行的素材会作为未绑定素材保留，不会默认进入 AI 或 Reviewer 上下文。'}>
            <Upload.Dragger {...mediaUploadProps} className="dataset-upload-dragger dataset-media-upload-dragger" aria-label="图片/音频/视频素材">
              <p className="ant-upload-drag-icon"><UploadOutlined /></p>
              <p className="ant-upload-text">点击或拖拽图片、音频、视频素材</p>
              <p className="ant-upload-hint">适合少量补充素材；批量多模态数据建议放进 Manifest 逐行声明。</p>
            </Upload.Dragger>
          </Form.Item>
          {renderDatasetUploadProgress(currentImportProgress, importUploadFiles)}
          <Divider className="dataset-import-divider" plain>外部素材</Divider>
          <Form.Item label="外部素材 URL / 对象存储路径" extra="每行一个外部素材地址。无法绑定到具体样本的 URL 会作为未绑定素材保留。">
            <Input.TextArea
              aria-label="外部素材 URL / 对象存储路径"
              value={form.media}
              autoSize={{ minRows: 3, maxRows: 5 }}
              placeholder="每行一个图片、音频、视频或文档 URL/路径；如果表格行中已包含 URL 列，可以不填这里。"
              onChange={(event) => setForm({ ...form, media: event.target.value })}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="补上传并按主值合并"
        modalRender={(node) => <div aria-label="补上传并按主值合并">{node}</div>}
        open={patchUploadOpen && Boolean(activeDataset)}
        centered
        destroyOnHidden
        width={780}
        className="dataset-import-modal"
        confirmLoading={patchSubmitting}
        okText="解析并合并"
        cancelText="取消"
        okButtonProps={{ disabled: !patchFile || !patchForm.primaryKey }}
        onCancel={() => {
          if (patchSubmitting) return;
          setPatchUploadOpen(false);
        }}
        onOk={() => void submitPatchUpload()}
      >
        <Form layout="vertical" className="dataset-modal-form">
          <Alert
            className="dataset-modal-alert"
            type="info"
            showIcon
            title="补上传会按主值字段对齐：命中的行更新字段和媒体，未命中的行追加到数据集；不会删除原有行。"
          />
          <Form.Item label="用于对齐的主值字段" required extra="两个数据集都必须包含这个字段，例如 row_id、external_id、sample_id。">
            <Select
              aria-label="用于对齐的主值字段"
              value={patchForm.primaryKey || undefined}
              placeholder="选择主值字段"
              options={(activeDataset?.columns ?? []).map((column) => ({ value: column.name, label: column.name }))}
              getPopupContainer={(triggerNode) => triggerNode.parentElement ?? document.body}
              onChange={(value) => setPatchForm({ ...patchForm, primaryKey: value })}
            />
          </Form.Item>
          <Form.Item label="补充数据文件 / Manifest" required extra={patchFile ? `已选择：${patchFile.name}` : '支持 CSV / Excel / JSON / JSONL；多模态补上传推荐 Manifest JSONL。'}>
            <Upload.Dragger {...patchFileUploadProps} className="dataset-upload-dragger" aria-label="补上传数据文件">
              <p className="ant-upload-drag-icon"><UploadOutlined /></p>
              <p className="ant-upload-text">点击或拖拽补充数据文件到这里</p>
              <p className="ant-upload-hint">平台会解析字段、媒体 URL，并按主值合并到当前数据集。</p>
            </Upload.Dragger>
          </Form.Item>
          <Form.Item label="追加图片/音频/视频素材" extra={patchMediaFiles.length ? `已选择 ${patchMediaFiles.length} 个文件` : '可选。适合少量媒体补充；批量行级媒体建议在 Manifest 中逐行声明。'}>
            <Upload.Dragger {...patchMediaUploadProps} className="dataset-upload-dragger dataset-media-upload-dragger" aria-label="补上传多模态素材">
              <p className="ant-upload-drag-icon"><UploadOutlined /></p>
              <p className="ant-upload-text">点击或拖拽图片、音频、视频素材</p>
              <p className="ant-upload-hint">无法绑定到具体行的素材会保留为数据集级素材。</p>
            </Upload.Dragger>
          </Form.Item>
          {renderDatasetUploadProgress(currentPatchProgress, patchUploadFiles)}
          <Form.Item label="外部素材 URL / 对象存储路径" extra="每行一个 URL。适合作为数据集级补充素材；行级媒体建议放在补充表格或 Manifest 中。">
            <Input.TextArea
              aria-label="补上传外部素材 URL / 对象存储路径"
              value={patchForm.media}
              autoSize={{ minRows: 3, maxRows: 5 }}
              placeholder="每行一个图片、音频、视频或文档 URL/路径"
              onChange={(event) => setPatchForm({ ...patchForm, media: event.target.value })}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="新增渲染变量"
        modalRender={(node) => <div aria-label="新增渲染变量">{node}</div>}
        open={variableOpen && Boolean(activeDataset)}
        centered
        destroyOnHidden
        width={760}
        okText="添加变量"
        cancelText="取消"
        okButtonProps={{ disabled: !activeDataset || !variableForm.name.trim() }}
        onCancel={() => setVariableOpen(false)}
        onOk={() => {
          const fakeEvent = { preventDefault() {} } as FormEvent<HTMLFormElement>;
          void addDerivedColumn(fakeEvent);
        }}
      >
        <Form layout="vertical" className="dataset-modal-form">
          <Alert className="dataset-modal-alert" type="info" showIcon title="把原始列加工成更稳定的展示字段，后续可用于模板预览和 ShowItem 映射。" />
          <div className="form-grid dataset-variable-form-grid">
            <Form.Item label="变量名" required>
              <Input aria-label="变量名" value={variableForm.name} placeholder="display_title" onChange={(event) => setVariableForm({ ...variableForm, name: event.target.value })} />
            </Form.Item>
            <Form.Item label="数据类型">
              <Select
                aria-label="数据类型"
                value={variableForm.data_type}
                options={[
                  { value: 'text', label: '文本' },
                  { value: 'number', label: '数字' },
                  { value: 'image', label: '图片' },
                  { value: 'audio', label: '音频' },
                  { value: 'video', label: '视频' },
                  { value: 'empty', label: '空值' },
                ]}
                getPopupContainer={(triggerNode) => triggerNode.parentElement ?? document.body}
                onChange={(value) => setVariableForm({ ...variableForm, data_type: value })}
              />
            </Form.Item>
            <Form.Item label="来源列">
              <Select
                aria-label="来源列"
                value={variableForm.source_column || undefined}
                allowClear
                placeholder="不绑定来源列"
                options={sourceColumns.map((column) => ({ value: column.name, label: column.name }))}
                getPopupContainer={(triggerNode) => triggerNode.parentElement ?? document.body}
                onChange={(value) => setVariableForm({ ...variableForm, source_column: value ?? '' })}
              />
            </Form.Item>
            <Form.Item label="默认值">
              <Input aria-label="默认值" value={variableForm.default_value} placeholder="来源为空时使用" onChange={(event) => setVariableForm({ ...variableForm, default_value: event.target.value })} />
            </Form.Item>
            <Form.Item className="form-span" label="表达式">
              <Input aria-label="表达式" value={variableForm.expression} placeholder="{value} 或 合同：{title}" onChange={(event) => setVariableForm({ ...variableForm, expression: event.target.value })} />
            </Form.Item>
            <Form.Item className="form-span" label="变量备注">
              <Input aria-label="变量备注" value={variableForm.comment} onChange={(event) => setVariableForm({ ...variableForm, comment: event.target.value })} />
            </Form.Item>
          </div>
          <Form.Item className="dataset-modal-checkbox">
            <Checkbox checked={variableForm.use_in_mapping} onChange={(event) => setVariableForm({ ...variableForm, use_in_mapping: event.target.checked })}>
              加入发布映射候选
            </Checkbox>
          </Form.Item>
          <div className="variable-preview"><span>首行预览</span><strong>{String(variablePreview || '空值')}</strong></div>
        </Form>
      </Modal>
    </main>
  );
}

interface TemplateDesignerPageProps {
  onBreadcrumbTailChange?: (tail: AppShellBreadcrumbItem | null) => void;
}

type TemplateWorkspaceMode =
  | { type: 'list' }
  | { type: 'designer'; templateId?: string; sourceStatus?: string }
  | { type: 'renderer'; templateId?: string; name: string; version?: number; schema: TemplateSchemaPayload; fromDesigner: boolean; returnToVersions?: boolean };

export function TemplateDesignerPage({ onBreadcrumbTailChange }: TemplateDesignerPageProps = {}) {
  const showToast = useWorkspaceToast('template');
  const { team, loading, error } = useOwnerTeam();
  const [datasets, setDatasets] = useState<DatasetPayload[]>([]);
  const [templates, setTemplates] = useState<TemplatePayload[]>([]);
  const [mode, setMode] = useState<TemplateWorkspaceMode>({ type: 'list' });
  const [schema, setSchema] = useState<TemplateSchemaPayload>(() => defaultSchema());
  const [activeTabId, setActiveTabId] = useState('tab_read');
  const [selectedId, setSelectedId] = useState('');
  const [columnSearch, setColumnSearch] = useState('');
  const [draggingId, setDraggingId] = useState('');
  const [dropTargetId, setDropTargetId] = useState('');
  const [dropTargetPosition, setDropTargetPosition] = useState<'before' | 'after'>('before');
  const [motionComponentId, setMotionComponentId] = useState('');
  const [motionOrigin, setMotionOrigin] = useState<'from-above' | 'from-below' | 'from-new'>('from-new');
  const [templateQuery, setTemplateQuery] = useState('');
  const [templateStatus, setTemplateStatus] = useState('all');
  const [templateViewMode, setTemplateViewMode] = useState<ProductionViewMode>(() => initialProductionViewMode());
  const [templateCardPage, setTemplateCardPage] = useState(1);
  const [templateCardPageSize, setTemplateCardPageSize] = useState(9);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateAiProviders, setTemplateAiProviders] = useState<AiProviderConfigPayload[]>([]);
  const [templateAiProvidersLoading, setTemplateAiProvidersLoading] = useState(false);
  const enabledTextTemplateAiProviders = useMemo(
    () => templateAiProviders.filter((provider) => provider.status === 'enabled' && providerSupportsCapability(provider, 'text')),
    [templateAiProviders],
  );
  const [versionDrawerOpen, setVersionDrawerOpen] = useState(false);
  const [templateReadinessOpen, setTemplateReadinessOpen] = useState(false);
  const [templateReadiness, setTemplateReadiness] = useState<TemplateReadinessPayload | null>(null);
  const [readinessTemplate, setReadinessTemplate] = useState<TemplatePayload | null>(null);
  const [templatePublishing, setTemplatePublishing] = useState(false);
  const [versions, setVersions] = useState<TemplateVersionPayload[]>([]);
  const [versionTemplate, setVersionTemplate] = useState<TemplatePayload | null>(null);
  const [versionDiff, setVersionDiff] = useState<TemplateVersionDiffPayload | null>(null);
  const [versionDiffLoading, setVersionDiffLoading] = useState(false);
  const [rendererAnswers, setRendererAnswers] = useState<Record<string, unknown>>({});
  const [rendererValidation, setRendererValidation] = useState<TemplateValidationPayload | null>(null);
  const [rendererValidating, setRendererValidating] = useState(false);
  const [rendererAiAssisting, setRendererAiAssisting] = useState(false);
  const [rendererDatasetId, setRendererDatasetId] = useState('');
  const [rendererRowIndex, setRendererRowIndex] = useState(0);
  const [renamingTabId, setRenamingTabId] = useState('');
  const [optionEditorComponentId, setOptionEditorComponentId] = useState('');
  const [optionEditorText, setOptionEditorText] = useState('');
  const [schemaImportOpen, setSchemaImportOpen] = useState(false);
  const [schemaImportText, setSchemaImportText] = useState('');
  const [schemaImportError, setSchemaImportError] = useState('');
  const [form, setForm] = useState({ name: '多模态混合标注模板', description: '先阅读文本，再标注图片或音频字段。', dataset_id: '' });
  const [actionError, setActionError] = useState<string | null>(null);
  const [designerHeaderCollapsed, setDesignerHeaderCollapsed] = useState(false);
  const [templateAutoSaveState, setTemplateAutoSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const lastTemplatePersistedFingerprint = useRef('');
  const initialTemplateDraftFingerprint = useRef('');
  const newTemplateAutoSavedIdRef = useRef('');
  const designerStartedWithoutTemplateRef = useRef(false);
  const designerSessionRef = useRef(0);
  const discardedNewTemplateSessionsRef = useRef<Set<number>>(new Set());
  const activeTab = schema.tabs.find((tab) => tab.id === activeTabId) ?? schema.tabs[0];
  const activeComponents = activeTab?.components ?? [];
  const allTemplateComponents = useMemo(() => schema.tabs.flatMap((tab) => tab.components), [schema.tabs]);
  const selected = activeComponents.find((component) => component.id === selectedId) ?? activeComponents[0] ?? null;
  const selectedLinkageRule = selected ? findLinkageRuleForComponent(schema.linkage_rules, selected) : null;
  const linkageSourceComponents = useMemo(
    () => allTemplateComponents.filter((component) => component.id !== selected?.id && !nonAnswerComponentTypes.has(component.type)),
    [allTemplateComponents, selected?.id],
  );
  const selectedLinkageSourceKey = String(selectedLinkageRule?.source_field ?? selectedLinkageRule?.source_component_id ?? selectedLinkageRule?.field ?? selectedLinkageRule?.when_field ?? '');
  const selectedLinkageSourceComponent = linkageSourceComponents.find((component) => component.field === selectedLinkageSourceKey || component.id === selectedLinkageSourceKey) ?? null;
  const selectedLinkageOperator = String(selectedLinkageRule?.operator ?? 'equals');
  const selectedLinkageValueDisabled = ['empty', 'is_empty', 'not_empty', 'filled'].includes(selectedLinkageOperator);
  const selectedLinkageValueOptions = selectedLinkageSourceComponent && ['SingleSelect', 'MultiSelect', 'TagSelect', 'Ranking'].includes(selectedLinkageSourceComponent.type)
    ? selectedLinkageSourceComponent.options
    : [];
  const selectedLinkageMatchedOption = selectedLinkageValueOptions.find((option) => (
    String(option.value) === String(selectedLinkageRule?.value ?? '') || String(option.label) === String(selectedLinkageRule?.value ?? '')
  ));
  const selectedLinkageValue = selectedLinkageMatchedOption?.value ?? String(selectedLinkageRule?.value ?? '');
  const selectedValidationRules = selected ? validationRulesForField(schema.validation_rules, selected.field) : [];
  const selectedDataset = datasets.find((dataset) => dataset.dataset_id === form.dataset_id) ?? null;
  const selectedDatasetSourceOptions = useMemo(
    () => (selectedDataset ? buildDataSourceOptions(selectedDataset) : []),
    [selectedDataset],
  );
  const filteredDesignerDataSourceOptions = useMemo(
    () => flattenDataSourceOptions(selectedDatasetSourceOptions, columnSearch),
    [columnSearch, selectedDatasetSourceOptions],
  );
  const selectedDatasetPreviewContent = useMemo(() => sampleContent(selectedDataset, 0), [selectedDataset]);
  const selectedReferenceDatasetContext = useMemo(() => buildSafeAiDatasetContext(selectedDataset), [selectedDataset]);
  const referenceDatasetMenuItems = useMemo(() => [
    { key: '__none__', label: <span className="designer-dataset-empty-text">不绑定</span> },
    ...datasets.map((dataset) => ({ key: dataset.dataset_id, label: dataset.name })),
  ], [datasets]);
  const schemaStats = useMemo(() => {
    const components = schema.tabs.flatMap((tab) => tab.components);
    return {
      tabs: schema.tabs.length,
      components: components.length,
      showItems: components.filter((component) => component.type === 'ShowItem').length,
      required: components.filter((component) => component.required).length,
      llm: components.filter((component) => component.type === 'LLMComponent').length,
    };
  }, [schema]);
  const selectedIndex = selected ? activeComponents.findIndex((component) => component.id === selected.id) : -1;
  const lastComponent = activeComponents.length ? activeComponents[activeComponents.length - 1] : null;
  const filteredTemplates = useMemo(() => {
    const keyword = templateQuery.trim().toLowerCase();
    return templates.filter((template) => {
      const matchesKeyword = !keyword || template.name.toLowerCase().includes(keyword) || (template.description || '').toLowerCase().includes(keyword);
      const matchesStatus = templateStatus === 'all' || template.status === templateStatus;
      return matchesKeyword && matchesStatus;
    });
  }, [templateQuery, templateStatus, templates]);
  const safeTemplateCardPage = safeCardPage(filteredTemplates.length, templateCardPage, templateCardPageSize);
  const visibleTemplateCards = paginateCards(filteredTemplates, templateCardPage, templateCardPageSize);
  const templateDraftFingerprint = useMemo(() => templateDraftFingerprintOf(form, schema), [form, schema]);
  useActionErrorToast(actionError, setActionError, showToast);
  const canvasListRef = useRef<HTMLDivElement | null>(null);
  const canvasAutoScrollFrameRef = useRef<number | null>(null);
  const canvasAutoScrollVelocityRef = useRef(0);
  const stopCanvasAutoScroll = useCallback(() => {
    canvasAutoScrollVelocityRef.current = 0;
    if (canvasAutoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(canvasAutoScrollFrameRef.current);
      canvasAutoScrollFrameRef.current = null;
    }
  }, []);

  const tickCanvasAutoScroll = useCallback(() => {
    const container = canvasListRef.current;
    const velocity = canvasAutoScrollVelocityRef.current;
    canvasAutoScrollFrameRef.current = null;
    if (!container || velocity === 0) return;
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    container.scrollTop = Math.min(maxScrollTop, Math.max(0, container.scrollTop + velocity));
    if (canvasAutoScrollVelocityRef.current !== 0) {
      canvasAutoScrollFrameRef.current = window.requestAnimationFrame(() => tickCanvasAutoScroll());
    }
  }, []);

  const updateCanvasAutoScroll = useCallback((clientY: number) => {
    const container = canvasListRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const threshold = Math.max(56, Math.min(120, rect.height * 0.18));
    let velocity = 0;
    if (clientY < rect.top + threshold) {
      const distance = Math.max(0, rect.top + threshold - clientY);
      velocity = -Math.max(4, Math.round(distance / 6));
    } else if (clientY > rect.bottom - threshold) {
      const distance = Math.max(0, clientY - (rect.bottom - threshold));
      velocity = Math.max(4, Math.round(distance / 6));
    }
    canvasAutoScrollVelocityRef.current = velocity;
    if (velocity === 0) {
      stopCanvasAutoScroll();
      return;
    }
    if (canvasAutoScrollFrameRef.current === null) {
      canvasAutoScrollFrameRef.current = window.requestAnimationFrame(() => tickCanvasAutoScroll());
    }
  }, [stopCanvasAutoScroll, tickCanvasAutoScroll]);

  const replaceDesignerActiveTabWithPreset = useCallback((items: DesignerPresetSequenceItem[]) => {
    let firstInsertedId = '';
    setSchema((currentSchema) => {
      const targetTab = currentSchema.tabs.find((tab) => tab.id === activeTabId) ?? currentSchema.tabs[0];
      if (!targetTab) {
        const result = insertDesignerPresetSequence(currentSchema, activeTabId, items);
        firstInsertedId = result.firstInsertedId;
        return result.schema;
      }
      const removingIds = new Set(targetTab.components.map((component) => component.id));
      const removingFields = new Set(targetTab.components.map((component) => component.field));
      const nextComponents = items.map((item, index) => createSequencePresetComponent(item, index, 0));
      firstInsertedId = nextComponents[0]?.id ?? '';
      return normalizeLlmComponentsLast({
        ...currentSchema,
        tabs: currentSchema.tabs.map((tab) => (tab.id === targetTab.id ? { ...tab, components: nextComponents } : tab)),
        linkage_rules: currentSchema.linkage_rules.filter((rule) => !linkageRuleReferencesIds(rule, removingIds, removingFields)),
      });
    });
    setSelectedId(firstInsertedId);
    setMotionComponentId(firstInsertedId);
    setMotionOrigin('from-new');
    setDraggingId('');
    setDropTargetId('');
    setDropTargetPosition('before');
  }, [activeTabId]);

  const designerQuickCombos = useMemo<DesignerQuickCombo[]>(() => [
    {
      key: 'basic_classification',
      label: '基础分类',
      description: '展示样本、单选结论、置信度和理由',
      icon: <CheckCircleOutlined />,
      items: [
        { type: 'ShowItem', fieldPrefix: 'show', label: '样本信息', config: { layout: 'dense', max_items: 8 }, required: false },
        { type: 'SingleSelect', fieldPrefix: 'category', label: '分类结论', options: [
          { value: 'positive', label: '符合' },
          { value: 'negative', label: '不符合' },
          { value: 'uncertain', label: '不确定' },
        ], config: { description: '选择最符合当前样本的分类。' } },
        { type: 'Scale', fieldPrefix: 'confidence', label: '置信度评分', config: { min: 1, max: 5, step: 1, min_label: '低', max_label: '高' } },
        { type: 'TextArea', fieldPrefix: 'reason', label: '判断理由', config: { description: '说明主要判断依据。', placeholder: '请写出可复核的理由。' } },
      ],
    },
    {
      key: 'quality_review',
      label: '质量复核',
      description: '合格判定、问题标签、评分和复核备注',
      icon: <SafetyCertificateOutlined />,
      items: [
        { type: 'ShowItem', fieldPrefix: 'show', label: '待复核内容', config: { layout: 'dense', max_items: 10 }, required: false },
        { type: 'SingleSelect', fieldPrefix: 'quality_result', label: '质检结论', options: [
          { value: 'pass', label: '合格' },
          { value: 'reject', label: '不合格' },
          { value: 'needs_review', label: '需复审' },
        ], config: { description: '给出当前数据的质检结论。' } },
        { type: 'TagSelect', fieldPrefix: 'issue_tags', label: '问题标签', options: [
          { value: 'blur', label: '模糊' },
          { value: 'incomplete', label: '信息缺失' },
          { value: 'wrong_label', label: '标签错误' },
        ], config: { allow_create: true, description: '标记可复用的问题类型。' } },
        { type: 'Scale', fieldPrefix: 'quality_score', label: '质量评分', config: { min: 1, max: 5, step: 1, min_label: '差', max_label: '好' } },
        { type: 'TextArea', fieldPrefix: 'review_note', label: '复核备注', config: { placeholder: '补充复核依据或修正建议。' } },
      ],
    },
    {
      key: 'preference_ranking',
      label: '偏好排序',
      description: '比较多个候选项并输出排序和理由',
      icon: <OrderedListOutlined />,
      items: [
        { type: 'ShowItem', fieldPrefix: 'show', label: '候选内容', config: { layout: 'dense', max_items: 12 }, required: false },
        { type: 'Ranking', fieldPrefix: 'ranking', label: '候选排序', options: [
          { value: 'candidate_a', label: '候选 A' },
          { value: 'candidate_b', label: '候选 B' },
          { value: 'candidate_c', label: '候选 C' },
        ], config: { description: '按优先级从高到低排列。' } },
        { type: 'TextArea', fieldPrefix: 'ranking_reason', label: '排序理由', config: { placeholder: '说明排序依据、关键差异或不确定点。' } },
      ],
    },
    {
      key: 'multimodal_review',
      label: '多模态复核',
      description: '展示多字段媒体、Mask 标注、标签和备注',
      icon: <AimOutlined />,
      items: [
        { type: 'ShowItem', fieldPrefix: 'show', label: '多模态上下文', config: { layout: 'media_grid', max_items: 8 }, required: false },
        { type: 'ImageMaskAnnotation', fieldPrefix: 'mask', label: '图片区域标注', config: { description: '在图片中标出需要关注的目标区域。', image_field: 'image_url', mode: 'rect', brush_size: 18 } },
        { type: 'TagSelect', fieldPrefix: 'media_tags', label: '内容标签', options: [
          { value: 'target', label: '目标' },
          { value: 'defect', label: '瑕疵' },
          { value: 'background', label: '背景干扰' },
        ], config: { allow_create: true, description: '为多模态内容补充标签。' } },
        { type: 'TextArea', fieldPrefix: 'media_note', label: '复核说明', config: { placeholder: '说明图片、音频或视频中的关键依据。' } },
      ],
    },
  ], []);

  const designerQuickComboButtons = useMemo(() => designerQuickCombos.map((preset) => ({
    ...preset,
    onClick: () => {
      Modal.confirm({
        title: `覆盖当前页签为「${preset.label}」？`,
        content: (
          <div>
            <p>{`此操作会清空当前页签内已有物料，并用「${preset.label}」的 ${preset.items.length} 个物料重新生成内容。`}</p>
            <p>相关联动规则也会同步移除。请确认当前内容已经保存或不再需要。</p>
          </div>
        ),
        okText: '确认覆盖',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: () => {
          replaceDesignerActiveTabWithPreset(preset.items);
          setActionError(null);
        },
      });
    },
  })), [activeTabId, replaceDesignerActiveTabWithPreset, schema.tabs, designerQuickCombos]);

  const templateStats = useMemo(() => ({
    total: templates.length,
    draft: templates.filter((template) => template.status === 'draft').length,
    published: templates.filter((template) => template.status === 'published').length,
    showItems: templates.reduce((total, template) => total + template.show_item_count, 0),
  }), [templates]);

  const addMaterialMenuItems = useMemo(() => palette.map((item) => ({
    key: item.type,
    icon: item.icon,
    label: item.label,
  })), []);

  const refreshTemplateAiProviders = useCallback(async () => {
    if (!team) return;
    setTemplateAiProvidersLoading(true);
    try {
      const data = await listAiProviderConfigs(team.team_id);
      setTemplateAiProviders(data.items ?? []);
    } catch {
      setTemplateAiProviders([]);
    } finally {
      setTemplateAiProvidersLoading(false);
    }
  }, [team]);

  const refreshTemplates = useCallback(async () => {
    if (!team) return;
    setTemplateLoading(true);
    try {
      const data = await listTemplates(team.team_id);
      setTemplates(data.items);
    } catch {
      setTemplates([]);
    } finally {
      setTemplateLoading(false);
    }
  }, [team]);

  useEffect(() => {
    if (!team) return;
    void listDatasets(team.team_id).then((data) => setDatasets(data.items)).catch(() => setDatasets([]));
    void listTemplates(team.team_id).then((data) => setTemplates(data.items)).catch(() => setTemplates([]));
  }, [team]);

  const resetDesigner = (nextSchema: TemplateSchemaPayload = defaultSchema()) => {
    const designerSchema = normalizeDesignerSchema(nextSchema);
    setSchema(designerSchema);
    setActiveTabId(designerSchema.tabs[0]?.id ?? 'tab_read');
    setSelectedId(designerSchema.tabs[0]?.components[0]?.id ?? '');
    setColumnSearch('');
    setDraggingId('');
    setDropTargetId('');
    setDropTargetPosition('before');
    setMotionComponentId('');
    setMotionOrigin('from-new');
    setRenamingTabId('');
    setDesignerHeaderCollapsed(false);
  };

  const openNewDesigner = () => {
    setActionError(null);
    const nextSession = designerSessionRef.current + 1;
    designerSessionRef.current = nextSession;
    discardedNewTemplateSessionsRef.current.delete(nextSession);
    const initialForm = { name: '未命名标注模板', description: '', dataset_id: '' };
    const initialSchema = defaultSchema();
    const initialFingerprint = templateDraftFingerprintOf(initialForm, normalizeDesignerSchema(initialSchema));
    setForm(initialForm);
    resetDesigner(initialSchema);
    lastTemplatePersistedFingerprint.current = initialFingerprint;
    initialTemplateDraftFingerprint.current = initialFingerprint;
    designerStartedWithoutTemplateRef.current = true;
    newTemplateAutoSavedIdRef.current = '';
    setTemplateAutoSaveState('idle');
    setMode({ type: 'designer' });
  };

  const openDesigner = async (template: TemplatePayload) => {
    if (!team) return;
    setActionError(null);
    const nextSession = designerSessionRef.current + 1;
    designerSessionRef.current = nextSession;
    discardedNewTemplateSessionsRef.current.delete(nextSession);
    try {
      const detail = template.schema ? template : await getTemplate(team.team_id, template.template_id);
      setForm({ name: detail.name, description: detail.description || '', dataset_id: '' });
      resetDesigner(detail.schema ?? defaultSchema());
      lastTemplatePersistedFingerprint.current = templateDraftFingerprintOf(
        { name: detail.name, description: detail.description || '', dataset_id: '' },
        normalizeDesignerSchema(detail.schema ?? defaultSchema()),
      );
      initialTemplateDraftFingerprint.current = lastTemplatePersistedFingerprint.current;
      designerStartedWithoutTemplateRef.current = false;
      newTemplateAutoSavedIdRef.current = '';
      setTemplateAutoSaveState(detail.auto_saved ? 'saved' : 'idle');
      setMode({ type: 'designer', templateId: detail.template_id, sourceStatus: detail.status });
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '模板详情加载失败');
    }
  };

  const openRenderer = async (template: TemplatePayload) => {
    if (!team) return;
    setActionError(null);
    try {
      const preview = await getTemplatePreview(team.team_id, template.template_id);
      setRendererAnswers({});
      setRendererValidation(null);
      setRendererAiAssisting(false);
      setRendererDatasetId('');
      setRendererRowIndex(0);
      setMode({
        type: 'renderer',
        templateId: preview.template.template_id,
        name: preview.template.name,
        version: preview.template.latest_version,
        schema: preview.template.schema ?? template.schema ?? defaultSchema(),
        fromDesigner: false,
      });
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Renderer 预览加载失败');
    }
  };

  const openDraftRenderer = () => {
    setRendererAnswers({});
    setRendererValidation(null);
    setRendererAiAssisting(false);
    setRendererDatasetId('');
    setRendererRowIndex(0);
    setMode({ type: 'renderer', templateId: mode.type === 'designer' ? mode.templateId : undefined, name: form.name || '未命名模板', schema, fromDesigner: true });
  };

  const openVersionRenderer = (version: TemplateVersionPayload) => {
    if (!versionTemplate || !version.schema) return;
    setRendererAnswers({});
    setRendererValidation(null);
    setRendererAiAssisting(false);
    setRendererDatasetId('');
    setRendererRowIndex(0);
    setVersionDrawerOpen(false);
    setMode({
      type: 'renderer',
      templateId: versionTemplate.template_id,
      name: versionTemplate.name,
      version: version.version,
      schema: version.schema,
      fromDesigner: false,
      returnToVersions: true,
    });
  };

  const runRendererValidation = async (schemaToValidate: TemplateSchemaPayload, content: Record<string, unknown>) => {
    if (!team) return;
    setRendererValidating(true);
    setActionError(null);
    try {
      const result = await validateTemplateAnswers(team.team_id, { schema: schemaToValidate, answers: rendererAnswers, content });
      const fieldErrors = Array.isArray(result.field_errors) ? result.field_errors : [];
      const errorCount = result.summary?.error_count ?? fieldErrors.length;
      setRendererValidation(result);
      showToast(result.valid ? 'success' : 'error', result.valid ? 'Renderer 运行校验通过。' : `Renderer 发现 ${errorCount} 个字段问题。`);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Renderer 运行校验失败');
    } finally {
      setRendererValidating(false);
    }
  };

  const runRendererAiAssist = async (schemaToUse: TemplateSchemaPayload, content: Record<string, unknown>, component: TemplateComponentSchema) => {
    if (!team || rendererAiAssisting) return;
    if (!String(component.config.provider_id || '').trim()) {
      setActionError('请先在模板 Designer 中为该 LLM 组件选择 Provider');
      return;
    }
    setRendererAiAssisting(true);
    setActionError(null);
    try {
      const componentPrompt = String(component.config.prompt_hint || '').trim();
      const result = await generateLabelingAiAssistPreview(team.team_id, {
        schema: schemaToUse,
        content,
        answers: rendererAnswers,
        prompt: componentPrompt ? `Template LLMComponent hint: ${componentPrompt}` : undefined,
        component_id: component.id,
      });
      const nextAnswers = result.answers && typeof result.answers === 'object' ? result.answers : {};
      setRendererAnswers((current) => ({ ...current, ...nextAnswers }));
      setRendererValidation(null);
      showToast('success', `AI 预览已生成 ${Object.keys(nextAnswers).length} 条建议。`);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'AI 预览生成失败');
    } finally {
      setRendererAiAssisting(false);
    }
  };

  const showVersions = async (template: TemplatePayload) => {
    if (!team) return;
    setVersionTemplate(template);
    setVersionDiff(null);
    setVersionDrawerOpen(true);
    try {
      const data = await listTemplateVersions(team.team_id, template.template_id);
      setVersions(data.versions);
    } catch {
      setVersions([]);
    }
  };

  const compareVersionWithPrevious = async (version: TemplateVersionPayload) => {
    if (!team || !versionTemplate || version.version <= 1) return;
    setVersionDiffLoading(true);
    setVersionDiff(null);
    try {
      const diff = await getTemplateVersionDiff(team.team_id, versionTemplate.template_id, version.version - 1, version.version);
      setVersionDiff(diff);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '版本对比失败');
    } finally {
      setVersionDiffLoading(false);
    }
  };

  const addTab = () => {
    const nextIndex = schema.tabs.length + 1;
    const tab = { id: `tab_${nextIndex}`, title: `页签 ${nextIndex}`, components: [] };
    setSchema({ ...schema, tabs: [...schema.tabs, tab] });
    setActiveTabId(tab.id);
  };

  const duplicateTabById = (tabId: string) => {
    const tabToCopy = schema.tabs.find((tab) => tab.id === tabId);
    if (!tabToCopy) return;
    const existingIds = new Set(schema.tabs.map((tab) => tab.id));
    let copyIndex = 1;
    let copyId = `${tabToCopy.id}_copy_${copyIndex}`;
    while (existingIds.has(copyId)) {
      copyIndex += 1;
      copyId = `${tabToCopy.id}_copy_${copyIndex}`;
    }
    const copy = {
      ...tabToCopy,
      id: copyId,
      title: `${tabToCopy.title} 副本`,
      components: tabToCopy.components.map(cloneComponent),
    };
    const activeIndex = schema.tabs.findIndex((tab) => tab.id === tabId);
    const tabs = [...schema.tabs];
    tabs.splice(activeIndex + 1, 0, copy);
    setSchema({ ...schema, tabs });
    setActiveTabId(copy.id);
    setSelectedId(copy.components[0]?.id ?? '');
  };

  const removeTabWithConfirm = (tabId: string) => {
    const tabToRemove = schema.tabs.find((tab) => tab.id === tabId);
    if (!tabToRemove || schema.tabs.length <= 1) return;
    if (tabToRemove.components.length > 0) {
      Modal.confirm({
        title: `删除页签「${tabToRemove.title}」？`,
        content: `该页签包含 ${tabToRemove.components.length} 个物料，删除后会同步移除页签内物料和相关联动规则。`,
        okText: '删除页签',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: () => removeTabById(tabToRemove.id),
      });
      return;
    }
    removeTabById(tabToRemove.id);
  };

  const removeTabById = (tabId: string) => {
    const removing = schema.tabs.find((tab) => tab.id === tabId);
    if (!removing || schema.tabs.length <= 1) return;
    const nextTabs = schema.tabs.filter((tab) => tab.id !== tabId);
    const removingIds = new Set(removing.components.map((component) => component.id));
    const removingFields = new Set(removing.components.map((component) => component.field));
    setSchema({
      ...schema,
      tabs: nextTabs,
      linkage_rules: schema.linkage_rules.filter((rule) => !linkageRuleReferencesIds(rule, removingIds, removingFields)),
    });
    setActiveTabId(nextTabs[0]?.id ?? '');
    setSelectedId(nextTabs[0]?.components[0]?.id ?? '');
  };

  const moveTabById = (tabId: string, offset: number) => {
    const index = schema.tabs.findIndex((tab) => tab.id === tabId);
    const nextIndex = index + offset;
    if (index < 0 || nextIndex < 0 || nextIndex >= schema.tabs.length) return;
    const tabs = [...schema.tabs];
    const [tab] = tabs.splice(index, 1);
    tabs.splice(nextIndex, 0, tab);
    setSchema({ ...schema, tabs });
    setActiveTabId(tabId);
  };

  const addComponent = (type: TemplateComponentType, fieldPrefix: string, label: string, targetComponentId?: string, position: 'before' | 'after' = 'after') => {
    const targetTab = activeTab ?? { id: 'tab_read', title: '阅读材料', components: [] };
    const component = componentFactory(type, `${fieldPrefix}_${targetTab.components.length + 1}`, label);
    if (!activeTab) {
      setSchema(normalizeLlmComponentsLast({ ...schema, tabs: [{ ...targetTab, components: [component] }] }));
      setActiveTabId(targetTab.id);
      setSelectedId(component.id);
      setMotionComponentId(component.id);
      setMotionOrigin('from-new');
      return;
    }
    const nextSchema = targetComponentId
      ? position === 'before'
        ? insertComponentBefore(schema, activeTabId, component, targetComponentId)
        : insertComponentAfter(schema, activeTabId, component, targetComponentId)
      : updateActiveTab(schema, activeTabId, { ...activeTab, components: [...activeComponents, component] });
    setSchema(normalizeLlmComponentsLast(nextSchema));
    setSelectedId(component.id);
    setMotionComponentId(component.id);
    setMotionOrigin('from-new');
  };

  const addPaletteComponent = (type: TemplateComponentType, targetComponentId?: string, position: 'before' | 'after' = 'after') => {
    const item = palette.find((entry) => entry.type === type);
    if (item) addComponent(item.type, item.fieldPrefix, item.label, targetComponentId, position);
  };

  const patchSelectedConfig = (key: string, value: unknown) => {
    if (!selected) return;
    const nextConfig = { ...selected.config };
    if (value === '' || value === null || typeof value === 'undefined') {
      delete nextConfig[key];
    } else {
      nextConfig[key] = value;
    }
    patchSelected({ config: nextConfig });
  };

  const patchSelectedOptionsText = (value: string) => {
    if (!selected) return;
    setOptionEditorComponentId(selected.id);
    setOptionEditorText(value);
    const options = value
      .split('\n')
      .map((label) => label.trim())
      .filter(Boolean)
      .map((label, index) => ({
        value: selected.options[index]?.value || `option_${index + 1}`,
        label,
      }));
    patchSelected({ options });
  };

  const dropComponent = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/x-markup-component') as TemplateComponentType;
    const item = palette.find((entry) => entry.type === type);
    if (item) addComponent(item.type, item.fieldPrefix, item.label);
    stopCanvasAutoScroll();
  };

  const dropComponentAt = (event: DragEvent<HTMLElement>, targetId: string, position: 'before' | 'after' = 'before') => {
    event.preventDefault();
    event.stopPropagation();
    const previousComponents = activeComponents;
    setDropTargetId('');
    setDropTargetPosition('before');
    const movingId = event.dataTransfer.getData('application/x-markup-canvas-component');
    if (movingId) {
      const sourceIndex = previousComponents.findIndex((component) => component.id === movingId);
      const targetIndex = previousComponents.findIndex((component) => component.id === targetId);
      setSchema(normalizeLlmComponentsLast(position === 'after' ? moveComponentAfter(schema, activeTabId, movingId, targetId) : moveComponent(schema, activeTabId, movingId, targetId)));
      setSelectedId(movingId);
      setMotionComponentId(movingId);
      setMotionOrigin(sourceIndex >= 0 && targetIndex >= 0 && sourceIndex < targetIndex ? 'from-above' : 'from-below');
      setDraggingId('');
      stopCanvasAutoScroll();
      return;
    }
    const type = event.dataTransfer.getData('application/x-markup-component') as TemplateComponentType;
    const item = palette.find((entry) => entry.type === type);
    if (!item) return;
    const component = componentFactory(item.type, `${item.fieldPrefix}_${activeComponents.length + 1}`, item.label);
    setSchema(normalizeLlmComponentsLast(position === 'after' ? insertComponentAfter(schema, activeTabId, component, targetId) : insertComponentBefore(schema, activeTabId, component, targetId)));
    setSelectedId(component.id);
    setMotionComponentId(component.id);
    setMotionOrigin('from-new');
    stopCanvasAutoScroll();
  };

  const handleDividerDragOver = (event: DragEvent<HTMLElement>, targetId: string, position: 'before' | 'after' = 'before') => {
    event.preventDefault();
    event.stopPropagation();
    const hasCanvasComponent = Boolean(event.dataTransfer.types.includes('application/x-markup-canvas-component'));
    const hasPaletteComponent = Boolean(event.dataTransfer.types.includes('application/x-markup-component'));
    if (hasCanvasComponent || hasPaletteComponent) {
      event.dataTransfer.dropEffect = 'move';
      setDropTargetId(targetId);
      setDropTargetPosition(position);
      updateCanvasAutoScroll(event.clientY);
    }
  };

  const duplicateComponent = (componentId: string) => {
    const source = activeComponents.find((component) => component.id === componentId);
    if (!source) return;
    const copy = cloneComponent(source);
    setSchema(normalizeLlmComponentsLast(insertComponentAfter(schema, activeTabId, copy, source.id)));
    setSelectedId(copy.id);
  };

  const duplicateSelected = () => {
    if (selected) duplicateComponent(selected.id);
  };

  const removeComponentById = (componentId: string) => {
    if (!activeTab) return;
    const removing = activeComponents.find((component) => component.id === componentId);
    const nextComponents = activeComponents.filter((component) => component.id !== componentId);
    const nextSchema = updateActiveTab(schema, activeTabId, { ...activeTab, components: nextComponents });
    setSchema({
      ...nextSchema,
      linkage_rules: removing ? nextSchema.linkage_rules.filter((rule) => !linkageRuleReferencesComponent(rule, removing)) : nextSchema.linkage_rules,
    });
    setSelectedId(nextComponents[0]?.id ?? '');
  };

  const removeSelected = () => {
    if (selected) removeComponentById(selected.id);
  };

  const patchSelected = (patch: Partial<TemplateComponentSchema>) => {
    if (!selected) return;
    const next = { ...selected, ...patch };
    setSchema(normalizeLlmComponentsLast(updateComponent(schema, activeTabId, next)));
  };

  const appendShowItemDisplayField = (component: TemplateComponentSchema, binding: DataBindingPayload | null) => {
    if (!binding) return;
    const current = normalizeShowItemDisplayFields(component);
    const value = bindingToOptionValue(binding);
    if (!value) return;
    if (current.some((item) => bindingToOptionValue(item.binding) === value)) return;
    const nextFields = [...current, {
      label: bindingDisplayLabel(binding).replace(/^数据列：|^媒体：|^上下文：|^附件：/, ''),
      field: bindingToColumnName(binding) || binding.field || binding.key || binding.media_type || '',
      binding,
    }];
    const primary = nextFields[0]?.binding ?? binding;
    patchSelected({
      config: {
        ...component.config,
        display_fields: nextFields,
        content_field: bindingToColumnName(primary) || '',
        binding: primary,
      },
    });
  };

  const patchSelectedField = (nextField: string) => {
    if (!selected) return;
    const previousField = selected.field;
    const next = { ...selected, field: nextField };
    const updatedSchema = normalizeLlmComponentsLast(updateComponent(schema, activeTabId, next));
    setSchema({
      ...updatedSchema,
      validation_rules: renameValidationRuleField(updatedSchema.validation_rules, previousField, nextField),
      linkage_rules: updatedSchema.linkage_rules.map((rule) => renameLinkageRuleField(rule, previousField, nextField)),
    });
  };

  const patchSelectedLinkageRule = (patch: Partial<TemplateLinkageRule>) => {
    if (!selected) return;
    const currentRule = selectedLinkageRule ?? defaultLinkageRuleForComponent(selected, allTemplateComponents);
    const nextRule: TemplateLinkageRule = { ...currentRule, ...patch, target_component_id: selected.id };
    setSchema({
      ...schema,
      linkage_rules: [
        ...schema.linkage_rules.filter((rule) => !isLinkageRuleTargetingComponent(rule, selected)),
        nextRule,
      ],
    });
  };

  const patchSelectedLinkageSource = (sourceField: string) => {
    const source = linkageSourceComponents.find((component) => component.field === sourceField || component.id === sourceField);
    const optionValue = source && ['SingleSelect', 'MultiSelect', 'TagSelect', 'Ranking'].includes(source.type) ? source.options[0]?.value : undefined;
    patchSelectedLinkageRule({
      source_field: source?.field ?? sourceField,
      source_component_id: undefined,
      field: undefined,
      when_field: undefined,
      value: selectedLinkageValueDisabled ? undefined : optionValue ?? '',
    });
  };

  const patchSelectedLinkageOperator = (operator: string) => {
    patchSelectedLinkageRule({
      operator,
      value: ['empty', 'is_empty', 'not_empty', 'filled'].includes(operator)
        ? undefined
        : selectedLinkageValue || selectedLinkageValueOptions[0]?.value || '',
    });
  };

  const removeSelectedLinkageRule = () => {
    if (!selected) return;
    setSchema({
      ...schema,
      linkage_rules: schema.linkage_rules.filter((rule) => !isLinkageRuleTargetingComponent(rule, selected)),
    });
  };

  const patchSelectedValidationRule = (type: string, patch: Partial<TemplateValidationRulePayload>) => {
    if (!selected) return;
    setSchema({
      ...schema,
      validation_rules: upsertValidationRule(schema.validation_rules, selected.field, type, patch),
    });
  };

  const removeSelectedValidationRule = (type: string) => {
    if (!selected) return;
    setSchema({
      ...schema,
      validation_rules: removeValidationRule(schema.validation_rules, selected.field, type),
    });
  };

  const persistDraft = useCallback(async (options: { autoSaved?: boolean; silent?: boolean; returnToList?: boolean } = {}): Promise<TemplatePayload | null> => {
    const { autoSaved = false, silent = false, returnToList = false } = options;
    if (!team) return null;
    const saveSession = designerSessionRef.current;
    const shouldDeleteDiscardedAutoSave = autoSaved && designerStartedWithoutTemplateRef.current;
    setActionError(null);
    if (autoSaved) setTemplateAutoSaveState('saving');
    try {
      const next = mode.type === 'designer' && mode.templateId
        ? await updateTemplate(team.team_id, mode.templateId, { name: form.name, description: form.description, schema, auto_saved: autoSaved })
        : await createTemplate(team.team_id, { name: form.name, description: form.description, schema, auto_saved: autoSaved });
      if (discardedNewTemplateSessionsRef.current.has(saveSession)) {
        if (shouldDeleteDiscardedAutoSave) {
          try {
            await deleteTemplate(team.team_id, next.template_id);
          } finally {
            setTemplates((items) => items.filter((item) => item.template_id !== next.template_id));
            void refreshTemplates();
          }
        }
        return null;
      }
      setMode({ type: 'designer', templateId: next.template_id, sourceStatus: next.status });
      setForm((current) => ({ ...current, name: next.name, description: next.description || '' }));
      setTemplates((items) => [next, ...items.filter((item) => item.template_id !== next.template_id)]);
      if (autoSaved && designerStartedWithoutTemplateRef.current && !newTemplateAutoSavedIdRef.current) {
        newTemplateAutoSavedIdRef.current = next.template_id;
      }
      lastTemplatePersistedFingerprint.current = templateDraftFingerprintOf(
        { name: next.name, description: next.description || '', dataset_id: form.dataset_id },
        schema,
      );
      setTemplateAutoSaveState(autoSaved ? 'saved' : 'idle');
      if (!silent) {
        showToast('success', autoSaved ? '模板已自动保存。' : next.status === 'draft' ? '模板草稿已保存。' : '模板已保存，新版本草稿已生成。');
      }
      if (returnToList) {
        setMode({ type: 'list' });
      }
      return next;
    } catch (err) {
      if (discardedNewTemplateSessionsRef.current.has(saveSession)) {
        return null;
      }
      setActionError(err instanceof ApiClientError ? err.message : '模板保存失败');
      if (autoSaved) setTemplateAutoSaveState('error');
      return null;
    }
  }, [form.dataset_id, form.description, form.name, mode, refreshTemplates, schema, showToast, team]);

  const leaveDesigner = useCallback(async () => {
    if (templateDraftFingerprint === initialTemplateDraftFingerprint.current) {
      const leavingSession = designerSessionRef.current;
      const autoSavedTemplateId = newTemplateAutoSavedIdRef.current;
      if (designerStartedWithoutTemplateRef.current) {
        discardedNewTemplateSessionsRef.current.add(leavingSession);
      }
      if (team && designerStartedWithoutTemplateRef.current && autoSavedTemplateId) {
        try {
          await deleteTemplate(team.team_id, autoSavedTemplateId);
          setTemplates((items) => items.filter((item) => item.template_id !== autoSavedTemplateId));
        } catch {
          void refreshTemplates();
        }
      }
      newTemplateAutoSavedIdRef.current = '';
      designerStartedWithoutTemplateRef.current = false;
      setMode({ type: 'list' });
      return;
    }
    if (templateDraftFingerprint === lastTemplatePersistedFingerprint.current) {
      designerStartedWithoutTemplateRef.current = false;
      setMode({ type: 'list' });
      return;
    }
    await persistDraft({ returnToList: true });
    designerStartedWithoutTemplateRef.current = false;
  }, [persistDraft, refreshTemplates, team, templateDraftFingerprint]);

  useEffect(() => {
    if (!onBreadcrumbTailChange) return;
    if (mode.type === 'list') {
      onBreadcrumbTailChange(null);
      return;
    }
    if (mode.type === 'designer') {
      onBreadcrumbTailChange({
        key: 'template-designer',
        parentKey: 'templates',
        parentLabel: '模板搭建',
        parentOnClick: () => void leaveDesigner(),
        label: mode.templateId ? `${form.name} / Designer` : '新建模板',
      });
      return;
    }
    onBreadcrumbTailChange({
      key: 'template-renderer',
      parentKey: 'templates',
      parentLabel: '模板搭建',
      parentOnClick: () => setMode({ type: 'list' }),
      label: `${mode.name} / Renderer 预览`,
    });
  }, [form.name, leaveDesigner, mode, onBreadcrumbTailChange]);

  useEffect(() => {
    if (mode.type !== 'designer') return;
    if (designerStartedWithoutTemplateRef.current && templateDraftFingerprint === initialTemplateDraftFingerprint.current) return;
    if (!form.name.trim() && !form.description.trim() && schema.tabs.every((tab) => tab.components.length === 0)) return;
    if (templateDraftFingerprint === lastTemplatePersistedFingerprint.current) return;
    const timer = window.setTimeout(() => {
      void persistDraft({ autoSaved: true, silent: true });
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [form.description, form.name, mode.type, persistDraft, schema.tabs, templateDraftFingerprint]);

  useEffect(() => {
    if (mode.type !== 'designer') return;
    const timer = window.setTimeout(() => {
      void refreshTemplateAiProviders();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [mode.type, refreshTemplateAiProviders]);

  const applyTemplateAiSchema = useCallback((nextSchema: TemplateSchemaPayload) => {
    const normalized = normalizeDesignerSchema(nextSchema);
    setSchema(normalized);
    setActiveTabId((current) => normalized.tabs.some((tab) => tab.id === current) ? current : normalized.tabs[0]?.id ?? 'tab_read');
    setSelectedId('');
    setTemplateAutoSaveState('idle');
  }, []);

  const openTemplatePublishCheck = async (template?: TemplatePayload) => {
    if (!team) return;
    setActionError(null);
    try {
      const target = template ?? await persistDraft();
      if (!target) return;
      const readiness = await getTemplateReadiness(team.team_id, target.template_id);
      setReadinessTemplate(target);
      setTemplateReadiness(readiness);
      setTemplateReadinessOpen(true);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '模板发布检查失败');
    }
  };

  const confirmTemplatePublish = async () => {
    if (!team || !readinessTemplate || templateReadiness?.ready === false) return;
    setTemplatePublishing(true);
    setActionError(null);
    try {
      const published = await publishTemplate(team.team_id, readinessTemplate.template_id);
      setTemplates((items) => [published, ...items.filter((item) => item.template_id !== published.template_id)]);
      setTemplateReadinessOpen(false);
      setTemplateReadiness(null);
      setReadinessTemplate(null);
      showToast('success', '模板已发布，可在发布任务页选择。');
      setMode({ type: 'list' });
      void refreshTemplates();
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '模板发布失败');
    } finally {
      setTemplatePublishing(false);
    }
  };

  const duplicateTemplate = async (template: TemplatePayload) => {
    if (!team) return;
    setActionError(null);
    try {
      const copied = await copyTemplate(team.team_id, template.template_id, { name: `${template.name} 副本` });
      setTemplates((items) => [copied, ...items]);
      showToast('success', '模板副本已创建，可继续修改后发布。');
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '模板复制失败');
    }
  };

  const deleteTemplateItem = async (template: TemplatePayload) => {
    if (!team) return;
    setActionError(null);
    try {
      await deleteTemplate(team.team_id, template.template_id);
      setTemplates((items) => items.filter((item) => item.template_id !== template.template_id));
      showToast('success', '模板已删除。');
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '模板删除失败');
    }
  };

  const importSchemaIntoDesigner = () => {
    setSchemaImportError('');
    setActionError(null);
    try {
      const raw = JSON.parse(schemaImportText);
      const rawRecord = isRecord(raw) ? raw : {};
      const schemaCandidate = isRecord(rawRecord.schema) ? rawRecord.schema : raw;
      const importedSchema = normalizeImportedTemplateSchema(schemaCandidate);
      const importedDatasetId = resolveImportedReferenceDatasetId(rawRecord, isRecord(schemaCandidate) ? schemaCandidate : {}, datasets);
      setForm({
        name: typeof rawRecord.name === 'string' && rawRecord.name.trim() ? rawRecord.name.trim() : '导入的标注模板',
        description: typeof rawRecord.description === 'string' ? rawRecord.description : '',
        dataset_id: importedDatasetId,
      });
      resetDesigner(importedSchema);
      setMode({ type: 'designer' });
      setSchemaImportOpen(false);
      setSchemaImportText('');
      showToast('success', 'Schema 已导入 Designer，请检查字段、联动和 Renderer 预览后保存。');
    } catch (err) {
      setSchemaImportError(err instanceof Error ? err.message : 'Schema JSON 解析失败');
    }
  };

  const exportSchemaFile = (name: string, schemaToExport: TemplateSchemaPayload) => {
    const blob = new Blob([JSON.stringify(schemaToExport, null, 2)], { type: 'application/json;charset=utf-8' });
    const filename = `${sanitizeFilename(name || 'markup-template')}-schema.json`;
    downloadBlob(blob, filename);
    showToast('success', `Schema 已准备下载：${filename}`);
  };

  const exportTemplateSchema = async (template: TemplatePayload) => {
    if (!team) return;
    setActionError(null);
    try {
      const detail = template.schema ? template : await getTemplate(team.team_id, template.template_id);
      exportSchemaFile(detail.name, detail.schema ?? defaultSchema());
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Schema 导出失败');
    }
  };

  const exportVersionSchema = (version: TemplateVersionPayload) => {
    if (!versionTemplate || !version.schema) return;
    exportSchemaFile(`${versionTemplate.name}-v${version.version}`, version.schema);
  };

  if (loading) return <main className="workspace-content workspace-loading-page"><WorkspaceLoading tip="正在加载企业信息" /></main>;
  if (error || !team) return <main className="workspace-content workspace-status-page"><Alert className="workspace-page-alert" type="warning" showIcon title={error || '请先完成企业企业配置。'} /></main>;

  if (mode.type === 'renderer') {
    const rendererDataset = datasets.find((dataset) => dataset.dataset_id === rendererDatasetId) ?? selectedDataset ?? datasets[0] ?? null;
    const rendererRows = rendererDataset?.preview_rows?.length ? rendererDataset.preview_rows : [];
    const safeRendererRowIndex = rendererRows.length ? Math.min(rendererRowIndex, rendererRows.length - 1) : 0;
    const rendererStats = {
      tabs: mode.schema.tabs.length,
      components: mode.schema.tabs.flatMap((tab) => tab.components).length,
      showItems: extractShowItems(mode.schema).length,
      answerFields: extractAnswerFields(mode.schema).length,
    };
    const previewContent = sampleContent(rendererDataset, safeRendererRowIndex);
    const rendererFieldErrors = Array.isArray(rendererValidation?.field_errors) ? rendererValidation.field_errors : [];
    const rendererWarnings = Array.isArray(rendererValidation?.warnings) ? rendererValidation.warnings : [];
    const rendererErrorCount = rendererValidation?.summary?.error_count ?? rendererFieldErrors.length;
    return (
              <main className="workspace-content production-page template-renderer-page workspace-fixed-page">
        <section className="page-heading">
          <div>
            <p className="section-kicker">Renderer Preview</p>
            <h1>Renderer 预览</h1>
            <p>{mode.name}{mode.version ? ` · v${mode.version}` : ''}，使用完整页面预览同一份 schema 在标注工作台的运行效果。</p>
          </div>
          <div className="page-actions icon-only-actions">
            <Tooltip title="运行校验">
              <AntButton aria-label="运行校验" autoInsertSpace={false} type="text" loading={rendererValidating} icon={<CheckCircleOutlined />} onClick={() => void runRendererValidation(mode.schema, previewContent)} />
            </Tooltip>
            <AntButton onClick={() => {
              if (mode.fromDesigner) {
                setMode({ type: 'designer', templateId: mode.templateId, sourceStatus: mode.templateId ? 'draft' : 'draft' });
                return;
              }
              if (mode.returnToVersions && versionTemplate) {
                setVersionDrawerOpen(true);
              }
              setMode({ type: 'list' });
            }} aria-label={mode.fromDesigner ? '返回 Designer' : '返回模板搭建'} autoInsertSpace={false} icon={<ArrowLeftOutlined />} type="text" />
            <Tooltip title="刷新列表数据">
              <AntButton aria-label="刷新列表数据" autoInsertSpace={false} type="text" icon={<ReloadOutlined />} onClick={() => void refreshTemplates()} />
            </Tooltip>
          </div>
        </section>
        <section className="renderer-data-toolbar" aria-label="Renderer 预览数据选择">
          <div className="renderer-field-compact">
            <span>预览数据集</span>
            <Select
              aria-label="预览数据集"
              value={rendererDataset?.dataset_id}
              placeholder="示例数据"
              onChange={(value) => {
                setRendererDatasetId(value);
                setRendererRowIndex(0);
                setRendererValidation(null);
              }}
              options={datasets.map((dataset) => ({ value: dataset.dataset_id, label: `${dataset.name} / ${dataset.preview_rows.length || dataset.row_count} 行` }))}
            />
          </div>
          <div className="renderer-field-compact">
            <span>样例行</span>
            <Select
              aria-label="样例行"
              value={String(safeRendererRowIndex)}
              disabled={!rendererRows.length}
              onChange={(value) => {
                setRendererRowIndex(Number(value));
                setRendererValidation(null);
              }}
              options={(rendererRows.length ? rendererRows : [{}]).map((row, index) => ({ value: String(index), label: `第 ${index + 1} 行 · ${shorten(Object.values(row).map((item) => cellText(item)).join(' / '), 42) || '示例数据'}` }))}
            />
          </div>
        </section>
        <section className="renderer-preview-workspace">
          <div className="renderer-preview-main">
            <div className="renderer-preview-toolbar">
              <strong>模拟标注页</strong>
              <span>Renderer 预览只做本地校验，不写入正式 submission。</span>
            </div>
            <TemplateRenderer
              schema={mode.schema}
              content={previewContent}
              answers={rendererAnswers}
              errors={rendererFieldErrors}
              onAnswerChange={(field, value) => {
                setRendererAnswers((answers) => ({ ...answers, [field]: value }));
                setRendererValidation(null);
              }}
              onAiAssistRequest={(component) => void runRendererAiAssist(mode.schema, previewContent, component)}
              aiAssistLoading={rendererAiAssisting}
              aiAssistDisabled={rendererAiAssisting}
            />
          </div>
          <aside className="renderer-check-panel">
            <strong>运行检查</strong>
            <ul>
              <li className={rendererStats.tabs > 0 ? 'pass' : 'block'}>至少一个页签</li>
              <li className={rendererStats.components > 0 ? 'pass' : 'block'}>至少一个组件</li>
              <li className={rendererStats.showItems > 0 ? 'pass' : 'warn'}>ShowItem 原始数据展示</li>
              <li className={rendererStats.answerFields > 0 ? 'pass' : 'warn'}>可提交答案字段</li>
              <li className="pass">使用同一份 TemplateRenderer 渲染</li>
              {rendererValidation && <li className={rendererValidation.valid ? 'pass' : 'block'}>{rendererValidation.valid ? '运行时字段校验通过' : `运行时字段错误 ${rendererErrorCount} 个`}</li>}
            </ul>
            {rendererFieldErrors.length ? (
              <div className="renderer-validation-result">
                <span>字段错误</span>
                <ul>
                  {rendererFieldErrors.map((error, index) => <li key={`${error.field || error.component_id}-${index}`}>{error.message}</li>)}
                </ul>
              </div>
            ) : null}
            {rendererWarnings.length ? (
              <div className="renderer-validation-result warn">
                <span>预览警告</span>
                <ul>
                  {rendererWarnings.map((warning, index) => <li key={`${warning.field || warning.component_id}-${index}`}>{warning.message}</li>)}
                </ul>
              </div>
            ) : null}
          </aside>
        </section>
      </main>
    );
  }

  if (mode.type === 'list') {
    return (
      <main className="workspace-content production-page production-list-page template-management-page workspace-fixed-page">
        <section className="page-heading">
          <div>
            <p className="section-kicker">Templates</p>
            <h1>模板搭建</h1>
          </div>
          <div className="page-actions">
            <AntButton icon={<ReloadOutlined />} onClick={() => void refreshTemplates()}>刷新</AntButton>
            <AntButton icon={<UploadOutlined />} onClick={() => { setSchemaImportOpen(true); setSchemaImportError(''); }}>导入 schema</AntButton>
            <AntButton icon={<PlusOutlined />} type="primary" onClick={openNewDesigner}>新建模板</AntButton>
          </div>
        </section>

        <WorkspaceSummaryStrip
          ariaLabel="模板概览"
          items={[
            { key: 'total', label: '模板总数', value: templateStats.total },
            { key: 'draft', label: '草稿', value: templateStats.draft },
            { key: 'published', label: '已发布', value: templateStats.published },
            { key: 'showItems', label: '展示项', value: templateStats.showItems },
            { key: 'references', label: '引用任务', value: '-' },
          ]}
        />

        <section className="production-filter-bar workspace-fixed-toolbar">
          <Input.Search className="production-filter-search" allowClear placeholder="搜索模板名称、说明" value={templateQuery} onChange={(event) => { setTemplateQuery(event.target.value); setTemplateCardPage(1); }} />
          <Select className="production-filter-select" value={templateStatus} onChange={(value) => { setTemplateStatus(value); setTemplateCardPage(1); }} getPopupContainer={workspacePopupContainer} options={[
            { value: 'all', label: '全部状态' },
            { value: 'draft', label: '草稿' },
            { value: 'published', label: '已发布' },
          ]} />
          <Segmented<ProductionViewMode>
            className="production-view-switch"
            aria-label="模板展示方式"
            value={templateViewMode}
            onChange={setTemplateViewMode}
            options={productionViewOptions}
          />
        </section>

        {templateViewMode === 'table' ? (
          <section className="production-table-shell workspace-fixed-table-panel">
            <EnhancedTable<TemplatePayload>
              className="workspace-fixed-table"
              rowKey="template_id"
              loading={templateLoading}
              dataSource={filteredTemplates}
              pagination={fixedTablePagination(filteredTemplates.length)}
              scroll={{ y: 'calc(var(--workspace-table-body-height) - 84px)' }}
              tableLayout="fixed"
              locale={{ emptyText: '还没有模板，点击“新建模板”开始搭建。' }}
              columns={decorateTemplateTableColumns([
              {
                title: '模板名称',
                render: (_, template) => (
                  <button type="button" className="table-link-cell" onClick={() => void openDesigner(template)}>
                    <FormOutlined aria-hidden="true" />
                    <strong>{template.name}</strong>
                    <span>{template.description || '暂无描述'}</span>
                  </button>
                ),
              },
              { title: '负责人', width: 138, render: (_, template) => <OwnerTag label="创建人" name={ownerDisplayName(template)} /> },
              { title: '当前版本', render: (_, template) => <Tag color={template.status === 'published' ? 'green' : 'orange'}>v{template.latest_version} · {template.status === 'published' ? '已发布' : template.auto_saved ? '自动保存' : '草稿'}</Tag> },
              { title: '结构概览', render: (_, template) => `${template.tab_count} 页签 / ${template.show_item_count} ShowItem` },
              { title: '引用情况', render: (_, template) => `${template.reference_stats?.task_count ?? 0} 任务 / ${template.reference_stats?.active_task_count ?? 0} 进行中` },
              { title: '最近更新', render: (_, template) => formatDateTime(template.updated_at) },
              {
                title: '操作',
                width: 138,
                key: 'actions',
                fixed: 'right',
                className: 'workspace-table-action-cell',
                render: (_, template) => (
                  <WorkspaceTableActions
                    visible={[
                      { key: 'edit', label: template.status === 'published' ? '新建版本' : '修改模板', icon: <EditOutlined />, onClick: () => void openDesigner(template) },
                      { key: 'preview', label: 'Renderer 预览', icon: <EyeOutlined />, onClick: () => void openRenderer(template) },
                    ]}
                    menu={[
                      { key: 'versions', label: '版本历史', icon: <FileTextOutlined />, onClick: () => void showVersions(template) },
                      { key: 'export', label: '导出 schema', icon: <DownloadOutlined />, onClick: () => void exportTemplateSchema(template) },
                      { key: 'copy', label: '复制模板', icon: <CopyOutlined />, onClick: () => void duplicateTemplate(template) },
                      ...(template.status !== 'published' ? [{ key: 'publish', label: '发布模板', icon: <RocketOutlined />, onClick: () => void openTemplatePublishCheck(template) }] : []),
                      {
                        key: 'delete',
                        label: '删除模板',
                        icon: <DeleteOutlined />,
                        danger: true,
                        onClick: () => deleteTemplateItem(template),
                        confirm: {
                          title: '删除模板？',
                          content: '删除后无法恢复；已被任务引用的模板后端会拒绝删除，历史任务版本不会被破坏。',
                          okText: '删除',
                        },
                      },
                    ]}
                  />
                ),
              },
              ], filteredTemplates)}
            />
          </section>
        ) : (
          <section className="production-card-shell workspace-fixed-table-panel" aria-label="模板卡片列表">
            <Spin spinning={templateLoading}>
              <div className="production-card-scroll">
                {filteredTemplates.length ? (
                  <div className="production-card-grid">
                    {visibleTemplateCards.map((template) => (
                      <AntCard
                        className="production-card template-production-card"
                        key={template.template_id}
                        role="button"
                        tabIndex={0}
                        onClick={() => void openDesigner(template)}
                        onKeyDown={(event) => activateCardFromKeyboard(event, () => void openDesigner(template))}
                      >
                        <div className="production-card-topline">
                          <div className="production-card-badges">
                            <Tag color={template.status === 'published' ? 'green' : 'orange'}>{template.status === 'published' ? '已发布' : template.auto_saved ? '自动保存' : '草稿'}</Tag>
                            <Tag color="blue">v{template.latest_version}</Tag>
                          </div>
                          <span className="production-card-status">{formatDateTime(template.updated_at || template.created_at)}</span>
                        </div>
                        <div className="production-card-body">
                          <h3>{template.name}</h3>
                          <p>{template.description || '暂无描述'}</p>
                        </div>
                        <div className="production-card-owner">
                          <span>创建人</span>
                          <Tag color="blue">{ownerDisplayName(template)}</Tag>
                        </div>
                        <div className="production-card-metrics" aria-label="模板关键指标">
                          <span><strong>{template.tab_count}</strong><small>页签</small></span>
                          <span><strong>{template.show_item_count}</strong><small>ShowItem</small></span>
                          <span><strong>{template.reference_stats?.task_count ?? 0}</strong><small>引用任务</small></span>
                        </div>
                        <div className="production-card-tags">
                          <Tag color={(template.reference_stats?.active_task_count ?? 0) > 0 ? 'green' : 'default'}>{template.reference_stats?.active_task_count ?? 0} 个进行中任务</Tag>
                          <Tag color={template.show_item_count > 0 ? 'blue' : 'orange'}>{template.show_item_count > 0 ? '可绑定数据' : '缺少展示项'}</Tag>
                        </div>
                        <div className="production-card-actions">
                          <AntButton icon={template.status === 'published' ? <PlusOutlined /> : <EditOutlined />} size="small" type="primary" onClick={(event) => { event.stopPropagation(); void openDesigner(template); }}>{template.status === 'published' ? '新建版本' : '修改'}</AntButton>
                          <AntButton icon={<EyeOutlined />} size="small" onClick={(event) => { event.stopPropagation(); void openRenderer(template); }}>预览</AntButton>
                          <Dropdown
                            getPopupContainer={() => document.body}
                            classNames={{ root: 'template-card-action-dropdown' }}
                            menu={{
                              items: [
                                { key: 'versions', icon: <FileTextOutlined />, label: '版本历史' },
                                { key: 'export', icon: <CodeOutlined />, label: '导出 schema' },
                                { key: 'copy', icon: <CopyOutlined />, label: '复制模板' },
                                { key: 'delete', icon: <DeleteOutlined />, label: '删除模板', danger: true },
                                ...(template.status !== 'published' ? [{ key: 'publish', icon: <RocketOutlined />, label: '发布模板' }] : []),
                              ],
                              onClick: ({ key, domEvent }) => {
                                domEvent.stopPropagation();
                                if (key === 'versions') void showVersions(template);
                                if (key === 'export') void exportTemplateSchema(template);
                                if (key === 'copy') void duplicateTemplate(template);
                                if (key === 'delete') {
                                  Modal.confirm({
                                    title: '删除模板？',
                                    content: '删除后无法恢复；已被任务引用的模板后端会拒绝删除，历史任务版本不会被破坏。',
                                    okText: '删除',
                                    cancelText: '取消',
                                    centered: true,
                                    okButtonProps: { danger: true },
                                    onOk: () => deleteTemplateItem(template),
                                  });
                                }
                                if (key === 'publish') void openTemplatePublishCheck(template);
                              },
                            }}
                          >
                            <AntButton icon={<MoreOutlined />} size="small" onClick={(event) => event.stopPropagation()}>更多</AntButton>
                          </Dropdown>
                        </div>
                      </AntCard>
                    ))}
                  </div>
                ) : (
                  <Empty className="production-card-empty" description="还没有模板，点击“新建模板”开始搭建。" />
                )}
              </div>
            </Spin>
            <div className="production-card-pagination">
              <Pagination
                current={safeTemplateCardPage}
                pageSize={templateCardPageSize}
                total={filteredTemplates.length}
                showSizeChanger
                showQuickJumper
                pageSizeOptions={productionCardPageSizeOptions.map(String)}
                onChange={(page, pageSize) => {
                  setTemplateCardPage(page);
                  setTemplateCardPageSize(pageSize);
                }}
              />
            </div>
          </section>
        )}

        <SchemaImportModal
          open={schemaImportOpen}
          value={schemaImportText}
          error={schemaImportError}
          onChange={(value) => {
            setSchemaImportText(value);
            if (schemaImportError) setSchemaImportError('');
          }}
          onFileError={setSchemaImportError}
          onCancel={() => setSchemaImportOpen(false)}
          onConfirm={importSchemaIntoDesigner}
        />

        <Modal
          title={versionTemplate ? `${versionTemplate.name} 版本历史` : '版本历史'}
          open={versionDrawerOpen}
          footer={null}
          width={820}
          onCancel={() => { setVersionDrawerOpen(false); setVersionDiff(null); }}
        >
          <EnhancedTable<TemplateVersionPayload>
            rowKey="version_id"
            dataSource={versions}
            pagination={false}
            columns={[
              { title: '版本', render: (_, version) => `v${version.version}` },
              { title: '状态', render: (_, version) => <Tag color={version.is_published ? 'green' : 'orange'}>{version.is_published ? '已发布' : '草稿'}</Tag> },
              { title: '组件统计', render: (_, version) => `${version.component_stats?.tab_count ?? 0} 页签 / ${version.component_stats?.component_count ?? 0} 组件 / ${version.component_stats?.show_item_count ?? 0} ShowItem` },
              { title: '引用任务', render: (_, version) => `${version.reference_stats?.task_count ?? 0} 任务 / ${version.reference_stats?.active_task_count ?? 0} 进行中` },
              { title: '创建时间', render: (_, version) => formatDateTime(version.created_at) },
              {
                title: '操作',
                key: 'actions',
                width: 138,
                className: 'workspace-table-action-cell',
                render: (_, version) => (
                  <WorkspaceTableActions
                    visible={[
                      { key: 'preview', label: '预览', icon: <EyeOutlined />, disabled: !version.schema, onClick: () => openVersionRenderer(version) },
                      { key: 'export', label: '导出', icon: <DownloadOutlined />, disabled: !version.schema, onClick: () => exportVersionSchema(version) },
                    ]}
                    menu={[{
                      key: 'compare',
                      label: '对比上一版',
                      icon: <FileTextOutlined />,
                      disabled: version.version <= 1,
                      loading: versionDiffLoading,
                      onClick: () => void compareVersionWithPrevious(version),
                    }]}
                  />
                ),
              },
            ]}
          />
          {versionDiff && <TemplateVersionDiffPanel diff={versionDiff} />}
        </Modal>
        <TemplatePublishCheckModal
          open={templateReadinessOpen}
          template={readinessTemplate}
          readiness={templateReadiness}
          publishing={templatePublishing}
          onCancel={() => setTemplateReadinessOpen(false)}
          onConfirm={() => void confirmTemplatePublish()}
        />
      </main>
    );
  }

  return (
    <main className={['workspace-content production-page designer-workbench-page workspace-fixed-page', designerHeaderCollapsed ? 'designer-header-collapsed' : ''].filter(Boolean).join(' ')}>
      <section className="page-heading">
        <div>
          <p className="section-kicker">Designer</p>
          <h1>{mode.templateId ? form.name || '编辑模板' : form.name && form.name !== '未命名标注模板' ? form.name : '新建模板'}</h1>
          <p>左侧物料栏、中间多页签画布、右侧属性配置。ShowItem 只占位原始字段，发布任务时再做列映射。</p>
        </div>
        <div className="page-actions icon-only-actions">
          <Tooltip title="收起标题与概览">
            <AntButton
              aria-label="收起标题与概览"
              autoInsertSpace={false}
              type="text"
              icon={<ArrowUpOutlined />}
              onClick={() => setDesignerHeaderCollapsed(true)}
            />
          </Tooltip>
          <Tooltip title="返回模板搭建">
            <AntButton aria-label="返回模板搭建" autoInsertSpace={false} type="text" icon={<ArrowLeftOutlined />} onClick={() => void leaveDesigner()} />
          </Tooltip>
          <Tooltip title="Renderer 预览">
            <AntButton aria-label="Renderer 预览" autoInsertSpace={false} type="text" icon={<EyeOutlined />} onClick={openDraftRenderer} />
          </Tooltip>
          <Tooltip title="导出 schema">
            <AntButton aria-label="导出 schema" autoInsertSpace={false} type="text" icon={<CodeOutlined />} onClick={() => exportSchemaFile(form.name, schema)} />
          </Tooltip>
          <Tooltip title="保存草稿">
            <AntButton aria-label="保存草稿" autoInsertSpace={false} type="text" icon={<SaveOutlined />} onClick={() => void persistDraft({ returnToList: true })} />
          </Tooltip>
          <Tooltip title="发布模板">
            <AntButton aria-label="发布模板" className="designer-publish-action" icon={<RocketOutlined />} type="primary" onClick={() => void openTemplatePublishCheck()}>发布模板</AntButton>
          </Tooltip>
        </div>
      </section>

      <TemplatePublishCheckModal
        open={templateReadinessOpen}
        template={readinessTemplate}
        readiness={templateReadiness}
        publishing={templatePublishing}
        onCancel={() => setTemplateReadinessOpen(false)}
        onConfirm={() => void confirmTemplatePublish()}
      />

      <section className="designer-status-strip designer-fixed-status-strip" aria-label="模板结构概览">
        <span><strong>{schemaStats.tabs}</strong> 页签</span>
        <span><strong>{schemaStats.components}</strong> 物料</span>
        <span><strong>{schemaStats.showItems}</strong> 展示项</span>
        <span><strong>{schemaStats.required}</strong> 必填字段</span>
        <span><strong>{schemaStats.llm}</strong> LLM 组件</span>
        <span><strong>{mode.sourceStatus === 'published' ? '新版本草稿' : '草稿'}</strong> 编辑状态</span>
        <span><strong>{templateAutoSaveState === 'saving' ? '自动保存中' : templateAutoSaveState === 'saved' ? '已自动保存' : templateAutoSaveState === 'error' ? '自动保存失败' : '未保存'}</strong> 保存状态</span>
      </section>

      <section className="designer-shell survey-designer-shell">
        <aside className="designer-palette">
          <div className="designer-panel-heading">
            <span>Components</span>
            <strong>题型物料</strong>
          </div>
          <div className="palette-list designer-material-list">
            {materialGroups.map((group) => (
              <div className="designer-material-group" key={group}>
                <span>{group}</span>
                {palette.filter((item) => item.group === group).map((item) => (
                  <Tooltip title={`${item.type} · ${item.label}`} placement="right" key={item.type}>
                    <button
                      draggable
                      type="button"
                      onClick={() => addComponent(item.type, item.fieldPrefix, item.label)}
                      onDragStart={(event) => event.dataTransfer.setData('application/x-markup-component', item.type)}
                    >
                      <i aria-hidden="true">{item.icon}</i>
                      <span className="designer-material-copy">
                        <strong>{item.label}</strong>
                      </span>
                    </button>
                  </Tooltip>
                ))}
              </div>
            ))}
          </div>
          <div className="designer-list-panel material-groups">
            <strong>常用组合</strong>
            <div className="designer-preset-list" aria-label="常用组合预设">
              {designerQuickComboButtons.map((preset) => (
                <AntButton
                  key={preset.key}
                  className="designer-preset-button"
                  icon={preset.icon}
                  aria-label={preset.label}
                  onClick={preset.onClick}
                >
                  <span className="designer-preset-button-copy">
                    <span className="designer-preset-button-headline">
                      <strong>{preset.label}</strong>
                      <em>{preset.items.length} 项</em>
                    </span>
                    <small>{preset.description}</small>
                    <span className="designer-preset-button-flow">
                      {preset.items.map((item) => (
                        <span key={`${preset.key}-${item.fieldPrefix}-${item.label}`}>{item.label}</span>
                      ))}
                    </span>
                  </span>
                </AntButton>
              ))}
            </div>
          </div>
        </aside>

        <section className="designer-canvas" onDragOver={(event) => event.preventDefault()} onDrop={dropComponent}>
          <div className={['designer-topbar', designerHeaderCollapsed ? 'has-restore-action' : ''].filter(Boolean).join(' ')}>
            {designerHeaderCollapsed && (
              <Tooltip title="展开标题与概览">
                <AntButton
                  aria-label="展开标题与概览"
                  className="designer-header-toggle designer-header-restore"
                  icon={<DownOutlined />}
                  size="small"
                  type="text"
                  onClick={() => setDesignerHeaderCollapsed(false)}
                />
              </Tooltip>
            )}
            <div className="designer-field-compact">
              <span>模板名称</span>
              <Input aria-label="模板名称" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </div>
            <div className="designer-field-compact designer-dataset-compact">
              <span>参考数据集</span>
              <Dropdown
                getPopupContainer={() => document.body}
                trigger={['click']}
                menu={{
                  items: referenceDatasetMenuItems,
                  selectable: true,
                  selectedKeys: [form.dataset_id || '__none__'],
                  onClick: ({ key }) => setForm({ ...form, dataset_id: key === '__none__' ? '' : String(key) }),
                }}
              >
                <AntButton className={`designer-dataset-trigger${selectedDataset ? '' : ' is-empty'}`} aria-label="参考数据集" onClick={(event) => event.preventDefault()}>
                  <DatabaseOutlined />
                  <span className="designer-dataset-trigger-text">{selectedDataset?.name || '不绑定'}</span>
                  <DownOutlined />
                </AntButton>
              </Dropdown>
            </div>
          </div>
          <Tabs
            className="designer-tabs"
            activeKey={activeTabId}
            onChange={setActiveTabId}
            tabBarExtraContent={
              <div className="designer-tab-actions">
                <Tooltip title="新增页签">
                  <AntButton aria-label="+ 页签" size="small" icon={<PlusOutlined />} onClick={addTab}>页签</AntButton>
                </Tooltip>
              </div>
            }
            items={schema.tabs.map((tab) => ({
              key: tab.id,
              label: renamingTabId === tab.id ? (
                <Input
                  size="small"
                  aria-label={`${tab.title}页签名称`}
                  value={tab.title}
                  onChange={(event) => setSchema(updateTabTitle(schema, tab.id, event.target.value))}
                  onBlur={() => setRenamingTabId('')}
                  onPressEnter={() => setRenamingTabId('')}
                  onClick={(event) => event.stopPropagation()}
                />
              ) : (
                <span className="designer-tab-label" onDoubleClick={() => setRenamingTabId(tab.id)}>
                  <span className="designer-tab-title">{tab.title}</span>
                  <Dropdown
                    getPopupContainer={() => document.body}
                    menu={{ items: [
                      { key: 'rename', icon: <EditOutlined />, label: '重命名', onClick: () => setRenamingTabId(tab.id) },
                      { key: 'copy', icon: <CopyOutlined />, label: '复制', onClick: () => duplicateTabById(tab.id) },
                      { key: 'left', icon: <ArrowLeftOutlined />, label: '左移', disabled: schema.tabs.findIndex((item) => item.id === tab.id) === 0, onClick: () => moveTabById(tab.id, -1) },
                      { key: 'right', icon: <ArrowRightOutlined />, label: '右移', disabled: schema.tabs.findIndex((item) => item.id === tab.id) === schema.tabs.length - 1, onClick: () => moveTabById(tab.id, 1) },
                      { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true, disabled: schema.tabs.length <= 1, onClick: () => removeTabWithConfirm(tab.id) },
                    ] }}
                  >
                    <AntButton
                      aria-hidden="true"
                      className="designer-tab-more"
                      icon={<MoreOutlined />}
                      size="small"
                      tabIndex={-1}
                      type="text"
                      onClick={(event) => event.stopPropagation()}
                    />
                  </Dropdown>
                </span>
              ),
            }))}
          />
          <div
            ref={canvasListRef}
            className="canvas-list survey-canvas-list"
            aria-label="模板画布"
            onClick={() => setSelectedId('')}
            onDragOver={(event) => {
              event.preventDefault();
              updateCanvasAutoScroll(event.clientY);
            }}
            onDragLeave={stopCanvasAutoScroll}
            onDrop={(event) => {
              dropComponent(event);
              stopCanvasAutoScroll();
            }}
          >
            {activeComponents.map((component, index) => (
              <div
                className={dropTargetId === component.id && dropTargetPosition === 'before' ? 'canvas-component-stack drop-before' : 'canvas-component-stack'}
                key={component.id}
                onDragOver={(event) => updateCanvasAutoScroll(event.clientY)}
                onDragLeave={() => {
                  setDropTargetId((current) => {
                    if (current !== component.id) return current;
                    setDropTargetPosition('before');
                    return '';
                  });
                }}
              >
                <Dropdown
                  trigger={['click']}
                  placement="bottom"
                  getPopupContainer={(triggerNode) => triggerNode.parentElement ?? document.body}
                  classNames={{ root: 'designer-material-dropdown' }}
                  menu={{ items: addMaterialMenuItems, onClick: ({ key }) => addPaletteComponent(key as TemplateComponentType, component.id, 'before') }}
                >
                  <AntButton
                    className="insert-slot"
                    icon={<PlusOutlined />}
                    size="small"
                    onClick={(event) => event.stopPropagation()}
                    onDragOver={(event) => handleDividerDragOver(event, component.id, 'before')}
                    onDrop={(event) => {
                      dropComponentAt(event, component.id);
                      stopCanvasAutoScroll();
                    }}
                  >
                    插入物料
                  </AntButton>
                </Dropdown>
                <div
                  className={[
                    'component-card',
                    component.type === 'GroupContainer' ? 'component-card--container' : '',
                    draggingId === component.id ? 'dragging' : '',
                    motionComponentId === component.id ? 'settling' : '',
                    motionComponentId === component.id ? motionOrigin : '',
                  ].filter(Boolean).join(' ')}
                  draggable
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedId(component.id);
                  }}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('application/x-markup-canvas-component', component.id);
                    setDraggingId(component.id);
                  }}
                  onDragEnd={() => {
                    setDraggingId('');
                    setDropTargetId('');
                    setDropTargetPosition('before');
                    stopCanvasAutoScroll();
                  }}
                  onAnimationEnd={() => {
                    setMotionComponentId((current) => (current === component.id ? '' : current));
                  }}
                  role="button"
                  tabIndex={0}
                  onDragOver={(event) => updateCanvasAutoScroll(event.clientY)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.stopPropagation();
                      setSelectedId(component.id);
                    }
                  }}
                >
                  <div className="component-card-main">
                    <span className="component-drag-handle" aria-hidden="true"><DragOutlined /></span>
                    <span className="question-index">{component.type === 'GroupContainer' ? <AppstoreOutlined /> : String(index + 1).padStart(2, '0')}</span>
                    <div className="component-copy">
                      <div className="component-title-line">
                        <strong>{component.label}</strong>
                        {component.required && <em>必填</em>}
                      </div>
                      <small className="component-description">{componentDescriptionText(component) || '暂无说明文字'}</small>
                      <div className="component-meta-grid" aria-label={`${component.label} 绑定与字段信息`}>
                        <span>{componentBindingMeta(component)}</span>
                        <span>{componentAnswerFieldMeta(component)}</span>
                      </div>
                    </div>
                  </div>
                  <span className="component-type-badge">{componentTypeLabel(component.type)}</span>
                  <div className="component-inline-actions">
                  {component.type === 'GroupContainer' && (
                    <Dropdown
                      trigger={['click']}
                      placement="bottomRight"
                      getPopupContainer={() => document.body}
                      classNames={{ root: 'designer-material-dropdown' }}
                      menu={{ items: addMaterialMenuItems.filter((item) => item.key !== 'GroupContainer'), onClick: ({ key }) => addPaletteComponent(key as TemplateComponentType, component.id, 'after') }}
                    >
                      <AntButton autoInsertSpace={false} size="small" icon={<PlusOutlined />} aria-label={`向${component.label}后添加物料`} onClick={(event) => event.stopPropagation()} type="text" />
                    </Dropdown>
                  )}
                  <Tooltip title="上移">
                    <AntButton autoInsertSpace={false} size="small" icon={<ArrowUpOutlined />} aria-label={`上移 ${component.label}`} onClick={(event) => { event.stopPropagation(); setSchema(normalizeLlmComponentsLast(moveComponentByOffset(schema, activeTabId, component.id, -1))); }} type="text" />
                  </Tooltip>
                  <Tooltip title="下移">
                    <AntButton autoInsertSpace={false} size="small" icon={<ArrowDownOutlined />} aria-label={`下移 ${component.label}`} onClick={(event) => { event.stopPropagation(); setSchema(normalizeLlmComponentsLast(moveComponentByOffset(schema, activeTabId, component.id, 1))); }} type="text" />
                  </Tooltip>
                  <Tooltip title="复制">
                    <AntButton autoInsertSpace={false} size="small" icon={<CopyOutlined />} aria-label={`复制 ${component.label}`} onClick={(event) => { event.stopPropagation(); duplicateComponent(component.id); }} type="text" />
                  </Tooltip>
                  <Tooltip title="删除">
                    <AntButton autoInsertSpace={false} size="small" danger icon={<DeleteOutlined />} aria-label={`删除 ${component.label}`} onClick={(event) => { event.stopPropagation(); removeComponentById(component.id); }} type="text" />
                  </Tooltip>
                  </div>
                </div>
              </div>
            ))}
            {lastComponent && (
              <div
                className={dropTargetId === lastComponent.id && dropTargetPosition === 'after' ? 'canvas-end-divider drop-after' : 'canvas-end-divider'}
                onDragOver={(event) => updateCanvasAutoScroll(event.clientY)}
                onDragLeave={() => {
                  setDropTargetId((current) => {
                    if (current !== lastComponent.id || dropTargetPosition !== 'after') return current;
                    setDropTargetPosition('before');
                    return '';
                  });
                }}
              >
                <Dropdown
                  trigger={['click']}
                  placement="bottom"
                  getPopupContainer={(triggerNode) => triggerNode.parentElement ?? document.body}
                  classNames={{ root: 'designer-material-dropdown' }}
                  menu={{ items: addMaterialMenuItems, onClick: ({ key }) => addPaletteComponent(key as TemplateComponentType, lastComponent.id, 'after') }}
                >
                  <AntButton
                    className="insert-slot insert-slot-end"
                    icon={<PlusOutlined />}
                    size="small"
                    onClick={(event) => event.stopPropagation()}
                    onDragOver={(event) => handleDividerDragOver(event, lastComponent.id, 'after')}
                    onDrop={(event) => {
                      dropComponentAt(event, lastComponent.id, 'after');
                      stopCanvasAutoScroll();
                    }}
                  >
                    插入物料
                  </AntButton>
                </Dropdown>
              </div>
            )}
            {!activeComponents.length && (
              <div className="canvas-empty-state">
                <strong>当前页签还没有物料</strong>
                <p>从左侧拖入题型，或直接添加常用字段。删除全部物料后仍可继续配置页签、保存草稿和重新添加。</p>
                <div>
                  <AntButton aria-label="添加智能展示块" icon={<EyeOutlined />} onClick={() => addComponent('ShowItem', 'show', '智能展示块')}>添加展示块</AntButton>
                  <AntButton aria-label="添加输入字段" icon={<FontSizeOutlined />} type="primary" onClick={() => addComponent('TextInput', 'text', '单行输入')}>添加输入字段</AntButton>
                  <AntButton aria-label="添加分组容器" icon={<AppstoreOutlined />} onClick={() => addComponent('GroupContainer', 'group', '分组容器')}>添加分组容器</AntButton>
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="property-panel">
          <div className="designer-panel-heading">
            <span>Inspector</span>
            <strong>属性配置</strong>
          </div>
          <div className="property-actions">
            <Tooltip title="复制当前组件">
              <AntButton aria-label="复制" autoInsertSpace={false} icon={<CopyOutlined />} onClick={duplicateSelected} disabled={!selected} type="text" />
            </Tooltip>
            <Tooltip title="删除当前组件">
              <AntButton aria-label="删除" autoInsertSpace={false} icon={<DeleteOutlined />} danger type="text" onClick={removeSelected} disabled={!selected} />
            </Tooltip>
          </div>
          {selected && <p className="selection-meta">当前选择第 {selectedIndex + 1} 个物料 · {componentTypeLabel(selected.type)}</p>}
          {selected ? (
            <div className="property-form">
              <section className="property-section-card">
                <div className="property-section-title">
                  <strong>基础</strong>
                  <span>标题、字段、说明</span>
                </div>
                <label aria-label="组件标题"><span aria-hidden="true">组件标题</span><Input value={selected.label} onChange={(event) => patchSelected({ label: event.target.value })} /></label>
                <label>字段名<Input value={selected.field} onChange={(event) => patchSelectedField(event.target.value)} /></label>
                <label>说明文字
                  <Input.TextArea
                    aria-label="说明文字"
                    autoSize={{ minRows: 2, maxRows: 4 }}
                    value={String(selected.config.description ?? '')}
                    onChange={(event) => patchSelectedConfig('description', event.target.value)}
                    placeholder="展示给标注员的字段说明、操作要求或判断标准。"
                  />
                </label>
                {!nonAnswerComponentTypes.has(selected.type) && (
                  <div className="property-switch-row">
                    <span>必填</span>
                    <Switch size="small" checked={selected.required} onChange={(checked) => patchSelected({ required: checked })} />
                  </div>
                )}
                {!nonAnswerComponentTypes.has(selected.type) && (
                  <>
                    <label>占位提示<Input value={String(selected.config.placeholder ?? '')} onChange={(event) => patchSelectedConfig('placeholder', event.target.value)} placeholder={`请输入${selected.label}`} /></label>
                    <label>默认值<Input value={String(selected.config.default_value ?? '')} onChange={(event) => patchSelectedConfig('default_value', event.target.value)} placeholder="可选" /></label>
                  </>
                )}
              </section>
              <section className="property-section-card">
                <div className="property-section-title">
                  <strong>配置</strong>
                  <span>{selected.type === 'ShowItem' ? '多字段展示' : selected.type === 'LLMComponent' ? 'AI 辅助' : selected.type === 'GroupContainer' ? '容器样式' : '运行参数'}</span>
                </div>
              {['TextInput', 'TextArea', 'RichEditor'].includes(selected.type) && (
                <div className="validation-grid" aria-label="文本校验配置">
                  <label>最小长度<InputNumber min={0} value={typeof selected.config.min_length === 'number' ? selected.config.min_length : null} onChange={(value) => patchSelectedConfig('min_length', value ?? '')} /></label>
                  <label>最大长度<InputNumber min={0} value={typeof selected.config.max_length === 'number' ? selected.config.max_length : null} onChange={(value) => patchSelectedConfig('max_length', value ?? '')} /></label>
                  <label className="form-span">正则表达式<Input value={String(selected.config.pattern ?? '')} onChange={(event) => patchSelectedConfig('pattern', event.target.value)} placeholder="例如 ^[A-Z0-9_-]+$" /></label>
                  <label>自定义校验
                    <Select
                      value={String((asRecord(selected.config.custom_validation).operator as string | undefined) ?? '')}
                      options={[
                        { value: '', label: '不启用' },
                        { value: 'contains', label: '必须包含' },
                        { value: 'not_contains', label: '不能包含' },
                        { value: 'starts_with', label: '必须以...开头' },
                        { value: 'ends_with', label: '必须以...结尾' },
                      ]}
                      onChange={(operator) => {
                        if (!operator) {
                          patchSelectedConfig('custom_validation', undefined);
                          return;
                        }
                        const current = asRecord(selected.config.custom_validation);
                        patchSelectedConfig('custom_validation', { ...current, operator });
                      }}
                    />
                  </label>
                  <label>校验值<Input value={String(asRecord(selected.config.custom_validation).value ?? '')} disabled={!asRecord(selected.config.custom_validation).operator} onChange={(event) => patchSelectedConfig('custom_validation', { ...asRecord(selected.config.custom_validation), value: event.target.value })} placeholder="例如：合规" /></label>
                  <label className="form-span">错误提示<Input value={String(asRecord(selected.config.custom_validation).message ?? '')} disabled={!asRecord(selected.config.custom_validation).operator} onChange={(event) => patchSelectedConfig('custom_validation', { ...asRecord(selected.config.custom_validation), message: event.target.value })} placeholder="留空时使用系统默认提示" /></label>
                </div>
              )}
              {selected.type === 'ShowItem' && (
                <div className="column-binding-panel">
                  <label>展示字段
                    <Select
                      mode="multiple"
                      value={showItemDisplayOptionValues(selected)}
                      placeholder="选择要一起展示的字段"
                      allowClear
                      popupMatchSelectWidth={false}
                      options={selectedDatasetSourceOptions}
                      getPopupContainer={() => document.body}
                      onChange={(values) => {
                        const bindings = values.map((value) => decodeDataSourceOption(value));
                        const displayFields = bindings.map((binding) => ({
                          label: bindingDisplayLabel(binding).replace(/^数据列：|^媒体：|^上下文：|^附件：/, ''),
                          field: bindingToColumnName(binding) || binding.field || binding.key || binding.media_type || '',
                          binding,
                        }));
                        const primary = bindings[0] ?? null;
                        patchSelected({
                          config: {
                            ...selected.config,
                            display_fields: displayFields,
                            content_field: bindingToColumnName(primary) || '',
                            binding: primary || undefined,
                          },
                        });
                      }}
                    />
                  </label>
                  <div className="validation-grid" aria-label="展示块布局配置">
                    <label>展示密度
                      <Select
                        value={String(selected.config.layout ?? 'dense')}
                        options={[
                          { value: 'dense', label: '紧凑列表' },
                          { value: 'media_grid', label: '媒体网格' },
                        ]}
                        onChange={(value) => patchSelectedConfig('layout', value)}
                      />
                    </label>
                    <label>最多展示项<InputNumber min={1} max={30} value={typeof selected.config.max_items === 'number' ? selected.config.max_items : 10} onChange={(value) => patchSelectedConfig('max_items', value ?? 10)} /></label>
                  </div>
                  <div className="showitem-binding-preview" aria-label="ShowItem 绑定预览">
                    <div className="property-section-title">
                      <strong>绑定预览</strong>
                      <span>{selectedDataset ? `参考：${selectedDataset.name}` : '未绑定参考数据'}</span>
                    </div>
                    <TemplateRenderer
                      schema={singleComponentPreviewSchema(selected)}
                      content={selectedDatasetPreviewContent}
                      answers={{}}
                      readonly
                    />
                  </div>
                  <label>搜索数据源<input value={columnSearch} onChange={(event) => setColumnSearch(event.target.value)} placeholder="输入字段名或媒体角色筛选" /></label>
                  <div
                    className="column-drop-target"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const dataSourceValue = event.dataTransfer.getData('application/x-markup-data-source');
                      if (dataSourceValue) {
                        appendShowItemDisplayField(selected, decodeDataSourceOption(dataSourceValue));
                        return;
                      }
                      const columnName = event.dataTransfer.getData('application/x-markup-column');
                      if (columnName) appendShowItemDisplayField(selected, bindingFromColumn(columnName));
                    }}
                  >
                    拖拽数据源标签到这里加入展示块
                  </div>
                  <div className="variable-bank">
                    {filteredDesignerDataSourceOptions.map((option) => (
                      <button
                        type="button"
                        draggable
                        className="variable-token as-button"
                        key={`${option.groupLabel}:${option.value}`}
                        onClick={() => appendShowItemDisplayField(selected, decodeDataSourceOption(option.value))}
                        onDragStart={(event) => event.dataTransfer.setData('application/x-markup-data-source', option.value)}
                      >
                        <DatabaseOutlined aria-hidden="true" />
                        <span>{option.label}</span>
                        <em>{option.groupLabel}</em>
                      </button>
                    ))}
                    {!selectedDataset && <span className="inline-message">绑定参考数据集后可选数据源。</span>}
                    {selectedDataset && filteredDesignerDataSourceOptions.length === 0 && <span className="inline-message">没有匹配的数据源。</span>}
                  </div>
                </div>
              )}
              {['SingleSelect', 'MultiSelect', 'TagSelect', 'Ranking'].includes(selected.type) && (
                <>
                  <label>选项（每行一个）
                    <Input.TextArea
                      aria-label="选项（每行一个）"
                      autoSize={{ minRows: 4, maxRows: 8 }}
                      value={optionEditorComponentId === selected.id ? optionEditorText : selected.options.map((option) => option.label).join('\n')}
                      onChange={(event) => patchSelectedOptionsText(event.target.value)}
                    />
                  </label>
                  {selected.type === 'Ranking' && <span className="inline-message">选项将按顺序提交。</span>}
                  <div className="validation-grid" aria-label="选项校验配置">
                    <label>最少选择<InputNumber min={0} value={typeof selected.config.min_selected === 'number' ? selected.config.min_selected : null} onChange={(value) => patchSelectedConfig('min_selected', value ?? '')} /></label>
                    <label>最多选择<InputNumber min={0} value={typeof selected.config.max_selected === 'number' ? selected.config.max_selected : null} onChange={(value) => patchSelectedConfig('max_selected', value ?? '')} /></label>
                    {selected.type === 'TagSelect' && (
                      <div className="property-switch-row form-span">
                        <span>允许创建新标签</span>
                        <Switch size="small" checked={Boolean(selected.config.allow_create)} onChange={(checked) => patchSelectedConfig('allow_create', checked)} />
                      </div>
                    )}
                  </div>
                </>
              )}
              {selected.type === 'Scale' && (
                <div className="column-binding-panel">
                  <div className="validation-grid" aria-label="量表配置">
                    <label>最小值<InputNumber min={0} value={typeof selected.config.min === 'number' ? selected.config.min : 1} onChange={(value) => patchSelectedConfig('min', value ?? 1)} /></label>
                    <label>最大值<InputNumber min={1} value={typeof selected.config.max === 'number' ? selected.config.max : 5} onChange={(value) => patchSelectedConfig('max', value ?? 5)} /></label>
                    <label>步长<InputNumber min={0.5} step={0.5} value={typeof selected.config.step === 'number' ? selected.config.step : 1} onChange={(value) => patchSelectedConfig('step', value ?? 1)} /></label>
                    <label>左侧标签<Input value={String(selected.config.min_label ?? '')} placeholder="非常不符合" onChange={(event) => patchSelectedConfig('min_label', event.target.value)} /></label>
                    <label>右侧标签<Input value={String(selected.config.max_label ?? '')} placeholder="非常符合" onChange={(event) => patchSelectedConfig('max_label', event.target.value)} /></label>
                  </div>
                  <div className="showitem-binding-preview" aria-label="量表预览">
                    <TemplateRenderer
                      schema={singleComponentPreviewSchema(selected)}
                      content={selectedDatasetPreviewContent}
                      answers={{}}
                      readonly
                    />
                  </div>
                </div>
              )}
              {['FileUpload', 'ImageUpload', 'AudioUpload', 'VideoUpload'].includes(selected.type) && (
                <div className="validation-grid" aria-label="上传配置">
                  <label>接受类型<Input value={String(selected.config.accept ?? uploadAcceptByType(selected.type))} onChange={(event) => patchSelectedConfig('accept', event.target.value)} /></label>
                  <label>最大数量<InputNumber min={1} value={typeof selected.config.max_count === 'number' ? selected.config.max_count : null} onChange={(value) => patchSelectedConfig('max_count', value ?? '')} /></label>
                  <label className="form-span">大小限制 MB<InputNumber min={1} value={typeof selected.config.max_size_mb === 'number' ? selected.config.max_size_mb : null} onChange={(value) => patchSelectedConfig('max_size_mb', value ?? '')} /></label>
                </div>
              )}
              {selected.type === 'ImageMaskAnnotation' && (
                <div className="column-binding-panel">
                  <label>图片来源
                    <Select
                      value={bindingToOptionValue((selected.config.source_binding && typeof selected.config.source_binding === 'object' ? selected.config.source_binding as DataBindingPayload : null) ?? bindingFromColumn(String(selected.config.source_field || '') || null)) ?? undefined}
                      placeholder="选择图片列或行级图片媒体"
                      allowClear
                      popupMatchSelectWidth={false}
                      options={imageMaskSourceOptions(selectedDatasetSourceOptions)}
                      getPopupContainer={() => document.body}
                      onChange={(value) => {
                        const binding = value ? decodeDataSourceOption(value) : null;
                        patchSelected({
                          config: {
                            ...selected.config,
                            source_field: bindingToColumnName(binding) || '',
                            source_binding: binding || undefined,
                          },
                        });
                      }}
                    />
                  </label>
                  <div className="validation-grid" aria-label="图片 Mask 标注配置">
                    <label>默认模式
                      <Select
                        value={String(selected.config.mode ?? 'rect')}
                        options={[
                          { value: 'rect', label: '勾画矩形' },
                          { value: 'brush', label: '涂抹 Mask' },
                        ]}
                        onChange={(value) => patchSelectedConfig('mode', value)}
                      />
                    </label>
                    <label>画笔大小<InputNumber min={4} max={80} value={typeof selected.config.brush_size === 'number' ? selected.config.brush_size : 18} onChange={(value) => patchSelectedConfig('brush_size', value ?? 18)} /></label>
                    <label>标注颜色<Input value={String(selected.config.stroke_color ?? '#1677ff')} onChange={(event) => patchSelectedConfig('stroke_color', event.target.value)} /></label>
                    <label>遮罩透明度<InputNumber min={0.1} max={0.9} step={0.05} value={typeof selected.config.mask_opacity === 'number' ? selected.config.mask_opacity : 0.36} onChange={(value) => patchSelectedConfig('mask_opacity', value ?? 0.36)} /></label>
                  </div>
                  <span className="inline-message">保存归一化坐标，支持审核回放。</span>
                </div>
              )}
              {selected.type === 'JsonEditor' && (
                <label>JSON 示例
                  <Input.TextArea
                    aria-label="JSON 示例"
                    autoSize={{ minRows: 4, maxRows: 8 }}
                    value={String(selected.config.example ?? '')}
                    onChange={(event) => patchSelectedConfig('example', event.target.value)}
                    placeholder={'{\n  "label": "示例"\n}'}
                  />
                </label>
              )}
              {selected.type === 'LLMComponent' && (
                <div className="column-binding-panel">
                  <span className="inline-message">该组件用于在标注员作答页启用 AI 辅助入口，不进入提交答案字段。发布后会读取当前题目 content、ShowItem 和答案字段配置作为上下文。</span>
                  <label>AI Provider
                    <Select
                      className="llm-provider-select"
                      loading={templateAiProvidersLoading}
                      value={String(selected.config.provider_id || '') || undefined}
                      placeholder="请选择该 LLM 组件使用的 Provider"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      popupMatchSelectWidth={false}
                      getPopupContainer={workspacePopupContainer}
                      options={enabledTextTemplateAiProviders
                        .map((provider) => ({
                          value: provider.provider_id,
                          label: llmProviderSelectLabel(provider),
                          title: llmProviderFullLabel(provider),
                        }))}
                      onChange={(value) => patchSelectedConfig('provider_id', value || '')}
                    />
                  </label>
                  {selected.config.provider_id ? (
                    <LlmProviderSummary provider={templateAiProviders.find((provider) => provider.provider_id === selected.config.provider_id) ?? null} />
                  ) : null}
                  {!selected.config.provider_id ? (
                    <Alert type="warning" showIcon title="请先为该 LLM 组件选择 Provider，否则预览页和正式标注页都不会发起 AI 调用。" />
                  ) : enabledTextTemplateAiProviders.length && !enabledTextTemplateAiProviders.some((provider) => provider.provider_id === selected.config.provider_id) ? (
                    <Alert type="error" showIcon title="当前保存的 Provider 不存在或未启用，请重新选择。" />
                  ) : null}
                  <label>按钮文案<Input value={String(selected.config.button_text ?? '使用 AI 辅助')} onChange={(event) => patchSelectedConfig('button_text', event.target.value)} /></label>
                  <label>上下文提示
                    <Input.TextArea
                      aria-label="LLM 上下文提示"
                      autoSize={{ minRows: 3, maxRows: 6 }}
                      value={String(selected.config.prompt_hint ?? '')}
                      onChange={(event) => patchSelectedConfig('prompt_hint', event.target.value)}
                      placeholder="例如：结合原文、图片和已填写答案，给出标注建议和理由。"
                    />
                  </label>
                </div>
              )}
              {selected.type === 'GroupContainer' && (
                <div className="column-binding-panel">
                  <label>容器说明
                    <Input.TextArea
                      aria-label="容器说明"
                      autoSize={{ minRows: 3, maxRows: 6 }}
                      value={String(selected.config.description ?? '')}
                      onChange={(event) => patchSelectedConfig('description', event.target.value)}
                      placeholder="例如：请先阅读原始数据，再完成下面的分类与理由字段。"
                    />
                  </label>
                  <label>展示样式
                    <Select
                      value={String(selected.config.style ?? 'section')}
                      options={[
                        { value: 'section', label: '分区标题' },
                        { value: 'notice', label: '提示说明' },
                        { value: 'compact', label: '紧凑分隔' },
                      ]}
                      onChange={(value) => patchSelectedConfig('style', value)}
                    />
                  </label>
                </div>
              )}
              </section>
              {!nonAnswerComponentTypes.has(selected.type) && (
                <section className="property-section-card" aria-label="运行时校验配置">
                  <div className="property-section-title">
                    <strong>校验</strong>
                    <span>提交规则</span>
                  </div>
                  <RuntimeValidationRuleEditor
                    component={selected}
                    rules={selectedValidationRules}
                    onPatch={patchSelectedValidationRule}
                    onRemove={removeSelectedValidationRule}
                  />
                </section>
              )}
              <div className="column-binding-panel" aria-label="联动规则配置">
                <div className="property-section-title">
                  <strong>联动</strong>
                  <span>条件显示</span>
                </div>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    aria-label="启用当前组件联动"
                    checked={Boolean(selectedLinkageRule)}
                    onChange={(event) => {
                      if (event.target.checked) patchSelectedLinkageRule({});
                      else removeSelectedLinkageRule();
                    }}
                  />
                  启用条件显示
                </label>
                {selectedLinkageRule && (
                  <div className="validation-grid">
                    <label>触发字段
                      <select
                        aria-label="联动触发字段"
                        value={selectedLinkageSourceComponent?.field ?? selectedLinkageSourceKey}
                        onChange={(event) => patchSelectedLinkageSource(event.target.value)}
                      >
                        {linkageSourceComponents.map((component) => (
                          <option key={component.id} value={component.field}>{component.label} / {component.field}</option>
                        ))}
                      </select>
                    </label>
                    <label>条件
                      <select
                        aria-label="联动条件"
                        value={selectedLinkageOperator}
                        onChange={(event) => patchSelectedLinkageOperator(event.target.value)}
                      >
                        <option value="equals">等于</option>
                        <option value="not_equals">不等于</option>
                        <option value="contains">包含</option>
                        <option value="not_contains">不包含</option>
                        <option value="not_empty">非空</option>
                        <option value="empty">为空</option>
                      </select>
                    </label>
                    <label>匹配值
                      {selectedLinkageValueOptions.length && !selectedLinkageValueDisabled ? (
                        <select
                          aria-label="联动匹配值"
                          value={selectedLinkageMatchedOption ? String(selectedLinkageValue) : ''}
                          onChange={(event) => patchSelectedLinkageRule({ value: event.target.value })}
                        >
                          <option value="" disabled>请选择选项值</option>
                          {selectedLinkageValueOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label} / {option.value}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          aria-label="联动匹配值"
                          value={String(selectedLinkageRule.value ?? '')}
                          disabled={selectedLinkageValueDisabled}
                          onChange={(event) => patchSelectedLinkageRule({ value: event.target.value })}
                          placeholder={selectedLinkageSourceComponent?.type === 'Scale' ? '例如 3' : '例如 yes'}
                        />
                      )}
                    </label>
                    <label>动作
                      <select
                        aria-label="联动动作"
                        value={String(selectedLinkageRule.action ?? 'show')}
                        onChange={(event) => patchSelectedLinkageRule({ action: event.target.value })}
                      >
                        <option value="show">满足条件时显示</option>
                        <option value="hide">满足条件时隐藏</option>
                      </select>
                    </label>
                  </div>
                )}
                {allTemplateComponents.filter((component) => component.id !== selected.id && !nonAnswerComponentTypes.has(component.type)).length === 0 && (
                  <span className="inline-message">需要另一个答案字段。</span>
                )}
              </div>
            </div>
          ) : <p className="inline-message">选择组件后配置属性。</p>}
          <details className="schema-export">
            <summary>Schema JSON</summary>
            <pre>{JSON.stringify(schema, null, 2)}</pre>
          </details>
        </aside>
      </section>
      {team && (
        <TemplateAiAssistant
          team={team}
          templateId={mode.templateId}
          templateName={form.name}
          templateDescription={form.description}
          schema={schema}
          previewContent={selectedDatasetPreviewContent}
          referenceDatasetContext={selectedReferenceDatasetContext}
          providers={templateAiProviders}
          loadingProviders={templateAiProvidersLoading}
          onApplySchema={applyTemplateAiSchema}
          uploadAttachment={async (file) => {
            const uploaded = await uploadFile(team.team_id, file, 'document');
            return {
              id: uploaded.file_id,
              name: uploaded.filename,
              url: uploaded.url,
              type: uploaded.content_type,
            };
          }}
        />
      )}
    </main>
  );
}

export function TaskManagementPage({
  onBreadcrumbTailChange,
}: {
  onBreadcrumbTailChange?: (tail: AppShellBreadcrumbItem | null) => void;
} = {}) {
  const showToast = useWorkspaceToast('task');
  const { modal } = App.useApp();
  const { team, loading, error } = useOwnerTeam();
  const [tasks, setTasks] = useState<TaskPayload[]>([]);
  const [taskDatasets, setTaskDatasets] = useState<DatasetPayload[]>([]);
  const [taskTemplates, setTaskTemplates] = useState<TemplatePayload[]>([]);
  const [taskLabelerMembers, setTaskLabelerMembers] = useState<TeamMember[]>([]);
  const [taskLabelerMembersLoaded, setTaskLabelerMembersLoaded] = useState(false);
  const [taskOwnerCandidates, setTaskOwnerCandidates] = useState<TeamMember[]>([]);
  const [taskOwnerCandidatesLoading, setTaskOwnerCandidatesLoading] = useState(false);
  const [mode, setMode] = useState<TaskManagementMode>({ type: 'list' });
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [difficultyFilter, setDifficultyFilter] = useState('all');
  const [taskViewMode, setTaskViewMode] = useState<ProductionViewMode>(() => initialProductionViewMode());
  const [taskCardPage, setTaskCardPage] = useState(1);
  const [taskCardPageSize, setTaskCardPageSize] = useState(9);
  const [selectedTaskRowKeys, setSelectedTaskRowKeys] = useState<React.Key[]>([]);
  const [batchTaskLoading, setBatchTaskLoading] = useState(false);
  const [batchExportModalOpen, setBatchExportModalOpen] = useState(false);
  const [batchExportFormat, setBatchExportFormat] = useState<'json' | 'jsonl' | 'csv' | 'excel'>('jsonl');
  const [batchExportStatusFilter, setBatchExportStatusFilter] = useState('approved');
  const [batchExportDateRange, setBatchExportDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [batchExportIncludeReview, setBatchExportIncludeReview] = useState(true);
  const [batchExportSubmitting, setBatchExportSubmitting] = useState(false);
  const [resultDrawerTask, setResultDrawerTask] = useState<TaskPayload | null>(null);
  const [resultExportJobs, setResultExportJobs] = useState<ExportJobPayload[]>([]);
  const [resultExportsLoading, setResultExportsLoading] = useState(false);
  const [resultExportSubmitting, setResultExportSubmitting] = useState(false);
  const [resultExportFormat, setResultExportFormat] = useState<TaskResultExportFormat>('jsonl');
  const [resultExportStatusFilter, setResultExportStatusFilter] = useState('approved');
  const [resultExportDateRange, setResultExportDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [resultExportIncludeReview, setResultExportIncludeReview] = useState(true);
  const [resultExportFieldKeys, setResultExportFieldKeys] = useState<string[]>(defaultTaskResultExportFieldKeys);
  const [resultExportRenameMap, setResultExportRenameMap] = useState<Record<string, string>>({});
  const [resultExportCustomFields, setResultExportCustomFields] = useState('');
  const [batchTagModalOpen, setBatchTagModalOpen] = useState(false);
  const [batchTagText, setBatchTagText] = useState('');
  const [batchTagSubmitting, setBatchTagSubmitting] = useState(false);
  const [ownerTransferTask, setOwnerTransferTask] = useState<TaskPayload | null>(null);
  const [ownerTransferTargetId, setOwnerTransferTargetId] = useState('');
  const [ownerTransferReason, setOwnerTransferReason] = useState('');
  const [ownerTransferSubmitting, setOwnerTransferSubmitting] = useState(false);
  const [internalLabelerTask, setInternalLabelerTask] = useState<TaskPayload | null>(null);
  const [internalLabelerIds, setInternalLabelerIds] = useState<string[]>([]);
  const [internalLabelerAllocations, setInternalLabelerAllocations] = useState<LabelerAllocationDraft[]>([]);
  const [internalLabelerSubmitting, setInternalLabelerSubmitting] = useState(false);
  const [internalLabelerLoading, setInternalLabelerLoading] = useState(false);
  const [deleteConfirmTask, setDeleteConfirmTask] = useState<TaskPayload | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [deleteConfirmSubmitting, setDeleteConfirmSubmitting] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [questions, setQuestions] = useState<TaskQuestionPayload[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionStatusFilter, setQuestionStatusFilter] = useState('all');
  const [selectedQuestion, setSelectedQuestion] = useState<TaskQuestionPayload | null>(null);
  const [questionDrawerOpen, setQuestionDrawerOpen] = useState(false);
  const [questionEditText, setQuestionEditText] = useState('');
  const [questionBatchModalOpen, setQuestionBatchModalOpen] = useState(false);
  const [questionBatchText, setQuestionBatchText] = useState('[\\n  { "content": { "text": "示例题目" } }\\n]');
  const [questionImportModalOpen, setQuestionImportModalOpen] = useState(false);
  const [questionImportFile, setQuestionImportFile] = useState<File | null>(null);
  const [questionImportReplace, setQuestionImportReplace] = useState(false);
  const [questionImportErrors, setQuestionImportErrors] = useState<Array<{ row?: number | null; error: string }>>([]);
  const [questionSubmitting, setQuestionSubmitting] = useState(false);
  const [selectedQuestionRowKeys, setSelectedQuestionRowKeys] = useState<React.Key[]>([]);
  const [exportJobs, setExportJobs] = useState<ExportJobPayload[]>([]);
  const [exportsLoading, setExportsLoading] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'json' | 'jsonl' | 'csv' | 'excel'>('jsonl');
  const [exportStatusFilter, setExportStatusFilter] = useState('all');
  const [exportDateRange, setExportDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [exportIncludeReview, setExportIncludeReview] = useState(true);
  const [exportSubmitting, setExportSubmitting] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogPayload[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    rich_content: '',
    tags: '',
    deadline: '',
    category: 'multimodal',
    difficulty: 'medium',
    distribution: 'first_come_all' as 'first_come_all' | 'quota_grab',
    share_enabled: false,
    internal_labeler_ids: [] as string[],
    internal_labeler_allocations: [] as LabelerAllocationDraft[],
    reward_mode: 'item' as 'task' | 'item',
    total_points: '0',
    points_per_item: '0',
    expire_hours: '72',
    reviewer_ids: '',
    required_certs: '',
    min_completed_tasks: '0',
    min_accuracy_rate: '0',
    qualification_notes: '',
    ai_enabled: false,
    ai_model: '',
    ai_prompt: '',
    ai_threshold: '80',
  });
  useActionErrorToast(actionError, setActionError, showToast);

  const openTaskModal = useCallback((type: 'confirm' | 'info', config: ModalFuncProps) => {
    const contextModal = modal as Partial<Record<'confirm' | 'info', (props: ModalFuncProps) => unknown>>;
    const method = contextModal[type];
    if (typeof method === 'function') {
      method(config);
      return;
    }
    Modal[type](config);
  }, [modal]);

  const taskLabelerOptions = useMemo(() => buildLabelerOptions(taskLabelerMembers), [taskLabelerMembers]);
  const internalLabelerAllocationTotal = useMemo(() => labelerAllocationTotalPercent(internalLabelerAllocations), [internalLabelerAllocations]);
  const internalLabelerAllocationPreview = useMemo(
    () => calculateLabelerAllocationPreview(internalLabelerIds, internalLabelerAllocations, internalLabelerTask?.stats?.total ?? 0),
    [internalLabelerAllocations, internalLabelerIds, internalLabelerTask?.stats?.total],
  );
  const editTaskTotal = mode.type === 'edit' ? mode.task.stats?.total ?? 0 : 0;
  const editInternalLabelerAllocationTotal = useMemo(
    () => labelerAllocationTotalPercent(editForm.internal_labeler_allocations),
    [editForm.internal_labeler_allocations],
  );
  const editInternalLabelerAllocationPreview = useMemo(
    () => calculateLabelerAllocationPreview(editForm.internal_labeler_ids, editForm.internal_labeler_allocations, editTaskTotal),
    [editForm.internal_labeler_allocations, editForm.internal_labeler_ids, editTaskTotal],
  );
  const ownerTransferOptions = useMemo(
    () => buildTaskOwnerTransferOptions(taskOwnerCandidates, ownerTransferTargetId, ownerTransferTask?.owner_id),
    [ownerTransferTargetId, ownerTransferTask?.owner_id, taskOwnerCandidates],
  );

  const loadTasks = useCallback(async () => {
    if (!team) return;
    setTableLoading(true);
    setActionError(null);
    try {
      const data = await listTasks(team.team_id, {
        status: 'all',
        keyword: query,
        category: categoryFilter,
        difficulty: difficultyFilter,
      });
      setTasks(data.items);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '任务列表加载失败');
    } finally {
      setTableLoading(false);
    }
  }, [categoryFilter, difficultyFilter, query, team]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTasks();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadTasks]);

  useEffect(() => {
    if (!team) return;
    void listDatasets(team.team_id)
      .then((data) => setTaskDatasets(data.items))
      .catch(() => setTaskDatasets([]));
    void listTemplates(team.team_id)
      .then((data) => setTaskTemplates(data.items))
      .catch(() => setTaskTemplates([]));
    setInternalLabelerLoading(true);
    setTaskLabelerMembersLoaded(false);
    void getTeamMembers(team.team_id, { role: 'labeler', status: 'active' })
      .then((data) => {
        const members = filterActiveTeamLabelerMembers(data?.items);
        setTaskLabelerMembers(members);
        setTaskLabelerMembersLoaded(true);
      })
      .catch(() => setTaskLabelerMembers([]))
      .finally(() => {
        setInternalLabelerLoading(false);
      });
    setTaskOwnerCandidatesLoading(true);
    void Promise.all([
      getTeamMembers(team.team_id, { role: 'team_admin', status: 'active' }),
      getTeamMembers(team.team_id, { role: 'owner', status: 'active' }),
    ])
      .then(([admins, owners]) => setTaskOwnerCandidates(mergeTeamMembersById([
        ...(Array.isArray(admins?.items) ? admins.items : []),
        ...(Array.isArray(owners?.items) ? owners.items : []),
      ])))
      .catch(() => setTaskOwnerCandidates([]))
      .finally(() => setTaskOwnerCandidatesLoading(false));
  }, [team]);

  useEffect(() => {
    if (!taskLabelerMembersLoaded || !internalLabelerIds.length) return;
    const activeLabelerIds = new Set(taskLabelerMembers.filter(isActiveTeamLabelerMember).map((member) => member.user_id));
    const nextIds = internalLabelerIds.filter((labelerId) => activeLabelerIds.has(labelerId));
    if (stringArraysEqual(nextIds, internalLabelerIds)) return;
    setInternalLabelerIds(nextIds);
    setInternalLabelerAllocations((current) => normalizeLabelerAllocations(nextIds, current));
  }, [internalLabelerIds, taskLabelerMembers, taskLabelerMembersLoaded]);

  const loadQuestions = useCallback(async (task: TaskPayload) => {
    if (!team) return;
    setQuestionsLoading(true);
    try {
      const data = await listTaskQuestions(team.team_id, task.task_id, { status: questionStatusFilter, page_size: 50 });
      setQuestions(data.items);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '题目列表加载失败');
    } finally {
      setQuestionsLoading(false);
    }
  }, [questionStatusFilter, team]);

  const loadTaskAuditLogs = useCallback(async (task: TaskPayload) => {
    if (!team) return;
    setAuditLoading(true);
    try {
      const data = await listAuditLogs(team.team_id, { entity_type: 'task', entity_id: task.task_id, page_size: 20 });
      setAuditLogs(data.items);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '操作日志加载失败');
    } finally {
      setAuditLoading(false);
    }
  }, [team]);

  const loadExportJobs = useCallback(async (task: TaskPayload) => {
    if (!team) return;
    setExportsLoading(true);
    try {
      const data = await listExportJobs(team.team_id, { task_id: task.task_id, page_size: 20 });
      setExportJobs(data.items);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '导出历史加载失败');
    } finally {
      setExportsLoading(false);
    }
  }, [team]);

  const loadResultExportJobs = useCallback(async (task: TaskPayload) => {
    if (!team) return;
    setResultExportsLoading(true);
    try {
      const data = await listExportJobs(team.team_id, { task_id: task.task_id, page_size: 20 });
      setResultExportJobs(data.items);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '结果导出历史加载失败');
    } finally {
      setResultExportsLoading(false);
    }
  }, [team]);

  useEffect(() => {
    if (mode.type === 'list') {
      onBreadcrumbTailChange?.(null);
      return;
    }
    const label = mode.type === 'new' ? '新建任务' : mode.task.title || '任务详情';
    onBreadcrumbTailChange?.({
      key: mode.type === 'new' ? 'new-task' : mode.task.task_id,
      parentKey: 'task-management',
      parentLabel: '任务管理',
      parentOnClick: () => setMode({ type: 'list' }),
      label,
      loading: mode.type === 'edit' && !mode.task.title,
    });
  }, [mode, onBreadcrumbTailChange]);

  useEffect(() => {
    if (!onBreadcrumbTailChange || mode.type === 'list') return;
    const label = mode.type === 'new' ? '新建任务' : mode.task.title || '任务详情';
    onBreadcrumbTailChange({
      key: mode.type === 'new' ? 'new-task' : mode.task.task_id,
      parentKey: 'task-management',
      parentOnClick: () => setMode({ type: 'list' }),
      label,
      loading: mode.type === 'edit' && !mode.task.title,
    });
  }, [mode, onBreadcrumbTailChange]);

  const openEdit = (task: TaskPayload) => {
    setMode({ type: 'edit', task });
    setQuestions([]);
    setSelectedQuestionRowKeys([]);
    setAuditLogs([]);
    setExportJobs([]);
    void loadQuestions(task);
    void loadTaskAuditLogs(task);
    void loadExportJobs(task);
    const taskInternalLabelerIds = stringArrayFromUnknown(task.assignment?.target_labeler_ids);
    setEditForm({
      title: task.title,
      description: task.description,
      rich_content: task.rich_content ?? '',
      tags: task.tags.join(', '),
      deadline: task.deadline ?? '',
      category: task.category || 'multimodal',
      difficulty: task.difficulty || 'medium',
      distribution: task.distribution === 'quota_grab' ? 'quota_grab' : 'first_come_all',
      share_enabled: Boolean(task.assignment?.enabled && task.distribution !== 'quota_grab'),
      internal_labeler_ids: taskInternalLabelerIds,
      internal_labeler_allocations: normalizeLabelerAllocations(taskInternalLabelerIds, task.assignment?.target_labeler_allocations),
      reward_mode: task.reward_rule?.mode === 'task' ? 'task' : 'item',
      total_points: String(task.reward_rule?.total_points ?? 0),
      points_per_item: String(task.reward_rule?.points_per_item ?? 0),
      expire_hours: String(task.assignment?.expire_hours ?? 72),
      reviewer_ids: task.reviewer_ids.join(', '),
      required_certs: task.required_certs.join(', '),
      min_completed_tasks: String(task.qualification_rules?.min_completed_tasks ?? 0),
      min_accuracy_rate: String(task.qualification_rules?.min_accuracy_rate ?? 0),
      qualification_notes: String(task.qualification_rules?.notes ?? ''),
      ai_enabled: Boolean(task.ai_config?.enabled),
      ai_model: String(task.ai_config?.model ?? ''),
      ai_prompt: String(task.ai_config?.prompt ?? ''),
      ai_threshold: String(task.ai_config?.review_threshold ?? 80),
    });
  };

  const openTaskResults = (task: TaskPayload) => {
    setResultDrawerTask(task);
    setResultExportJobs([]);
    setResultExportStatusFilter('approved');
    setResultExportDateRange(null);
    setResultExportIncludeReview(true);
    setResultExportFieldKeys(defaultTaskResultExportFieldKeys);
    setResultExportRenameMap({});
    setResultExportCustomFields('');
    void loadResultExportJobs(task);
  };

  useEffect(() => {
    if (mode.type !== 'edit') return;
    const timer = window.setTimeout(() => {
    void loadQuestions(mode.task);
    void loadTaskAuditLogs(mode.task);
    void loadExportJobs(mode.task);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadExportJobs, loadQuestions, loadTaskAuditLogs, mode]);

  useEffect(() => {
    if (!resultDrawerTask) return;
    if (!resultExportJobs.some((job) => job.status === 'pending' || job.status === 'processing')) return;
    const timer = window.setInterval(() => {
      void loadResultExportJobs(resultDrawerTask);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [loadResultExportJobs, resultDrawerTask, resultExportJobs]);

  const statusCounts = useMemo(() => {
    const base = { all: tasks.length, draft: 0, pending_review: 0, published: 0, paused: 0, finished: 0 };
    for (const task of tasks) {
      if (task.status in base) base[task.status as keyof typeof base] += 1;
    }
    return base;
  }, [tasks]);
  const visibleTasks = useMemo(
    () => tasks
      .filter((task) => statusFilter === 'all' || task.status === statusFilter)
      .sort((left, right) => Number(Boolean(right.auto_saved)) - Number(Boolean(left.auto_saved))),
    [statusFilter, tasks],
  );

  const selectedTasks = useMemo(
    () => tasks.filter((task) => selectedTaskRowKeys.includes(task.task_id)),
    [selectedTaskRowKeys, tasks],
  );
  const safeTaskCardPage = safeCardPage(visibleTasks.length, taskCardPage, taskCardPageSize);
  const visibleTaskCards = paginateCards(visibleTasks, taskCardPage, taskCardPageSize);
  const batchFinishableTasks = useMemo(
    () => selectedTasks.filter((task) => ['published', 'paused'].includes(task.status)),
    [selectedTasks],
  );
  const batchExportableTasks = useMemo(
    () => selectedTasks.filter((task) => ['published', 'paused', 'finished'].includes(task.status)),
    [selectedTasks],
  );
  const safeTaskTemplates = Array.isArray(taskTemplates) ? taskTemplates : [];
  const safeTaskDatasets = Array.isArray(taskDatasets) ? taskDatasets : [];
  const taskTemplateNameMap = useMemo(
    () => new Map(safeTaskTemplates.map((template) => [template.template_id, template.name])),
    [safeTaskTemplates],
  );
  const taskDatasetNameMap = useMemo(
    () => new Map(safeTaskDatasets.map((dataset) => [dataset.dataset_id, dataset.name])),
    [safeTaskDatasets],
  );
  const batchSkippedTasks = selectedTasks.length - batchFinishableTasks.length;
  const batchExportSkippedTasks = selectedTasks.length - batchExportableTasks.length;

  const openDeleteTaskConfirm = (task: TaskPayload) => {
    const eligibility = task.delete_eligibility;
    if (!eligibility?.deletable) {
      setActionError(taskDeleteDisabledReason(task));
      return;
    }
    setDeleteConfirmTask(task);
    setDeleteConfirmInput('');
  };

  const submitDeleteTask = async () => {
    if (!team || !deleteConfirmTask) return;
    setDeleteConfirmSubmitting(true);
    setActionError(null);
    try {
      await deleteTask(team.team_id, deleteConfirmTask.task_id);
      showToast('success', deleteConfirmTask.status === 'draft' ? '任务草稿已删除' : '任务及相关生产数据已删除');
      setDeleteConfirmTask(null);
      setDeleteConfirmInput('');
      setSelectedTaskRowKeys((current) => current.filter((key) => key !== deleteConfirmTask.task_id));
      if (resultDrawerTask?.task_id === deleteConfirmTask.task_id) setResultDrawerTask(null);
      if (mode.type === 'edit' && mode.task.task_id === deleteConfirmTask.task_id) setMode({ type: 'list' });
      await loadTasks();
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '任务删除失败');
    } finally {
      setDeleteConfirmSubmitting(false);
    }
  };

  const runTaskAction = async (task: TaskPayload, action: 'publish' | 'approve' | 'pause' | 'resume' | 'finish' | 'delete' | 'copy') => {
    if (!team) return;
    setActionError(null);
    try {
      if (action === 'publish') await publishTask(team.team_id, task.task_id);
      else if (action === 'delete') await deleteTask(team.team_id, task.task_id);
      else if (action === 'copy') {
        const copied = await copyTask(team.team_id, task.task_id);
        showToast('success', '任务副本已创建，可继续修改后发布。');
        await loadTasks();
        openEdit(copied);
        return;
      } else await changeTaskStatus(team.team_id, task.task_id, action);
      showToast('success', action === 'delete' ? '任务草稿已删除' : action === 'publish' ? '任务已提交发布流程' : action === 'pause' ? '任务已暂停发放' : '任务状态已更新');
      await loadTasks();
      if (mode.type === 'edit' && mode.task.task_id === task.task_id) setMode({ type: 'list' });
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '任务操作失败');
    }
  };

  const confirmTaskStatusAction = async (task: TaskPayload, action: 'pause' | 'finish') => {
    if (!team) return;
    setActionError(null);
    try {
      const statsPayload = await getTaskStats(team.team_id, task.task_id);
      const counts = normalizedTaskStatusCounts(statsPayload);
      if (action === 'pause') {
        openTaskModal('confirm', {
          title: '暂停发放？',
          centered: true,
          okText: '确认暂停发放',
          cancelText: '取消',
          content: (
            <div className="task-status-action-confirm">
              <p>暂停发放只会停止未领取数据继续被领取；已领取或打回待修改的数据不会被回收，已完成并审核通过的数据仍按原奖励结算。</p>
              <ul>
                <li>未领取待发放：{counts.pending} 条</li>
                <li>已领取未完成：{counts.claimed} 条</li>
                <li>打回待修改：{counts.rejected} 条</li>
                <li>待审核：{counts.submitted} 条</li>
                <li>已入库：{counts.approved} 条</li>
              </ul>
            </div>
          ),
          onOk: () => runTaskAction(task, 'pause'),
        });
        return;
      }
      const activeOrReviewing = counts.claimed + counts.submitted + counts.rejected;
      openTaskModal('confirm', {
        title: '结束任务？',
        centered: true,
        okText: '确认结束',
        cancelText: '取消',
        content: (
          <div className="task-status-action-confirm">
            <p>结束后任务不能恢复为发布中，也不会再向标注员发放未领取数据；已入库数据和已产生的奖励记录会保留。</p>
            <ul>
              <li>未领取待发放：{counts.pending} 条</li>
              <li>已领取未完成：{counts.claimed} 条</li>
              <li>待审核：{counts.submitted} 条</li>
              <li>打回待修改：{counts.rejected} 条</li>
              <li>已入库：{counts.approved} 条</li>
            </ul>
            {activeOrReviewing > 0 && <Alert type="warning" showIcon title="任务会立即停止发放" description="已领取的数据仍可继续完成；结束后放弃或终审不通过的数据不会再回到任务广场。" />}
          </div>
        ),
        okButtonProps: { danger: true },
        onOk: () => runTaskAction(task, 'finish'),
      });
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '任务状态检查失败');
    }
  };

  const batchFinishTasks = async () => {
    if (!team || batchFinishableTasks.length === 0) return;
    setBatchTaskLoading(true);
    setActionError(null);
    try {
      const results = await Promise.allSettled(batchFinishableTasks.map((task) => changeTaskStatus(team.team_id, task.task_id, 'finish')));
      const successCount = results.filter((result) => result.status === 'fulfilled').length;
      const failedCount = results.length - successCount;
      showToast('success', `已批量结束 ${successCount} 个任务${batchSkippedTasks ? `，跳过 ${batchSkippedTasks} 个不可结束任务` : ''}${failedCount ? `，失败 ${failedCount} 个` : ''}`);
      setSelectedTaskRowKeys([]);
      await loadTasks();
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '批量结束任务失败');
    } finally {
      setBatchTaskLoading(false);
    }
  };

  const batchCreateExports = async () => {
    if (!team || batchExportableTasks.length === 0) return;
    setBatchExportSubmitting(true);
    setActionError(null);
    try {
      const results = await Promise.allSettled(batchExportableTasks.map((task) => createExportJob(team.team_id, {
        task_id: task.task_id,
        format: batchExportFormat,
        filters: buildExportFilters(batchExportStatusFilter, batchExportDateRange),
        include_review_records: batchExportIncludeReview,
      })));
      const successCount = results.filter((result) => result.status === 'fulfilled').length;
      const failedCount = results.length - successCount;
      showToast('success', `已创建 ${successCount} 个导出任务${batchExportSkippedTasks ? `，跳过 ${batchExportSkippedTasks} 个不可导出任务` : ''}${failedCount ? `，失败 ${failedCount} 个` : ''}`);
      setBatchExportModalOpen(false);
      setSelectedTaskRowKeys([]);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '批量导出任务创建失败');
    } finally {
      setBatchExportSubmitting(false);
    }
  };

  const buildResultExportFieldsConfig = () => {
    const customFields = resultExportCustomFields
      .split(/\r?\n|,/)
      .map((field) => field.trim())
      .filter(Boolean);
    const include = Array.from(new Set([...resultExportFieldKeys, ...customFields]));
    const rename = Object.fromEntries(
      Object.entries(resultExportRenameMap)
        .map(([key, value]) => [key, value.trim()])
        .filter(([, value]) => Boolean(value)),
    );
    return { include, rename };
  };

  const createResultExport = async () => {
    if (!team || !resultDrawerTask) return;
    if (resultDrawerTask.status === 'draft') {
      setActionError('草稿任务暂无正式标注结果，请发布后再创建结果导出。');
      return;
    }
    setResultExportSubmitting(true);
    setActionError(null);
    try {
      const includeReviewRecords = resultExportIncludeReview;
      const selectedFields = includeReviewRecords && !resultExportFieldKeys.includes('review_records')
        ? [...resultExportFieldKeys, 'review_records']
        : resultExportFieldKeys;
      const customFields = resultExportCustomFields
        .split(/\r?\n|,/)
        .map((field) => field.trim())
        .filter(Boolean);
      const job = await createExportJob(team.team_id, {
        task_id: resultDrawerTask.task_id,
        format: resultExportFormat,
        filters: buildExportFilters(resultExportStatusFilter, resultExportDateRange),
        fields_config: {
          ...buildResultExportFieldsConfig(),
          include: Array.from(new Set([...selectedFields, ...customFields])),
        },
        include_review_records: includeReviewRecords,
      });
      showToast('success', `结果导出任务已创建：${job.filename}`);
      await loadResultExportJobs(resultDrawerTask);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '结果导出任务创建失败');
    } finally {
      setResultExportSubmitting(false);
    }
  };

  const batchAppendTags = async () => {
    if (!team || selectedTasks.length === 0) return;
    const nextTags = parseList(batchTagText);
    if (nextTags.length === 0) {
      setActionError('请至少输入一个标签');
      return;
    }
    setBatchTagSubmitting(true);
    setActionError(null);
    try {
      const results = await Promise.allSettled(selectedTasks.map((task) => updateTask(team.team_id, task.task_id, {
        tags: Array.from(new Set([...(task.tags || []), ...nextTags])),
      })));
      const successCount = results.filter((result) => result.status === 'fulfilled').length;
      const failedCount = results.length - successCount;
      showToast('success', `已为 ${successCount} 个任务追加标签${failedCount ? `，失败 ${failedCount} 个` : ''}`);
      setBatchTagModalOpen(false);
      setBatchTagText('');
      setSelectedTaskRowKeys([]);
      await loadTasks();
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '批量打标签失败');
    } finally {
      setBatchTagSubmitting(false);
    }
  };

  const downloadTaskList = async (format: 'csv' | 'json') => {
    if (!team) return;
    setActionError(null);
    try {
      const blob = await exportTaskList(team.team_id, {
        status: statusFilter,
        keyword: query,
        category: categoryFilter,
        difficulty: difficultyFilter,
        format,
      });
      const suffix = format === 'csv' ? 'csv' : 'json';
      const filename = `任务清单.${suffix}`;
      downloadBlob(blob, filename);
      showToast('success', `任务清单已准备下载：${filename}`);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '任务清单导出失败');
    }
  };

  const submitOwnerTransfer = async () => {
    if (!team || !ownerTransferTask) return;
    const targetOwnerId = ownerTransferTargetId.trim();
    if (!targetOwnerId) {
      setActionError('请选择目标负责人账号');
      return;
    }
    setOwnerTransferSubmitting(true);
    setActionError(null);
    try {
      const updated = await transferTaskOwner(team.team_id, ownerTransferTask.task_id, {
        target_owner_id: targetOwnerId,
        reason: ownerTransferReason.trim() || undefined,
      });
      showToast('success', `任务负责人已转交给 ${targetOwnerId}`);
      setOwnerTransferTask(null);
      setOwnerTransferTargetId('');
      setOwnerTransferReason('');
      setTasks((current) => current.map((task) => task.task_id === updated.task_id ? updated : task));
      if (mode.type === 'edit' && mode.task.task_id === updated.task_id) {
        setMode({ type: 'edit', task: updated });
      }
      await loadTasks();
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '任务负责人转交失败');
    } finally {
      setOwnerTransferSubmitting(false);
    }
  };

  const openInternalLabelerModal = (task: TaskPayload) => {
    const labelerIds = stringArrayFromUnknown(task.assignment?.target_labeler_ids);
    setInternalLabelerTask(task);
    setInternalLabelerIds(labelerIds);
    setInternalLabelerAllocations(normalizeLabelerAllocations(labelerIds, task.assignment?.target_labeler_allocations));
  };

  const submitInternalLabelers = async () => {
    if (!team || !internalLabelerTask) return;
    if (internalLabelerIds.length > 1 && internalLabelerAllocationTotal !== 100) {
      setActionError('多位 Labeler 的任务分配比例必须合计 100%');
      return;
    }
    setInternalLabelerSubmitting(true);
    setActionError(null);
    try {
      const updated = await updateTaskInternalLabelers(team.team_id, internalLabelerTask.task_id, {
        target_labeler_ids: internalLabelerIds,
        target_labeler_allocations: buildLabelerAllocationPayload(internalLabelerIds, internalLabelerAllocations),
      });
      showToast('success', '企业内 Labeler 分配已更新');
      setInternalLabelerTask(null);
      setInternalLabelerIds([]);
      setInternalLabelerAllocations([]);
      setTasks((current) => current.map((task) => task.task_id === updated.task_id ? updated : task));
      if (mode.type === 'edit' && mode.task.task_id === updated.task_id) {
        setMode({ type: 'edit', task: updated });
        const nextLabelerIds = stringArrayFromUnknown(updated.assignment?.target_labeler_ids);
        setEditForm((current) => ({
          ...current,
          internal_labeler_ids: nextLabelerIds,
          internal_labeler_allocations: normalizeLabelerAllocations(nextLabelerIds, updated.assignment?.target_labeler_allocations),
        }));
      }
      await loadTasks();
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '企业内 Labeler 分配更新失败');
    } finally {
      setInternalLabelerSubmitting(false);
    }
  };

  const saveTaskSummary = async () => {
    if (!team || mode.type !== 'edit') return;
    setActionError(null);
    if (mode.task.status === 'draft' && editForm.distribution === 'quota_grab' && editForm.internal_labeler_ids.length > 1 && editInternalLabelerAllocationTotal !== 100) {
      setActionError('多位 Labeler 的任务分配比例必须合计 100%');
      return;
    }
    try {
      const task = mode.task;
      const payload = task.status === 'draft'
        ? {
            title: editForm.title,
            description: editForm.description,
            rich_content: editForm.rich_content || null,
            tags: parseList(editForm.tags),
            deadline: editForm.deadline || null,
            category: editForm.category,
            difficulty: task.difficulty || editForm.difficulty,
            distribution: editForm.distribution,
            reward_rule: editForm.distribution === 'quota_grab'
              ? { mode: 'item' as const, points_per_item: 0 }
              : {
                  mode: editForm.reward_mode,
                  total_points: editForm.reward_mode === 'task' ? Number(editForm.total_points || 0) : undefined,
                  points_per_item: editForm.reward_mode === 'item' ? Number(editForm.points_per_item || 0) : undefined,
                },
            reviewer_ids: parseList(editForm.reviewer_ids),
            ai_config: {
              enabled: editForm.ai_enabled,
              model: editForm.ai_model || null,
              prompt: editForm.ai_prompt || null,
              review_threshold: Number(editForm.ai_threshold || 0),
            },
            qualification_rules: {
              min_completed_tasks: editForm.distribution === 'quota_grab' ? 0 : Number(editForm.min_completed_tasks || 0),
              min_accuracy_rate: editForm.distribution === 'quota_grab' ? 0 : Number(editForm.min_accuracy_rate || 0),
              notes: editForm.distribution === 'quota_grab' ? null : editForm.qualification_notes || null,
            },
            required_certs: editForm.distribution === 'quota_grab' ? [] : parseList(editForm.required_certs),
            assignment: editForm.distribution === 'quota_grab'
              ? {
                  enabled: false,
                  expire_hours: Number(editForm.expire_hours || 72),
                  target_labeler_ids: editForm.internal_labeler_ids,
                  target_labeler_allocations: buildLabelerAllocationPayload(editForm.internal_labeler_ids, editForm.internal_labeler_allocations),
                }
              : {
                  enabled: editForm.share_enabled,
                  expire_hours: Number(editForm.expire_hours || 72),
                  target_labeler_ids: [],
                  target_labeler_allocations: [],
                },
          }
        : {
            description: editForm.description,
            rich_content: editForm.rich_content || null,
            tags: parseList(editForm.tags),
          };
      const updated = await updateTask(team.team_id, task.task_id, payload);
      setMode({ type: 'edit', task: updated });
      setTasks((current) => current.map((item) => item.task_id === updated.task_id ? updated : item));
      showToast('success', '任务已保存');
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '任务保存失败');
    }
  };

  const openQuestionDetail = async (question: TaskQuestionPayload) => {
    if (!team || mode.type !== 'edit') return;
    setQuestionDrawerOpen(true);
    setSelectedQuestion(question);
    setQuestionEditText(JSON.stringify(question.content, null, 2));
    try {
      const detail = await getTaskQuestion(team.team_id, mode.task.task_id, question.question_id);
      setSelectedQuestion(detail);
      setQuestionEditText(JSON.stringify(detail.content, null, 2));
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '题目详情加载失败');
    }
  };

  const createQuestionsFromJson = async () => {
    if (!team || mode.type !== 'edit') return;
    setQuestionSubmitting(true);
    setActionError(null);
    try {
      const parsed = JSON.parse(questionBatchText) as unknown;
      const items = Array.isArray(parsed) ? parsed as Array<Record<string, unknown>> : [parsed as Record<string, unknown>];
      const result = await batchCreateTaskQuestions(team.team_id, mode.task.task_id, items);
      showToast('success', `已创建 ${result.created_count} 道题目`);
      setQuestionBatchModalOpen(false);
      await loadQuestions(mode.task);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : err instanceof Error ? err.message : '题目创建失败');
    } finally {
      setQuestionSubmitting(false);
    }
  };

  const importQuestionsFromFile = async () => {
    if (!team || mode.type !== 'edit' || !questionImportFile) return;
    setQuestionSubmitting(true);
    setActionError(null);
    setQuestionImportErrors([]);
    try {
      const result = await importTaskQuestions(team.team_id, mode.task.task_id, questionImportFile, { replace_existing: questionImportReplace });
      showToast('success', `已导入 ${result.created_count} 道题目`);
      setQuestionImportModalOpen(false);
      setQuestionImportFile(null);
      setQuestionImportReplace(false);
      setSelectedQuestionRowKeys([]);
      await loadQuestions(mode.task);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setActionError(err.message);
        setQuestionImportErrors(questionImportRowErrors(err.detail));
      } else {
        setActionError('题目导入失败');
      }
    } finally {
      setQuestionSubmitting(false);
    }
  };

  const saveSelectedQuestion = async () => {
    if (!team || mode.type !== 'edit' || !selectedQuestion) return;
    setQuestionSubmitting(true);
    setActionError(null);
    try {
      const content = JSON.parse(questionEditText) as Record<string, unknown>;
      const updated = await updateTaskQuestion(team.team_id, mode.task.task_id, selectedQuestion.question_id, { content });
      setSelectedQuestion(updated);
      setQuestionEditText(JSON.stringify(updated.content, null, 2));
      showToast('success', '题目已更新');
      await loadQuestions(mode.task);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : err instanceof Error ? err.message : '题目保存失败');
    } finally {
      setQuestionSubmitting(false);
    }
  };

  const removeQuestion = async (question: TaskQuestionPayload) => {
    if (!team || mode.type !== 'edit') return;
    setQuestionSubmitting(true);
    setActionError(null);
    try {
      await deleteTaskQuestion(team.team_id, mode.task.task_id, question.question_id);
      showToast('success', '题目已删除');
      setSelectedQuestionRowKeys((keys) => keys.filter((key) => key !== question.question_id));
      await loadQuestions(mode.task);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '题目删除失败');
    } finally {
      setQuestionSubmitting(false);
    }
  };

  const removeSelectedQuestions = async () => {
    if (!team || mode.type !== 'edit' || selectedQuestionRowKeys.length === 0) return;
    setQuestionSubmitting(true);
    setActionError(null);
    try {
      const result = await batchDeleteTaskQuestions(team.team_id, mode.task.task_id, selectedQuestionRowKeys.map(String));
      showToast('success', `已删除 ${result.deleted_count} 道题目`);
      setSelectedQuestionRowKeys([]);
      await loadQuestions(mode.task);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '批量删除失败');
    } finally {
      setQuestionSubmitting(false);
    }
  };

  const exportQuestions = async (format: 'json' | 'jsonl' | 'csv' | 'excel') => {
    if (!team || mode.type !== 'edit') return;
    setActionError(null);
    try {
      const blob = await exportTaskQuestions(team.team_id, mode.task.task_id, format);
      downloadBlob(blob, `${mode.task.title}-questions.${format === 'excel' ? 'xlsx' : format}`);
      showToast('success', `题目已准备下载：${format}`);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '题目导出失败');
    }
  };

  const createTaskExport = async () => {
    if (!team || mode.type !== 'edit') return;
    setExportSubmitting(true);
    setActionError(null);
    try {
      const job = await createExportJob(team.team_id, {
        task_id: mode.task.task_id,
        format: exportFormat,
        filters: buildExportFilters(exportStatusFilter, exportDateRange),
        include_review_records: exportIncludeReview,
      });
      showToast('success', `导出任务已创建：${job.filename}`);
      setExportModalOpen(false);
      await loadExportJobs(mode.task);
      await loadTaskAuditLogs(mode.task);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '导出任务创建失败');
    } finally {
      setExportSubmitting(false);
    }
  };

  const downloadTaskExport = async (job: ExportJobPayload, ownerTask?: TaskPayload | null) => {
    if (!team) return;
    setActionError(null);
    try {
      const blob = await downloadExportJob(team.team_id, job.export_id);
      downloadBlob(blob, job.filename || `export.${job.format === 'excel' ? 'xlsx' : job.format}`);
      showToast('success', `导出文件已准备下载：${job.filename}`);
      if (ownerTask) {
        await loadResultExportJobs(ownerTask);
      } else if (mode.type === 'edit') {
        await loadExportJobs(mode.task);
        await loadTaskAuditLogs(mode.task);
      }
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '导出下载失败');
    }
  };

  const cancelTaskExport = async (job: ExportJobPayload, ownerTask?: TaskPayload | null) => {
    if (!team) return;
    setActionError(null);
    try {
      await cancelExportJob(team.team_id, job.export_id);
      showToast('success', '导出任务已取消');
      if (ownerTask) {
        await loadResultExportJobs(ownerTask);
      } else if (mode.type === 'edit') {
        await loadExportJobs(mode.task);
      }
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '导出取消失败');
    }
  };
  const returnToTaskList = useCallback(() => {
    setMode({ type: 'list' });
    void loadTasks();
  }, [loadTasks]);

  if (loading) return <main className="workspace-content workspace-loading-page"><WorkspaceLoading tip="正在加载企业信息" /></main>;
  if (error || !team) return <main className="workspace-content workspace-status-page"><Alert className="workspace-page-alert" type="warning" showIcon title={error || '请先完成企业企业配置。'} /></main>;
  if (mode.type === 'new') {
    return (
      <TaskPublishWorkspacePage
        headingTitle="新建任务"
        headingKicker="Task Setup"
        headingDescription="创建任务草稿并完成模板、数据、分发资质、积分奖励、AI 预审和人工复审配置。"
        onBack={returnToTaskList}
      />
    );
  }
  if (mode.type === 'edit') {
    const task = mode.task;
    if (task.status === 'draft') {
      return (
        <TaskPublishWorkspacePage
          headingTitle={taskDisplayTitle(task)}
          headingKicker={task.auto_saved ? 'Auto Saved Draft' : 'Draft Task'}
          headingDescription="继续修改草稿任务的基础信息、模板数据、分发资质、积分奖励、AI 预审、人工复审和用户协议配置。"
          initialTask={task}
          onBack={returnToTaskList}
        />
      );
    }
    const canEditPausedSummary = task.status === 'paused';
    const readonlyCore = task.status !== 'draft';
    const summaryEditable = task.status === 'draft' || task.status === 'paused';
    const readonlyDetail = !summaryEditable;
    const taskTemplate = taskTemplates.find((template) => template.template_id === task.template_id) ?? null;
    const taskDataset = taskDatasets.find((dataset) => dataset.dataset_id === task.dataset_id) ?? null;
    return (
      <main className="workspace-content production-page task-management-page task-detail-page">
        <section className="page-heading task-subpage-heading">
          <div>
            <p className="section-kicker">Task Detail</p>
            <h1>{task.title}</h1>
            <p>查看任务配置、状态、发布限制、统计摘要和操作入口。</p>
          </div>
          <div className="page-heading-actions">
            {readonlyDetail && <Tag icon={<EyeOutlined />} color="default">只读查看</Tag>}
            <AntButton icon={<ArrowLeftOutlined />} onClick={() => setMode({ type: 'list' })}>返回任务管理</AntButton>
            {summaryEditable && <AntButton icon={<SaveOutlined />} type="primary" onClick={saveTaskSummary}>保存修改</AntButton>}
          </div>
        </section>
        <section className="task-readiness-strip">
          <span className={task.title ? 'pass' : 'block'}>基础信息 <strong>{task.title ? '通过' : '待补'}</strong></span>
          <span className={task.template_id ? 'pass' : 'block'}>模板 <strong>{task.template_id ? '已选' : '缺失'}</strong></span>
          <span className={task.dataset_id ? 'pass' : 'block'}>数据集 <strong>{task.dataset_id ? '已选' : '缺失'}</strong></span>
          <span className="pass">题目 <strong>{task.stats?.total ?? task.quota}</strong></span>
          <span className={task.ai_config?.enabled ? 'pass' : 'muted'}>AI <strong>{task.ai_config?.enabled ? '已配置' : '未开启'}</strong></span>
        </section>
        <Tabs
          className="task-detail-tabs"
          items={[
            {
              key: 'basic',
              label: '基础信息',
              children: (
                <section className="settings-section task-detail-section">
                  <div className="form-grid publish-extra-grid">
                    <label><span className="required-label-text">任务标题</span><input disabled={readonlyCore} value={editForm.title} onChange={(event) => setEditForm({ ...editForm, title: event.target.value })} /></label>
                    <label><span className="required-label-text">截止日期</span><input disabled={readonlyCore} type="date" value={editForm.deadline} onChange={(event) => setEditForm({ ...editForm, deadline: event.target.value })} /></label>
                    <label><span className="required-label-text">任务分类</span><select disabled={readonlyCore} value={editForm.category} onChange={(event) => setEditForm({ ...editForm, category: event.target.value })}>{taskCategoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                    <label><span>AI 评估难度</span><input disabled value={difficultyLabel(editForm.difficulty)} /></label>
                    <label className="form-span"><span className="required-label-text">标签</span><input disabled={!summaryEditable} value={editForm.tags} onChange={(event) => setEditForm({ ...editForm, tags: event.target.value })} /></label>
                    <label className="form-span"><span className="required-label-text">任务描述</span><textarea disabled={!summaryEditable} value={editForm.description} onChange={(event) => setEditForm({ ...editForm, description: event.target.value })} /></label>
                    <label className="form-span">富文本说明<textarea disabled={!summaryEditable} value={editForm.rich_content} onChange={(event) => setEditForm({ ...editForm, rich_content: event.target.value })} /></label>
                  </div>
                  {canEditPausedSummary && <p className="inline-message">已暂停任务只允许修改描述、富文本说明和标签；收集中任务需要先暂停发放后才能修改。</p>}
                  {!summaryEditable && <p className="inline-message">当前状态不可修改。只有草稿和已暂停任务可以修改。</p>}
                </section>
              ),
            },
            {
              key: 'config',
              label: '模板与数据',
              children: (
                <section className="task-config-summary">
                  <dl>
                    <div><dt>模板</dt><dd>{taskTemplate?.name || '当前模板'}<br /><WorkspaceSecondaryCode label="模板编号" value={task.template_id} /></dd></div>
                    <div><dt>模板版本</dt><dd>{task.template_version_id ? <WorkspaceSecondaryCode label="版本编号" value={task.template_version_id} /> : '-'}</dd></div>
                    <div><dt>数据集</dt><dd>{taskDataset ? `${taskDataset.name} / ${taskDataset.row_count} 行` : '当前数据集'}<br /><WorkspaceSecondaryCode label="数据集编号" value={task.dataset_id} /></dd></div>
                    <div><dt>列映射</dt><dd>{Object.keys(task.column_mapping || {}).length} 项</dd></div>
                    <div><dt>分发策略</dt><dd>{distributionLabel(task.distribution)}</dd></div>
                    <div><dt>奖励规则</dt><dd>{taskRewardDisplayLabel(task)}</dd></div>
                  </dl>
                </section>
              ),
            },
            {
              key: 'publish',
              label: '发布配置',
              children: (
                <section className="settings-section task-detail-section">
                  <div className="form-grid publish-extra-grid">
                    <label>分发策略<select disabled={readonlyCore} value={editForm.distribution} onChange={(event) => {
	                      const nextDistribution = event.target.value as 'first_come_all' | 'quota_grab';
	                      setEditForm((current) => ({
	                        ...current,
	                        distribution: nextDistribution,
	                        share_enabled: nextDistribution === 'first_come_all' ? current.share_enabled : false,
	                        internal_labeler_allocations: nextDistribution === 'quota_grab'
	                          ? normalizeLabelerAllocations(current.internal_labeler_ids, current.internal_labeler_allocations)
	                          : current.internal_labeler_allocations,
	                      }));
	                    }}><option value="first_come_all">包大小分配</option><option value="quota_grab">企业内流转</option></select></label>
                    {editForm.distribution === 'first_come_all' && (
                      <>
                        <label className="checkbox-field"><input type="checkbox" disabled={readonlyCore} checked={editForm.share_enabled} onChange={(event) => setEditForm({ ...editForm, share_enabled: event.target.checked })} /> 生成分享链接</label>
                        <label>分享有效期（小时）<input disabled={readonlyCore || !editForm.share_enabled} inputMode="numeric" value={editForm.expire_hours} onChange={(event) => setEditForm({ ...editForm, expire_hours: event.target.value })} /></label>
                      </>
                    )}
                    {editForm.distribution === 'quota_grab' && (
                      <label className="form-span">指定企业 Labeler
                        <Select
                          mode="multiple"
                          allowClear
                          showSearch
                          disabled={readonlyCore}
                          loading={internalLabelerLoading}
                          value={editForm.internal_labeler_ids}
                          options={buildLabelerOptions(taskLabelerMembers)}
                          optionFilterProp="label"
                          placeholder="不选择表示所有企业 Labeler"
	                          onChange={(values) => setEditForm((current) => ({
	                            ...current,
	                            internal_labeler_ids: values,
	                            internal_labeler_allocations: normalizeLabelerAllocations(values, current.internal_labeler_allocations),
	                          }))}
	                          getPopupContainer={workspacePopupContainer}
	                        />
	                      </label>
	                    )}
	                    {editForm.distribution === 'quota_grab' && editForm.internal_labeler_ids.length > 1 && (
	                      <div className="form-span task-modal-allocation-panel">
	                        <span className="task-modal-allocation-title">Labeler 任务分配比例</span>
	                        <div className="reviewer-allocation-list">
	                          {editInternalLabelerAllocationPreview.map((allocation) => (
	                            <div className="reviewer-allocation-row" key={allocation.labeler_id}>
	                              <span>
	                                <strong>{reviewerDisplayLabel(allocation.labeler_id, taskLabelerMembers)}</strong>
	                                <small>{allocation.quota || 0}% · 约 {allocation.item_count ?? 0} 条</small>
	                              </span>
	                              <div className="reviewer-allocation-control">
	                                <Space.Compact>
	                                  <InputNumber
	                                    min={0}
	                                    max={100}
	                                    precision={0}
	                                    step={1}
	                                    value={allocation.quota === '' ? null : Number(allocation.quota)}
	                                    placeholder="百分比"
	                                    disabled={readonlyCore}
	                                    onChange={(value) => setEditForm((current) => ({
	                                      ...current,
	                                      internal_labeler_allocations: current.internal_labeler_allocations.map((item) => (
	                                        item.labeler_id === allocation.labeler_id ? { ...item, quota: value === null ? '' : String(value) } : item
	                                      )),
	                                    }))}
	                                  />
	                                  <span className="task-input-unit-addon">%</span>
	                                </Space.Compact>
	                                <small className="reviewer-allocation-count">
	                                  {allocation.item_count === undefined ? (editTaskTotal > 0 ? '待合计 100%' : '暂无题量预览') : `约 ${allocation.item_count} 条`}
	                                </small>
	                              </div>
	                            </div>
	                          ))}
	                        </div>
	                        <div className={`reviewer-allocation-total ${editInternalLabelerAllocationTotal === 100 ? 'is-valid' : 'is-invalid'}`}>
	                          <span>合计 {editInternalLabelerAllocationTotal}%</span>
	                          <span>{editTaskTotal > 0 ? `共 ${editTaskTotal} 条，预览合计 ${editInternalLabelerAllocationPreview.reduce((sum, item) => sum + (item.item_count ?? 0), 0)} 条` : '暂无题量时仅保存比例'}</span>
	                        </div>
	                        {editInternalLabelerAllocationTotal !== 100 ? (
	                          <Alert type="warning" showIcon title="多位 Labeler 的任务分配比例必须合计 100%。" />
	                        ) : null}
	                      </div>
	                    )}
	                    {editForm.distribution === 'quota_grab' ? (
	                      <Alert className="form-span" showIcon type="info" title="企业内流转不分配积分" />
                    ) : (
                      <>
                        <label>奖励模式<select disabled={readonlyCore} value={editForm.reward_mode} onChange={(event) => setEditForm({ ...editForm, reward_mode: event.target.value as 'task' | 'item' })}><option value="item">按条奖励</option><option value="task">按任务奖励</option></select></label>
                        {editForm.reward_mode === 'item'
                          ? <label>每条积分<input disabled={readonlyCore} inputMode="numeric" value={editForm.points_per_item} onChange={(event) => setEditForm({ ...editForm, points_per_item: event.target.value })} /></label>
                          : <label>任务总积分<input disabled={readonlyCore} inputMode="numeric" value={editForm.total_points} onChange={(event) => setEditForm({ ...editForm, total_points: event.target.value })} /></label>}
                      </>
                    )}
                  </div>
                  {readonlyCore && <p className="inline-message">发布配置影响领取和历史解释，发布后只读。</p>}
                </section>
              ),
            },
            {
              key: 'review-ai',
              label: '审核与 AI',
              children: (
                <section className="settings-section task-detail-section">
                  <div className="form-grid publish-extra-grid">
                    <label className="form-span">审核员<textarea disabled={readonlyCore} value={editForm.reviewer_ids} onChange={(event) => setEditForm({ ...editForm, reviewer_ids: event.target.value })} placeholder="输入审核员邮箱或从发布页选择企业 Reviewer" /></label>
                    <label className="checkbox-field form-span"><input type="checkbox" disabled={readonlyCore} checked={editForm.ai_enabled} onChange={(event) => setEditForm({ ...editForm, ai_enabled: event.target.checked })} /> 开启 AI 预审</label>
                    <label>AI 模型<input disabled={readonlyCore || !editForm.ai_enabled} value={editForm.ai_model} onChange={(event) => setEditForm({ ...editForm, ai_model: event.target.value })} /></label>
                    <label>通过阈值<input disabled={readonlyCore || !editForm.ai_enabled} inputMode="numeric" value={editForm.ai_threshold} onChange={(event) => setEditForm({ ...editForm, ai_threshold: event.target.value })} /></label>
                    <label className="form-span">AI 预审提示词<textarea disabled={readonlyCore || !editForm.ai_enabled} value={editForm.ai_prompt} onChange={(event) => setEditForm({ ...editForm, ai_prompt: event.target.value })} /></label>
                  </div>
                </section>
              ),
            },
            {
              key: 'qualification',
	              label: '资质与分发',
	              children: (
	                <section className="settings-section task-detail-section">
	                  {editForm.distribution === 'quota_grab' ? (
	                    <Alert
	                      showIcon
	                      type="info"
	                      title="企业内流转不使用公开任务资质门槛"
	                      description="企业内 Labeler 候选范围和任务分配比例在发布配置中维护，保存时会清空所需资质、最低完成任务数、最低准确率和资质说明。"
	                    />
	                  ) : (
	                    <div className="form-grid publish-extra-grid">
	                      <label className="form-span">所需资质<textarea disabled={readonlyCore} value={editForm.required_certs} onChange={(event) => setEditForm({ ...editForm, required_certs: event.target.value })} /></label>
	                      <label>最低完成任务数<input disabled={readonlyCore} inputMode="numeric" value={editForm.min_completed_tasks} onChange={(event) => setEditForm({ ...editForm, min_completed_tasks: event.target.value })} /></label>
	                      <label>最低准确率（%）<input disabled={readonlyCore} inputMode="numeric" value={editForm.min_accuracy_rate} onChange={(event) => setEditForm({ ...editForm, min_accuracy_rate: event.target.value })} /></label>
	                      <label className="form-span">资质说明<input disabled={readonlyCore} value={editForm.qualification_notes} onChange={(event) => setEditForm({ ...editForm, qualification_notes: event.target.value })} /></label>
	                    </div>
	                  )}
	                </section>
	              ),
            },
            {
              key: 'questions',
              label: '题目管理',
              children: (
                <section className="task-question-panel">
                  <div className="task-question-toolbar">
                    <Select
                      value={questionStatusFilter}
                      onChange={setQuestionStatusFilter}
                      options={[
                        { value: 'all', label: '全部状态' },
                        { value: 'pending', label: '待领取' },
                        { value: 'claimed', label: '已领取' },
                        { value: 'submitted', label: '已提交' },
                        { value: 'approved', label: '已通过' },
                        { value: 'rejected', label: '已打回' },
                      ]}
                    />
                    <AntButton icon={<ReloadOutlined />} onClick={() => void loadQuestions(task)}>刷新题目</AntButton>
                    <AntButton icon={<PlusOutlined />} disabled={task.status !== 'draft'} onClick={() => setQuestionBatchModalOpen(true)}>JSON 新增</AntButton>
                    <AntButton icon={<UploadOutlined />} disabled={task.status !== 'draft'} onClick={() => setQuestionImportModalOpen(true)}>导入题目</AntButton>
                    <Popconfirm
                      title="确认删除选中题目？"
                      description="删除后会重新整理题目序号，仅草稿任务可操作。"
                      disabled={task.status !== 'draft' || selectedQuestionRowKeys.length === 0}
                      onConfirm={() => void removeSelectedQuestions()}
                    >
                      <AntButton icon={<DeleteOutlined />} danger disabled={task.status !== 'draft' || selectedQuestionRowKeys.length === 0}>批量删除</AntButton>
                    </Popconfirm>
                    <Dropdown
                      getPopupContainer={workspacePopupContainer}
                      menu={{
                        items: [
                          { key: 'jsonl', label: '导出 JSONL' },
                          { key: 'json', label: '导出 JSON' },
                          { key: 'csv', label: '导出 CSV' },
                          { key: 'excel', label: '导出 Excel' },
                        ],
                        onClick: ({ key }) => void exportQuestions(key as 'json' | 'jsonl' | 'csv' | 'excel'),
                      }}
                    >
                      <AntButton icon={<DownloadOutlined />}>导出题目</AntButton>
                    </Dropdown>
                  </div>
                  <EnhancedTable<TaskQuestionPayload>
                    rowKey="question_id"
                    loading={questionsLoading}
                    dataSource={questions}
                    rowSelection={task.status === 'draft' ? { selectedRowKeys: selectedQuestionRowKeys, onChange: setSelectedQuestionRowKeys } : undefined}
                    pagination={{ pageSize: 8 }}
                    locale={{ emptyText: '暂无题目。草稿任务会根据数据集行自动生成题目。' }}
                    columns={[
                      { title: '序号', dataIndex: 'row_index', width: 80, render: (value: number) => value + 1 },
                      {
                        title: '题目',
                        dataIndex: 'question_id',
                        width: 150,
                        render: (value: string, question) => (
                          <span className="task-meta-stack">
                            <small>题目 #{question.row_index + 1}</small>
                            <WorkspaceSecondaryCode label="编号" value={value} />
                          </span>
                        ),
                      },
                      { title: '状态', dataIndex: 'status', width: 110, render: (status: string) => <Tag color={questionStatusColor(status)}>{questionStatusLabel(status)}</Tag> },
                      { title: '领取人', dataIndex: 'assigned_to', width: 140, render: (_value: string | null | undefined, question) => questionAssigneeDisplayName(question) },
                      { title: '内容摘要', render: (_, question) => questionContentSummary(question.content) },
                      { title: '更新时间', width: 150, render: (_, question) => formatDateTime(question.updated_at || question.created_at) },
                      {
                        title: '操作',
                        key: 'actions',
                        width: 138,
                        fixed: 'right',
                        className: 'workspace-table-action-cell',
                        render: (_, question) => (
                          <WorkspaceTableActions
                            visible={[{
                              key: 'detail',
                              label: task.status === 'draft' ? '编辑' : '预览',
                              icon: task.status === 'draft' ? <EditOutlined /> : <EyeOutlined />,
                              onClick: () => void openQuestionDetail(question),
                            }]}
                            menu={task.status === 'draft'
                              ? [{
                                key: 'delete',
                                label: '删除题目',
                                icon: <DeleteOutlined />,
                                danger: true,
                                onClick: () => void removeQuestion(question),
                                confirm: { title: '确认删除该题目？', okText: '删除' },
                              }]
                              : []}
                          />
                        ),
                      },
                    ]}
                  />
                </section>
              ),
            },
            {
              key: 'stats',
              label: '统计与导出',
              children: (
                <section className="task-export-panel">
                  <div className="task-config-summary">
                    <dl>
                      <div><dt>总题量</dt><dd>{task.stats?.total ?? task.quota}</dd></div>
                      <div><dt>已领取</dt><dd>{task.stats?.claimed ?? 0}</dd></div>
                      <div><dt>已提交</dt><dd>{task.stats?.submitted ?? 0}</dd></div>
                      <div><dt>通过</dt><dd>{task.stats?.approved ?? 0}</dd></div>
                      <div><dt>打回</dt><dd>{task.stats?.rejected ?? 0}</dd></div>
                      <div><dt>导出任务</dt><dd>{exportJobs.length}</dd></div>
                    </dl>
                  </div>
                  <div className="task-question-toolbar">
                    <AntButton icon={<DownloadOutlined />} type="primary" disabled={task.status === 'draft'} onClick={() => setExportModalOpen(true)}>创建导出任务</AntButton>
                    <AntButton icon={<ReloadOutlined />} onClick={() => void loadExportJobs(task)}>刷新导出历史</AntButton>
                  </div>
                  {task.status === 'draft' && <Alert showIcon title="草稿任务仅支持题目源数据导出；正式结果导出需要任务发布后通过导出中心创建。" />}
                  <EnhancedTable<ExportJobPayload>
                    rowKey="export_id"
                    loading={exportsLoading}
                    dataSource={exportJobs}
                    pagination={{ pageSize: 6 }}
                    locale={{ emptyText: '暂无导出任务。' }}
                    columns={[
                      { title: '文件', dataIndex: 'filename', render: (value: string) => value || '-' },
                      { title: '格式', dataIndex: 'format', width: 90, render: (value: string) => <Tag>{value.toUpperCase()}</Tag> },
                      { title: '状态', dataIndex: 'status', width: 120, render: (value: string, job) => <Tag color={exportStatusColor(value)}>{exportStatusLabel(value)} {job.progress}%</Tag> },
                      { title: '大小', dataIndex: 'file_size', width: 110, render: (value: number) => formatFileSize(value) },
                      { title: '下载', dataIndex: 'download_count', width: 90 },
                      { title: '创建时间', dataIndex: 'created_at', width: 150, render: (value?: string | null) => formatDateTime(value) },
                      {
                        title: '操作',
                        key: 'actions',
                        width: 138,
                        fixed: 'right',
                        className: 'workspace-table-action-cell',
                        render: (_, job) => (
                          <WorkspaceTableActions
                            visible={[{ key: 'download', label: '下载', icon: <DownloadOutlined />, disabled: job.status !== 'completed', onClick: () => void downloadTaskExport(job) }]}
                            menu={job.status === 'pending' || job.status === 'processing'
                              ? [{
                                key: 'cancel',
                                label: '取消导出',
                                icon: <DeleteOutlined />,
                                danger: true,
                                onClick: () => void cancelTaskExport(job),
                                confirm: { title: '确认取消该导出任务？', okText: '取消导出' },
                              }]
                              : []}
                          />
                        ),
                      },
                    ]}
                  />
                </section>
              ),
            },
            {
              key: 'logs',
              label: '操作日志',
              children: (
                <section className="task-audit-panel">
                  <div className="task-question-toolbar">
                    <AntButton icon={<ReloadOutlined />} onClick={() => void loadTaskAuditLogs(task)}>刷新日志</AntButton>
                  </div>
                  <EnhancedTable<AuditLogPayload>
                    rowKey="log_id"
                    loading={auditLoading}
                    dataSource={auditLogs}
                    pagination={{ pageSize: 8 }}
                    locale={{ emptyText: '暂无操作日志。' }}
                    columns={[
                      { title: '时间', dataIndex: 'created_at', width: 150, render: (value?: string | null) => formatDateTime(value) },
                      { title: '动作', dataIndex: 'action', width: 160, render: (value: string) => <Tag>{auditActionLabel(value)}</Tag> },
                      { title: '操作人', dataIndex: 'operator_id', width: 150, render: (_value: string | null | undefined, log) => auditOperatorDisplayName(log) },
                      { title: '变更摘要', render: (_, log) => auditChangeSummary(log.changes) },
                      { title: '来源', width: 180, render: (_, log) => <span className="task-meta-stack"><small>{log.ip_address || '-'}</small><small>{shorten(log.user_agent || '', 42) || '-'}</small></span> },
                    ]}
                  />
                </section>
              ),
            },
          ]}
        />
        <Modal
          title={task.status === 'draft' ? '题目编辑' : '题目预览'}
          open={questionDrawerOpen}
          width={760}
          footer={task.status === 'draft' ? [
            <AntButton key="cancel" icon={<ArrowLeftOutlined />} onClick={() => setQuestionDrawerOpen(false)}>关闭</AntButton>,
            <AntButton key="save" icon={<SaveOutlined />} type="primary" loading={questionSubmitting} onClick={() => void saveSelectedQuestion()}>保存题目</AntButton>,
          ] : null}
          onCancel={() => setQuestionDrawerOpen(false)}
        >
          {selectedQuestion ? (
            <div className="task-question-preview">
              <dl>
                <div><dt>序号</dt><dd>{selectedQuestion.row_index + 1}</dd></div>
                <div><dt>状态</dt><dd>{questionStatusLabel(selectedQuestion.status)}</dd></div>
                <div><dt>领取人</dt><dd>{questionAssigneeDisplayName(selectedQuestion)}</dd></div>
              </dl>
              <div className="task-question-technical-row">
                <WorkspaceSecondaryCode label="题目 ID" value={selectedQuestion.question_id} />
              </div>
              {task.status === 'draft'
                ? <Input.TextArea rows={12} value={questionEditText} onChange={(event) => setQuestionEditText(event.target.value)} />
                : <pre>{JSON.stringify(selectedQuestion.content, null, 2)}</pre>}
            </div>
          ) : <Spin description="正在加载题目" />}
        </Modal>
        <Modal
          title="JSON 新增题目"
          open={questionBatchModalOpen}
          width={720}
          confirmLoading={questionSubmitting}
          onOk={() => void createQuestionsFromJson()}
          onCancel={() => setQuestionBatchModalOpen(false)}
          okText="创建题目"
        >
          <Alert className="dataset-modal-alert" type="info" showIcon title="支持一个对象或对象数组；对象可直接作为 content，也可使用 { content: {...} } 结构。" />
          <Input.TextArea rows={12} value={questionBatchText} onChange={(event) => setQuestionBatchText(event.target.value)} />
        </Modal>
        <Modal
          title="导入题目"
          open={questionImportModalOpen}
          confirmLoading={questionSubmitting}
          onOk={() => void importQuestionsFromFile()}
          onCancel={() => {
            setQuestionImportModalOpen(false);
            setQuestionImportErrors([]);
          }}
          okButtonProps={{ disabled: !questionImportFile }}
          okText="开始导入"
        >
          <div className="question-import-form">
            <input
              type="file"
              accept=".json,.jsonl,.csv,.xlsx"
              onChange={(event) => setQuestionImportFile(event.target.files?.[0] ?? null)}
            />
            <label className="checkbox-row">
              <input type="checkbox" checked={questionImportReplace} onChange={(event) => setQuestionImportReplace(event.target.checked)} />
              替换当前草稿题目
            </label>
            <Alert showIcon title="支持 JSON、JSONL、CSV、Excel。导入失败会返回具体错误原因；已发布任务不允许导入或替换题目。" />
            {questionImportErrors.length > 0 ? (
              <Alert
                type="error"
                showIcon
                title="导入失败行"
                description={(
                  <ul className="question-import-errors">
                    {questionImportErrors.map((item, index) => (
                      <li key={`${item.row ?? 'file'}-${index}`}>
                        {item.row ? `第 ${item.row} 行：` : '文件级错误：'}{item.error}
                      </li>
                    ))}
                  </ul>
                )}
              />
            ) : null}
          </div>
        </Modal>
        <Modal
          title="创建导出任务"
          open={exportModalOpen}
          confirmLoading={exportSubmitting}
          okText="创建导出"
          onOk={() => void createTaskExport()}
          onCancel={() => setExportModalOpen(false)}
        >
          <div className="question-import-form task-export-modal-form">
            <label>导出格式
              <Select
                value={exportFormat}
                onChange={setExportFormat}
                options={[
                  { value: 'jsonl', label: 'JSONL' },
                  { value: 'json', label: 'JSON' },
                  { value: 'csv', label: 'CSV' },
                  { value: 'excel', label: 'Excel' },
                ]}
              />
            </label>
            <label>题目状态
              <Select
                value={exportStatusFilter}
                onChange={setExportStatusFilter}
                options={[
                  { value: 'all', label: '全部状态' },
                  { value: 'approved', label: '已通过' },
                  { value: 'submitted', label: '已提交' },
                  { value: 'rejected', label: '已打回' },
                  { value: 'pending', label: '待领取' },
                ]}
              />
            </label>
            <label>日期范围
              <RangePicker
                value={exportDateRange}
                onChange={(dates) => setExportDateRange(dates)}
                presets={[
                  { label: '最近 7 天', value: [dayjs().subtract(6, 'day'), dayjs()] },
                  { label: '最近 30 天', value: [dayjs().subtract(29, 'day'), dayjs()] },
                  { label: '最近 90 天', value: [dayjs().subtract(89, 'day'), dayjs()] },
                ]}
              />
            </label>
            <div className="task-export-modal-checkbox-row">
              <span>包含审核记录字段</span>
              <Checkbox checked={exportIncludeReview} onChange={(event) => setExportIncludeReview(event.target.checked)} />
            </div>
          </div>
        </Modal>
      </main>
    );
  }

  return (
    <main className={['workspace-content production-page production-list-page task-management-page workspace-fixed-page', selectedTasks.length > 0 ? 'task-management-page--batch' : ''].filter(Boolean).join(' ')}>
      <section className="page-heading">
        <div>
          <p className="section-kicker">Tasks</p>
          <h1>任务管理</h1>
        </div>
        <div className="page-heading-actions">
          <AntButton icon={<ReloadOutlined />} onClick={() => void loadTasks()}>刷新</AntButton>
          <Dropdown
            getPopupContainer={workspacePopupContainer}
            menu={{
              items: [
                { key: 'csv', label: '导出 CSV 清单' },
                { key: 'json', label: '导出 JSON 清单' },
              ],
              onClick: ({ key }) => void downloadTaskList(key as 'csv' | 'json'),
            }}
          >
            <AntButton icon={<DownloadOutlined />}>导出任务清单</AntButton>
          </Dropdown>
          <AntButton icon={<PlusOutlined />} type="primary" onClick={() => setMode({ type: 'new' })}>新建任务</AntButton>
        </div>
      </section>
      <WorkspaceSummaryStrip
        ariaLabel="任务状态概览"
        items={[
          { key: 'all', label: '全部任务', value: statusCounts.all, active: statusFilter === 'all', onClick: () => { setStatusFilter('all'); setTaskCardPage(1); } },
          { key: 'draft', label: '草稿', value: statusCounts.draft, active: statusFilter === 'draft', onClick: () => { setStatusFilter('draft'); setTaskCardPage(1); } },
          { key: 'pending_review', label: '待审核', value: statusCounts.pending_review, active: statusFilter === 'pending_review', onClick: () => { setStatusFilter('pending_review'); setTaskCardPage(1); } },
          { key: 'published', label: '收集中', value: statusCounts.published, active: statusFilter === 'published', onClick: () => { setStatusFilter('published'); setTaskCardPage(1); } },
          { key: 'paused', label: '已暂停', value: statusCounts.paused, active: statusFilter === 'paused', onClick: () => { setStatusFilter('paused'); setTaskCardPage(1); } },
          { key: 'finished', label: '已结束', value: statusCounts.finished, active: statusFilter === 'finished', onClick: () => { setStatusFilter('finished'); setTaskCardPage(1); } },
        ]}
      />
      <section className="production-filter-bar workspace-fixed-toolbar">
        <Input.Search className="production-filter-search" placeholder="搜索任务标题、描述或标签" allowClear value={query} onChange={(event) => { setQuery(event.target.value); setTaskCardPage(1); }} onSearch={() => void loadTasks()} />
        <Select className="production-filter-select" value={categoryFilter} onChange={(value) => { setCategoryFilter(value); setTaskCardPage(1); }} getPopupContainer={workspacePopupContainer} options={[{ value: 'all', label: '全部分类' }, ...taskCategoryOptions]} />
        <Select className="production-filter-select" value={difficultyFilter} onChange={(value) => { setDifficultyFilter(value); setTaskCardPage(1); }} getPopupContainer={workspacePopupContainer} options={[{ value: 'all', label: '全部难度' }, { value: 'easy', label: '简单' }, { value: 'medium', label: '中等' }, { value: 'hard', label: '困难' }]} />
        <Segmented<ProductionViewMode>
          className="production-view-switch"
          aria-label="任务展示方式"
          value={taskViewMode}
          onChange={setTaskViewMode}
          options={productionViewOptions}
        />
      </section>
      {selectedTasks.length > 0 && (
        <section className="task-batch-bar" aria-label="任务批量操作">
          <span>已选择 <strong>{selectedTasks.length}</strong> 个任务，可结束 <strong>{batchFinishableTasks.length}</strong> 个{batchSkippedTasks ? `，将跳过 ${batchSkippedTasks} 个` : ''}</span>
          <div>
            <AntButton icon={<DeleteOutlined />} size="small" onClick={() => setSelectedTaskRowKeys([])}>清空选择</AntButton>
            <AntButton
              icon={<DownloadOutlined />}
              size="small"
              disabled={batchExportableTasks.length === 0}
              onClick={() => setBatchExportModalOpen(true)}
            >
              批量导出
            </AntButton>
            <AntButton icon={<TagsOutlined />} size="small" onClick={() => setBatchTagModalOpen(true)}>批量打标签</AntButton>
            <AntButton
              icon={<DeleteOutlined />}
              size="small"
              danger
              loading={batchTaskLoading}
              disabled={batchFinishableTasks.length === 0}
              onClick={() => {
                  openTaskModal('confirm', {
                    title: '批量结束任务？',
                    content: `将结束 ${batchFinishableTasks.length} 个发布中或已暂停任务${batchSkippedTasks ? `，并跳过 ${batchSkippedTasks} 个不可结束任务` : ''}。结束后不能恢复为发布中。`,
                    okText: '批量结束',
                    centered: true,
                    okButtonProps: { danger: true },
                    onOk: batchFinishTasks,
                  });
              }}
            >
              批量结束
            </AntButton>
          </div>
        </section>
      )}
      {taskViewMode === 'table' ? (
        <section className="production-table-shell workspace-fixed-table-panel">
          <EnhancedTable<TaskPayload>
            className="task-management-table workspace-fixed-table"
            rowKey="task_id"
            loading={tableLoading}
            dataSource={visibleTasks}
            rowSelection={{ selectedRowKeys: selectedTaskRowKeys, onChange: setSelectedTaskRowKeys, fixed: true, columnWidth: 48 }}
            pagination={fixedTablePagination(visibleTasks.length)}
            scroll={{ x: taskManagementTableScrollX, y: 'calc(var(--workspace-table-body-height) - var(--task-batch-bar-height) - 84px)' }}
            tableLayout="fixed"
            locale={{ emptyText: '暂无任务，先新建一个任务草稿。' }}
            columns={[
              Table.SELECTION_COLUMN as ColumnsType<TaskPayload>[number],
              ...decorateTaskTableColumns([
                {
                  title: '任务名称',
                  dataIndex: 'title',
                  width: 320,
                  fixed: 'left',
                  render: (_, task) => (
                    <button type="button" className="task-title-button" onClick={() => openEdit(task)}>
                      <FileTextOutlined aria-hidden="true" />
                      <strong>{taskDisplayTitle(task)}</strong>
                      <span>{task.description || '暂未填写任务描述'}</span>
                      <em>{task.tags.slice(0, 3).join(' / ') || '暂无标签'}</em>
                    </button>
                  ),
                },
                { title: '状态', dataIndex: 'status', width: 110, render: (_, task) => <Tag className={`task-status-tag ${taskStatusClass(task.status, task.auto_saved)}`}>{taskStatusLabel(task.status, task.auto_saved)}</Tag> },
                { title: '负责人', key: 'owner', width: 138, render: (_, task) => <OwnerTag label="发布人" name={taskOwnerDisplayName(task)} /> },
                { title: '数据与模板', width: 180, render: (_, task) => <span className="task-meta-stack"><small>模板 {taskTemplateNameMap.get(task.template_id) || '当前模板'}</small><small>数据集 {taskDatasetNameMap.get(task.dataset_id) || '当前数据集'}</small><WorkspaceSecondaryCode label="任务编号" value={task.task_id} /><small>{Object.keys(task.column_mapping || {}).length} 项映射</small></span> },
                {
                  title: '数据进度',
                  width: 190,
                  render: (_, task) => {
                    const stats = taskProductionStats(task);
                    return (
                      <span className="task-progress-cell task-production-progress-cell">
                        <strong>总数据 {stats.total}</strong>
                        <small>待人工审核 {stats.pendingReview}</small>
                        <small>已入库 {stats.approved} · 打回 {stats.rejected}</small>
                      </span>
                    );
                  },
                },
                { title: '审核/AI', width: 180, render: (_, task) => <span className="task-meta-stack"><small>审核员 {taskReviewerSummary(task)}</small><small>AI {task.ai_config?.enabled ? '已开启' : '未开启'}</small></span> },
                { title: '截止与奖励', width: 150, render: (_, task) => <span className="task-meta-stack"><small>{task.deadline || '未设置截止'}</small><small>{taskRewardDisplayLabel(task)}</small></span> },
                { title: '最近更新', width: 150, render: (_, task) => formatDateTime(task.updated_at || task.created_at) },
                {
                  title: '操作',
                  width: 138,
                  key: 'actions',
                  fixed: 'right',
                  className: 'workspace-table-action-cell',
                  render: (_, task) => (
                    <WorkspaceTableActions
                      visible={[{ key: 'edit', label: taskEditActionLabel(task), icon: <EditOutlined />, onClick: () => openEdit(task) }]}
                      menu={taskActionItems(task).map((action) => {
                        const key = String(action.key);
                        return {
                          key,
                          label: String(action.label),
                          danger: Boolean(action.danger),
                          disabled: Boolean(action.disabled),
                          icon: taskActionIcon(key),
                          onClick: () => {
                            if (key === 'internal-labelers') {
                              openInternalLabelerModal(task);
                              return;
                            }
                            if (key === 'transfer-owner') {
                              setOwnerTransferTask(task);
                              setOwnerTransferTargetId('');
                              setOwnerTransferReason('');
                              return;
                            }
                            if (key === 'copy') {
                              void runTaskAction(task, 'copy');
                              return;
                            }
                            if (key === 'results') {
                              openTaskResults(task);
                              return;
                            }
                            if (key === 'delete') {
                              openDeleteTaskConfirm(task);
                              return;
                            }
                            if (key === 'pause') {
                              void confirmTaskStatusAction(task, 'pause');
                              return;
                            }
                            if (key === 'finish') {
                              void confirmTaskStatusAction(task, 'finish');
                              return;
                            }
                            void runTaskAction(task, key as 'publish' | 'approve' | 'pause' | 'resume');
                          },
                        };
                      })}
                    />
                  ),
                },
              ], visibleTasks),
            ]}
          />
        </section>
      ) : (
        <section className="production-card-shell workspace-fixed-table-panel task-card-shell" aria-label="任务卡片列表">
          <Spin spinning={tableLoading}>
            <div className="production-card-scroll">
              {tasks.length ? (
                <div className="production-card-grid">
                  {visibleTaskCards.map((task) => {
                    const stats = taskProductionStats(task);
                    const progressPercent = stats.total > 0 ? Math.min(100, Math.round((stats.approved / stats.total) * 100)) : 0;
                    const selected = selectedTaskRowKeys.includes(task.task_id);
                    return (
                      <AntCard
                        className={selected ? 'production-card task-production-card selected' : 'production-card task-production-card'}
                        key={task.task_id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openEdit(task)}
                        onKeyDown={(event) => activateCardFromKeyboard(event, () => openEdit(task))}
                      >
                        <div className="production-card-topline">
                          <div className="production-card-badges">
                            <Tag className={`task-status-tag ${taskStatusClass(task.status, task.auto_saved)}`}>{taskStatusLabel(task.status, task.auto_saved)}</Tag>
                            <Tag color="blue">{categoryLabel(task.category)}</Tag>
                            <Tag color={task.difficulty === 'easy' ? 'green' : task.difficulty === 'hard' ? 'red' : 'orange'}>{difficultyLabel(task.difficulty)}</Tag>
                          </div>
                          <Checkbox
                            checked={selected}
                            aria-label={`选择任务 ${taskDisplayTitle(task)}`}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              setSelectedTaskRowKeys((current) => checked
                                ? Array.from(new Set([...current, task.task_id]))
                                : current.filter((key) => key !== task.task_id));
                            }}
                          />
                        </div>
                        <div className="production-card-body">
                          <h3>{taskDisplayTitle(task)}</h3>
                          <p>{task.description || '暂无描述'}</p>
                          <div className="production-card-owner">
                            <span>发布人</span>
                            <Tag color="blue">{taskOwnerDisplayName(task)}</Tag>
                          </div>
                          <div className="task-card-reward-row">
                            <strong>{taskRewardDisplayLabel(task)}</strong>
                            <span>{distributionLabel(task.distribution)}</span>
                          </div>
                        </div>
                        <div className="production-card-progress">
                          <div><strong>{stats.approved}/{stats.total}</strong><span>入库进度</span></div>
                          <Progress percent={progressPercent} size="small" showInfo={false} />
                        </div>
                        <div className="production-card-metrics task-production-metrics" aria-label="任务关键指标">
                          <span><strong>{stats.total}</strong><small>总数据</small></span>
                          <span><strong>{stats.pendingReview}</strong><small>待人工审核</small></span>
                          <span><strong>{stats.approved}</strong><small>已入库</small></span>
                          <span><strong>{stats.rejected}</strong><small>打回</small></span>
                          <span><strong>{task.reviewer_ids.length || '-'}</strong><small>{taskReviewerSummary(task)}</small></span>
                        </div>
                        <div className="production-card-tags">
                          {task.tags.slice(0, 3).map((tag) => <Tag color="blue" key={tag}>{tag}</Tag>)}
                          {task.tags.length > 3 && <Tag>+{task.tags.length - 3}</Tag>}
                          {!task.tags.length && <Tag>暂无标签</Tag>}
                        </div>
                        <div className="production-card-actions">
                          <AntButton icon={<EditOutlined />} size="small" type="primary" onClick={(event) => { event.stopPropagation(); openEdit(task); }}>{taskEditActionLabel(task)}</AntButton>
                          <Dropdown
                            classNames={{ root: 'workspace-action-dropdown' }}
                            getPopupContainer={() => document.body}
                            menu={{
                              items: taskActionItems(task),
                              onClick: ({ key, domEvent }) => {
                                domEvent.stopPropagation();
                                if (key === 'internal-labelers') {
                                  openInternalLabelerModal(task);
                                  return;
                                }
                                if (key === 'transfer-owner') {
                                  setOwnerTransferTask(task);
                                  setOwnerTransferTargetId('');
                                  setOwnerTransferReason('');
                                  return;
                                }
                                if (key === 'copy') {
                                  void runTaskAction(task, 'copy');
                                  return;
                                }
                                if (key === 'results') {
                                  openTaskResults(task);
                                  return;
                                }
                                if (key === 'delete') {
                                  openDeleteTaskConfirm(task);
                                  return;
                                }
                                if (key === 'pause') {
                                  void confirmTaskStatusAction(task, 'pause');
                                  return;
                                }
                                if (key === 'finish') {
                                  void confirmTaskStatusAction(task, 'finish');
                                  return;
                                }
                                void runTaskAction(task, key as 'publish' | 'approve' | 'pause' | 'resume');
                              },
                            }}
                          >
                            <AntButton icon={<MoreOutlined />} size="small" onClick={(event) => event.stopPropagation()}>更多</AntButton>
                          </Dropdown>
                        </div>
                      </AntCard>
                    );
                  })}
                </div>
              ) : (
                <Empty className="production-card-empty" description="暂无任务，先新建一个任务草稿。" />
              )}
            </div>
          </Spin>
          <div className="production-card-pagination">
            <Pagination
              current={safeTaskCardPage}
              pageSize={taskCardPageSize}
              total={tasks.length}
              showSizeChanger
              showQuickJumper
              pageSizeOptions={productionCardPageSizeOptions.map(String)}
              onChange={(page, pageSize) => {
                setTaskCardPage(page);
                setTaskCardPageSize(pageSize);
              }}
            />
          </div>
        </section>
      )}
      <Drawer
        title={resultDrawerTask ? `结果查看与导出：${taskDisplayTitle(resultDrawerTask)}` : '结果查看与导出'}
        open={Boolean(resultDrawerTask)}
        size="min(1120px, calc(100vw - 32px))"
        className="task-result-export-drawer"
        onClose={() => setResultDrawerTask(null)}
        extra={(
          <Space>
            <AntButton
              icon={<ReloadOutlined />}
              disabled={!resultDrawerTask}
              onClick={() => resultDrawerTask && void loadResultExportJobs(resultDrawerTask)}
            >
              刷新历史
            </AntButton>
            <AntButton
              type="primary"
              icon={<DownloadOutlined />}
              loading={resultExportSubmitting}
              disabled={!resultDrawerTask || resultDrawerTask.status === 'draft'}
              onClick={() => void createResultExport()}
            >
              创建导出任务
            </AntButton>
          </Space>
        )}
      >
        {resultDrawerTask ? (
          <div className="task-result-export-content">
            {resultDrawerTask.status === 'draft' && (
              <Alert type="warning" showIcon title="草稿任务暂无正式标注结果；发布后可创建结果导出任务。" />
            )}
            <section className="task-result-export-section">
              <div className="task-config-summary">
                <dl>
                  <div><dt>总数据</dt><dd>{taskProductionStats(resultDrawerTask).total}</dd></div>
                  <div><dt>待人工审核</dt><dd>{taskProductionStats(resultDrawerTask).pendingReview}</dd></div>
                  <div><dt>已入库</dt><dd>{taskProductionStats(resultDrawerTask).approved}</dd></div>
                  <div><dt>打回</dt><dd>{taskProductionStats(resultDrawerTask).rejected}</dd></div>
                  <div><dt>导出任务</dt><dd>{resultExportJobs.length}</dd></div>
                </dl>
              </div>
            </section>
            <section className="task-result-export-section">
              <div className="task-result-export-heading">
                <div>
                  <strong>导出配置</strong>
                  <span>支持 JSON / JSONL / CSV / Excel，按状态、日期和字段映射生成结果文件。</span>
                </div>
              </div>
              <div className="task-result-export-controls">
                <label>导出格式
                  <Select
                    value={resultExportFormat}
                    onChange={setResultExportFormat}
                    options={[
                      { value: 'jsonl', label: 'JSONL' },
                      { value: 'json', label: 'JSON' },
                      { value: 'csv', label: 'CSV' },
                      { value: 'excel', label: 'Excel' },
                    ]}
                  />
                </label>
                <label>数据状态
                  <Select
                    value={resultExportStatusFilter}
                    onChange={setResultExportStatusFilter}
                    options={[
                      { value: 'approved', label: '仅已入库' },
                      { value: 'submitted', label: '待人工审核' },
                      { value: 'rejected', label: '已打回' },
                      { value: 'all', label: '全部数据' },
                    ]}
                  />
                </label>
                <label>日期范围
                  <RangePicker
                    value={resultExportDateRange}
                    onChange={(dates) => setResultExportDateRange(dates)}
                    presets={[
                      { label: '最近 7 天', value: [dayjs().subtract(6, 'day'), dayjs()] },
                      { label: '最近 30 天', value: [dayjs().subtract(29, 'day'), dayjs()] },
                      { label: '最近 90 天', value: [dayjs().subtract(89, 'day'), dayjs()] },
                    ]}
                  />
                </label>
                <div className="task-result-review-checkbox">
                  <span>包含审核记录</span>
                  <Checkbox checked={resultExportIncludeReview} onChange={(event) => setResultExportIncludeReview(event.target.checked)} />
                </div>
              </div>
            </section>
            <section className="task-result-export-section">
              <div className="task-result-export-heading">
                <div>
                  <strong>字段映射</strong>
                  <span>选择导出字段，可为列名设置重命名；动态字段支持 `content.*` 和 `answers.*`。</span>
                </div>
                <AntButton
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={() => { setResultExportFieldKeys(defaultTaskResultExportFieldKeys); setResultExportRenameMap({}); setResultExportCustomFields(''); }}
                >
                  恢复默认
                </AntButton>
              </div>
              <Table
                size="small"
                rowKey="key"
                pagination={false}
                dataSource={taskResultExportFields}
                columns={[
                  {
                    title: '导出',
                    width: 72,
                    render: (_, field) => (
                      <Checkbox
                        checked={resultExportFieldKeys.includes(field.key)}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setResultExportFieldKeys((current) => checked
                            ? Array.from(new Set([...current, field.key]))
                            : current.filter((key) => key !== field.key));
                        }}
                      />
                    ),
                  },
                  {
                    title: '字段',
                    render: (_, field) => (
                      <span className="task-result-field-name">
                        <strong>{field.label}</strong>
                        <small>{field.key} · {field.description}</small>
                      </span>
                    ),
                  },
                  {
                    title: '导出列名',
                    width: 240,
                    render: (_, field) => (
                      <Input
                        size="small"
                        placeholder="留空保持原字段名"
                        value={resultExportRenameMap[field.key] ?? ''}
                        disabled={!resultExportFieldKeys.includes(field.key) || field.key.endsWith('.*')}
                        onChange={(event) => setResultExportRenameMap((current) => ({ ...current, [field.key]: event.target.value }))}
                      />
                    ),
                  },
                ]}
              />
              <label className="task-result-custom-fields">自定义字段路径
                <Input.TextArea
                  rows={3}
                  value={resultExportCustomFields}
                  placeholder={'每行一个字段，例如：\ncontent.title\nanswers.category'}
                  onChange={(event) => setResultExportCustomFields(event.target.value)}
                />
              </label>
            </section>
            <section className="task-result-export-section">
              <div className="task-result-export-heading">
                <div>
                  <strong>下载历史</strong>
                  <span>异步导出任务进度和历史文件下载记录。</span>
                </div>
              </div>
              <EnhancedTable<ExportJobPayload>
                rowKey="export_id"
                loading={resultExportsLoading}
                dataSource={resultExportJobs}
                pagination={{ pageSize: 6 }}
                locale={{ emptyText: '暂无导出历史。' }}
                enableColumnResize={false}
                columns={[
                  { title: '文件', dataIndex: 'filename', render: (value: string) => value || '-' },
                  { title: '格式', dataIndex: 'format', width: 82, render: (value: string) => <Tag>{value.toUpperCase()}</Tag> },
                  { title: '状态', dataIndex: 'status', width: 126, render: (value: string, job) => <Tag color={exportStatusColor(value)}>{exportStatusLabel(value)} {job.progress}%</Tag> },
                  { title: '大小', dataIndex: 'file_size', width: 104, render: (value: number) => formatFileSize(value) },
                  { title: '下载', dataIndex: 'download_count', width: 72 },
                  { title: '创建时间', dataIndex: 'created_at', width: 150, render: (value?: string | null) => formatDateTime(value) },
                  {
                    title: '操作',
                    key: 'actions',
                    width: 138,
                    fixed: 'right',
                    className: 'workspace-table-action-cell',
                    render: (_, job) => (
                      <WorkspaceTableActions
                        visible={[{ key: 'download', label: '下载', icon: <DownloadOutlined />, disabled: job.status !== 'completed', onClick: () => void downloadTaskExport(job, resultDrawerTask) }]}
                        menu={job.status === 'pending' || job.status === 'processing'
                          ? [{
                            key: 'cancel',
                            label: '取消导出',
                            icon: <DeleteOutlined />,
                            danger: true,
                            onClick: () => void cancelTaskExport(job, resultDrawerTask),
                            confirm: { title: '确认取消该导出任务？', okText: '取消导出' },
                          }]
                          : []}
                      />
                    ),
                  },
                ]}
              />
            </section>
          </div>
        ) : null}
      </Drawer>
      <Modal
        title={deleteConfirmTask?.status === 'draft' ? '删除草稿任务' : '删除已结束任务'}
        open={Boolean(deleteConfirmTask)}
        centered
        destroyOnClose
        okText="永久删除"
        cancelText="取消"
        confirmLoading={deleteConfirmSubmitting}
        okButtonProps={{
          danger: true,
          disabled: !deleteConfirmTask || deleteConfirmInput !== deleteConfirmTask.title,
        }}
        onOk={() => void submitDeleteTask()}
        onCancel={() => {
          setDeleteConfirmTask(null);
          setDeleteConfirmInput('');
        }}
      >
        {deleteConfirmTask ? (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Alert
              type="error"
              showIcon
              title="这是敏感操作"
              description={deleteConfirmTask.status === 'draft'
                ? '删除后会永久移除该任务草稿及已生成的题目，无法在平台内恢复。'
                : '删除后会永久移除该任务、题目、提交、领取包、AI 预审、人工审核视图数据和导出记录。请确认已经完成必要的数据导出和备份；已发生的积分流水和审计日志会保留，不会退款或撤销已结算积分。'}
            />
            <Descriptions
              bordered
              size="small"
              column={2}
              title="将删除的生产数据"
              items={[
                { key: 'task', label: '任务', children: taskDisplayTitle(deleteConfirmTask), span: 2 },
                { key: 'questions', label: '题目', children: taskDeleteCounts(deleteConfirmTask).questions },
                { key: 'submissions', label: '提交', children: taskDeleteCounts(deleteConfirmTask).submissions },
                { key: 'bundles', label: '领取包', children: taskDeleteCounts(deleteConfirmTask).claim_bundles },
                { key: 'ai', label: 'AI 预审', children: taskDeleteCounts(deleteConfirmTask).ai_review_jobs },
                { key: 'exports', label: '导出记录', children: taskDeleteCounts(deleteConfirmTask).export_jobs },
                { key: 'notifications', label: '通知', children: taskDeleteCounts(deleteConfirmTask).notifications },
                { key: 'approved', label: '已验收通过', children: taskDeleteCounts(deleteConfirmTask).approved_submissions },
                { key: 'abandoned', label: '已放弃', children: taskDeleteCounts(deleteConfirmTask).abandoned_submissions },
              ]}
            />
            <label className="question-import-form">
              <span>请输入任务名称以确认删除</span>
              <Input
                autoFocus
                status={deleteConfirmInput && deleteConfirmInput !== deleteConfirmTask.title ? 'error' : undefined}
                value={deleteConfirmInput}
                placeholder={deleteConfirmTask.title}
                onChange={(event) => setDeleteConfirmInput(event.target.value)}
              />
            </label>
          </Space>
        ) : null}
      </Modal>
      <Modal
        title="转交任务负责人"
        open={Boolean(ownerTransferTask)}
        confirmLoading={ownerTransferSubmitting}
        okText="确认转交"
        okButtonProps={{ disabled: !ownerTransferTargetId.trim() }}
        onOk={() => void submitOwnerTransfer()}
        onCancel={() => {
          setOwnerTransferTask(null);
          setOwnerTransferTargetId('');
          setOwnerTransferReason('');
        }}
      >
        <div className="question-import-form">
          {ownerTransferTask ? (
            <div className="task-transfer-summary">
              <span>当前任务</span>
              <strong>{ownerTransferTask.title}</strong>
              <small>当前负责人：{taskOwnerDisplayName(ownerTransferTask)}</small>
            </div>
          ) : null}
          <label>目标负责人账号
            <Select
              aria-label="目标负责人账号"
              className="task-owner-transfer-select"
              style={{ width: '100%' }}
              showSearch
              allowClear
              loading={taskOwnerCandidatesLoading}
              optionFilterProp="label"
              placeholder="选择同企业 active Team Admin 或 Owner"
              notFoundContent={taskOwnerCandidatesLoading ? <Spin size="small" /> : '暂无可转交负责人'}
              options={ownerTransferOptions}
              value={ownerTransferTargetId}
              onChange={(value) => setOwnerTransferTargetId(value ?? '')}
            />
          </label>
          <label>转交原因
            <Input.TextArea
              aria-label="转交原因"
              rows={3}
              maxLength={400}
              placeholder="例如：项目交接、负责人休假、企业调整"
              value={ownerTransferReason}
              onChange={(event) => setOwnerTransferReason(event.target.value)}
            />
          </label>
        </div>
      </Modal>
      <Modal
        title="分配企业 Labeler"
        open={Boolean(internalLabelerTask)}
        confirmLoading={internalLabelerSubmitting}
        okText="保存分配"
        onOk={() => void submitInternalLabelers()}
        onCancel={() => {
          setInternalLabelerTask(null);
          setInternalLabelerIds([]);
          setInternalLabelerAllocations([]);
        }}
      >
        <div className="question-import-form">
          {internalLabelerTask ? (
            <div className="task-transfer-summary">
              <span>当前任务</span>
              <strong>{internalLabelerTask.title}</strong>
              <small>当前范围：{internalLabelerSummary(stringArrayFromUnknown(internalLabelerTask.assignment?.target_labeler_ids), taskLabelerMembers)} / {internalLabelerAllocationSummaryLabel(stringArrayFromUnknown(internalLabelerTask.assignment?.target_labeler_ids), normalizeLabelerAllocations(stringArrayFromUnknown(internalLabelerTask.assignment?.target_labeler_ids), internalLabelerTask.assignment?.target_labeler_allocations))}</small>
            </div>
          ) : null}
          <label>企业 Labeler
            <Select
              mode="multiple"
              allowClear
              showSearch
              loading={internalLabelerLoading}
              value={internalLabelerIds}
              options={taskLabelerOptions}
              optionFilterProp="label"
              placeholder="不选择表示所有企业 Labeler"
              onChange={(values) => {
                setInternalLabelerIds(values);
                setInternalLabelerAllocations((current) => normalizeLabelerAllocations(values, current));
              }}
              getPopupContainer={workspacePopupContainer}
            />
          </label>
          {internalLabelerIds.length > 1 ? (
            <div className="task-modal-allocation-panel">
              <span className="task-modal-allocation-title">Labeler 任务分配比例</span>
              <div className="reviewer-allocation-list">
                {internalLabelerAllocationPreview.map((allocation) => (
                  <div className="reviewer-allocation-row" key={allocation.labeler_id}>
                    <span>
                      <strong>{reviewerDisplayLabel(allocation.labeler_id, taskLabelerMembers)}</strong>
                      <small>{allocation.quota || 0}% · 约 {allocation.item_count ?? 0} 条</small>
                    </span>
                    <div className="reviewer-allocation-control">
                      <Space.Compact>
                        <InputNumber
                          min={0}
                          max={100}
                          precision={0}
                          step={1}
                          value={allocation.quota === '' ? null : Number(allocation.quota)}
                          placeholder="百分比"
                          onChange={(value) => setInternalLabelerAllocations((current) => current.map((item) => (
                            item.labeler_id === allocation.labeler_id ? { ...item, quota: value === null ? '' : String(value) } : item
                          )))}
                        />
                        <span className="task-input-unit-addon">%</span>
                      </Space.Compact>
                      <small className="reviewer-allocation-count">
                        {allocation.item_count === undefined ? (internalLabelerTask?.stats?.total ? '待合计 100%' : '暂无题量预览') : `约 ${allocation.item_count} 条`}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
              <div className={`reviewer-allocation-total ${internalLabelerAllocationTotal === 100 ? 'is-valid' : 'is-invalid'}`}>
                <span>合计 {internalLabelerAllocationTotal}%</span>
                <span>{internalLabelerTask?.stats?.total ? `共 ${internalLabelerTask.stats.total} 条，预览合计 ${internalLabelerAllocationPreview.reduce((sum, item) => sum + (item.item_count ?? 0), 0)} 条` : '暂无题量时仅保存比例'}</span>
              </div>
              {internalLabelerAllocationTotal !== 100 ? (
                <Alert type="warning" showIcon title="多位 Labeler 的任务分配比例必须合计 100%。" />
              ) : null}
            </div>
          ) : null}
        </div>
      </Modal>
      <Modal
        title="批量创建导出任务"
        open={batchExportModalOpen}
        confirmLoading={batchExportSubmitting}
        okText="批量创建导出"
        onOk={() => void batchCreateExports()}
        onCancel={() => setBatchExportModalOpen(false)}
      >
        <div className="question-import-form">
          <Alert showIcon title={`将为 ${batchExportableTasks.length} 个可导出任务创建导出任务${batchExportSkippedTasks ? `，跳过 ${batchExportSkippedTasks} 个草稿任务` : ''}。`} />
          <label>导出格式
            <Select
              value={batchExportFormat}
              onChange={setBatchExportFormat}
              options={[
                { value: 'jsonl', label: 'JSONL' },
                { value: 'json', label: 'JSON' },
                { value: 'csv', label: 'CSV' },
                { value: 'excel', label: 'Excel' },
              ]}
            />
          </label>
          <label>数据状态
            <Select
              value={batchExportStatusFilter}
              onChange={setBatchExportStatusFilter}
              options={[
                { value: 'approved', label: '仅已通过' },
                { value: 'submitted', label: '已提交' },
                { value: 'all', label: '全部状态' },
              ]}
            />
          </label>
          <label>日期范围
            <RangePicker
              value={batchExportDateRange}
              onChange={(dates) => setBatchExportDateRange(dates)}
              presets={[
                { label: '最近 7 天', value: [dayjs().subtract(6, 'day'), dayjs()] },
                { label: '最近 30 天', value: [dayjs().subtract(29, 'day'), dayjs()] },
                { label: '最近 90 天', value: [dayjs().subtract(89, 'day'), dayjs()] },
              ]}
            />
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={batchExportIncludeReview} onChange={(event) => setBatchExportIncludeReview(event.target.checked)} />
            包含审核记录
          </label>
        </div>
      </Modal>
      <Modal
        title="批量追加标签"
        open={batchTagModalOpen}
        confirmLoading={batchTagSubmitting}
        okText="追加标签"
        okButtonProps={{ disabled: parseList(batchTagText).length === 0 }}
        onOk={() => void batchAppendTags()}
        onCancel={() => setBatchTagModalOpen(false)}
      >
        <div className="question-import-form">
          <Alert showIcon title={`将为 ${selectedTasks.length} 个任务追加标签；已有标签会自动去重。发布后任务仅允许修改描述、富文本说明和标签。`} />
          <label>新增标签
            <Input
              aria-label="批量新增标签"
              placeholder="例如：重点项目, 本周交付"
              value={batchTagText}
              onChange={(event) => setBatchTagText(event.target.value)}
            />
          </label>
        </div>
      </Modal>
    </main>
  );
}

export function TaskPublishWorkspacePage({
  headingTitle = '新建任务',
  headingKicker = 'Task Setup',
  headingDescription = '按步骤完成基础信息、模板数据、分发奖励、AI 预审、人工复审和用户协议，右侧会同步展示摘要。',
  initialTask = null,
  onBack,
  onBreadcrumbTailChange,
}: {
  headingTitle?: string;
  headingKicker?: string;
  headingDescription?: string;
  initialTask?: TaskPayload | null;
  onBack?: () => void;
  onBreadcrumbTailChange?: (tail: AppShellBreadcrumbItem | null) => void;
} = {}) {
  const showToast = useWorkspaceToast('task-publish');
  const { team, loading, error } = useOwnerTeam();
  const [datasets, setDatasets] = useState<DatasetPayload[]>([]);
  const [templates, setTemplates] = useState<TemplatePayload[]>([]);
  const [aiProviders, setAiProviders] = useState<AiProviderConfigPayload[]>([]);
  const [reviewerMembers, setReviewerMembers] = useState<TeamMember[]>([]);
  const [labelerMembers, setLabelerMembers] = useState<TeamMember[]>([]);
  const [labelerMembersLoaded, setLabelerMembersLoaded] = useState(false);
  const [aiProviderLoading, setAiProviderLoading] = useState(false);
  const [reviewerLoading, setReviewerLoading] = useState(false);
  const [labelerLoading, setLabelerLoading] = useState(false);
  const [aiWalletBalance, setAiWalletBalance] = useState<number | null>(null);
  const [aiInputGenerating, setAiInputGenerating] = useState(false);
  const [aiMatrixGenerating, setAiMatrixGenerating] = useState(false);
  const [difficultyEvaluating, setDifficultyEvaluating] = useState(false);
  const [difficultyEvaluation, setDifficultyEvaluation] = useState<TaskDifficultyEvaluateResponse | null>(null);
  const [task, setTask] = useState<TaskPayload | null>(initialTask);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [form, setForm] = useState(() => buildTaskPublishFormState(initialTask));
  const [mapping, setMapping] = useState<Record<string, string | null>>(() => ({ ...(initialTask?.column_mapping ?? {}) }));
  const [bindingMapping, setBindingMapping] = useState<Record<string, DataBindingPayload>>(() => normalizeInitialBindingMapping(initialTask));
  const [maskSourceMapping, setMaskSourceMapping] = useState<Record<string, DataBindingPayload>>(() => normalizeInitialMaskSourceMapping(initialTask));
  const [actionError, setActionError] = useState<string | null>(null);
  const [publishCheckOpen, setPublishCheckOpen] = useState(false);
  const [readiness, setReadiness] = useState<TaskReadinessPayload | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [autoSaveState, setAutoSaveState] = useState<'idle' | 'saving' | 'saved' | 'blocked' | 'error'>(initialTask?.auto_saved ? 'saved' : 'idle');
  const [publishing, setPublishing] = useState(false);
  const lastPersistedFingerprint = useRef('');
  const initializedInitialTaskFingerprintRef = useRef<string | null>(initialTask ? null : 'new-task');
  const difficultyFingerprintRef = useRef<string | null>(null);
  const breadcrumbTailChangeRef = useRef(onBreadcrumbTailChange);
  const onBackRef = useRef(onBack);
  const publishedTemplates = useMemo(() => templates.filter((template) => template.status === 'published'), [templates]);
  const selectedTemplate = templates.find((template) => template.template_id === form.template_id)
    ?? publishedTemplates.find((template) => template.template_id === form.template_id)
    ?? null;
  const templateSelectOptions = useMemo(() => {
    const options = new Map<string, { value: string; label: string }>();
    const appendTemplate = (template: TemplatePayload, prefix = '') => {
      options.set(template.template_id, {
        value: template.template_id,
        label: `${prefix}${template.name} / ${template.status}`,
      });
    };
    publishedTemplates.forEach((template) => appendTemplate(template));
    if (selectedTemplate && !options.has(selectedTemplate.template_id)) {
      appendTemplate(selectedTemplate, '当前绑定 · ');
    }
    return Array.from(options.values());
  }, [publishedTemplates, selectedTemplate]);
  const selectedDataset = datasets.find((dataset) => dataset.dataset_id === form.dataset_id) ?? null;
  const reviewerOptions = useMemo(() => buildReviewerOptions(reviewerMembers, form.reviewer_ids), [form.reviewer_ids, reviewerMembers]);
  const labelerOptions = useMemo(() => buildLabelerOptions(labelerMembers), [labelerMembers]);
  const isInternalFlow = form.distribution === 'quota_grab';
  const isPackageFlow = form.distribution === 'first_come_all';
  const reviewerAllocationTotal = useMemo(() => reviewerAllocationTotalPercent(form.review_allocations), [form.review_allocations]);
  const labelerAllocationTotal = useMemo(() => labelerAllocationTotalPercent(form.internal_labeler_allocations), [form.internal_labeler_allocations]);
  const reviewItemTotal = selectedDataset?.row_count ?? 0;
  const reviewerAllocationPreview = useMemo(
    () => calculateReviewerAllocationPreview(form.reviewer_ids, form.review_allocations, reviewItemTotal),
    [form.review_allocations, form.reviewer_ids, reviewItemTotal],
  );
  const labelerAllocationPreview = useMemo(
    () => calculateLabelerAllocationPreview(form.internal_labeler_ids, form.internal_labeler_allocations, reviewItemTotal),
    [form.internal_labeler_allocations, form.internal_labeler_ids, reviewItemTotal],
  );
  const showItems = useMemo(() => extractShowItems(selectedTemplate?.schema), [selectedTemplate]);
  const imageMaskComponents = useMemo(() => extractImageMaskComponents(selectedTemplate?.schema), [selectedTemplate]);
  const answerFields = useMemo(() => extractAnswerFields(selectedTemplate?.schema), [selectedTemplate]);
  const effectiveMapping = useMemo(() => selectedDataset ? suggestColumnMapping(selectedDataset, showItems, mapping) : mapping, [selectedDataset, showItems, mapping]);
  const effectiveBindingMapping = useMemo(() => buildEffectiveShowItemBindingMapping(showItems, effectiveMapping, bindingMapping), [bindingMapping, effectiveMapping, showItems]);
  const mappedCount = showItems.filter((component) => showItemMappingIsConfigured(component, effectiveMapping, effectiveBindingMapping)).length;
  const maskMappedCount = imageMaskComponents.filter((component) => Boolean(maskSourceMapping[component.id])).length;
  const selectedAiProvider = useMemo(
    () => aiProviders.find((provider) => provider.provider_id === form.ai_provider_id) ?? null,
    [aiProviders, form.ai_provider_id],
  );
  const aiReviewProviderOptions = useMemo(
    () => aiProviders
      .filter((provider) => provider.status === 'enabled')
      .map((provider) => ({
        value: provider.provider_id,
        disabled: !providerSupportsTaskCategory(provider, form.category),
        label: [
          provider.provider_name || provider.route_name || provider.provider,
          provider.scope === 'platform'
            ? provider.is_platform_default
              ? '平台共享 / 平台默认'
              : '平台共享'
            : '企业自有',
          ...(provider.scope === 'platform'
            ? []
            : [provider.provider_kind || provider.provider, resolveAiProviderModel(provider)]),
        ]
          .filter(Boolean)
          .join(' / '),
      })),
    [aiProviders, form.category],
  );
  const selectedAiProviderModel = useMemo(() => resolveAiProviderModel(selectedAiProvider), [selectedAiProvider]);
  const selectedAiProviderWarning = getAiProviderCapabilityWarning(selectedAiProvider, form.category);
  const selectedAiDimensions = useMemo(() => [...form.ai_selected_dimensions, ...form.ai_custom_dimensions], [form.ai_custom_dimensions, form.ai_selected_dimensions]);
  const rewardCost = useMemo(
    () => calculateRewardCost({
      rewardMode: isInternalFlow ? 'item' : form.reward_mode,
      pointsPerItem: isInternalFlow ? '0' : form.points_per_item,
      totalPoints: isInternalFlow ? '0' : form.total_points,
      standardItemCount: selectedDataset?.row_count ?? 0,
    }),
    [form.points_per_item, form.reward_mode, form.total_points, isInternalFlow, selectedDataset?.row_count],
  );
  const aiRejectThreshold = Number(form.ai_reject_threshold || 0);
  const aiPassThreshold = Number(form.ai_pass_threshold || 0);
  const aiThresholdsValid = aiRejectThreshold >= 0
    && aiRejectThreshold <= 100
    && aiPassThreshold >= 0
    && aiPassThreshold <= 100
    && aiPassThreshold >= aiRejectThreshold;
  const aiManualRangeText = aiPassThreshold === aiRejectThreshold
    ? '无'
    : `${aiRejectThreshold}% <= 总分 < ${aiPassThreshold}%`;
  const deadlineIssue = !form.deadline_long_term && !form.deadline
    ? '请选择截止日期或长期有效'
    : isPastTaskDeadline(form.deadline_long_term, form.deadline)
      ? '截止日期不能早于今天'
      : null;
  const deadlineComplete = form.deadline_long_term || (Boolean(form.deadline) && !deadlineIssue);
  const aiConfigComplete = !form.ai_enabled || (
    Boolean(form.ai_provider_id)
    && selectedAiDimensions.length > 0
    && Boolean(form.ai_input_prompt.trim())
    && form.ai_input_confirmed
    && form.ai_review_matrix.length > 0
    && form.ai_matrix_confirmed
    && aiThresholdsValid
  );
  const basicInfoComplete = form.title.trim().length >= 2
    && form.description.trim().length >= 2
    && form.category_values.length > 0
    && form.tag_items.length > 0
    && deadlineComplete;
  const normalizedShareExpireHours = normalizeShareExpireHours(form.expire_hours);
  const sharePreview = task?.assignment?.enabled ? buildTaskSharePreview(task.assignment) : null;
  const summaryCompletion = [
    basicInfoComplete,
    Boolean(form.template_id) && Boolean(form.dataset_id) && (showItems.length === 0 || mappedCount === showItems.length) && (imageMaskComponents.length === 0 || maskMappedCount === imageMaskComponents.length),
    (!isPackageFlow || !form.share_enabled || normalizedShareExpireHours > 0)
      && (isInternalFlow || rewardCost.canCalculate)
      && (!isInternalFlow || form.internal_labeler_ids.length <= 1 || labelerAllocationTotal === 100),
    aiConfigComplete,
    form.reviewer_ids.length <= 1 || reviewerAllocationTotal === 100,
    !form.agreement_required || form.agreement_use_default || Boolean(form.agreement_text.trim() || form.agreement_file_name),
    Boolean(form.title.trim()) && Boolean(form.template_id) && Boolean(form.dataset_id) && Boolean(form.difficulty) && (showItems.length === 0 || mappedCount === showItems.length) && (imageMaskComponents.length === 0 || maskMappedCount === imageMaskComponents.length) && aiConfigComplete,
  ];
  const publishIssues = [
    !form.template_id ? '请选择模板' : null,
    !form.dataset_id ? '请选择数据集' : null,
    form.title.trim().length < 2 ? '任务标题至少 2 个字符' : null,
    form.description.trim().length < 2 ? '请输入任务描述' : null,
    form.category_values.length === 0 ? '请选择任务分类' : null,
    !form.difficulty ? '请先完成任务难度评估' : null,
    form.tag_items.length === 0 ? '请输入任务标签' : null,
    deadlineIssue,
    showItems.length > 0 && mappedCount < showItems.length ? '请补齐 ShowItem 映射' : null,
    imageMaskComponents.length > 0 && maskMappedCount < imageMaskComponents.length ? '请补齐图片 Mask 底图来源' : null,
    !isInternalFlow && !rewardCost.hasRewardValue ? (form.reward_mode === 'task' ? '任务总奖励积分需大于 0' : '每条积分需大于 0') : null,
    !isInternalFlow && form.reward_mode === 'task' && rewardCost.hasRewardValue && rewardCost.needsStandardItemCount ? '选择数据集后计算标准条数' : null,
    isInternalFlow && form.internal_labeler_ids.length > 1 && labelerAllocationTotal !== 100 ? '多位 Labeler 的任务分配比例需要合计 100%' : null,
    form.ai_enabled && !form.ai_provider_id ? 'AI 预审开启时需要选择 Provider' : null,
    form.ai_enabled && selectedAiDimensions.length === 0 ? 'AI 预审至少需要一个审核维度' : null,
    form.ai_enabled && !form.ai_input_prompt.trim() ? 'AI 预审需要生成 Input 字段说明' : null,
    form.ai_enabled && form.ai_input_prompt.trim() && !form.ai_input_confirmed ? 'AI 字段说明需要确认使用' : null,
    form.ai_enabled && form.ai_review_matrix.length === 0 ? 'AI 预审需要生成评分矩阵' : null,
    form.ai_enabled && form.ai_review_matrix.length > 0 && !form.ai_matrix_confirmed ? 'AI 评分矩阵需要确认使用' : null,
    form.ai_enabled && !aiThresholdsValid ? 'AI 自动判定阈值需要满足建议通过阈值大于等于建议打回阈值' : null,
    form.agreement_required && !form.agreement_use_default && !form.agreement_text.trim() && !form.agreement_file_name ? '请填写或上传任务用户协议' : null,
    form.reviewer_ids.length > 1 && reviewerAllocationTotal !== 100 ? '多位 Reviewer 的百分比分配需要合计 100%' : null,
  ].filter((item): item is string => Boolean(item));
  const canPublish = publishIssues.length === 0;
  const currentStepIssueMap: Record<number, string[]> = {
    0: [
      form.title.trim().length < 2 ? '任务标题至少 2 个字符' : null,
      form.description.trim().length < 2 ? '请输入任务描述' : null,
      form.category_values.length === 0 ? '请选择任务分类' : null,
      form.tag_items.length === 0 ? '请输入任务标签' : null,
      deadlineIssue,
    ].filter((item): item is string => Boolean(item)),
    1: [
      !form.template_id ? '请选择已发布模板版本' : null,
      !form.dataset_id ? '请选择数据集' : null,
      showItems.length > 0 && mappedCount < showItems.length ? '请补齐 ShowItem 映射' : null,
      imageMaskComponents.length > 0 && maskMappedCount < imageMaskComponents.length ? '请补齐图片 Mask 底图来源' : null,
    ].filter((item): item is string => Boolean(item)),
    2: [
      isPackageFlow && form.share_enabled && normalizedShareExpireHours <= 0 ? '分享链接有效期需大于 0 小时' : null,
      !isInternalFlow && !rewardCost.hasRewardValue ? (form.reward_mode === 'task' ? '任务总奖励积分需大于 0' : '每条积分需大于 0') : null,
      !isInternalFlow && form.reward_mode === 'task' && rewardCost.hasRewardValue && rewardCost.needsStandardItemCount ? '选择数据集后计算标准条数' : null,
      isInternalFlow && form.internal_labeler_ids.length > 1 && labelerAllocationTotal !== 100 ? '多位 Labeler 的任务分配比例需要合计 100%' : null,
    ].filter((item): item is string => Boolean(item)),
    3: [
      form.ai_enabled && !form.ai_provider_id ? '请选择企业已配置的 AI Provider' : null,
      form.ai_enabled && selectedAiDimensions.length === 0 ? '至少选择或添加一个审核维度' : null,
      form.ai_enabled && !form.ai_input_prompt.trim() ? '请生成 Input 字段说明' : null,
      form.ai_enabled && form.ai_input_prompt.trim() && !form.ai_input_confirmed ? '请确认字段说明' : null,
      form.ai_enabled && form.ai_review_matrix.length === 0 ? '请生成审核评分矩阵' : null,
      form.ai_enabled && form.ai_review_matrix.length > 0 && !form.ai_matrix_confirmed ? '请确认评分矩阵' : null,
      form.ai_enabled && !aiThresholdsValid ? '阈值需满足建议通过阈值大于等于建议打回阈值' : null,
    ].filter((item): item is string => Boolean(item)),
    4: [
      form.reviewer_ids.length > 1 && reviewerAllocationTotal !== 100 ? '多位 Reviewer 的百分比分配需要合计 100%' : null,
    ].filter((item): item is string => Boolean(item)),
    5: [
      form.agreement_required && !form.agreement_use_default && !form.agreement_text.trim() && !form.agreement_file_name ? '请填写或上传任务用户协议' : null,
    ].filter((item): item is string => Boolean(item)),
    6: publishIssues,
  };
  const currentStepIssues = currentStepIssueMap[currentStep] ?? [];
  const currentStepReady = currentStepIssues.length === 0;
  const publishProgress = Math.round((summaryCompletion.filter(Boolean).length / summaryCompletion.length) * 100);
  const currentStepTitle = taskPublishSteps[currentStep]?.title ?? '新建任务';
  const currentStepDescription = taskPublishSteps[currentStep]?.description ?? '';
  const deadlineSummaryLabel = formatTaskPublishDeadlineLabel(form.deadline_long_term, form.deadline);
  const selectedTemplateColumns = selectedDataset?.columns.filter((column) => column.use_in_mapping !== false) ?? [];
  const selectedDataSourceOptions = selectedDataset ? buildDataSourceOptions(selectedDataset) : [];
  const selectedImageMaskSourceOptions = imageMaskSourceOptions(selectedDataSourceOptions);
  const updateShowItemDisplayBindings = useCallback((component: TemplateComponentSchema, values: string[]) => {
    const bindings = values.map((value) => decodeDataSourceOption(value)).filter(Boolean);
    setBindingMapping((current) => {
      const next = { ...current };
      if (bindings.length) next[component.id] = showItemMappingConfigFromBindings(component, bindings);
      else delete next[component.id];
      return next;
    });
    setMapping((current) => ({ ...current, [component.id]: bindingToColumnName(bindings[0] ?? null) }));
  }, []);
  const updateMaskSourceBinding = useCallback((component: TemplateComponentSchema, value?: string | null) => {
    const binding = value ? decodeDataSourceOption(value) : null;
    setMaskSourceMapping((current) => {
      const next = { ...current };
      if (binding) next[component.id] = binding;
      else delete next[component.id];
      return next;
    });
  }, []);
  const waitingForInitialTaskResources = Boolean(initialTask && ((form.template_id && !selectedTemplate) || (form.dataset_id && !selectedDataset)));
  const deadlinePickerValue = useMemo(() => (form.deadline ? dayjs(form.deadline) : null), [form.deadline]);
  const taskPublishAiContext: TaskPublishDraftContext = {
    workspaceId: team?.team_id ?? '',
    teamId: team?.team_id ?? '',
    draftTaskId: task?.task_id ?? null,
    currentStep: currentStepTitle,
    basicInfo: {
      title: form.title,
      description: form.description,
      category: form.category,
      categoryTags: form.category_values,
      difficulty: form.difficulty,
      tags: form.tag_items,
      deadline: form.deadline_long_term ? null : form.deadline,
      deadlineLongTerm: form.deadline_long_term,
      claimTimeLimit: form.completion_hours,
    },
    templateAndData: {
      templateVersionId: form.template_id,
      templateName: selectedTemplate?.name,
      datasetId: form.dataset_id,
      datasetName: selectedDataset?.name,
      rowCount: selectedDataset?.row_count ?? 0,
      templateSchema: buildTaskPublishTemplateSchemaContext(selectedTemplate?.schema),
      showItemMappings: showItems.map((component) => ({
        showItemKey: component.id,
        showItemLabel: component.label,
        datasetField: effectiveMapping[component.id] ?? null,
        displayFields: showItemDisplayBindingsFromMapping(component, effectiveBindingMapping[component.id])
          .map((binding) => bindingDisplayLabel(binding)),
      })),
      mappedCount,
      showItemCount: showItems.length,
    },
    distributionAndReward: {
      distributionStrategy: form.distribution,
      shareEnabled: isPackageFlow && form.share_enabled,
      shareExpireHours: isPackageFlow && form.share_enabled ? String(normalizedShareExpireHours) : '',
      internalLabelerIds: isInternalFlow ? form.internal_labeler_ids : [],
      internalLabelerSummary: isInternalFlow ? internalLabelerSummary(form.internal_labeler_ids, labelerMembers) : '',
      internalLabelerAllocations: isInternalFlow ? form.internal_labeler_allocations : [],
      internalLabelerAllocationTotal: isInternalFlow ? labelerAllocationTotal : 0,
      qualificationRules: {
        required_certs: isInternalFlow ? [] : parseList(form.required_certs),
        min_completed_tasks: isInternalFlow ? '0' : form.min_completed_tasks,
        min_accuracy_rate: isInternalFlow ? '0' : form.min_accuracy_rate,
        notes: isInternalFlow ? '' : form.qualification_notes,
        category_tags: form.category_values,
      },
      rewardMode: isInternalFlow ? 'none' : form.reward_mode,
      labelerRewardPoints: isInternalFlow ? '0' : form.reward_mode === 'task' ? form.total_points : form.points_per_item,
      estimatedEnterpriseCost: rewardCost.companyTotalCost ?? rewardCost.companyCostPerItem,
      platformFee: rewardCost.platformFeeTotal ?? rewardCost.platformFeePerItem,
      rewardCost,
    },
    aiReview: {
      enabled: form.ai_enabled,
      providerId: form.ai_provider_id,
      providerName: selectedAiProvider?.provider_name || selectedAiProvider?.route_name || selectedAiProvider?.provider,
      presetDimensions: form.ai_selected_dimensions,
      customDimensions: form.ai_custom_dimensions,
      inputFieldDescriptions: form.ai_input_prompt,
      inputConfirmed: form.ai_input_confirmed,
      scoringMatrix: form.ai_review_matrix,
      matrixConfirmed: form.ai_matrix_confirmed,
      passThreshold: form.ai_pass_threshold,
      rejectThreshold: form.ai_reject_threshold,
      manualReviewRange: [form.ai_reject_threshold, form.ai_pass_threshold],
      complete: aiConfigComplete,
    },
    humanReview: {
      enabled: form.reviewer_ids.length > 0,
      reviewerIds: form.reviewer_ids,
      reviewerAllocations: form.review_allocations,
      availableReviewers: reviewerOptions,
    },
    agreement: {
      required: form.agreement_required,
      useDefaultTemplate: form.agreement_use_default,
      customText: form.agreement_use_default ? '' : form.agreement_text,
      fileName: form.agreement_file_name,
    },
    readiness: {
      blockers: publishIssues,
      warnings: readiness?.warnings?.map((item) => item.message) ?? [],
      canPublish,
      backendReady: readiness?.ready ?? null,
    },
    autoSave: {
      draft: Boolean(task?.status === 'draft'),
      autoSaved: Boolean(task?.auto_saved),
      state: autoSaveState,
      lastSavedAt: task?.updated_at ?? null,
      progress: publishProgress,
    },
  };

  const applyTaskPublishAiDraft = useCallback((next: { form: typeof form; mapping: Record<string, string | null> }) => {
    const distribution = next.form.distribution === 'quota_grab' ? 'quota_grab' : 'first_come_all';
    const internalLabelerIds = distribution === 'quota_grab' ? next.form.internal_labeler_ids : [];
    setForm(({
      ...next.form,
      distribution,
      share_enabled: distribution === 'quota_grab' ? false : Boolean(next.form.share_enabled),
      internal_labeler_ids: internalLabelerIds,
      internal_labeler_allocations: normalizeLabelerAllocations(internalLabelerIds, next.form.internal_labeler_allocations),
    }));
    setMapping(next.mapping);
    setBindingMapping((current) => mergeColumnBindings(current, next.mapping));
    setMaskSourceMapping({});
    setAutoSaveState('idle');
  }, []);
  useActionErrorToast(actionError, setActionError, showToast);

  const difficultyMissingFields = useMemo(() => {
    const missing: string[] = [];
    if (!form.dataset_id) missing.push('数据集');
    if (!form.template_id) missing.push('模板');
    return missing;
  }, [form.dataset_id, form.template_id]);
  const difficultyFingerprint = useMemo(() => JSON.stringify({
    dataset_id: form.dataset_id,
    template_id: form.template_id,
    required_certs: parseList(form.required_certs),
    min_completed_tasks: Number(form.min_completed_tasks || 0),
    min_accuracy_rate: Number(form.min_accuracy_rate || 0),
    qualification_notes: form.qualification_notes.trim(),
    category: form.category,
    category_values: form.category_values,
  }), [form.category, form.category_values, form.dataset_id, form.min_accuracy_rate, form.min_completed_tasks, form.qualification_notes, form.required_certs, form.template_id]);

  useEffect(() => {
    if (!initialTask) return;
    const timer = window.setTimeout(() => {
      setTask(initialTask);
      setForm(buildTaskPublishFormState(initialTask));
      setMapping({ ...(initialTask.column_mapping ?? {}) });
      setBindingMapping(normalizeInitialBindingMapping(initialTask));
      setMaskSourceMapping(normalizeInitialMaskSourceMapping(initialTask));
      setCurrentStep(0);
      setQrSvg(null);
      setActionError(null);
      setPublishCheckOpen(false);
      setReadiness(null);
      setAutoSaveState(initialTask.auto_saved ? 'saved' : 'idle');
      setDifficultyEvaluation(null);
      initializedInitialTaskFingerprintRef.current = null;
      difficultyFingerprintRef.current = null;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialTask]);

  useEffect(() => {
    const qrText = sharePreview?.qrText;
    if (!qrText) return;
    let active = true;
    void QRCode.toString(qrText, { type: 'svg', margin: 1, width: 160 }).then((svg) => {
      if (active) setQrSvg(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
    });
    return () => {
      active = false;
    };
  }, [sharePreview?.qrText]);

  useEffect(() => {
    if (!team) return;
    void listDatasets(team.team_id)
      .then((data) => setDatasets(data.items))
      .catch(() => setDatasets([]));
    void listTemplates(team.team_id)
      .then((data) => setTemplates(data.items))
      .catch(() => setTemplates([]));
    const reviewerTimer = window.setTimeout(() => {
      setReviewerLoading(true);
      void getTeamMembers(team.team_id, { role: 'reviewer', status: 'active' })
        .then((data) => setReviewerMembers(Array.isArray(data?.items) ? data.items : []))
        .catch(() => setReviewerMembers([]))
        .finally(() => setReviewerLoading(false));
    }, 0);
    const labelerTimer = window.setTimeout(() => {
      setLabelerLoading(true);
      setLabelerMembersLoaded(false);
      void getTeamMembers(team.team_id, { role: 'labeler', status: 'active' })
        .then((data) => {
          const members = filterActiveTeamLabelerMembers(data?.items);
          setLabelerMembers(members);
          setLabelerMembersLoaded(true);
        })
        .catch(() => setLabelerMembers([]))
        .finally(() => {
          setLabelerLoading(false);
        });
    }, 0);
    const timer = window.setTimeout(() => {
      setAiProviderLoading(true);
      void listAiProviderConfigs(team.team_id)
        .then((data) => {
          const enabledProviders = data.items.filter((provider) => provider.status === 'enabled' && provider.api_key_configured);
          setAiProviders(enabledProviders);
        })
        .catch(() => setAiProviders([]))
        .finally(() => setAiProviderLoading(false));
    }, 0);
    void getTeamAiWallet(team.team_id)
      .then((data) => setAiWalletBalance(data.balance_points))
      .catch(() => setAiWalletBalance(null));
    return () => {
      window.clearTimeout(reviewerTimer);
      window.clearTimeout(labelerTimer);
      window.clearTimeout(timer);
    };
  }, [team]);

  useEffect(() => {
    if (!labelerMembersLoaded || !form.internal_labeler_ids.length) return;
    const activeLabelerIds = new Set(labelerMembers.filter(isActiveTeamLabelerMember).map((member) => member.user_id));
    setForm((current) => {
      const internalLabelerIds = current.internal_labeler_ids.filter((labelerId) => activeLabelerIds.has(labelerId));
      if (stringArraysEqual(internalLabelerIds, current.internal_labeler_ids)) return current;
      return {
        ...current,
        internal_labeler_ids: internalLabelerIds,
        internal_labeler_allocations: normalizeLabelerAllocations(internalLabelerIds, current.internal_labeler_allocations),
      };
    });
  }, [form.internal_labeler_ids, labelerMembers, labelerMembersLoaded]);

  useEffect(() => {
    if (!selectedAiProvider) return;
    if (form.ai_model && selectedAiProvider.models.includes(form.ai_model)) return;
    const nextModel = resolveAiProviderModel(selectedAiProvider);
    if (!nextModel || nextModel === form.ai_model) return;
    const timer = window.setTimeout(() => setForm((current) => ({ ...current, ai_model: nextModel })), 0);
    return () => window.clearTimeout(timer);
  }, [form.ai_model, selectedAiProvider]);

  useEffect(() => {
    if (difficultyFingerprintRef.current === null) {
      difficultyFingerprintRef.current = difficultyFingerprint;
      return;
    }
    if (difficultyFingerprintRef.current === difficultyFingerprint) return;
    difficultyFingerprintRef.current = difficultyFingerprint;
    const timer = window.setTimeout(() => {
      setDifficultyEvaluation(null);
      setDifficultyEvaluating(false);
      setForm((current) => current.difficulty ? { ...current, difficulty: '' } : current);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [difficultyFingerprint]);

  const breadcrumbTail = useMemo<AppShellBreadcrumbItem>(() => ({
      key: 'publish-task',
      parentKey: 'task-management',
      parentLabel: '任务管理',
      parentOnClick: () => onBackRef.current?.(),
      label: headingTitle,
  }), [headingTitle]);

  useEffect(() => {
    breadcrumbTailChangeRef.current = onBreadcrumbTailChange;
  }, [onBreadcrumbTailChange]);

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    onBreadcrumbTailChange?.(breadcrumbTail);
  }, [breadcrumbTail, onBreadcrumbTailChange]);

  useEffect(() => () => {
    breadcrumbTailChangeRef.current?.(null);
  }, []);

  const aiFinalPrompt = useMemo(
    () => composeAiReviewPrompt(form.ai_input_prompt, form.ai_review_matrix),
    [form.ai_input_prompt, form.ai_review_matrix],
  );

  const addTaskTag = useCallback(() => {
    setForm((current) => {
      const value = current.tag_input.trim();
      if (!value) return current;
      const nextTags = Array.from(new Set([...current.tag_items, value]));
      return { ...current, tag_items: nextTags, tags: nextTags.join(', '), tag_input: '' };
    });
  }, []);

  const removeTaskTag = useCallback((tag: string) => {
    setForm((current) => {
      const nextTags = current.tag_items.filter((item) => item !== tag);
      return { ...current, tag_items: nextTags, tags: nextTags.join(', ') };
    });
  }, []);

  const addCustomAiDimension = useCallback(() => {
    const value = form.ai_custom_dimension_input.trim();
    if (!value || selectedAiDimensions.includes(value)) return;
    setForm((current) => ({
      ...current,
      ai_custom_dimensions: [...current.ai_custom_dimensions, value],
      ai_custom_dimension_input: '',
      ai_matrix_confirmed: false,
    }));
  }, [form.ai_custom_dimension_input, selectedAiDimensions]);

  const removeCustomAiDimension = useCallback((dimension: string) => {
    setForm((current) => ({
      ...current,
      ai_custom_dimensions: current.ai_custom_dimensions.filter((item) => item !== dimension),
      ai_review_matrix: current.ai_review_matrix.filter((item) => item.dimension !== dimension),
      ai_matrix_confirmed: false,
    }));
  }, []);

  const runDifficultyEvaluation = useCallback(async () => {
    if (!team) return;
    if (difficultyMissingFields.length > 0) {
      showToast('error', `暂不能评估任务难度：请先补充${difficultyMissingFields.join('、')}，资质领域为“无要求”时也可以直接评估。`);
      setDifficultyEvaluation({
        difficulty: null,
        label: null,
        confidence: null,
        reason: `填写完${difficultyMissingFields.join('、')}后可开始评估任务难度。`,
        signals: [],
        missing_fields: difficultyMissingFields,
        prompt: '',
      });
      setForm((current) => current.difficulty ? { ...current, difficulty: '' } : current);
      return;
    }
    setDifficultyEvaluating(true);
    setActionError(null);
    try {
      const data = await evaluateTaskDifficulty(team.team_id, {
        dataset_id: form.dataset_id,
        template_id: form.template_id,
        required_certs: parseList(form.required_certs),
        qualification_rules: {
          min_completed_tasks: Number(form.min_completed_tasks || 0),
          min_accuracy_rate: Number(form.min_accuracy_rate || 0),
          notes: form.qualification_notes || null,
        },
        context: {
          category: form.category,
          category_tags: form.category_values,
          title: form.title,
          description: form.description,
          tags: form.tag_items,
        },
      });
      setDifficultyEvaluation(data);
      setForm((current) => ({ ...current, difficulty: data.difficulty || '' }));
    } catch (err) {
      setDifficultyEvaluation({
        difficulty: null,
        label: null,
        confidence: null,
        reason: err instanceof ApiClientError ? err.message : '任务难度评估失败，请稍后重试。',
        signals: [],
        missing_fields: [],
        prompt: '',
      });
      setForm((current) => current.difficulty ? { ...current, difficulty: '' } : current);
    } finally {
      setDifficultyEvaluating(false);
    }
  }, [difficultyMissingFields, form.category, form.category_values, form.dataset_id, form.description, form.min_accuracy_rate, form.min_completed_tasks, form.qualification_notes, form.required_certs, form.tag_items, form.template_id, form.title, showToast, team]);

  const generateAiInputPrompt = useCallback(async () => {
    if (!team) return;
    if (!form.ai_provider_id) {
      setActionError('请先选择已配置的 AI Provider');
      return;
    }
    setAiInputGenerating(true);
    setActionError(null);
    try {
      const data = await generateAiReviewInputPrompt(team.team_id, {
        provider_id: form.ai_provider_id,
        model: selectedAiProviderModel || form.ai_model || null,
        dataset: buildSafeAiDatasetContext(selectedDataset),
        template: buildSafeAiTemplateContext(selectedTemplate, showItems, answerFields, effectiveMapping),
        context: buildSafeAiTaskContext(form),
      });
      setForm((current) => ({
        ...current,
        ai_input_prompt: data.input_prompt,
        ai_input_confirmed: false,
        ai_matrix_confirmed: false,
      }));
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'AI 字段说明生成失败');
    } finally {
      setAiInputGenerating(false);
    }
  }, [answerFields, effectiveMapping, form, selectedAiProviderModel, selectedDataset, selectedTemplate, showItems, team]);

  const generateAiReviewMatrix = useCallback(async () => {
    if (!team) return;
    if (selectedAiDimensions.length === 0) return;
    if (!form.ai_provider_id) {
      setActionError('请先选择已配置的 AI Provider');
      return;
    }
    setAiMatrixGenerating(true);
    setActionError(null);
    const inputPrompt = form.ai_input_prompt || buildAiGeneratedInputBrief(selectedDataset, selectedTemplate, showItems, answerFields, effectiveMapping);
    try {
      const data = await generateAiReviewMatrixRequest(team.team_id, {
        provider_id: form.ai_provider_id,
        model: selectedAiProviderModel || form.ai_model || null,
        dimensions: selectedAiDimensions,
        input_prompt: inputPrompt,
        dataset: buildSafeAiDatasetContext(selectedDataset),
        template: buildSafeAiTemplateContext(selectedTemplate, showItems, answerFields, effectiveMapping),
        context: buildSafeAiTaskContext(form),
      });
      setForm((current) => ({
        ...current,
        ai_input_prompt: current.ai_input_prompt || inputPrompt,
        ai_input_confirmed: Boolean(current.ai_input_prompt && current.ai_input_confirmed),
        ai_review_matrix: data.items.map((row, index) => ({
          key: row.key || row.dimension || `dimension_${index}`,
          dimension: row.dimension,
          definition: row.definition,
          scoring_standard: row.scoring_standard,
          deduction_rule: row.deduction_rule,
          reject_condition: row.reject_condition,
          manual_condition: row.manual_condition,
        })),
        ai_matrix_confirmed: false,
      }));
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'AI 评分矩阵生成失败');
    } finally {
      setAiMatrixGenerating(false);
    }
  }, [answerFields, effectiveMapping, form, selectedAiDimensions, selectedAiProviderModel, selectedDataset, selectedTemplate, showItems, team]);

  const updateAiMatrixRow = useCallback((key: string, field: keyof Omit<AiReviewMatrixRow, 'key'>, value: string) => {
    setForm((current) => ({
      ...current,
      ai_review_matrix: current.ai_review_matrix.map((row) => (row.key === key ? { ...row, [field]: value } : row)),
      ai_matrix_confirmed: false,
    }));
  }, []);

  const parseAgreementFileToText = useCallback(async (file: File) => {
    if (!isReadableAgreementFile(file)) {
      showToast('error', '当前仅支持解析 TXT、MD、CSV、JSON、HTML 等文本协议文件；PDF、Word 请先转换为文本后上传。');
      return Upload.LIST_IGNORE;
    }
    try {
      const text = await readFileAsText(file);
      setForm((prev) => ({
        ...prev,
        agreement_text: normalizeAgreementFileText(text),
        agreement_file_name: file.name,
        agreement_use_default: false,
      }));
      showToast('success', `协议文件已解析到正文：${file.name}`);
    } catch {
      showToast('error', '协议文件解析失败，请检查文件编码后重试。');
      return Upload.LIST_IGNORE;
    }
    return false;
  }, [showToast]);

  const buildTaskPayload = useCallback(() => ({
    title: form.title,
    description: form.description,
    tags: form.tag_items,
    category: form.category || undefined,
    difficulty: form.difficulty || undefined,
    deadline: form.deadline_long_term ? null : form.deadline || undefined,
    distribution: form.distribution,
    quota: selectedDataset?.row_count || 1,
    reward_rule: isInternalFlow
      ? { mode: 'item' as const, points_per_item: 0 }
      : {
          mode: form.reward_mode,
          total_points: form.reward_mode === 'task' ? toNonNegativeInteger(form.total_points) : undefined,
          points_per_item: form.reward_mode === 'item' ? toNonNegativeInteger(form.points_per_item) : undefined,
        },
    reviewer_ids: form.reviewer_ids,
    review_config: {
      reviewer_allocations: buildReviewerAllocationPayload(form.reviewer_ids, form.review_allocations),
    },
    ai_config: {
      enabled: form.ai_enabled,
      provider_id: form.ai_provider_id || null,
      model: selectedAiProviderModel || form.ai_model || null,
      labeler_assist_ratio: toPercentInteger(form.labeling_ai_assist_percent, 5),
      selected_dimensions: form.ai_selected_dimensions,
      custom_dimensions: form.ai_custom_dimensions,
      input_prompt: form.ai_input_prompt || null,
      review_matrix: form.ai_review_matrix,
      output_schema: aiReviewOutputSchema,
      thresholds: {
        pass: Number(form.ai_pass_threshold || 0),
        reject: Number(form.ai_reject_threshold || 0),
        manual_min: Number(form.ai_reject_threshold || 0),
        manual_max: Number(form.ai_pass_threshold || 0),
      },
      input_confirmed: form.ai_input_confirmed,
      matrix_confirmed: form.ai_matrix_confirmed,
      prompt: aiFinalPrompt || null,
      review_threshold: form.ai_enabled ? toNonNegativeInteger(form.ai_pass_threshold || form.ai_threshold) : 0,
      dimensions: selectedAiDimensions,
    },
    qualification_rules: {
      min_completed_tasks: isInternalFlow ? 0 : toNonNegativeInteger(form.min_completed_tasks),
      min_accuracy_rate: isInternalFlow ? 0 : toNonNegativeInteger(form.min_accuracy_rate),
      notes: isInternalFlow ? null : form.qualification_notes || null,
      category_tags: form.category_values,
    },
    required_certs: isInternalFlow ? [] : parseList(form.required_certs),
    agreement_config: {
      required: form.agreement_required,
      use_default_template: form.agreement_use_default,
      text: form.agreement_use_default ? defaultTaskAgreementText : form.agreement_text || null,
      file_name: form.agreement_file_name || null,
    },
    claim_config: {
      completion_hours: form.completion_hours ? toPositiveInteger(form.completion_hours, 1) : null,
      deadline_mode: form.deadline_long_term ? 'long_term' : 'date',
      labeling_ai_assist_percent: toPercentInteger(form.labeling_ai_assist_percent, 5),
    },
    template_id: form.template_id || undefined,
    dataset_id: form.dataset_id || undefined,
    column_mapping: Object.fromEntries(showItems.map((component) => [component.id, effectiveMapping[component.id] ?? null])),
    mapping_config: Object.fromEntries(showItems.map((component) => [component.id, effectiveBindingMapping[component.id]]).filter(([, binding]) => binding)),
    component_bindings: buildImageMaskComponentBindings(imageMaskComponents, maskSourceMapping),
    assignment: isInternalFlow
      ? {
          enabled: false,
          expire_hours: normalizedShareExpireHours > 0 ? normalizedShareExpireHours : 72,
          target_labeler_ids: form.internal_labeler_ids,
          target_labeler_allocations: buildLabelerAllocationPayload(form.internal_labeler_ids, form.internal_labeler_allocations),
        }
      : {
          enabled: Boolean(form.share_enabled),
          expire_hours: normalizedShareExpireHours > 0 ? normalizedShareExpireHours : 72,
          target_labeler_ids: [],
          target_labeler_allocations: [],
        },
  }), [aiFinalPrompt, effectiveBindingMapping, effectiveMapping, form, imageMaskComponents, isInternalFlow, maskSourceMapping, normalizedShareExpireHours, selectedAiDimensions, selectedAiProviderModel, selectedDataset?.row_count, showItems]);

  const draftFingerprint = useMemo(() => JSON.stringify(buildTaskPayload()), [buildTaskPayload]);

  useEffect(() => {
    if (!initialTask) return;
    if (waitingForInitialTaskResources) return;
    if (initializedInitialTaskFingerprintRef.current === initialTask.task_id) return;
    lastPersistedFingerprint.current = draftFingerprint;
    initializedInitialTaskFingerprintRef.current = initialTask.task_id;
    setAutoSaveState(initialTask.auto_saved ? 'saved' : 'idle');
  }, [draftFingerprint, initialTask, waitingForInitialTaskResources]);

  const hasDraftContent = Boolean(
    form.title.trim()
    || form.description.trim()
    || form.tag_items.length > 0
    || form.category_values.length > 0
    || form.difficulty
    || form.deadline
    || form.deadline_long_term
    || form.completion_hours
    || form.template_id
    || form.dataset_id
    || form.distribution !== 'first_come_all'
    || form.share_enabled
    || form.internal_labeler_ids.length
    || form.internal_labeler_allocations.some((item) => item.quota)
    || form.reward_mode !== 'item'
    || form.total_points
    || form.points_per_item
    || (form.share_enabled && form.expire_hours)
    || form.reviewer_ids.length
    || form.review_allocations.some((item) => item.quota)
    || parseList(form.required_certs).length
    || form.min_completed_tasks
    || form.min_accuracy_rate
    || form.qualification_notes.trim()
    || form.ai_enabled
    || (form.ai_enabled && form.ai_provider_id)
    || (form.ai_enabled && form.ai_model.trim())
    || form.ai_prompt.trim()
    || (form.ai_enabled && form.ai_selected_dimensions.length)
    || (form.ai_enabled && form.ai_custom_dimension_input.trim())
    || (form.ai_enabled && form.ai_custom_dimensions.length)
    || (form.ai_enabled && form.ai_input_prompt.trim())
    || (form.ai_enabled && form.ai_review_matrix.length)
    || !form.agreement_required
    || !form.agreement_use_default
    || form.agreement_text !== defaultTaskAgreementText
    || form.agreement_file_name,
  );
  const canPersistDraft = hasDraftContent;

  const saveDraft = useCallback(async ({ autoSaved = false, silent = false, returnToList = false }: { autoSaved?: boolean; silent?: boolean; returnToList?: boolean } = {}) => {
    if (!team) return;
    if (!canPersistDraft) {
      if (silent) {
        setAutoSaveState(hasDraftContent ? 'blocked' : 'idle');
      } else {
        setActionError('请先填写任意任务配置后再保存草稿；手动保存建议继续补齐分类、模板、数据集并完成难度评估。');
      }
      return;
    }
    setActionError(null);
    setQrSvg(null);
    setSavingDraft(true);
    if (autoSaved) setAutoSaveState('saving');
    try {
      const payloadBase = buildTaskPayload();
      const payload = { ...payloadBase, auto_saved: autoSaved };
      const draft = task?.status === 'draft'
        ? await updateTask(team.team_id, task.task_id, payload)
        : await createTask(team.team_id, payload);
      setTask(draft);
      lastPersistedFingerprint.current = JSON.stringify(payloadBase);
      if (autoSaved) setAutoSaveState('saved');
      if (!silent) showToast('success', autoSaved ? '任务已自动保存。' : '任务草稿已保存。');
      if (returnToList) {
        onBack?.();
      }
    } catch (err) {
      if (autoSaved) setAutoSaveState('error');
      if (!silent) setActionError(err instanceof ApiClientError ? err.message : '任务草稿保存失败');
    } finally {
      setSavingDraft(false);
    }
  }, [buildTaskPayload, canPersistDraft, hasDraftContent, onBack, task, team]);

  useEffect(() => {
    if (initialTask && initializedInitialTaskFingerprintRef.current !== initialTask.task_id) return;
    if (!hasDraftContent) {
      const timer = window.setTimeout(() => setAutoSaveState('idle'), 0);
      return () => window.clearTimeout(timer);
    }
    if (waitingForInitialTaskResources) return;
    if (!canPersistDraft || (task && task.status !== 'draft')) {
      const timer = window.setTimeout(() => setAutoSaveState('blocked'), 0);
      return () => window.clearTimeout(timer);
    }
    if (draftFingerprint === lastPersistedFingerprint.current) return;
    const timer = window.setTimeout(() => {
      void saveDraft({ autoSaved: true, silent: true });
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [canPersistDraft, draftFingerprint, hasDraftContent, initialTask, saveDraft, task, waitingForInitialTaskResources]);

  const exitToBack = useCallback(async () => {
    if (hasDraftContent && (!task || task.status === 'draft') && draftFingerprint !== lastPersistedFingerprint.current) {
      await saveDraft({ autoSaved: true, silent: true });
    }
    onBack?.();
  }, [draftFingerprint, hasDraftContent, onBack, saveDraft, task]);

  const requestPublish = async () => {
    if (team && task?.status === 'draft') {
      try {
        setReadiness(await getTaskReadiness(team.team_id, task.task_id));
      } catch {
        setReadiness(null);
      }
    }
    setPublishCheckOpen(true);
  };

  const confirmPublish = async () => {
    if (!team) return;
    setPublishing(true);
    setActionError(null);
    let returnToTaskManagement = false;
    try {
      const draft = task?.status === 'draft' ? task : await createTask(team.team_id, { ...buildTaskPayload(), auto_saved: false });
      const latestDraft = task?.status === 'draft' ? await updateTask(team.team_id, draft.task_id, { ...buildTaskPayload(), auto_saved: false }) : draft;
      const latestReadiness = await getTaskReadiness(team.team_id, latestDraft.task_id);
      setReadiness(latestReadiness);
      if (!latestReadiness.ready) {
        setPublishCheckOpen(true);
        return;
      }
      const published = await publishTask(team.team_id, latestDraft.task_id);
      setTask(published);
      setPublishCheckOpen(false);
      showToast('success', published.status === 'pending_review' ? '任务已提交管理员审核，通过后会进入收集中。' : '任务已发布，已按数据集生成题目。');
      returnToTaskManagement = true;
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : '任务发布失败');
    } finally {
      setPublishing(false);
      if (returnToTaskManagement) onBackRef.current?.();
    }
  };

  const gotoStep = (step: number) => {
    setCurrentStep(Math.max(0, Math.min(taskPublishSteps.length - 1, step)));
  };

  if (loading) return <main className="workspace-content workspace-loading-page"><WorkspaceLoading tip="正在加载企业信息" /></main>;
  if (error || !team) return <main className="workspace-content workspace-status-page"><Alert className="workspace-page-alert" type="warning" showIcon title={error || '请先完成企业企业配置。'} /></main>;

  return (
    <main className={`workspace-content production-page publish-workbench-page task-create-workbench-page workspace-fixed-page ${initialTask ? 'task-edit-workbench-page' : ''}`}>
      <section className="page-heading task-create-heading">
        <div>
          <p className="section-kicker">{headingKicker}</p>
          <h1>{headingTitle}</h1>
          <p>{headingDescription}</p>
        </div>
        <div className="page-heading-actions">
          {onBack && <AntButton icon={<ArrowLeftOutlined />} loading={savingDraft} onClick={() => void exitToBack()}>返回任务管理</AntButton>}
        </div>
      </section>
      <section className="task-step-rail" aria-label="新建任务步骤">
        <Steps
          type="navigation"
          size="small"
          responsive={false}
          current={currentStep}
          onChange={(value) => gotoStep(value)}
          items={taskPublishSteps.map((step, index) => ({
            title: step.title,
            icon: step.icon,
            status: index < currentStep ? (summaryCompletion[index] ? 'finish' : 'error') : index === currentStep ? 'process' : 'wait',
          }))}
        />
      </section>
      <section className="task-create-shell">
        <section className="task-step-stage">
          <div className="section-title task-step-stage-title">
            <div>
              <p className="section-kicker">Step {currentStep + 1}</p>
              <h2>{currentStepTitle}</h2>
              <p>{currentStepDescription}</p>
            </div>
            <Tag color={currentStepReady ? 'green' : 'orange'}>{currentStepReady ? '当前步骤已完成' : '当前步骤待完善'}</Tag>
          </div>
          <div className="task-step-stage-body">
            {currentStep === 0 && (
              <Form layout="vertical" className="task-step-form">
                <div className="task-step-grid task-step-grid-basic">
                  <Form.Item label="任务标题" required>
                    <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="请输入任务标题" />
                  </Form.Item>
                  <Form.Item label="截止日期" required>
                    <Space.Compact className="task-deadline-control">
                      <DatePicker
                        disabled={form.deadline_long_term}
                        disabledDate={(current) => Boolean(current && current.isBefore(dayjs().startOf('day'), 'day'))}
                        value={deadlinePickerValue}
                        onChange={(value) => setForm({ ...form, deadline: value ? value.format('YYYY-MM-DD') : '' })}
                        getPopupContainer={workspacePopupContainer}
                      />
                      <Checkbox
                        className="task-inline-checkbox"
                        checked={form.deadline_long_term}
                        onChange={(event) => setForm({ ...form, deadline_long_term: event.target.checked, deadline: event.target.checked ? '' : form.deadline })}
                      >
                        长期有效
                      </Checkbox>
                    </Space.Compact>
                  </Form.Item>
	                  <Form.Item label="领取后完成时限">
	                    <Space.Compact style={{ width: '100%' }}>
	                      <InputNumber
	                        min={1}
	                        max={8760}
	                        precision={0}
	                        step={1}
	                        value={form.completion_hours === '' ? null : Number(form.completion_hours)}
	                        onChange={(value) => setForm({ ...form, completion_hours: String(value ?? '') })}
	                        placeholder="不设置"
	                        style={{ width: '100%' }}
	                      />
	                      <span className="task-input-unit-addon">小时</span>
	                    </Space.Compact>
	                  </Form.Item>
                  <Form.Item label="任务分类" required>
                    <Select
                      mode="multiple"
                      value={form.category_values}
                      placeholder="可多选文本、图片、音频、视频"
                      onChange={(values) => setForm({ ...form, category_values: values, category: deriveTaskCategory(values) })}
                      getPopupContainer={workspacePopupContainer}
                      options={taskCategoryOptions}
                    />
                  </Form.Item>
                  <Form.Item className="task-step-span" label="标签" required>
                    <div className="task-tag-editor">
                      <Space.Compact className="task-tag-compose">
                        <Input
                          value={form.tag_input}
                          onChange={(event) => setForm({ ...form, tag_input: event.target.value })}
                          onPressEnter={addTaskTag}
                          placeholder="输入单个标签，例如：法律合同"
                        />
                        <AntButton type="primary" icon={<PlusOutlined />} onClick={addTaskTag} disabled={!form.tag_input.trim()}>添加</AntButton>
                      </Space.Compact>
                      <div className="task-tag-list" aria-label="已添加标签">
                        {form.tag_items.length ? (
                          form.tag_items.map((tag) => (
                            <Tag key={tag} closable onClose={(event) => { event.preventDefault(); removeTaskTag(tag); }}>
                              {tag}
                            </Tag>
                          ))
                        ) : (
                          <span className="task-tag-empty">尚未添加标签</span>
                        )}
                      </div>
                    </div>
                  </Form.Item>
                  <Form.Item className="task-step-span" label="任务描述" required>
                    <Input.TextArea
                      value={form.description}
                      onChange={(event) => setForm({ ...form, description: event.target.value })}
                      autoSize={{ minRows: 5, maxRows: 8 }}
                      placeholder="说明任务目标、标注口径和交付要求"
                    />
                  </Form.Item>
                </div>
                {currentStepIssues.length > 0 && <Alert type="warning" showIcon title="当前步骤需要补充内容" description={currentStepIssues.join('、')} />}
              </Form>
            )}
            {currentStep === 1 && (
              <Form layout="vertical" className="task-step-form">
                <div className="task-step-grid task-template-data-sticky">
                  <Form.Item label="模板版本" required>
                    <Select
                      value={form.template_id || undefined}
                      placeholder="请选择模板"
                      allowClear
                      onChange={(value) => {
                        setForm({ ...form, template_id: value ?? '' });
                        setMapping({});
                      }}
                      getPopupContainer={workspacePopupContainer}
                      options={templateSelectOptions}
                    />
                  </Form.Item>
                  <Form.Item label="数据集" required>
                    <Select
                      value={form.dataset_id || undefined}
                      placeholder="请选择数据集"
                      allowClear
                      onChange={(value) => setForm({ ...form, dataset_id: value ?? '' })}
                      getPopupContainer={workspacePopupContainer}
                      options={datasets.map((dataset) => ({ value: dataset.dataset_id, label: `${dataset.name} / ${dataset.row_count} 行` }))}
                    />
                  </Form.Item>
                </div>
                {selectedTemplate ? (
                  <>
                    <Descriptions
                      className="task-step-descriptions"
                      size="small"
                      column={2}
                      items={[
                        { label: '模板名称', children: selectedTemplate.name },
                        { label: '最新版本', children: `v${selectedTemplate.latest_version}` },
                        { label: '页签数量', children: selectedTemplate.tab_count },
                        { label: 'ShowItem', children: selectedTemplate.show_item_count },
                        { label: 'Mask 标注', children: imageMaskComponents.length },
                      ]}
                    />
                    {selectedTemplate && (
                      <Alert
                        className="task-step-inline-alert"
                        type="info"
                        showIcon
                        title="批注员 AI 辅助额度"
                        description={(
                          <Space className="task-llm-allowance-control" size={12} wrap>
                            <span>按批注员本次领取题数的</span>
                            <InputNumber
                              min={0}
                              max={100}
                              precision={0}
                              value={Number(form.labeling_ai_assist_percent || 0)}
                              onChange={(value) => setForm({ ...form, labeling_ai_assist_percent: String(toPercentInteger(value, 5)) })}
                            />
                            <span>% 计算，可用次数向上取整，默认 5%。{schemaHasLabelingAiAssist(selectedTemplate.schema) ? '' : '当前模板未检测到 LLM 辅助模块，添加该模块后生效。'}</span>
                          </Space>
                        )}
                      />
                    )}
                  </>
                ) : (
                  <Empty description={publishedTemplates.length ? '请选择一个已发布模板版本' : '当前没有可用的已发布模板'} />
                )}
                {selectedTemplate && selectedTemplate.status !== 'published' && (
                  <Alert
                    type="warning"
                    showIcon
                    title="当前绑定模板不是已发布状态"
                    description="可以继续查看和调整草稿配置；发布前请切换到已发布模板版本，否则发布检查会阻塞。"
                  />
                )}
                {selectedDataset ? (
                  <>
                    <Descriptions
                      className="task-step-descriptions"
                      size="small"
                      column={2}
                      items={[
                        { label: '数据集名称', children: selectedDataset.name },
                        { label: '行数', children: selectedDataset.row_count },
                        { label: '字段数', children: selectedDataset.columns.length },
                        { label: '可映射字段', children: selectedTemplateColumns.length },
                      ]}
                    />
                    {showItems.length > 0 ? (
                      <EnhancedTable<TemplateComponentSchema>
                        className="task-mapping-table"
                        rowKey="id"
                        size="small"
                        pagination={false}
                        tableLayout="fixed"
                        scroll={{ y: 290 }}
                        dataSource={showItems}
                        columns={[
                          {
                            title: '展示项',
                            dataIndex: 'label',
                            width: 170,
                            render: (_, component) => (
                              <span className="task-mapping-label">
                                <strong>{component.label}</strong>
                                <small>{component.field}</small>
                              </span>
                            ),
                          },
                          {
                            title: '数据映射',
                            width: 260,
                            render: (_, component) => (
                              <Select
                                mode="multiple"
                                value={showItemMappingOptionValues(component, effectiveMapping, effectiveBindingMapping)}
                                placeholder="选择一个或多个展示来源"
                                allowClear
                                maxTagCount="responsive"
                                onChange={(values) => updateShowItemDisplayBindings(component, values)}
                                getPopupContainer={() => document.body}
                                popupMatchSelectWidth={false}
                                options={selectedDataSourceOptions}
                              />
                            ),
                          },
                          {
                            title: '状态',
                            width: 120,
                            render: (_, component) => (
                              <Tag color={showItemMappingIsConfigured(component, effectiveMapping, effectiveBindingMapping) ? 'green' : 'default'}>
                                {showItemMappingIsConfigured(component, effectiveMapping, effectiveBindingMapping) ? `${showItemDisplayBindingsFromMapping(component, effectiveBindingMapping[component.id]).length || 1} 项` : '留空'}
                              </Tag>
                            ),
                          },
                        ]}
                      />
                    ) : (
                      <Empty description="当前模板没有 ShowItem，可直接保存并继续配置后续步骤" />
                    )}
                    {imageMaskComponents.length > 0 && (
                      <EnhancedTable<TemplateComponentSchema>
                        className="task-mapping-table"
                        rowKey="id"
                        size="small"
                        pagination={false}
                        tableLayout="fixed"
                        scroll={{ y: 220 }}
                        dataSource={imageMaskComponents}
                        columns={[
                          {
                            title: 'Mask 组件',
                            dataIndex: 'label',
                            width: 170,
                            render: (_, component) => (
                              <span className="task-mapping-label">
                                <strong>{component.label}</strong>
                                <small>{component.field}</small>
                              </span>
                            ),
                          },
                          {
                            title: '底图来源',
                            width: 260,
                            render: (_, component) => (
                              <Select
                                value={bindingToOptionValue(maskSourceMapping[component.id] ?? null) ?? undefined}
                                placeholder="选择图片列或行级图片媒体"
                                allowClear
                                onChange={(value) => updateMaskSourceBinding(component, value)}
                                getPopupContainer={() => document.body}
                                popupMatchSelectWidth={false}
                                options={selectedImageMaskSourceOptions}
                              />
                            ),
                          },
                          {
                            title: '状态',
                            width: 120,
                            render: (_, component) => (
                              <Tag color={maskSourceMapping[component.id] ? 'green' : 'default'}>
                                {maskSourceMapping[component.id] ? '已选择' : '必选'}
                              </Tag>
                            ),
                          },
                        ]}
                      />
                    )}
                    <Alert
                      type="success"
                      showIcon
                      title={`ShowItem 映射完成 ${mappedCount}/${showItems.length}${imageMaskComponents.length ? `，Mask 底图完成 ${maskMappedCount}/${imageMaskComponents.length}` : ''}`}
                      description="映射信息会同步到右侧发布摘要，保存草稿后仍可继续调整；图片 Mask 底图来源需要在发布任务时确认。"
                    />
                  </>
                ) : (
                  <Empty description="请选择数据集，系统会在同页完成 ShowItem 列映射" />
                )}
                {currentStepIssues.length > 0 && <Alert type="warning" showIcon title="模板与数据仍需完善" description={currentStepIssues.join('、')} />}
              </Form>
            )}
            {currentStep === 2 && (
              <Form layout="vertical" className="task-step-form">
                <div className="task-step-grid task-step-grid-review">
                  <Form.Item className="task-step-span" label="分发策略" required extra={distributionDescription(form.distribution)}>
                    <Radio.Group
                      options={taskDistributionOptions}
                      optionType="button"
                      buttonStyle="outline"
                      value={form.distribution}
                      onChange={(event) => {
                        const nextDistribution = event.target.value as 'first_come_all' | 'quota_grab';
                        setForm({
                          ...form,
                          distribution: nextDistribution,
                          share_enabled: nextDistribution === 'first_come_all' ? form.share_enabled : false,
                        });
                      }}
                    />
                  </Form.Item>
                  {isPackageFlow && (
                    <div className="task-step-span task-share-config">
                      <Form.Item label="分享功能">
                        <Switch
                          checked={form.share_enabled}
                          checkedChildren="生成分享链接"
                          unCheckedChildren="关闭分享"
                          onChange={(checked) => setForm({ ...form, share_enabled: checked, expire_hours: checked && !String(form.expire_hours).trim() ? '72' : form.expire_hours })}
                        />
                      </Form.Item>
                      {form.share_enabled && (
                        <Form.Item label="分享链接有效期（小时）" required>
                          <InputNumber
                            min={1}
                            max={720}
                            precision={0}
                            step={1}
                            value={normalizedShareExpireHours > 0 ? normalizedShareExpireHours : null}
                            onChange={(value) => setForm({ ...form, expire_hours: String(value ?? '') })}
                            style={{ width: '100%' }}
                          />
                        </Form.Item>
                      )}
                    </div>
                  )}
                  {isInternalFlow && (
                    <Form.Item className="task-step-span" label="指定企业 Labeler" extra="不选择则当前企业所有 active Labeler 均可在企业项目中看到并领取该任务。">
                      <Select
                        mode="multiple"
                        allowClear
                        showSearch
                        loading={labelerLoading}
                        value={form.internal_labeler_ids}
                        options={labelerOptions}
                        optionFilterProp="label"
                        placeholder="选择企业内 Labeler"
                        onChange={(values) => setForm((current) => ({
                          ...current,
                          internal_labeler_ids: values,
                          internal_labeler_allocations: normalizeLabelerAllocations(values, current.internal_labeler_allocations),
                        }))}
                        getPopupContainer={workspacePopupContainer}
                      />
                    </Form.Item>
                  )}
                  {isInternalFlow && form.internal_labeler_ids.length > 1 && (
                    <Form.Item className="task-step-span" label="Labeler 任务分配比例">
                      <div className="reviewer-allocation-list">
                        {labelerAllocationPreview.map((allocation) => (
                          <div className="reviewer-allocation-row" key={allocation.labeler_id}>
                            <span>
                              <strong>{reviewerDisplayLabel(allocation.labeler_id, labelerMembers)}</strong>
                              <small>{allocation.quota || 0}% · 约 {allocation.item_count ?? 0} 条</small>
                            </span>
                            <div className="reviewer-allocation-control">
                              <Space.Compact>
                                <InputNumber
                                  min={0}
                                  max={100}
                                  precision={0}
                                  step={1}
                                  value={allocation.quota === '' ? null : Number(allocation.quota)}
                                  placeholder="百分比"
                                  onChange={(value) => setForm((current) => ({
                                    ...current,
                                    internal_labeler_allocations: current.internal_labeler_allocations.map((item) => (
                                      item.labeler_id === allocation.labeler_id ? { ...item, quota: value === null ? '' : String(value) } : item
                                    )),
                                  }))}
                                />
                                <span className="task-input-unit-addon">%</span>
                              </Space.Compact>
                              <small className="reviewer-allocation-count">
                                {allocation.item_count === undefined ? (reviewItemTotal > 0 ? '待合计 100%' : '待选择数据集') : `约 ${allocation.item_count} 条`}
                              </small>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className={`reviewer-allocation-total ${labelerAllocationTotal === 100 ? 'is-valid' : 'is-invalid'}`}>
                        <span>合计 {labelerAllocationTotal}%</span>
                        <span>{reviewItemTotal > 0 ? `共 ${reviewItemTotal} 条，预览合计 ${labelerAllocationPreview.reduce((sum, item) => sum + (item.item_count ?? 0), 0)} 条` : '选择数据集后显示真实条目数预览'}</span>
                      </div>
                      {labelerAllocationTotal !== 100 && (
                        <Alert type="warning" showIcon title="多位 Labeler 的任务分配比例必须合计 100%。" />
                      )}
                    </Form.Item>
                  )}
                  {!isInternalFlow && (
                    <>
                      <Form.Item className="task-step-span" label="所需资质领域">
                        <Select
                          mode="multiple"
                          allowClear
                          placeholder="无要求"
                          value={parseList(form.required_certs)}
                          onChange={(values) => setForm({ ...form, required_certs: values.join(', ') })}
                          getPopupContainer={workspacePopupContainer}
                          options={taskQualificationDomainOptions}
                        />
                      </Form.Item>
                      <Form.Item label="最低完成任务数">
                        <InputNumber
                          min={0}
                          precision={0}
                          step={1}
                          value={form.min_completed_tasks === '' ? null : Number(form.min_completed_tasks)}
                          onChange={(value) => setForm({ ...form, min_completed_tasks: String(value ?? '') })}
                          style={{ width: '100%' }}
                        />
                      </Form.Item>
                      <Form.Item label="最低准确率（%）">
                        <InputNumber
                          min={0}
                          max={100}
                          precision={0}
                          step={1}
                          value={form.min_accuracy_rate === '' ? null : Number(form.min_accuracy_rate)}
                          onChange={(value) => setForm({ ...form, min_accuracy_rate: String(value ?? '') })}
                          style={{ width: '100%' }}
                        />
                      </Form.Item>
                      <Form.Item className="task-step-span" label="资质说明">
                        <Input
                          value={form.qualification_notes}
                          onChange={(event) => setForm({ ...form, qualification_notes: event.target.value })}
                          placeholder="例如需要法律合同标注经验"
                        />
                      </Form.Item>
                    </>
                  )}
                  {isInternalFlow ? (
                    <Alert
                      className="task-step-span"
                      type="info"
                      showIcon
                      title="企业内流转不分配积分"
                      description="企业内 Labeler 处理公司项目，不走任务广场公开积分任务领取与奖励分配；可在任务管理列表的更多菜单中继续调整指定 Labeler。"
                    />
                  ) : (
                    <>
                      <Form.Item className="task-step-span" label="奖励方式" required>
                        <Radio.Group
                          options={taskRewardModeOptions}
                          optionType="button"
                          buttonStyle="outline"
                          value={form.reward_mode}
                          onChange={(event) => setForm({ ...form, reward_mode: event.target.value })}
                        />
                      </Form.Item>
                      {form.reward_mode === 'item' ? (
                        <Form.Item label="标注员每条获得积分" required>
                          <InputNumber
                            min={0}
                            precision={0}
                            step={1}
                            value={form.points_per_item === '' ? null : Number(form.points_per_item)}
                            onChange={(value) => setForm({ ...form, points_per_item: String(value ?? '') })}
                            placeholder="填写标注员实际获得积分"
                            style={{ width: '100%' }}
                          />
                        </Form.Item>
                      ) : (
                        <Form.Item label="任务总奖励积分" required>
                          <InputNumber
                            min={0}
                            precision={0}
                            step={1}
                            value={form.total_points === '' ? null : Number(form.total_points)}
                            onChange={(value) => setForm({ ...form, total_points: String(value ?? '') })}
                            placeholder="填写标注员可获得的总奖励积分"
                            style={{ width: '100%' }}
                          />
                        </Form.Item>
                      )}
                    </>
                  )}
                </div>
                {!isInternalFlow && <RewardCostPanel summary={rewardCost} variant="detail" />}
                {currentStepIssues.length > 0 && <Alert type="warning" showIcon title="分发与奖励仍需完善" description={currentStepIssues.join('、')} />}
              </Form>
            )}
            {currentStep === 3 && (
              <Form layout="vertical" className="task-step-form">
                <section className="ai-review-config-block">
                  <div className="ai-review-block-head">
                    <div>
                      <h3>预审开关与 Provider</h3>
                      <p>选择企业资源配置中的可用 Provider；Provider 已包含 Base URL、API Key、Temperature 和对应模型。</p>
                    </div>
                    <Switch
                      checked={form.ai_enabled}
                      checkedChildren="开启"
                      unCheckedChildren="关闭"
                      onChange={(checked) => setForm({ ...form, ai_enabled: checked })}
                    />
                  </div>
                  {form.ai_enabled ? (
                    <div className="ai-provider-stack">
                      <Form.Item label="AI Provider" required>
                        <Select
                          loading={aiProviderLoading}
                          value={form.ai_provider_id || undefined}
                          placeholder="选择企业已配置 Provider"
                          onChange={(value) => {
                            const provider = aiProviders.find((item) => item.provider_id === value);
                            setForm({
                              ...form,
                              ai_provider_id: value,
                              ai_model: resolveAiProviderModel(provider ?? null),
                              ai_input_confirmed: false,
                              ai_matrix_confirmed: false,
                            });
                          }}
                          getPopupContainer={workspacePopupContainer}
                          options={aiReviewProviderOptions}
                        />
                      </Form.Item>
                      {selectedAiProvider?.scope === 'platform' && aiWalletBalance !== null && aiWalletBalance <= 0 ? (
                        <Alert
                          type="warning"
                          showIcon
                          title="平台共享路由会从企业 AI 钱包扣费，当前余额不足，请先到资源配置页充值。"
                        />
                      ) : null}
                      {selectedAiProvider ? (
                        <Descriptions
                          className="task-step-descriptions ai-provider-descriptions"
                          size="small"
                          column={3}
                          items={[
                            { label: 'Provider', children: <Tag color="blue">{selectedAiProvider.provider}</Tag> },
                            { label: '模型', children: selectedAiProviderModel || '由 Provider 决定' },
                            { label: '作用域', children: selectedAiProvider.scope === 'platform' ? '平台级' : '企业级' },
                            { label: 'Base URL', children: selectedAiProvider.api_base ? '已配置' : '未填写' },
                            { label: 'API Key', children: selectedAiProvider.api_key_configured ? '已配置' : '未配置' },
                            { label: '状态', children: selectedAiProvider.status === 'enabled' ? '可用' : selectedAiProvider.status },
                          ]}
                        />
                      ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可用 Provider，请先在资源配置中启用企业 AI Provider" />
                      )}
                      {selectedAiProviderWarning && <Alert type="warning" showIcon title={selectedAiProviderWarning} />}
                    </div>
                  ) : (
                    <Alert type="info" showIcon title="AI 预审未开启" description="未开启时任务会直接进入人工复审或后续质量抽检流程。" />
                  )}
                </section>
                {form.ai_enabled && (
                  <>
                    <section className="ai-review-config-block">
                      <div className="ai-review-block-head">
                        <div>
                          <h3>审核维度</h3>
                          <p>先选择预设维度，也可以补充业务自定义维度。</p>
                        </div>
                        <Tag color={selectedAiDimensions.length ? 'blue' : 'default'}>{selectedAiDimensions.length} 项</Tag>
                      </div>
                      <Checkbox.Group
                        className="ai-dimension-checkboxes"
                        value={form.ai_selected_dimensions}
                        options={aiReviewPresetDimensions.map((dimension) => ({ label: dimension, value: dimension }))}
                        onChange={(values) => setForm({ ...form, ai_selected_dimensions: values.map(String), ai_matrix_confirmed: false })}
                      />
                      <Space.Compact className="ai-custom-dimension-input">
                        <Input
                          value={form.ai_custom_dimension_input}
                          placeholder="添加自定义审核维度，例如：医学术语准确性"
                          onChange={(event) => setForm({ ...form, ai_custom_dimension_input: event.target.value })}
                          onPressEnter={addCustomAiDimension}
                        />
                        <AntButton icon={<PlusOutlined />} onClick={addCustomAiDimension}>添加</AntButton>
                      </Space.Compact>
                      {form.ai_custom_dimensions.length > 0 && (
                        <div className="ai-dimension-tags">
                          {form.ai_custom_dimensions.map((dimension) => (
                            <Tag key={dimension} closable onClose={() => removeCustomAiDimension(dimension)} color="blue">{dimension}</Tag>
                          ))}
                        </div>
                      )}
                    </section>
                    <section className="ai-review-config-block">
                      <div className="ai-review-block-head">
                        <div>
                          <h3>Input 字段说明</h3>
                          <p>由 AI 根据数据集、模板名称、字段样例和映射上下文推断字段含义；不直接把变量名当作语义说明。</p>
                        </div>
                        <Space>
                          <AntButton
                            icon={<RobotOutlined />}
                            loading={aiInputGenerating}
                            onClick={generateAiInputPrompt}
                          >
                            {form.ai_input_prompt ? 'AI 重新生成' : 'AI 生成字段说明'}
                          </AntButton>
                          <AntButton
                            type={form.ai_input_confirmed ? 'default' : 'primary'}
                            icon={form.ai_input_confirmed ? <EditOutlined /> : <CheckCircleOutlined />}
                            disabled={!form.ai_input_prompt.trim()}
                            onClick={() => setForm(form.ai_input_confirmed
                              ? { ...form, ai_input_confirmed: false }
                              : { ...form, ai_input_confirmed: true })}
                          >
                            {form.ai_input_confirmed ? '修改字段' : '确认字段'}
                          </AntButton>
                        </Space>
                      </div>
                      {form.ai_input_prompt ? (
                        <Input.TextArea
                          value={form.ai_input_prompt}
                          onChange={(event) => setForm({ ...form, ai_input_prompt: event.target.value, ai_input_confirmed: false, ai_matrix_confirmed: false })}
                          autoSize={{ minRows: 5, maxRows: 8 }}
                        />
                      ) : (
                        <Empty description="选择模板与数据集后生成字段说明" />
                      )}
                    </section>
                    {form.ai_input_prompt ? (form.ai_input_confirmed ? <Alert type="success" showIcon title="字段说明已确认" /> : <Alert type="warning" showIcon title="字段说明未确认" description="生成或编辑字段说明后需要点击确认字段，AI 预审步骤才算完成。" />) : null}
                    <section className="ai-review-config-block">
                      <div className="ai-review-block-head">
                        <div>
                          <h3>审核评分矩阵</h3>
                          <p>用户选择审核维度后，由 AI 生成定义、评分标准、扣分规则、打回条件和人工复核条件，发布前需要确认。</p>
                        </div>
                        <Space>
                          <AntButton icon={<RobotOutlined />} loading={aiMatrixGenerating} disabled={selectedAiDimensions.length === 0} onClick={generateAiReviewMatrix}>
                            {form.ai_review_matrix.length ? 'AI 重新生成' : 'AI 生成矩阵'}
                          </AntButton>
                          <AntButton
                            type={form.ai_matrix_confirmed ? 'default' : 'primary'}
                            icon={form.ai_matrix_confirmed ? <EditOutlined /> : <CheckCircleOutlined />}
                            disabled={form.ai_review_matrix.length === 0}
                            onClick={() => setForm(form.ai_matrix_confirmed
                              ? { ...form, ai_matrix_confirmed: false }
                              : { ...form, ai_matrix_confirmed: true, ai_prompt: aiFinalPrompt })}
                          >
                            {form.ai_matrix_confirmed ? '修改矩阵' : '确认矩阵'}
                          </AntButton>
                        </Space>
                      </div>
                      {form.ai_review_matrix.length ? (
                        <EnhancedTable<AiReviewMatrixRow>
                          className="ai-review-matrix-table"
                          rowKey="key"
                          size="small"
                          pagination={false}
                          tableLayout="fixed"
                          scroll={{ y: 360 }}
                          dataSource={form.ai_review_matrix}
                          columns={[
                            { title: '维度', dataIndex: 'dimension', width: 110, fixed: 'left', render: (value) => <Tag color="blue">{value}</Tag> },
                            {
                              title: '定义',
                              dataIndex: 'definition',
                              width: 220,
                              render: (_, row) => form.ai_matrix_confirmed
                                ? <span className="ai-review-matrix-preview-text">{row.definition || '-'}</span>
                                : <Input.TextArea value={row.definition} autoSize={{ minRows: 2, maxRows: 4 }} onChange={(event) => updateAiMatrixRow(row.key, 'definition', event.target.value)} />,
                            },
                            {
                              title: '评分标准',
                              dataIndex: 'scoring_standard',
                              width: 260,
                              render: (_, row) => form.ai_matrix_confirmed
                                ? <span className="ai-review-matrix-preview-text">{row.scoring_standard || '-'}</span>
                                : <Input.TextArea value={row.scoring_standard} autoSize={{ minRows: 2, maxRows: 4 }} onChange={(event) => updateAiMatrixRow(row.key, 'scoring_standard', event.target.value)} />,
                            },
                            {
                              title: '扣分规则',
                              dataIndex: 'deduction_rule',
                              width: 260,
                              render: (_, row) => form.ai_matrix_confirmed
                                ? <span className="ai-review-matrix-preview-text">{row.deduction_rule || '-'}</span>
                                : <Input.TextArea value={row.deduction_rule} autoSize={{ minRows: 2, maxRows: 4 }} onChange={(event) => updateAiMatrixRow(row.key, 'deduction_rule', event.target.value)} />,
                            },
                            {
                              title: '打回条件',
                              dataIndex: 'reject_condition',
                              width: 240,
                              render: (_, row) => form.ai_matrix_confirmed
                                ? <span className="ai-review-matrix-preview-text">{row.reject_condition || '-'}</span>
                                : <Input.TextArea value={row.reject_condition} autoSize={{ minRows: 2, maxRows: 4 }} onChange={(event) => updateAiMatrixRow(row.key, 'reject_condition', event.target.value)} />,
                            },
                            {
                              title: '人工复核条件',
                              dataIndex: 'manual_condition',
                              width: 260,
                              render: (_, row) => form.ai_matrix_confirmed
                                ? <span className="ai-review-matrix-preview-text">{row.manual_condition || '-'}</span>
                                : <Input.TextArea value={row.manual_condition} autoSize={{ minRows: 2, maxRows: 4 }} onChange={(event) => updateAiMatrixRow(row.key, 'manual_condition', event.target.value)} />,
                            },
                          ]}
                        />
                      ) : (
                        <Empty description="勾选审核维度后生成评分矩阵" />
                      )}
                      {form.ai_matrix_confirmed ? <Alert type="success" showIcon title="评分矩阵已确认" /> : <Alert type="warning" showIcon title="评分矩阵未确认" description="生成或编辑矩阵后需要点击确认矩阵，发布 payload 才会标识为已确认。" />}
                    </section>
                    <section className="ai-review-config-block">
                      <div className="ai-review-block-head">
                        <div>
                          <h3>自动判定阈值</h3>
                          <p>模型输出各维度得分后，系统按总分进入通过、打回或人工复核区间。</p>
                        </div>
                        <Tag color={aiThresholdsValid ? 'green' : 'orange'}>{aiThresholdsValid ? '区间有效' : '待调整'}</Tag>
                      </div>
                      <div className="task-step-grid">
	                        <Form.Item label="建议打回阈值（低于）">
	                          <Space.Compact style={{ width: '100%' }}>
	                            <InputNumber min={0} max={100} precision={0} step={1} value={Number(form.ai_reject_threshold || 0)} onChange={(value) => setForm({ ...form, ai_reject_threshold: String(value ?? '') })} style={{ width: '100%' }} />
	                            <span className="task-input-unit-addon">%</span>
	                          </Space.Compact>
	                        </Form.Item>
	                        <Form.Item label="建议通过阈值（含）">
	                          <Space.Compact style={{ width: '100%' }}>
	                            <InputNumber min={0} max={100} precision={0} step={1} value={Number(form.ai_pass_threshold || 0)} onChange={(value) => setForm({ ...form, ai_pass_threshold: String(value ?? ''), ai_threshold: String(value ?? '') })} style={{ width: '100%' }} />
	                            <span className="task-input-unit-addon">%</span>
	                          </Space.Compact>
	                        </Form.Item>
                      </div>
                      <Descriptions
                        className="task-step-descriptions"
                        size="small"
                        column={3}
                        items={[
                          { label: '打回', children: `总分 < ${aiRejectThreshold}%` },
                          { label: '通过', children: `总分 >= ${aiPassThreshold}%` },
                          { label: '人工复核', children: aiManualRangeText },
                        ]}
                      />
                    </section>
                  </>
                )}
                {currentStepIssues.length > 0 && <Alert type="warning" showIcon title="AI 预审仍需完善" description={currentStepIssues.join('、')} />}
              </Form>
            )}
            {currentStep === 4 && (
              <Form layout="vertical" className="task-step-form">
                <div className="task-step-grid task-step-grid-review">
                  <Form.Item className="task-step-span" label="人工复审 Reviewer">
                    <Select
                      mode="multiple"
                      allowClear
                      showSearch
                      loading={reviewerLoading}
                      value={form.reviewer_ids}
                      options={reviewerOptions}
                      optionFilterProp="label"
                      placeholder="选择企业内可用审核员，可留空后续分配"
                      onChange={(values) => setForm((current) => ({
                        ...current,
                        reviewer_ids: values,
                        review_allocations: normalizeReviewerAllocations(values, current.review_allocations),
                      }))}
                    />
                  </Form.Item>
                  {form.reviewer_ids.length > 1 && (
                    <Form.Item className="task-step-span" label="审核员百分比分配">
                      <div className="reviewer-allocation-list">
                        {reviewerAllocationPreview.map((allocation) => (
                          <div className="reviewer-allocation-row" key={allocation.reviewer_id}>
                            <span>
                              <strong>{reviewerDisplayLabel(allocation.reviewer_id, reviewerMembers)}</strong>
                              <small>{allocation.quota || 0}% · 约 {allocation.item_count ?? 0} 条</small>
                            </span>
                            <div className="reviewer-allocation-control">
                              <Space.Compact>
                                <InputNumber
                                  min={0}
                                  max={100}
                                  precision={0}
                                  step={1}
                                  value={allocation.quota === '' ? null : Number(allocation.quota)}
                                  placeholder="百分比"
                                  onChange={(value) => setForm((current) => ({
                                    ...current,
                                    review_allocations: current.review_allocations.map((item) => (
                                      item.reviewer_id === allocation.reviewer_id ? { ...item, quota: value === null ? '' : String(value) } : item
                                    )),
                                  }))}
                                />
                                <span className="task-input-unit-addon">%</span>
                              </Space.Compact>
                              <small className="reviewer-allocation-count">
                                {allocation.item_count === undefined ? (reviewItemTotal > 0 ? '待合计 100%' : '待选择数据集') : `约 ${allocation.item_count} 条`}
                              </small>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className={`reviewer-allocation-total ${reviewerAllocationTotal === 100 ? 'is-valid' : 'is-invalid'}`}>
                        <span>合计 {reviewerAllocationTotal}%</span>
                        <span>{reviewItemTotal > 0 ? `共 ${reviewItemTotal} 条，预览合计 ${reviewerAllocationPreview.reduce((sum, item) => sum + (item.item_count ?? 0), 0)} 条` : '选择数据集后显示真实条目数预览'}</span>
                      </div>
                      {reviewerAllocationTotal !== 100 && (
                        <Alert type="warning" showIcon title="多位 Reviewer 的工作量百分比必须合计 100%。" />
                      )}
                    </Form.Item>
                  )}
                </div>
                {reviewerMembers.length === 0 && (
                  <Alert
                    type="warning"
                    showIcon
                    title="当前团队暂无可选 Reviewer"
                    description="请先在人员管理中添加或启用 Reviewer，任务进入复审后仍可由管理员或负责人补分配。"
                  />
                )}
              </Form>
            )}
            {currentStep === 5 && (
              <Form layout="vertical" className="task-step-form task-agreement-form">
                <div className="task-step-grid">
                  <Form.Item className="task-step-span" label="领取前协议">
                    <Switch
                      checked={form.agreement_required}
                      checkedChildren="需要同意"
                      unCheckedChildren="不要求"
                      onChange={(checked) => setForm({ ...form, agreement_required: checked })}
                    />
                  </Form.Item>
                  <Form.Item className="task-step-span">
                    <Checkbox
                      checked={form.agreement_use_default}
                      disabled={!form.agreement_required}
                      onChange={(event) => setForm({
                        ...form,
                        agreement_use_default: event.target.checked,
                        agreement_text: event.target.checked ? defaultTaskAgreementText : form.agreement_text,
                      })}
                    >
                      使用默认任务用户协议模板
                    </Checkbox>
                  </Form.Item>
                  <Form.Item className="task-step-span" label="协议正文">
                    <Input.TextArea
                      disabled={!form.agreement_required || form.agreement_use_default}
                      value={form.agreement_use_default ? defaultTaskAgreementText : form.agreement_text}
                      onChange={(event) => setForm({ ...form, agreement_text: event.target.value })}
                      autoSize={{ minRows: 8, maxRows: 12 }}
                      placeholder="填写标注员领取任务前需要阅读并同意的协议内容"
                    />
                  </Form.Item>
                  <Form.Item className="task-step-span" label="上传协议文件">
                    <Upload
                      accept=".txt,.md,.markdown,.csv,.json,.jsonl,.html,.htm,.text,text/*,application/json"
                      maxCount={1}
                      beforeUpload={parseAgreementFileToText}
                      onRemove={() => {
                        setForm({ ...form, agreement_file_name: '', agreement_text: form.agreement_use_default ? defaultTaskAgreementText : form.agreement_text });
                        return true;
                      }}
                    >
                      <AntButton icon={<UploadOutlined />} disabled={!form.agreement_required}>选择协议文件</AntButton>
                    </Upload>
                  </Form.Item>
                </div>
              </Form>
            )}
            {currentStep === 6 && (
              <div className="task-step-final">
                <Alert
                  type="info"
                  showIcon
                  title="发布前检查"
                  description="确认后会锁定模板、数据集、分发资质、奖励、AI 预审、人工复审和用户协议配置，并生成题目。"
                />
                {publishIssues.length > 0 && <Alert type="error" showIcon title="发布前需处理" description={publishIssues.join('、')} />}
                <Descriptions
                  className="task-step-descriptions"
                  size="small"
                  column={2}
                  items={[
                    { label: '任务标题', children: form.title || '未填写' },
                    { label: '模板', children: selectedTemplate?.name || '未选择' },
                    { label: '数据集', children: selectedDataset ? `${selectedDataset.name} / ${selectedDataset.row_count} 行` : '未选择' },
                    { label: '截止日期', children: deadlineSummaryLabel },
                    { label: '映射完成', children: `${mappedCount}/${showItems.length}` },
                    { label: '分发策略', children: distributionLabel(form.distribution) },
                    { label: '分享功能', children: isPackageFlow ? (form.share_enabled ? `已开启 / ${normalizedShareExpireHours > 0 ? normalizedShareExpireHours : 72} 小时` : '未开启') : '不适用' },
                    { label: '企业 Labeler', children: isInternalFlow ? internalLabelerSummary(form.internal_labeler_ids, labelerMembers) : '不适用' },
                    { label: 'Labeler 分配', children: isInternalFlow ? internalLabelerAllocationSummaryLabel(form.internal_labeler_ids, form.internal_labeler_allocations) : '不适用' },
                    { label: '奖励方式', children: isInternalFlow ? '不分配积分' : rewardCost.rewardMode === 'task' ? '按任务折算' : '按条' },
                    { label: 'AI 预审', children: aiReviewSummaryLabel(form.ai_enabled, form.ai_pass_threshold, selectedAiDimensions.length, form.ai_input_confirmed && form.ai_matrix_confirmed) },
                    { label: '人工复审', children: manualReviewSummaryLabel(form.reviewer_ids, form.review_allocations) },
                    { label: '用户协议', children: form.agreement_required ? (form.agreement_use_default ? '默认协议' : form.agreement_file_name || '自定义文本') : '不要求' },
                  ]}
                />
                <TaskDifficultyEvaluationPanel
                  difficulty={form.difficulty}
                  evaluation={difficultyEvaluation}
                  evaluating={difficultyEvaluating}
                  missingFields={difficultyMissingFields}
                  onEvaluate={() => void runDifficultyEvaluation()}
                />
                {!isInternalFlow && <RewardCostPanel summary={rewardCost} variant="confirm" />}
                {sharePreview && (
                  <div className="assignment-result">
                    {qrSvg ? <img src={qrSvg} alt="分享二维码" className="assignment-qr" /> : <div className="fake-qr" aria-label="分享二维码">{sharePreview.qrText}</div>}
                    <div>
                      <strong>分享链接</strong>
                      <a className="assignment-share-link" href={sharePreview.url} target="_blank" rel="noreferrer">{sharePreview.url}</a>
                      {sharePreview.expireAt && <small>有效期至 {sharePreview.expireAt}</small>}
                      <AntButton size="small" icon={<EyeOutlined />} href={sharePreview.url} target="_blank" rel="noreferrer">
                        预览分享链接
                      </AntButton>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="task-step-stage-footer">
            <AntButton icon={<ArrowLeftOutlined />} disabled={currentStep === 0} onClick={() => gotoStep(currentStep - 1)}>
              上一步
            </AntButton>
            <TaskPublishAiAssistant
              team={team}
              draftTaskId={task?.task_id ?? null}
              context={taskPublishAiContext}
              form={form}
              mapping={mapping}
              providers={aiProviders}
              loadingProviders={aiProviderLoading}
              placement="inline"
              onApplyDraft={applyTaskPublishAiDraft}
              uploadAttachment={async (file) => {
                const uploaded = await uploadFile(team.team_id, file, 'document');
                return {
                  id: uploaded.file_id,
                  name: uploaded.filename,
                  url: uploaded.url,
                  type: uploaded.content_type,
                };
              }}
            />
            <Space>
              <AntButton icon={<SaveOutlined />} loading={savingDraft} onClick={() => void saveDraft({ returnToList: true })}>
                手动保存
              </AntButton>
              {currentStep < taskPublishSteps.length - 1 ? (
                <AntButton
                  type="primary"
                  icon={<ArrowRightOutlined />}
                  disabled={!currentStepReady}
                  onClick={() => gotoStep(currentStep + 1)}
                >
                  下一步
                </AntButton>
              ) : (
                <AntButton
                  type="primary"
                  icon={<RocketOutlined />}
                  loading={publishing}
                  onClick={() => void requestPublish()}
                >
                  发布任务
                </AntButton>
              )}
            </Space>
          </div>
        </section>
        <aside className="task-summary-panel" aria-label="发布摘要">
          <div className="task-summary-header">
            <div>
              <p className="section-kicker">Summary</p>
              <h2>发布摘要</h2>
            </div>
            <Tag className="task-auto-save-tag" color={autoSaveState === 'saved' ? 'blue' : autoSaveState === 'error' ? 'red' : autoSaveState === 'saving' ? 'processing' : 'default'}>
              {autoSaveState === 'saving' ? '自动保存中' : autoSaveState === 'saved' ? '已自动保存' : autoSaveState === 'blocked' ? '待补充' : autoSaveState === 'error' ? '自动保存失败' : '未保存'}
            </Tag>
          </div>
          <Progress percent={publishProgress} size="small" showInfo={false} />
          <div className="task-summary-current">
            <span>当前步骤</span>
            <strong>{currentStepTitle}</strong>
            <small>{currentStepDescription}</small>
          </div>
          {publishIssues.length > 0 && (
            <div className="task-summary-blockers" title={publishIssues.join('、')}>
              <strong>{publishIssues.length}</strong>
              <span>项发布阻塞</span>
            </div>
          )}
          <div className="task-summary-stack task-summary-compact">
            <section className="task-summary-section">
              <div className="task-summary-section-head">
                <strong>基础信息</strong>
                <Tag color={summaryCompletion[0] ? 'green' : 'default'}>{summaryCompletion[0] ? '已完成' : '待完成'}</Tag>
              </div>
              <div className="task-summary-lines">
                <span><em>标题</em><strong>{form.title || '未填写'}</strong></span>
                <span><em>分类</em><strong>{taskCategoryValuesLabel(form.category_values)} / {taskDifficultyOptions.find((item) => item.value === form.difficulty)?.label || '未选择'}</strong></span>
                <span><em>截止</em><strong>{deadlineSummaryLabel}</strong></span>
                <span><em>时限</em><strong>{form.completion_hours ? `领取后 ${form.completion_hours} 小时内` : '不限制'}</strong></span>
              </div>
            </section>
            <section className="task-summary-section">
              <div className="task-summary-section-head">
                <strong>模板与数据</strong>
                <Tag color={summaryCompletion[1] ? 'green' : 'default'}>{summaryCompletion[1] ? '已完成' : '待完成'}</Tag>
              </div>
              <div className="task-summary-lines">
                <span><em>模板</em><strong>{selectedTemplate?.name || '未选择'}</strong></span>
                <span><em>数据</em><strong>{selectedDataset ? `${selectedDataset.name} / ${selectedDataset.row_count} 行` : '未选择'}</strong></span>
                <span><em>映射</em><strong>{mappedCount}/{showItems.length}</strong></span>
              </div>
            </section>
            <section className="task-summary-section">
              <div className="task-summary-section-head">
                <strong>分发与奖励</strong>
                <Tag color={summaryCompletion[2] ? 'green' : 'default'}>{summaryCompletion[2] ? '已完成' : '待完善'}</Tag>
              </div>
              <div className="task-summary-lines">
                <span><em>分发</em><strong>{distributionLabel(form.distribution)}</strong></span>
                {isPackageFlow && <span><em>分享</em><strong>{form.share_enabled ? `已开启 / ${normalizedShareExpireHours > 0 ? normalizedShareExpireHours : 72} 小时` : '未开启'}</strong></span>}
                {isInternalFlow && <span><em>Labeler</em><strong>{internalLabelerSummary(form.internal_labeler_ids, labelerMembers)}</strong></span>}
                {isInternalFlow && <span><em>分配</em><strong>{internalLabelerAllocationSummaryLabel(form.internal_labeler_ids, form.internal_labeler_allocations)}</strong></span>}
                {isInternalFlow
                  ? <span><em>奖励</em><strong>不分配积分</strong></span>
                  : <RewardCostPanel summary={rewardCost} variant="summary" />}
                {!isInternalFlow && <span><em>资质</em><strong>{parseList(form.required_certs).length ? `${parseList(form.required_certs).length} 项` : '未设置'}</strong></span>}
                {!isInternalFlow && <span><em>门槛</em><strong>{qualificationThresholdLabel(form.min_completed_tasks, form.min_accuracy_rate)}</strong></span>}
              </div>
            </section>
            <section className="task-summary-section">
              <div className="task-summary-section-head">
                <strong>审核与协议</strong>
                <Tag color={summaryCompletion[3] && summaryCompletion[4] && summaryCompletion[5] ? 'green' : 'default'}>{summaryCompletion[3] && summaryCompletion[4] && summaryCompletion[5] ? '已完成' : '待完善'}</Tag>
              </div>
              <div className="task-summary-lines">
                <span><em>AI</em><strong>{aiReviewSummaryLabel(form.ai_enabled, form.ai_pass_threshold, selectedAiDimensions.length, form.ai_input_confirmed && form.ai_matrix_confirmed)}</strong></span>
                <span><em>人工</em><strong>{manualReviewSummaryLabel(form.reviewer_ids, form.review_allocations)}</strong></span>
                <span><em>协议</em><strong>{form.agreement_required ? (form.agreement_use_default ? '默认协议' : form.agreement_file_name || '自定义文本') : '不要求'}</strong></span>
              </div>
            </section>
            <section className="task-summary-section task-summary-difficulty-section">
              <div className="task-summary-section-head">
                <strong>任务难度</strong>
                <Tag color={form.difficulty ? 'green' : 'default'}>{form.difficulty ? '已评估' : '待评估'}</Tag>
              </div>
              <TaskDifficultyEvaluationPanel
                difficulty={form.difficulty}
                evaluation={difficultyEvaluation}
                evaluating={difficultyEvaluating}
                missingFields={difficultyMissingFields}
                onEvaluate={() => void runDifficultyEvaluation()}
                compact
              />
            </section>
          </div>
          {task?.status === 'draft' && <Alert type="success" showIcon title="草稿已保存" />}
        </aside>
      </section>
      <Modal
        title="发布前检查"
        open={publishCheckOpen}
        okText="确认发布"
        cancelText="继续编辑"
        confirmLoading={publishing}
        okButtonProps={{ disabled: !canPublish || readiness?.ready === false }}
        onOk={confirmPublish}
        onCancel={() => setPublishCheckOpen(false)}
      >
        <div className="publish-check-modal">
          <p>发布会锁定模板、数据集、分发资质、奖励、AI 预审、人工复审和用户协议配置。</p>
          {readiness && Array.isArray(readiness.checks) ? (
            <>
              <ul>
                {readiness.checks.map((item) => <li key={item.key} className={item.status === 'pass' ? 'pass' : 'block'}>{item.label}：{item.message}</li>)}
                {(readiness.warnings || []).map((item) => <li key={item.key} className="warning">{item.label}：{item.message}</li>)}
              </ul>
              {(readiness.blockers || []).length > 0 && <Alert type="error" showIcon title="仍有阻塞项" description={(readiness.blockers || []).map((item) => item.message).join('、')} />}
            </>
          ) : (
            <>
              <ul>
                <li className={form.title.trim().length >= 2 ? 'pass' : 'block'}>基础信息：{form.title.trim().length >= 2 ? '通过' : '任务标题至少 2 个字符'}</li>
                <li className={form.deadline_long_term || form.deadline ? 'pass' : 'block'}>截止日期：{deadlineSummaryLabel}</li>
                <li className={form.template_id ? 'pass' : 'block'}>模板：{form.template_id ? selectedTemplate?.name || '已选择' : '请选择模板'}</li>
                <li className={form.dataset_id ? 'pass' : 'block'}>数据集：{form.dataset_id ? `${selectedDataset?.row_count ?? 0} 行` : '请选择数据集'}</li>
                <li className={mappedCount === showItems.length ? 'pass' : 'block'}>列映射：{mappedCount}/{showItems.length}</li>
                <li className={isInternalFlow || rewardCost.canCalculate ? 'pass' : 'block'}>
                  费用：{isInternalFlow ? '企业内流转不分配积分' : rewardCost.canCalculate ? '奖励与平台手续费已计算' : rewardCost.needsStandardItemCount ? '选择数据集后计算标准条数' : '请填写标注员实际获得积分'}
                </li>
                <li className={aiConfigComplete ? 'pass' : 'block'}>
                  AI：{form.ai_enabled ? '已开启' : '未开启'}
                  {form.ai_enabled && !form.ai_provider_id ? '，缺少 Provider' : ''}
                  {form.ai_enabled && selectedAiDimensions.length === 0 ? '，缺少维度' : ''}
                  {form.ai_enabled && form.ai_review_matrix.length === 0 ? '，缺少评分矩阵' : ''}
                  {form.ai_enabled && form.ai_input_prompt.trim() && !form.ai_input_confirmed ? '，字段未确认' : ''}
                  {form.ai_enabled && form.ai_review_matrix.length > 0 && !form.ai_matrix_confirmed ? '，矩阵未确认' : ''}
                  {form.ai_enabled && !aiThresholdsValid ? '，阈值区间无效' : ''}
                </li>
              </ul>
              {publishIssues.length > 0 && <Alert type="error" showIcon title="仍有阻塞项" description={publishIssues.join('、')} />}
            </>
          )}
          {!isInternalFlow && <RewardCostPanel summary={rewardCost} variant="confirm" />}
        </div>
      </Modal>
    </main>
  );
}

function PreviewTable({
  datasetId,
  rows,
  columns,
  columnWidths,
  currentPage,
  pageSize,
  onColumnWidthChange,
  onPageChange,
}: {
  datasetId: string;
  rows: Array<Record<string, unknown>>;
  columns: DatasetColumn[];
  columnWidths: Record<string, number>;
  currentPage: number;
  pageSize: number;
  onColumnWidthChange: (columnName: string, width: number) => void;
  onPageChange: (page: number, pageSize: number) => void;
}) {
  const visibleColumns = columns.slice(0, 12);
  const tableShellRef = useRef<HTMLDivElement | null>(null);
  const [tableSize, setTableSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const node = tableShellRef.current;
    if (!node) return undefined;
    let mounted = true;
    const updateSize = () => {
      if (!mounted) return;
      const rect = node.getBoundingClientRect();
      const next = {
        width: Math.max(0, Math.floor(rect.width)),
        height: Math.max(0, Math.floor(rect.height)),
      };
      setTableSize((current) => {
        if (current.width === next.width && current.height === next.height) return current;
        return next;
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    window.addEventListener('resize', updateSize);
    return () => {
      mounted = false;
      observer.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);
  const startResize = (event: ReactPointerEvent<HTMLSpanElement>, column: DatasetColumn) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnWidths[column.name] ?? defaultColumnWidth(column);
    const onPointerMove = (moveEvent: PointerEvent) => {
      onColumnWidthChange(column.name, startWidth + moveEvent.clientX - startX);
    };
    const onPointerUp = () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  };
  const tableColumns = visibleColumns.map((column) => {
    const width = columnWidths[column.name] ?? defaultColumnWidth(column);
    return {
      title: (
        <span className="preview-column-head">
          <span className="preview-column-title">{column.name}<em>{column.data_type}</em></span>
          <span
            className="preview-column-resizer"
            role="separator"
            aria-label={`调整 ${column.name} 列宽`}
            aria-orientation="vertical"
            onPointerDown={(event) => startResize(event, column)}
            onDoubleClick={() => onColumnWidthChange(column.name, autoColumnWidth(column, rows))}
          />
        </span>
      ),
      dataIndex: column.name,
      key: column.name,
      width,
      onHeaderCell: () => ({ style: { width, minWidth: width, maxWidth: width } }),
      onCell: (record: Record<string, unknown>) => ({
        style: { width, minWidth: width, maxWidth: width },
        title: cellText(record[column.name]),
      }),
      render: (value: unknown, record: Record<string, unknown>) => renderPreviewCell(value, column, record),
    };
  });
  const safePage = Math.min(Math.max(1, currentPage), Math.max(1, Math.ceil(rows.length / pageSize)));
  const dataSource = rows.map((row, index) => ({ __rowKey: `${datasetId}-${index}`, ...row }));
  const totalWidth = visibleColumns.reduce((total, column) => total + (columnWidths[column.name] ?? defaultColumnWidth(column)), 0);
  const scrollX = Math.max(totalWidth, tableSize.width || 640, 640);
  const scrollY = Math.max(360, (tableSize.height || 560) - 118);

  return (
    <div className="dataset-preview-fixed-table workspace-fixed-table-panel" ref={tableShellRef}>
      <Table
        className="workspace-fixed-table preview-table resizable-preview-table dataset-preview-ant-table"
        size="small"
        pagination={{
          current: safePage,
          pageSize,
          total: rows.length,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50'],
          onChange: onPageChange,
          onShowSizeChange: onPageChange,
          showTotal: (total) => `共 ${total} 行`,
        }}
        rowKey="__rowKey"
        dataSource={dataSource}
        columns={tableColumns}
        locale={{ emptyText: '暂无预览数据' }}
        scroll={{ x: scrollX, y: scrollY }}
        tableLayout="fixed"
      />
    </div>
  );
}

function DatasetTableEditor({
  rows,
  columns,
  newColumnName,
  dirty,
  saving,
  fullscreen = false,
  onRowsChange,
  onColumnsChange,
  onNewColumnNameChange,
  onSave,
  onReset,
  onToggleFullscreen,
}: {
  rows: Array<Record<string, unknown>>;
  columns: DatasetColumn[];
  newColumnName: string;
  dirty: boolean;
  saving: boolean;
  fullscreen?: boolean;
  onRowsChange: (rows: Array<Record<string, unknown>>) => void;
  onColumnsChange: (columns: DatasetColumn[]) => void;
  onNewColumnNameChange: (value: string) => void;
  onSave: () => void;
  onReset: () => void;
  onToggleFullscreen?: () => void;
}) {
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [deleteColumnName, setDeleteColumnName] = useState<string | undefined>();
  const editorRef = useRef<HTMLElement | null>(null);
  const [editorSize, setEditorSize] = useState({ width: 0, height: 0 });
  const visibleColumns = columns.length ? columns : [{ name: 'row_id', data_type: 'text', samples: [], comment: '', use_in_mapping: true }];
  useEffect(() => {
    const node = editorRef.current;
    if (!node) return undefined;
    let mounted = true;
    let frame = 0;
    const updateSize = () => {
      if (!mounted) return;
      const rect = node.getBoundingClientRect();
      const next = { width: Math.floor(rect.width), height: Math.floor(rect.height) };
      setEditorSize((current) => current.width === next.width && current.height === next.height ? current : next);
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    window.addEventListener('resize', updateSize);
    frame = window.requestAnimationFrame(updateSize);
    return () => {
      mounted = false;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, [fullscreen]);
  const addRow = () => {
    const nextRow = visibleColumns.reduce<Record<string, unknown>>((row, column) => {
      row[column.name] = column.name === 'row_id' ? `row-${rows.length + 1}` : '';
      return row;
    }, {});
    onRowsChange([...rows, nextRow]);
  };
  const addColumn = () => {
    const rawName = newColumnName.trim();
    if (!rawName || columns.some((column) => column.name === rawName)) return;
    const nextColumn: DatasetColumn = { name: rawName, data_type: 'text', samples: [], comment: '', use_in_mapping: true };
    onColumnsChange([...columns, nextColumn]);
    onRowsChange(rows.map((row) => ({ ...row, [rawName]: '' })));
    onNewColumnNameChange('');
  };
  const removeRows = () => {
    const selected = new Set(selectedRowKeys.map(String));
    onRowsChange(rows.filter((_, index) => !selected.has(String(index))));
    setSelectedRowKeys([]);
  };
  const removeColumn = () => {
    if (!deleteColumnName || columns.length <= 1) return;
    onColumnsChange(columns.filter((column) => column.name !== deleteColumnName));
    onRowsChange(rows.map((row) => {
      const next = { ...row };
      delete next[deleteColumnName];
      return next;
    }));
    setDeleteColumnName(undefined);
  };
  const updateCell = (rowIndex: number, columnName: string, value: unknown) => {
    onRowsChange(rows.map((row, index) => index === rowIndex ? { ...row, [columnName]: value } : row));
  };
  const updateColumnMeta = (columnName: string, patch: Partial<DatasetColumn>) => {
    onColumnsChange(columns.map((column) => column.name === columnName ? { ...column, ...patch } : column));
  };
  const tableColumns: ColumnsType<Record<string, unknown> & { __rowIndex: number }> = [
    {
      title: '#',
      key: '__index',
      width: 64,
      fixed: 'left',
      render: (_value, record) => record.__rowIndex + 1,
    },
    ...visibleColumns.map((column) => ({
      title: (
        <div className="dataset-editor-column-head">
          <strong>{column.name}</strong>
          <Select
            size="small"
            value={column.data_type}
            aria-label={`${column.name} 数据类型`}
            options={[
              { value: 'text', label: '文本' },
              { value: 'number', label: '数字' },
              { value: 'image', label: '图片' },
              { value: 'audio', label: '音频' },
              { value: 'video', label: '视频' },
              { value: 'json', label: 'JSON' },
              { value: 'media_list', label: '媒体列表' },
            ]}
            getPopupContainer={() => document.body}
            placement="topLeft"
            popupMatchSelectWidth={false}
            onChange={(value) => updateColumnMeta(column.name, { data_type: value })}
          />
        </div>
      ),
      dataIndex: column.name,
      key: column.name,
      width: column.data_type === 'media_list' || ['image', 'audio', 'video'].includes(column.data_type) ? 260 : 180,
      render: (value: unknown, record: Record<string, unknown> & { __rowIndex: number }) => (
        <EditableDatasetCell
          column={column}
          row={record}
          value={value}
          onChange={(nextValue) => updateCell(record.__rowIndex, column.name, nextValue)}
        />
      ),
    })),
  ];
  const dataSource = rows.map((row, index) => ({ ...row, __rowIndex: index }));
  const editorHeight = editorSize.height || (fullscreen && typeof window !== 'undefined' ? window.innerHeight - 110 : 620);
  const scrollY = Math.max(240, editorHeight - (fullscreen ? 196 : 280));
  return (
    <section className="settings-section dataset-table-editor" ref={editorRef}>
      <div className="section-title">
        <div>
          <h3>表格编辑</h3>
        </div>
        <div className="inline-actions dataset-table-editor-actions">
          {dirty && <Tag color="orange">未保存</Tag>}
          <AntButton
            icon={fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            onClick={onToggleFullscreen}
            disabled={!onToggleFullscreen}
          >
            {fullscreen ? '退出全屏' : '全屏'}
          </AntButton>
          <AntButton icon={<ReloadOutlined />} onClick={onReset} disabled={!dirty || saving}>还原</AntButton>
          <AntButton icon={<SaveOutlined />} type="primary" loading={saving} disabled={!dirty || !rows.length || !columns.length} onClick={onSave}>保存表格</AntButton>
        </div>
      </div>
      <div className="dataset-table-editor-toolbar">
        <Space wrap>
          <AntButton icon={<PlusOutlined />} onClick={addRow}>新增行</AntButton>
          <AntButton danger icon={<DeleteOutlined />} disabled={!selectedRowKeys.length} onClick={removeRows}>删除选中行</AntButton>
          <Input.Search
            className="dataset-table-editor-add-column"
            value={newColumnName}
            placeholder="输入新列名"
            enterButton="新增列"
            onChange={(event) => onNewColumnNameChange(event.target.value)}
            onSearch={addColumn}
          />
          <Select
            className="dataset-table-editor-delete-select"
            allowClear
            placeholder="选择要删除的列"
            value={deleteColumnName}
            options={columns.map((column) => ({ value: column.name, label: column.name }))}
            getPopupContainer={workspacePopupContainer}
            onChange={setDeleteColumnName}
          />
          <Popconfirm title="删除列" description="删除列会从所有行移除该字段，保存后才会写入数据集。" onConfirm={removeColumn}>
            <AntButton danger icon={<DeleteOutlined />} disabled={!deleteColumnName || columns.length <= 1}>删除列</AntButton>
          </Popconfirm>
        </Space>
      </div>
      <Table
        className="dataset-ant-table dataset-editable-table"
        size="small"
        rowKey={(record) => String(record.__rowIndex)}
        rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
        dataSource={dataSource}
        columns={tableColumns}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `共 ${total} 行` }}
        scroll={{ x: Math.max(900, 64 + visibleColumns.length * 190), y: scrollY }}
        tableLayout="fixed"
      />
    </section>
  );
}

function EditableDatasetCell({ column, row, value, onChange }: { column: DatasetColumn; row?: Record<string, unknown>; value: unknown; onChange: (value: unknown) => void }) {
  const text = typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
  const isMedia = ['image', 'audio', 'video', 'media_list'].includes(column.data_type);
  const rowMediaValue = row && ['image', 'audio', 'video'].includes(column.data_type) ? rowMediaForColumn(row, column, value) : null;
  const isStructured = column.data_type === 'json' || column.data_type === 'media_list' || typeof value === 'object';
  const isLongText = text.length > 72 || /[\n\r]/.test(text);
  const [mediaListEditorOpen, setMediaListEditorOpen] = useState(false);
  const [mediaListDraft, setMediaListDraft] = useState(text);
  const uploadProps: UploadProps = {
    accept: column.data_type === 'image' ? 'image/*' : column.data_type === 'audio' ? 'audio/*' : column.data_type === 'video' ? 'video/*' : 'image/*,audio/*,video/*',
    maxCount: 1,
    showUploadList: false,
    beforeUpload: (file) => {
      void fileToDataUrl(file).then((url) => onChange(url));
      return false;
    },
  };
  if (column.data_type === 'media_list') {
    return (
      <div className="dataset-editable-cell is-media-cell is-media-list-cell">
        <DatasetEditableMediaSummary value={value} column={column} />
        <AntButton
          size="small"
          icon={<EditOutlined />}
          onClick={() => {
            setMediaListDraft(text);
            setMediaListEditorOpen(true);
          }}
        >
          编辑列表
        </AntButton>
        {mediaListEditorOpen ? (
          <Modal
            title={`${column.name} 媒体列表`}
            open={mediaListEditorOpen}
            width={720}
            centered
            onCancel={() => setMediaListEditorOpen(false)}
            onOk={() => {
              onChange(parseEditableCellValue(mediaListDraft, column));
              setMediaListEditorOpen(false);
            }}
            okText="应用"
            cancelText="取消"
          >
            <Input.TextArea
              aria-label={`${column.name} 媒体列表 JSON`}
              value={mediaListDraft}
              rows={12}
              onChange={(event) => setMediaListDraft(event.target.value)}
            />
          </Modal>
        ) : null}
      </div>
    );
  }
  return (
    <div className={`dataset-editable-cell${isMedia ? ' is-media-cell' : ''}${isLongText ? ' is-long-text' : ''}`}>
      {isMedia && (rowMediaValue || value) ? <DatasetEditableMediaSummary value={rowMediaValue ?? value} column={column} /> : null}
      {isStructured ? (
        <Input.TextArea
          aria-label={`${column.name} 单元格内容`}
          value={text}
          autoSize={{ minRows: isMedia ? 1 : 2, maxRows: isMedia ? 2 : 4 }}
          onChange={(event) => onChange(parseEditableCellValue(event.target.value, column))}
        />
      ) : isLongText ? (
        <Input.TextArea
          aria-label={`${column.name} 单元格内容`}
          value={text}
          autoSize={{ minRows: 2, maxRows: 3 }}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          aria-label={`${column.name} 单元格内容`}
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {isMedia ? (
        <Upload {...uploadProps}>
          <AntButton size="small" icon={<UploadOutlined />}>上传到单元格</AntButton>
        </Upload>
      ) : null}
    </div>
  );
}

function DatasetEditableMediaSummary({ value, column }: { value: unknown; column: DatasetColumn }) {
  if (column.data_type === 'media_list' || Array.isArray(value)) {
    const mediaItems = Array.isArray(value) ? value.filter(isDatasetMediaRef) : [];
    const firstItem = mediaItems[0];
    const typeCounts = mediaItems.reduce<Record<string, number>>((counts, item) => {
      const type = item.type || inferMediaType(mediaUrlFromValue(item) || mediaNameFromValue(item));
      counts[type] = (counts[type] || 0) + 1;
      return counts;
    }, {});
    const summary = Object.entries(typeCounts)
      .map(([type, count]) => `${mediaTypeLabel(type)} ${count}`)
      .join(' · ') || '媒体列表';
    const label = firstItem ? mediaNameFromValue(firstItem).split('/').pop() || firstItem.field || firstItem.id || '媒体素材' : '空媒体列表';
    const inferredType = firstItem?.type || inferMediaType(mediaUrlFromValue(firstItem) || label);
    return (
      <div className="dataset-editable-media-summary dataset-editable-media-summary--list">
        <span className={`dataset-editable-media-icon is-${inferredType}`}>
          {inferredType === 'image' ? <PictureOutlined /> : inferredType === 'audio' ? <AudioOutlined /> : inferredType === 'video' ? <VideoCameraOutlined /> : <FileTextOutlined />}
        </span>
        <div>
          <strong title={label}>{mediaItems.length ? `${mediaItems.length} 个媒体 · ${shorten(String(label), 30)}` : '空媒体列表'}</strong>
          <small>{summary}</small>
        </div>
      </div>
    );
  }
  const url = mediaUrlFromValue(value) || String(value ?? '');
  const label = mediaNameFromValue(value).split('/').pop() || String(value ?? '') || '未命名素材';
  const inferredType = column.data_type || inferMediaType(url || label);
  const isFileNameOnly = Boolean(label) && !/^https?:\/\//i.test(url) && !url.startsWith('/api/') && !url.startsWith('data:') && !url.startsWith('blob:') && !url.includes('/');
  return (
    <div className="dataset-editable-media-summary">
      <span className={`dataset-editable-media-icon is-${inferredType}`}>
        {inferredType === 'image' ? <PictureOutlined /> : inferredType === 'audio' ? <AudioOutlined /> : inferredType === 'video' ? <VideoCameraOutlined /> : <FileTextOutlined />}
      </span>
      <div>
        <strong title={label}>{shorten(label, 44)}</strong>
        <small>{isFileNameOnly ? '文件名引用，需通过行级媒体或素材绑定预览' : mediaTypeLabel(inferredType)}</small>
      </div>
    </div>
  );
}

function renderPreviewCell(value: unknown, column: DatasetColumn, row?: Record<string, unknown>) {
  const text = cellText(value);
  const mediaValue = row ? rowMediaForColumn(row, column, value) : null;
  if (mediaValue || ['image', 'audio', 'video'].includes(column.data_type)) {
    const previewValue = mediaValue ?? normalizeDatasetPreviewMediaValue(value);
    if (!previewValue) return <Tag>空值</Tag>;
    return <WorkspaceMediaPreview value={previewValue} mode="inline" compact showUrl={false} showActions={false} className="preview-media-cell" />;
  }
  if (value == null || value === '') return <Tag>空值</Tag>;
  if (column.data_type === 'media_list') return <MediaListPreview media={Array.isArray(value) ? value.filter(isDatasetMediaRef) : []} />;
  if (column.data_type === 'json' || typeof value === 'object') return <code>{shorten(text, 72)}</code>;
  return shorten(text, 120);
}

function MediaListPreview({ media }: { media: DatasetMediaRef[] }) {
  if (!media.length) return <Tag>无媒体</Tag>;
  return (
    <div className="dataset-media-list-preview">
      {media.map((item, index) => <WorkspaceMediaPreview key={`${item.id || item.url || item.name || index}`} value={item} mode="inline" compact showUrl={false} showActions={false} className="preview-media-cell" />)}
    </div>
  );
}

function DatasetDetailWorkbench({
  dataset,
  activeTab,
  filteredSampleEntries,
  sampleIndex,
  sampleKeyword,
  sampleFilter,
  activeSample,
  mappingColumns,
  derivedColumns,
  mediaSummary,
  unsaved,
  tableEditorDirty,
  autoSaveState,
  datasetMetaForm,
  fieldColumns,
  tableDraftColumns,
  tableDraftRows,
  newColumnName,
  submitting,
  mediaBindingSubmitting,
  onTabChange,
  onSampleKeywordChange,
  onSampleFilterChange,
  onSampleIndexChange,
  onMetaFormChange,
  onBack,
  onPatchUpload,
  onDownload,
  onOpenTemplate,
  onOpenPublish,
  onSave,
  onTableFullscreen,
  onNewColumnNameChange,
  onTableColumnsChange,
  onTableRowsChange,
  onSaveTable,
  onResetTable,
  onAddVariable,
  onBindAsset,
}: {
  dataset: DatasetPayload;
  activeTab: DatasetDetailTab;
  filteredSampleEntries: Array<{ row: Record<string, unknown>; index: number }>;
  sampleIndex: number;
  sampleKeyword: string;
  sampleFilter: 'all' | 'media' | 'issues';
  activeSample: Record<string, unknown>;
  mappingColumns: DatasetColumn[];
  derivedColumns: DatasetColumn[];
  mediaSummary: { types: string[]; bound: number; unbound: number; failed: number };
  unsaved: boolean;
  tableEditorDirty: boolean;
  autoSaveState: 'idle' | 'saving' | 'saved' | 'error';
  datasetMetaForm: { name: string; description: string };
  fieldColumns: ColumnsType<DatasetColumn>;
  tableDraftColumns: DatasetColumn[];
  tableDraftRows: Array<Record<string, unknown>>;
  newColumnName: string;
  submitting: boolean;
  mediaBindingSubmitting: boolean;
  onTabChange: (tab: DatasetDetailTab) => void;
  onSampleKeywordChange: (value: string) => void;
  onSampleFilterChange: (value: 'all' | 'media' | 'issues') => void;
  onSampleIndexChange: (index: number) => void;
  onMetaFormChange: (value: { name: string; description: string }) => void;
  onBack: () => void;
  onPatchUpload: () => void;
  onDownload: (format: 'json' | 'jsonl' | 'csv') => void;
  onOpenTemplate?: () => void;
  onOpenPublish?: () => void;
  onSave: () => void;
  onTableFullscreen: () => void;
  onNewColumnNameChange: (value: string) => void;
  onTableColumnsChange: (columns: DatasetColumn[]) => void;
  onTableRowsChange: (rows: Array<Record<string, unknown>>) => void;
  onSaveTable: () => void;
  onResetTable: () => void;
  onAddVariable: () => void;
  onBindAsset: (payload: { asset_index: number; row_index: number; role?: 'primary' | 'context' | 'evidence'; field?: string | null; media_type?: string | null }) => void;
}) {
  const context = buildDatasetQuestionContext(dataset, activeSample, sampleIndex);
  const processing = dataset.processing_summary ?? {};
  const locked = Boolean(processing.locked || processing.is_locked);
  const activeRowIndex = filteredSampleEntries.findIndex((entry) => entry.index === sampleIndex);
  return (
    <>
      <section className="page-heading dataset-detail-heading dataset-detail-heading--compact">
        <div className="dataset-detail-title-group">
          <AntButton className="dataset-detail-back-button" icon={<ArrowLeftOutlined />} onClick={onBack} aria-label="返回数据集管理" />
          <div className="dataset-detail-title">
            <h1>{dataset.name}<span>Dataset Detail</span></h1>
          </div>
        </div>
        <div className="page-actions">
          {(unsaved || tableEditorDirty) && <Tag color="orange">未保存</Tag>}
          {!(unsaved || tableEditorDirty) && autoSaveState === 'saved' && <Tag color="green">已保存</Tag>}
          {locked && <Tag color="red">源数据锁定</Tag>}
          <AntButton icon={<SaveOutlined />} type="primary" loading={autoSaveState === 'saving'} onClick={onSave}>保存</AntButton>
          <AntButton icon={<UploadOutlined />} onClick={onPatchUpload}>补上传</AntButton>
          <AntButton icon={<DatabaseOutlined />} onClick={onOpenTemplate}>进入模板搭建</AntButton>
          <AntButton icon={<RocketOutlined />} disabled={mappingColumns.length === 0} onClick={onOpenPublish}>发布任务</AntButton>
          <Dropdown
            getPopupContainer={() => document.body}
            menu={{
              items: [
                { key: 'json', icon: <DownloadOutlined />, label: '下载 JSON' },
                { key: 'jsonl', icon: <DownloadOutlined />, label: '下载 JSONL' },
                { key: 'csv', icon: <DownloadOutlined />, label: '下载 CSV' },
              ],
              onClick: ({ key }) => onDownload(key as 'json' | 'jsonl' | 'csv'),
            }}
          >
            <AntButton icon={<DownloadOutlined />}>导出</AntButton>
          </Dropdown>
        </div>
      </section>

      {locked ? <Alert className="dataset-lock-notice" type="warning" showIcon title="源数据已锁定" description="该数据集可能已被非草稿任务引用。建议只查看和导出，避免继续编辑源数据。" /> : null}

      <section className="dataset-detail-workspace">
        <Segmented<DatasetDetailTab>
          className="dataset-detail-segmented"
          value={activeTab}
          onChange={onTabChange}
          options={[
            { value: 'sample', label: '样本' },
            { value: 'table', label: '表格' },
            { value: 'media', label: '媒体' },
            { value: 'mapping', label: '映射' },
            { value: 'publish', label: '发布' },
          ]}
        />
        <div className="dataset-detail-workspace-body">
          {activeTab === 'sample' ? (
            <section className="dataset-detail-main">
              <aside className="dataset-sample-rail">
                <div className="dataset-sample-rail-toolbar">
                  <Input.Search allowClear value={sampleKeyword} placeholder="搜索样本编号 / 字段内容" onChange={(event) => onSampleKeywordChange(event.target.value)} />
                  <Segmented
                    block
                    value={sampleFilter}
                    onChange={(value) => {
                      onSampleFilterChange(value as 'all' | 'media' | 'issues');
                      onSampleIndexChange(0);
                    }}
                    options={[
                      { value: 'all', label: '全部' },
                      { value: 'media', label: '有媒体' },
                      { value: 'issues', label: '问题媒体' },
                    ]}
                  />
                </div>
                <div className="dataset-sample-list dataset-sample-list--workbench" aria-label="样本列表">
                  {filteredSampleEntries.length ? filteredSampleEntries.slice(0, 240).map(({ row, index }) => {
                    const itemMedia = rowMedia(row);
                    const hasIssue = datasetRowHasIssue(row);
                    return (
                      <button
                        type="button"
                        key={String(row.row_id || row.external_id || index)}
                        className={index === sampleIndex ? 'active' : ''}
                        onClick={() => onSampleIndexChange(index)}
                      >
                        <DatabaseOutlined aria-hidden="true" />
                        <strong>{String(row.external_id || row.row_id || `样本 ${index + 1}`)}</strong>
                        <span>{itemMedia.length ? `${itemMedia.length} 个媒体` : '无媒体'}{hasIssue ? ' · 异常' : ''}</span>
                      </button>
                    );
                  }) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配样本" />}
                </div>
              </aside>

              <main className="dataset-sample-stage">
                <DatasetSamplePreview row={activeSample} rowIndex={sampleIndex} />
              </main>

              <aside className="dataset-context-side">
                <DatasetContextReadablePreview dataset={dataset} row={activeSample} rowIndex={sampleIndex} context={context} />
              </aside>
            </section>
          ) : activeTab === 'table' ? (
            <div className="dataset-table-workspace">
              <DatasetTableEditor
                columns={userEditableDatasetColumns(tableDraftColumns)}
                rows={tableDraftRows}
                newColumnName={newColumnName}
                dirty={tableEditorDirty}
                saving={submitting}
                fullscreen={false}
                onToggleFullscreen={onTableFullscreen}
                onNewColumnNameChange={onNewColumnNameChange}
                onColumnsChange={(columns) => onTableColumnsChange(mergeVisibleDatasetColumns(tableDraftColumns, columns))}
                onRowsChange={onTableRowsChange}
                onSave={onSaveTable}
                onReset={onResetTable}
              />
            </div>
          ) : activeTab === 'media' ? (
            <DatasetMediaPanel dataset={dataset} activeRow={activeSample} bindingLoading={mediaBindingSubmitting} onBindAsset={onBindAsset} />
          ) : activeTab === 'mapping' ? (
            <DatasetMappingReadinessPanel dataset={dataset} fieldColumns={fieldColumns} derivedColumns={derivedColumns} mappingColumns={mappingColumns} onAddVariable={onAddVariable} />
          ) : (
            <DatasetPublishReadinessPanel
              dataset={dataset}
              datasetMetaForm={datasetMetaForm}
              mediaSummary={mediaSummary}
              mappingColumns={mappingColumns}
              derivedColumns={derivedColumns}
              processing={processing}
              locked={locked}
              onMetaFormChange={onMetaFormChange}
            />
          )}
        </div>
      </section>
    </>
  );
}

function DatasetSamplePreview({ row, rowIndex }: { row: Record<string, unknown>; rowIndex: number }) {
  const media = rowMedia(row);
  const primary = media[0];
  const fields = Object.entries(row).filter(([key]) => !['media', 'attachments', 'derived_context', '_bindings'].includes(key));
  const attachments = Array.isArray(row.attachments) ? row.attachments : [];
  const derivedContext = row.derived_context && typeof row.derived_context === 'object' ? row.derived_context as Record<string, unknown> : {};
  return (
    <div className={`dataset-sample-preview-workbench${primary ? ' has-primary-media' : ''}`}>
      <div className="dataset-sample-preview-head">
        <div>
          <span>当前样本</span>
          <strong>{String(row.external_id || row.row_id || `样本 ${rowIndex + 1}`)}</strong>
        </div>
        <Tag color={media.length ? 'blue' : 'default'}>{media.length} 个媒体</Tag>
      </div>
      {primary ? (
        <div className="dataset-sample-primary-media">
          <WorkspaceMediaPreview value={primary} compact={false} mode="card" showUrl={false} />
        </div>
      ) : null}
      <Tabs
        className="dataset-sample-data-tabs"
        size="small"
        items={[
          {
            key: 'fields',
            label: '原始字段',
            children: <DatasetKeyValueTable className="dataset-key-value-table--sample" rows={fields.map(([key, value]) => ({ key, value: shorten(cellText(value), 220), type: inferDatasetValueType(value) }))} scrollY={360} />,
          },
          {
            key: 'media',
            label: '媒体',
            children: media.length ? (
              <div className="dataset-sample-secondary-media">
                {media.map((item, index) => <WorkspaceMediaPreview key={`${item.id || item.url || index}`} value={item} compact mode="card" showUrl={false} showActions={false} />)}
              </div>
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无媒体" />,
          },
          {
            key: 'derived',
            label: '派生上下文',
            children: Object.keys(derivedContext).length ? <DatasetKeyValueTable className="dataset-key-value-table--sample" rows={Object.entries(derivedContext).map(([key, value]) => ({ key, value: shorten(cellText(value), 240), type: inferDatasetValueType(value) }))} scrollY={360} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无派生上下文" />,
          },
          {
            key: 'attachments',
            label: '附件',
            children: attachments.length ? <MediaListPreview media={attachments.filter(isDatasetMediaRef)} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无附件" />,
          },
          {
            key: 'json',
            label: 'JSON',
            children: <pre className="dataset-context-json">{JSON.stringify(row, null, 2)}</pre>,
          },
        ]}
      />
    </div>
  );
}

function DatasetContextReadablePreview({ dataset, row, rowIndex, context }: { dataset: DatasetPayload; row: Record<string, unknown>; rowIndex: number; context: ReturnType<typeof buildDatasetQuestionContext> }) {
  const media = rowMedia(row);
  const textFields = Object.entries(context.sample.text_fields ?? {});
  const showItemRows = dataset.columns
    .filter((column) => column.use_in_mapping !== false)
    .slice(0, 14)
    .map((column) => ({ key: column.name, type: mediaTypeLabel(column.data_type), source: column.derived ? '派生变量' : '数据列' }));
  const aiRows = [
    ...textFields.slice(0, 10).map(([key, value]) => ({ key, source: '原始字段', type: '文本', value: shorten(String(value ?? ''), 72) })),
    ...media.map((item, index) => ({ key: String(item.field || item.name || item.filename || `media_${index + 1}`), source: datasetMediaSourceLabel(String(item.source || 'row')), type: mediaTypeLabel(String(item.type || 'file')), value: String(item.name || item.filename || item.url || '-') })),
  ];
  const fallbackRows = Object.entries(context.text_fallback ?? {}).map(([key, value]) => ({ key, value: shorten(cellText(value), 120), type: inferDatasetValueType(value) }));
  const rows = [
    ...dataset.columns.slice(0, 10).map((column) => ({
      key: column.name,
      source: column.derived ? '派生变量' : '数据列',
      type: column.data_type,
      ai: column.use_in_mapping !== false,
      reviewer: column.use_in_mapping !== false,
    })),
    ...rowMedia(row).map((media, index) => ({
      key: String(media.field || media.name || media.filename || `media_${index + 1}`),
      source: datasetMediaSourceLabel(String(media.source || 'row')),
      type: mediaTypeLabel(String(media.type || 'file')),
      ai: true,
      reviewer: true,
    })),
  ];
  return (
    <div className="dataset-context-readable">
      <div className="section-title">
        <div><h3>上下文检查</h3><p>第 {rowIndex + 1} 行进入 AI / Reviewer 前的结构摘要。</p></div>
      </div>
      <div className="dataset-context-block">
        <h4>进入 AI 的字段</h4>
        <DatasetKeyValueTable rows={aiRows.slice(0, 12).map((item) => ({ key: item.key, value: item.value, type: item.type, source: item.source }))} compact />
      </div>
      <div className="dataset-context-block">
        <h4>进入 Reviewer 的内容</h4>
        <Table
          size="small"
          rowKey={(record) => `${record.source}-${record.type}-${record.key}`}
          pagination={false}
          dataSource={rows.slice(0, 12)}
          columns={[
            { title: '字段', dataIndex: 'key', ellipsis: true },
            { title: '来源', dataIndex: 'source', width: 78 },
            { title: '类型', dataIndex: 'type', width: 68, render: (value: string) => mediaTypeLabel(value) },
          ]}
          scroll={{ y: 150 }}
        />
      </div>
      <div className="dataset-context-block">
        <h4>ShowItem 可映射来源</h4>
        <div className="dataset-mapping-tags">
          {showItemRows.length ? showItemRows.map((item) => <Tag key={item.key}>{item.key} · {item.type}</Tag>) : <Tag>无候选字段</Tag>}
        </div>
      </div>
      <div className="dataset-context-block">
        <h4>多模态内容块</h4>
        {media.length ? <MediaListPreview media={media.slice(0, 6)} /> : <p className="inline-message">当前行没有可进入上下文的媒体。</p>}
      </div>
      <div className="dataset-context-block">
        <h4>纯文本降级上下文</h4>
        <DatasetKeyValueTable rows={fallbackRows} compact />
      </div>
      <Collapse
        size="small"
        className="dataset-context-json-collapse"
        items={[{ key: 'json', label: '查看原始 QuestionContext JSON', children: <pre className="dataset-context-json">{JSON.stringify(context, null, 2)}</pre> }]}
      />
    </div>
  );
}

function DatasetKeyValueTable({
  rows,
  compact = false,
  className,
  scrollY,
}: {
  rows: Array<{ key: string; value: unknown; type?: string; source?: string }>;
  compact?: boolean;
  className?: string;
  scrollY?: number | string;
}) {
  if (!rows.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />;
  return (
    <Table
      className={['dataset-key-value-table', className].filter(Boolean).join(' ')}
      size="small"
      rowKey={(record) => `${record.key}-${record.source || ''}-${record.type || ''}-${shorten(cellText(record.value), 80)}`}
      pagination={false}
      dataSource={rows}
      columns={[
        { title: '字段', dataIndex: 'key', width: compact ? 104 : 150, ellipsis: true },
        ...(compact ? [] : [{ title: '来源', dataIndex: 'source', width: 96, ellipsis: true }]),
        { title: '类型', dataIndex: 'type', width: compact ? 70 : 82, render: (value: string) => value || '文本' },
        { title: '值', dataIndex: 'value', ellipsis: true, render: (value: unknown) => <span title={cellText(value)}>{cellText(value)}</span> },
      ]}
      scroll={{ y: scrollY ?? (compact ? 132 : 240), x: compact ? 360 : 640 }}
    />
  );
}

function DatasetMappingReadinessPanel({ dataset, fieldColumns, derivedColumns, mappingColumns, onAddVariable }: { dataset: DatasetPayload; fieldColumns: ColumnsType<DatasetColumn>; derivedColumns: DatasetColumn[]; mappingColumns: DatasetColumn[]; onAddVariable: () => void }) {
  const mediaColumns = dataset.columns.filter((column) => ['image', 'audio', 'video', 'media_list'].includes(column.data_type));
  return (
    <section className="dataset-mapping-readiness">
      <div className="dataset-mapping-grid">
        <section className="dataset-workbench-panel dataset-mapping-fields">
          <div className="dataset-workbench-panel-head">
            <h3>字段与映射</h3>
            <Tag color={mappingColumns.length ? 'blue' : 'orange'}>{mappingColumns.length} 个候选</Tag>
          </div>
          <EnhancedTable className="dataset-ant-table" rowKey="name" dataSource={dataset.columns} columns={fieldColumns} pagination={false} scroll={{ x: 860, y: 520 }} />
        </section>
        <aside className="dataset-workbench-panel dataset-mapping-side">
          <div className="dataset-workbench-panel-head"><h3>多模态 ShowItem 候选</h3></div>
          {mediaColumns.length ? (
            <div className="dataset-mapping-tags">
              {mediaColumns.map((column) => <Tag key={column.name} color={mediaTypeColor(column.data_type)}>{column.name} · {mediaTypeLabel(column.data_type)}</Tag>)}
            </div>
          ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无多模态字段" />}
          <Divider />
          <div className="dataset-workbench-panel-head">
            <h3>派生变量</h3>
            <AntButton size="small" icon={<PlusOutlined />} onClick={onAddVariable}>新增变量</AntButton>
          </div>
          <div className="variable-stack">
            {derivedColumns.length ? derivedColumns.map((column) => <span key={column.name}>{column.name}<em>{column.source_column || 'manual'}</em></span>) : <p className="inline-message">还没有派生变量。</p>}
          </div>
        </aside>
      </div>
    </section>
  );
}

function DatasetPublishReadinessPanel({
  dataset,
  datasetMetaForm,
  mediaSummary,
  mappingColumns,
  derivedColumns,
  processing,
  locked,
  onMetaFormChange,
}: {
  dataset: DatasetPayload;
  datasetMetaForm: { name: string; description: string };
  mediaSummary: { types: string[]; bound: number; unbound: number; failed: number };
  mappingColumns: DatasetColumn[];
  derivedColumns: DatasetColumn[];
  processing: Record<string, unknown>;
  locked: boolean;
  onMetaFormChange: (value: { name: string; description: string }) => void;
}) {
  const checks = [
    { key: 'rows', label: '数据行', ok: dataset.row_count > 0, message: dataset.row_count > 0 ? `${dataset.row_count} 行` : '没有可发布行' },
    { key: 'mapping', label: '可映射字段', ok: mappingColumns.length > 0, message: mappingColumns.length > 0 ? `${mappingColumns.length} 个字段` : '缺少可映射字段' },
    { key: 'failed', label: '失败媒体', ok: mediaSummary.failed <= 0, message: mediaSummary.failed <= 0 ? '无失败媒体' : `${mediaSummary.failed} 个失败素材` },
    { key: 'unbound', label: '未绑定素材', ok: mediaSummary.unbound <= 0, message: mediaSummary.unbound <= 0 ? '无未绑定素材' : `${mediaSummary.unbound} 个未绑定素材` },
    { key: 'locked', label: '源数据锁定', ok: !locked, message: locked ? '被非草稿任务引用，禁止改写源数据' : '可编辑' },
    { key: 'ai', label: 'AI 上下文', ok: (dataset.context_schema?.length ?? 0) > 0 || mappingColumns.length > 0 || mediaSummary.bound > 0, message: `${dataset.context_schema?.length ?? 0} 个上下文字段` },
    { key: 'reviewer', label: 'Reviewer 上下文', ok: mappingColumns.length > 0 || mediaSummary.bound > 0, message: mappingColumns.length > 0 ? '字段可进入审核页' : '缺少审核字段' },
  ];
  const blockers = checks.filter((item) => !item.ok);
  return (
    <section className="dataset-publish-readiness">
      <div className="dataset-workbench-panel dataset-publish-main">
        <div className="dataset-workbench-panel-head">
          <h3>发布准备</h3>
          <Tag color={blockers.length ? 'orange' : 'green'}>{blockers.length ? `${blockers.length} 项需处理` : '已具备准备条件'}</Tag>
        </div>
        <div className="dataset-check-list">
          {checks.map((item) => (
            <div className={item.ok ? 'is-ok' : 'is-warning'} key={item.key}>
              {item.ok ? <CheckCircleOutlined /> : <ExperimentOutlined />}
              <strong>{item.label}</strong>
              <span>{item.message}</span>
            </div>
          ))}
        </div>
      </div>
      <aside className="dataset-workbench-panel dataset-publish-side">
        <div className="dataset-workbench-panel-head"><h3>基础信息</h3></div>
        <div className="compact-form dataset-overview-form">
          <label>数据集名称<Input value={datasetMetaForm.name} onChange={(event) => onMetaFormChange({ ...datasetMetaForm, name: event.target.value })} /></label>
          <label>简介<Input.TextArea value={datasetMetaForm.description} autoSize={{ minRows: 2, maxRows: 4 }} onChange={(event) => onMetaFormChange({ ...datasetMetaForm, description: event.target.value })} /></label>
        </div>
        <Descriptions
          size="small"
          column={1}
          items={[
            { label: '来源格式', children: dataset.source_format.toUpperCase() },
            { label: '创建时间', children: formatDateTime(dataset.created_at) },
            { label: '更新时间', children: formatDateTime(dataset.updated_at) },
            { label: '派生变量', children: `${derivedColumns.length} 个` },
            { label: 'processing_summary', children: Object.keys(processing).length ? '已生成' : '暂无' },
          ]}
        />
      </aside>
    </section>
  );
}

function DatasetMediaPanel({
  dataset,
  activeRow,
  bindingLoading = false,
  onBindAsset,
}: {
  dataset: DatasetPayload;
  activeRow?: Record<string, unknown>;
  bindingLoading?: boolean;
  onBindAsset?: (payload: { asset_index: number; row_index: number; role?: 'primary' | 'context' | 'evidence'; field?: string | null; media_type?: string | null }) => void;
}) {
  const [form] = Form.useForm<{ asset_index: number; row_index: number; role: 'primary' | 'context' | 'evidence'; field?: string; media_type?: string }>();
  const [mediaFilter, setMediaFilter] = useState<'all' | 'image' | 'audio' | 'video'>('all');
  const rows = dataset.rows ?? dataset.preview_rows ?? [];
  const rowMediaItems = rows.flatMap(rowMedia);
  const assetItems = (dataset.media_assets ?? [])
    .map((asset, index) => ({ asset, index }))
    .filter((item) => hasResolvableDatasetMediaAsset(item.asset));
  const filteredAssetItems = assetItems.filter(({ asset }) => mediaFilter === 'all' || normalizeDatasetMediaType(asset) === mediaFilter);
  const filteredRowMediaItems = rowMediaItems
    .map((media, index) => ({ media, index }))
    .filter(({ media }) => mediaFilter === 'all' || normalizeDatasetMediaType(media) === mediaFilter);
  const currentRowMedia = activeRow ? rowMedia(activeRow) : [];
  const firstAssetItem = assetItems[0] ?? null;
  const firstMedia = firstAssetItem?.asset || currentRowMedia[0] || rowMediaItems[0] || null;
  const [selectedMedia, setSelectedMedia] = useState<{ kind: 'asset' | 'row'; index: number; media: DatasetMediaRef } | null>(
    firstMedia ? { kind: firstAssetItem?.asset === firstMedia ? 'asset' : 'row', index: firstAssetItem?.asset === firstMedia ? firstAssetItem.index : 0, media: firstMedia } : null,
  );
  useEffect(() => {
    if (selectedMedia || !firstMedia) return;
    const isAsset = firstAssetItem?.asset === firstMedia;
    const next: { kind: 'asset' | 'row'; index: number; media: DatasetMediaRef } = {
      kind: isAsset ? 'asset' : 'row',
      index: isAsset ? firstAssetItem.index : 0,
      media: firstMedia,
    };
    setSelectedMedia(next);
    if (next.kind === 'asset') {
      form.setFieldsValue({
        asset_index: next.index,
        row_index: 0,
        role: 'context',
        field: defaultMediaAssetField(next.media, next.index),
        media_type: String(next.media.type || inferMediaType(String(next.media.url || next.media.filename || next.media.name || next.media.file_id || ''))) || 'file',
      });
    }
  }, [firstAssetItem, firstMedia, form, selectedMedia]);
  if (!rowMediaItems.length && !assetItems.length) return <Empty description="当前数据集没有关联素材" />;
  const selectAssetForBinding = (assetIndex: number, asset: DatasetMediaRef) => {
    setSelectedMedia({ kind: 'asset', index: assetIndex, media: asset });
    form.setFieldsValue({
      asset_index: assetIndex,
      row_index: 0,
      role: 'context',
      field: defaultMediaAssetField(asset, assetIndex),
      media_type: String(asset.type || inferMediaType(String(asset.url || asset.filename || asset.name || asset.file_id || ''))) || 'file',
    });
  };
  const submitBinding = () => {
    const values = form.getFieldsValue();
    if (selectedMedia?.kind !== 'asset') return;
    onBindAsset?.({
      asset_index: values.asset_index,
      row_index: values.row_index,
      role: values.role,
      field: values.field?.trim() || null,
      media_type: values.media_type || null,
    });
  };
  return (
    <section className="dataset-media-workbench">
      <aside className="dataset-media-rail">
        <div className="dataset-media-rail-head">
          <strong>素材列表</strong>
          <Tag>{rowMediaItems.length + assetItems.length}</Tag>
        </div>
        <Segmented
          block
          size="small"
          options={[
            { label: '全部', value: 'all' },
            { label: '图片', value: 'image' },
            { label: '音频', value: 'audio' },
            { label: '视频', value: 'video' },
          ]}
          value={mediaFilter}
          onChange={(value) => setMediaFilter(value as 'all' | 'image' | 'audio' | 'video')}
        />
        <div className="dataset-media-list">
          {filteredAssetItems.length ? <div className="dataset-media-list-group">未绑定素材</div> : null}
          {filteredAssetItems.map(({ asset, index }) => (
            <button
              type="button"
              key={`${asset.url || asset.filename || asset.name || index}`}
              className={selectedMedia?.kind === 'asset' && selectedMedia.index === index ? 'active' : ''}
              onClick={() => selectAssetForBinding(index, asset)}
            >
              <span>{mediaTypeLabel(String(asset.type || inferMediaType(String(asset.url || asset.filename || asset.name || ''))))}</span>
              <strong>{String(asset.name || asset.filename || asset.field || `素材 ${index + 1}`)}</strong>
              <em>未绑定</em>
            </button>
          ))}
          {filteredRowMediaItems.length ? <div className="dataset-media-list-group">行级媒体</div> : null}
          {filteredRowMediaItems.map(({ media: item, index }) => (
            <button
              type="button"
              key={`${item.id || item.url || item.name || index}`}
              className={selectedMedia?.kind === 'row' && selectedMedia.index === index ? 'active' : ''}
              onClick={() => setSelectedMedia({ kind: 'row', index, media: item })}
            >
              <span>{mediaTypeLabel(String(item.type || 'file'))}</span>
              <strong>{String(item.name || item.filename || item.field || `行级媒体 ${index + 1}`)}</strong>
              <em>{datasetMediaSourceLabel(String(item.source || 'row'))}</em>
            </button>
          ))}
          {!filteredAssetItems.length && !filteredRowMediaItems.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前筛选下没有素材" /> : null}
        </div>
      </aside>
      <main className="dataset-media-preview-stage">
        {selectedMedia ? <WorkspaceMediaPreview value={selectedMedia.media} compact={false} mode="card" showUrl showActions /> : <Empty description="请选择素材" />}
      </main>
      <aside className="dataset-media-bind-side">
        <div className="dataset-workbench-panel-head">
          <h3>绑定面板</h3>
          {selectedMedia?.kind === 'asset' ? <Tag color="orange">未绑定素材</Tag> : <Tag color="blue">行级媒体</Tag>}
        </div>
        {selectedMedia?.kind === 'asset' ? (
          <Form form={form} layout="vertical" className="dataset-media-bind-form">
            <Form.Item name="asset_index" hidden><InputNumber /></Form.Item>
            <Form.Item name="row_index" label="目标数据行" rules={[{ required: true, message: '请选择目标数据行' }]}>
              <Select
                showSearch
                optionFilterProp="label"
                options={rows.map((row, index) => ({
                  value: index,
                  label: `${index + 1}. ${datasetRowOptionLabel(row, index)}`,
                }))}
              />
            </Form.Item>
            <Form.Item name="field" label="字段名">
              <Input placeholder="例如 image_reference" />
            </Form.Item>
            <Form.Item name="media_type" label="媒体类型">
              <Select
                options={[
                  { value: 'image', label: '图片' },
                  { value: 'audio', label: '音频' },
                  { value: 'video', label: '视频' },
                  { value: 'document', label: '文档' },
                  { value: 'file', label: '文件' },
                ]}
              />
            </Form.Item>
            <Form.Item name="role" label="素材用途" rules={[{ required: true, message: '请选择素材用途' }]}>
              <Radio.Group className="dataset-media-role-group">
                {datasetMediaRoleOptions.map((option) => (
                  <Radio key={option.value} value={option.value}>
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </span>
                  </Radio>
                ))}
              </Radio.Group>
            </Form.Item>
            <AntButton block type="primary" icon={<PlusOutlined />} loading={bindingLoading} disabled={!rows.length || !onBindAsset} onClick={submitBinding}>
              绑定到行
            </AntButton>
          </Form>
        ) : (
          <div className="dataset-media-bound-info">
            <Descriptions
              size="small"
              column={1}
              items={[
                { label: '字段', children: selectedMedia?.media.field || '-' },
                { label: '类型', children: mediaTypeLabel(String(selectedMedia?.media.type || 'file')) },
                { label: '来源', children: datasetMediaSourceLabel(String(selectedMedia?.media.source || 'row')) },
                { label: '用途', children: datasetMediaRoleLabel(selectedMedia?.media.role) },
              ]}
            />
            <Alert type="info" showIcon title="行级媒体已进入当前样本上下文" />
          </div>
        )}
      </aside>
    </section>
  );
}

function hasResolvableDatasetMediaAsset(asset: DatasetMediaRef): boolean {
  const raw = asset as DatasetMediaRef & Record<string, unknown>;
  return Boolean(raw.url || raw.src || raw.href || raw.path || raw.file_id);
}

function defaultMediaAssetField(asset: DatasetMediaRef, index: number): string {
  const raw = String(asset.field || asset.filename || asset.name || asset.url || asset.file_id || `media_asset_${index + 1}`);
  const base = raw.split('/').pop() || raw;
  const withoutExtension = base.replace(/\.[A-Za-z0-9]+$/, '');
  const normalized = withoutExtension.replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return normalized && /^[A-Za-z_]/.test(normalized) ? normalized.slice(0, 80) : `media_asset_${index + 1}`;
}

function datasetRowOptionLabel(row: Record<string, unknown>, index: number): string {
  const id = row.row_id || row.external_id || row.id;
  const preview = Object.entries(row)
    .filter(([key]) => !['media', 'attachments', 'derived_context'].includes(key))
    .slice(0, 2)
    .map(([key, value]) => `${key}: ${shorten(cellText(value), 24)}`)
    .join(' · ');
  return shorten(String(id || preview || `第 ${index + 1} 行`), 96);
}

function cellText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function inferDatasetValueType(value: unknown): string {
  if (Array.isArray(value)) return '列表';
  if (value && typeof value === 'object') {
    const url = mediaUrlFromValue(value);
    if (url) return mediaTypeLabel(inferMediaType(url));
    return 'JSON';
  }
  if (typeof value === 'number') return '数字';
  if (typeof value === 'boolean') return '布尔';
  const text = String(value ?? '');
  if (looksLikeMediaReference('', text)) return mediaTypeLabel(inferMediaType(text));
  return '文本';
}

function cloneDatasetRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return rows.map((row) => JSON.parse(JSON.stringify(row)) as Record<string, unknown>);
}

const datasetSystemColumnNames = new Set(['row_id', 'media', 'attachments', 'derived_context', '_bindings']);

function isDatasetSystemColumn(column: DatasetColumn): boolean {
  return datasetSystemColumnNames.has(column.name);
}

function userEditableDatasetColumns(columns: DatasetColumn[]): DatasetColumn[] {
  return columns.filter((column) => !isDatasetSystemColumn(column));
}

function mergeVisibleDatasetColumns(allColumns: DatasetColumn[], visibleColumns: DatasetColumn[]): DatasetColumn[] {
  const visibleByName = new Map(visibleColumns.map((column) => [column.name, column]));
  const merged = allColumns
    .filter((column) => isDatasetSystemColumn(column) || visibleByName.has(column.name))
    .map((column) => visibleByName.get(column.name) ?? column);
  const existing = new Set(merged.map((column) => column.name));
  visibleColumns.forEach((column) => {
    if (!existing.has(column.name)) merged.push(column);
  });
  return merged;
}

function datasetRowHasIssue(row: Record<string, unknown>): boolean {
  const media = rowMedia(row);
  return media.some((item) => item.status === 'failed' || item.status === 'error') || Number(row.__issue_count || 0) > 0;
}

function parseEditableCellValue(value: string, column: DatasetColumn): unknown {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (column.data_type === 'number') {
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : value;
  }
  if (column.data_type === 'json' || column.data_type === 'media_list') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error ?? new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

function isDatasetMediaRef(value: unknown): value is DatasetMediaRef {
  return Boolean(value && typeof value === 'object');
}

function rowMedia(row: Record<string, unknown>): DatasetMediaRef[] {
  const explicitMedia = Array.isArray(row.media) ? row.media.filter(isDatasetMediaRef) : [];
  if (explicitMedia.length) return explicitMedia;
  return inferRowMediaFromFields(row);
}

function rowMediaForColumn(row: Record<string, unknown>, column: DatasetColumn, value?: unknown): DatasetMediaRef | null {
  const mediaType = normalizeDesignerMediaKind(column.data_type);
  const mediaItems = rowMedia(row);
  const cellUrl = mediaUrlFromValue(value);
  const cellName = mediaNameFromValue(value);
  const targetNames = new Set(
    [cellUrl, cellName, cellUrl.split('/').pop(), cellName.split('/').pop()]
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean),
  );
  return mediaItems.find((item) => {
    const itemType = normalizeDesignerMediaKind(item.type || item.media_type);
    if (mediaType && itemType && mediaType !== itemType) return false;
    if (item.field === column.name) return true;
    const itemUrl = mediaUrlFromValue(item);
    const itemName = mediaNameFromValue(item);
    const itemNames = [itemUrl, itemName, itemUrl.split('/').pop(), itemName.split('/').pop()]
      .map((entry) => String(entry || '').trim().toLowerCase())
      .filter(Boolean);
    return itemNames.some((entry) => targetNames.has(entry));
  }) ?? null;
}

function normalizeDatasetPreviewMediaValue(value: unknown): string | DatasetMediaRef | null {
  if (typeof value === 'string' && value.trim()) return value;
  if (isDatasetMediaRef(value)) return value;
  return null;
}

function inferRowMediaFromFields(row: Record<string, unknown>): DatasetMediaRef[] {
  return Object.entries(row)
    .filter(([key]) => !['media', 'attachments', 'derived_context', '_bindings'].includes(key))
    .reduce<DatasetMediaRef[]>((items, [field, value]) => {
      const url = mediaUrlFromValue(value);
      if (!url || !looksLikeMediaReference(field, url)) return items;
      const type = inferMediaType(url);
      if (!['image', 'audio', 'video', 'document'].includes(type)) return items;
      items.push({
        id: field,
        type,
        role: field.toLowerCase().includes('primary') ? 'primary' : 'context',
        source: /^https?:\/\//i.test(url) ? 'external_url' : 'object_storage',
        field,
        url,
        name: mediaNameFromValue(value) || field,
        status: 'ready',
      });
      return items;
    }, []);
}

function looksLikeMediaReference(field: string, url: string): boolean {
  const loweredField = field.toLowerCase();
  const loweredUrl = url.toLowerCase();
  if (/(^|_)(image|img|picture|photo|audio|voice|sound|video|media|file|attachment|url|uri)(_|$)/.test(loweredField)) return true;
  return /\.(png|jpg|jpeg|gif|webp|mp3|wav|m4a|ogg|aac|flac|opus|mp4|mov|webm|m4v|avi|mkv|3gp|pdf|docx?)(\?.*)?$/.test(loweredUrl);
}

function datasetMediaSummary(dataset: DatasetPayload): { types: string[]; bound: number; unbound: number; failed: number } {
  const rowMediaItems = (dataset.rows ?? dataset.preview_rows ?? []).flatMap(rowMedia);
  const schemaTypes = (dataset.media_schema ?? []).map((item) => String(item.type || '')).filter(Boolean);
  const assetTypes = (dataset.media_assets ?? []).map((item) => String(item.type || '')).filter(Boolean);
  const rowTypes = rowMediaItems.map((item) => String(item.type || '')).filter(Boolean);
  const summary = dataset.processing_summary ?? {};
  return {
    types: Array.from(new Set([...schemaTypes, ...rowTypes, ...assetTypes])),
    bound: Number(summary.bound_media_count ?? rowMediaItems.length ?? 0),
    unbound: Number(summary.unbound_media_count ?? Math.max(0, (dataset.media_assets?.length ?? 0) - rowMediaItems.length)),
    failed: Number(summary.failed_count ?? rowMediaItems.filter((item) => item.status === 'failed').length),
  };
}

function preserveDatasetMultimodalState(previous: DatasetPayload, next: DatasetPayload): DatasetPayload {
  return mergeDatasetPayload(previous, next);
}

function mergeDatasetPayload(previous: DatasetPayload, next: DatasetPayload): DatasetPayload {
  const hasFullRows = Object.prototype.hasOwnProperty.call(next, 'rows');
  const shouldUseNextRows = hasFullRows && (Boolean(next.rows?.length) || next.row_count === 0);
  return {
    ...next,
    media_assets: hasFullRows || next.media_assets?.length ? next.media_assets : previous.media_assets,
    media_schema: hasFullRows || next.media_schema?.length ? next.media_schema : previous.media_schema,
    context_schema: hasFullRows || next.context_schema?.length ? next.context_schema : previous.context_schema,
    processing_summary: hasFullRows || (next.processing_summary && Object.keys(next.processing_summary).length) ? next.processing_summary : previous.processing_summary,
    rows: shouldUseNextRows ? next.rows : previous.rows,
    preview_rows: next.preview_rows?.length || next.row_count === 0 ? next.preview_rows : previous.preview_rows,
  };
}

function mediaTypeLabel(type?: string | null): string {
  if (type === 'image') return '图片';
  if (type === 'audio') return '音频';
  if (type === 'video') return '视频';
  if (type === 'document') return '文档';
  if (type === 'text') return '文本';
  return '文件';
}

function datasetMediaSourceLabel(source?: string | null): string {
  const normalized = String(source || '').toLowerCase();
  if (normalized === 'row' || normalized === 'field') return '行级字段';
  if (normalized === 'manifest') return 'Manifest';
  if (normalized === 'external') return '外部链接';
  if (normalized === 'upload' || normalized === 'uploaded') return '上传素材';
  if (normalized === 'asset') return '数据集素材';
  return normalized || '数据行';
}

function normalizeDatasetMediaType(media: DatasetMediaRef): string {
  return String(media.type || media.media_type || inferMediaType(String(media.url || media.filename || media.name || media.file_id || 'file')) || 'file');
}

const datasetMediaRoleOptions: Array<{ value: 'primary' | 'context' | 'evidence'; label: string; description: string }> = [
  { value: 'primary', label: '主展示素材', description: '作为这一行样本的主要图片、音频或视频，优先出现在样本预览和模板展示中。' },
  { value: 'context', label: '补充上下文', description: '作为辅助材料随样本一起提供给模型助手和审核人员，不作为默认主媒体展示。' },
  { value: 'evidence', label: '参考附件', description: '作为审核佐证材料，供 Reviewer 复核时查看。' },
];

function datasetMediaRoleLabel(role?: string | null): string {
  return datasetMediaRoleOptions.find((item) => item.value === role)?.label || role || '-';
}

function normalizeDesignerMediaKind(type: unknown): string | null {
  const text = String(type || '').toLowerCase();
  if (!text) return null;
  if (text.includes('image') || text === '图片') return 'image';
  if (text.includes('audio') || text === '音频') return 'audio';
  if (text.includes('video') || text === '视频') return 'video';
  if (text.includes('document') || text.includes('pdf') || text === '文档') return 'document';
  return text;
}

function mediaTypeColor(type?: string | null): string {
  if (type === 'image') return 'cyan';
  if (type === 'audio') return 'geekblue';
  if (type === 'video') return 'volcano';
  if (type === 'document') return 'gold';
  if (type === 'text') return 'green';
  return 'default';
}

function mediaUrlFromValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return String(record.url || record.src || record.href || record.preview_url || record.data_url || '');
  }
  return '';
}

function mediaNameFromValue(value: unknown): string {
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return String(record.name || record.filename || record.url || record.src || '');
  }
  return String(value ?? '');
}

function buildDatasetQuestionContext(dataset: DatasetPayload, row: Record<string, unknown>, rowIndex: number) {
  const media = rowMedia(row);
  const derivedContext = row.derived_context && typeof row.derived_context === 'object' ? row.derived_context as Record<string, unknown> : {};
  const textFields = Object.fromEntries(
    Object.entries(row)
      .filter(([key, value]) => !['media', 'attachments', 'derived_context', '_bindings'].includes(key) && typeof value !== 'object')
      .slice(0, 30)
      .map(([key, value]) => [key, String(value ?? '')]),
  );
  return {
    dataset: {
      dataset_id: dataset.dataset_id,
      name: dataset.name,
      source_format: dataset.source_format,
      media_schema: dataset.media_schema ?? [],
      context_schema: dataset.context_schema ?? [],
    },
    sample: {
      row_index: rowIndex,
      row_id: row.row_id || row.external_id || `row-${rowIndex + 1}`,
      text_fields: textFields,
      structured_fields: Object.fromEntries(Object.entries(row).filter(([key]) => !['media', 'attachments', 'derived_context', '_bindings'].includes(key)).slice(0, 30)),
      media,
      attachments: Array.isArray(row.attachments) ? row.attachments : [],
      derived_context: derivedContext,
    },
    text_fallback: {
      fields: textFields,
      ocr_text: derivedContext.ocr_text,
      asr_text: derivedContext.asr_text,
      caption: derivedContext.caption,
      summary: derivedContext.summary,
      video_keyframes: derivedContext.video_keyframes,
      media_index: media.map((item) => ({ id: item.id, type: item.type, role: item.role, field: item.field, name: item.name })),
    },
  };
}

function shorten(value: string, max = 48): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function sanitizeFilename(value: string): string {
  const name = value.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-');
  return name || 'markup-template';
}

function defaultColumnWidth(column: DatasetColumn): number {
  if (column.data_type === 'number') return 120;
  if (['image', 'audio', 'video'].includes(column.data_type)) return 220;
  if (column.data_type === 'json') return 260;
  return 180;
}

function defaultColumnWidths(columns: DatasetColumn[]): Record<string, number> {
  return Object.fromEntries(columns.map((column) => [column.name, defaultColumnWidth(column)]));
}

function clampColumnWidth(width: number): number {
  return Math.min(520, Math.max(96, Math.round(width)));
}

function autoColumnWidth(column: DatasetColumn, rows: Array<Record<string, unknown>>): number {
  const sample = rows.slice(0, 20).map((row) => cellText(row[column.name]).length);
  const maxLength = Math.max(column.name.length, ...sample, 8);
  return clampColumnWidth(maxLength * 9 + 48);
}

function loadDatasetColumnWidths(datasetId: string, columns: DatasetColumn[], fallback: Record<string, number>): Record<string, number> {
  if (typeof window === 'undefined') return { ...defaultColumnWidths(columns), ...fallback };
  const raw = window.localStorage.getItem(`markup_dataset_column_widths_${datasetId}`);
  if (!raw) return { ...defaultColumnWidths(columns), ...fallback };
  try {
    const saved = JSON.parse(raw) as Record<string, number>;
    return { ...defaultColumnWidths(columns), ...saved };
  } catch {
    return { ...defaultColumnWidths(columns), ...fallback };
  }
}

function saveDatasetColumnWidths(datasetId: string, widths: Record<string, number>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(`markup_dataset_column_widths_${datasetId}`, JSON.stringify(widths));
}

function updateActiveTab(schema: TemplateSchemaPayload, tabId: string, nextTab: TemplateTabSchema): TemplateSchemaPayload {
  return { ...schema, tabs: schema.tabs.map((tab) => (tab.id === tabId ? nextTab : tab)) };
}

function updateComponent(schema: TemplateSchemaPayload, tabId: string, component: TemplateComponentSchema): TemplateSchemaPayload {
  return {
    ...schema,
    tabs: schema.tabs.map((tab) => tab.id === tabId ? { ...tab, components: tab.components.map((item) => item.id === component.id ? component : item) } : tab),
  };
}

function insertComponentBefore(schema: TemplateSchemaPayload, tabId: string, component: TemplateComponentSchema, targetId: string): TemplateSchemaPayload {
  return {
    ...schema,
    tabs: schema.tabs.map((tab) => {
      if (tab.id !== tabId) return tab;
      const targetIndex = tab.components.findIndex((item) => item.id === targetId);
      if (targetIndex < 0) return { ...tab, components: [...tab.components, component] };
      return { ...tab, components: [...tab.components.slice(0, targetIndex), component, ...tab.components.slice(targetIndex)] };
    }),
  };
}

function insertComponentAfter(schema: TemplateSchemaPayload, tabId: string, component: TemplateComponentSchema, targetId: string): TemplateSchemaPayload {
  return {
    ...schema,
    tabs: schema.tabs.map((tab) => {
      if (tab.id !== tabId) return tab;
      const targetIndex = tab.components.findIndex((item) => item.id === targetId);
      if (targetIndex < 0) return { ...tab, components: [...tab.components, component] };
      return { ...tab, components: [...tab.components.slice(0, targetIndex + 1), component, ...tab.components.slice(targetIndex + 1)] };
    }),
  };
}

function moveComponent(schema: TemplateSchemaPayload, tabId: string, movingId: string, targetId: string): TemplateSchemaPayload {
  if (movingId === targetId) return schema;
  return {
    ...schema,
    tabs: schema.tabs.map((tab) => {
      if (tab.id !== tabId) return tab;
      const moving = tab.components.find((item) => item.id === movingId);
      if (!moving) return tab;
      const remaining = tab.components.filter((item) => item.id !== movingId);
      const targetIndex = remaining.findIndex((item) => item.id === targetId);
      if (targetIndex < 0) return { ...tab, components: [...remaining, moving] };
      return { ...tab, components: [...remaining.slice(0, targetIndex), moving, ...remaining.slice(targetIndex)] };
    }),
  };
}

function moveComponentAfter(schema: TemplateSchemaPayload, tabId: string, movingId: string, targetId: string): TemplateSchemaPayload {
  if (movingId === targetId) return schema;
  return {
    ...schema,
    tabs: schema.tabs.map((tab) => {
      if (tab.id !== tabId) return tab;
      const moving = tab.components.find((item) => item.id === movingId);
      if (!moving) return tab;
      const remaining = tab.components.filter((item) => item.id !== movingId);
      const targetIndex = remaining.findIndex((item) => item.id === targetId);
      if (targetIndex < 0) return { ...tab, components: [...remaining, moving] };
      return { ...tab, components: [...remaining.slice(0, targetIndex + 1), moving, ...remaining.slice(targetIndex + 1)] };
    }),
  };
}

function moveComponentByOffset(schema: TemplateSchemaPayload, tabId: string, componentId: string, offset: number): TemplateSchemaPayload {
  return {
    ...schema,
    tabs: schema.tabs.map((tab) => {
      if (tab.id !== tabId) return tab;
      const index = tab.components.findIndex((item) => item.id === componentId);
      const nextIndex = index + offset;
      if (index < 0 || nextIndex < 0 || nextIndex >= tab.components.length) return tab;
      const components = [...tab.components];
      const [item] = components.splice(index, 1);
      components.splice(nextIndex, 0, item);
      return { ...tab, components };
    }),
  };
}

function normalizeLlmComponentsLast(schema: TemplateSchemaPayload): TemplateSchemaPayload {
  return {
    ...schema,
    tabs: schema.tabs.map((tab) => {
      const llmComponents = tab.components.filter((component) => component.type === 'LLMComponent');
      if (!llmComponents.length) return tab;
      return {
        ...tab,
        components: [
          ...tab.components.filter((component) => component.type !== 'LLMComponent'),
          ...llmComponents,
        ],
      };
    }),
  };
}

function updateTabTitle(schema: TemplateSchemaPayload, tabId: string, title: string): TemplateSchemaPayload {
  return { ...schema, tabs: schema.tabs.map((tab) => (tab.id === tabId ? { ...tab, title } : tab)) };
}

function normalizeImportedTemplateSchema(raw: unknown): TemplateSchemaPayload {
  if (!isRecord(raw)) throw new Error('Schema 必须是 JSON 对象');
  if (typeof raw.schema_version !== 'string' || !raw.schema_version.trim()) throw new Error('缺少 schema_version');
  if (!Array.isArray(raw.tabs) || raw.tabs.length === 0) throw new Error('tabs 必须是非空数组');
  const seenIds = new Set<string>();
  const seenFields = new Set<string>();
  const tabs = raw.tabs.map((tabRaw, tabIndex) => {
    if (!isRecord(tabRaw)) throw new Error(`第 ${tabIndex + 1} 个页签必须是对象`);
    const id = typeof tabRaw.id === 'string' && tabRaw.id.trim() ? tabRaw.id.trim() : `tab_${tabIndex + 1}`;
    const title = typeof tabRaw.title === 'string' && tabRaw.title.trim() ? tabRaw.title.trim() : `页签 ${tabIndex + 1}`;
    const componentsRaw = Array.isArray(tabRaw.components) ? tabRaw.components : [];
    const components = componentsRaw.map((componentRaw, componentIndex) => normalizeImportedComponent(componentRaw, tabIndex, componentIndex, seenIds, seenFields));
    return { id, title, components };
  });
  return {
    schema_version: raw.schema_version.trim(),
    tabs,
    components: Array.isArray(raw.components) ? raw.components.filter(isRecord).map((item) => item as unknown as TemplateComponentSchema) : [],
    validation_rules: normalizeFrontendValidationRules(isRecord(raw.validation_rules) ? raw.validation_rules as TemplateSchemaPayload['validation_rules'] : {}),
    linkage_rules: Array.isArray(raw.linkage_rules) ? raw.linkage_rules.filter(isRecord).map((rule) => rule as TemplateLinkageRule) : [],
    llm_config: isRecord(raw.llm_config) ? raw.llm_config : {},
  };
}

function normalizeDesignerSchema(raw: unknown): TemplateSchemaPayload {
  try {
    return normalizeLlmComponentsLast(normalizeFrontendTemplateSchema(normalizeImportedTemplateSchema(raw)));
  } catch {
    return defaultSchema();
  }
}

function normalizeFrontendTemplateSchema(schema: TemplateSchemaPayload): TemplateSchemaPayload {
  const originalVersion = schema.schema_version || '1.0';
  return {
    ...schema,
    schema_version: '1.1',
    validation_rules: normalizeFrontendValidationRules(schema.validation_rules),
    linkage_rules: Array.isArray(schema.linkage_rules) ? schema.linkage_rules : [],
    llm_config: isRecord(schema.llm_config) ? schema.llm_config : {},
    compatibility: originalVersion === '1.1'
      ? schema.compatibility
      : {
          ...schema.compatibility,
          normalized_from: originalVersion,
          normalized_to: '1.1',
          strategy: 'backward_compatible_runtime',
        },
  };
}

function normalizeFrontendValidationRules(rules: TemplateSchemaPayload['validation_rules']): TemplateSchemaPayload['validation_rules'] {
  const normalized: TemplateSchemaPayload['validation_rules'] = {};
  Object.entries(rules ?? {}).forEach(([field, rawRules]) => {
    if (Array.isArray(rawRules)) normalized[field] = rawRules.filter(isRecord).map((rule) => rule as TemplateValidationRulePayload);
    else if (isRecord(rawRules)) normalized[field] = [rawRules as TemplateValidationRulePayload];
  });
  return normalized;
}

function normalizeImportedComponent(
  raw: unknown,
  tabIndex: number,
  componentIndex: number,
  seenIds: Set<string>,
  seenFields: Set<string>,
): TemplateComponentSchema {
  if (!isRecord(raw)) throw new Error(`第 ${tabIndex + 1} 个页签的第 ${componentIndex + 1} 个组件必须是对象`);
  const type = raw.type;
  if (!isTemplateComponentType(type)) throw new Error(`组件类型 ${String(type || '(空)')} 不在物料注册表中`);
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `${String(type).toLowerCase()}_${componentIndex + 1}`;
  const field = typeof raw.field === 'string' && raw.field.trim() ? raw.field.trim() : id;
  if (seenIds.has(id)) throw new Error(`组件 ID 重复：${id}`);
  if (!nonAnswerComponentTypes.has(type) && seenFields.has(field)) throw new Error(`答案字段重复：${field}`);
  seenIds.add(id);
  if (!nonAnswerComponentTypes.has(type)) seenFields.add(field);
  return {
    id,
    type,
    field,
    label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : field,
    required: Boolean(raw.required),
    config: isRecord(raw.config) ? raw.config : {},
    options: Array.isArray(raw.options) ? raw.options.filter(isRecord).map((option, index) => ({
      value: typeof option.value === 'string' ? option.value : `option_${index + 1}`,
      label: typeof option.label === 'string' ? option.label : String(option.value ?? `选项 ${index + 1}`),
    })) : [],
    version: typeof raw.version === 'string' && raw.version.trim() ? raw.version.trim() : '1.0',
  };
}

function isTemplateComponentType(value: unknown): value is TemplateComponentType {
  return palette.some((item) => item.type === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isDataBindingPayload(value: unknown): value is DataBindingPayload {
  return isRecord(value) && typeof value.source_type === 'string';
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function stringFromRecord(record: Record<string, unknown>, key: string, fallback = ''): string {
  const value = record[key];
  if (value === null || typeof value === 'undefined') return fallback;
  return String(value);
}

function resolveImportedReferenceDatasetId(rawRecord: Record<string, unknown>, schemaRecord: Record<string, unknown>, datasets: DatasetPayload[]): string {
  const llmConfig = isRecord(schemaRecord.llm_config) ? schemaRecord.llm_config : {};
  const candidates = [
    rawRecord.dataset_id,
    rawRecord.reference_dataset_id,
    schemaRecord.dataset_id,
    schemaRecord.reference_dataset_id,
    llmConfig.dataset_id,
    llmConfig.reference_dataset_id,
  ].map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean);
  return candidates.find((candidate) => datasets.some((dataset) => dataset.dataset_id === candidate)) ?? '';
}

function booleanFromRecord(record: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = record[key];
  return typeof value === 'boolean' ? value : fallback;
}

function stringArrayFromUnknown(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function normalizeReviewerAllocations(reviewerIds: string[], raw: unknown): ReviewerAllocationDraft[] {
  const allocationMap = new Map<string, string>();
  const selectedReviewerIds = new Set(reviewerIds);
  if (Array.isArray(raw)) {
    raw.filter(isRecord).forEach((item) => {
      const reviewerId = stringFromRecord(item, 'reviewer_id');
      if (!reviewerId || !selectedReviewerIds.has(reviewerId)) return;
      allocationMap.set(reviewerId, stringFromRecord(item, 'quota'));
    });
  }
  if (reviewerIds.length === 1 && !allocationMap.get(reviewerIds[0])) {
    allocationMap.set(reviewerIds[0], '100');
  }
  const hasExactSelectedAllocations = allocationMap.size === reviewerIds.length && reviewerIds.every((reviewerId) => allocationMap.has(reviewerId));
  const hasBlankAllocation = reviewerIds.some((reviewerId) => !(allocationMap.get(reviewerId) ?? '').trim());
  if (reviewerIds.length > 1 && (!hasExactSelectedAllocations || hasBlankAllocation)) {
    const evenShares = distributePercentEvenly(reviewerIds.length);
    reviewerIds.forEach((reviewerId, index) => allocationMap.set(reviewerId, String(evenShares[index])));
  }
  return reviewerIds.map((reviewerId) => ({ reviewer_id: reviewerId, quota: allocationMap.get(reviewerId) ?? '' }));
}

function normalizeLabelerAllocations(labelerIds: string[], raw: unknown): LabelerAllocationDraft[] {
  const allocationMap = new Map<string, string>();
  const selectedLabelerIds = new Set(labelerIds);
  if (Array.isArray(raw)) {
    raw.filter(isRecord).forEach((item) => {
      const labelerId = stringFromRecord(item, 'labeler_id');
      if (!labelerId || !selectedLabelerIds.has(labelerId)) return;
      allocationMap.set(labelerId, stringFromRecord(item, 'quota'));
    });
  }
  if (labelerIds.length === 1 && !allocationMap.get(labelerIds[0])) {
    allocationMap.set(labelerIds[0], '100');
  }
  const hasExactSelectedAllocations = allocationMap.size === labelerIds.length && labelerIds.every((labelerId) => allocationMap.has(labelerId));
  const hasBlankAllocation = labelerIds.some((labelerId) => !(allocationMap.get(labelerId) ?? '').trim());
  if (labelerIds.length > 1 && (!hasExactSelectedAllocations || hasBlankAllocation)) {
    const evenShares = distributePercentEvenly(labelerIds.length);
    labelerIds.forEach((labelerId, index) => allocationMap.set(labelerId, String(evenShares[index])));
  }
  return labelerIds.map((labelerId) => ({ labeler_id: labelerId, quota: allocationMap.get(labelerId) ?? '' }));
}

function buildReviewerAllocationPayload(reviewerIds: string[], allocations: ReviewerAllocationDraft[]) {
  const allocationMap = new Map(allocations.map((item) => [item.reviewer_id, item.quota]));
  return reviewerIds.map((reviewerId) => {
    const quota = allocationMap.get(reviewerId);
    return {
      reviewer_id: reviewerId,
      quota: quota ? toNonNegativeInteger(quota) : null,
    };
  });
}

function buildLabelerAllocationPayload(labelerIds: string[], allocations: LabelerAllocationDraft[]) {
  const allocationMap = new Map(allocations.map((item) => [item.labeler_id, item.quota]));
  return labelerIds.map((labelerId) => {
    const quota = allocationMap.get(labelerId);
    return {
      labeler_id: labelerId,
      quota: quota ? toNonNegativeInteger(quota) : null,
    };
  });
}

function reviewerMemberName(member: TeamMember): string {
  return member.display_name || member.username || member.email || member.user_id;
}

function memberOptionLabel(member: TeamMember): string {
  const name = reviewerMemberName(member);
  return member.email ? `${name} / ${member.email}` : name;
}

function reviewerDisplayLabel(reviewerId: string, members: TeamMember[]): string {
  const member = members.find((item) => item.user_id === reviewerId);
  return member ? reviewerMemberName(member) : reviewerId;
}

function buildReviewerOptions(members: TeamMember[], selectedReviewerIds: string[]) {
  const options = new Map<string, { value: string; label: string }>();
  (Array.isArray(members) ? members : []).forEach((member) => {
    options.set(member.user_id, {
      value: member.user_id,
      label: memberOptionLabel(member),
    });
  });
  selectedReviewerIds.forEach((reviewerId) => {
    if (!options.has(reviewerId)) options.set(reviewerId, { value: reviewerId, label: reviewerId });
  });
  return Array.from(options.values());
}

function mergeTeamMembersById(members: TeamMember[]): TeamMember[] {
  const byId = new Map<string, TeamMember>();
  members.forEach((member) => {
    if (!member.user_id || byId.has(member.user_id)) return;
    byId.set(member.user_id, member);
  });
  return Array.from(byId.values());
}

function isActiveTeamLabelerMember(member: TeamMember): boolean {
  return (member.team_role ?? '').trim().toLowerCase() === 'labeler'
    && (member.member_status ?? 'active').trim().toLowerCase() === 'active'
    && (member.user_status ?? 'active').trim().toLowerCase() === 'active'
    && !member.is_system_member;
}

function filterActiveTeamLabelerMembers(members: TeamMember[] | undefined): TeamMember[] {
  return (Array.isArray(members) ? members : []).filter(isActiveTeamLabelerMember);
}

function stringArraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function buildTaskOwnerTransferOptions(members: TeamMember[], selectedOwnerId: string, currentOwnerId?: string | null) {
  const options = new Map<string, { value: string; label: string }>();
  (Array.isArray(members) ? members : [])
    .filter((member) => ['team_admin', 'owner'].includes(member.team_role) && member.member_status !== 'disabled' && !member.is_system_member)
    .filter((member) => !currentOwnerId || member.user_id !== currentOwnerId)
    .forEach((member) => {
      const roleLabel = member.team_role_label || (member.team_role === 'team_admin' ? 'Team Admin' : 'Owner');
      options.set(member.user_id, {
        value: member.user_id,
        label: `${memberOptionLabel(member)} · ${roleLabel}`,
      });
    });
  if (selectedOwnerId && !options.has(selectedOwnerId)) {
    options.set(selectedOwnerId, { value: selectedOwnerId, label: selectedOwnerId });
  }
  return Array.from(options.values());
}

function buildLabelerOptions(members: TeamMember[]) {
  const options = new Map<string, { value: string; label: string }>();
  (Array.isArray(members) ? members : [])
    .filter(isActiveTeamLabelerMember)
    .forEach((member) => {
      options.set(member.user_id, { value: member.user_id, label: memberOptionLabel(member) });
    });
  return Array.from(options.values());
}

function internalLabelerSummary(labelerIds: string[], members: TeamMember[]): string {
  if (!labelerIds.length) return '所有企业 Labeler';
  const names = labelerIds.map((id) => reviewerDisplayLabel(id, members));
  if (names.length <= 2) return names.join('、');
  return `${names.slice(0, 2).join('、')} 等 ${names.length} 人`;
}

function manualReviewSummaryLabel(reviewerIds: string[], allocations: ReviewerAllocationDraft[]): string {
  if (reviewerIds.length === 0) return '待分配';
  if (reviewerIds.length === 1) return '1 人 / 100%';
  const totalAllocated = reviewerAllocationTotalPercent(allocations);
  return totalAllocated > 0 ? `${reviewerIds.length} 人 / ${totalAllocated}%` : `${reviewerIds.length} 人`;
}

function internalLabelerAllocationSummaryLabel(labelerIds: string[], allocations: LabelerAllocationDraft[]): string {
  if (labelerIds.length === 0) return '所有企业 Labeler';
  if (labelerIds.length === 1) return '1 人 / 100%';
  const totalAllocated = labelerAllocationTotalPercent(allocations);
  return totalAllocated > 0 ? `${labelerIds.length} 人 / ${totalAllocated}%` : `${labelerIds.length} 人`;
}

function reviewerAllocationTotalPercent(allocations: ReviewerAllocationDraft[]) {
  return allocations.reduce((sum, item) => sum + (item.quota ? toNonNegativeInteger(item.quota) : 0), 0);
}

function labelerAllocationTotalPercent(allocations: LabelerAllocationDraft[]) {
  return allocations.reduce((sum, item) => sum + (item.quota ? toNonNegativeInteger(item.quota) : 0), 0);
}

function calculateReviewerAllocationPreview(reviewerIds: string[], allocations: ReviewerAllocationDraft[], totalItems: number): ReviewerAllocationDraft[] {
  const allocationMap = new Map(allocations.map((item) => [item.reviewer_id, item.quota]));
  const normalized = reviewerIds.map((reviewerId) => ({ reviewer_id: reviewerId, quota: allocationMap.get(reviewerId) ?? '' }));
  const safeTotalItems = Math.max(0, Math.floor(totalItems));
  const totalPercent = reviewerAllocationTotalPercent(normalized);
  if (safeTotalItems === 0 || totalPercent !== 100) {
    return normalized.map((item) => ({ ...item, item_count: undefined }));
  }
  let assignedItems = 0;
  return normalized.map((item, index) => {
    const itemCount = index === normalized.length - 1
      ? Math.max(0, safeTotalItems - assignedItems)
      : Math.round((safeTotalItems * toNonNegativeInteger(item.quota)) / 100);
    assignedItems += itemCount;
    return { ...item, item_count: itemCount };
  });
}

function calculateLabelerAllocationPreview(labelerIds: string[], allocations: LabelerAllocationDraft[], totalItems: number): LabelerAllocationDraft[] {
  const allocationMap = new Map(allocations.map((item) => [item.labeler_id, item.quota]));
  const normalized = labelerIds.map((labelerId) => ({ labeler_id: labelerId, quota: allocationMap.get(labelerId) ?? '' }));
  const safeTotalItems = Math.max(0, Math.floor(totalItems));
  const totalPercent = labelerAllocationTotalPercent(normalized);
  if (safeTotalItems === 0 || totalPercent !== 100) {
    return normalized.map((item) => ({ ...item, item_count: undefined }));
  }
  let assignedItems = 0;
  return normalized.map((item, index) => {
    const itemCount = index === normalized.length - 1
      ? Math.max(0, safeTotalItems - assignedItems)
      : Math.round((safeTotalItems * toNonNegativeInteger(item.quota)) / 100);
    assignedItems += itemCount;
    return { ...item, item_count: itemCount };
  });
}

function isReadableAgreementFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type.startsWith('text/')
    || ['application/json', 'application/x-ndjson'].includes(file.type)
    || /\.(txt|md|markdown|csv|json|jsonl|html?|text)$/i.test(name);
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function normalizeAgreementFileText(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
}

function distributePercentEvenly(count: number) {
  if (count <= 0) return [];
  const base = Math.floor(100 / count);
  const remainder = 100 % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function cloneComponent(component: TemplateComponentSchema): TemplateComponentSchema {
  return {
    ...component,
    id: `${component.field}_copy_${Math.random().toString(36).slice(2, 8)}`,
    field: `${component.field}_copy`,
    label: `${component.label} 副本`,
    config: { ...component.config },
    options: component.options.map((option) => ({ ...option })),
  };
}

function componentDescriptionText(component: TemplateComponentSchema): string {
  return String(component.config.description ?? '').trim();
}

function componentBindingMeta(component: TemplateComponentSchema): string {
  if (component.type !== 'ShowItem') return '绑定变量：不绑定原始变量';
  const displayFields = normalizeShowItemDisplayFields(component);
  if (displayFields.length > 1) return `绑定变量：${displayFields.length} 个展示字段`;
  const binding = component.config.binding && typeof component.config.binding === 'object'
    ? component.config.binding as DataBindingPayload
    : bindingFromColumn(String(component.config.content_field || '') || null);
  return `绑定变量：${bindingDisplayLabel(binding)}`;
}

function componentAnswerFieldMeta(component: TemplateComponentSchema): string {
  if (component.type === 'ShowItem') return '答案字段：不参与提交';
  if (component.type === 'LLMComponent') return '答案字段：AI 辅助参考';
  if (component.type === 'GroupContainer') return '答案字段：分组容器';
  return `答案字段：${component.field}`;
}

function componentTypeLabel(type: TemplateComponentType): string {
  const item = palette.find((entry) => entry.type === type);
  return item?.label ?? type;
}

function normalizeShowItemDisplayFields(component: TemplateComponentSchema): Array<{ label: string; field: string; binding: DataBindingPayload }> {
  const rawFields = Array.isArray(component.config.display_fields) ? component.config.display_fields : [];
  return rawFields
    .map((item): { label: string; field: string; binding: DataBindingPayload } | null => {
      if (typeof item === 'string') {
        const binding = bindingFromColumn(item);
        return binding ? { label: item, field: item, binding } : null;
      }
      if (!isRecord(item)) return null;
      const binding = isDataBindingPayload(item.binding) ? item.binding : bindingFromColumn(String(item.field || item.column || ''));
      if (!binding) return null;
      const field = bindingToColumnName(binding) || String(item.field || item.column || item.key || binding.field || binding.key || '');
      return {
        label: String(item.label || bindingDisplayLabel(binding).replace(/^数据列：|^媒体：|^上下文：|^附件：/, '') || field),
        field,
        binding,
      };
    })
    .filter((item): item is { label: string; field: string; binding: DataBindingPayload } => Boolean(item));
}

function showItemDisplayOptionValues(component: TemplateComponentSchema): string[] {
  const fields = normalizeShowItemDisplayFields(component);
  if (fields.length) return fields.map((item) => bindingToOptionValue(item.binding)).filter((item): item is string => Boolean(item));
  const binding = component.config.binding && typeof component.config.binding === 'object'
    ? component.config.binding as DataBindingPayload
    : bindingFromColumn(String(component.config.content_field || '') || null);
  const value = bindingToOptionValue(binding);
  return value ? [value] : [];
}

function showItemMappingDisplayFields(component: TemplateComponentSchema, binding: DataBindingPayload): Array<{ label: string; field: string; binding: DataBindingPayload }> {
  if (Array.isArray(binding.display_fields)) {
    return binding.display_fields
      .map((item, index): { label: string; field: string; binding: DataBindingPayload } | null => {
        if (!item || typeof item !== 'object') return null;
        const childBinding = isDataBindingPayload(item.binding) ? item.binding : bindingFromColumn(String(item.field || ''));
        if (!childBinding) return null;
        const field = bindingToColumnName(childBinding) || childBinding.field || childBinding.key || String(item.field || `field_${index + 1}`);
        return {
          label: String(item.label || bindingDisplayLabel(childBinding).replace(/^普通列 · |^媒体 · |^派生上下文 · |^附件 · /, '') || field),
          field,
          binding: childBinding,
        };
      })
      .filter((item): item is { label: string; field: string; binding: DataBindingPayload } => Boolean(item));
  }
  return normalizeShowItemDisplayFields(component);
}

function showItemDisplayBindingsFromMapping(component: TemplateComponentSchema, binding: DataBindingPayload | undefined): DataBindingPayload[] {
  if (binding) {
    const fields = showItemMappingDisplayFields(component, binding);
    if (fields.length) return fields.map((item) => item.binding);
    if (isDataBindingPayload(binding)) return [binding];
  }
  return normalizeShowItemDisplayFields(component).map((item) => item.binding);
}

function showItemMappingOptionValues(
  component: TemplateComponentSchema,
  mapping: Record<string, string | null>,
  bindingMapping: Record<string, DataBindingPayload>,
): string[] {
  const binding = bindingMapping[component.id];
  const values = showItemDisplayBindingsFromMapping(component, binding)
    .map((item) => bindingToOptionValue(item))
    .filter((item): item is string => Boolean(item));
  if (values.length) return values;
  const columnBinding = bindingFromColumn(mapping[component.id] ?? null);
  const value = bindingToOptionValue(columnBinding);
  return value ? [value] : [];
}

function showItemMappingConfigFromBindings(component: TemplateComponentSchema, bindings: DataBindingPayload[]): DataBindingPayload {
  const primary = bindings[0] ?? { source_type: 'column' };
  const displayFields = bindings.map((binding) => ({
    label: bindingDisplayLabel(binding).replace(/^普通列 · |^媒体 · |^派生上下文 · |^附件 · /, ''),
    field: bindingToColumnName(binding) || binding.field || binding.key || binding.media_type || '',
    binding,
  }));
  return {
    ...primary,
    display_fields: displayFields,
    field: primary.field ?? bindingToColumnName(primary) ?? component.field,
  };
}

function buildEffectiveShowItemBindingMapping(
  showItems: TemplateComponentSchema[],
  mapping: Record<string, string | null>,
  bindingMapping: Record<string, DataBindingPayload>,
): Record<string, DataBindingPayload> {
  const next: Record<string, DataBindingPayload> = {};
  for (const component of showItems) {
    const current = bindingMapping[component.id];
    if (current) {
      next[component.id] = current;
      continue;
    }
    const configuredFields = normalizeShowItemDisplayFields(component);
    if (configuredFields.length) {
      next[component.id] = showItemMappingConfigFromBindings(component, configuredFields.map((item) => item.binding));
      continue;
    }
    const configuredBinding = component.config.binding && typeof component.config.binding === 'object'
      ? component.config.binding as DataBindingPayload
      : null;
    if (configuredBinding) {
      next[component.id] = configuredBinding;
      continue;
    }
    const columnBinding = bindingFromColumn(mapping[component.id] ?? null);
    if (columnBinding) next[component.id] = columnBinding;
  }
  return next;
}

function showItemMappingIsConfigured(
  component: TemplateComponentSchema,
  mapping: Record<string, string | null>,
  bindingMapping: Record<string, DataBindingPayload>,
): boolean {
  return Boolean(bindingMapping[component.id] || mapping[component.id] || normalizeShowItemDisplayFields(component).length);
}

function bindingDisplayLabel(binding: DataBindingPayload | null): string {
  if (!binding) return '发布时映射';
  if (binding.source_type === 'column') return `普通列 · ${binding.column_name || binding.field || '未选择'}`;
  if (binding.source_type === 'media') return `${mediaTypeLabel(binding.media_type)} · ${binding.role || 'context'} · ${binding.field || 'media'}`;
  if (binding.source_type === 'derived_context') return `派生上下文 · ${binding.key || binding.field || '未选择'}`;
  if (binding.source_type === 'attachment') return `附件 · ${binding.key || binding.field || '未选择'}`;
  return `${binding.source_type} · ${binding.field || binding.key || binding.column_name || '未选择'}`;
}

function singleComponentPreviewSchema(component: TemplateComponentSchema): TemplateSchemaPayload {
  return {
    schema_version: '1.1',
    tabs: [{ id: 'preview', title: '绑定预览', components: [component] }],
    components: [],
    validation_rules: {},
    linkage_rules: [],
    llm_config: {},
  };
}

function RuntimeValidationRuleEditor({
  component,
  rules,
  onPatch,
  onRemove,
}: {
  component: TemplateComponentSchema;
  rules: TemplateValidationRulePayload[];
  onPatch: (type: string, patch: Partial<TemplateValidationRulePayload>) => void;
  onRemove: (type: string) => void;
}) {
  const rule = (type: string) => rules.find((item) => validationRuleType(item) === type);
  const isText = ['TextInput', 'TextArea', 'RichEditor'].includes(component.type);
  const isMultiChoice = ['MultiSelect', 'TagSelect'].includes(component.type);
  const requiredRule = rule('required');
  const minLengthRule = rule('min_length');
  const maxLengthRule = rule('max_length');
  const patternRule = rule('pattern');
  const minSelectedRule = rule('min_selected');
  const maxSelectedRule = rule('max_selected');
  const customTextRule = rule('custom_text');

  return (
    <div className="validation-grid">
      <div className="property-switch-row form-span">
        <span>顶层必填规则</span>
        <Switch
          size="small"
          aria-label="启用顶层必填规则"
          checked={Boolean(requiredRule)}
          onChange={(checked) => checked ? onPatch('required', { enabled: true }) : onRemove('required')}
        />
      </div>
      {isText && (
        <>
          <label>最小长度规则
            <InputNumber
              aria-label="顶层最小长度规则"
              min={0}
              value={numericRuleValue(minLengthRule)}
              placeholder="不启用"
              onChange={(value) => value === null ? onRemove('min_length') : onPatch('min_length', { value: value ?? 0 })}
            />
          </label>
          <label>最大长度规则
            <InputNumber
              aria-label="顶层最大长度规则"
              min={0}
              value={numericRuleValue(maxLengthRule)}
              placeholder="不启用"
              onChange={(value) => value === null ? onRemove('max_length') : onPatch('max_length', { value: value ?? 0 })}
            />
          </label>
          <label className="form-span">正则规则
            <Input
              aria-label="顶层正则规则"
              value={String(patternRule?.value ?? patternRule?.pattern ?? '')}
              onChange={(event) => event.target.value ? onPatch('pattern', { value: event.target.value }) : onRemove('pattern')}
              placeholder="例如 ^[A-Z0-9_-]+$；清空则不启用"
            />
          </label>
          <label>文本规则
            <Select
              aria-label="顶层文本规则"
              value={String(customTextRule?.operator ?? '')}
              options={[
                { value: '', label: '不启用' },
                { value: 'contains', label: '必须包含' },
                { value: 'not_contains', label: '不能包含' },
                { value: 'starts_with', label: '必须以...开头' },
                { value: 'ends_with', label: '必须以...结尾' },
              ]}
              onChange={(operator) => operator ? onPatch('custom_text', { operator }) : onRemove('custom_text')}
            />
          </label>
          <label>文本规则值
            <Input
              aria-label="顶层文本规则值"
              value={String(customTextRule?.value ?? '')}
              disabled={!customTextRule}
              onChange={(event) => onPatch('custom_text', { value: event.target.value })}
              placeholder="例如：合规"
            />
          </label>
        </>
      )}
      {isMultiChoice && (
        <>
          <label>最少选择规则
            <InputNumber
              aria-label="顶层最少选择规则"
              min={0}
              value={numericRuleValue(minSelectedRule)}
              placeholder="不启用"
              onChange={(value) => value === null ? onRemove('min_selected') : onPatch('min_selected', { value: value ?? 0 })}
            />
          </label>
          <label>最多选择规则
            <InputNumber
              aria-label="顶层最多选择规则"
              min={0}
              value={numericRuleValue(maxSelectedRule)}
              placeholder="不启用"
              onChange={(value) => value === null ? onRemove('max_selected') : onPatch('max_selected', { value: value ?? 0 })}
            />
          </label>
        </>
      )}
      <label className="form-span">自定义错误提示
        <Input
          aria-label="顶层自定义错误提示"
          value={String((customTextRule ?? patternRule ?? minLengthRule ?? maxLengthRule ?? minSelectedRule ?? maxSelectedRule)?.message ?? '')}
          disabled={!customTextRule && !patternRule && !minLengthRule && !maxLengthRule && !minSelectedRule && !maxSelectedRule}
          onChange={(event) => {
            const target = customTextRule ? 'custom_text' : patternRule ? 'pattern' : minLengthRule ? 'min_length' : maxLengthRule ? 'max_length' : minSelectedRule ? 'min_selected' : maxSelectedRule ? 'max_selected' : '';
            if (target) onPatch(target, { message: event.target.value });
          }}
          placeholder="选填，默认使用系统提示"
        />
      </label>
    </div>
  );
}

function findLinkageRuleForComponent(rules: TemplateLinkageRule[], component: TemplateComponentSchema): TemplateLinkageRule | null {
  return rules.find((rule) => isLinkageRuleTargetingComponent(rule, component)) ?? null;
}

function validationRulesForField(rules: TemplateSchemaPayload['validation_rules'], field: string): TemplateValidationRulePayload[] {
  const rawRules = rules[field];
  if (Array.isArray(rawRules)) return rawRules.filter(isRecord).map((rule) => rule as TemplateValidationRulePayload);
  if (isRecord(rawRules)) return [rawRules as TemplateValidationRulePayload];
  return [];
}

function validationRuleType(rule: TemplateValidationRulePayload): string {
  return String(rule.type ?? rule.rule ?? '');
}

function upsertValidationRule(rules: TemplateSchemaPayload['validation_rules'], field: string, type: string, patch: Partial<TemplateValidationRulePayload>): TemplateSchemaPayload['validation_rules'] {
  const current = validationRulesForField(rules, field);
  const existing = current.find((rule) => validationRuleType(rule) === type);
  const nextRule: TemplateValidationRulePayload = {
    ...(existing ?? {}),
    ...patch,
    type,
    enabled: patch.enabled ?? existing?.enabled ?? true,
  };
  const nextRules = existing
    ? current.map((rule) => validationRuleType(rule) === type ? nextRule : rule)
    : [...current, nextRule];
  return { ...rules, [field]: nextRules };
}

function removeValidationRule(rules: TemplateSchemaPayload['validation_rules'], field: string, type: string): TemplateSchemaPayload['validation_rules'] {
  const nextRules = validationRulesForField(rules, field).filter((rule) => validationRuleType(rule) !== type);
  const next = { ...rules };
  if (nextRules.length) next[field] = nextRules;
  else delete next[field];
  return next;
}

function numericRuleValue(rule?: TemplateValidationRulePayload): number | null {
  const value = rule?.value ?? rule?.limit ?? rule?.length ?? rule?.count;
  return typeof value === 'number' ? value : null;
}

function renameValidationRuleField(rules: TemplateSchemaPayload['validation_rules'], previousField: string, nextField: string): TemplateSchemaPayload['validation_rules'] {
  if (!previousField || !nextField || previousField === nextField || !rules[previousField]) return rules;
  const next = { ...rules, [nextField]: rules[previousField] };
  delete next[previousField];
  return next;
}

function renameLinkageRuleField(rule: TemplateLinkageRule, previousField: string, nextField: string): TemplateLinkageRule {
  if (!previousField || !nextField || previousField === nextField) return rule;
  const renameCondition = <T extends { source_field?: string; field?: string; when_field?: string; target_field?: string; target?: string; then_field?: string }>(condition: T): T => ({
    ...condition,
    source_field: condition.source_field === previousField ? nextField : condition.source_field,
    field: condition.field === previousField ? nextField : condition.field,
    when_field: condition.when_field === previousField ? nextField : condition.when_field,
    target_field: condition.target_field === previousField ? nextField : condition.target_field,
    target: condition.target === previousField ? nextField : condition.target,
    then_field: condition.then_field === previousField ? nextField : condition.then_field,
  });
  return {
    ...renameCondition(rule),
    conditions: Array.isArray(rule.conditions) ? rule.conditions.map((condition) => renameCondition(condition)) : rule.conditions,
  };
}

function defaultLinkageRuleForComponent(component: TemplateComponentSchema, components: TemplateComponentSchema[]): TemplateLinkageRule {
  const source = components.find((item) => item.id !== component.id && !nonAnswerComponentTypes.has(item.type));
  return {
    source_field: source?.field ?? '',
    operator: 'equals',
    value: source && ['SingleSelect', 'MultiSelect', 'TagSelect', 'Ranking'].includes(source.type) ? source.options[0]?.value ?? '' : '',
    target_component_id: component.id,
    action: 'show',
  };
}

function isLinkageRuleTargetingComponent(rule: TemplateLinkageRule, component: TemplateComponentSchema): boolean {
  const target = String(rule.target_component_id ?? rule.target_component ?? rule.target_id ?? rule.target_field ?? rule.target ?? rule.then_field ?? '');
  return target === component.id || target === component.field;
}

function linkageRuleReferencesComponent(rule: TemplateLinkageRule, component: TemplateComponentSchema): boolean {
  const source = String(rule.source_field ?? rule.source_component_id ?? rule.field ?? rule.when_field ?? '');
  return isLinkageRuleTargetingComponent(rule, component) || source === component.id || source === component.field;
}

function linkageRuleReferencesIds(rule: TemplateLinkageRule, ids: Set<string>, fields: Set<string>): boolean {
  const source = String(rule.source_field ?? rule.source_component_id ?? rule.field ?? rule.when_field ?? '');
  const target = String(rule.target_component_id ?? rule.target_component ?? rule.target_id ?? rule.target_field ?? rule.target ?? rule.then_field ?? '');
  return ids.has(source) || fields.has(source) || ids.has(target) || fields.has(target);
}

function extractShowItems(schema?: TemplateSchemaPayload): TemplateComponentSchema[] {
  if (!schema) return [];
  return extractTemplateComponents(schema).filter((component) => component.type === 'ShowItem');
}

function extractImageMaskComponents(schema?: TemplateSchemaPayload): TemplateComponentSchema[] {
  if (!schema) return [];
  return extractTemplateComponents(schema).filter((component) => component.type === 'ImageMaskAnnotation');
}

function extractAnswerFields(schema?: TemplateSchemaPayload): TemplateComponentSchema[] {
  if (!schema) return [];
  return extractTemplateComponents(schema).filter((component) => !nonAnswerComponentTypes.has(component.type));
}

function extractTemplateComponents(schema: TemplateSchemaPayload): TemplateComponentSchema[] {
  return [
    ...schema.tabs.flatMap((tab) => tab.components),
    ...(Array.isArray(schema.components) ? schema.components : []),
  ];
}

function schemaHasLabelingAiAssist(schema?: TemplateSchemaPayload | null): boolean {
  if (!schema) return false;
  return schema.tabs.some((tab) => tab.components.some((component) => {
    const componentRecord = asRecord(component);
    const props = asRecord(componentRecord.props);
    const raw = [
      component.type,
      componentRecord.component_id,
      component.label,
      props.mode,
      props.kind,
    ].filter(Boolean).join(' ').toLowerCase();
    return raw.includes('llm') || raw.includes('labeling_ai_assist') || raw.includes('ai_assist') || raw.includes('ai 辅助');
  }));
}

function llmProviderSelectLabel(provider: AiProviderConfigPayload): string {
  const name = provider.provider_name || provider.route_name || provider.provider || 'Provider';
  const model = resolveAiProviderModel(provider);
  return name || model || 'Provider';
}

function llmProviderFullLabel(provider: AiProviderConfigPayload): string {
  return [
    provider.provider_name || provider.route_name || provider.provider,
    provider.scope === 'platform' ? (provider.is_platform_default ? '平台默认' : '平台共享') : '企业自有',
    ...(provider.scope === 'platform' ? [] : [provider.provider_kind || provider.provider, resolveAiProviderModel(provider)]),
  ].filter(Boolean).join(' / ');
}

function LlmProviderSummary({ provider }: { provider: AiProviderConfigPayload | null }) {
  if (!provider) {
    return <Alert type="error" showIcon title="当前保存的 Provider 不存在或未启用，请重新选择。" />;
  }
  return (
    <div className="llm-provider-summary" title={llmProviderFullLabel(provider)}>
      <span>{provider.scope === 'platform' ? (provider.is_platform_default ? '平台默认' : '平台共享') : '企业自有'}</span>
      <span>{provider.provider_kind || provider.provider}</span>
      <span>{resolveAiProviderModel(provider) || 'Provider 默认模型'}</span>
    </div>
  );
}

function resolveAiProviderModel(provider: AiProviderConfigPayload | null): string {
  if (!provider) return '';
  return provider.default_model || provider.models[0] || provider.provider || '';
}

function getAiProviderCapabilityWarning(provider: AiProviderConfigPayload | null, category: string): string | null {
  if (!provider || !['image', 'audio', 'video', 'multimodal'].includes(category)) return null;
  if (providerSupportsTaskCategory(provider, category)) return null;
  const categoryLabel = categoryLabelText(category);
  return `当前任务类型需要 ${categoryLabel} 能力，所选 Provider 未声明支持该输入类型。请更换可用 Provider 或先补齐能力配置。`;
}

function buildAiGeneratedInputBrief(
  dataset: DatasetPayload | null,
  template: TemplatePayload | null,
  showItems: TemplateComponentSchema[],
  answerFields: TemplateComponentSchema[],
  mapping: Record<string, string | null>,
): string {
  const datasetLines = dataset?.columns.map((column) => {
    const sample = column.samples?.find((value) => value !== null && value !== undefined && String(value).trim() !== '');
    const sampleHint = sample !== undefined ? `；上下文样例：${String(sample).slice(0, 80)}` : '';
    return `- ${column.name}: 待 AI 结合字段名、数据集「${dataset?.name || '未选择数据集'}」、模板「${template?.name || '未选择模板'}」和样例推断业务含义；字段类型 ${column.data_type || 'text'}${column.comment ? `；字段备注：${column.comment}` : ''}${sampleHint}`;
  }) ?? [];
  const showItemLines = showItems.map((component) => `- ${component.label}: Labeler 可见展示项，绑定数据字段 ${mapping[component.id] || '未映射'}；AI 需基于上下文解释该字段在审核中的含义。`);
  const answerLines = answerFields.map((component) => `- ${component.label}: Labeler 提交 JSON 字段 ${component.field}，题型 ${component.type}${component.required ? '，必填' : '，选填'}；AI 需说明该答案字段期望表达的业务结果。`);
  return [
    '以下内容为 AI 字段语义说明草案，后续由 AI Gateway 调用所选 Provider 生成，可由发布者编辑确认。',
    '',
    `任务模板上下文：${template?.name || '未选择模板'}`,
    `数据集上下文：${dataset?.name || '未选择数据集'}，共 ${dataset?.row_count ?? 0} 行。`,
    '',
    '数据集变量语义推断：',
    datasetLines.length ? datasetLines.join('\n') : '- 暂无数据集字段。',
    '',
    '标注端展示字段语义：',
    showItemLines.length ? showItemLines.join('\n') : '- 当前模板未配置 ShowItem。',
    '',
    '待审核 JSON 答案字段语义：',
    answerLines.length ? answerLines.join('\n') : '- 当前模板未配置答案字段。',
  ].join('\n');
}

function buildSafeAiDatasetContext(dataset: DatasetPayload | null): Record<string, unknown> | null {
  if (!dataset) return null;
  const sourceRows = (dataset.preview_rows?.length ? dataset.preview_rows : dataset.rows ?? []).slice(0, 5);
  const mediaSchemaFields = datasetMediaSchemaFieldSet(dataset);
  const allowedColumns = dataset.columns.filter((column) => datasetColumnAvailableForMapping(column) && !mediaSchemaFields.has(column.name));
  const mappedColumnNames = new Set(allowedColumns.map((column) => column.name));
  const sampleRows = sourceRows.map((row, rowIndex) => ({
    row_index: rowIndex + 1,
    values: Object.fromEntries(
      Object.entries(row)
        .filter(([key]) => mappedColumnNames.has(key))
        .slice(0, 12)
        .map(([key, value]) => [key, compactAiSampleValue(value)]),
    ),
  }));
  return {
    dataset_id: dataset.dataset_id,
    name: dataset.name,
    description: dataset.description,
    row_count: dataset.row_count,
    columns: allowedColumns.map((column) => ({
      name: column.name,
      data_type: column.data_type,
      comment: column.comment,
      use_in_mapping: column.use_in_mapping,
      samples: (column.samples ?? []).slice(0, 3).map(compactAiSampleValue),
    })),
    derived_columns: ((dataset as DatasetPayload & { derived_columns?: DatasetColumn[] }).derived_columns ?? []).map((column) => ({
      name: column.name,
      data_type: column.data_type,
      comment: column.comment,
      source_column: column.source_column,
      use_in_mapping: column.use_in_mapping,
      samples: (column.samples ?? []).slice(0, 3).map(compactAiSampleValue),
    })) ?? [],
    media_schema: datasetMediaSchemaAvailableForMapping(dataset).slice(0, 20).map((item) => ({
      type: item.type,
      role: item.role,
      field: item.field,
      source: item.source,
      status: item.status,
    })),
    context_schema: (dataset.context_schema ?? []).slice(0, 20).map((item) => ({
      key: item.key,
      data_type: item.data_type,
      label: item.label,
    })),
    sample_rows: sampleRows,
    sample_policy: '仅提供最多 5 行、每行最多 12 个映射相关字段的截断预览值，以及 media_schema/context_schema 元信息；不传输未绑定素材或完整大文件内容。',
  };
}

function compactAiSampleValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > 160 ? `${value.slice(0, 160)}...` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 6).map(compactAiSampleValue);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 8)
        .map(([key, child]) => [key, compactAiSampleValue(child)]),
    );
  }
  return String(value).slice(0, 160);
}

function buildSafeAiTemplateContext(
  template: TemplatePayload | null,
  showItems: TemplateComponentSchema[],
  answerFields: TemplateComponentSchema[],
  mapping: Record<string, string | null>,
): Record<string, unknown> | null {
  if (!template) return null;
  const compactComponent = (component: TemplateComponentSchema) => ({
    id: component.id,
    type: component.type,
    field: component.field,
    label: component.label,
    required: component.required,
    mapped_column: mapping[component.id] ?? null,
    options: component.options?.map((option) => ({ label: option.label, value: option.value })) ?? [],
    config_keys: component.config ? Object.keys(component.config) : [],
  });
  return {
    template_id: template.template_id,
    name: template.name,
    description: template.description,
    schema_version: template.schema?.schema_version,
    show_items: showItems.map(compactComponent),
    answer_fields: answerFields.map(compactComponent),
  };
}

function buildTaskPublishTemplateSchemaContext(schema?: TemplateSchemaPayload | null): Record<string, unknown> | null {
  if (!schema) return null;
  return {
    schema_version: schema.schema_version,
    tabs: schema.tabs.map((tab) => ({
      id: tab.id,
      title: tab.title,
      components: tab.components.map((component) => ({
        id: component.id,
        type: component.type,
        field: component.field,
        label: component.label,
        required: component.required,
        options: component.options?.map((option) => ({ value: option.value, label: option.label })) ?? [],
        config: compactTaskPublishComponentConfig(component.config),
      })),
    })),
    validation_rule_fields: Object.keys(schema.validation_rules ?? {}),
    linkage_rule_count: schema.linkage_rules?.length ?? 0,
    schema_policy: '任务发布 AI 只能读取该 schema 以对齐 ShowItem 映射、答案字段和 AI 预审语义，不允许输出模板 schema 结构变更。',
  };
}

function compactTaskPublishComponentConfig(config: Record<string, unknown>) {
  const allowedKeys = new Set(['binding', 'display_fields', 'source_type', 'media_type', 'role', 'field', 'placeholder', 'prompt_hint']);
  return Object.fromEntries(
    Object.entries(config ?? {})
      .filter(([key]) => allowedKeys.has(key))
      .slice(0, 12)
      .map(([key, value]) => [key, compactAiSampleValue(value)]),
  );
}

function buildSafeAiTaskContext(form: {
  title: string;
  description: string;
  category: string;
  category_values: string[];
  difficulty?: string;
  tag_items: string[];
  reward_mode: string;
  required_certs: string;
  min_completed_tasks: string;
  min_accuracy_rate: string;
  qualification_notes: string;
}): Record<string, unknown> {
  return {
    title: form.title,
    description: form.description,
    category: form.category,
    category_tags: form.category_values,
    difficulty: form.difficulty || 'AI 自动评估',
    tags: form.tag_items,
    reward_mode: form.reward_mode,
    required_certs: parseList(form.required_certs),
    qualification_rules: {
      min_completed_tasks: toNonNegativeInteger(form.min_completed_tasks),
      min_accuracy_rate: toNonNegativeInteger(form.min_accuracy_rate),
      notes: form.qualification_notes || null,
    },
  };
}

function composeAiReviewPrompt(inputPrompt: string, matrix: AiReviewMatrixRow[]): string {
  if (!inputPrompt && matrix.length === 0) return '';
  const matrixText = matrix.map((row) => [
    `维度：${row.dimension}`,
    `定义：${row.definition}`,
    `评分标准：${row.scoring_standard}`,
    `扣分规则：${row.deduction_rule}`,
    `打回条件：${row.reject_condition}`,
    `人工复核条件：${row.manual_condition}`,
  ].join('\n')).join('\n\n');
  return [
    '# Input 字段说明',
    inputPrompt || '暂无字段说明。',
    '',
    '# 待审核 JSON',
    'Labeler 提交内容会以结构化 JSON 传入，请按字段说明理解每个字段的含义。',
    '',
    '# 审核评分矩阵',
    matrixText || '暂无评分矩阵。',
    '',
    '# Output 要求',
    '系统提示词由后台维护。模型必须通过 function call 返回结构化结果，结构至少包含 decision、reason、dimension_scores，并可包含 risk_flags 和 suggested_actions。',
  ].join('\n');
}

function suggestColumnMapping(dataset: DatasetPayload, showItems: TemplateComponentSchema[], current: Record<string, string | null>): Record<string, string | null> {
  const next = { ...current };
  const mediaSchemaFields = datasetMediaSchemaFieldSet(dataset);
  const candidateColumns = dataset.columns.filter((column) => datasetColumnAvailableForMapping(column) && !mediaSchemaFields.has(column.name));
  for (const component of showItems) {
    if (next[component.id]) continue;
    const configuredBinding = component.config.binding && typeof component.config.binding === 'object' ? component.config.binding as DataBindingPayload : null;
    const configured = String(configuredBinding?.field || configuredBinding?.column_name || component.config.content_field || '');
    const normalizedField = component.field.replace(/^show_/, '');
    const byConfigured = candidateColumns.find((column) => column.name === configured);
    const byField = candidateColumns.find((column) => column.name === component.field || component.field.endsWith(`_${column.name}`));
    const byLabel = candidateColumns.find((column) => component.label.includes(column.name) || column.name.includes(normalizedField));
    next[component.id] = (byConfigured || byField || byLabel || candidateColumns[0])?.name ?? null;
  }
  return next;
}

function normalizeInitialBindingMapping(task?: TaskPayload | null): Record<string, DataBindingPayload> {
  if (!task) return {};
  if (task.mapping_config && Object.keys(task.mapping_config).length > 0) return { ...task.mapping_config };
  return mergeColumnBindings({}, task.column_mapping ?? {});
}

function normalizeInitialMaskSourceMapping(task?: TaskPayload | null): Record<string, DataBindingPayload> {
  if (!task) return {};
  const next: Record<string, DataBindingPayload> = {};
  for (const [componentId, bindings] of Object.entries(task.component_bindings ?? {})) {
    const binding = bindings?.mask_image;
    if (isDataBindingPayload(binding)) next[componentId] = binding;
  }
  return next;
}

function buildImageMaskComponentBindings(
  components: TemplateComponentSchema[],
  mapping: Record<string, DataBindingPayload>,
): Record<string, Record<string, DataBindingPayload>> {
  const next: Record<string, Record<string, DataBindingPayload>> = {};
  for (const component of components) {
    const binding = mapping[component.id];
    if (binding) next[component.id] = { mask_image: binding };
  }
  return next;
}

function mergeColumnBindings(current: Record<string, DataBindingPayload>, mapping: Record<string, string | null>): Record<string, DataBindingPayload> {
  const next = { ...current };
  for (const [componentId, columnName] of Object.entries(mapping)) {
    if (!next[componentId] && columnName) next[componentId] = { source_type: 'column', column_name: columnName, field: columnName };
    if (!columnName) delete next[componentId];
  }
  return next;
}

function bindingFromColumn(columnName: string | null): DataBindingPayload | null {
  return columnName ? { source_type: 'column', column_name: columnName, field: columnName } : null;
}

function bindingToColumnName(binding: DataBindingPayload | null): string | null {
  if (!binding) return null;
  if (binding.source_type === 'column') return binding.column_name || binding.field || null;
  if (binding.source_type === 'media') return binding.field || null;
  return null;
}

function bindingToOptionValue(binding: DataBindingPayload | null): string | null {
  if (!binding) return null;
  return encodeDataSourceOption(binding);
}

function encodeDataSourceOption(binding: DataBindingPayload): string {
  return JSON.stringify({
    source_type: binding.source_type,
    column_name: binding.column_name ?? null,
    media_type: binding.media_type ?? null,
    role: binding.role ?? null,
    field: binding.field ?? null,
    key: binding.key ?? null,
  });
}

function decodeDataSourceOption(value: string): DataBindingPayload {
  try {
    const parsed = JSON.parse(value) as DataBindingPayload;
    return parsed;
  } catch {
    return { source_type: 'column', column_name: value, field: value };
  }
}

export function buildDataSourceOptions(dataset: DatasetPayload) {
  const mediaSchemaFields = datasetMediaSchemaFieldSet(dataset);
  const columnOptions = dataset.columns
    .filter((column) => datasetColumnAvailableForMapping(column) && !mediaSchemaFields.has(column.name))
    .map((column) => ({
      value: encodeDataSourceOption({ source_type: 'column', column_name: column.name, field: column.name }),
      label: `${column.name} · ${column.data_type}`,
      data_type: column.data_type,
    }));
  const mediaOptions = datasetMediaSchemaAvailableForMapping(dataset).map((item) => {
    const mediaType = normalizeDesignerMediaKind(item.type || item.media_type) || item.type || item.media_type || 'file';
    return {
      value: encodeDataSourceOption({ source_type: 'media', media_type: mediaType, role: item.role, field: item.field }),
      label: `${mediaTypeLabel(mediaType)} · ${item.role || 'context'} · ${item.field || 'media'}`,
    };
  });
  const contextOptions = (dataset.context_schema ?? []).map((item) => ({
    value: encodeDataSourceOption({ source_type: 'derived_context', key: item.key }),
    label: `AI 上下文 · ${item.key}`,
  }));
  const attachmentOptions = datasetAttachmentOptions(dataset);
  return [
    { label: '普通列', options: columnOptions },
    { label: '媒体', options: mediaOptions },
    { label: '派生上下文', options: contextOptions },
    { label: '附件', options: attachmentOptions },
  ].filter((group) => group.options.length > 0);
}

function datasetMediaSchemaFieldSet(dataset: DatasetPayload): Set<string> {
  return new Set(
    (dataset.media_schema ?? [])
      .filter((item) => ['image', 'audio', 'video'].includes(normalizeDesignerMediaKind(item.type || item.media_type) || ''))
      .map((item) => String(item.field || '').trim())
      .filter(Boolean),
  );
}

function datasetColumnAvailableForMapping(column: DatasetColumn): boolean {
  return column.use_in_mapping !== false && !isSystemDatasetContextColumn(column.name);
}

function datasetMediaSchemaAvailableForMapping(dataset: DatasetPayload): DatasetMediaRef[] {
  const disabledFields = new Set(dataset.columns.filter((column) => column.use_in_mapping === false).map((column) => column.name));
  return (dataset.media_schema ?? []).filter((item) => {
    const field = String(item.field || '').trim();
    return !field || !disabledFields.has(field);
  });
}

function flattenDataSourceOptions(groups: ReturnType<typeof buildDataSourceOptions>, keyword: string) {
  const normalizedKeyword = keyword.trim().toLowerCase();
  return groups
    .flatMap((group) => group.options.map((option) => ({
      groupLabel: String(group.label),
      value: String(option.value),
      label: String(option.label),
    })))
    .filter((option) => {
      if (!normalizedKeyword) return true;
      return [option.groupLabel, option.label].some((item) => item.toLowerCase().includes(normalizedKeyword));
    });
}

export function imageMaskSourceOptions(groups: ReturnType<typeof buildDataSourceOptions>) {
  return groups
    .map((group) => ({
      ...group,
      options: group.options.filter((option) => {
        const binding = decodeDataSourceOption(String(option.value));
        if (!binding) return false;
        if (binding.source_type === 'media') return normalizeDesignerMediaKind(binding.media_type) === 'image';
        if (binding.source_type === 'column') return normalizeDesignerMediaKind((option as { data_type?: string }).data_type) === 'image';
        return false;
      }),
    }))
    .filter((group) => group.options.length > 0);
}

function isSystemDatasetContextColumn(columnName: string): boolean {
  return ['media', 'attachments', 'derived_context', '_bindings'].includes(columnName);
}

function datasetAttachmentOptions(dataset: DatasetPayload) {
  const rows = [...(dataset.preview_rows ?? []), ...(dataset.rows ?? [])].slice(0, 20);
  const seen = new Set<string>();
  const options: Array<{ value: string; label: string }> = [];
  rows.forEach((row) => {
    const attachments = Array.isArray(row.attachments) ? row.attachments : [];
    attachments.forEach((attachment) => {
      if (!attachment || typeof attachment !== 'object') return;
      const raw = attachment as Record<string, unknown>;
      const key = String(raw.field || raw.name || raw.file_name || raw.filename || raw.url || '');
      if (!key || seen.has(key)) return;
      seen.add(key);
      options.push({
        value: encodeDataSourceOption({ source_type: 'attachment', key, field: typeof raw.field === 'string' ? raw.field : null }),
        label: `附件 · ${key}`,
      });
    });
  });
  return options;
}

function inferMediaType(url: string): string {
  const lowered = url.toLowerCase();
  if (lowered.startsWith('data:image')) return 'image';
  if (lowered.startsWith('data:audio')) return 'audio';
  if (lowered.startsWith('data:video')) return 'video';
  if (/\.(png|jpg|jpeg|gif|webp)$/.test(lowered)) return 'image';
  if (/\.(mp3|wav|m4a|ogg)$/.test(lowered)) return 'audio';
  if (/\.(mp4|mov|webm|m4v|avi|mkv|3gp)$/.test(lowered)) return 'video';
  return 'file';
}

const datasetMediaUploadExtensions = new Set([
  'aac',
  'avi',
  'flac',
  'gif',
  'jpeg',
  'jpg',
  'm4a',
  'm4v',
  'mkv',
  'mov',
  'mp3',
  'mp4',
  'ogg',
  'opus',
  'png',
  'wav',
  'webm',
  'webp',
  '3gp',
]);

function isAllowedDatasetMediaFile(file: File): boolean {
  const mimeType = (file.type || '').split(';', 1)[0].trim().toLowerCase();
  const extension = file.name.toLowerCase().split(/[?#]/, 1)[0].split('.').pop() || '';
  if (extension === 'svg' || mimeType === 'image/svg+xml') return false;
  if (mimeType.startsWith('image/') || mimeType.startsWith('audio/') || mimeType.startsWith('video/')) return datasetMediaUploadExtensions.has(extension);
  return datasetMediaUploadExtensions.has(extension);
}

function previewDerivedValue(row: Record<string, unknown>, sourceColumn: string, defaultValue: string, expression: string): string {
  const sourceValue = sourceColumn ? row[sourceColumn] : '';
  if (expression.trim()) {
    return renderVariableExpression(expression, row, sourceValue);
  }
  if (defaultValue.trim()) return defaultValue;
  return sourceValue == null ? '' : String(sourceValue);
}

function renderVariableExpression(expression: string, row: Record<string, unknown>, sourceValue: unknown): string {
  let rendered = expression.replaceAll('{value}', sourceValue == null ? '' : String(sourceValue));
  for (const [key, value] of Object.entries(row)) {
    rendered = rendered.replaceAll(`{${key}}`, value == null ? '' : String(value));
  }
  return rendered;
}

function nextVariableName(columns: DatasetColumn[]): string {
  const existing = new Set(columns.map((column) => column.name));
  let index = 1;
  while (existing.has(`display_var_${index}`)) index += 1;
  return `display_var_${index}`;
}

function parseList(value: string): string[] {
  return value
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePositivePoints(value: number | string | null | undefined): number | null {
  const nextValue = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isFinite(nextValue) || nextValue <= 0) return null;
  return nextValue;
}

function toNonNegativeInteger(value: number | string | null | undefined, fallback = 0): number {
  const nextValue = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isFinite(nextValue)) return fallback;
  return Math.max(0, Math.round(nextValue));
}

function toPositiveInteger(value: number | string | null | undefined, fallback = 1): number {
  const nextValue = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isFinite(nextValue) || nextValue <= 0) return fallback;
  return Math.max(1, Math.round(nextValue));
}

function normalizeShareExpireHours(value: number | string | null | undefined): number {
  const rawValue = typeof value === 'number' ? value : String(value ?? '').trim();
  if (rawValue === '') return 72;
  const nextValue = typeof rawValue === 'number' ? rawValue : Number(rawValue);
  if (!Number.isFinite(nextValue)) return 0;
  return Math.round(nextValue);
}

function absoluteAppUrl(pathOrUrl?: string | null): string {
  const value = String(pathOrUrl || '').trim();
  if (!value) return '';
  try {
    if (/^https?:\/\//i.test(value)) return new URL(value).toString();
    const base = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'http://localhost:5173';
    return new URL(value.startsWith('/') ? value : `/${value}`, base).toString();
  } catch {
    return value;
  }
}

function buildTaskSharePreview(assignment?: TaskPayload['assignment'] | null): { url: string; qrText: string; expireAt: string | null } | null {
  if (!assignment?.enabled) return null;
  const url = absoluteAppUrl(assignment.url || assignment.qr_text);
  if (!url) return null;
  const qrText = absoluteAppUrl(assignment.qr_text || assignment.url) || url;
  return {
    url,
    qrText,
    expireAt: assignment.expire_at ?? null,
  };
}

function toPercentInteger(value: number | string | null | undefined, fallback = 5): number {
  const nextValue = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isFinite(nextValue)) return fallback;
  return Math.min(100, Math.max(0, Math.round(nextValue)));
}

function formatPoints(value: number | null | undefined, fallback = '未填写'): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function rewardFeeRateLabel(rate = platformFeeRate): string {
  return `${formatPoints(rate * 100, '待计算')}%`;
}

function calculateRewardCost({
  rewardMode,
  pointsPerItem,
  totalPoints,
  standardItemCount,
  platformFeeRate: inputPlatformFeeRate = platformFeeRate,
}: {
  rewardMode: 'item' | 'task';
  pointsPerItem: number | string;
  totalPoints: number | string;
  standardItemCount: number;
  platformFeeRate?: number;
}): RewardCostSummary {
  const nextWorkerReceiveRate = 1 - inputPlatformFeeRate;
  const safeStandardItemCount = Number.isFinite(standardItemCount) && standardItemCount > 0 ? standardItemCount : 0;
  if (rewardMode === 'item') {
    const workerPointsPerItem = parsePositivePoints(pointsPerItem);
    const companyCostPerItem = workerPointsPerItem === null ? null : workerPointsPerItem / nextWorkerReceiveRate;
    return {
      rewardMode,
      platformFeeRate: inputPlatformFeeRate,
      workerReceiveRate: nextWorkerReceiveRate,
      workerPointsPerItem,
      workerTotalPoints: null,
      companyCostPerItem,
      companyTotalCost: null,
      platformFeePerItem: companyCostPerItem === null || workerPointsPerItem === null ? null : companyCostPerItem - workerPointsPerItem,
      platformFeeTotal: null,
      standardItemCount: safeStandardItemCount,
      canCalculate: workerPointsPerItem !== null,
      hasRewardValue: workerPointsPerItem !== null,
      needsStandardItemCount: false,
    };
  }
  const workerTotalPoints = parsePositivePoints(totalPoints);
  const needsStandardItemCount = safeStandardItemCount <= 0;
  const workerPointsPerItem = workerTotalPoints === null || needsStandardItemCount ? null : workerTotalPoints / safeStandardItemCount;
  const companyTotalCost = workerTotalPoints === null ? null : workerTotalPoints / nextWorkerReceiveRate;
  const companyCostPerItem = workerPointsPerItem === null ? null : workerPointsPerItem / nextWorkerReceiveRate;
  return {
    rewardMode,
    platformFeeRate: inputPlatformFeeRate,
    workerReceiveRate: nextWorkerReceiveRate,
    workerPointsPerItem,
    workerTotalPoints,
    companyCostPerItem,
    companyTotalCost,
    platformFeePerItem: companyCostPerItem === null || workerPointsPerItem === null ? null : companyCostPerItem - workerPointsPerItem,
    platformFeeTotal: companyTotalCost === null || workerTotalPoints === null ? null : companyTotalCost - workerTotalPoints,
    standardItemCount: safeStandardItemCount,
    canCalculate: workerTotalPoints !== null && !needsStandardItemCount,
    hasRewardValue: workerTotalPoints !== null,
    needsStandardItemCount,
  };
}

function RewardCostPanel({ summary, variant = 'detail' }: { summary: RewardCostSummary; variant?: 'detail' | 'summary' | 'confirm' }) {
  const feeRate = rewardFeeRateLabel(summary.platformFeeRate);
  const unit = '积分';
  const standardItemCountLabel = summary.standardItemCount > 0 ? `${summary.standardItemCount} 条` : '选择数据集后计算标准条数';
  if (variant === 'summary') {
    if (!summary.hasRewardValue) {
      return (
        <>
          <span><em>奖励</em><strong>未填写</strong></span>
          <span><em>费率</em><strong>手续费率 {feeRate}</strong></span>
        </>
      );
    }
    if (summary.rewardMode === 'item') {
      return (
        <>
          <span><em>方式</em><strong>按条</strong></span>
          <span><em>标注员</em><strong>每条获得 {formatPoints(summary.workerPointsPerItem)} {unit}</strong></span>
          <span><em>企业</em><strong>每条预计支付 {formatPoints(summary.companyCostPerItem)} {unit}</strong></span>
          <span><em>手续费</em><strong>每条 {formatPoints(summary.platformFeePerItem)} {unit} / 费率 {feeRate}</strong></span>
        </>
      );
    }
    return (
      <>
        <span><em>方式</em><strong>按任务折算</strong></span>
        <span><em>总奖</em><strong>{formatPoints(summary.workerTotalPoints)} {unit}</strong></span>
        <span><em>条数</em><strong>{standardItemCountLabel}</strong></span>
        <span><em>每条</em><strong>{summary.canCalculate ? `折算每条奖励 ${formatPoints(summary.workerPointsPerItem)} ${unit}` : '待计算'}</strong></span>
        <span><em>企业</em><strong>{summary.hasRewardValue ? `预计总支付 ${formatPoints(summary.companyTotalCost)} ${unit}` : '未填写'}</strong></span>
        <span><em>手续费</em><strong>{summary.hasRewardValue ? `${formatPoints(summary.platformFeeTotal)} ${unit} / 费率 ${feeRate}` : `费率 ${feeRate}`}</strong></span>
        <span><em>单价</em><strong>{summary.canCalculate ? `企业折算每条支付 ${formatPoints(summary.companyCostPerItem)} ${unit}` : '选择数据集后计算标准条数'}</strong></span>
      </>
    );
  }

  const items = summary.rewardMode === 'item'
    ? [
      { label: '奖励方式', children: '按条' },
      { label: '标注员每条获得', children: summary.hasRewardValue ? `${formatPoints(summary.workerPointsPerItem)} ${unit}` : '未填写' },
      { label: '平台手续费率', children: feeRate },
      { label: '企业每条预计支付', children: summary.hasRewardValue ? `${formatPoints(summary.companyCostPerItem)} ${unit}` : '待填写' },
      { label: '平台每条手续费', children: summary.hasRewardValue ? `${formatPoints(summary.platformFeePerItem)} ${unit}` : '待填写' },
    ]
    : [
      { label: '奖励方式', children: '按任务折算' },
      { label: '任务总奖励', children: summary.hasRewardValue ? `${formatPoints(summary.workerTotalPoints)} ${unit}` : '未填写' },
      { label: '标准条数', children: standardItemCountLabel },
      { label: '折算每条奖励', children: summary.canCalculate ? `${formatPoints(summary.workerPointsPerItem)} ${unit}` : '待计算' },
      { label: '平台手续费率', children: feeRate },
      { label: '企业预计总支付', children: summary.hasRewardValue ? `${formatPoints(summary.companyTotalCost)} ${unit}` : '待填写' },
      { label: '平台预计手续费', children: summary.hasRewardValue ? `${formatPoints(summary.platformFeeTotal)} ${unit}` : '待填写' },
      { label: '企业折算每条支付', children: summary.canCalculate ? `${formatPoints(summary.companyCostPerItem)} ${unit}` : '选择数据集后计算标准条数' },
    ];

  return (
    <section className={variant === 'confirm' ? 'reward-cost-panel reward-cost-panel-confirm' : 'reward-cost-panel'}>
      <div className="reward-cost-panel-head">
        <strong>{variant === 'confirm' ? '积分费用确认' : '积分费用估算'}</strong>
      </div>
      <Descriptions size="small" column={variant === 'confirm' ? 2 : 3} items={items} />
    </section>
  );
}

function TaskDifficultyEvaluationPanel({
  difficulty,
  evaluation,
  evaluating,
  missingFields,
  onEvaluate,
  compact = false,
}: {
  difficulty: string;
  evaluation: TaskDifficultyEvaluateResponse | null;
  evaluating: boolean;
  missingFields: string[];
  onEvaluate: () => void;
  compact?: boolean;
}) {
  return (
    <div className={`task-difficulty-readonly ${compact ? 'compact' : ''}`}>
      {!compact && <strong className="task-difficulty-panel-title">难度评估</strong>}
      <div className="task-difficulty-main">
        {evaluating ? (
          <Tag color="processing">AI 评估中</Tag>
        ) : difficulty ? (
          <Tag color={difficulty === 'easy' ? 'green' : difficulty === 'hard' ? 'red' : 'orange'}>
            {difficultyLabel(difficulty)}
          </Tag>
        ) : (
          <Tag>待评估</Tag>
        )}
        <span>{evaluation?.reason || '填写完数据集和模板后，点击开始评估生成任务难度；资质领域可为无要求。'}</span>
        <AntButton size="small" type="primary" icon={<ExperimentOutlined />} loading={evaluating} onClick={onEvaluate}>
          开始评估
        </AntButton>
      </div>
      {evaluation?.fallback && <small>当前为本地兜底评估；配置平台难度评估模型后会自动调用大模型。</small>}
      {evaluation?.signals?.length && !compact ? (
        <ul>
          {evaluation.signals.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : null}
      {missingFields.length > 0 && <small>还需补充：{missingFields.join('、')}</small>}
    </div>
  );
}

function TemplatePublishCheckModal({
  open,
  template,
  readiness,
  publishing,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  template: TemplatePayload | null;
  readiness: TemplateReadinessPayload | null;
  publishing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const blockers = readiness?.blockers ?? [];
  return (
    <Modal
      title={template ? `${template.name} 发布检查` : '模板发布检查'}
      open={open}
      onCancel={onCancel}
      onOk={onConfirm}
      okText="确认发布"
      cancelText="返回修改"
      okButtonProps={{ disabled: !readiness?.ready, loading: publishing }}
      width={680}
    >
      {readiness ? (
        <div className="template-readiness-modal">
          <section className="designer-status-strip" aria-label="模板发布检查概览">
            <span><strong>{readiness.summary.tab_count}</strong> 页签</span>
            <span><strong>{readiness.summary.component_count}</strong> 组件</span>
            <span><strong>{readiness.summary.show_item_count}</strong> 展示项</span>
            <span><strong>{readiness.summary.answer_field_count}</strong> 答案字段</span>
            <span><strong>{readiness.summary.llm_count}</strong> LLM</span>
          </section>
          {blockers.length > 0 ? (
            <Alert type="error" showIcon title="模板暂不能发布" description={blockers.map((item) => item.message).join('；')} />
          ) : (
            <Alert type="success" showIcon title="发布检查通过" description="模板结构可以发布；发布后任务会绑定当前版本，历史任务可按版本回放。" />
          )}
          <ul className="template-readiness-list">
            {readiness.checks.map((item) => (
              <li key={item.key} className={item.status === 'pass' ? 'pass' : 'block'}>
                <Tag color={item.status === 'pass' ? 'green' : 'red'}>{item.status === 'pass' ? '通过' : '阻塞'}</Tag>
                <strong>{item.label}</strong>
                <span>{item.message}</span>
              </li>
            ))}
            {readiness.warnings.map((item) => (
              <li key={item.key} className="warning">
                <Tag color="orange">警告</Tag>
                <strong>{item.label}</strong>
                <span>{item.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <Spin description="正在执行模板发布检查" />
      )}
    </Modal>
  );
}

function SchemaImportModal({
  open,
  value,
  error,
  onChange,
  onFileError,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  value: string;
  error: string;
  onChange: (value: string) => void;
  onFileError: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const handleFileImport: UploadProps['beforeUpload'] = async (file) => {
    if (!file.name.toLowerCase().endsWith('.json')) {
      onFileError('仅支持导入 .json 格式的模板 schema 文件');
      return Upload.LIST_IGNORE;
    }
    try {
      const text = await file.text();
      onChange(text);
      onFileError('');
    } catch {
      onFileError('文件读取失败，请确认文件未损坏后重试');
    }
    return false;
  };

  return (
    <Modal
      title="导入模板 schema"
      open={open}
      onCancel={onCancel}
      onOk={onConfirm}
      okText="导入到 Designer"
      cancelText="取消"
      okButtonProps={{ disabled: !value.trim() }}
      width={760}
    >
      <div className="schema-import-modal">
        <Alert
          type="info"
          showIcon
          title="导入后会进入新建模板 Designer"
          description="可选择 JSON 文件导入，也可粘贴包含 schema_version、tabs 和 components 的模板 JSON；系统会检查物料类型、组件 ID 和答案字段唯一性。"
        />
        <Upload
          accept=".json,application/json"
          beforeUpload={handleFileImport}
          maxCount={1}
          showUploadList={false}
        >
          <AntButton icon={<UploadOutlined />}>选择 JSON 文件</AntButton>
        </Upload>
        <Input.TextArea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoSize={{ minRows: 12, maxRows: 18 }}
          placeholder={'{\n  "schema_version": "1.0",\n  "tabs": [\n    { "id": "tab_read", "title": "阅读材料", "components": [] }\n  ],\n  "components": [],\n  "validation_rules": {},\n  "linkage_rules": [],\n  "llm_config": {}\n}'}
        />
        {error && <Alert type="error" showIcon title={error} />}
      </div>
    </Modal>
  );
}

function TemplateVersionDiffPanel({ diff }: { diff: TemplateVersionDiffPayload }) {
  const summary = diff.summary;
  return (
    <section className="template-version-diff-panel">
      <div className="section-title">
        <div>
          <p className="section-kicker">Version Diff</p>
          <h3>v{diff.from_version} {'->'} v{diff.to_version}</h3>
        </div>
        {summary.high_risk_changes.length > 0 && <Tag color="red">高风险变更</Tag>}
      </div>
      <div className="template-diff-grid">
        <span><strong>{summary.added_components.length}</strong> 新增组件</span>
        <span><strong>{summary.removed_components.length}</strong> 删除组件</span>
        <span><strong>{summary.modified_components.length}</strong> 修改组件</span>
        <span><strong>{summary.field_changes.length}</strong> 字段 key 变化</span>
      </div>
      <ul className="template-diff-list">
        {summary.added_components.map((item) => <li key={`add-${String(item.id)}`}><Tag color="green">新增</Tag>{String(item.label || item.field || item.id)}</li>)}
        {summary.removed_components.map((item) => <li key={`remove-${String(item.id)}`}><Tag color="red">删除</Tag>{String(item.label || item.field || item.id)}</li>)}
        {summary.modified_components.map((item) => <li key={`mod-${item.component_id}`}><Tag color="orange">修改</Tag>{item.label || item.component_id}：{item.changed_fields.join('、')}</li>)}
        {summary.field_changes.map((item) => <li key={`field-${item.component_id}`}><Tag color="purple">字段</Tag>{item.component_id}：{item.from || '-'} {'->'} {item.to || '-'}</li>)}
        {summary.validation_changed && <li><Tag color="orange">校验</Tag>校验规则发生变化</li>}
        {summary.linkage_changed && <li><Tag color="orange">联动</Tag>联动规则发生变化</li>}
        {summary.high_risk_changes.map((item, index) => <li key={`risk-${index}`}><Tag color="red">高风险</Tag>{String(item.component_id || '组件')}：{String(item.from || '-')} {'->'} {String(item.to || '-')}</li>)}
      </ul>
    </section>
  );
}

function taskStatusLabel(status: string, autoSaved = false): string {
  if (status === 'draft' && autoSaved) return '自动保存';
  return ({ draft: '草稿', pending_review: '待审核', published: '收集中', paused: '已暂停', finished: '已结束' } as Record<string, string>)[status] ?? status;
}

function taskStatusClass(status: string, autoSaved = false): string {
  if (status === 'draft' && autoSaved) return 'task-status-auto';
  return `task-status-${status.replaceAll('_', '-')}`;
}

function taskDisplayTitle(task: TaskPayload): string {
  if (task.title?.trim()) return task.title;
  return task.auto_saved ? '未命名自动保存草稿' : '未命名任务';
}

function taskOwnerDisplayName(task: TaskPayload): string {
  return task.owner_name || task.owner_id || '未记录';
}

function ownerDisplayName(item: { owner_name?: string | null; owner_id?: string | null }): string {
  return item.owner_name || item.owner_id || '未记录';
}

function datasetResponsibleDisplayName(dataset: DatasetPayload): string {
  return dataset.updated_by_name || dataset.updated_by || ownerDisplayName(dataset);
}

function OwnerTag({ label, name }: { label: string; name: string }) {
  return (
    <span className="task-meta-stack owner-label-cell">
      <small>{label}</small>
      <Tag color="blue">{name}</Tag>
    </span>
  );
}

function taskReviewerDisplayNames(task: TaskPayload): string[] {
  if (Array.isArray(task.reviewers) && task.reviewers.length) {
    return task.reviewers.map((item) => item.display_name || item.user_id).filter(Boolean);
  }
  if (Array.isArray(task.reviewer_names) && task.reviewer_names.length) return task.reviewer_names.filter(Boolean);
  return task.reviewer_ids || [];
}

function taskReviewerSummary(task: TaskPayload): string {
  const names = taskReviewerDisplayNames(task);
  if (!names.length) return '待分配';
  if (names.length <= 2) return names.join('、');
  return `${names.slice(0, 2).join('、')} 等 ${names.length} 人`;
}

function questionAssigneeDisplayName(question: TaskQuestionPayload): string {
  return question.assigned_to_name || question.assigned_to || '-';
}

function auditOperatorDisplayName(log: AuditLogPayload): string {
  return log.operator_name || log.operator_id || '系统';
}

function taskEditActionLabel(task: TaskPayload): string {
  if (task.status === 'draft' || task.status === 'paused') return '修改';
  return '查看';
}

function normalizedTaskStatusCounts(payload: TaskStatsPayload) {
  const counts = payload.question_status_counts || {};
  const stats = payload.stats || {};
  const total = payload.question_count || stats.total || payload.quota || 0;
  const claimed = counts.claimed ?? stats.claimed ?? 0;
  const submitted = counts.submitted ?? stats.submitted ?? 0;
  const approved = counts.approved ?? stats.approved ?? 0;
  const rejected = counts.rejected ?? stats.rejected ?? 0;
  const pending = counts.pending ?? Math.max(total - claimed - submitted - approved - rejected, 0);
  return { total, pending, claimed, submitted, approved, rejected };
}

function normalizeTaskCategoryValues(value: unknown, fallbackCategory = ''): string[] {
  const allowed = new Set(taskCategoryOptions.map((item) => item.value));
  const rawValues = Array.isArray(value) ? value : [];
  const normalized = rawValues
    .map((item) => String(item ?? '').trim())
    .filter((item) => allowed.has(item));
  if (normalized.length > 0) return Array.from(new Set(normalized));
  if (fallbackCategory === 'multimodal') return taskCategoryOptions.map((item) => item.value);
  return allowed.has(fallbackCategory) ? [fallbackCategory] : [];
}

function deriveTaskCategory(values: string[]): string {
  if (values.length === 1) return values[0];
  if (values.length > 1) return 'multimodal';
  return '';
}

function taskCategoryValuesLabel(values: string[]): string {
  if (!values.length) return '未选择';
  const labels = values
    .map((value) => taskCategoryOptions.find((item) => item.value === value)?.label)
    .filter((label): label is string => Boolean(label));
  return labels.join('、') || '未选择';
}

function formatTaskPublishDeadlineLabel(longTerm: boolean, deadline?: string | null): string {
  if (longTerm) return '长期有效';
  return deadline || '未设置';
}

function isPastTaskDeadline(longTerm: boolean, deadline?: string | null): boolean {
  if (longTerm || !deadline) return false;
  const parsed = dayjs(deadline);
  return parsed.isValid() && parsed.isBefore(dayjs().startOf('day'), 'day');
}

function taskProductionStats(task: TaskPayload): { total: number; pendingReview: number; approved: number; rejected: number } {
  return {
    total: toNonNegativeInteger(task.stats?.total, task.quota ?? 0),
    pendingReview: toNonNegativeInteger(task.stats?.submitted),
    approved: toNonNegativeInteger(task.stats?.approved),
    rejected: toNonNegativeInteger(task.stats?.rejected),
  };
}

function categoryLabel(category: string): string {
  return categoryLabelText(category);
}

function categoryLabelText(category: string): string {
  if (category === 'multimodal') return '多模态';
  return taskCategoryOptions.find((item) => item.value === category)?.label ?? (category || '未分类');
}

function difficultyLabel(difficulty: string): string {
  return taskDifficultyOptions.find((item) => item.value === difficulty)?.label ?? (difficulty || '未设置');
}

function distributionLabel(distribution: string): string {
  return ({ first_come_all: '包大小分配', quota_grab: '企业内流转', assigned_link: '分享链接（旧）' } as Record<string, string>)[distribution] ?? distribution;
}

function distributionDescription(distribution: string): string {
  return ({
    first_come_all: 'Labeler 在任务广场按可用包大小领取任务包；可在同一策略下开启分享链接。',
    quota_grab: '任务在企业内部 Labeler 范围内流转分配，不进入公开积分任务广场，也不分配积分。',
    assigned_link: '历史兼容策略：通过链接或二维码发放任务。',
  } as Record<string, string>)[distribution] ?? '';
}

function rewardRuleLabel(rule: Record<string, unknown>): string {
  if (rule.mode === 'task') return `任务 ${rule.total_points ?? 0} 分`;
  if (rule.mode === 'item') return `每条 ${rule.points_per_item ?? 0} 分`;
  return '未配置奖励';
}

function taskRewardDisplayLabel(task: TaskPayload): string {
  if (task.distribution === 'quota_grab') return '不分配积分';
  return rewardRuleLabel(task.reward_rule);
}

function qualificationThresholdLabel(minTasks: number | string, minAccuracy: number | string): string {
  return `完成任务 ${Number(minTasks || 0)} 个 / 最低准确率 ${Number(minAccuracy || 0)}%`;
}

function aiReviewSummaryLabel(enabled: boolean, threshold: number | string, dimensionCount = 0, confirmed = false): string {
  if (!enabled) return '关闭';
  const value = Number(threshold || 0);
  if (value <= 0) return '开启 / 阈值未设';
  return `开启 / ${dimensionCount} 维 / 通过 ${value}% / ${confirmed ? '矩阵已确认' : '矩阵待确认'}`;
}

function buildExportFilters(status: string, dateRange: [Dayjs | null, Dayjs | null] | null): Record<string, unknown> {
  const filters: Record<string, unknown> = { status };
  const [start, end] = dateRange ?? [];
  if (start) filters.start_date = start.format('YYYY-MM-DD');
  if (end) filters.end_date = end.format('YYYY-MM-DD');
  return filters;
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

function compareText(left?: string | null, right?: string | null): number {
  return (left ?? '').localeCompare(right ?? '', 'zh-CN');
}

function compareNumber(left?: number | null, right?: number | null): number {
  return (left ?? 0) - (right ?? 0);
}

function compareDateTime(left?: string | null, right?: string | null): number {
  const leftValue = left ? new Date(left).getTime() : 0;
  const rightValue = right ? new Date(right).getTime() : 0;
  return leftValue - rightValue;
}

function decorateTemplateTableColumns(
  columns: ColumnsType<TemplatePayload>,
  templates: TemplatePayload[],
): ColumnsType<TemplatePayload> {
  return columns.map((column, index) => {
    if (index === 0) {
      return {
        ...column,
        key: column.key ?? 'name',
        sorter: (left: TemplatePayload, right: TemplatePayload) => compareText(left.name, right.name),
      };
    }

    if (index === 1) {
      return {
        ...column,
        key: column.key ?? 'owner',
        width: typeof column.width === 'number' ? column.width : 138,
        sorter: (left: TemplatePayload, right: TemplatePayload) => compareText(ownerDisplayName(left), ownerDisplayName(right)),
      };
    }

    if (index === 2) {
      return {
        ...column,
        key: column.key ?? 'status',
        width: typeof column.width === 'number' ? column.width : 140,
        filters: buildTableFilterOptions(templates.map((template) => template.status)),
        filterSearch: true,
        onFilter: (value, template) => template.status === String(value),
        sorter: (left: TemplatePayload, right: TemplatePayload) => compareNumber(left.latest_version, right.latest_version),
      };
    }

    if (index === 3) {
      return {
        ...column,
        key: column.key ?? 'structure',
        width: typeof column.width === 'number' ? column.width : 160,
        filters: [
          { text: 'ShowItem >= 1', value: 'show-items' },
          { text: 'Tab >= 2', value: 'multi-tab' },
        ],
        onFilter: (value, template) => {
          if (value === 'show-items') return (template.show_item_count ?? 0) > 0;
          if (value === 'multi-tab') return (template.tab_count ?? 0) >= 2;
          return true;
        },
        sorter: (left: TemplatePayload, right: TemplatePayload) => compareNumber(left.show_item_count, right.show_item_count),
      };
    }

    if (index === 4) {
      return {
        ...column,
        key: column.key ?? 'references',
        width: typeof column.width === 'number' ? column.width : 170,
        filters: [
          { text: '已被任务引用', value: 'referenced' },
          { text: '有进行中任务', value: 'active-task' },
        ],
        onFilter: (value, template) => {
          if (value === 'referenced') return (template.reference_stats?.task_count ?? 0) > 0;
          if (value === 'active-task') return (template.reference_stats?.active_task_count ?? 0) > 0;
          return true;
        },
        sorter: (left: TemplatePayload, right: TemplatePayload) =>
          compareNumber(left.reference_stats?.task_count ?? 0, right.reference_stats?.task_count ?? 0),
      };
    }

    if (index === 5) {
      return {
        ...column,
        key: column.key ?? 'updated_at',
        width: typeof column.width === 'number' ? column.width : 170,
        sorter: (left: TemplatePayload, right: TemplatePayload) => compareDateTime(left.updated_at, right.updated_at),
      };
    }

    return column;
  });
}

function decorateTaskTableColumns(
  columns: ColumnsType<TaskPayload>,
  tasks: TaskPayload[],
): ColumnsType<TaskPayload> {
  return columns.map((column, index) => {
    if (index === 0) {
      return {
        ...column,
        key: column.key ?? 'title',
        width: typeof column.width === 'number' ? column.width : 320,
        sorter: (left: TaskPayload, right: TaskPayload) => compareText(taskDisplayTitle(left), taskDisplayTitle(right)),
      };
    }

    if (index === 1) {
      return {
        ...column,
        key: column.key ?? 'status',
        filters: buildTableFilterOptions(tasks.map((task) => task.status)),
        filterSearch: true,
        onFilter: (value, task) => task.status === String(value),
        sorter: (left: TaskPayload, right: TaskPayload) => compareText(left.status, right.status),
      };
    }

    if (index === 2) {
      return {
        ...column,
        key: column.key ?? 'owner',
        filters: buildTableFilterOptions(tasks.map((task) => taskOwnerDisplayName(task))),
        filterSearch: true,
        onFilter: (value, task) => taskOwnerDisplayName(task) === String(value),
        sorter: (left: TaskPayload, right: TaskPayload) => compareText(taskOwnerDisplayName(left), taskOwnerDisplayName(right)),
      };
    }

    if (index === 3) {
      return {
        ...column,
        key: column.key ?? 'dataset-template',
        filters: [
          { text: '已绑定模板', value: 'has-template' },
          { text: '已绑定数据集', value: 'has-dataset' },
          { text: '已完成字段映射', value: 'mapped' },
        ],
        onFilter: (value, task) => {
          if (value === 'has-template') return Boolean(task.template_id);
          if (value === 'has-dataset') return Boolean(task.dataset_id);
          if (value === 'mapped') return Object.keys(task.column_mapping || {}).length > 0;
          return true;
        },
      };
    }

    if (index === 4) {
      return {
        ...column,
        key: column.key ?? 'progress',
        filters: [
          { text: '已有领取', value: 'claimed' },
          { text: '已有提交', value: 'submitted' },
          { text: '已有通过', value: 'approved' },
        ],
        onFilter: (value, task) => {
          if (value === 'claimed') return (task.stats?.claimed ?? 0) > 0;
          if (value === 'submitted') return (task.stats?.submitted ?? 0) > 0;
          if (value === 'approved') return (task.stats?.approved ?? 0) > 0;
          return true;
        },
        sorter: (left: TaskPayload, right: TaskPayload) =>
          compareNumber((left.stats?.submitted ?? 0) / Math.max(left.stats?.total ?? left.quota ?? 1, 1), (right.stats?.submitted ?? 0) / Math.max(right.stats?.total ?? right.quota ?? 1, 1)),
      };
    }

    if (index === 5) {
      return {
        ...column,
        key: column.key ?? 'review-ai',
        filters: [
          { text: 'AI 已开启', value: 'ai-enabled' },
          { text: '已分配审核员', value: 'reviewer-assigned' },
        ],
        onFilter: (value, task) => {
          if (value === 'ai-enabled') return Boolean(task.ai_config?.enabled);
          if (value === 'reviewer-assigned') return (task.reviewer_ids?.length ?? 0) > 0;
          return true;
        },
      };
    }

    if (index === 6) {
      return {
        ...column,
        key: column.key ?? 'reward',
        filters: [
          { text: '包大小分配', value: 'first_come_all' },
          { text: '企业内流转', value: 'quota_grab' },
          { text: '分享链接', value: 'share-enabled' },
          { text: '按条奖励', value: 'item' },
          { text: '按任务奖励', value: 'task' },
        ],
        filterSearch: true,
        onFilter: (value, task) => {
          if (value === 'item' || value === 'task') {
            return task.reward_rule?.mode === value;
          }
          if (value === 'share-enabled') return Boolean(task.assignment?.enabled);
          return task.distribution === value;
        },
      };
    }

    if (index === 7) {
      return {
        ...column,
        key: column.key ?? 'updated_at',
        sorter: (left: TaskPayload, right: TaskPayload) => compareDateTime(left.updated_at || left.created_at, right.updated_at || right.created_at),
      };
    }

    return column;
  });
}

function taskActionItems(task: TaskPayload) {
  const items = [];
  items.push({
    key: 'results',
    label: task.status === 'draft' ? '查看结果 / 导出（发布后可用）' : '查看结果 / 导出',
    disabled: task.status === 'draft',
  });
  if (task.distribution === 'quota_grab') items.push({ key: 'internal-labelers', label: '分配企业 Labeler', disabled: task.status === 'finished' });
  items.push({ key: 'transfer-owner', label: '转交负责人' });
  items.push({ key: 'copy', label: '复制任务' });
  if (task.status === 'draft') items.push({ key: 'publish', label: '发布任务' }, { key: 'delete', label: '删除草稿', danger: true });
  if (task.status === 'pending_review') items.push({ key: 'approve', label: '审核通过并发布' });
  if (task.status === 'published') items.push({ key: 'pause', label: '暂停发放' }, { key: 'finish', label: '结束任务', danger: true });
  if (task.status === 'paused') items.push({ key: 'resume', label: '恢复发布' }, { key: 'finish', label: '结束任务', danger: true });
  if (task.status === 'finished') {
    const deletable = Boolean(task.delete_eligibility?.deletable);
    items.push({
      key: 'delete',
      label: deletable ? '删除已结束任务' : `删除已结束任务（${taskDeleteDisabledReason(task)}）`,
      danger: true,
      disabled: !deletable,
    });
  }
  return items.length ? items : [{ key: 'noop', label: '暂无可用操作', disabled: true }];
}

function taskActionIcon(key: string): ReactNode {
  if (key === 'results') return <FileTextOutlined />;
  if (key === 'internal-labelers') return <TagsOutlined />;
  if (key === 'transfer-owner') return <ArrowRightOutlined />;
  if (key === 'copy') return <CopyOutlined />;
  if (key === 'publish' || key === 'approve') return <RocketOutlined />;
  if (key === 'pause') return <ArrowDownOutlined />;
  if (key === 'resume') return <ReloadOutlined />;
  if (key === 'finish' || key === 'delete') return <DeleteOutlined />;
  return <MoreOutlined />;
}

function taskDeleteDisabledReason(task: TaskPayload): string {
  const eligibility = task.delete_eligibility;
  if (!eligibility) return '删除状态尚未加载';
  if (eligibility.deletable) return '';
  const blockers = eligibility.blockers || {};
  const parts = [
    blockers.claimed_questions ? `${blockers.claimed_questions} 条已领取未完成` : null,
    blockers.submitted_questions || blockers.submitted_submissions ? `${Math.max(blockers.submitted_questions || 0, blockers.submitted_submissions || 0)} 条待审核` : null,
    blockers.rejected_questions || blockers.rejected_submissions ? `${Math.max(blockers.rejected_questions || 0, blockers.rejected_submissions || 0)} 条打回待处理` : null,
    blockers.draft_submissions ? `${blockers.draft_submissions} 条草稿提交` : null,
  ].filter(Boolean);
  return parts.join('，') || eligibility.reason || '当前状态不可删除';
}

function taskDeleteCounts(task: TaskPayload): NonNullable<TaskPayload['delete_eligibility']>['counts'] {
  return task.delete_eligibility?.counts || {
    questions: 0,
    pending_questions: 0,
    claimed_questions: 0,
    submitted_questions: 0,
    approved_questions: 0,
    rejected_questions: 0,
    closed_questions: 0,
    submissions: 0,
    draft_submissions: 0,
    submitted_submissions: 0,
    approved_submissions: 0,
    rejected_submissions: 0,
    abandoned_submissions: 0,
    claim_bundles: 0,
    ai_review_jobs: 0,
    export_jobs: 0,
    notifications: 0,
  };
}

function questionStatusLabel(status: string): string {
  return ({ pending: '待领取', claimed: '已领取', submitted: '已提交', approved: '已通过', rejected: '已打回' } as Record<string, string>)[status] ?? status;
}

function questionStatusColor(status: string): string {
  return ({ pending: 'default', claimed: 'blue', submitted: 'purple', approved: 'green', rejected: 'red' } as Record<string, string>)[status] ?? 'default';
}

function questionContentSummary(content: Record<string, unknown>): string {
  const entries = Object.entries(content).slice(0, 3);
  if (!entries.length) return '-';
  return entries.map(([key, value]) => `${key}: ${shorten(cellText(value), 36)}`).join(' / ');
}

function questionImportRowErrors(detail: unknown): Array<{ row: number | null; error: string }> {
  if (!detail || typeof detail !== 'object' || !Array.isArray((detail as { row_errors?: unknown }).row_errors)) return [];
  return (detail as { row_errors: unknown[] }).row_errors
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = (item as { row?: unknown }).row;
      const error = (item as { error?: unknown }).error;
      return {
        row: typeof row === 'number' ? row : null,
        error: typeof error === 'string' && error.trim() ? error : '格式错误',
      };
    })
    .filter((item): item is { row: number | null; error: string } => Boolean(item));
}

function auditActionLabel(action: string): string {
  return ({
    task_created: '创建任务',
    task_updated: '更新任务',
    task_published: '发布任务',
    task_paused: '暂停任务',
    task_resumed: '恢复任务',
    task_finished: '结束任务',
    task_deleted: '删除任务',
    task_bundle_claimed: '领取题目包',
  } as Record<string, string>)[action] ?? action;
}

function auditChangeSummary(changes: Record<string, unknown>): string {
  const entries = Object.entries(changes || {}).slice(0, 4);
  if (!entries.length) return '-';
  return entries.map(([key, value]) => `${key}: ${shorten(cellText(value), 48)}`).join(' / ');
}

function exportStatusLabel(status: string): string {
  return ({ pending: '待处理', processing: '处理中', completed: '已完成', failed: '失败', cancelled: '已取消' } as Record<string, string>)[status] ?? status;
}

function exportStatusColor(status: string): string {
  return ({ pending: 'default', processing: 'blue', completed: 'green', failed: 'red', cancelled: 'orange' } as Record<string, string>)[status] ?? 'default';
}

function formatFileSize(value?: number | null): string {
  if (!value) return '-';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function shortId(value?: string | null): string {
  if (!value) return '-';
  return value.length > 10 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function formatDateTime(value?: string | null): string {
  return formatApiDateTime(value);
}

function sampleContent(dataset: DatasetPayload | null, rowIndex = 0): Record<string, unknown> {
  const fallback = {
    title: '示例文本',
    image_url: defaultRendererPreviewImage,
    audio_url: 'https://example.com/sample.mp3',
    video_url: 'https://example.com/sample.mp4',
    derived_context: { asr_text: '这是一段示例音频转写', ocr_text: '这是一段示例 OCR 文字' },
  };
  const sourceRow = dataset?.preview_rows[rowIndex]
    ?? dataset?.rows?.[rowIndex]
    ?? dataset?.preview_rows[0]
    ?? dataset?.rows?.[0]
    ?? {};
  const row = {
    ...fallback,
    ...sourceRow,
  };
  const imageMedia = rowMediaForPreview(row, 'image', 'image_url');
  const audioMedia = rowMediaForPreview(row, 'audio', 'audio_url');
  const videoMedia = rowMediaForPreview(row, 'video', 'video_url');
  return {
    ...row,
    show_title: row.title ?? Object.values(row)[0] ?? '示例文本',
    show_image: imageMedia ?? row.image_url ?? '',
    show_audio: audioMedia ?? row.audio_url ?? '',
    show_video: videoMedia ?? row.video_url ?? '',
  };
}

function rowMediaForPreview(row: Record<string, unknown>, type: string, field: string): DatasetMediaRef | null {
  const column: DatasetColumn = { name: field, data_type: type, samples: [] };
  return rowMediaForColumn(row, column, row[field]);
}

function downloadBlob(blob: Blob, filename: string): void {
  if (typeof URL === 'undefined' || !URL.createObjectURL) return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
