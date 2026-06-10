import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { persistSession } from '../../stores/authStore';
import { AiReviewTaskDetailPage } from './AiReviewPage';
import { buildDataSourceOptions, imageMaskSourceOptions } from './OwnerProductionPages';
import { TemplateRenderer } from './TemplateRenderer';
import { WorkspaceApp, type WorkspacePage } from './WorkspaceApp';
import type { AuthSession } from '../../stores/authStore';
import type { DatasetPayload } from '../../types/api';

const adminSession: AuthSession = {
  accessToken: 'admin-token',
  refreshToken: 'refresh-token',
  user: {
    user_id: 'admin-1',
    username: 'admin01',
    display_name: 'Admin One',
    email: 'admin@example.com',
    role: 'admin',
    email_verified: true,
    permissions: ['team:create'],
  },
};

function WorkspaceHarness({ initialPage }: { initialPage: WorkspacePage }) {
  const [page, setPage] = useState<WorkspacePage>(initialPage);
  return <WorkspaceApp initialSession={adminSession} page={page} onPageChange={setPage} />;
}

async function clickWorkspaceMoreMenuItem(user: ReturnType<typeof userEvent.setup>, label: string | RegExp) {
  const buttons = screen.getAllByRole('button', { name: '更多操作' });
  for (const button of buttons) {
    await user.click(button);
    await waitFor(() => expect(screen.queryAllByRole('menuitem').length).toBeGreaterThan(0));
    const item = screen.queryAllByRole('menuitem').find((menuItem) => {
      const text = menuItem.textContent?.replace(/\s+/g, '') ?? '';
      if (typeof label === 'string') return text.includes(label.replace(/\s+/g, ''));
      return label.test(text);
    });
    if (item) {
      item.style.pointerEvents = 'auto';
      await user.click(item);
      return;
    }
    await user.keyboard('{Escape}');
  }
  throw new Error(`未找到更多菜单项：${String(label)}`);
}

async function clickRowMoreMenuItem(user: ReturnType<typeof userEvent.setup>, row: HTMLElement, label: string | RegExp) {
  const previousMenuCount = screen.queryAllByRole('menuitem').length;
  await user.click(within(row).getByRole('button', { name: '更多操作' }));
  await waitFor(() => expect(screen.queryAllByRole('menuitem').length).toBeGreaterThan(previousMenuCount));
  const items = screen.queryAllByRole('menuitem').filter((menuItem) => {
    const text = menuItem.textContent?.replace(/\s+/g, '') ?? '';
    if (typeof label === 'string') return text.includes(label.replace(/\s+/g, ''));
    return label.test(text);
  });
  const item = items.at(-1);
  expect(item).toBeTruthy();
  item!.style.pointerEvents = 'auto';
  await user.click(item!);
}

async function confirmLatestDialogAction(user: ReturnType<typeof userEvent.setup>, label: string | RegExp, title?: string) {
  if (title) await waitFor(() => expect(screen.queryAllByText(title).length).toBeGreaterThan(0));
  const dialogs = await screen.findAllByRole('dialog');
  const dialog = title
    ? [...dialogs].reverse().find((candidate) => within(candidate).queryAllByText(title).length > 0)
    : dialogs.at(-1);
  expect(dialog).toBeTruthy();
  await user.click(within(dialog!).getByRole('button', { name: label }));
}

function getButtonByCompactName(label: string) {
  return screen.getAllByRole('button').find((button) => (button.textContent ?? '').replace(/\s+/g, '') === label);
}

async function findButtonByCompactName(label: string) {
  return waitFor(() => {
    const button = getButtonByCompactName(label);
    expect(button).toBeTruthy();
    return button as HTMLElement;
  });
}

const labelerSession: AuthSession = {
  accessToken: 'labeler-token',
  refreshToken: 'refresh-token',
  user: {
    user_id: 'labeler-1',
    username: 'labeler01',
    display_name: 'Labeler One',
    email: 'labeler@example.com',
    role: 'labeler',
    email_verified: true,
    permissions: ['label:read', 'label:write', 'submission:submit'],
  },
};

const teamLabelerSession: AuthSession = {
  ...labelerSession,
  user: {
    ...labelerSession.user,
    team_id: 'team-1',
    default_team_id: 'team-1',
    team_role: 'labeler',
    permissions: ['team:read', 'label:read', 'label:write', 'submission:submit'],
  },
};

const reviewerSession: AuthSession = {
  accessToken: 'reviewer-token',
  refreshToken: 'refresh-token',
  user: {
    user_id: 'reviewer-1',
    username: 'reviewer01',
    display_name: 'Reviewer One',
    email: 'reviewer@example.com',
    role: 'reviewer',
    email_verified: true,
    permissions: ['team:read', 'task:read', 'submission:view', 'review:submit'],
  },
};

const teamReviewerSession: AuthSession = {
  ...reviewerSession,
  user: {
    ...reviewerSession.user,
    team_id: 'team-1',
    default_team_id: 'team-1',
    team_role: 'reviewer',
    permissions: ['team:read', 'task:read', 'submission:view', 'review:submit'],
  },
};

const teamOwnerSession: AuthSession = {
  accessToken: 'owner-token',
  refreshToken: 'refresh-token',
  user: {
    user_id: 'owner-1',
    username: 'owner01',
    display_name: 'Owner One',
    email: 'owner@example.com',
    role: 'owner',
    email_verified: true,
    team_id: 'team-1',
    default_team_id: 'team-1',
    team_role: 'owner',
    permissions: ['team:read', 'team:manage', 'member:read', 'member:update', 'task:create', 'task:manage'],
  },
};

const teamAdminSession: AuthSession = {
  accessToken: 'team-admin-token',
  refreshToken: 'refresh-token',
  user: {
    user_id: 'admin-1',
    username: 'admin01',
    display_name: 'Admin One',
    email: 'admin@example.com',
    role: 'team_admin',
    email_verified: true,
    team_id: 'team-1',
    default_team_id: 'team-1',
    team_role: 'team_admin',
    permissions: ['team:read', 'team:manage', 'task:read', 'task:manage', 'submission:view'],
  },
};

const teamDetail = {
  team_id: 'team-1',
  company_name: 'Demo Team',
  industry: 'AI',
  contact_phone: '13800138000',
  description: 'Team profile',
  logo_url: null,
  website: 'https://example.com',
  address: 'Shanghai',
  owner_user_id: 'admin-1',
  status: 'active',
  verification_status: 'unverified',
  legal_name: null,
  registration_number: null,
  verification_contact: null,
  verification_phone: null,
  verification_materials: [],
  verification_review_comment: null,
  verification_submitted_at: null,
  billing_info: {
    invoice_type: 'special',
    invoice_title: 'Demo Team',
    tax_number: '91310000DEMO',
    invoice_address: 'Shanghai Pudong',
    invoice_phone: '021-12345678',
    bank_name: '招商银行上海分行',
    bank_account: '6222020000000000',
    invoice_email: 'finance@example.com',
    invoice_remark: '月度结算',
  },
  mailing_info: {
    recipient_name: '张三',
    recipient_phone: '13800138001',
    region: '上海市 浦东新区',
    detail_address: '世纪大道 100 号',
    postal_code: '200120',
    address_alias: '总部',
    is_default: true,
  },
  member_count: 3,
  member_stats: { team_admins: 1, owners: 1, reviewers: 1, agents: 1, labelers: 0 },
  membership: {
    team_id: 'team-1',
    current_plan: 'pro',
    effective_plan: 'pro',
    status: 'active',
    started_at: '2026-05-01T00:00:00Z',
    expires_at: '2027-05-01T00:00:00Z',
    next_plan: null,
    last_paid_at: '2026-05-01T00:00:00Z',
    usage: { members: 3, active_tasks: 2, storage_bytes: 1024 ** 3 },
    limits: { members: 50, active_tasks: 30, storage_bytes: 500 * 1024 ** 3 },
    over_limit_items: [],
    plans: [],
  },
  ai_budget: { total_limit: 1000, used: 100, remaining: 900 },
  created_at: '2026-05-25T00:00:00Z',
};

const teamDashboardPayload = {
  team: {
    team_id: 'team-1',
    company_name: 'Demo Team',
    status: 'active',
    verification_status: 'verified',
    member_count: 4,
    member_stats: { team_admins: 1, owners: 1, reviewers: 1, agents: 1, labelers: 0 },
    membership: { current_plan: 'pro', effective_plan: 'pro', status: 'active', expires_at: '2027-05-01T00:00:00Z', next_plan: null },
  },
  viewer_role: 'team_admin',
  summary_cards: [
    { key: 'active_tasks', label: '活跃任务', value: 3, status: 'processing', hint: '总任务 5' },
    { key: 'review_pending', label: '待人工审核', value: 2, status: 'warning', hint: '已处理 8' },
    { key: 'ai_pending', label: 'AI 预审队列', value: 1, status: 'processing', hint: '失败 0' },
    { key: 'exports', label: '导出任务', value: 4, status: 'success', hint: '失败 0' },
    { key: 'points', label: '企业可用积分', value: 980, status: 'success', hint: '预扣 20' },
    { key: 'members', label: '成员额度', value: 4, status: 'success', hint: '上限 50' },
  ],
  todo_items: [
    { key: 'manual_review', type: 'warning', title: '待人工审核提交', count: 2, target_page: 'manual-review' },
  ],
  production: {
    tasks: { total: 5, draft: 1, pending_review: 1, published: 2, paused: 0, finished: 1 },
    questions: { total: 20, claimed: 12, submitted: 10, approved: 8, rejected: 2 },
    recent_tasks: [
      { task_id: 'task-1', title: '合同审核任务', status: 'published', owner_id: 'owner-1', question_total: 20, claimed: 12, submitted: 10, approved: 8, rejected: 2, progress_percent: 40, updated_at: '2026-05-26T00:00:00Z' },
    ],
  },
  review: { pending: 2, completed: 8, approved: 7, rejected: 1, total_visible: 10, task_count: 2, by_status: { submitted: 2, approved: 7, rejected: 1 } },
  ai: {
    jobs: { total: 3, pending: 1, processing: 0, completed: 2, failed: 0, by_status: { pending: 1, completed: 2 } },
    wallet: { team_id: 'team-1', balance_points: 520, updated_at: '2026-05-26T00:00:00Z' },
    providers: { total: 2, enabled: 2, platform_shared: 1, team_owned: 1 },
    recent_jobs: [],
  },
  exports: { total: 4, pending: 0, processing: 0, completed: 4, failed: 0, cancelled: 0, recent_exports: [] },
  resources: {
    points_wallet: { team_id: 'team-1', balance_points: 1000, reserved_points: 20, pending_payment_points: 0, spent_points: 100, available_points: 980, alert_enabled: true, alert_threshold: 100, updated_at: '2026-05-26T00:00:00Z' },
    membership: teamDetail.membership,
  },
  governance: {
    notifications: [{ notification_id: 'notice-1', team_id: 'team-1', title: '本周质检提醒', content: '请关注待审核任务', notification_type: 'organization', priority: 'important', target_type: 'team', target_roles: [], target_user_ids: [], status: 'unread', is_read: false, is_handled: false, read_count: 0, handled_count: 0, email_enabled: false, in_app_enabled: true, created_at: '2026-05-26T00:00:00Z' }],
    audit_logs: [{ log_id: 'log-1', team_id: 'team-1', entity_type: 'task', entity_id: 'task-1', action: 'task_published', operator_id: 'admin-1', changes: {}, risk_level: 'important', summary: '发布任务', created_at: '2026-05-26T00:00:00Z' }],
  },
  shortcuts: [
    { key: 'task-management', label: '进入任务管理', target_page: 'task-management', kind: 'primary' },
    { key: 'people-management', label: '管理成员', target_page: 'people-management', kind: 'default' },
    { key: 'resource-config', label: '查看资源配置', target_page: 'resource-config', kind: 'default' },
  ],
  generated_at: '2026-05-26T00:00:00Z',
};

const profilePayload = {
  user: { ...labelerSession.user, status: 'active' },
  profile: {
    display_name: 'Labeler One',
    real_name: '张三',
    bio: 'bio',
    phone: '13800138000',
    profession: '运营经理',
    location: 'Shanghai',
    education_summary: '本科',
    expertise_tags: ['法律', '金融'],
    notification_settings: { email: true },
  },
  certifications: [
    { cert_id: 'cert-1', cert_category: 'education', cert_type: 'bachelor', cert_name: '复旦大学 本科', status: 'approved', provider: 'manual', submitted_data: {}, documents: [], created_at: '2026-05-25T00:00:00Z' },
  ],
  points: { total_points: 20, available_points: 20, level: 'bronze', updated_at: '2026-05-25T00:00:00Z' },
};

const memberListPayload = {
  items: [
    { user_id: 'admin-1', username: 'admin01', display_name: 'Admin One', email: 'admin@example.com', team_role: 'team_admin', team_role_label: '企业管理员', permission_count: 8, assigned_task_count: 0, member_status: 'active', email_verified: true, is_current_user: true, actions: { can_edit: false, can_remove: false, can_disable: false }, joined_at: '2026-05-25T00:00:00Z' },
    { user_id: 'owner-1', username: 'owner01', display_name: 'Owner One', email: 'owner@example.com', team_role: 'owner', team_role_label: '任务发布者', permission_count: 6, assigned_task_count: 2, member_status: 'active', email_verified: true, actions: { can_edit: true, can_remove: true, can_disable: true }, joined_at: '2026-05-24T00:00:00Z' },
    { user_id: 'reviewer-1', username: 'reviewer01', display_name: 'Reviewer One', email: 'reviewer@example.com', team_role: 'reviewer', team_role_label: '审核员', permission_count: 4, assigned_tasks: ['review-task-1', 'review-task-2'], assigned_task_count: 2, member_status: 'active', email_verified: false, actions: { can_edit: true, can_remove: true, can_disable: true }, joined_at: '2026-05-23T00:00:00Z' },
    { user_id: 'agent-1', username: 'aiagt_team1', display_name: 'Agent', email: undefined, team_role: 'agent', team_role_label: 'AI资源管理员', permission_count: 3, assigned_tasks: ['agent-task-1'], assigned_task_count: 1, member_status: 'active', email_verified: true, is_system_member: true, actions: { can_edit: false, can_remove: false, can_disable: false }, joined_at: '2026-05-22T00:00:00Z' },
  ],
  pagination: { page: 1, page_size: 100, total: 4, total_pages: 1 },
};

const datasetPayload = {
  dataset_id: 'dataset-1',
  team_id: 'team-1',
  owner_id: 'dataset-owner-1',
  owner_name: '数据负责人',
  updated_by: 'dataset-editor-1',
  updated_by_name: '最新修改人',
  name: '混合素材数据集',
  description: '文本、图片、音频',
  source_format: 'csv',
  columns: [
    { name: 'title', data_type: 'text', samples: ['合同条款'], comment: '', use_in_mapping: true },
    { name: 'image_url', data_type: 'image', samples: ['https://cdn.example.com/img.png'], comment: '', use_in_mapping: true },
  ],
  preview_rows: [{ title: '合同条款', image_url: 'https://cdn.example.com/img.png' }],
  rows: [{ title: '合同条款', image_url: 'https://cdn.example.com/img.png' }],
  media_assets: [],
  row_count: 1,
  status: 'ready',
};

const rendererDatasetPayload = {
  ...datasetPayload,
  row_count: 2,
  preview_rows: [
    { title: '合同条款', image_url: 'https://cdn.example.com/img.png' },
    { title: '第二条款', image_url: 'https://cdn.example.com/img-2.png' },
  ],
  rows: [
    { title: '合同条款', image_url: 'https://cdn.example.com/img.png' },
    { title: '第二条款', image_url: 'https://cdn.example.com/img-2.png' },
  ],
};

const templatePayload = {
  template_id: 'template-1',
  team_id: 'team-1',
  owner_id: 'template-owner-1',
  owner_name: '模板负责人',
  name: '多模态模板',
  description: '多页签模板',
  latest_version: 1,
  status: 'published',
  show_item_count: 2,
  tab_count: 2,
  schema: {
    schema_version: '1.0',
    tabs: [
      {
        id: 'tab_read',
        title: '阅读材料',
        components: [
          { id: 'show_title', type: 'ShowItem', field: 'show_title', label: '标题', required: false, config: {}, options: [], version: '1.0' },
          { id: 'show_image', type: 'ShowItem', field: 'show_image', label: '图片', required: false, config: {}, options: [], version: '1.0' },
        ],
      },
      { id: 'tab_label', title: '标注答案', components: [] },
    ],
    components: [],
    validation_rules: {},
    linkage_rules: [],
    llm_config: {},
  },
};

const labelingWorkbenchPayload = {
  task: {
    task_id: 'task-labeling',
    title: '合同条款标注',
    description: '判断合同条款类型',
    rich_content: null,
    tags: ['合同'],
    status: 'published',
    category: 'text',
    difficulty: 'easy',
    deadline: '2026-06-01',
    reward_rule: { mode: 'item', points_per_item: 5 },
    template_id: 'template-labeling',
    template_version_id: 'template-labeling:v1',
    stats: { total: 2, claimed: 2, submitted: 0, approved: 0, rejected: 0 },
  },
  template: {
    template_id: 'template-labeling',
    template_version_id: 'template-labeling:v1',
    version: 1,
    schema: {
      schema_version: '1.0',
      tabs: [
        {
          id: 'read',
          title: '阅读材料',
          components: [
            { id: 'show_title', type: 'ShowItem', field: 'show_title', label: '原始标题', required: false, config: {}, options: [], version: '1.0' },
          ],
        },
        {
          id: 'answer',
          title: '标注答案',
          components: [
            { id: 'intent', type: 'SingleSelect', field: 'intent', label: '条款类型', required: true, config: {}, options: [{ value: 'payment', label: '付款条款' }, { value: 'risk', label: '风险条款' }], version: '1.0' },
            { id: 'reason', type: 'TextArea', field: 'reason', label: '判断理由', required: true, config: {}, options: [], version: '1.0' },
          ],
        },
      ],
      components: [],
      validation_rules: {},
      linkage_rules: [],
      llm_config: {},
    },
  },
  questions: [
    { question_id: 'question-1', row_index: 0, status: 'claimed', submission_status: 'draft', updated_at: '2026-05-29T00:00:00Z' },
    { question_id: 'question-2', row_index: 1, status: 'claimed', submission_status: null, updated_at: '2026-05-29T00:01:00Z' },
  ],
  current_question: {
    question_id: 'question-1',
    team_id: 'team-1',
    task_id: 'task-labeling',
    dataset_id: 'dataset-labeling',
    row_index: 0,
    content: { show_title: '合同条款截图与文本混合标注' },
    status: 'claimed',
    assigned_to: 'labeler-1',
    submission: {
      submission_id: 'submission-1',
      team_id: 'team-1',
      task_id: 'task-labeling',
      question_id: 'question-1',
      labeler_id: 'labeler-1',
      template_id: 'template-labeling',
      template_version_id: 'template-labeling:v1',
      answers: { intent: 'payment' },
      draft: { intent: 'payment' },
      status: 'draft',
      current_round: 1,
      validation_result: {},
      submitted_at: null,
      created_at: '2026-05-29T00:00:00Z',
      updated_at: '2026-05-29T00:00:00Z',
    },
    template_schema: undefined,
    created_at: '2026-05-29T00:00:00Z',
    updated_at: '2026-05-29T00:00:00Z',
  },
  progress: { total: 2, submitted: 0, rejected: 0, remaining: 2, percent: 0 },
};

const labelingQuestionTwoPayload = {
  ...labelingWorkbenchPayload.current_question,
  question_id: 'question-2',
  row_index: 1,
  content: { show_title: '第二条合同条款' },
  status: 'claimed',
  submission: {
    ...labelingWorkbenchPayload.current_question.submission,
    submission_id: 'submission-2',
    question_id: 'question-2',
    answers: {},
    draft: {},
    status: 'draft',
    submitted_at: null,
    updated_at: '2026-05-29T00:01:00Z',
  },
  updated_at: '2026-05-29T00:01:00Z',
};

const labelerDashboardTask = {
  task: labelingWorkbenchPayload.task,
  progress: labelingWorkbenchPayload.progress,
  latest_question_id: 'question-1',
  last_updated_at: '2026-05-29T00:01:00Z',
  task_submitted: false,
  needs_revision: false,
};

const labelerDashboardRecord = {
  submission_id: 'submission-1',
  task_id: 'task-labeling',
  task_title: '合同条款标注',
  question_id: 'question-1',
  row_index: 1,
  status: 'submitted',
  unit_points: 5,
  submitted_at: '2026-05-29T00:03:00Z',
  updated_at: '2026-05-29T00:03:00Z',
};

const baseLabelerDashboard = {
  profile: {
    user_id: 'labeler-1',
    username: 'labeler01',
    display_name: 'Labeler One',
    email: 'labeler@example.com',
    reputation_score: 96,
  },
  summary_cards: [
    { key: 'tasks', label: '已领取任务', value: 1, status: 'processing', hint: '待处理 2' },
    { key: 'pending', label: '待标注', value: 2, status: 'warning', hint: '尽快完成' },
    { key: 'submitted', label: '待审核', value: 1, status: 'processing', hint: '已提交' },
    { key: 'approved', label: '已通过', value: 0, status: 'success', hint: '暂无通过' },
  ],
  todo_items: [{ key: 'continue', type: 'warning', title: '待标注题目', count: 2, target_page: 'labeler-tasks' }],
  labeling: {
    total_tasks: 1,
    active_tasks: 1,
    total_questions: 2,
    pending_questions: 2,
    submitted_questions: 1,
    approved_questions: 0,
    rejected_questions: 0,
    completion_percent: 0,
    status_distribution: [{ label: '待标注', value: 2 }, { label: '待审核', value: 1 }],
    submission_distribution: [{ label: '待审核', value: 1 }],
  },
  quality: { approval_rate: 0, rework_rate: 0, pending_review: 1, reviewed: 0, accuracy_rate: 0 },
  recent_tasks: [labelerDashboardTask],
  recent_records: [labelerDashboardRecord],
  shortcuts: [
    { key: 'continue', label: '继续标注', target_page: 'labeler-tasks', kind: 'primary' },
    { key: 'history', label: '任务历史', target_page: 'labeler-questions', kind: 'default' },
  ],
  generated_at: '2026-05-29T00:05:00Z',
};

const personalLabelerDashboardPayload = {
  ...baseLabelerDashboard,
  viewer_role: 'personal_labeler',
  points: {
    wallet: { total_points: 120, available_points: 80, level: 'bronze', updated_at: '2026-05-29T00:00:00Z' },
    overview: { total_points: 120, available_points: 80, settled_points: 80, pending_points: 40, spent_points: 0, today_points: 10, month_points: 120, level: 'bronze', next_level_gap: 180, updated_at: '2026-05-29T00:00:00Z' },
    recent_items: [],
  },
  certifications: { items: [] },
  recommended_tasks: [{
    task_id: 'public-task-1',
    title: '推荐任务：新闻摘要标注',
    category: 'text',
    description: '面向个人 Labeler 的公开任务',
    unit_points: 8,
    bundle_options: [5, 10],
    available_items: 20,
    deadline: null,
    deadline_mode: 'long_term',
    completion_hours: null,
    difficulty: 'easy',
    tags: ['推荐'],
    status: 'open',
    owner_team_name: '平台精选',
    estimated_minutes: 5,
    published_at: '2026-05-29T00:00:00Z',
    priority: 'recommended',
    team_verified: true,
    deliverable: '结构化答案',
    qualification_required: 'none',
    review_notes: '保持一致性',
  }],
};

const teamLabelerDashboardPayload = {
  ...baseLabelerDashboard,
  viewer_role: 'team_labeler',
  team: {
    team_id: 'team-1',
    company_name: 'Demo Team',
    status: 'active',
    verification_status: 'verified',
  },
  summary_cards: [
    { key: 'company_tasks', label: '公司分配任务', value: 1, status: 'processing', hint: '公司项目' },
    { key: 'pending', label: '待标注题目', value: 2, status: 'warning', hint: '项目内' },
    { key: 'submitted', label: '待审核提交', value: 1, status: 'processing', hint: '等待复核' },
    { key: 'approved', label: '已通过', value: 0, status: 'success', hint: '暂无通过' },
  ],
  shortcuts: [
    { key: 'continue-company', label: '继续公司项目', target_page: 'labeler-tasks', kind: 'primary' },
    { key: 'company-history', label: '项目历史', target_page: 'labeler-questions', kind: 'default' },
  ],
  notifications: [{
    notification_id: 'notice-1',
    team_id: 'team-1',
    title: '企业通知：本周交付安排',
    content: '请优先完成公司项目。',
    notification_type: 'organization',
    priority: 'important',
    target_type: 'member',
    target_roles: ['labeler'],
    target_user_ids: ['labeler-1'],
    status: 'unread',
    is_read: false,
    is_handled: false,
    read_count: 0,
    handled_count: 0,
    email_enabled: false,
    in_app_enabled: true,
    created_at: '2026-05-29T00:00:00Z',
  }],
};

const templateReadinessPayload = {
  template_id: 'template-1',
  ready: true,
  checks: [
    { key: 'tabs', label: '页签结构', status: 'pass', message: '已配置页签' },
    { key: 'field_unique', label: '字段 key 唯一', status: 'pass', message: '字段 key 无重复' },
  ],
  blockers: [],
  warnings: [],
  summary: { tab_count: 3, component_count: 2, show_item_count: 0, answer_field_count: 2, llm_count: 0 },
};

const templateVersionsPayload = {
  versions: [
    {
      version_id: 'version-2',
      version: 2,
      is_published: false,
      schema: {
        ...templatePayload.schema,
        tabs: [
          ...templatePayload.schema.tabs,
          {
            id: 'review',
            title: '复核字段',
            components: [
              { id: 'intent_v2', type: 'SingleSelect', field: 'intent', label: '意图', required: true, config: {}, options: [{ value: 'risk', label: '风险' }], version: '1.0' },
            ],
          },
        ],
      },
      component_stats: { tab_count: 2, component_count: 3, show_item_count: 2, answer_field_count: 1, llm_count: 0 },
      reference_stats: { task_count: 1, active_task_count: 1 },
      created_at: '2026-05-29T01:00:00Z',
    },
    {
      version_id: 'version-1',
      version: 1,
      is_published: true,
      schema: templatePayload.schema,
      component_stats: { tab_count: 2, component_count: 2, show_item_count: 2, answer_field_count: 0, llm_count: 0 },
      reference_stats: { task_count: 2, active_task_count: 1 },
      created_at: '2026-05-29T00:00:00Z',
    },
  ],
};

const templateVersionDiffPayload = {
  template_id: 'template-1',
  from_version: 1,
  to_version: 2,
  summary: {
    added_components: [{ id: 'intent', type: 'SingleSelect', field: 'intent', label: '意图' }],
    removed_components: [],
    modified_components: [{ component_id: 'show_title', label: '标题', changed_fields: ['label'] }],
    field_changes: [{ component_id: 'intent', from: 'old_intent', to: 'intent' }],
    validation_changed: true,
    linkage_changed: false,
    high_risk_changes: [{ component_id: 'show_title', from: 'ShowItem', to: 'ShowItem' }],
  },
};

const pointsBudgetPayload = {
  team_id: 'team-1',
  balance_points: 1000,
  reserved_points: 100,
  spent_points: 15,
  available_points: 900,
  alert_enabled: false,
  alert_threshold: 80,
};

const membershipPayload = {
  team_id: 'team-1',
  current_plan: 'free',
  effective_plan: 'free',
  status: 'active',
  started_at: null,
  expires_at: null,
  next_plan: null,
  last_paid_at: null,
  usage: { members: 3, active_tasks: 2, storage_bytes: 1024 ** 3 },
  limits: { members: 3, active_tasks: 3, storage_bytes: 3 * 1024 ** 3 },
  over_limit_items: [],
  plans: [
    { plan: 'free', name: 'Free', annual_fee_points: 0, member_limit: 3, active_task_limit: 3, storage_bytes_limit: 3 * 1024 ** 3, purchasable: false, contact_only: false },
    { plan: 'basic', name: 'Basic', annual_fee_points: 999, member_limit: 10, active_task_limit: 5, storage_bytes_limit: 20 * 1024 ** 3, purchasable: true, contact_only: false },
    { plan: 'pro', name: 'Pro', annual_fee_points: 3999, member_limit: 50, active_task_limit: 30, storage_bytes_limit: 500 * 1024 ** 3, purchasable: true, contact_only: false },
    { plan: 'enterprise', name: 'Enterprise', annual_fee_points: 19999, member_limit: 300, active_task_limit: 200, storage_bytes_limit: 2 * 1024 ** 4, purchasable: true, contact_only: false },
    { plan: 'more', name: 'More', annual_fee_points: null, member_limit: null, active_task_limit: null, storage_bytes_limit: null, purchasable: false, contact_only: true },
  ],
};

const pointsWalletLedgerPayload = {
  items: [
    {
      ledger_id: 'ledger-1',
      team_id: 'team-1',
      transaction_type: 'recharge',
      direction: 'in',
      amount: 1000,
      balance_after: 1000,
      status: 'completed',
      note: '企业初始化充值',
      payment_method: 'wechat',
      reference_no: 'RCG-10001',
      source_type: null,
      source_id: null,
      operator_id: 'admin-1',
      meta: {},
      created_at: '2026-05-29T09:00:00Z',
      updated_at: '2026-05-29T09:00:00Z',
    },
    {
      ledger_id: 'ledger-2',
      team_id: 'team-1',
      transaction_type: 'reward_spend',
      direction: 'out',
      amount: 15,
      balance_after: 985,
      status: 'completed',
      note: '审核通过后发放奖励',
      payment_method: null,
      reference_no: 'SPD-20001',
      source_type: 'submission_review',
      source_id: 'submission-1',
      operator_id: 'admin-1',
      meta: {},
      created_at: '2026-05-29T10:00:00Z',
      updated_at: '2026-05-29T10:00:00Z',
    },
  ],
  pagination: { page: 1, page_size: 100, total: 2, total_pages: 1 },
};

const agentSettingsPayload = {
  user_id: 'agent-1',
  username: 'aiagt_team1',
  team_role: 'agent',
  role_label: 'Agent',
  display_name: 'Agent',
  avatar: '/agent-avatars/agent-orbit.svg',
  preset_avatar_key: 'agent-orbit',
  default_display_name: 'Agent',
  default_avatar_url: '/agent-avatars/agent-orbit.svg',
  preset_avatar_options: [
    { key: 'agent-orbit', label: 'Orbit', url: '/agent-avatars/agent-orbit.svg', description: '官方默认头像' },
    { key: 'agent-grid', label: 'Grid', url: '/agent-avatars/agent-grid.svg', description: '结构化风格头像' },
  ],
  is_system_member: true,
  editable_fields: ['display_name', 'avatar'],
};

const providerPayload = {
  provider_id: 'provider-1',
  team_id: 'team-1',
  provider_name: '法务审核专线',
  route_name: '法务审核主路由',
  provider_kind: 'OpenAI',
  provider: 'OpenAI',
  scope: 'team',
  is_platform_default: false,
  team_can_manage: true,
  api_base: 'https://api.example.com/v1',
  api_key_configured: true,
  model_id: 'gpt-4.1-mini',
  default_model: 'gpt-4.1-mini',
  models: ['gpt-4.1-mini'],
  pricing: {
    input_price_per_million: 4.5,
    output_price_per_million: 12,
    cache_hit_price_per_million: 1.5,
  },
  capabilities: ['text', 'image'],
  runtime_config: {
    temperature: 0,
    max_output_tokens: 4096,
    timeout_ms: 15000,
  },
  status: 'enabled',
  remark: '',
  last_test_status: 'success',
  last_test_at: '2026-05-29T00:00:00Z',
  last_test_latency_ms: 120,
  last_request_id: 'req-provider-1',
  updated_at: '2026-05-29T00:00:00Z',
};

const platformProviderPayload = {
  provider_id: 'provider-platform-1',
  team_id: null,
  provider_name: '平台法务助手',
  route_name: '平台共享默认路由',
  provider_kind: 'OpenAI Compatible',
  provider: 'OpenAI Compatible',
  scope: 'platform',
  is_platform_default: true,
  team_can_manage: false,
  api_base: 'https://platform-gateway.example.com/v1',
  api_key_configured: true,
  model_id: 'gpt-4.1-mini',
  default_model: 'gpt-4.1-mini',
  models: ['gpt-4.1-mini'],
  pricing: {
    input_price_per_million: 4.2,
    output_price_per_million: 11.8,
    cache_hit_price_per_million: 1.1,
  },
  capabilities: ['text'],
  runtime_config: {
    temperature: 0,
    max_output_tokens: 4096,
    timeout_ms: 15000,
  },
  status: 'enabled',
  remark: '平台统一维护',
  last_test_status: 'success',
  last_test_at: '2026-05-29T00:00:00Z',
  last_test_latency_ms: 95,
  last_request_id: 'req-platform-provider-1',
  updated_at: '2026-05-29T00:00:00Z',
};

const aiWalletPayload = {
  team_id: 'team-1',
  balance_points: 188.5,
  updated_at: '2026-05-29T10:30:00Z',
};

const aiHistoryPayload = {
  items: [
    {
      history_id: 'ledger:ai-ledger-1',
      record_type: 'transfer_in',
      created_at: '2026-05-29T09:00:00Z',
      model_name: null,
      route_name: null,
      tokens: null,
      points_delta: 200,
      balance_after: 200,
      status: 'completed',
      request_id: 'req-transfer-1',
      source_label: 'wechat',
    },
    {
      history_id: 'call:log-1',
      record_type: 'ai_call',
      created_at: '2026-05-29T10:00:00Z',
      provider_name: '平台法务助手',
      model_name: 'gpt-4.1-mini',
      route_name: '平台共享默认路由',
      tokens: 8,
      points_delta: -11.5,
      balance_after: 188.5,
      status: 'success',
      request_id: 'req-ai-wallet-1',
      source_label: 'ai_review',
    },
  ],
};

const notificationPayload = {
  notification_id: 'notice-1',
  team_id: 'team-1',
  title: '审核排班提醒',
  content: '请 Reviewer 本周完成复审。',
  notification_type: 'team',
  priority: 'important',
  target_type: 'role',
  target_roles: ['reviewer'],
  target_user_ids: [],
  related_entity_type: 'task',
  related_entity_id: 'task-1',
  sender_id: 'admin-1',
  sender_name: 'admin01',
  status: 'unread',
  is_read: false,
  is_handled: false,
  read_count: 0,
  handled_count: 0,
  email_enabled: false,
  in_app_enabled: true,
  recipient_summary: { total: 1, role_counts: { reviewer: 1 }, user_ids: ['reviewer-1'] },
  created_at: '2026-05-29T00:00:00Z',
};

const auditLogPayload = {
  log_id: 'log-1',
  entity_type: 'team_member',
  entity_id: 'owner-1',
  action: 'member_updated',
  operator_id: 'admin-1',
  request_id: 'req-audit-1',
  changes: { team_role: { from: 'reviewer', to: 'owner' } },
  ip_address: '127.0.0.1',
  user_agent: 'vitest',
  risk_level: 'high',
  summary: 'team_role: reviewer -> owner',
  created_at: '2026-05-29T00:00:00Z',
};

const auditLogDetailPayload = {
  ...auditLogPayload,
  request_id: 'req-audit-detail',
  changes: {
    team_role: { from: 'agent', to: 'owner' },
    permission_count: { from: 3, to: 6 },
  },
  summary: 'team_role: agent -> owner；permission_count: 3 -> 6',
};

const agentAuditLogPayload = {
  log_id: 'log-agent-1',
  entity_type: 'ai_review',
  entity_id: 'job-1',
  action: 'ai_review_job_processed',
  operator_id: null,
  request_id: 'req-agent-audit-1',
  changes: {
    agent_actor: 'MarkUp Agent',
    task_id: 'task-1',
    submission_id: 'submission-1',
    status: 'completed',
    ai_suggestion: 'manual',
    total_score: 72,
    risk_flags: ['ambiguous'],
    provider_id: 'provider-1',
    model: 'mock-model',
    request_id: 'req-ai-review-worker',
  },
  ip_address: null,
  user_agent: null,
  risk_level: 'important',
  summary: 'agent_actor: MarkUp Agent；ai_suggestion: manual；total_score: 72',
  created_at: '2026-05-29T00:00:00Z',
};

const invitationListPayload = {
  items: [
    {
      invitation_id: 'invite-1',
      team_id: 'team-1',
      invite_mode: 'email',
      email: 'reviewer2@example.com',
      team_role: 'reviewer',
      team_role_label: '审核员',
      status: 'pending',
      message: '邀请你加入 MarkUp 企业',
      created_by: 'admin-1',
      created_by_name: 'admin01',
      expire_at: '2026-05-30T00:00:00Z',
      responded_at: null,
      created_at: '2026-05-29T00:00:00Z',
    },
  ],
  pagination: { page: 1, page_size: 100, total: 1, total_pages: 1 },
};

const revokedInvitationPayload = {
  ...invitationListPayload.items[0],
  status: 'revoked',
  responded_at: '2026-05-29T01:00:00Z',
};

const taskPayload = {
  task_id: 'task-1',
  team_id: 'team-1',
  owner_id: 'admin-1',
  owner_name: '任务发布人',
  title: '草稿题目任务',
  description: '用于导入题目',
  rich_content: '',
  tags: ['回归'],
  status: 'draft',
  category: 'text',
  difficulty: 'easy',
  deadline: null,
  quota: 1,
  distribution: 'first_come_all',
  reward_rule: { mode: 'item', points_per_item: 1 },
  reviewer_ids: [],
  ai_config: { enabled: false },
  qualification_rules: {},
  required_certs: [],
  template_id: 'template-1',
  template_version_id: 'template-1:v1',
  dataset_id: 'dataset-1',
  column_mapping: { show_title: 'title' },
  assignment: { enabled: false },
  stats: { total: 1, claimed: 0, submitted: 0, approved: 0, rejected: 0 },
  created_at: '2026-05-29T00:00:00Z',
  updated_at: '2026-05-29T00:00:00Z',
};

const taskListForBatchPayload = [
  { ...taskPayload, task_id: 'task-published', title: '发布中任务', status: 'published', tags: ['交付'] },
  { ...taskPayload, task_id: 'task-paused', title: '暂停任务', status: 'paused', tags: ['暂停'] },
  { ...taskPayload, task_id: 'task-draft', title: '草稿任务', status: 'draft', tags: ['草稿'] },
];

const questionPayload = {
  question_id: 'question-1',
  team_id: 'team-1',
  task_id: 'task-1',
  dataset_id: 'dataset-1',
  row_index: 0,
  content: { show_title: '合同条款' },
  status: 'pending',
  assigned_to: null,
  created_at: '2026-05-29T00:00:00Z',
  updated_at: '2026-05-29T00:00:00Z',
};

function apiResponse(data: unknown) {
  return new Response(JSON.stringify({ code: 0, message: 'success', data, request_id: 'req', timestamp: '2026-05-25T00:00:00Z' }), { status: 200 });
}

function apiErrorResponse(message: string, detail: unknown, status = 422, code = 40002) {
  return new Response(JSON.stringify({ code, message, detail, request_id: 'req', timestamp: '2026-05-25T00:00:00Z' }), { status });
}

function blobResponse(content: string, type = 'text/csv') {
  return new Response(new Blob([content], { type }), { status: 200 });
}

function fetchUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function latestCalledUrl(pattern: string): string {
  const calls = vi.mocked(fetch).mock.calls.map(([input]) => fetchUrl(input));
  return [...calls].reverse().find((url) => url.includes(pattern)) ?? '';
}

function createDataTransfer() {
  const store = new Map<string, string>();
  return {
    setData: (type: string, value: string) => store.set(type, value),
    getData: (type: string) => store.get(type) ?? '',
    clearData: (type?: string) => {
      if (type) store.delete(type);
      else store.clear();
    },
    get types() {
      return Array.from(store.keys());
    },
    effectAllowed: 'move',
    dropEffect: 'move',
  };
}

describe('WorkspaceApp', () => {
  it('filters system and media-schema-backed fields out of Designer data source options', () => {
    const dataset = {
      ...datasetPayload,
      columns: [
        { name: 'title', data_type: 'text', samples: ['合同条款'], comment: '', use_in_mapping: true },
        { name: 'image_url', data_type: 'image', samples: ['https://cdn.example.com/img.png'], comment: '', use_in_mapping: true },
        { name: 'audio_url', data_type: 'audio', samples: ['https://cdn.example.com/audio.mp3'], comment: '', use_in_mapping: true },
        { name: 'video_url', data_type: 'video', samples: ['https://cdn.example.com/video.mp4'], comment: '', use_in_mapping: true },
        { name: 'media', data_type: 'media_list', samples: [], comment: '', use_in_mapping: true },
        { name: 'derived_context', data_type: 'json', samples: [], comment: '', use_in_mapping: true },
      ],
      media_schema: [
        { type: 'image', role: 'primary', field: 'image_url', source: 'uploaded_file' },
        { type: 'audio', role: 'context', field: 'audio_url', source: 'uploaded_file' },
        { type: 'video', role: 'context', field: 'video_url', source: 'uploaded_file' },
      ],
    } as DatasetPayload;

    const groups = buildDataSourceOptions(dataset);
    const labels = groups.flatMap((group) => group.options.map((option) => String(option.label)));
    expect(labels).toContain('title · text');
    expect(labels).toContain('图片 · primary · image_url');
    expect(labels).toContain('音频 · context · audio_url');
    expect(labels).toContain('视频 · context · video_url');
    expect(labels).not.toContain('image_url · image');
    expect(labels).not.toContain('audio_url · audio');
    expect(labels).not.toContain('video_url · video');
    expect(labels).not.toContain('media · media_list');
    expect(labels).not.toContain('derived_context · json');

    const maskLabels = imageMaskSourceOptions(groups).flatMap((group) => group.options.map((option) => String(option.label)));
    expect(maskLabels).toContain('图片 · primary · image_url');
    expect(maskLabels).not.toContain('image_url · image');
    expect(maskLabels).not.toContain('title · text');
    expect(maskLabels).not.toContain('audio_url · audio');
    expect(maskLabels).not.toContain('音频 · context · audio_url');
    expect(maskLabels).not.toContain('video_url · video');
    expect(maskLabels).not.toContain('视频 · context · video_url');
  });

  it('removes disabled fields and their media schema entries from data source options', () => {
    const dataset = {
      ...datasetPayload,
      columns: [
        { name: 'title', data_type: 'text', samples: ['合同条款'], comment: '', use_in_mapping: true },
        { name: 'internal_note', data_type: 'text', samples: ['隐藏说明'], comment: '', use_in_mapping: false },
        { name: 'image_url', data_type: 'image', samples: ['https://cdn.example.com/img.png'], comment: '', use_in_mapping: false },
      ],
      media_schema: [
        { type: 'image', role: 'primary', field: 'image_url', source: 'uploaded_file' },
      ],
    } as DatasetPayload;

    const groups = buildDataSourceOptions(dataset);
    const labels = groups.flatMap((group) => group.options.map((option) => String(option.label)));
    expect(labels).toContain('title · text');
    expect(labels).not.toContain('internal_note · text');
    expect(labels).not.toContain('image_url · image');
    expect(labels).not.toContain('图片 · primary · image_url');
  });

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:operation-logs'), configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders personal labeler dashboard by default and keeps labeling workbench reachable', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: labelerSession.accessToken,
      refresh_token: labelerSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: labelerSession.user,
    });
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/profile/dashboard') return apiResponse(personalLabelerDashboardPayload);
      if (url.pathname === '/api/v1/labels/my-tasks') return apiResponse({
        items: [{
          task: labelingWorkbenchPayload.task,
          progress: labelingWorkbenchPayload.progress,
          latest_question_id: 'question-1',
          last_updated_at: '2026-05-29T00:01:00Z',
        }],
        summary: { total_tasks: 1, active_tasks: 1, submitted_questions: 0, pending_questions: 2, rejected_questions: 0 },
      });
      if (url.pathname === '/api/v1/labels/workbench/task-labeling') return apiResponse(labelingWorkbenchPayload);
      if (url.pathname === '/api/v1/labels/questions/question-1/draft' && init?.method === 'PUT') {
        return apiResponse({ ...labelingWorkbenchPayload.current_question.submission, draft: { intent: 'risk' }, answers: { intent: 'risk' }, updated_at: '2026-05-29T00:02:00Z' });
      }
      if (url.pathname === '/api/v1/labels/questions/question-2') return apiResponse(labelingQuestionTwoPayload);
      if (url.pathname === '/api/v1/labels/questions/question-1/submit' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body || '{}'));
        if (!body.answers?.reason) {
          return apiErrorResponse(
            '答案校验未通过',
            {
              field_errors: [{ component_id: 'reason', field: 'reason', label: '判断理由', rule: 'required', message: '判断理由 为必填项' }],
              valid: false,
              warnings: [],
              summary: { answer_field_count: 2, error_count: 1, warning_count: 0 },
            },
            422,
            42201,
          );
        }
        return apiResponse({
          ...labelingWorkbenchPayload.current_question.submission,
          answers: body.answers,
          draft: body.answers,
          status: 'submitted',
          validation_result: { valid: true, field_errors: [], warnings: [], summary: { answer_field_count: 2, error_count: 0, warning_count: 0 } },
          submitted_at: '2026-05-29T00:03:00Z',
          updated_at: '2026-05-29T00:03:00Z',
        });
      }
      if (url.pathname === '/api/v1/labels/questions/question-2/submit' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body || '{}'));
        return apiResponse({
          ...labelingQuestionTwoPayload.submission,
          answers: body.answers,
          draft: body.answers,
          status: 'submitted',
          validation_result: { valid: true, field_errors: [], warnings: [], summary: { answer_field_count: 2, error_count: 0, warning_count: 0 } },
          submitted_at: '2026-05-29T00:04:00Z',
          updated_at: '2026-05-29T00:04:00Z',
        });
      }
      return apiResponse({});
    });

    render(<WorkspaceApp initialSession={labelerSession} />);

    expect(await screen.findByRole('heading', { name: '个人标注工作台' })).toBeInTheDocument();
    expect(await screen.findByText('成长与收益')).toBeInTheDocument();
    expect(screen.getByText('推荐任务：新闻摘要标注')).toBeInTheDocument();
    expect(screen.getByText('可用积分')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/v1/profile/dashboard', expect.any(Object));

    await user.click(screen.getByRole('button', { name: '我的任务' }));
    expect(await screen.findByRole('heading', { name: '合同条款标注' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /开始批注|继续批注/ }));
    expect(screen.getByRole('heading', { name: '标注页面' })).toBeInTheDocument();
    expect(screen.getByText('合同条款截图与文本混合标注')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: '标注答案' }));
    expect(screen.getByRole('combobox', { name: '条款类型' })).toBeInTheDocument();
    expect(screen.getAllByText(/已保存/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('combobox', { name: '条款类型' }));
    await user.click(await screen.findByText('风险条款', { selector: '.ant-select-item-option-content' }));
    await user.click(screen.getByRole('button', { name: '保存草稿' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/labels/questions/question-1/draft'), expect.objectContaining({ method: 'PUT' })));

    await user.click(screen.getByRole('button', { name: '提交标注' }));
    expect(await screen.findByText('判断理由 为必填项')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/判断理由/), '存在风险描述');
    await user.click(screen.getByRole('button', { name: '提交标注' }));
    expect(await screen.findByText('标注已提交，已自动进入下一题。')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: '阅读材料' }));
    expect(await screen.findByText('第二条合同条款')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: '标注答案' }));
    await user.click(screen.getByRole('combobox', { name: '条款类型' }));
    await user.click(await screen.findByText('风险条款', { selector: '.ant-select-item-option-content' }));
    await user.type(screen.getByLabelText(/判断理由/), '第二题也存在风险');
    await user.click(screen.getByRole('button', { name: '提交标注' }));
    expect(await screen.findByText('全部题目已提交，请点击完成返回我的任务。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '完成' })).toBeInTheDocument();
  });

  it('renders team labeler dashboard with company project scope', async () => {
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') return apiResponse({ default_team_id: 'team-1', teams: [teamDetail], notifications: [] });
      if (url.pathname === '/api/v1/teams/team-1/labeler-dashboard') {
        expect(new Headers(init?.headers).get('X-Team-ID')).toBe('team-1');
        return apiResponse(teamLabelerDashboardPayload);
      }
      return apiResponse({});
    });

    render(<WorkspaceApp initialSession={teamLabelerSession} page="labeler-dashboard" />);

    expect(await screen.findByText('企业项目工作台')).toBeInTheDocument();
    expect(screen.getByText(/Demo Team/)).toBeInTheDocument();
    expect(screen.getByText('我的公司项目')).toBeInTheDocument();
    expect(screen.getByText('企业通知：本周交付安排')).toBeInTheDocument();
    expect(screen.getAllByText('继续公司项目').length).toBeGreaterThan(0);
    expect(screen.queryByText('成长与收益')).not.toBeInTheDocument();
    expect(screen.queryByText('推荐任务：新闻摘要标注')).not.toBeInTheDocument();
    expect(screen.queryByText('去任务广场')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/v1/teams/admin/overview', expect.any(Object));
    const labelerDashboardRequest = vi.mocked(fetch).mock.calls.find(([input]) => input === '/api/v1/teams/team-1/labeler-dashboard');
    expect(new Headers(labelerDashboardRequest?.[1]?.headers).get('X-Team-ID')).toBe('team-1');
  });

  it('refreshes my tasks after a marketplace claim is routed into the workspace', async () => {
    let myTasksCalls = 0;
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/labels/my-tasks') {
        myTasksCalls += 1;
        return apiResponse(myTasksCalls === 1
          ? {
            items: [],
            summary: { total_tasks: 0, active_tasks: 0, submitted_questions: 0, pending_questions: 0, rejected_questions: 0 },
          }
          : {
            items: [{
              task: labelingWorkbenchPayload.task,
              progress: labelingWorkbenchPayload.progress,
              latest_question_id: 'question-1',
              last_updated_at: '2026-05-29T00:01:00Z',
            }],
            summary: { total_tasks: 1, active_tasks: 1, submitted_questions: 0, pending_questions: 2, rejected_questions: 0 },
          });
      }
      return apiResponse({});
    });

    render(<WorkspaceApp initialSession={labelerSession} page="labeler-tasks" claimedLabelingTaskId="task-labeling" />);

    expect(await screen.findByRole('heading', { name: '合同条款标注' })).toBeInTheDocument();
    expect(screen.queryByText('暂无任务')).not.toBeInTheDocument();
  });

  it('auto-loads labeling workbench from a provided task id', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/labels/workbench/task-labeling') return apiResponse(labelingWorkbenchPayload);
      return apiResponse({});
    });

    render(<WorkspaceApp initialSession={labelerSession} page="labeling" initialLabelingTaskId="task-labeling" />);

    expect(await screen.findByText('合同条款截图与文本混合标注')).toBeInTheDocument();
    expect(screen.getByLabelText('已领取任务入口码')).toHaveValue('task-labeling');
    expect(window.localStorage.getItem('markup:lastLabelingTaskId')).toBe('task-labeling');
  });

  it('runs labeling LLM assist from the template component and applies generated answers', async () => {
    const user = userEvent.setup();
    const llmWorkbench = {
      ...labelingWorkbenchPayload,
      template: {
        ...labelingWorkbenchPayload.template,
        schema: {
          ...labelingWorkbenchPayload.template.schema,
          tabs: labelingWorkbenchPayload.template.schema.tabs.map((tab) => tab.id === 'answer'
            ? {
              ...tab,
              components: [
                ...tab.components,
                {
                  id: 'ai_helper',
                  type: 'LLMComponent',
                  field: 'ai_helper',
                  label: 'AI 标注建议',
                  required: false,
                  config: { button_text: '生成建议', prompt_hint: '结合原文判断条款类型。', provider_id: 'provider-1' },
                  options: [],
                  version: '1.0',
                },
              ],
            }
            : tab),
        },
      },
      progress: {
        ...labelingWorkbenchPayload.progress,
        ai_assist_percent: 100,
        ai_assist_limit: 1,
        ai_assist_used: 0,
        ai_assist_remaining: 1,
      },
    };
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/labels/workbench/task-labeling') return apiResponse(llmWorkbench);
      if (url.pathname === '/api/v1/labels/questions/question-1/llm-assist' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body || '{}'));
        expect(body.prompt).toContain('结合原文判断条款类型。');
        expect(body.component_id).toBe('ai_helper');
        return apiResponse({
          question_id: 'question-1',
          answers: { intent: 'risk', reason: '违约金过高，需复核。' },
          explanation: 'AI 判断该条款存在风险。',
          field_explanations: { intent: '出现高额违约金。', reason: '金额比例需要人工确认。' },
          annotated_images: [],
          assist_usage: { percent: 100, limit: 1, used: 1, remaining: 0 },
          model: 'model-a',
          request_id: 'req-1',
          latency_ms: 120,
        });
      }
      if (url.pathname === '/api/v1/labels/questions/question-1/draft' && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body || '{}'));
        expect(body.answers).toMatchObject({ intent: 'risk', reason: '违约金过高，需复核。' });
        return apiResponse({ ...llmWorkbench.current_question.submission, answers: body.answers, draft: body.answers, updated_at: '2026-05-29T00:08:00Z' });
      }
      return apiResponse({});
    });

    render(<WorkspaceApp initialSession={labelerSession} page="labeling" initialLabelingTaskId="task-labeling" />);

    await user.click(await screen.findByRole('tab', { name: '标注答案' }));
    expect(await screen.findByText('AI 标注建议')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /生成建议/ }));
    expect(await screen.findByText('AI 判断该条款存在风险。')).toBeInTheDocument();
    const resultPanel = document.querySelector('.labeling-ai-answer-descriptions') as HTMLElement;
    expect(within(resultPanel).getByText('条款类型')).toBeInTheDocument();
    expect(within(resultPanel).getByText('intent')).toBeInTheDocument();
    expect(within(resultPanel).getByText('risk')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /应用全部/ }));
    const saveDraftButton = screen.getByRole('button', { name: '保存草稿' });
    await waitFor(() => expect(saveDraftButton).toBeEnabled());
    await user.click(saveDraftButton);
    expect(vi.mocked(fetch).mock.calls.some(([input]) => fetchUrl(input).endsWith('/api/v1/labels/questions/question-1/llm-assist'))).toBe(true);
  });

  it('reminds the labeler when a template LLM component has no provider selected', async () => {
    const user = userEvent.setup();
    const llmWorkbench = {
      ...labelingWorkbenchPayload,
      template: {
        ...labelingWorkbenchPayload.template,
        schema: {
          ...labelingWorkbenchPayload.template.schema,
          tabs: labelingWorkbenchPayload.template.schema.tabs.map((tab) => tab.id === 'answer'
            ? {
              ...tab,
              components: [
                ...tab.components,
                { id: 'ai_helper', type: 'LLMComponent', field: 'ai_helper', label: 'AI 标注建议', required: false, config: { button_text: '生成建议' }, options: [], version: '1.0' },
              ],
            }
            : tab),
        },
      },
      progress: {
        ...labelingWorkbenchPayload.progress,
        ai_assist_percent: 100,
        ai_assist_limit: 1,
        ai_assist_used: 0,
        ai_assist_remaining: 1,
      },
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/labels/workbench/task-labeling') return apiResponse(llmWorkbench);
      return apiResponse({});
    });

    render(<WorkspaceApp initialSession={labelerSession} page="labeling" initialLabelingTaskId="task-labeling" />);

    await user.click(await screen.findByRole('tab', { name: '标注答案' }));
    await user.click(await screen.findByRole('button', { name: /生成建议/ }));
    expect(screen.getAllByText(/AI Provider 未选择/).length).toBeGreaterThan(0);
    expect(vi.mocked(fetch).mock.calls.some(([input]) => fetchUrl(input).endsWith('/api/v1/labels/questions/question-1/llm-assist'))).toBe(false);
  });

  it('keeps labeling LLM assist clickable when no quota is available but does not call the API', async () => {
    const user = userEvent.setup();
    const llmWorkbench = {
      ...labelingWorkbenchPayload,
      template: {
        ...labelingWorkbenchPayload.template,
        schema: {
          ...labelingWorkbenchPayload.template.schema,
          tabs: labelingWorkbenchPayload.template.schema.tabs.map((tab) => tab.id === 'answer'
            ? {
              ...tab,
              components: [
                ...tab.components,
                { id: 'ai_helper', type: 'LLMComponent', field: 'ai_helper', label: 'AI 标注建议', required: false, config: { button_text: '生成建议' }, options: [], version: '1.0' },
              ],
            }
            : tab),
        },
      },
      progress: {
        ...labelingWorkbenchPayload.progress,
        ai_assist_percent: 100,
        ai_assist_limit: 0,
        ai_assist_used: 0,
        ai_assist_remaining: 0,
      },
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/labels/workbench/task-labeling') return apiResponse(llmWorkbench);
      return apiResponse({});
    });

    render(<WorkspaceApp initialSession={labelerSession} page="labeling" initialLabelingTaskId="task-labeling" />);

    await user.click(await screen.findByRole('tab', { name: '标注答案' }));
    expect(await screen.findByText('AI 标注建议')).toBeInTheDocument();
    const generateButton = screen.getByRole('button', { name: /生成建议/ });
    expect(generateButton).toBeEnabled();
    await user.click(generateButton);
    expect(screen.getAllByText(/本任务当前没有可用的 AI 辅助额度/).length).toBeGreaterThan(0);
    expect(vi.mocked(fetch).mock.calls.some(([input]) => fetchUrl(input).endsWith('/api/v1/labels/questions/question-1/llm-assist'))).toBe(false);
  });

  it('uses the shared template renderer linkage rules in the labeling workbench', async () => {
    const user = userEvent.setup();
    const linkedWorkbench = {
      ...labelingWorkbenchPayload,
      template: {
        ...labelingWorkbenchPayload.template,
        schema: {
          ...labelingWorkbenchPayload.template.schema,
          linkage_rules: [{ source_field: 'intent', operator: 'equals', value: 'risk', target_component_id: 'reason', action: 'show' }],
        },
      },
      current_question: {
        ...labelingWorkbenchPayload.current_question,
        submission: {
          ...labelingWorkbenchPayload.current_question.submission,
          answers: { intent: 'payment' },
          draft: { intent: 'payment' },
        },
      },
    };
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/labels/workbench/task-labeling') return apiResponse(linkedWorkbench);
      if (url.pathname === '/api/v1/labels/questions/question-2') return apiResponse(labelingQuestionTwoPayload);
      if (url.pathname === '/api/v1/labels/questions/question-1/submit' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body || '{}'));
        if (body.answers?.intent === 'payment') {
          return apiErrorResponse(
            '答案校验未通过',
            {
              field_errors: [{ component_id: 'reason', field: 'reason', label: '判断理由', rule: 'required', message: '判断理由 为必填项' }],
              valid: false,
              warnings: [],
              summary: { answer_field_count: 2, error_count: 1, warning_count: 0 },
            },
            422,
            42201,
          );
        }
        return apiResponse({
          ...linkedWorkbench.current_question.submission,
          answers: body.answers,
          draft: body.answers,
          status: 'submitted',
          submitted_at: '2026-05-29T00:03:00Z',
          updated_at: '2026-05-29T00:03:00Z',
        });
      }
      return apiResponse({});
    });

    render(<WorkspaceApp initialSession={labelerSession} page="labeling" initialLabelingTaskId="task-labeling" />);

    expect(await screen.findByText('合同条款截图与文本混合标注')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: '标注答案' }));
    expect(screen.getByRole('combobox', { name: '条款类型' })).toBeInTheDocument();
    expect(screen.queryByText('判断理由')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '提交标注' }));
    expect(await screen.findByText('答案校验未通过，请根据字段提示修改。')).toBeInTheDocument();
    expect(screen.queryByText('判断理由 为必填项')).not.toBeInTheDocument();

    expect(vi.mocked(fetch).mock.calls.some(([input]) => fetchUrl(input).endsWith('/api/v1/labels/questions/question-1/submit'))).toBe(true);
  });

  it('shows rejection detail and lets labeler resubmit', async () => {
    const user = userEvent.setup();
    const rejectedWorkbench = {
      ...labelingWorkbenchPayload,
      questions: [{ ...labelingWorkbenchPayload.questions[0], status: 'rejected', submission_status: 'rejected' }],
      current_question: {
        ...labelingWorkbenchPayload.current_question,
        status: 'rejected',
        submission: {
          ...labelingWorkbenchPayload.current_question.submission,
          status: 'rejected',
          current_round: 2,
          answers: { intent: 'payment', reason: '原理由' },
          draft: { intent: 'payment', reason: '原理由' },
        },
      },
      progress: { ...labelingWorkbenchPayload.progress, rejected: 1 },
    };
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/labels/workbench/task-labeling') return apiResponse(rejectedWorkbench);
      if (url.pathname === '/api/v1/labels/questions/question-1/rejection') {
        return apiResponse({
          question_id: 'question-1',
          submission_id: 'submission-1',
          task_id: 'task-labeling',
          status: 'rejected',
          current_round: 2,
          latest: { review_id: 'review-1', round: 1, stage: 'manual_review', decision: 'rejected', comment: '证据不足，请补充理由', reviewer_id: 'reviewer-1', created_at: '2026-05-29T00:05:00Z', changes: {} },
          history: [],
          ai_review: null,
        });
      }
      if (url.pathname === '/api/v1/labels/questions/question-1/submit' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body || '{}'));
        return apiResponse({
          ...rejectedWorkbench.current_question.submission,
          answers: body.answers,
          draft: body.answers,
          status: 'submitted',
          submitted_at: '2026-05-29T00:06:00Z',
          updated_at: '2026-05-29T00:06:00Z',
        });
      }
      return apiResponse({});
    });

    render(<WorkspaceApp initialSession={labelerSession} page="labeling" initialLabelingTaskId="task-labeling" />);

    expect(await screen.findByText('上一轮审核意见')).toBeInTheDocument();
    expect(screen.getByText('证据不足，请补充理由')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重新提交' }));
    expect(await screen.findByText('标注已提交，等待后续 AI 预审或人工审核。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '已提交' })).toBeDisabled();
    expect(fetch).toHaveBeenCalledWith('/api/v1/labels/questions/question-1/submit', expect.objectContaining({ method: 'POST' }));
  });

  it('dashboard loads organization overview and hides labeling entry from enterprise actions', async () => {
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') return apiResponse({ default_team_id: 'team-1', teams: [teamDetail], notifications: [] });
      if (url.pathname === '/api/v1/teams/team-1/dashboard') {
        expect((init?.headers as Record<string, string>)['X-Team-ID']).toBe('team-1');
        return apiResponse(teamDashboardPayload);
      }
      return apiResponse({});
    });

    render(<WorkspaceApp initialSession={adminSession} />);

    expect(await screen.findByRole('heading', { name: '企业工作台' })).toBeInTheDocument();
    expect(await screen.findByText(/Demo Team/)).toBeInTheDocument();
    expect(screen.getByText('待人工审核')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '生产漏斗' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '任务状态分布' })).toBeInTheDocument();
    expect(screen.getByText('资源额度')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /成员额度/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /活跃任务额度/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /存储额度/ })).toBeInTheDocument();
    expect(screen.getByText('企业治理')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /进入任务管理/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: '查看标注页水印' })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/v1/teams/admin/overview', expect.any(Object));
    expect(fetch).toHaveBeenCalledWith('/api/v1/teams/team-1/dashboard', expect.objectContaining({ headers: expect.objectContaining({ 'X-Team-ID': 'team-1' }) }));
  });

  it('dashboard keeps reviewer focused on manual review shortcuts', async () => {
    const reviewerDashboard = {
      ...teamDashboardPayload,
      viewer_role: 'reviewer',
      shortcuts: [
        { key: 'manual-review', label: '进入人工审核', target_page: 'manual-review', kind: 'primary' },
        { key: 'announcements', label: '查看公告通知', target_page: 'announcements', kind: 'default' },
      ],
      production: {
        ...teamDashboardPayload.production,
        tasks: { total: 1, draft: 0, pending_review: 0, published: 1, paused: 0, finished: 0 },
      },
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') return apiResponse({ default_team_id: 'team-1', teams: [teamDetail], notifications: [] });
      if (url.pathname === '/api/v1/teams/team-1/dashboard') return apiResponse(reviewerDashboard);
      return apiResponse({});
    });

    render(<WorkspaceApp initialSession={reviewerSession} />);

    expect((await screen.findAllByRole('button', { name: /进入人工审核/ })).length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: '审核结果分布' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'AI / 导出状态' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /进入任务管理/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /查看公告通知/ })).not.toBeInTheDocument();
    expect(screen.queryByText('最近活跃任务')).not.toBeInTheDocument();
    expect(screen.getByText('审核焦点')).toBeInTheDocument();
  });

  it('dashboard prioritizes AI and resources for agent role', async () => {
    const agentDashboard = {
      ...teamDashboardPayload,
      viewer_role: 'agent',
      ai: {
        ...teamDashboardPayload.ai,
        jobs: { total: 4, pending: 1, processing: 1, completed: 1, failed: 1, by_status: { pending: 1, processing: 1, completed: 1, failed: 1 } },
        recent_jobs: [{ job_id: 'job-1', task_id: 'task-1', submission_id: 'submission-1', status: 'failed', error: 'provider timeout', updated_at: '2026-05-26T00:30:00Z' }],
      },
      shortcuts: [
        { key: 'resource-config', label: '查看资源配置', target_page: 'resource-config', kind: 'primary' },
        { key: 'ai-review', label: 'AI 预审任务', target_page: 'ai-review', kind: 'default' },
      ],
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') return apiResponse({ default_team_id: 'team-1', teams: [teamDetail], notifications: [] });
      if (url.pathname === '/api/v1/teams/team-1/dashboard') return apiResponse(agentDashboard);
      return apiResponse({});
    });

    render(<WorkspaceApp initialSession={adminSession} />);

    expect(await screen.findByRole('img', { name: 'AI / 导出状态' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '企业工作台' })).toBeInTheDocument();
    expect(screen.getByText('资源额度')).toBeInTheDocument();
    expect(screen.getByText('最近 AI 预审')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /查看资源配置/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /进入任务管理/ })).not.toBeInTheDocument();
  });

  it('dashboard renders chart empty states for zero organization data', async () => {
    const emptyDashboard = {
      ...teamDashboardPayload,
      summary_cards: teamDashboardPayload.summary_cards.map((item) => ({ ...item, value: 0, hint: '暂无数据' })),
      todo_items: [],
      production: {
        tasks: { total: 0, draft: 0, pending_review: 0, published: 0, paused: 0, finished: 0 },
        questions: { total: 0, claimed: 0, submitted: 0, approved: 0, rejected: 0 },
        recent_tasks: [],
      },
      review: { pending: 0, completed: 0, approved: 0, rejected: 0, total_visible: 0, task_count: 0, by_status: {} },
      ai: {
        ...teamDashboardPayload.ai,
        jobs: { total: 0, pending: 0, processing: 0, completed: 0, failed: 0, by_status: {} },
        recent_jobs: [],
      },
      exports: { total: 0, pending: 0, processing: 0, completed: 0, failed: 0, cancelled: 0, recent_exports: [] },
      governance: {
        ...teamDashboardPayload.governance,
        notifications: [],
        audit_logs: [],
      },
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') return apiResponse({ default_team_id: 'team-1', teams: [teamDetail], notifications: [] });
      if (url.pathname === '/api/v1/teams/team-1/dashboard') return apiResponse(emptyDashboard);
      return apiResponse({});
    });

    render(<WorkspaceApp initialSession={adminSession} />);

    expect(await screen.findByText('生产漏斗暂无数据')).toBeInTheDocument();
    expect(screen.queryByText('当前没有阻塞待办')).not.toBeInTheDocument();
    expect(screen.getByText('任务状态分布暂无数据')).toBeInTheDocument();
    expect(screen.getByText('暂无任务')).toBeInTheDocument();
    expect(screen.getByText('暂无导出记录')).toBeInTheDocument();
  });

  it('dashboard shows an alert and retry action when loading fails', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') return apiResponse({ default_team_id: 'team-1', teams: [teamDetail], notifications: [] });
      if (url.pathname === '/api/v1/teams/team-1/dashboard') return apiErrorResponse('看板加载失败', null, 500, 50001);
      return apiResponse({});
    });

    render(<WorkspaceApp initialSession={adminSession} />);

    expect(await screen.findByText('看板加载失败')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重\s*试/ })).toBeInTheDocument();
  });

  it('does not emit unrelated dynamic breadcrumb tails for pages without detail state', async () => {
    const onBreadcrumbTailChange = vi.fn();
    render(
      <WorkspaceApp
        initialSession={labelerSession}
        page="account"
        onBreadcrumbTailChange={onBreadcrumbTailChange}
      />,
    );

    expect(screen.getByRole('heading', { name: '欢迎加入 MarkUp 数据平台!' })).toBeInTheDocument();
    expect(onBreadcrumbTailChange).toHaveBeenCalledWith(null);
  });

  it('loads task-level ai review overviews and opens submission details', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') return apiResponse({ default_team_id: 'team-1', teams: [teamDetail], notifications: [] });
      if (url.pathname === '/api/v1/ai-reviews/task-overviews') {
        return apiResponse({
          items: [{
            task_id: 'task-1',
            team_id: 'team-1',
            title: '风控文本审核任务',
            description: '按任务查看 AI 预审覆盖率',
            status: 'published',
            owner_id: 'owner-1',
            ai_enabled: true,
            provider_id: 'provider-1',
            provider_name: '平台共享路由',
            model: 'mock-model',
            total_questions: 2,
            submission_total: 2,
            submitted_count: 2,
            job_total: 1,
            coverage_rate: 0.5,
            status_counts: { pending: 1, processing: 0, completed: 0, failed: 0 },
            suggestion_counts: { manual: 1 },
            pending_count: 1,
            processing_count: 0,
            completed_count: 0,
            failed_count: 0,
            manual_count: 1,
            last_activity_at: '2026-05-29T00:00:00Z',
            created_at: '2026-05-29T00:00:00Z',
            updated_at: '2026-05-29T00:00:00Z',
          }],
          summary: {
            task_total: 1,
            ai_enabled: 1,
            job_total: 1,
            pending: 1,
            processing: 0,
            completed: 0,
            failed: 0,
            manual: 1,
            status_counts: { pending: 1 },
            suggestion_counts: { manual: 1 },
          },
          pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 },
        });
      }
      if (url.pathname === '/api/v1/ai-reviews/task-overviews/task-1/submissions') {
        return apiResponse({
          task: {
            task_id: 'task-1',
            team_id: 'team-1',
            title: '风控文本审核任务',
            description: '按任务查看 AI 预审覆盖率',
            status: 'published',
            owner_id: 'owner-1',
            ai_enabled: true,
            total_questions: 2,
            submission_total: 2,
            submitted_count: 2,
            job_total: 1,
            coverage_rate: 0.5,
            status_counts: { pending: 1, processing: 0, completed: 0, failed: 0 },
            suggestion_counts: { manual: 1 },
            pending_count: 1,
            processing_count: 0,
            completed_count: 0,
            failed_count: 0,
            manual_count: 1,
            last_activity_at: '2026-05-29T00:00:00Z',
          },
          items: [
            {
              submission_id: 'submission-1',
              task_id: 'task-1',
              question_id: 'question-1',
              labeler_id: 'labeler-1',
              submission_status: 'submitted',
              question_status: 'submitted',
              ai_status: 'pending',
              ai_suggestion: 'manual',
              ai_score: 72,
              ai_reason: '需要人工复核',
              error: null,
              retry_count: 0,
              ai_review: {
                job_id: 'job-1',
                team_id: 'team-1',
                task_id: 'task-1',
                submission_id: 'submission-1',
                question_id: 'question-1',
                labeler_id: 'labeler-1',
                prompt: '检查答案质量',
                dimensions: [],
                status: 'pending',
                retry_count: 0,
                result: { ai_suggestion: 'manual', total_score: 72, reason: '需要人工复核' },
                error: null,
                idempotency_key: 'submission:submission-1:ai-review',
                created_at: '2026-05-29T00:00:00Z',
                updated_at: '2026-05-29T00:00:00Z',
              },
              ai_job: {
                job_id: 'job-1',
                team_id: 'team-1',
                task_id: 'task-1',
                submission_id: 'submission-1',
                question_id: 'question-1',
                labeler_id: 'labeler-1',
                prompt: '检查答案质量',
                dimensions: [],
                status: 'pending',
                retry_count: 0,
                result: { ai_suggestion: 'manual', total_score: 72, reason: '需要人工复核' },
                error: null,
                idempotency_key: 'submission:submission-1:ai-review',
                created_at: '2026-05-29T00:00:00Z',
                updated_at: '2026-05-29T00:00:00Z',
              },
              updated_at: '2026-05-29T00:00:00Z',
            },
            {
              submission_id: 'submission-2',
              task_id: 'task-1',
              question_id: 'question-2',
              labeler_id: 'labeler-2',
              submission_status: 'submitted',
              question_status: 'submitted',
              ai_job: null,
              ai_status: 'not_created',
              ai_suggestion: null,
              ai_score: null,
              ai_reason: null,
              error: null,
              retry_count: 0,
              updated_at: '2026-05-29T00:02:00Z',
            },
          ],
          summary: { submission_total: 2, job_total: 1, status_counts: { pending: 1 }, suggestion_counts: { manual: 1 } },
          pagination: { page: 1, page_size: 20, total: 2, total_pages: 1 },
        });
      }
      if (url.pathname === '/api/v1/ai-reviews/tasks/job-1') {
        return apiResponse({
          job_id: 'job-1',
          team_id: 'team-1',
          task_id: 'task-1',
          submission_id: 'submission-1',
          question_id: 'question-1',
          labeler_id: 'labeler-1',
          prompt: '检查答案质量',
          dimensions: [],
          status: 'pending',
          retry_count: 0,
          result: { ai_suggestion: 'manual', total_score: 72, reason: '需要人工复核' },
          error: null,
          idempotency_key: 'submission:submission-1:ai-review',
          created_at: '2026-05-29T00:00:00Z',
          updated_at: '2026-05-29T00:00:00Z',
        });
      }
      if (url.pathname === '/api/v1/ai-reviews/submissions/submission-2/trigger' && init?.method === 'POST') {
        return apiResponse({
          job_id: 'job-2',
          team_id: 'team-1',
          task_id: 'task-1',
          submission_id: 'submission-2',
          question_id: 'question-2',
          labeler_id: 'labeler-1',
          prompt: '检查答案质量',
          dimensions: [],
          status: 'pending',
          retry_count: 0,
          result: {},
          error: null,
          idempotency_key: 'submission:submission-2:ai-review',
          created_at: '2026-05-29T00:01:00Z',
          updated_at: '2026-05-29T00:01:00Z',
        });
      }
      return apiResponse({});
    });

    render(<WorkspaceHarness initialPage="ai-review" />);

    expect(await screen.findByRole('heading', { name: 'AI预审' })).toBeInTheDocument();
    expect(await screen.findByText('风控文本审核任务')).toBeInTheDocument();
    const overviewTableBody = document.querySelector('.ai-review-table .ant-table-body') as HTMLElement | null;
    expect(overviewTableBody?.getAttribute('style') || '').not.toContain('1px');
    await user.click(screen.getByText('卡片'));
    expect(screen.getByText('按任务查看 AI 预审覆盖率')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /查看预审明细/ })[0]);
    expect(await screen.findByRole('heading', { name: '风控文本审核任务' })).toBeInTheDocument();
    expect(await screen.findByText('第 1 条提交')).toBeInTheDocument();
    expect(screen.getByText('未入队')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /结果/ }));
    expect(await screen.findByText('结构化结果')).toBeInTheDocument();
    expect(screen.getByText('预审摘要')).toBeInTheDocument();
    expect(screen.getByText(/total_score/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Close/ }));
    const triggerButtons = screen.getAllByRole('button', { name: /触发/ });
    await user.click(triggerButtons[triggerButtons.length - 1]);
    expect(fetch).toHaveBeenCalledWith('/api/v1/ai-reviews/submissions/submission-2/trigger', expect.objectContaining({ method: 'POST' }));
  });

  it('batch triggers only actionable ai review submissions and retries failed jobs', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') return apiResponse({ default_team_id: 'team-1', teams: [teamDetail], notifications: [] });
      if (url.pathname === '/api/v1/ai-reviews/task-overviews/task-1/submissions') {
        return apiResponse({
          task: {
            task_id: 'task-1',
            team_id: 'team-1',
            title: '风控文本审核任务',
            description: '按任务查看 AI 预审覆盖率',
            status: 'published',
            owner_id: 'owner-1',
            ai_enabled: true,
            total_questions: 3,
            submission_total: 3,
            submitted_count: 3,
            job_total: 2,
            coverage_rate: 0.67,
            status_counts: { completed: 1, failed: 1 },
            suggestion_counts: { pass: 1 },
            pending_count: 0,
            processing_count: 0,
            completed_count: 1,
            failed_count: 1,
            manual_count: 0,
            last_activity_at: '2026-05-29T00:00:00Z',
          },
          items: [
            {
              submission_id: 'submission-new',
              task_id: 'task-1',
              question_id: 'question-new',
              labeler_id: 'labeler-1',
              submission_status: 'submitted',
              question_status: 'submitted',
              ai_job: null,
              ai_status: 'not_created',
              ai_suggestion: null,
              ai_score: null,
              ai_reason: null,
              error: null,
              retry_count: 0,
              updated_at: '2026-05-29T00:02:00Z',
            },
            {
              submission_id: 'submission-failed',
              task_id: 'task-1',
              question_id: 'question-failed',
              labeler_id: 'labeler-2',
              submission_status: 'submitted',
              question_status: 'submitted',
              ai_status: 'failed',
              ai_suggestion: null,
              ai_score: null,
              ai_reason: null,
              error: 'Provider 400',
              retry_count: 1,
              ai_job: {
                job_id: 'job-failed',
                team_id: 'team-1',
                task_id: 'task-1',
                submission_id: 'submission-failed',
                question_id: 'question-failed',
                labeler_id: 'labeler-2',
                prompt: '检查答案质量',
                dimensions: [],
                status: 'failed',
                retry_count: 1,
                result: {},
                error: 'Provider 400',
                idempotency_key: 'submission:submission-failed:ai-review',
                created_at: '2026-05-29T00:00:00Z',
                updated_at: '2026-05-29T00:01:00Z',
              },
              updated_at: '2026-05-29T00:01:00Z',
            },
            {
              submission_id: 'submission-completed',
              task_id: 'task-1',
              question_id: 'question-completed',
              labeler_id: 'labeler-3',
              submission_status: 'submitted',
              question_status: 'submitted',
              ai_status: 'completed',
              ai_suggestion: 'pass',
              ai_score: 95,
              ai_reason: '质量通过',
              error: null,
              retry_count: 0,
              ai_job: {
                job_id: 'job-completed',
                team_id: 'team-1',
                task_id: 'task-1',
                submission_id: 'submission-completed',
                question_id: 'question-completed',
                labeler_id: 'labeler-3',
                prompt: '检查答案质量',
                dimensions: [],
                status: 'completed',
                retry_count: 0,
                result: { ai_suggestion: 'pass', total_score: 95, reason: '质量通过' },
                error: null,
                idempotency_key: 'submission:submission-completed:ai-review',
                created_at: '2026-05-29T00:00:00Z',
                updated_at: '2026-05-29T00:02:00Z',
              },
              updated_at: '2026-05-29T00:02:00Z',
            },
          ],
          summary: { submission_total: 3, job_total: 2, status_counts: { completed: 1, failed: 1 }, suggestion_counts: { pass: 1 } },
          pagination: { page: 1, page_size: 20, total: 3, total_pages: 1 },
        });
      }
      if (url.pathname === '/api/v1/ai-reviews/batch-trigger' && init?.method === 'POST') {
        return apiResponse({ total: 1, success_count: 1, failed_count: 0, results: [{ submission_id: 'submission-new', status: 'success', job: { job_id: 'job-new', status: 'pending' } }] });
      }
      if (url.pathname === '/api/v1/ai-reviews/tasks/job-failed/retry' && init?.method === 'POST') {
        return apiResponse({ job_id: 'job-failed', status: 'pending' });
      }
      return apiResponse({});
    });

    render(<AiReviewTaskDetailPage taskId="task-1" />);

    expect(await screen.findByRole('heading', { name: '风控文本审核任务' })).toBeInTheDocument();
    const selectAll = document.querySelector<HTMLInputElement>('.ai-review-detail-page .ant-table-thead .ant-checkbox-input');
    expect(selectAll).toBeTruthy();
    fireEvent.click(selectAll!);
    await user.click(await screen.findByRole('button', { name: /批量触发 \(2\)/ }));

    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([input, init]) => fetchUrl(input) === '/api/v1/ai-reviews/batch-trigger' && init?.method === 'POST')).toBe(true));
    const batchCall = vi.mocked(fetch).mock.calls.find(([input]) => fetchUrl(input) === '/api/v1/ai-reviews/batch-trigger');
    expect(JSON.parse(String(batchCall?.[1]?.body))).toEqual({ submission_ids: ['submission-new'] });
    expect(vi.mocked(fetch).mock.calls.some(([input, init]) => fetchUrl(input) === '/api/v1/ai-reviews/tasks/job-failed/retry' && init?.method === 'POST')).toBe(true);
    expect(vi.mocked(fetch).mock.calls.some(([input, init]) => fetchUrl(input) === '/api/v1/ai-reviews/tasks/job-completed/retry' && init?.method === 'POST')).toBe(false);
  });

  it('loads manual review queue and submits an approval', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') return apiResponse({ default_team_id: 'team-1', teams: [teamDetail], notifications: [] });
      if (url.pathname === '/api/v1/reviews/stats') {
        return apiResponse({ pending: 1, completed: 0, approved: 0, rejected: 0, total_visible: 1, task_count: 1, by_status: { submitted: 1 } });
      }
      if (url.pathname === '/api/v1/reviews/queue') {
        if (url.searchParams.get('status') === 'processed') {
          return apiResponse({
            items: [],
            summary: { pending: 0, rounds: [], tasks: 0 },
          });
        }
        return apiResponse({
          items: [{
            submission_id: 'submission-1',
            task_id: 'task-1',
            task_title: '审核任务',
            question_id: 'question-1',
            row_index: 0,
            labeler_id: 'labeler-1',
            status: 'submitted',
            current_round: 1,
            submitted_at: '2026-05-29T00:00:00Z',
            responsible_reviewers: [{ user_id: 'reviewer-1', display_name: 'Reviewer One', email: 'reviewer@example.com', assignment_type: 'task_reviewer' }],
            responsible_reviewer_ids: ['reviewer-1'],
            responsible_reviewer_names: ['Reviewer One'],
            ai_suggestion: 'manual',
            ai_status: 'completed',
            ai_score: 72,
            ai_reason: '需要人工复核',
            ai_review: {
              job_id: 'job-1',
              team_id: 'team-1',
              task_id: 'task-1',
              submission_id: 'submission-1',
              question_id: 'question-1',
              labeler_id: 'labeler-1',
              prompt: '检查答案质量',
              dimensions: [],
              status: 'completed',
              retry_count: 0,
              result: { ai_suggestion: 'manual', total_score: 72, reason: '需要人工复核' },
              error: null,
              idempotency_key: 'submission:submission-1:ai-review',
              created_at: '2026-05-29T00:00:00Z',
              updated_at: '2026-05-29T00:00:00Z',
            },
          }],
          summary: { pending: 1, rounds: [1], tasks: 1, ai_suggestions: { pass: 0, reject: 0, manual: 1 } },
        });
      }
      if (url.pathname === '/api/v1/ai-resources/configs') return apiResponse({ items: [providerPayload] });
      if (url.pathname === '/api/v1/reviews/submissions/batch') {
        return apiResponse({ decision: 'approved', total: 1, success_count: 1, failed_count: 0, results: [{ submission_id: 'submission-1', status: 'success' }] });
      }
      if (url.pathname === '/api/v1/reviews/submissions/submission-1' && init?.method === 'POST') {
        return apiResponse({
          submission: { ...labelingWorkbenchPayload.current_question.submission, status: 'approved', answers: { intent: 'risk' } },
          task: { ...taskPayload, ai_config: { enabled: true, provider_id: 'provider-1' } },
          question: { ...questionPayload, template_schema: labelingWorkbenchPayload.template.schema },
          ai_review: { job_id: 'job-1', team_id: 'team-1', task_id: 'task-1', submission_id: 'submission-1', question_id: 'question-1', labeler_id: 'labeler-1', prompt: '检查答案质量', dimensions: [], status: 'completed', retry_count: 0, result: { comment: 'AI 判断条款类型与图片标注区域基本一致。' }, error: null, idempotency_key: 'submission:submission-1:ai-review', created_at: '2026-05-29T00:00:00Z', updated_at: '2026-05-29T00:00:00Z' },
          review_context: { current_round: 1, decision_options: ['approved', 'rejected', 'revise'], comment_required_for: ['rejected', 'revise'] },
        });
      }
      if (url.pathname === '/api/v1/reviews/submissions/submission-1/history') {
        return apiResponse({
          submission_id: 'submission-1',
          task_id: 'task-1',
          question_id: 'question-1',
          items: [{ history_id: 'history-1', round: 1, stage: 'manual_review', decision: 'approved', comment: '通过', operator_id: 'reviewer-1', action: 'submission_reviewed', created_at: '2026-05-29T00:00:00Z', changes: {} }],
          summary: { total: 1, current_round: 1 },
        });
      }
      if (url.pathname === '/api/v1/reviews/submissions/submission-1/diff') {
        return apiResponse({
          submission_id: 'submission-1',
          task_id: 'task-1',
          question_id: 'question-1',
          base: 'draft',
          target: 'answers',
          items: [
            { field: 'intent', change_type: 'changed', previous_value: 'safe', current_value: 'risk' },
            {
              field: 'damage_mask',
              change_type: 'added',
              previous_value: null,
              current_value: {
                type: 'image_mask_annotation',
                image_source: 'https://cdn.example.com/review-image.png',
                annotations: [{ id: 'mask-1', type: 'rect', x: 0.12, y: 0.18, width: 0.32, height: 0.28 }],
              },
            },
          ],
          summary: { changed: 2, unchanged: 0 },
        });
      }
      if (url.pathname === '/api/v1/reviews/submissions/submission-1') {
        return apiResponse({
          submission: {
            ...labelingWorkbenchPayload.current_question.submission,
            status: 'submitted',
            answers: {
              intent: 'risk',
              damage_mask: {
                type: 'image_mask_annotation',
                image_source: 'https://cdn.example.com/review-image.png',
                annotations: [{ id: 'mask-1', type: 'rect', x: 0.12, y: 0.18, width: 0.32, height: 0.28 }],
              },
            },
          },
          task: { ...taskPayload, ai_config: { enabled: true, provider_id: 'provider-1' } },
          question: {
            ...questionPayload,
            content: {
              ...questionPayload.content,
              image_url: 'https://cdn.example.com/review-image.png',
              media: [{ id: 'row-image', type: 'image', role: 'primary', field: 'image_url', url: 'https://cdn.example.com/review-image.png', name: '审核图片' }],
            },
            template_schema: {
              ...labelingWorkbenchPayload.template.schema,
              tabs: [
                {
                  id: 'read',
                  title: '阅读材料',
                  components: [
                    { id: 'show_title', type: 'ShowItem', field: 'show_title', label: '原始标题', required: false, config: {}, options: [], version: '1.0' },
                    { id: 'show_image', type: 'ShowItem', field: 'show_image', label: '审核图片', required: false, config: { binding: { source_type: 'media', media_type: 'image', role: 'primary', field: 'image_url' } }, options: [], version: '1.0' },
                  ],
                },
                {
                  id: 'answer',
                  title: '标注答案',
                  components: [
                    { id: 'intent', type: 'SingleSelect', field: 'intent', label: '条款类型', required: true, config: {}, options: [{ value: 'payment', label: '付款条款' }, { value: 'risk', label: '风险条款' }], version: '1.0' },
                    { id: 'damage_mask', type: 'ImageMaskAnnotation', field: 'damage_mask', label: '图片标注区域', required: false, config: { source_field: 'image_url', mode: 'rect' }, options: [], version: '1.0' },
                  ],
                },
              ],
            },
          },
          ai_review: { job_id: 'job-1', team_id: 'team-1', task_id: 'task-1', submission_id: 'submission-1', question_id: 'question-1', labeler_id: 'labeler-1', prompt: '检查答案质量', dimensions: [], status: 'pending', retry_count: 0, result: {}, error: null, idempotency_key: 'submission:submission-1:ai-review', created_at: '2026-05-29T00:00:00Z', updated_at: '2026-05-29T00:00:00Z' },
          review_context: { current_round: 1, decision_options: ['approved', 'rejected', 'revise'], comment_required_for: ['rejected', 'revise'] },
        });
      }
      return apiResponse({});
    });

    render(<WorkspaceApp initialSession={teamReviewerSession} page="manual-review" />);

    expect(await screen.findByRole('heading', { name: '审核任务管理' })).toBeInTheDocument();
    expect((await screen.findAllByText('审核任务')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('责任人')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Reviewer One')).toBeInTheDocument();
    expect((await screen.findAllByText(/通过 0 \/ 打回 0/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/建议：通过 0 \/ 打回 0 \/ 人工 1/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/完成 1/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/初审 1/)).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /进入审核/ }));
    expect(screen.queryByText('审核任务子页面 · 仅显示当前任务下的提交条目')).not.toBeInTheDocument();
    expect((await screen.findAllByText('待审核')).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('审核队列摘要')).not.toBeInTheDocument();
    expect(screen.getByLabelText('审核队列筛选')).toBeInTheDocument();
    expect(screen.getByText('已选 0')).toBeInTheDocument();
    expect(screen.queryByText('共 1 条')).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('审核队列筛选'));
    expect(await screen.findByText('待人工审核 1')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(await screen.findByText('题目与答案')).toBeInTheDocument();
    expect(screen.queryByText('本轮提交预览')).not.toBeInTheDocument();
    expect(screen.queryByText('按任务模板只读渲染本轮提交的答案、图片和 mask 标注')).not.toBeInTheDocument();
    expect(await screen.findByText('原始标题')).toBeInTheDocument();
    expect((await screen.findAllByText('条款类型')).length).toBeGreaterThan(0);
    expect((await screen.findAllByAltText('图片标注区域 标注底图')).length).toBeGreaterThanOrEqual(1);
    expect((await screen.findAllByText('法务审核专线')).length).toBeGreaterThan(0);
    expect(await screen.findByText('gpt-4.1-mini')).toBeInTheDocument();
    expect(screen.queryByText('第一轮原始填写内容')).not.toBeInTheDocument();
    expect(screen.queryByText('第一轮仅展示原始填写内容；后续轮次展示上一轮与本轮差异。')).not.toBeInTheDocument();
    expect((await screen.findAllByText('图片标注区域')).length).toBeGreaterThan(0);
    expect(await screen.findByText('AI 预审评语')).toBeInTheDocument();
    expect((await screen.findAllByText('需要人工复核')).length).toBeGreaterThan(0);
    expect(screen.queryByText('第一轮 / 第二轮字段差异')).not.toBeInTheDocument();
    expect(screen.queryByText('草稿字段与当前提交字段一屏对照，变更字段优先高亮。')).not.toBeInTheDocument();
    expect(screen.queryByText('全部阶段')).not.toBeInTheDocument();
    expect(await screen.findByText('AI Agent')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /通过入库/ }));
    expect(await screen.findByText('审核已通过')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/v1/reviews/submissions/submission-1', expect.objectContaining({ method: 'POST' }));
    await user.click(screen.getAllByRole('checkbox')[1]);
    await user.click(screen.getByRole('button', { name: /批量通过/ }));
    await user.click(screen.getByRole('button', { name: '提交批量审核' }));
    expect(await screen.findByText('批量审核完成：成功 1 条，失败 0 条')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/v1/reviews/submissions/batch', expect.objectContaining({ method: 'POST' }));
    await user.click(screen.getByRole('button', { name: '返回审核任务管理' }));
    expect(await screen.findByRole('heading', { name: '审核任务管理' })).toBeInTheDocument();
  });

  it('uses a GUI form for manual revise and keeps missing precheck compact', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') return apiResponse({ default_team_id: 'team-1', teams: [teamDetail], notifications: [] });
      if (url.pathname === '/api/v1/reviews/stats') {
        return apiResponse({ pending: 1, completed: 0, approved: 0, rejected: 0, total_visible: 1, task_count: 1, by_status: { submitted: 1 } });
      }
      if (url.pathname === '/api/v1/reviews/queue') {
        return apiResponse({
          items: [{ submission_id: 'submission-1', task_id: 'task-1', task_title: '审核任务', question_id: 'question-1', row_index: 0, labeler_id: 'labeler-1', status: 'submitted', current_round: 1, submitted_at: '2026-05-29T00:00:00Z' }],
          summary: { pending: 1, rounds: [1], tasks: 1 },
        });
      }
      if (url.pathname === '/api/v1/ai-resources/configs') return apiResponse({ items: [providerPayload] });
      if (url.pathname === '/api/v1/reviews/submissions/submission-1/history') {
        return apiResponse({ submission_id: 'submission-1', task_id: 'task-1', question_id: 'question-1', items: [], summary: { total: 0, current_round: 1 } });
      }
      if (url.pathname === '/api/v1/reviews/submissions/submission-1/diff') {
        return apiResponse({ submission_id: 'submission-1', task_id: 'task-1', question_id: 'question-1', base: 'draft', target: 'answers', items: [], summary: { changed: 0, unchanged: 1 } });
      }
      if (url.pathname === '/api/v1/reviews/submissions/submission-1' && init?.method === 'POST') {
        return apiResponse({
          submission: { ...labelingWorkbenchPayload.current_question.submission, status: 'approved', answers: { intent: 'risk', reason: '修订后理由' } },
          task: { ...taskPayload, ai_config: { enabled: false } },
          question: { ...questionPayload, template_schema: labelingWorkbenchPayload.template.schema },
          ai_review: null,
          review_context: { current_round: 1, decision_options: ['approved', 'rejected', 'revise'], comment_required_for: ['rejected', 'revise'] },
        });
      }
      if (url.pathname === '/api/v1/reviews/submissions/submission-1') {
        return apiResponse({
          submission: { ...labelingWorkbenchPayload.current_question.submission, status: 'submitted', answers: { intent: 'risk', reason: '原理由' } },
          task: { ...taskPayload, ai_config: { enabled: false } },
          question: { ...questionPayload, template_schema: labelingWorkbenchPayload.template.schema },
          ai_review: null,
          review_context: { current_round: 1, decision_options: ['approved', 'rejected', 'revise'], comment_required_for: ['rejected', 'revise'] },
        });
      }
      return apiResponse({});
    });

    render(<WorkspaceApp initialSession={teamReviewerSession} page="manual-review" />);

    expect(await screen.findByRole('heading', { name: '审核任务管理' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /进入审核/ }));
    expect(await screen.findByText('无 AI 预审')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /直接修订/ }));
    expect(await screen.findByText('直接修订并入库')).toBeInTheDocument();
    const reviseDialog = screen.getByRole('button', { name: '保存修订并入库' }).closest('[role="dialog"]') as HTMLElement;
    expect(reviseDialog).toBeTruthy();
    expect(within(reviseDialog).getByLabelText('条款类型')).toBeInTheDocument();
    expect(within(reviseDialog).getByLabelText('判断理由')).toBeInTheDocument();
    expect(within(reviseDialog).queryByLabelText('修订后的标注 JSON')).not.toBeInTheDocument();
    await user.clear(within(reviseDialog).getByLabelText('判断理由'));
    await user.type(within(reviseDialog).getByLabelText('判断理由'), '修订后理由');
    const reviseComment = within(reviseDialog).getByLabelText('修订说明');
    fireEvent.change(reviseComment, { target: { value: '修正理由字段' } });
    await waitFor(() => expect(reviseComment).toHaveValue('修正理由字段'));
    await user.click(screen.getByRole('button', { name: '保存修订并入库' }));
    expect(await screen.findByText('已完成直接修订并入库')).toBeInTheDocument();
  });

  it('explains why admin manual review cannot load without a team scope', async () => {
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') {
        return apiResponse({ default_team_id: null, teams: [], notifications: [] });
      }
      return apiResponse({});
    });

    render(<WorkspaceApp initialSession={adminSession} page="manual-review" />);

    expect(await screen.findByRole('heading', { name: '审核任务管理' })).toBeInTheDocument();
    expect(await screen.findByText('审核队列需要当前账号加入一个企业企业；当前管理员账号没有可用企业作用域。')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('/api/v1/reviews/queue'), expect.anything());
  });

  it('lets team admins inspect organization review tasks without submitting review decisions', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') return apiResponse({ default_team_id: 'team-1', teams: [teamDetail], notifications: [] });
      if (url.pathname === '/api/v1/reviews/stats') {
        expect(url.searchParams.get('assigned_only')).toBe('false');
        return apiResponse({ pending: 1, completed: 0, approved: 0, rejected: 0, total_visible: 1, task_count: 1, by_status: { submitted: 1 } });
      }
      if (url.pathname === '/api/v1/reviews/queue') {
        expect(url.searchParams.get('assigned_only')).toBe('false');
        return apiResponse({
          items: [{
            submission_id: 'submission-1',
            task_id: 'task-1',
            task_title: '企业审核任务',
            question_id: 'question-1',
            row_index: 0,
            labeler_id: 'labeler-1',
            labeler_name: 'Labeler One',
            status: url.searchParams.get('status') === 'processed' ? 'approved' : 'submitted',
            current_round: 1,
            title: '待监管提交',
            summary: '审核数据摘要',
            responsible_reviewers: [{ user_id: 'reviewer-1', display_name: 'Reviewer One', email: 'reviewer@example.com' }],
            ai_suggestion: 'manual',
            ai_status: 'completed',
            ai_score: 82,
            submitted_at: '2026-05-29T00:00:00Z',
            updated_at: '2026-05-29T00:00:00Z',
          }],
          summary: { pending: 1, rounds: [1], tasks: 1, ai_suggestions: { pass: 0, reject: 0, manual: 1 } },
        });
      }
      if (url.pathname === '/api/v1/ai-resources/configs') return apiResponse({ items: [] });
      if (url.pathname === '/api/v1/reviews/submissions/submission-1/history') {
        expect(url.searchParams.get('assigned_only')).toBe('false');
        return apiResponse({ submission_id: 'submission-1', task_id: 'task-1', question_id: 'question-1', items: [], summary: { total: 0, current_round: 1 } });
      }
      if (url.pathname === '/api/v1/reviews/submissions/submission-1/diff') {
        expect(url.searchParams.get('assigned_only')).toBe('false');
        return apiResponse({ submission_id: 'submission-1', task_id: 'task-1', question_id: 'question-1', base: 'draft', target: 'answers', items: [], summary: { changed: 0, unchanged: 1 } });
      }
      if (url.pathname === '/api/v1/reviews/submissions/submission-1') {
        expect(url.searchParams.get('assigned_only')).toBe('false');
        return apiResponse({
          submission: { ...labelingWorkbenchPayload.current_question.submission, status: 'submitted', answers: { intent: 'risk', reason: '待审答案' } },
          task: { ...taskPayload, title: '企业审核任务', ai_config: { enabled: false } },
          question: { ...questionPayload, template_schema: labelingWorkbenchPayload.template.schema },
          ai_review: null,
          review_context: { current_round: 1, decision_options: ['approved', 'rejected', 'revise'], comment_required_for: ['rejected', 'revise'] },
        });
      }
      return apiResponse({});
    });

    render(<WorkspaceApp initialSession={teamAdminSession} page="manual-review" />);

    expect(await screen.findByText('企业审核任务')).toBeInTheDocument();
    expect(screen.queryByText('当前账号可查看企业审核任务，但只有任务分配的 Reviewer 可以提交审核结果。')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /查看详情/ }));
    expect(await screen.findByText('题目与答案')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /通过入库/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /直接修订/ })).toBeDisabled();
    screen.getAllByRole('button', { name: /打回/ }).forEach((button) => {
      expect(button).toBeDisabled();
    });
    expect(screen.getByRole('textbox', { name: '审核意见' })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalledWith('/api/v1/reviews/submissions/submission-1', expect.objectContaining({ method: 'POST' }));
  });

  it('renders organization profile as an independent organization page and saves basic fields', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }))
      .mockResolvedValueOnce(apiResponse({ ...teamDetail, industry: 'Data AI' }))
      .mockResolvedValueOnce(apiResponse({
        file_id: 'file-1',
        team_id: 'team-1',
        filename: 'license.pdf',
        content_type: 'application/pdf',
        category: 'verification',
        size: 7,
        url: '/api/v1/uploads/file-1/download',
        created_at: '2026-05-29T00:00:00Z',
      }))
      .mockResolvedValueOnce(apiResponse({
        ...teamDetail,
        verification_status: 'pending_review',
        legal_name: 'Demo Team Ltd.',
        registration_number: '91310000DEMO',
        verification_contact: 'Admin One',
        verification_phone: '13800138000',
        verification_materials: ['/api/v1/uploads/file-1/download'],
        verification_submitted_at: '2026-05-29T00:00:00Z',
      }));

    render(<WorkspaceApp initialSession={adminSession} page="organization-info" />);

    expect(await screen.findByRole('heading', { name: '企业信息' })).toBeInTheDocument();
    expect(screen.getByText('基本信息')).toBeInTheDocument();
    expect(screen.getAllByText('开票信息').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('邮寄信息').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('企业认证')).toBeInTheDocument();
    expect(screen.getByText('企业尚未认证')).toBeInTheDocument();
    expect(screen.queryByText('就绪度与下一步行动')).not.toBeInTheDocument();
    expect(screen.queryByText('治理入口')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '企业信息页' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '编辑资料' })).toBeInTheDocument();
    expect(screen.getAllByText('Demo Team').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Pro')).toBeInTheDocument();
    expect(screen.getByText(/到期时间：2027/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /购买|续费|联系平台定制/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('行业')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '编辑资料' }));
    expect(screen.getByRole('button', { name: '取消编辑' })).toBeInTheDocument();
    expect(screen.getByLabelText('行业')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('行业'));
    await user.type(screen.getByLabelText('行业'), 'Data AI');
    await user.clear(screen.getByLabelText('发票抬头'));
    await user.type(screen.getByLabelText('发票抬头'), 'Demo Team Updated');
    await user.clear(screen.getByLabelText('开票邮箱'));
    await user.clear(screen.getByLabelText('收件人'));
    await user.type(screen.getByLabelText('收件人'), '李四');
    await user.click(screen.getByRole('button', { name: '保存修改' }));
    expect(await screen.findByText('企业信息已保存')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '编辑资料' })).toBeInTheDocument();
    expect(screen.queryByLabelText('行业')).not.toBeInTheDocument();
    expect(screen.getByText('Data AI')).toBeInTheDocument();
    expect(vi.mocked(fetch)).toHaveBeenLastCalledWith('/api/v1/teams/team-1', expect.objectContaining({ method: 'PUT' }));
    const saveRequest = vi.mocked(fetch).mock.calls.find(
      ([input, init]) =>
        (typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url).includes('/api/v1/teams/team-1') &&
        init?.method === 'PUT',
    );
    expect(saveRequest).toBeTruthy();
    expect(saveRequest?.[1]?.body).toContain('Demo Team Updated');
    expect(saveRequest?.[1]?.body).toContain('李四');
    expect(saveRequest?.[1]?.body).toContain('"invoice_email":null');

    await user.click(screen.getAllByRole('button', { name: '提交认证' }).at(-1)!);
    await user.clear(screen.getByLabelText('企业主体名称'));
    await user.type(screen.getByLabelText('企业主体名称'), 'Demo Team Ltd.');
    await user.type(screen.getByLabelText('统一社会信用代码'), '91310000DEMO');
    await user.type(screen.getByLabelText('认证联系人'), 'Admin One');
    await user.clear(screen.getAllByLabelText('联系电话').at(-1)!);
    await user.type(screen.getAllByLabelText('联系电话').at(-1)!, '13800138000');
    const materialUploadInput = document.querySelector('.ant-modal input[type="file"]') as HTMLInputElement;
    expect(materialUploadInput).toBeTruthy();
    await user.upload(materialUploadInput, new File(['license'], 'license.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText('认证材料已上传：license.pdf')).toBeInTheDocument();
    expect(screen.getByText('license.pdf')).toBeInTheDocument();
    expect(screen.queryByLabelText('认证材料 URL')).not.toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: '提交认证' }).at(-1)!);
    expect(await screen.findByText('企业认证已提交，等待平台审核')).toBeInTheDocument();
    expect(vi.mocked(fetch)).toHaveBeenLastCalledWith('/api/v1/teams/team-1/verification', expect.objectContaining({ method: 'POST' }));
  });

  it('blocks non-PDF organization verification materials before upload', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') {
        return apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] });
      }
      return apiResponse(null);
    });

    render(<WorkspaceApp initialSession={adminSession} page="organization-info" />);

    expect(await screen.findByRole('heading', { name: '企业信息' })).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: '提交认证' }).at(-1)!);
    const materialUploadInput = document.querySelector('.ant-modal input[type="file"]') as HTMLInputElement;
    expect(materialUploadInput).toBeTruthy();
    expect(materialUploadInput).toHaveAttribute('accept', '.pdf,application/pdf');

    const uploadWithoutAccept = userEvent.setup({ applyAccept: false });
    await uploadWithoutAccept.upload(materialUploadInput, new File(['MZ'], 'license.exe', { type: 'application/x-msdownload' }));

    expect(vi.mocked(fetch).mock.calls.some(([input, init]) => fetchUrl(input).includes('/api/v1/uploads') && init?.method === 'POST')).toBe(false);
  });

  it('blocks non-image organization logo before upload', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') {
        return apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] });
      }
      return apiResponse(null);
    });

    render(<WorkspaceApp initialSession={adminSession} page="organization-info" />);

    expect(await screen.findByRole('heading', { name: '企业信息' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '编辑资料' }));
    const logoUploadInput = document.querySelector('.organization-section-card input[type="file"]') as HTMLInputElement;
    expect(logoUploadInput).toBeTruthy();
    expect(logoUploadInput).toHaveAttribute('accept', 'image/jpeg,image/png,image/gif');

    const uploadWithoutAccept = userEvent.setup({ applyAccept: false });
    await uploadWithoutAccept.upload(logoUploadInput, new File(['%PDF'], 'logo.pdf', { type: 'application/pdf' }));

    expect(vi.mocked(fetch).mock.calls.some(([input, init]) => fetchUrl(input).includes('/api/v1/uploads') && init?.method === 'POST')).toBe(false);
  });

  it('uploads organization logo and saves the returned URL', async () => {
    const user = userEvent.setup();
    const objectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:organization-logo');
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') {
        return apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] });
      }
      if (url.pathname === '/api/v1/uploads' && init?.method === 'POST') {
        return apiResponse({
          file_id: 'logo-file',
          team_id: 'team-1',
          filename: 'logo.png',
          content_type: 'image/png',
          category: 'image',
          size: 7,
          url: '/api/v1/uploads/logo-file/download',
          created_at: '2026-05-29T00:00:00Z',
        });
      }
      if (url.pathname === '/api/v1/uploads/logo-file/download') {
        const contentDisposition = init?.headers && new Headers(init.headers).get('X-Team-ID')
          ? 'attachment; filename="logo.png"'
          : null;
        return new Response('logo', {
          status: 200,
          headers: {
            'Content-Type': 'image/png',
            ...(contentDisposition ? { 'Content-Disposition': contentDisposition } : {}),
          },
        });
      }
      if (url.pathname === '/api/v1/teams/team-1' && init?.method === 'PUT') {
        return apiResponse({ ...teamDetail, logo_url: '/api/v1/uploads/logo-file/download' });
      }
      return apiResponse({});
    });

    render(<WorkspaceApp initialSession={adminSession} page="organization-info" />);

    expect(await screen.findByRole('heading', { name: '企业信息' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '编辑资料' }));
    const logoUploadInput = document.querySelector('.organization-section-card input[type="file"]') as HTMLInputElement;
    expect(logoUploadInput).toBeTruthy();
    await user.upload(logoUploadInput, new File(['logo'], 'logo.png', { type: 'image/png' }));
    expect(await screen.findByText('Logo 已上传：logo.png，请保存修改后生效')).toBeInTheDocument();
    expect(objectUrlSpy).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '查看原图' }));
    expect(anchorClickSpy).toHaveBeenCalled();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/v1/uploads/logo-file/download',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({ 'X-Team-ID': 'team-1' }),
      }),
    );

    await user.click(screen.getByRole('button', { name: '保存修改' }));
    expect(await screen.findByText('企业信息已保存')).toBeInTheDocument();
    expect(vi.mocked(fetch)).toHaveBeenLastCalledWith('/api/v1/teams/team-1', expect.objectContaining({ method: 'PUT' }));
    const logoSaveRequest = vi.mocked(fetch).mock.calls.find(
      ([input, init]) =>
        (typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url).includes('/api/v1/teams/team-1') &&
        init?.method === 'PUT',
    );
    expect(logoSaveRequest?.[1]?.body).toContain('/api/v1/uploads/logo-file/download');
  });

  it('opens organization verification materials drawer', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const objectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:verification-material');
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockResolvedValueOnce(apiResponse({
      teams: [{
        ...teamDetail,
        verification_status: 'pending_review',
        legal_name: 'Demo Team Ltd.',
        registration_number: '91310000DEMO',
        verification_contact: 'Admin One',
        verification_phone: '13800138000',
        verification_materials: ['https://files.example.com/license.pdf'],
        verification_submitted_at: '2026-05-29T00:00:00Z',
      }],
      default_team_id: 'team-1',
      team_count: 1,
      notifications: [],
    }))
      .mockResolvedValueOnce(new Response('license', { status: 200, headers: { 'Content-Type': 'application/pdf' } }));

    render(<WorkspaceApp initialSession={adminSession} page="organization-info" />);

    expect(await screen.findByRole('heading', { name: '企业信息' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '查看材料' }));
    expect(screen.getByText('当前展示已提交的认证材料文件')).toBeInTheDocument();
    expect(screen.getByText('license.pdf')).toBeInTheDocument();
    expect(screen.getAllByText('https://files.example.com/license.pdf').length).toBeGreaterThanOrEqual(1);
    await user.click(screen.getByRole('button', { name: '查看文件' }));
    expect(openSpy).toHaveBeenCalledWith('https://files.example.com/license.pdf', '_blank', 'noopener,noreferrer');
    expect(objectUrlSpy).not.toHaveBeenCalled();
  });

  it('restores readonly organization profile view after cancel editing', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }),
    );

    render(<WorkspaceApp initialSession={adminSession} page="organization-info" />);

    expect(await screen.findByRole('heading', { name: '企业信息' })).toBeInTheDocument();
    expect(screen.queryByLabelText('行业')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '编辑资料' }));
    await user.clear(screen.getByLabelText('行业'));
    await user.type(screen.getByLabelText('行业'), 'Changed');
    expect(screen.getByLabelText('行业')).toHaveValue('Changed');

    await user.click(screen.getByRole('button', { name: '取消编辑' }));
    expect(screen.queryByLabelText('行业')).not.toBeInTheDocument();
    expect(screen.getByText('AI')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '编辑资料' })).toBeInTheDocument();
  });

  it.skip('legacy resource configuration assertions', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation((input, init) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') {
        return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      }
      if (url.pathname === '/api/v1/ai-resources/teams/team-1/reports/cost') {
        return Promise.resolve(apiResponse({ team_id: 'team-1', total_tokens: 8, total_cost: 0.000016, by_model: [{ model: 'gpt-4.1-mini', tokens: 8, cost: 0.000016, calls: 1 }] }));
      }
      if (url.pathname === '/api/v1/tasks') {
        return Promise.resolve(apiResponse({ items: [{ ...taskPayload, status: 'published', quota: 20, stats: { total: 20, claimed: 6, submitted: 4, approved: 3, rejected: 0 }, reward_rule: { mode: 'item', points_per_item: 5 } }], pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 } }));
      }
      if (url.pathname === '/api/v1/teams/team-1/points-budget' && (!init || init.method === undefined)) {
        return Promise.resolve(apiResponse(pointsBudgetPayload));
      }
      if (url.pathname === '/api/v1/teams/team-1/points-budget/recharge') {
        return Promise.resolve(apiResponse({ ...pointsBudgetPayload, balance_points: 1500, available_points: 1400 }));
      }
      if (url.pathname === '/api/v1/teams/team-1/points-budget/alerts') {
        return Promise.resolve(apiResponse({ ...pointsBudgetPayload, alert_enabled: true, alert_threshold: 75 }));
      }
      if (url.pathname === '/api/v1/ai-resources/configs') {
        return Promise.resolve(apiResponse({ items: [providerPayload] }));
      }
      if (url.pathname === '/api/v1/ai-resources/teams/team-1/history') {
        return Promise.resolve(apiResponse(aiHistoryPayload));
      }
      if (url.pathname === '/api/v1/ai-resources/chat') {
        return Promise.resolve(apiResponse({ provider: 'OpenAI', model: 'gpt-4.1-mini', latency_ms: 120, status: 'success' }));
      }
      if (url.pathname === '/api/v1/ai-resources/estimate') {
        return Promise.resolve(apiResponse({ provider_id: 'provider-1', route_name: '法务审核主路由', model: 'gpt-4.1-mini', estimated_prompt_tokens: 250, estimated_completion_tokens: 125, estimated_cache_hit_tokens: 0, estimated_tokens: 375, estimated_cost: 0.00075 }));
      }
      if (url.pathname === '/api/v1/ai-resources/cert-types') {
        return Promise.resolve(apiResponse({ items: [{ cert_type: 'education', cert_name: '学历认证', required_docs: ['学历证明'], verification_method: 'manual', status: 'enabled', referenced_tasks: 0 }] }));
      }
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="resource-config" />);

    expect(await screen.findByRole('heading', { name: '资源配置' })).toBeInTheDocument();
    expect(await screen.findByText('积分余额')).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: '积分管理' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('企业初始化充值')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '资质类型' })).not.toBeInTheDocument();

    expect(screen.queryByRole('tab', { name: 'AI 预算' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '资质类型' })).not.toBeInTheDocument();
    expect(screen.getByText('余额充足')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /积分充值/ }));
    expect(await screen.findByText('微信支付')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /微信支付/ }));
    await user.clear(screen.getByLabelText('本次充值积分'));
    await user.type(screen.getByLabelText('本次充值积分'), '500');
    await user.click(screen.getByRole('button', { name: '下一步' }));
    await user.click(await screen.findByRole('button', { name: /我已完成支付/ }));
    expect(await screen.findByText('积分充值成功，已增加 500 积分')).toBeInTheDocument();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/v1/teams/team-1/points-budget/recharge', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ amount: 500, payment_method: 'wechat' }),
    }));
    await user.click(screen.getByRole('button', { name: '预警设置' }));
    const alertSwitch = await screen.findByRole('switch');
    await user.click(alertSwitch);
    const thresholdInput = await screen.findByLabelText('最低可用余额');
    await user.click(thresholdInput);
    await user.clear(thresholdInput);
    await user.type(thresholdInput, '75');
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/v1/teams/team-1/points-budget/alerts', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ enabled: true, threshold: 75 }),
      }));
    });
    expect(await screen.findByText('预警设置已更新')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '申请预算' })).not.toBeInTheDocument();
    expect(screen.queryByText('预算申请')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'AI 资源' }));
    expect(await screen.findByText('AI 调用积分钱包')).toBeInTheDocument();
    expect(screen.queryByText('预算使用情况')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '积分充值' })).not.toBeInTheDocument();
    expect(screen.getAllByText('累计 Token').length).toBeGreaterThan(0);
    expect(screen.getAllByText('可用 Provider').length).toBeGreaterThan(0);

  }, 120000);

  it('opens operation logs from resource configuration with AI resource filter', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation((input) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url.pathname === '/api/v1/ai-resources/teams/team-1/reports/cost') return Promise.resolve(apiResponse({ team_id: 'team-1', total_tokens: 0, total_cost: 0, by_model: [] }));
      if (url.pathname === '/api/v1/teams/team-1/agent-settings') return Promise.resolve(apiResponse(agentSettingsPayload));
      if (url.pathname === '/api/v1/teams/team-1/points-budget') return Promise.resolve(apiResponse(pointsBudgetPayload));
      if (url.pathname === '/api/v1/teams/team-1/membership') return Promise.resolve(apiResponse(membershipPayload));
      if (url.pathname === '/api/v1/teams/team-1/points-budget/ledger') return Promise.resolve(apiResponse(pointsWalletLedgerPayload));
      if (url.pathname === '/api/v1/ai-resources/configs') return Promise.resolve(apiResponse({ items: [providerPayload] }));
      if (url.pathname === '/api/v1/ai-resources/teams/team-1/history') return Promise.resolve(apiResponse({ items: [] }));
      if (url.pathname === '/api/v1/ai-resources/cert-types') return Promise.resolve(apiResponse({ items: [] }));
      if (url.pathname === '/api/v1/audit-logs') return Promise.resolve(apiResponse({ items: [{ ...auditLogPayload, entity_type: 'ai_resource', entity_id: 'provider-1' }], pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 } }));
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceHarness initialPage="resource-config" />);

    expect(await screen.findByRole('heading', { name: '资源配置' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'AI 资源' }));
    await user.click(screen.getByRole('button', { name: /查看操作日志/ }));
    await waitFor(() => {
      expect(
        vi.mocked(fetch).mock.calls.some(([input]) => (
          fetchUrl(input).includes('/api/v1/audit-logs')
          && fetchUrl(input).includes('entity_type=ai_resource')
        )),
      ).toBe(true);
    });
  });

  it('blocks non-image Agent avatar uploads before calling the upload API', async () => {
    const user = userEvent.setup();
    const uploadWithoutAccept = userEvent.setup({ applyAccept: false });
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation((input) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url.pathname === '/api/v1/ai-resources/teams/team-1/reports/cost') return Promise.resolve(apiResponse({ team_id: 'team-1', total_tokens: 0, total_cost: 0, by_model: [] }));
      if (url.pathname === '/api/v1/teams/team-1/agent-settings') return Promise.resolve(apiResponse(agentSettingsPayload));
      if (url.pathname === '/api/v1/teams/team-1/points-budget') return Promise.resolve(apiResponse(pointsBudgetPayload));
      if (url.pathname === '/api/v1/teams/team-1/membership') return Promise.resolve(apiResponse(membershipPayload));
      if (url.pathname === '/api/v1/teams/team-1/points-budget/ledger') return Promise.resolve(apiResponse(pointsWalletLedgerPayload));
      if (url.pathname === '/api/v1/ai-resources/configs') return Promise.resolve(apiResponse({ items: [providerPayload] }));
      if (url.pathname === '/api/v1/ai-resources/teams/team-1/history') return Promise.resolve(apiResponse({ items: [] }));
      if (url.pathname === '/api/v1/ai-resources/cert-types') return Promise.resolve(apiResponse({ items: [] }));
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="resource-config" />);

    expect(await screen.findByRole('heading', { name: '资源配置' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'AI Provider' }));
    expect(await screen.findByRole('button', { name: '新增配置' })).toBeInTheDocument();
    const agentSettingsButton = (await screen.findAllByText('Agent 设置'))
      .map((item) => item.closest('button'))
      .find((button): button is HTMLButtonElement => Boolean(button));
    expect(agentSettingsButton).toBeTruthy();
    await user.click(agentSettingsButton!);

    const avatarUploadInput = document.querySelector('.ant-drawer input[type="file"]') as HTMLInputElement;
    expect(avatarUploadInput).toBeTruthy();
    expect(avatarUploadInput).toHaveAttribute('accept', 'image/jpeg,image/png,image/gif');

    await uploadWithoutAccept.upload(avatarUploadInput, new File(['%PDF'], 'agent.pdf', { type: 'application/pdf' }));

    expect(await screen.findByText('Agent 头像仅支持 JPG、PNG 或 GIF')).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([input]) => fetchUrl(input).includes('/api/v1/teams/team-1/agent-settings/avatar'))).toBe(false);
  });

  it('renders updated resource configuration wallet and ai overview flows', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation((input, init) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') {
        return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      }
      if (url.pathname === '/api/v1/ai-resources/teams/team-1/reports/cost') {
        return Promise.resolve(apiResponse({ team_id: 'team-1', total_tokens: 8, total_cost: 0.000016, by_model: [{ model: 'gpt-4.1-mini', tokens: 8, cost: 0.000016, calls: 1 }] }));
      }
      if (url.pathname === '/api/v1/ai-resources/teams/team-1/wallet' && (!init || init.method === undefined)) {
        return Promise.resolve(apiResponse(aiWalletPayload));
      }
      if (url.pathname === '/api/v1/ai-resources/teams/team-1/history') {
        return Promise.resolve(apiResponse(aiHistoryPayload));
      }
      if (url.pathname === '/api/v1/ai-resources/teams/team-1/wallet/transfer-in') {
        return Promise.resolve(apiResponse({ ...aiWalletPayload, balance_points: 388.5 }));
      }
      if (url.pathname === '/api/v1/teams/team-1/agent-settings' && (!init || init.method === undefined)) {
        return Promise.resolve(apiResponse(agentSettingsPayload));
      }
      if (url.pathname === '/api/v1/teams/team-1/agent-settings' && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body || '{}'));
        return Promise.resolve(apiResponse({ ...agentSettingsPayload, ...body }));
      }
      if (url.pathname === '/api/v1/teams/team-1/points-budget' && (!init || init.method === undefined)) {
        return Promise.resolve(apiResponse(pointsBudgetPayload));
      }
      if (url.pathname === '/api/v1/teams/team-1/membership') {
        return Promise.resolve(apiResponse(membershipPayload));
      }
      if (url.pathname === '/api/v1/teams/team-1/points-budget/payment-password/status') {
        return Promise.resolve(apiResponse({ is_set: true, updated_at: '2026-05-29T09:00:00Z' }));
      }
      if (url.pathname === '/api/v1/teams/team-1/points-budget/ledger') {
        return Promise.resolve(apiResponse(pointsWalletLedgerPayload));
      }
      if (url.pathname === '/api/v1/teams/team-1/points-budget/recharge') {
        return Promise.resolve(apiResponse({ ...pointsBudgetPayload, balance_points: 1500, available_points: 1400 }));
      }
      if (url.pathname === '/api/v1/teams/team-1/points-budget/withdraw') {
        return Promise.resolve(apiResponse({ ...pointsBudgetPayload, balance_points: 880, available_points: 780 }));
      }
      if (url.pathname === '/api/v1/teams/team-1/points-budget/alerts') {
        return Promise.resolve(apiResponse({ ...pointsBudgetPayload, alert_enabled: true, alert_threshold: 75 }));
      }
      if (url.pathname === '/api/v1/ai-resources/configs') {
        return Promise.resolve(apiResponse({ items: [platformProviderPayload, providerPayload] }));
      }
      if (url.pathname === '/api/v1/ai-resources/configs/provider-1/test') {
        return Promise.resolve(apiResponse({ provider_id: 'provider-1', route_name: '法务审核主路由', provider_kind: 'OpenAI', model: 'gpt-4.1-mini', latency_ms: 120, status: 'success' }));
      }
      if (url.pathname === '/api/v1/ai-resources/estimate') {
        return Promise.resolve(apiResponse({ provider_id: 'provider-1', route_name: '法务审核主路由', model: 'gpt-4.1-mini', estimated_prompt_tokens: 250, estimated_completion_tokens: 125, estimated_cache_hit_tokens: 0, estimated_tokens: 375, estimated_cost: 0.00075 }));
      }
      if (url.pathname === '/api/v1/ai-resources/cert-types') {
        return Promise.resolve(apiResponse({ items: [{ cert_type: 'education', cert_name: '学历认证', required_docs: ['学历证明'], verification_method: 'manual', status: 'enabled', referenced_tasks: 0 }] }));
      }
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="resource-config" />);

    expect(await screen.findByRole('heading', { name: '资源配置' })).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: '会员与额度' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByText('当前套餐').length).toBeGreaterThan(0);
    expect(screen.getByText('Basic')).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();
    expect(screen.getByText('Enterprise')).toBeInTheDocument();
    expect(screen.getByText('More')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: '积分管理' }));
    expect(screen.queryByText('奖励任务')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agent 设置' })).not.toBeInTheDocument();
    expect(screen.getAllByText('积分余额').length).toBeGreaterThan(0);
    expect(screen.getAllByText('预扣积分').length).toBeGreaterThan(0);
    expect(screen.getAllByText('花销统计').length).toBeGreaterThan(0);
    expect(screen.getAllByText('可用余额').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /支付密码/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /积分审计/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导出流水' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '查看任务' })).not.toBeInTheDocument();
    expect(screen.getByText('企业初始化充值')).toBeInTheDocument();
    expect(screen.getByText('审核通过后发放奖励')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'AI 预算' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /积分充值/ }));
    expect((await screen.findAllByText('微信支付')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('支付宝').length).toBeGreaterThan(0);
    expect(screen.getAllByText('对公转账').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /微信支付/ }));
    expect(screen.getByText('1 积分 = 1 元')).toBeInTheDocument();
    const amountInput = screen.getByLabelText('本次充值积分');
    await user.click(amountInput);
    await user.clear(amountInput);
    await user.type(amountInput, '500');
    await user.click(screen.getByRole('button', { name: /下一步/ }));
    expect(await screen.findByRole('button', { name: /我已完成支付/ })).toBeInTheDocument();
    expect(screen.getByText('支付金额')).toBeInTheDocument();
    expect(screen.getByText('模拟付款码')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /我已完成支付/ }));
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/v1/teams/team-1/points-budget/recharge',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ amount: 500, payment_method: 'wechat' }),
        }),
      );
    });
    await waitFor(() => {
      expect(screen.queryByText('模拟付款码')).not.toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /预警设置/ })).toBeInTheDocument();
    expect(screen.queryByText('预算申请')).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: /积分提现/ })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'AI 资源' }));
    expect(screen.queryByText('预算使用情况')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^积分充值$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /支付完成/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('累计 Token').length).toBeGreaterThan(0);
    expect(screen.getAllByText('可用 Provider').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /AI 积分充值/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /估算成本/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /AI 钱包流水/ })).not.toBeInTheDocument();
    expect(screen.queryByText('平台共享 1')).not.toBeInTheDocument();
    expect(screen.queryByText('1 积分 = 1 元')).not.toBeInTheDocument();
    expect(screen.getByText('可调用平台共享路由')).toBeInTheDocument();
    expect(screen.getByText('钱包划转')).toBeInTheDocument();
    expect(screen.getByText('AI 调用')).toBeInTheDocument();
    expect(screen.getAllByText('平台法务助手').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /AI 积分充值/ }));
    expect(await screen.findByText('AI 积分转入会直接从企业积分钱包扣减等额可支配余额，不经过微信、支付宝或对公转账。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /微信支付/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /支付宝/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /对公转账/ })).not.toBeInTheDocument();
    expect(screen.getByText('企业积分余额')).toBeInTheDocument();
    expect(screen.getAllByText('AI 钱包余额').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: '取 消' }));
    await user.click(screen.getByRole('tab', { name: 'AI Provider' }));
    expect(await screen.findByText('配置列表')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '平台 Provider' }));
    await waitFor(() => expect(screen.getAllByText('平台 Provider').length).toBeGreaterThan(0));
    await user.click(screen.getByRole('button', { name: /平台法务助手/ }));
    expect(screen.getAllByText('平台法务助手').length).toBeGreaterThan(0);
    expect(screen.getByText('模态能力')).toBeInTheDocument();
    expect(screen.getByText('输入费率')).toBeInTheDocument();
  }, 120000);

  it('submits membership subscription payload and keeps More contact-only', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation((input, init) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') {
        return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      }
      if (url.pathname === '/api/v1/ai-resources/teams/team-1/reports/cost') return Promise.resolve(apiResponse({ team_id: 'team-1', total_tokens: 0, total_cost: 0, by_model: [] }));
      if (url.pathname === '/api/v1/ai-resources/teams/team-1/wallet') return Promise.resolve(apiResponse(aiWalletPayload));
      if (url.pathname === '/api/v1/teams/team-1/agent-settings') return Promise.resolve(apiResponse(agentSettingsPayload));
      if (url.pathname === '/api/v1/teams/team-1/points-budget') {
        return Promise.resolve(apiResponse({ ...pointsBudgetPayload, balance_points: 5000, available_points: 5000 }));
      }
      if (url.pathname === '/api/v1/teams/team-1/points-budget/payment-password/status') return Promise.resolve(apiResponse({ is_set: true, updated_at: '2026-05-29T09:00:00Z' }));
      if (url.pathname === '/api/v1/teams/team-1/membership' && (!init || init.method === undefined)) return Promise.resolve(apiResponse(membershipPayload));
      if (url.pathname === '/api/v1/teams/team-1/membership/subscribe') {
        return Promise.resolve(apiResponse({ ...membershipPayload, current_plan: 'basic', effective_plan: 'basic', expires_at: '2027-06-01T00:00:00Z' }));
      }
      return Promise.resolve(apiResponse({ items: [] }));
    });

    render(<WorkspaceApp initialSession={adminSession} page="resource-config" />);

    expect(await screen.findByRole('tab', { name: '会员与额度' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getAllByRole('button', { name: /购买 \/ 续费/ })[0]);
    expect(await screen.findByText('Basic 会员购买 / 续费')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('请输入支付密码'), '123456');
    await user.click(screen.getByRole('button', { name: '确认支付' }));
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/v1/teams/team-1/membership/subscribe',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ target_plan: 'basic', payment_password: '123456' }),
        }),
      );
    });
    await user.click(screen.getByRole('button', { name: 'Close' }));

    const subscribeCallsBeforeMore = vi.mocked(fetch).mock.calls.filter(([request]) => fetchUrl(request).includes('/membership/subscribe')).length;
    await user.click(screen.getByRole('button', { name: /联系平台定制/ }));
    expect(await screen.findByText('More 套餐面向超大规模企业、私有部署和定制化 SLA。请联系平台运营沟通成员、任务、存储与服务支持方案。')).toBeInTheDocument();
    const subscribeCallsAfterMore = vi.mocked(fetch).mock.calls.filter(([request]) => fetchUrl(request).includes('/membership/subscribe')).length;
    expect(subscribeCallsAfterMore).toBe(subscribeCallsBeforeMore);
  }, 60000);

  it('renders announcements with notification creation and read state workflow', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }))
      .mockResolvedValueOnce(apiResponse({ items: [notificationPayload], summary: { unread: 1, team: 1, review: 0, export: 0, system: 0 }, pagination: { page: 1, page_size: 50, total: 1, total_pages: 1 } }))
      .mockResolvedValueOnce(apiResponse(memberListPayload))
      .mockResolvedValueOnce(apiResponse({ total: 1, role_counts: { reviewer: 1 }, user_ids: ['reviewer-1'] }))
      .mockResolvedValueOnce(apiResponse({ ...notificationPayload, notification_id: 'notice-2', title: '本周交付安排' }))
      .mockResolvedValueOnce(apiResponse({ ...notificationPayload, notification_id: 'notice-2', title: '本周交付安排', is_read: true, status: 'read', read_count: 1 }))
      .mockResolvedValueOnce(apiResponse({ ...notificationPayload, notification_id: 'notice-2', title: '本周交付安排', is_read: true, status: 'revoked', is_revoked: true, read_count: 1, revoked_at: '2026-05-29T01:00:00Z', revoked_by: 'admin-1' }))
      .mockResolvedValueOnce(apiResponse({ notification_id: 'notice-2', deleted: true }))
      .mockResolvedValueOnce(apiResponse(profilePayload))
      .mockResolvedValueOnce(apiResponse({ ...profilePayload, profile: { ...profilePayload.profile, notification_settings: { in_app: true, email: true, system: true, team: true, review: true, export: true } } }));

    render(<WorkspaceApp initialSession={adminSession} page="announcements" />);

    expect(await screen.findByRole('heading', { name: '公告通知' })).toBeInTheDocument();
    expect(await screen.findByText('审核排班提醒')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '新建企业通知' }));
    await user.type(screen.getByRole('textbox', { name: '标题' }), '本周交付安排');
    await user.type(screen.getByRole('textbox', { name: '正文' }), '周五前完成数据交付。');
    await user.click(screen.getByText('预览接收人'));
    expect(await screen.findByText(/预计 1 人/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '发送通知' }));
    expect(await screen.findByText('企业通知已发送')).toBeInTheDocument();

    await clickWorkspaceMoreMenuItem(user, '标为已读');
    expect(await screen.findByText('通知已标为已读')).toBeInTheDocument();
    await clickWorkspaceMoreMenuItem(user, '撤回通知');
    await user.click((await screen.findAllByRole('button', { name: /撤\s*回/ })).at(-1)!);
    expect(await screen.findByText('企业通知已撤回')).toBeInTheDocument();
    expect(await screen.findByText('已撤回')).toBeInTheDocument();
    await clickWorkspaceMoreMenuItem(user, '删除通知');
    await user.click((await screen.findAllByRole('button', { name: /删\s*除/ })).at(-1)!);
    expect(await screen.findByText('企业通知已删除')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '通知设置' }));
    expect(await screen.findByText('按需调整站内和邮件提醒。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存设置' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '保存设置' }));
    expect(await screen.findByText('通知设置已保存')).toBeInTheDocument();
    expect(vi.mocked(fetch)).toHaveBeenLastCalledWith('/api/v1/profile/me', expect.objectContaining({ method: 'PUT' }));
  }, 70000);

  it('updates announcement summary after marking one notification read', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    const unreadNotice = {
      ...notificationPayload,
      notification_id: 'notice-unread',
      title: '单条已读提醒',
      status: 'unread',
      is_read: false,
      read_count: 0,
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }))
      .mockResolvedValueOnce(apiResponse({
        items: [unreadNotice],
        summary: { unread: 1, team: 1, review: 0, export: 0, system: 0 },
        pagination: { page: 1, page_size: 50, total: 1, total_pages: 1 },
      }))
      .mockResolvedValueOnce(apiResponse(memberListPayload))
      .mockResolvedValueOnce(apiResponse({ ...unreadNotice, status: 'read', is_read: true, read_count: 1 }));

    render(<WorkspaceApp initialSession={adminSession} page="announcements" />);

    expect(await screen.findByRole('heading', { name: '公告通知' })).toBeInTheDocument();
    const summary = screen.getByLabelText('公告通知概览');
    expect(within(summary).getByText('未读消息').closest('.production-summary-item')).toHaveTextContent('1');

    await clickWorkspaceMoreMenuItem(user, '标为已读');
    expect(await screen.findByText('通知已标为已读')).toBeInTheDocument();

    expect(within(summary).getByText('未读消息').closest('.production-summary-item')).toHaveTextContent('0');
  });

  it('supports batch read and handled actions in announcements', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    const reviewNotice = {
      ...notificationPayload,
      notification_id: 'review-notice',
      title: '待审核提醒',
      notification_type: 'review',
      status: 'unread',
      is_read: false,
      is_handled: false,
    };
    const exportNotice = {
      ...notificationPayload,
      notification_id: 'export-notice',
      title: '导出完成提醒',
      notification_type: 'export',
      status: 'unread',
      is_read: false,
      is_handled: false,
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }))
      .mockResolvedValueOnce(apiResponse({ items: [reviewNotice, exportNotice], summary: { unread: 2, team: 0, review: 1, export: 1, system: 0 }, pagination: { page: 1, page_size: 50, total: 2, total_pages: 1 } }))
      .mockResolvedValueOnce(apiResponse(memberListPayload))
      .mockResolvedValueOnce(apiResponse({ ...reviewNotice, status: 'read', is_read: true }))
      .mockResolvedValueOnce(apiResponse({ ...exportNotice, status: 'read', is_read: true }))
      .mockResolvedValueOnce(apiResponse({ ...reviewNotice, status: 'handled', is_read: true, is_handled: true }))
      .mockResolvedValueOnce(apiResponse({ ...exportNotice, status: 'handled', is_read: true, is_handled: true }));

    render(<WorkspaceApp initialSession={adminSession} page="announcements" />);

    expect(await screen.findByRole('heading', { name: '公告通知' })).toBeInTheDocument();
    expect(await screen.findByText('待审核提醒')).toBeInTheDocument();
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);
    await user.click(checkboxes[2]);
    expect(await screen.findByText('已选择 2 条通知')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '批量标为已读' }));
    expect(await screen.findByText('已批量标记 2 条通知为已读')).toBeInTheDocument();

    await user.click(screen.getAllByRole('checkbox')[1]);
    await user.click(screen.getAllByRole('checkbox')[2]);
    await user.click(screen.getByRole('button', { name: '批量设为已处理' }));
    expect(await screen.findByText('已批量处理 2 条提醒')).toBeInTheDocument();
    const calledUrls = vi.mocked(fetch).mock.calls.map(([input]) => fetchUrl(input));
    expect(calledUrls.filter((url) => url.includes('/api/v1/notifications/review-notice/state')).length).toBe(2);
    expect(calledUrls.filter((url) => url.includes('/api/v1/notifications/export-notice/state')).length).toBe(2);
  }, 40000);

  it('renders hidden personal inbox page and updates notification states', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    const inboxNotice = {
      ...notificationPayload,
      notification_id: 'inbox-notice',
      source_team_name: 'MarkUp 测试企业',
      title: '个人审核提醒',
      content: '请处理你的审核队列。',
      notification_type: 'review',
      is_read: false,
      is_handled: false,
      status: 'unread',
      read_count: 0,
      handled_count: 0,
    };
    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      if (url.pathname === '/api/v1/notifications/my' && (!init || init.method === undefined)) {
        return Promise.resolve(apiResponse({
          items: [inboxNotice],
          summary: { unread: 1, team: 0, review: 1, export: 0, system: 0 },
          pagination: { page: 1, page_size: 50, total: 1, total_pages: 1 },
        }));
      }
      if (url.pathname === '/api/v1/notifications/my/mark-all-read') {
        return Promise.resolve(apiResponse({ updated: 1 }));
      }
      if (url.pathname === '/api/v1/notifications/my/inbox-notice/state') {
        return Promise.resolve(apiResponse({ ...inboxNotice, is_read: true, is_handled: true, status: 'handled', read_count: 1, handled_count: 1 }));
      }
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="personal-inbox" />);

    expect(await screen.findByRole('heading', { name: '个人信箱' })).toBeInTheDocument();
    expect(screen.getByText('个人审核提醒')).toBeInTheDocument();
    expect(screen.getByText('MarkUp 测试企业')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '设为已处理' }));
    expect(await screen.findByText('提醒已设为已处理')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '全部标为已读' }));
    expect(await screen.findByText('已标记 1 条消息为已读')).toBeInTheDocument();
  }, 120000);

  it('redirects reviewers away from announcements', async () => {
    persistSession({
      access_token: reviewerSession.accessToken,
      refresh_token: reviewerSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: reviewerSession.user,
    });
    vi.mocked(fetch).mockImplementation((input) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') {
        return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      }
      if (url.pathname === '/api/v1/teams/team-1/dashboard') {
        return Promise.resolve(apiResponse({ ...teamDashboardPayload, viewer_role: 'reviewer' }));
      }
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={reviewerSession} page="announcements" />);

    expect(await screen.findByRole('heading', { name: '企业工作台' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '公告通知' })).not.toBeInTheDocument();
  });

  it('requires recipient preview before sending team notification and blocks empty recipients', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }))
      .mockResolvedValueOnce(apiResponse({ items: [], summary: { unread: 0, team: 0, review: 0, export: 0, system: 0 }, pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 } }))
      .mockResolvedValueOnce(apiResponse(memberListPayload))
      .mockResolvedValueOnce(apiResponse({ total: 0, role_counts: {}, user_ids: [] }));

    render(<WorkspaceApp initialSession={adminSession} page="announcements" />);

    expect(await screen.findByRole('heading', { name: '公告通知' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '新建企业通知' }));
    const modal = document.querySelector('.ant-modal') as HTMLElement;
    expect(modal).toBeTruthy();
    await user.type(within(modal).getByLabelText('标题'), '空接收人通知');
    await user.type(within(modal).getByLabelText('正文'), '不应发送。');
    await user.click(within(modal).getByRole('button', { name: '发送通知' }));
    expect(await screen.findByText('接收人为 0，无法发送企业通知。请调整分发对象后重新预览。')).toBeInTheDocument();
    const calledUrls = vi.mocked(fetch).mock.calls.map(([input]) => fetchUrl(input));
    expect(calledUrls.some((url) => url.includes('/api/v1/notifications/preview'))).toBe(true);
    expect(vi.mocked(fetch).mock.calls.some(([input, init]) => fetchUrl(input).includes('/api/v1/notifications?team_id=team-1') && init?.method === 'POST')).toBe(false);
  });

  it('trims task notification related ids before previewing and sending', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') {
        return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      }
      if (url.pathname === '/api/v1/notifications' && (!init || init.method === undefined)) {
        return Promise.resolve(apiResponse({ items: [], summary: { unread: 0, team: 0, review: 0, export: 0, system: 0 }, pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 } }));
      }
      if (url.pathname === '/api/v1/teams/team-1/members') {
        return Promise.resolve(apiResponse(memberListPayload));
      }
      if (url.pathname === '/api/v1/notifications/preview') {
        expect(url.searchParams.get('related_entity_id')).toBe('task-1');
        return Promise.resolve(apiResponse({ total: 1, role_counts: { reviewer: 1 }, user_ids: ['reviewer-1'] }));
      }
      if (url.pathname === '/api/v1/notifications' && init?.method === 'POST') {
        expect(String(init.body)).toContain('"related_entity_id":"task-1"');
        expect(String(init.body)).not.toContain('"related_entity_id":"  task-1  "');
        return Promise.resolve(apiResponse({ ...notificationPayload, notification_id: 'notice-task', title: '任务提醒', target_type: 'task', related_entity_id: 'task-1' }));
      }
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="announcements" />);

    expect(await screen.findByRole('heading', { name: '公告通知' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '新建企业通知' }));
    const modal = document.querySelector('.ant-modal') as HTMLElement;
    expect(modal).toBeTruthy();
    await user.type(within(modal).getByLabelText('标题'), '任务提醒');
    await user.type(within(modal).getByLabelText('正文'), '只通知任务相关成员。');
    fireEvent.mouseDown(within(modal).getByLabelText('分发对象'));
    await user.click(await screen.findByText('指定任务相关成员', { selector: '.ant-select-item-option-content' }));
    await user.type(within(modal).getByLabelText('关联对象标识'), '  task-1  ');
    await user.click(within(modal).getByRole('button', { name: '预览接收人' }));
    expect(await screen.findByText(/预计 1 人/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '发送通知' }));

    expect(await screen.findByText('企业通知已发送')).toBeInTheDocument();
  });

  it('filters expired announcements with the expired status option', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    const expiredNotice = {
      ...notificationPayload,
      notification_id: 'notice-expired',
      title: '已过期企业通知',
      status: 'expired',
      is_read: false,
      expire_at: '2026-06-06T10:00:00Z',
    };
    vi.mocked(fetch).mockImplementation((input) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') {
        return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      }
      if (url.pathname === '/api/v1/notifications') {
        return Promise.resolve(apiResponse({
          items: [expiredNotice],
          summary: { unread: 0, team: 1, organization: 1, review: 0, export: 0, system: 0 },
          pagination: { page: 1, page_size: 50, total: 1, total_pages: 1 },
        }));
      }
      if (url.pathname === '/api/v1/teams/team-1/members') {
        return Promise.resolve(apiResponse(memberListPayload));
      }
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="announcements" />);

    expect(await screen.findByRole('heading', { name: '公告通知' })).toBeInTheDocument();
    expect(await screen.findByText('已过期企业通知')).toBeInTheDocument();
    expect(screen.getByText('已过期')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByLabelText('状态筛选'));
    await user.click(await screen.findByText('已过期', { selector: '.ant-select-item-option-content' }));

    await waitFor(() => expect(latestCalledUrl('/api/v1/notifications?team_id=team-1')).toContain('status=expired'));
  });

  it('excludes system agent from announcement role and member recipient selectors', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }))
      .mockResolvedValueOnce(apiResponse({ items: [], summary: { unread: 0, team: 0, review: 0, export: 0, system: 0 }, pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 } }))
      .mockResolvedValueOnce(apiResponse(memberListPayload));

    render(<WorkspaceApp initialSession={adminSession} page="announcements" />);

    expect(await screen.findByRole('heading', { name: '公告通知' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '新建企业通知' }));
    const modal = document.querySelector('.ant-modal') as HTMLElement;
    expect(modal).toBeTruthy();

    fireEvent.mouseDown(within(modal).getByLabelText('分发对象'));
    await user.click(await screen.findByText('按角色', { selector: '.ant-select-item-option-content' }));
    fireEvent.mouseDown(within(modal).getByLabelText('角色'));
    await waitFor(() => expect(screen.queryByText('Agent', { selector: '.ant-select-item-option-content' })).not.toBeInTheDocument());

    fireEvent.mouseDown(within(modal).getByLabelText('分发对象'));
    await user.click(await screen.findByText('指定成员', { selector: '.ant-select-item-option-content' }));
    fireEvent.mouseDown(within(modal).getByLabelText('指定成员'));
    await waitFor(() => expect(screen.queryByText('Agent', { selector: '.ant-select-item-option-content' })).not.toBeInTheDocument());
  });

  it('renders operation logs with filters and detail diff', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation((input) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') {
        return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      }
      if (url.pathname === '/api/v1/audit-logs') {
        return Promise.resolve(apiResponse({ items: [agentAuditLogPayload], pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 } }));
      }
      if (url.pathname === '/api/v1/audit-logs/log-agent-1') {
        return Promise.resolve(apiResponse(agentAuditLogPayload));
      }
      if (url.pathname === '/api/v1/audit-logs/export') {
        return Promise.resolve(new Response('时间,动作\n2026-05-29,member_updated\n', { status: 200, headers: { 'Content-Type': 'text/csv;charset=utf-8' } }));
      }
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="operation-logs" />);

    expect(await screen.findByRole('heading', { name: '操作日志' })).toBeInTheDocument();
    expect(await screen.findByText('AI 预审完成')).toBeInTheDocument();
    expect(screen.getAllByText('ai_review_job_processed').length).toBeGreaterThan(0);
    expect(screen.getByText('MarkUp Agent')).toBeInTheDocument();
    expect(screen.getByText('AI 预审')).toBeInTheDocument();
    let lastUrl = fetchUrl(vi.mocked(fetch).mock.calls.at(-1)![0]);
    expect(lastUrl).toContain('/api/v1/audit-logs?team_id=team-1');
    expect(lastUrl).not.toContain('start_date=');
    expect(lastUrl).not.toContain('end_date=');
    expect(lastUrl).toContain('page_size=20');
    await user.type(screen.getByLabelText('搜索日志'), 'owner');
    await user.click(screen.getByRole('button', { name: /查\s*询/ }));
    lastUrl = latestCalledUrl('/api/v1/audit-logs?team_id=team-1');
    expect(lastUrl).toContain('/api/v1/audit-logs?team_id=team-1');
    expect(lastUrl).toContain('keyword=owner');
    expect(lastUrl).not.toContain('start_date=');
    expect(lastUrl).not.toContain('end_date=');
    expect(lastUrl).toContain('page_size=20');

    await user.click(screen.getByRole('button', { name: '查看详情' }));
    expect(await screen.findByText('字段 Diff')).toBeInTheDocument();
    expect(screen.getByText('req-ag...it-1')).toBeInTheDocument();
    expect(screen.getByText('agent_actor')).toBeInTheDocument();
    expect(screen.getAllByText('MarkUp Agent').length).toBeGreaterThan(0);
    expect(latestCalledUrl('/api/v1/audit-logs/log-agent-1')).toContain('/api/v1/audit-logs/log-agent-1');

    await user.click(screen.getByRole('button', { name: '导出日志' }));
    await user.click(await screen.findByRole('button', { name: '导出 CSV' }));
    expect(await screen.findByText('操作日志 CSV 已生成下载')).toBeInTheDocument();
    lastUrl = fetchUrl(vi.mocked(fetch).mock.calls.at(-1)![0]);
    expect(lastUrl).toContain('/api/v1/audit-logs/export?team_id=team-1');
    expect(lastUrl).toContain('export_format=csv');
    expect(lastUrl).toContain('keyword=owner');
    expect(lastUrl).not.toContain('start_date=');
    expect(lastUrl).not.toContain('end_date=');
  });

  it('renders enterprise personal account center without legacy admin registration flow', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      if (url.pathname === '/api/v1/profile/me') return apiResponse({ ...profilePayload, user: { ...adminSession.user, status: 'active' } });
      if (url.pathname === '/api/v1/auth/oauth/identities') return apiResponse({ items: [] });
      if (url.pathname === '/api/v1/teams/admin/overview') return apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] });
      if (url.pathname === '/api/v1/teams/team-1/members') return apiResponse(memberListPayload);
      return apiResponse(null);
    });

    render(<WorkspaceApp initialSession={adminSession} />);
    await user.click(screen.getByRole('button', { name: '账号管理' }));

    expect(await screen.findByRole('heading', { name: '账号管理' })).toBeInTheDocument();
    expect(screen.getByText('维护个人资料、登录安全、第三方绑定和企业身份摘要。企业信息、成员与资源配置仍在企业管理模块维护。')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '账号概览' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '企业与角色' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '通知偏好' })).not.toBeInTheDocument();
    expect(screen.queryByText('积分与资质')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '管理员注册页' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /企业成员页/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('搜索成员')).not.toBeInTheDocument();
  });

  it('keeps enterprise account center focused on personal account maintenance fields', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      if (url.pathname === '/api/v1/profile/me' && (!init || init.method === undefined)) {
        return apiResponse({
          ...profilePayload,
          user: { ...adminSession.user, status: 'active' },
          profile: {
            ...profilePayload.profile,
            display_name: 'Admin One',
            real_name: '李四',
            profession: '企业管理员',
          },
        });
      }
      if (url.pathname === '/api/v1/profile/me' && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body || '{}'));
        return apiResponse({
          ...profilePayload,
          user: { ...adminSession.user, status: 'active', avatar: body.avatar ?? null },
          profile: {
            ...profilePayload.profile,
            display_name: body.display_name,
            real_name: body.real_name,
            profession: body.profession,
            phone: body.phone,
            location: body.location,
            bio: body.bio,
          },
        });
      }
      if (url.pathname === '/api/v1/auth/oauth/identities') return apiResponse({ items: [{ provider: 'github', provider_user_id: 'gh-1', provider_username: 'admin01', provider_email: 'admin@example.com', provider_email_verified: true, linked_at: '2026-05-29T00:00:00Z' }] });
      if (url.pathname === '/api/v1/teams/admin/overview') return apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] });
      if (url.pathname === '/api/v1/teams/team-1/members') return apiResponse(memberListPayload);
      return apiResponse(null);
    });

    render(<WorkspaceApp initialSession={adminSession} />);
    await user.click(screen.getByRole('button', { name: '账号管理' }));

    expect(await screen.findByText('个人资料摘要')).toBeInTheDocument();
    expect(screen.getByText('登录与验证')).toBeInTheDocument();
    expect(screen.getByText('默认企业')).toBeInTheDocument();
    expect(screen.getByText('登录账号')).toBeInTheDocument();
    expect(screen.getByText('admin01')).toBeInTheDocument();
    expect(screen.getByText('已绑定第三方账号')).toBeInTheDocument();
    expect(screen.getByText('1 个')).toBeInTheDocument();
    expect(screen.queryByText('积分与资质')).not.toBeInTheDocument();
    expect(screen.queryByText('学历摘要')).not.toBeInTheDocument();
    expect(screen.queryByText('领域标签')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '企业与角色' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '基本资料' }));
    expect(await screen.findByLabelText('真实姓名')).toBeInTheDocument();
    expect(screen.getByLabelText('职位 / 岗位')).toBeInTheDocument();
    expect(screen.queryByLabelText('学历摘要')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('领域标签')).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('真实姓名'));
    await user.type(screen.getByLabelText('真实姓名'), '王五');
    await user.clear(screen.getByLabelText('职位 / 岗位'));
    await user.type(screen.getByLabelText('职位 / 岗位'), '项目经理');
    await user.click(screen.getByRole('button', { name: '保存基本资料' }));
    expect(await screen.findByText('基本资料已保存')).toBeInTheDocument();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/v1/profile/me',
      expect.objectContaining({
        method: 'PUT',
        body: expect.stringContaining('"real_name":"王五"'),
      }),
    );
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/v1/profile/me',
      expect.objectContaining({
        method: 'PUT',
        body: expect.stringContaining('"profession":"项目经理"'),
      }),
    );

    await user.click(screen.getByRole('tab', { name: '账号安全' }));
    await waitFor(() => expect(document.querySelector('.account-session-action .ant-btn')).toBeTruthy());
  });

  it('revokes other sessions from enterprise account security while keeping the current session', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      if (url.pathname === '/api/v1/profile/me') return apiResponse({ ...profilePayload, user: { ...adminSession.user, status: 'active' } });
      if (url.pathname === '/api/v1/auth/oauth/identities') return apiResponse({ items: [] });
      if (url.pathname === '/api/v1/teams/admin/overview') return apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] });
      if (url.pathname === '/api/v1/teams/team-1/members') return apiResponse(memberListPayload);
      if (url.pathname === '/api/v1/auth/sessions/revoke-others') {
        expect(init?.method).toBe('POST');
        expect(String(init?.body)).toContain(`"refresh_token":"${adminSession.refreshToken}"`);
        return apiResponse({ revoked_count: 2, kept_current_session: true });
      }
      return apiResponse(null);
    });

    render(<WorkspaceApp initialSession={adminSession} />);
    await user.click(screen.getByRole('button', { name: '账号管理' }));
    await user.click(await screen.findByRole('tab', { name: '账号安全' }));
    await waitFor(() => expect(document.querySelector('.account-session-action .ant-btn')).toBeTruthy());
    fireEvent.click(document.querySelector('.account-session-action .ant-btn')!);
    await waitFor(() => expect(document.querySelector('.ant-modal-confirm .ant-btn-primary')).toBeTruthy());
    fireEvent.click(document.querySelector('.ant-modal-confirm .ant-btn-primary')!);
    expect(await screen.findByText('已撤销 2 个其他会话')).toBeInTheDocument();
  });

  it('starts third-party binding from account management with bind_current_user intent', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      if (url.pathname === '/api/v1/profile/me') return apiResponse({ ...profilePayload, user: { ...adminSession.user, status: 'active' } });
      if (url.pathname === '/api/v1/auth/oauth/identities') return apiResponse({ items: [] });
      if (url.pathname === '/api/v1/teams/admin/overview') return apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] });
      if (url.pathname === '/api/v1/teams/team-1/members') return apiResponse(memberListPayload);
      return apiResponse(null);
    });

    render(<WorkspaceApp initialSession={adminSession} />);
    await user.click(screen.getByRole('button', { name: '账号管理' }));
    await user.click(await screen.findByRole('tab', { name: '第三方账号' }));

    const bindLinks = await screen.findAllByRole('link', { name: '发起绑定' });
    expect(bindLinks[0]).toHaveAttribute('href', '/api/v1/auth/oauth/github/start?intent=bind_current_user&redirect_after_login=%2Fworkspace%3Fpage%3Daccount');
  });

  it('keeps enterprise organization setup separate from the personal account center', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    const adminProfilePayload = {
      ...profilePayload,
      user: { ...adminSession.user, status: 'active' },
      profile: { ...profilePayload.profile, display_name: 'Admin One' },
    };
    vi.mocked(fetch).mockImplementation((input) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      if (url.pathname === '/api/v1/profile/me') return Promise.resolve(apiResponse(adminProfilePayload));
      if (url.pathname === '/api/v1/auth/oauth/identities') return Promise.resolve(apiResponse({ items: [] }));
      if (url.pathname === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [], default_team_id: null, team_count: 0, notifications: [] }));
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} />);
    await user.click(screen.getByRole('button', { name: '账号管理' }));

    expect(await screen.findByRole('heading', { name: '账号管理' })).toBeInTheDocument();

    cleanup();
    render(<WorkspaceApp initialSession={adminSession} page="people-management" />);
    expect(await screen.findByText('请先完成企业企业配置。')).toBeInTheDocument();
  });

  it('renders the standalone people management table with filters, detail, create and edit actions', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    const createdMember = { user_id: 'owner-2', username: 'owner02', display_name: 'Owner Two', email: 'owner2@example.com', team_role: 'owner', team_role_label: '任务发布者', permission_count: 6, assigned_task_count: 0, member_status: 'active', email_verified: true, actions: { can_edit: true, can_remove: true, can_disable: true }, joined_at: '2026-05-29T00:00:00Z' };
    vi.mocked(fetch).mockImplementation((input, init) => {
      const generatedInvitationPayload = {
        invite_code: 'TM-INV-123',
        invite_url: 'http://localhost:5173/onboarding?organization_action=join&invite_code=TM-INV-123',
        expire_at: '2026-06-01T00:00:00Z',
        invite_mode: 'code',
        email: null,
      };
      const url = new URL(fetchUrl(input), 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url.pathname === '/api/v1/teams/team-1/members/accounts') return Promise.resolve(apiResponse(createdMember));
      if (url.pathname === '/api/v1/teams/team-1/invite' && init?.method === 'POST') return Promise.resolve(apiResponse(generatedInvitationPayload));
      if (url.pathname === '/api/v1/teams/team-1/members/owner-1' && init?.method === 'PUT') return Promise.resolve(apiResponse({ ...memberListPayload.items[1], team_role: 'reviewer', team_role_label: '审核员', permission_count: 4 }));
      if (url.pathname === '/api/v1/teams/team-1/members/batch-role') return Promise.resolve(apiResponse({
        requested_count: 2,
        updated_count: 2,
        skipped_count: 0,
        target_role: 'reviewer',
        results: ['owner-1', 'reviewer-1'].map((user_id) => ({ user_id, status: 'updated', to_role: 'reviewer' })),
        members: memberListPayload.items.slice(1, 3).map((item) => ({ ...item, team_role: 'reviewer', team_role_label: '审核员', permission_count: 4, actions: { can_edit: true, can_remove: true, can_disable: true } })),
      }));
      if (url.pathname === '/api/v1/teams/team-1/members/import') return Promise.resolve(apiResponse({
        requested_count: 1,
        imported_count: 1,
        skipped_count: 0,
        results: [{ row: 1, email: 'labeler3@example.com', user_id: 'labeler-3', status: 'imported', team_role: 'labeler' }],
        members: [{ user_id: 'labeler-3', username: 'labeler03', display_name: 'Labeler Three', email: 'labeler3@example.com', team_role: 'labeler', team_role_label: '标注员', permission_count: 3, assigned_task_count: 0, member_status: 'active', email_verified: true, actions: { can_edit: true, can_remove: true, can_disable: true }, joined_at: '2026-05-29T00:00:00Z' }],
      }));
      if (url.pathname === '/api/v1/teams/team-1/members/security-reminders') return Promise.resolve(apiResponse({
        requested_count: 2,
        sent_count: 2,
        skipped_count: 0,
        results: ['owner-1', 'reviewer-1'].map((user_id) => ({ user_id, status: 'sent' })),
        notification: { notification_id: 'notice-security', team_id: 'team-1', title: '账号安全提醒', content: '请尽快检查账号安全设置。', notification_type: 'team', priority: 'important', target_type: 'member', target_roles: [], target_user_ids: ['owner-1', 'reviewer-1'], status: 'unread', is_read: false, is_handled: false, read_count: 0, handled_count: 0, email_enabled: false, in_app_enabled: true },
      }));
      if (url.pathname.startsWith('/api/v1/teams/team-1/members/') && init?.method === 'DELETE') return Promise.resolve(apiResponse(null));
      if (url.pathname === '/api/v1/teams/team-1/invitations/invite-1/resend') {
        return Promise.resolve(apiResponse({
          ...invitationListPayload.items[0],
          invite_code: 'invite-2',
          invite_url: 'http://localhost:5173/onboarding?organization_action=join&invite_code=invite-2',
          expire_at: '2026-06-01T00:00:00Z',
        }));
      }
      if (url.pathname === '/api/v1/teams/team-1/invitations/invite-1/revoke') return Promise.resolve(apiResponse(revokedInvitationPayload));
      if (url.pathname === '/api/v1/teams/team-1/invitations') return Promise.resolve(apiResponse(invitationListPayload));
      if (url.pathname === '/api/v1/teams/team-1/members') {
        return Promise.resolve(apiResponse(memberListPayload));
      }
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="people-management" />);

    expect(await screen.findByRole('heading', { name: '人员管理' })).toBeInTheDocument();
    expect(await screen.findByText('Owner One')).toBeInTheDocument();
    expect(screen.getByText('Reviewer One')).toBeInTheDocument();
    expect(screen.getAllByText('Agent').length).toBeGreaterThan(0);
    expect(screen.queryByText('2FA')).not.toBeInTheDocument();
    expect(screen.queryByText('AI资源管理员')).not.toBeInTheDocument();
    expect(screen.queryByText('系统 Agent')).not.toBeInTheDocument();
    expect(screen.queryByText('只读')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('搜索成员'), { target: { value: 'owner' } });
    await user.click(screen.getByLabelText('角色筛选'));
    await user.click(await screen.findByTitle('Owner'));
    expect(vi.mocked(fetch)).toHaveBeenLastCalledWith('/api/v1/teams/team-1/members?status=active&role=owner&keyword=owner', expect.any(Object));

    await user.click(screen.getByText('Owner One'));
    expect(await screen.findByText('成员详情')).toBeInTheDocument();
    expect(screen.getByText('owner01')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: '添加成员' }));
    await user.type(await screen.findByLabelText('登录账号'), 'owner02');
    await user.type(screen.getByLabelText('显示名'), 'Owner Two');
    await user.type(screen.getByRole('textbox', { name: '邮箱' }), 'owner2@example.com');
    await user.click(screen.getByRole('button', { name: '创建成员账号' }));
    expect(await screen.findByText('成员账号已创建')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /编\s*辑/ }).find((button) => !button.hasAttribute('disabled'))!);
    fireEvent.mouseDown(screen.getAllByLabelText('成员角色').at(-1)!);
    await user.click((await screen.findAllByTitle('Reviewer')).at(-1)!);
    await user.click(screen.getByRole('button', { name: '保存成员变更' }));
    expect(await screen.findByText('成员信息已更新')).toBeInTheDocument();
    await user.click(screen.getAllByRole('checkbox').find((checkbox) => !checkbox.hasAttribute('disabled'))!);
    expect(await screen.findByText(/已选择 2 名成员/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '批量改角色' }));
    expect(await screen.findByText('批量修改成员角色')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '确认修改' }));
    expect(await screen.findByText('已批量更新 2 名成员角色')).toBeInTheDocument();
    await user.click(screen.getAllByRole('checkbox').find((checkbox) => !checkbox.hasAttribute('disabled'))!);
    expect(await screen.findByText(/已选择 2 名成员/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '发送安全提醒' }));
    await waitFor(() => expect(screen.getAllByText('发送安全提醒').length).toBeGreaterThan(1));
    await user.click(screen.getByRole('button', { name: '发送提醒' }));
    expect(await screen.findByText('已发送安全提醒给 2 名成员')).toBeInTheDocument();
    await user.click(screen.getAllByRole('checkbox').find((checkbox) => !checkbox.hasAttribute('disabled'))!);
    await user.click(screen.getByRole('button', { name: '批量移除' }));
    await user.click(screen.getAllByRole('button', { name: '批量移除' }).at(-1)!);
    expect(await screen.findByText('已移除 2 名成员')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '更多成员操作' }));
    await user.click(await screen.findByText('批量导入成员'));
    expect(await screen.findByText('按 CSV 文本导入成员')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('成员 CSV'));
    await user.type(screen.getByLabelText('成员 CSV'), 'email,role,username,display_name,password\nlabeler3@example.com,labeler,labeler03,Labeler Three,SecurePass123!');
    await user.click(screen.getByRole('button', { name: '导入成员' }));
    expect(await screen.findByText('已导入 1 名成员')).toBeInTheDocument();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/v1/teams/team-1/members/import', expect.objectContaining({ method: 'POST' }));

    await user.click(screen.getByRole('button', { name: '更多成员操作' }));
    fireEvent.click((await screen.findAllByRole('menuitem', { name: '查看邀请记录' })).at(-1)!);
    expect(await screen.findByText('邀请记录')).toBeInTheDocument();
    expect(await screen.findByText('reviewer2@example.com')).toBeInTheDocument();
  }, 90000);

  it('renders owner organization pages as information-only views', async () => {
    persistSession({
      access_token: teamOwnerSession.accessToken,
      refresh_token: teamOwnerSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: teamOwnerSession.user,
    });
    vi.mocked(fetch).mockImplementation((input) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      if (url.pathname === '/api/v1/teams/team-1') return Promise.resolve(apiResponse(teamDetail));
      if (url.pathname === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url.pathname === '/api/v1/teams/team-1/members') return Promise.resolve(apiResponse(memberListPayload));
      return Promise.resolve(apiResponse(null));
    });

    const { rerender } = render(<WorkspaceApp initialSession={teamOwnerSession} page="organization-info" />);

    expect(await screen.findByRole('heading', { name: '企业信息' })).toBeInTheDocument();
    expect(screen.getByText('你当前只能查看企业资料，没有企业资料编辑权限。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑资料' })).not.toBeInTheDocument();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/v1/teams/team-1', expect.any(Object));

    rerender(<WorkspaceApp initialSession={teamOwnerSession} page="people-management" />);

    expect(await screen.findByRole('heading', { name: '人员管理' })).toBeInTheDocument();
    expect(await screen.findByText('Owner One')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '添加成员' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '更多成员操作' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /编\s*辑/ })).not.toBeInTheDocument();
  });

  it('supports invite-code flow and hides 2FA from people management', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    const generatedInvitationPayload = {
      invite_code: 'TM-INV-123',
      invite_url: 'http://localhost:5173/onboarding?organization_action=join&invite_code=TM-INV-123',
      expire_at: '2026-06-01T00:00:00Z',
      invite_mode: 'code',
      email: null,
    };
    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url.pathname === '/api/v1/teams/team-1/members') return Promise.resolve(apiResponse(memberListPayload));
      if (url.pathname === '/api/v1/teams/team-1/invite' && init?.method === 'POST') return Promise.resolve(apiResponse(generatedInvitationPayload));
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="people-management" />);

    expect(await screen.findByText('Owner One')).toBeInTheDocument();
    expect(screen.queryByText('2FA')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /添加成员|娣诲姞鎴愬憳/ }));
    await user.click(screen.getByText(/邀请码邀请|閭€璇风爜閭€璇/));
    await user.click(screen.getByRole('button', { name: /生成邀请码|鐢熸垚閭€璇风爜/ }));

    expect(await screen.findByDisplayValue('TM-INV-123')).toBeInTheDocument();
    expect(screen.getByDisplayValue('http://localhost:5173/onboarding?organization_action=join&invite_code=TM-INV-123')).toBeInTheDocument();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/v1/teams/team-1/invite', expect.objectContaining({ method: 'POST' }));
  });

  it('uses default_team_id and keeps manage actions visible after an empty filter result', async () => {
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    const secondTeam = { ...teamDetail, team_id: 'team-2', company_name: 'Second Team' };
    vi.mocked(fetch).mockImplementation((input) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') {
        return Promise.resolve(apiResponse({ teams: [teamDetail, secondTeam], default_team_id: 'team-2', team_count: 2, notifications: [] }));
      }
      if (url.pathname === '/api/v1/teams/team-2/members' && url.searchParams.get('keyword') === 'nobody') {
        return Promise.resolve(apiResponse({ items: [], pagination: { page: 1, page_size: 100, total: 0, total_pages: 1 } }));
      }
      if (url.pathname === '/api/v1/teams/team-2/members') {
        return Promise.resolve(apiResponse(memberListPayload));
      }
      if (url.pathname === '/api/v1/teams/team-1/members') {
        throw new Error('should use default team members instead of first team');
      }
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="people-management" />);

    expect(await screen.findByText('当前企业：Second Team')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('搜索成员'), { target: { value: 'nobody' } });
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/v1/teams/team-2/members?status=active&keyword=nobody', expect.any(Object)));
    expect(screen.getByRole('button', { name: '添加成员' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '更多成员操作' })).toBeInTheDocument();
    expect(screen.getByText('当前筛选')).toBeInTheDocument();
  });

  it('resends team invitations and exposes the revoke row action from people management', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation((input) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url.pathname === '/api/v1/teams/team-1/members') return Promise.resolve(apiResponse(memberListPayload));
      if (url.pathname === '/api/v1/teams/team-1/invitations/invite-1/resend') {
        return Promise.resolve(apiResponse({
          ...invitationListPayload.items[0],
          invite_mode: 'code',
          email: null,
          invite_code: 'invite-2',
          invite_url: 'http://localhost:5173/onboarding?organization_action=join&invite_code=invite-2',
          expire_at: '2026-06-01T00:00:00Z',
        }));
      }
      if (url.pathname === '/api/v1/teams/team-1/invitations/invite-1/revoke') return Promise.resolve(apiResponse(revokedInvitationPayload));
      if (url.pathname === '/api/v1/teams/team-1/invitations') {
        return Promise.resolve(apiResponse({
          items: [{ ...invitationListPayload.items[0], invite_mode: 'code', email: null }],
          pagination: invitationListPayload.pagination,
        }));
      }
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="people-management" />);

    expect(await screen.findByRole('heading', { name: '人员管理' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '更多成员操作' }));
    await user.click(await screen.findByText('查看邀请记录'));
    expect(await screen.findByRole('button', { name: '重新生成邀请码' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重新生成邀请码' }));
    expect(await screen.findByDisplayValue('invite-2')).toBeInTheDocument();
    expect(screen.getByDisplayValue('http://localhost:5173/onboarding?organization_action=join&invite_code=invite-2')).toBeInTheDocument();
    fireEvent.click(document.body);
    await clickWorkspaceMoreMenuItem(user, '撤销邀请');
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/v1/teams/team-1/invitations/invite-1/resend', expect.objectContaining({ method: 'POST' }));
  }, 40000);

  it('opens operation logs from people management with member filter', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation((input) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url.pathname === '/api/v1/teams/team-1/members') return Promise.resolve(apiResponse(memberListPayload));
      if (url.pathname === '/api/v1/audit-logs') return Promise.resolve(apiResponse({ items: [auditLogPayload], pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 } }));
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceHarness initialPage="people-management" />);

    expect(await screen.findByRole('heading', { name: '人员管理' })).toBeInTheDocument();
    await user.click(await screen.findByText('Owner One'));
    await user.click(await screen.findByRole('button', { name: '查看成员操作日志' }));
    expect(await screen.findByRole('heading', { name: '操作日志' })).toBeInTheDocument();
    expect(screen.getByLabelText('来源筛选')).toBeInTheDocument();
    expect(screen.getByText('实体：成员')).toBeInTheDocument();
    expect(screen.getByText('对象标识：owner-1')).toBeInTheDocument();

    const calledUrls = vi.mocked(fetch).mock.calls.map(([input]) => fetchUrl(input));
    expect(calledUrls.some((url) => url.includes('/api/v1/audit-logs') && url.includes('entity_type=team_member') && url.includes('entity_id=owner-1'))).toBe(true);
    await user.click(screen.getByRole('button', { name: '清除来源筛选' }));
    const lastUrl = fetchUrl(vi.mocked(fetch).mock.calls.at(-1)![0]);
    expect(lastUrl).toContain('/api/v1/audit-logs?team_id=team-1');
    expect(lastUrl).not.toContain('start_date=');
    expect(lastUrl).not.toContain('end_date=');
    expect(lastUrl).toContain('page_size=20');
    expect(lastUrl).not.toContain('entity_type=team_member');
    expect(lastUrl).not.toContain('entity_id=owner-1');
  });

  it('opens operation logs from workspace URL query and preserves filters', async () => {
    window.history.pushState(null, '', '/workspace?page=operation-logs&entity_type=team_member&entity_id=owner-1&keyword=owner&risk_level=high&start_date=2026-05-01&end_date=2026-05-29');
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation((input) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url.pathname === '/api/v1/audit-logs') return Promise.resolve(apiResponse({ items: [auditLogPayload], pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 } }));
      return Promise.resolve(apiResponse(null));
    });

    render(<App />);

    await waitFor(() => {
      const calledUrls = vi.mocked(fetch).mock.calls.map(([input]) => fetchUrl(input));
      expect(calledUrls.some((url) => (
        url.includes('/api/v1/audit-logs')
        && url.includes('entity_type=team_member')
        && url.includes('entity_id=owner-1')
        && url.includes('keyword=owner')
        && url.includes('risk_level=high')
        && url.includes('start_date=2026-05-01')
        && url.includes('end_date=2026-05-29')
      ))).toBe(true);
    });
  });

  it('treats legacy agent rows without is_system_member as read-only system agents', async () => {
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    const legacyAgentPayload = {
      ...memberListPayload,
      items: memberListPayload.items.map((item) => (
        item.user_id === 'agent-1'
          ? {
            ...item,
            is_system_member: undefined,
            actions: { can_edit: true, can_remove: true, can_disable: true },
          }
          : item
      )),
    };
    vi.mocked(fetch).mockImplementation((input) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url.pathname === '/api/v1/teams/team-1/members') return Promise.resolve(apiResponse(legacyAgentPayload));
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="people-management" />);

    expect(await screen.findByRole('heading', { name: '人员管理' })).toBeInTheDocument();
    expect(screen.getAllByText('Agent').length).toBeGreaterThan(0);
    expect(screen.queryByText('AI资源管理员')).not.toBeInTheDocument();
    expect(screen.queryByText('系统 Agent')).not.toBeInTheDocument();
    expect(screen.queryByText('只读')).not.toBeInTheDocument();

    const agentNameCell = screen.getByText('Agent', { selector: 'strong' });
    const agentRow = agentNameCell.closest('tr');
    expect(agentRow).toBeTruthy();
    expect(within(agentRow as HTMLElement).getByRole('button', { name: '编 辑' })).toBeDisabled();
    expect(within(agentRow as HTMLElement).getByRole('button', { name: '更 多' })).toBeInTheDocument();

    const selectableCheckboxes = screen.getAllByRole('checkbox').filter((checkbox) => !checkbox.hasAttribute('disabled') && checkbox.hasAttribute('name'));
    expect(selectableCheckboxes.length).toBe(2);
  });

  it('saves personal profile and submits certification forms for labelers', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: labelerSession.accessToken,
      refresh_token: labelerSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: labelerSession.user,
    });
    const educationDocument = { file_id: 'basic-report', url: '/api/v1/profile/certifications/materials/basic-report', filename: 'report.pdf', content_type: 'application/pdf', category: 'verification', size: 12 };
    const educationDocumentAgain = { ...educationDocument, file_id: 'basic-report-2', url: '/api/v1/profile/certifications/materials/basic-report-2' };
    const professionalDocument = { file_id: 'license-doc', url: '/api/v1/profile/certifications/materials/license-doc', filename: 'license.png', content_type: 'image/png', category: 'verification', size: 12 };
    const professionalDocumentAgain = { ...professionalDocument, file_id: 'license-doc-2', url: '/api/v1/profile/certifications/materials/license-doc-2' };
    const updatedProfile = {
      ...profilePayload,
      profile: { ...profilePayload.profile, education_summary: '硕士', education_school: '上海大学', education_report_mode: 'chsi', education_report_documents: [{ ...educationDocumentAgain, type: 'chsi_report' }] },
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(apiResponse(profilePayload))
      .mockResolvedValueOnce(apiResponse(educationDocument))
      .mockResolvedValueOnce(apiResponse(educationDocumentAgain))
      .mockResolvedValueOnce(apiResponse(updatedProfile))
      .mockResolvedValueOnce(apiResponse(profilePayload))
      .mockResolvedValueOnce(apiResponse(professionalDocument))
      .mockResolvedValueOnce(apiResponse(professionalDocumentAgain))
      .mockResolvedValueOnce(apiResponse({ cert_id: 'cert-3', cert_category: 'domain', cert_type: '执业律师', cert_name: '执业律师', status: 'pending_review', provider: 'markup', submitted_data: {}, documents: [], created_at: '2026-05-26T00:00:00Z' }));

    render(<WorkspaceApp initialSession={labelerSession} />);
    expect(await screen.findByText('欢迎加入 MarkUp 数据平台!')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '身份信息' })).toBeInTheDocument();
    expect(screen.getByLabelText('身份证号')).toHaveAttribute('placeholder', '测试字段，不会保存');
    expect(screen.queryByText(/你是通过什么方式/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '学信网验证报告' })).not.toBeInTheDocument();
    expect(screen.queryByText(/基础资料完成度/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('最高学历就读院校')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('实名信息'), '张三');
    await user.type(screen.getByLabelText('身份证号'), '110101199001011234');
    await user.clear(screen.getByLabelText('电话号码'));
    await user.type(screen.getByLabelText('电话号码'), '13800138000');
    await user.click(screen.getByRole('button', { name: '提交身份信息' }));
    await waitFor(() => expect(screen.queryByLabelText('实名信息')).not.toBeInTheDocument());
    expect(screen.getByLabelText('最高学历就读院校')).toBeEnabled();
    expect(screen.getAllByRole('link', { name: '学信网验证报告' })[0]).toHaveClass('plain-report-link');
    expect(screen.getAllByRole('link', { name: '学信网验证报告' })[1]).toHaveAttribute('href', 'https://www.chsi.com.cn/xlcx/rhsq.jsp');
    await user.click(screen.getByRole('button', { name: '无学信网报告，选择非学信网学历认证' }));
    expect(screen.getByRole('button', { name: '返回学信网认证' })).toBeInTheDocument();
    expect(screen.getByText('非学信网学历认证材料')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '返回学信网认证' }));

    await user.click(screen.getByRole('button', { name: '提交' }));
    expect(await screen.findByText('请选择毕业院校')).toBeInTheDocument();
    expect(screen.getByText('请上传学历认证材料')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '硕士' }));
    await user.type(screen.getByLabelText('最高学历就读院校'), '上海大学');
    expect(await screen.findByText('上海大学')).toBeInTheDocument();
    await user.upload(screen.getByLabelText('学信网验证报告上传'), new File(['report'], 'report.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText('report.pdf')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '删除 report.pdf' }));
    expect(screen.queryByText('report.pdf')).not.toBeInTheDocument();
    await user.upload(screen.getByLabelText('学信网验证报告上传'), new File(['report-again'], 'report.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText('report.pdf')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '提交' }));
    expect(await screen.findByText('个人资料已保存')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '资质认证' }));
    expect(await screen.findByRole('heading', { name: '认证记录' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '卡片视图' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '列表视图' }));
    expect(screen.getByRole('table', { name: '认证记录列表' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '添加认证' }));
    expect(await screen.findByRole('heading', { name: '职业资质信息' })).toBeInTheDocument();
    expect(screen.getByLabelText('昵称')).toHaveValue('Labeler One');
    const submitApplication = screen.getByRole('button', { name: '提交申请' });
    expect(submitApplication).toBeDisabled();

    await user.type(screen.getByLabelText('真实姓名'), '张三');
    await user.selectOptions(screen.getByLabelText('行业领域'), 'judicial');
    await user.selectOptions(screen.getByLabelText('职业身份'), '执业律师');
    expect(screen.queryByText('资质展示类型')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('工作单位'), '上海某律师事务所');
    await user.type(screen.getByLabelText('科室/学科/职位'), '合伙人律师');
    await user.type(screen.getByLabelText('登记编号'), 'A12345');
    await user.upload(screen.getByLabelText('专业资质上传'), new File(['license'], 'license.png', { type: 'image/png' }));
    expect(await screen.findByText('license.png')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '删除 license.png' }));
    expect(screen.queryByText('license.png')).not.toBeInTheDocument();
    await user.upload(screen.getByLabelText('专业资质上传'), new File(['license-again'], 'license.png', { type: 'image/png' }));
    expect(await screen.findByText('license.png')).toBeInTheDocument();
    expect(submitApplication).toBeDisabled();
    await user.click(screen.getByLabelText('我已同意 MarkUp 数据平台用户使用协议'));
    expect(submitApplication).toBeEnabled();
    await user.click(submitApplication);
    expect(await screen.findByText('领域认证已提交，等待审核')).toBeInTheDocument();
  });

  it('opens professional certification guide and user agreement pages', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    persistSession({
      access_token: labelerSession.accessToken,
      refresh_token: labelerSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: labelerSession.user,
    });
    vi.mocked(fetch).mockResolvedValue(apiResponse(profilePayload));

    render(<WorkspaceApp initialSession={labelerSession} />);

    await user.click(screen.getByRole('button', { name: '资质认证' }));
    const addCertification = await screen.findByRole('button', { name: '添加认证' }).catch(() => null);
    if (addCertification) await user.click(addCertification);
    expect(await screen.findByRole('heading', { name: '职业资质信息' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '查看资质认证说明' }));
    expect(openSpy).toHaveBeenCalledWith('/workspace?page=certification-rules', '_blank', 'noopener,noreferrer');

    await user.click(screen.getByRole('button', { name: '《MarkUp 数据平台用户使用协议》' }));
    expect(openSpy).toHaveBeenCalledWith('/workspace?page=certification-user-agreement', '_blank', 'noopener,noreferrer');
  });

  it('shows labeler points income overview', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    persistSession({
      access_token: labelerSession.accessToken,
      refresh_token: labelerSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: labelerSession.user,
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(apiResponse(profilePayload))
      .mockResolvedValueOnce(apiResponse({
        wallet: { total_points: 320, available_points: 280, level: 'silver' },
        overview: { total_points: 320, available_points: 280, settled_points: 340, pending_points: 0, spent_points: 60, today_points: 30, month_points: 120, level: 'silver', next_level_gap: 680, updated_at: '2026-05-26T00:00:00Z' },
        items: [
          { ledger_id: 'gain-1', reason: '任务奖励', change: 30, balance_after: 280, created_at: '2026-05-26T00:00:00Z' },
          { ledger_id: 'cost-1', reason: '权益兑换', change: -10, balance_after: 250, created_at: '2026-05-25T00:00:00Z' },
        ],
    }));

    render(<WorkspaceApp initialSession={labelerSession} />);
    await user.click(screen.getByRole('button', { name: '积分管理' }));
    expect(await screen.findByText('累计收入')).toBeInTheDocument();
    expect(screen.getByText('本月收入累计')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '邀请好友' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '未绑定银行卡 →' }));
    expect(await screen.findByRole('dialog', { name: '绑定银行卡' })).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('请搜索并选择要绑定的银行支行名称'), '上海');
    expect(await screen.findByRole('button', { name: '中国工商银行上海人民广场支行' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '关闭提现方式' }));
    expect(screen.getByText('120')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '等级 silver' }));
    expect(openSpy).toHaveBeenCalledWith('/workspace?page=points-level-rules', '_blank', 'noopener,noreferrer');
    expect(screen.getByText('暂无数据，请先认领高报酬任务')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1' })).toHaveClass('active');
    expect(screen.queryByRole('link', { name: '查看任务奖励' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '提现明细' }));
    expect(screen.getByRole('table', { name: '提现明细' })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /任务奖励/ })).not.toBeInTheDocument();
  });

  it('imports and previews enterprise datasets', async () => {
    const user = userEvent.setup();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    let importedDataset: DatasetPayload | null = null;
    const buildImportedDataset = (): DatasetPayload => ({
      ...datasetPayload,
      media_assets: [
        { filename: 'cover.png', url: 'https://cdn.example.com/cover.png', type: 'image', media_type: 'image', size: 24 },
        { filename: 'voice.mp3', url: 'uploaded://voice.mp3', type: 'audio', media_type: 'audio', size: 8 },
        { filename: 'demo.mp4', url: 'https://cdn.example.com/demo.mp4', type: 'video', media_type: 'video', size: 48 },
      ],
      preview_rows: [
        {
          title: '合同条款',
          image_url: 'https://cdn.example.com/img.png',
          media: [
            { id: 'row-image', type: 'image', media_type: 'image', role: 'primary', field: 'image_url', url: 'https://cdn.example.com/img.png', name: '封面图', status: 'ready' },
            { id: 'row-audio', type: 'audio', media_type: 'audio', role: 'context', field: 'voice_url', url: 'uploaded://voice.mp3', name: '语音说明', status: 'ready' },
            { id: 'row-video', type: 'video', media_type: 'video', role: 'evidence', field: 'video_url', url: 'https://cdn.example.com/demo.mp4', name: '示例视频', status: 'ready' },
          ],
        },
      ],
      rows: [
        {
          title: '合同条款',
          image_url: 'https://cdn.example.com/img.png',
          media: [
            { id: 'row-image', type: 'image', media_type: 'image', role: 'primary', field: 'image_url', url: 'https://cdn.example.com/img.png', name: '封面图', status: 'ready' },
            { id: 'row-audio', type: 'audio', media_type: 'audio', role: 'context', field: 'voice_url', url: 'uploaded://voice.mp3', name: '语音说明', status: 'ready' },
            { id: 'row-video', type: 'video', media_type: 'video', role: 'evidence', field: 'video_url', url: 'https://cdn.example.com/demo.mp4', name: '示例视频', status: 'ready' },
          ],
        },
      ],
    });
    vi.mocked(fetch).mockImplementation((input, init) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost').pathname;
      const method = init?.method ?? 'GET';
      if (url === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url === '/api/v1/datasets' && method === 'GET') return Promise.resolve(apiResponse({ items: importedDataset ? [importedDataset] : [], pagination: { page: 1, page_size: 1, total: importedDataset ? 1 : 0, total_pages: 1 } }));
      if (url === '/api/v1/datasets' && method === 'POST') {
        importedDataset = buildImportedDataset();
        return Promise.resolve(apiResponse(importedDataset));
      }
      if (url === '/api/v1/datasets/dataset-1' && method === 'GET') return Promise.resolve(apiResponse(importedDataset ?? buildImportedDataset()));
      if (url === '/api/v1/datasets/dataset-1' && method === 'PUT') {
        const base = importedDataset ?? buildImportedDataset();
        return Promise.resolve(apiResponse({
          ...base,
          columns: [
            ...base.columns,
            { name: 'display_title', data_type: 'text', samples: ['合同：合同条款'], comment: '发布映射标题', use_in_mapping: true, derived: true, source_column: 'title', expression: '合同：{value}' },
          ],
          preview_rows: base.preview_rows.map((row) => ({ ...row, display_title: '合同：合同条款' })),
          rows: (base.rows ?? []).map((row) => ({ ...row, display_title: '合同：合同条款' })),
        }));
      }
      if (url === '/api/v1/datasets/dataset-1/download' && method === 'GET') return Promise.resolve(new Response('{"title":"合同条款"}', { status: 200 }));
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="datasets" />);

    expect(await screen.findByRole('heading', { name: '数据集管理' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /导入数据集/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.type(screen.getByLabelText('数据集名称'), '混合素材数据集');
    const uploadInputs = document.querySelectorAll('.dataset-upload-dragger input[type="file"]');
    await user.upload(uploadInputs[0] as HTMLInputElement, new File(['title,image_url\n合同条款,https://cdn.example.com/img.png\n'], 'items.csv', { type: 'text/csv' }));
    await user.upload(uploadInputs[1] as HTMLInputElement, new File(['audio'], 'voice.mp3', { type: 'audio/mpeg' }));
    await user.click(screen.getByRole('button', { name: '导入并解析' }));

    expect(await screen.findByText('混合素材数据集')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /修\s*改/ }));
    expect(await screen.findByRole('heading', { name: /混合素材数据集/ })).toBeInTheDocument();
    expect(screen.getAllByText('title').length).toBeGreaterThan(1);
    expect(screen.getAllByText('image_url').length).toBeGreaterThan(1);
    await user.click(screen.getByRole('tab', { name: '多模态素材' }));
    expect((await screen.findAllByText('voice.mp3')).length).toBeGreaterThan(0);
    const mediaManagement = document.querySelector('.dataset-media-management') as HTMLElement;
    expect(mediaManagement).toBeTruthy();
    expect(document.querySelectorAll('.dataset-media-panel .dataset-media-scroll').length).toBeGreaterThan(0);
    const rowMediaPreview = document.querySelector('[aria-label="行级媒体预览"]') as HTMLElement;
    expect(rowMediaPreview).toBeTruthy();
    expect(mediaManagement.querySelector('.workspace-media-preview__image')).toBeTruthy();
    expect(mediaManagement.querySelector('.workspace-media-preview.is-audio')).toBeTruthy();
    expect(mediaManagement.querySelector('.workspace-media-preview.is-video')).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: 'AI / 审核上下文' }));
    expect(await screen.findByText('纯文本降级上下文')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: '渲染变量' }));
    await user.click(screen.getByRole('button', { name: '新增渲染变量' }));
    expect(await screen.findByLabelText('变量名')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('变量名'));
    await user.type(screen.getByLabelText('变量名'), 'display_title');
    await user.click(screen.getByLabelText('来源列'));
    await user.click(await screen.findByTitle('title'));
    fireEvent.change(screen.getByLabelText('表达式'), { target: { value: '合同：{value}' } });
    expect(screen.getAllByText('合同：合同条款').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: '添加变量' }));
    expect((await screen.findAllByText('display_title')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('display_title').length).toBeGreaterThan(1);
    await user.click(screen.getByRole('tab', { name: '字段管理' }));
    expect(screen.getByDisplayValue('发布映射标题')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /导\s*出/ }).at(-1)!);
    await user.click(await screen.findByText('下载 JSONL'));
    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.some((call) => {
        const rawUrl = typeof call[0] === 'string' ? call[0] : call[0] instanceof URL ? call[0].toString() : call[0].url;
        return rawUrl.includes('/api/v1/datasets/dataset-1/download?format=jsonl');
      })).toBe(true);
    });
    const updateCall = vi.mocked(fetch).mock.calls.find((call) => {
      const rawUrl = typeof call[0] === 'string' ? call[0] : call[0] instanceof URL ? call[0].toString() : call[0].url;
      if (!rawUrl.includes('/api/v1/datasets/dataset-1') || call[1]?.method !== 'PUT') return false;
      const body = JSON.parse(String(call[1]?.body ?? '{}'));
      return Array.isArray(body.derived_columns);
    });
    const updateBody = JSON.parse(String(updateCall?.[1]?.body));
    expect(updateBody.derived_columns[0]).toMatchObject({ name: 'display_title', source_column: 'title', expression: '合同：{value}' });
  });

  it('keeps dataset card actions inside the card without table edit shortcut', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = new URL(fetchUrl(input), 'http://localhost').pathname;
      const method = init?.method ?? 'GET';
      if (url === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url === '/api/v1/datasets' && method === 'GET') return Promise.resolve(apiResponse({ items: [datasetPayload], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } }));
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="datasets" />);

    expect(await screen.findByRole('heading', { name: '数据集管理' })).toBeInTheDocument();
    await user.click(screen.getByText('卡片'));

    const card = await screen.findByText(datasetPayload.name);
    const actionBar = card.closest('.production-card')?.querySelector('.dataset-card-actions');
    expect(actionBar).toBeTruthy();
    expect(within(actionBar as HTMLElement).getByRole('button', { name: /修改/ })).toBeInTheDocument();
    expect(within(actionBar as HTMLElement).getByRole('button', { name: /导出/ })).toBeInTheDocument();
    expect(within(actionBar as HTMLElement).getByRole('button', { name: /删除/ })).toBeInTheDocument();
    expect(within(actionBar as HTMLElement).queryByRole('button', { name: /表格编辑/ })).not.toBeInTheDocument();
    expect((actionBar as HTMLElement).querySelectorAll('button')).toHaveLength(3);
  });

  it('does not submit non-media files as dataset media assets during import', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation((input, init) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost').pathname;
      const method = init?.method ?? 'GET';
      if (url === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url === '/api/v1/datasets' && method === 'GET') return Promise.resolve(apiResponse({ items: [], pagination: { page: 1, page_size: 20, total: 0, total_pages: 1 } }));
      if (url === '/api/v1/datasets' && method === 'POST') return Promise.resolve(apiResponse(datasetPayload));
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="datasets" />);

    expect(await screen.findByRole('heading', { name: '数据集管理' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '导入数据集' }));
    await user.type(screen.getByLabelText('数据集名称'), '混合素材数据集');
    const uploadInputs = document.querySelectorAll('.dataset-upload-dragger input[type="file"]');
    await user.upload(uploadInputs[0] as HTMLInputElement, new File(['title\n合同条款\n'], 'items.csv', { type: 'text/csv' }));
    fireEvent.change(uploadInputs[1], { target: { files: [new File(['%PDF-1.7'], 'manual.pdf', { type: 'application/pdf' })] } });
    await user.click(screen.getByRole('button', { name: '导入并解析' }));

    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([input, init]) => fetchUrl(input) === '/api/v1/datasets' && init?.method === 'POST')).toBe(true));
    const createCall = vi.mocked(fetch).mock.calls.find(([input, init]) => fetchUrl(input) === '/api/v1/datasets' && init?.method === 'POST');
    const body = createCall?.[1]?.body as FormData;
    expect(body.getAll('media_files')).toHaveLength(0);
  });

  it('does not submit non-media files as dataset media assets during patch upload', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation((input, init) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost').pathname;
      const method = init?.method ?? 'GET';
      if (url === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url === '/api/v1/datasets' && method === 'GET') return Promise.resolve(apiResponse({ items: [datasetPayload], pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 } }));
      if (url === '/api/v1/datasets/dataset-1' && method === 'GET') return Promise.resolve(apiResponse({ ...datasetPayload, rows: [{ title: '合同条款' }] }));
      if (url === '/api/v1/datasets/dataset-1/patch-upload' && method === 'POST') return Promise.resolve(apiResponse({ ...datasetPayload, rows: [{ title: '合同条款' }] }));
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="datasets" />);

    expect(await screen.findByRole('heading', { name: '数据集管理' })).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /修\s*改/ }));
    expect(await screen.findByRole('heading', { name: /混合素材数据集/ })).toBeInTheDocument();
    await user.click(await findButtonByCompactName('补上传合并'));
    const uploadInputs = document.querySelectorAll('.dataset-upload-dragger input[type="file"]');
    await user.upload(uploadInputs[uploadInputs.length - 2] as HTMLInputElement, new File(['title\n合同条款\n'], 'patch.csv', { type: 'text/csv' }));
    fireEvent.change(uploadInputs[uploadInputs.length - 1], { target: { files: [new File(['hello'], 'notes.txt', { type: 'text/plain' })] } });
    await user.click(screen.getByRole('button', { name: '解析并合并' }));

    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([input, init]) => fetchUrl(input) === '/api/v1/datasets/dataset-1/patch-upload' && init?.method === 'POST')).toBe(true));
    const patchCall = vi.mocked(fetch).mock.calls.find(([input, init]) => fetchUrl(input) === '/api/v1/datasets/dataset-1/patch-upload' && init?.method === 'POST');
    const body = patchCall?.[1]?.body as FormData;
    expect(body.getAll('media_files')).toHaveLength(0);
  });

  it('keeps loaded dataset rows after saving metadata and refreshing summaries', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    const fullDataset = {
      ...datasetPayload,
      row_count: 2,
      preview_rows: [{ title: '合同条款', image_url: 'https://cdn.example.com/img.png' }],
      rows: [
        { title: '合同条款', image_url: 'https://cdn.example.com/img.png' },
        { title: '第二条款', image_url: 'https://cdn.example.com/img-2.png' },
      ],
    };
    const summaryDataset = {
      ...datasetPayload,
      row_count: 2,
      preview_rows: [{ title: '合同条款', image_url: 'https://cdn.example.com/img.png' }],
      rows: undefined,
    };
    vi.mocked(fetch).mockImplementation((input, init) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost').pathname;
      const method = init?.method ?? 'GET';
      if (url === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url === '/api/v1/datasets' && method === 'GET') return Promise.resolve(apiResponse({ items: [summaryDataset], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } }));
      if (url === '/api/v1/datasets/dataset-1' && method === 'GET') return Promise.resolve(apiResponse(fullDataset));
      if (url === '/api/v1/datasets/dataset-1' && method === 'PUT') {
        return Promise.resolve(apiResponse({ ...fullDataset, description: '保存后的说明' }));
      }
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="datasets" />);

    expect(await screen.findByRole('heading', { name: '数据集管理' })).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /修\s*改/ }));
    expect(await screen.findByRole('heading', { name: /混合素材数据集/ })).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /样本 2/ }));
    expect((await screen.findAllByText('第二条款')).length).toBeGreaterThan(0);
    await user.click(screen.getByText('发布', { selector: '.ant-segmented-item-label' }));
    await user.clear(screen.getByLabelText('简介'));
    await user.type(screen.getByLabelText('简介'), '保存后的说明');
    await user.click(screen.getByRole('button', { name: /保存/ }));
    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.some((call) => {
        const rawUrl = typeof call[0] === 'string' ? call[0] : call[0] instanceof URL ? call[0].toString() : call[0].url;
        return rawUrl.includes('/api/v1/datasets/dataset-1') && call[1]?.method === 'PUT';
      })).toBe(true);
    });
    await user.click(screen.getByRole('button', { name: /返回数据集管理/ }));
    await user.click(await findButtonByCompactName('刷新'));
    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.filter((call) => {
        const rawUrl = typeof call[0] === 'string' ? call[0] : call[0] instanceof URL ? call[0].toString() : call[0].url;
        return new URL(rawUrl, 'http://localhost').pathname === '/api/v1/datasets' && (call[1]?.method ?? 'GET') === 'GET';
      }).length).toBeGreaterThanOrEqual(2);
    });
    await user.click(await screen.findByRole('button', { name: /修\s*改/ }));
    await user.click(await screen.findByRole('button', { name: /样本 2/ }));
    expect((await screen.findAllByText('第二条款')).length).toBeGreaterThan(0);
  });

  it('shows resource owners in dataset, template and task management lists', async () => {
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation((input, init) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost').pathname;
      const method = init?.method ?? 'GET';
      if (url === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url === '/api/v1/datasets' && method === 'GET') return Promise.resolve(apiResponse({ items: [datasetPayload], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } }));
      if (url === '/api/v1/templates' && method === 'GET') return Promise.resolve(apiResponse({ items: [templatePayload], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } }));
      if (url === '/api/v1/tasks' && method === 'GET') return Promise.resolve(apiResponse({ items: [taskPayload], pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 } }));
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="datasets" />);

    expect(await screen.findByRole('heading', { name: '数据集管理' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '负责人' })).toBeInTheDocument();
    expect(await screen.findByText('最新修改人')).toBeInTheDocument();
    expect(screen.queryByText('数据负责人')).not.toBeInTheDocument();
    expect(screen.queryByText('创建人')).not.toBeInTheDocument();

    cleanup();
    render(<WorkspaceApp initialSession={adminSession} page="templates" />);

    expect(await screen.findByRole('heading', { name: '模板搭建' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '负责人' })).toBeInTheDocument();
    expect(await screen.findByText('模板负责人')).toBeInTheDocument();

    cleanup();
    render(<WorkspaceApp initialSession={adminSession} page="task-management" />);

    expect(await screen.findByRole('heading', { name: '任务管理' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '负责人' })).toBeInTheDocument();
    expect(await screen.findByText('任务发布人')).toBeInTheDocument();
  });

  it('builds and publishes a multi-tab template from the enterprise designer', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation((input, init) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost').pathname;
      const method = init?.method ?? 'GET';
      if (url === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url === '/api/v1/datasets') return Promise.resolve(apiResponse({ items: [datasetPayload], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } }));
      if (url === '/api/v1/templates' && method === 'GET') return Promise.resolve(apiResponse({ items: [], pagination: { page: 1, page_size: 1, total: 0, total_pages: 1 } }));
      if (url === '/api/v1/templates' && method === 'POST') return Promise.resolve(apiResponse({ ...templatePayload, status: 'draft' }));
      if (url === '/api/v1/templates/template-1/readiness') return Promise.resolve(apiResponse(templateReadinessPayload));
      if (url === '/api/v1/templates/template-1/publish') return Promise.resolve(apiResponse(templatePayload));
      if (url === '/api/v1/templates/validate') {
        return Promise.resolve(apiResponse({
          valid: false,
          field_errors: [{ component_id: 'text_1', field: 'text_1', label: '单行输入', rule: 'required', message: '单行输入 为必填项' }],
          warnings: [],
          summary: { answer_field_count: 2, error_count: 1, warning_count: 0 },
        }));
      }
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="templates" />);

    expect(await screen.findByRole('heading', { name: '模板搭建' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /新建模板/ }));
    expect(await screen.findByRole('heading', { name: '新建模板' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '+ 页签' }));
    expect(screen.getAllByRole('tab', { name: '页签 3' }).length).toBeGreaterThan(0);
    fireEvent.doubleClick(screen.getAllByText('页签 3')[0]);
    const tabNameInput = screen.getByLabelText('页签 3页签名称');
    fireEvent.change(tabNameInput, { target: { value: '质检复核' } });
    fireEvent.keyDown(tabNameInput, { key: 'Enter' });
    expect(screen.getAllByRole('tab', { name: '质检复核' }).length).toBeGreaterThan(0);
    const canvas = screen.getByLabelText('模板画布');
    const dragPayload = createDataTransfer();
    fireEvent.dragStart(screen.getByRole('button', { name: /单行输入/ }), { dataTransfer: dragPayload });
    fireEvent.drop(canvas, { dataTransfer: dragPayload });
    expect(screen.getByText('答案字段：text_1')).toBeInTheDocument();
    const secondDragPayload = createDataTransfer();
    fireEvent.dragStart(screen.getByRole('button', { name: /多行文本/ }), { dataTransfer: secondDragPayload });
    fireEvent.drop(canvas, { dataTransfer: secondDragPayload });
    expect(screen.getByText('答案字段：textarea_2')).toBeInTheDocument();
    const textareaCard = screen.getByText('答案字段：textarea_2').closest('[role="button"]');
    const textInputCard = screen.getByText('答案字段：text_1').closest('[role="button"]');
    expect(textareaCard).not.toBeNull();
    expect(textInputCard).not.toBeNull();
    const reorderPayload = createDataTransfer();
    fireEvent.dragStart(textareaCard!, { dataTransfer: reorderPayload });
    const insertBeforeTextInput = canvas.querySelector('.insert-slot');
    expect(insertBeforeTextInput).not.toBeNull();
    fireEvent.drop(insertBeforeTextInput!, { dataTransfer: reorderPayload });
    const orderedFields = Array.from(canvas.querySelectorAll('.component-meta-grid span:nth-child(2)')).map((node) => node.textContent);
    expect(orderedFields.slice(0, 2)).toEqual(['答案字段：textarea_2', '答案字段：text_1']);
    expect(textareaCard).toHaveClass('settling');
    expect(textareaCard).toHaveClass('from-below');
    const appendPayload = createDataTransfer();
    fireEvent.dragStart(textareaCard!, { dataTransfer: appendPayload });
    const insertAfterLast = canvas.querySelector('.insert-slot-end');
    expect(insertAfterLast).not.toBeNull();
    fireEvent.dragOver(insertAfterLast!, { dataTransfer: appendPayload });
    expect(canvas.querySelector('.canvas-end-divider')).toHaveClass('drop-after');
    expect(Array.from(canvas.querySelectorAll('.component-card')).some((node) => node.classList.contains('preview-shift-up') || node.classList.contains('preview-shift-down'))).toBe(false);
    fireEvent.drop(insertAfterLast!, { dataTransfer: appendPayload });
    const appendedFields = Array.from(canvas.querySelectorAll('.component-meta-grid span:nth-child(2)')).map((node) => node.textContent);
    expect(appendedFields.slice(0, 2)).toEqual(['答案字段：text_1', '答案字段：textarea_2']);
    expect(textareaCard).toHaveClass('settling');
    expect(textareaCard).toHaveClass('from-above');
    await user.click(screen.getByText('答案字段：text_1'));
    await user.type(screen.getByLabelText('最大长度'), '120');
    expect(screen.getByDisplayValue('120')).toBeInTheDocument();
    await user.click(screen.getByLabelText('启用顶层必填规则'));
    await user.type(screen.getByLabelText('顶层最小长度规则'), '6');
    await user.click(screen.getByRole('button', { name: '单选' }));
    const optionInput = screen.getByLabelText('选项（每行一个）');
    await user.clear(optionInput);
    await user.type(optionInput, '通过{enter}打回');
    expect(optionInput).toHaveValue('通过\n打回');
    await user.click(screen.getByText('答案字段：textarea_2'));
    await user.click(screen.getByLabelText('启用当前组件联动'));
    fireEvent.change(screen.getByLabelText('联动触发字段'), { target: { value: 'single_3' } });
    expect(screen.getByLabelText('联动匹配值')).toHaveValue('option_1');
    fireEvent.change(screen.getByLabelText('联动匹配值'), { target: { value: 'option_2' } });
    expect(screen.getByLabelText('联动匹配值')).toHaveValue('option_2');
    fireEvent.change(screen.getByLabelText('联动触发字段'), { target: { value: 'text_1' } });
    expect(screen.getByLabelText('联动触发字段')).toHaveValue('text_1');
    fireEvent.change(screen.getByLabelText('联动匹配值'), { target: { value: 'yes' } });
    expect(screen.getByLabelText('联动匹配值')).toHaveValue('yes');
    await user.click(screen.getByText('答案字段：text_1'));
    await user.click(screen.getByRole('button', { name: '复制' }));
    expect(screen.getByText('单行输入 副本')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '删除' }));
    expect(screen.queryByText('单行输入 副本')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Renderer 预览' }));
    expect(await screen.findByRole('heading', { name: 'Renderer 预览' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab', { name: '质检复核' }).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: '运行校验' }));
    expect(await screen.findByText('运行时字段错误 1 个')).toBeInTheDocument();
    expect(screen.getAllByText('单行输入 为必填项').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: '返回 Designer' }));
    await user.click(screen.getByRole('button', { name: '发布模板' }));
    expect(await screen.findByText('发布检查通过')).toBeInTheDocument();
    const publishCheckDialog = screen.getByText('发布检查通过').closest('.ant-modal') as HTMLElement;
    expect(publishCheckDialog).toBeTruthy();
    expect(within(publishCheckDialog).queryByText('Renderer 预览')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '确认发布' }));
    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.some((call) => fetchUrl(call[0]).endsWith('/api/v1/templates') && call[1]?.method === 'POST')).toBe(true);
    });
    const createBody = JSON.parse(String(vi.mocked(fetch).mock.calls.find((call) => fetchUrl(call[0]).endsWith('/api/v1/templates') && call[1]?.method === 'POST')?.[1]?.body));
    expect(createBody.schema.linkage_rules).toHaveLength(1);
    expect(createBody.schema.linkage_rules[0]).toEqual(expect.objectContaining({
      source_field: 'text_1',
      operator: 'equals',
      value: 'yes',
      action: 'show',
    }));
    expect(createBody.schema.linkage_rules[0].target_component_id).toMatch(/^textarea_2_/);
    expect(createBody.schema.validation_rules.text_1).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'required', enabled: true }),
      expect.objectContaining({ type: 'min_length', value: 6 }),
    ]));
  });

  it('confirms before replacing canvas content with a designer preset', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation((input, init) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost').pathname;
      const method = init?.method ?? 'GET';
      if (url === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url === '/api/v1/datasets') return Promise.resolve(apiResponse({ items: [datasetPayload], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } }));
      if (url === '/api/v1/templates' && method === 'GET') return Promise.resolve(apiResponse({ items: [], pagination: { page: 1, page_size: 1, total: 0, total_pages: 1 } }));
      if (url === '/api/v1/templates' && method === 'POST') return Promise.resolve(apiResponse({ ...templatePayload, status: 'draft' }));
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="templates" />);

    expect(await screen.findByRole('heading', { name: '模板搭建' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /新建模板/ }));
    expect(await screen.findByRole('heading', { name: '新建模板' })).toBeInTheDocument();
    const presetButton = (name: string) => screen.getAllByRole('button', { name })
      .find((button) => button.classList.contains('designer-preset-button'))!;
    expect(presetButton('基础分类')).toHaveTextContent('4 项');
    expect(presetButton('质量复核')).toHaveTextContent('5 项');
    expect(presetButton('偏好排序')).toHaveTextContent('3 项');
    expect(presetButton('多模态复核')).toHaveTextContent('4 项');
    expect(screen.queryByRole('button', { name: '加载测试模板' })).not.toBeInTheDocument();
    await user.click(presetButton('基础分类'));
    expect((await screen.findAllByText('覆盖当前页签为「基础分类」？')).length).toBeGreaterThan(0);
    expect(screen.getByText(/此操作会清空当前页签内已有物料/)).toBeInTheDocument();
    const findLatestPresetConfirmDialog = async (title: string) => waitFor(() => {
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>('.ant-modal-confirm'))
        .filter((dialog) => dialog.textContent?.includes(title) && !dialog.className.includes('ant-zoom-leave'));
      expect(dialogs.length).toBeGreaterThan(0);
      return dialogs.at(-1)!;
    });
    await user.click(within(await findLatestPresetConfirmDialog('覆盖当前页签为「基础分类」？')).getByRole('button', { name: /取\s*消/ }));
    const designerCanvas = screen.getByLabelText('模板画布');
    expect(within(designerCanvas).queryByText('样本信息')).not.toBeInTheDocument();
    await user.click(presetButton('基础分类'));
    await user.click(within(await findLatestPresetConfirmDialog('覆盖当前页签为「基础分类」？')).getByRole('button', { name: '确认覆盖' }));
    expect(within(designerCanvas).getByText('样本信息')).toBeInTheDocument();
    expect(within(designerCanvas).getByText('判断理由')).toBeInTheDocument();
    await user.click(presetButton('偏好排序'));
    await user.click(within(await findLatestPresetConfirmDialog('覆盖当前页签为「偏好排序」？')).getByRole('button', { name: '确认覆盖' }));
    expect(within(designerCanvas).getByText('候选内容')).toBeInTheDocument();
    expect(within(designerCanvas).getByText('排序理由')).toBeInTheDocument();
    expect(within(designerCanvas).queryByText('样本信息')).not.toBeInTheDocument();
  }, 40000);

  it('opens the template AI assistant and applies a generated field change', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation((input, init) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost').pathname;
      const method = init?.method ?? 'GET';
      if (url === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url === '/api/v1/datasets') return Promise.resolve(apiResponse({ items: [datasetPayload], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } }));
      if (url === '/api/v1/templates' && method === 'GET') return Promise.resolve(apiResponse({ items: [], pagination: { page: 1, page_size: 1, total: 0, total_pages: 1 } }));
      if (url === '/api/v1/ai-resources/configs') return Promise.resolve(apiResponse({ items: [providerPayload] }));
      if (url === '/api/v1/ai/template-assistant/chat') {
        return Promise.resolve(apiResponse({
          conversation_id: 'template-ai-test',
          message: '已为你生成 1 项模版变更：新增字段「质检备注」。',
          reasoning: '新增多行文本字段更适合记录质检说明。',
          changes: [{
            id: 'change-note',
            type: 'create_field',
            title: '新增字段：质检备注',
            description: '在当前页末尾新增多行文本字段。',
            position: { type: 'append', tabId: 'tab_read' },
            after: {
              id: 'quality_note_ai',
              type: 'TextArea',
              field: 'quality_note',
              label: '质检备注',
              required: false,
              config: { placeholder: '请输入质检备注' },
              options: [],
              version: '1.0',
            },
            selected: true,
            expanded: true,
          }],
          suggestions: ['将质检备注设置为必填'],
          usage: { points: 0.01, tokens: 100 },
          provider: { provider_id: 'provider-1', route_name: '法务审核主路由', model: 'gpt-4.1-mini' },
          fallback: null,
        }));
      }
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="templates" />);

    expect(await screen.findByRole('heading', { name: '模板搭建' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '新建模板' }));
    expect(await screen.findByRole('heading', { name: '新建模板' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '打开模板搭建 AI' }));
    expect(await screen.findByText('MarkUp 模版搭建 AI')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('向 AI 发送指令，例如：帮我生成一个图片分类标注模版'), '帮我增加质检备注字段');
    const aiModal = screen.getByText('MarkUp 模版搭建 AI').closest('.ant-modal') as HTMLElement;
    await user.click(within(aiModal).getByRole('button', { name: '发送模板 AI 指令' }));
    expect(await screen.findByText('新增字段：质检备注')).toBeInTheDocument();
    await user.click(within(aiModal).getByRole('button', { name: '关闭模板搭建 AI' }));
    await waitFor(() => expect(screen.getAllByText('当前有未应用的 AI 变更').length).toBeGreaterThan(0));
    await user.click(screen.getByRole('button', { name: '继续关闭' }));
    await user.click(screen.getByRole('button', { name: '打开模板搭建 AI' }));
    expect(await screen.findByText('MarkUp 模版搭建 AI')).toBeInTheDocument();
    const reopenedAiModal = screen.getByText('MarkUp 模版搭建 AI').closest('.ant-modal') as HTMLElement;
    await user.click(within(reopenedAiModal).getByRole('button', { name: '清除对话' }));
    expect(await screen.findByText('确定要清除当前对话吗？清除后对话记录和未应用的 AI 变更都将被移除。')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '确认清除' }));
    expect(within(reopenedAiModal).queryByText('新增字段：质检备注')).not.toBeInTheDocument();
    expect(within(reopenedAiModal).getByText('你说 AI 做')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('向 AI 发送指令，例如：帮我生成一个图片分类标注模版'), '帮我增加质检备注字段');
    await user.click(within(reopenedAiModal).getByRole('button', { name: '发送模板 AI 指令' }));
    expect(await screen.findByText('新增字段：质检备注')).toBeInTheDocument();
    await user.click(within(reopenedAiModal).getByRole('button', { name: /应\s*用/ }));
    expect(await screen.findByText('答案字段：quality_note')).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some((call) => fetchUrl(call[0]).endsWith('/api/v1/ai/template-assistant/chat'))).toBe(true);
  });

  it('applies template linkage rules in the shared renderer', async () => {
    const user = userEvent.setup();
    function LinkageRendererHarness() {
      const [answers, setAnswers] = useState<Record<string, unknown>>({ need_extra: 'no' });
      return (
        <TemplateRenderer
          schema={{
            schema_version: '1.0',
            tabs: [
              {
                id: 'tab_linkage',
                title: '联动页',
                components: [
                  {
                    id: 'need_extra',
                    type: 'SingleSelect',
                    field: 'need_extra',
                    label: '需要补充',
                    required: true,
                    config: {},
                    options: [{ value: 'yes', label: '是' }, { value: 'no', label: '否' }],
                    version: '1.0',
                  },
                  {
                    id: 'extra_reason',
                    type: 'TextInput',
                    field: 'extra_reason',
                    label: '补充理由',
                    required: true,
                    config: {},
                    options: [],
                    version: '1.0',
                  },
                ],
              },
            ],
            components: [],
            validation_rules: {},
            linkage_rules: [{ source_field: 'need_extra', operator: 'equals', value: 'yes', target_component_id: 'extra_reason', action: 'show' }],
            llm_config: {},
          }}
          content={{}}
          answers={answers}
          errors={[{ component_id: 'extra_reason', field: 'extra_reason', message: '补充理由 为必填项' }]}
          onAnswerChange={(field, value) => setAnswers((current) => ({ ...current, [field]: value }))}
        />
      );
    }

    render(<LinkageRendererHarness />);

    expect(screen.getByText('需要补充 *')).toBeInTheDocument();
    expect(screen.queryByText('补充理由 *')).not.toBeInTheDocument();
    expect(screen.queryByText('补充理由 为必填项')).not.toBeInTheDocument();
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByText('是'));
    expect(await screen.findByText('补充理由 *')).toBeInTheDocument();
    expect(screen.getByText('补充理由 为必填项')).toBeInTheDocument();
  });

  it('matches option labels in template linkage rules for legacy designer values', async () => {
    render(
      <TemplateRenderer
        schema={{
          schema_version: '1.0',
          tabs: [
            {
              id: 'tab_linkage',
              title: '联动页',
              components: [
                {
                  id: 'review_result',
                  type: 'SingleSelect',
                  field: 'review_result',
                  label: '复核结论',
                  required: true,
                  config: {},
                  options: [{ value: 'option_1', label: '通过' }, { value: 'option_2', label: '打回' }],
                  version: '1.0',
                },
                {
                  id: 'reject_reason',
                  type: 'TextInput',
                  field: 'reject_reason',
                  label: '打回原因',
                  required: true,
                  config: {},
                  options: [],
                  version: '1.0',
                },
              ],
            },
          ],
          components: [],
          validation_rules: {},
          linkage_rules: [{ source_field: 'review_result', operator: 'equals', value: '打回', target_component_id: 'reject_reason', action: 'show' }],
          llm_config: {},
        }}
        content={{}}
        answers={{ review_result: 'option_2' }}
        onAnswerChange={vi.fn()}
      />,
    );

    expect(screen.getByText('打回原因 *')).toBeInTheDocument();
  });

  it('supports multi-condition linkage rules in the shared renderer', async () => {
    const user = userEvent.setup();
    function MultiConditionHarness() {
      const [answers, setAnswers] = useState<Record<string, unknown>>({ need_extra: 'yes', risk: 'low' });
      return (
        <TemplateRenderer
          schema={{
            schema_version: '1.1',
            tabs: [
              {
                id: 'tab_linkage',
                title: '联动页',
                components: [
                  { id: 'need_extra', type: 'SingleSelect', field: 'need_extra', label: '需要补充', required: true, config: {}, options: [{ value: 'yes', label: '是' }, { value: 'no', label: '否' }], version: '1.0' },
                  { id: 'risk', type: 'SingleSelect', field: 'risk', label: '风险等级', required: true, config: {}, options: [{ value: 'high', label: '高' }, { value: 'low', label: '低' }], version: '1.0' },
                  { id: 'extra_reason', type: 'TextInput', field: 'extra_reason', label: '补充理由', required: true, config: {}, options: [], version: '1.0' },
                ],
              },
            ],
            components: [],
            validation_rules: {},
            linkage_rules: [{
              target_component_id: 'extra_reason',
              action: 'show',
              condition_mode: 'all',
              conditions: [
                { source_field: 'need_extra', operator: 'equals', value: 'yes' },
                { source_field: 'risk', operator: 'equals', value: 'high' },
              ],
            }],
            llm_config: {},
          }}
          content={{}}
          answers={answers}
          onAnswerChange={(field, value) => setAnswers((current) => ({ ...current, [field]: value }))}
        />
      );
    }

    render(<MultiConditionHarness />);

    expect(screen.queryByText('补充理由 *')).not.toBeInTheDocument();
    await user.click(screen.getAllByRole('combobox')[1]);
    await user.click(await screen.findByText('高'));
    expect(await screen.findByText('补充理由 *')).toBeInTheDocument();
  });

  it('renders multimodal ShowItem bindings and clickable preview LLM assist in the shared renderer', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = fetchUrl(input);
      if (url === '/api/v1/uploads/uploaded-video/video-preview' || url === '/uploads/uploaded-video/video-preview') {
        return apiResponse({
          status: 'not_required',
          playback_url: 'http://testserver/api/v1/uploads/uploaded-video/playback?token=signed',
        });
      }
      return apiResponse(null);
    });
    render(
      <TemplateRenderer
        schema={{
          schema_version: '1.0',
          tabs: [
            {
              id: 'tab_multimodal',
              title: '多模态页',
              components: [
                {
                  id: 'group_context',
                  type: 'GroupContainer',
                  field: 'group_context',
                  label: '样本上下文',
                  required: false,
                  config: { description: '先阅读图片和音频转写，再完成标注。', style: 'section' },
                  options: [],
                  version: '1.0',
                },
                {
                  id: 'show_image',
                  type: 'ShowItem',
                  field: 'show_image',
                  label: '样本图片',
                  required: false,
                  config: { binding: { source_type: 'media', media_type: 'image', role: 'primary', field: 'image_url' } },
                  options: [],
                  version: '1.0',
                },
                {
                  id: 'show_asr',
                  type: 'ShowItem',
                  field: 'show_asr',
                  label: '音频转写',
                  required: false,
                  config: { binding: { source_type: 'derived_context', key: 'asr_text' } },
                  options: [],
                  version: '1.0',
                },
                {
                  id: 'show_video',
                  type: 'ShowItem',
                  field: 'show_video',
                  label: '样本视频',
                  required: false,
                  config: { binding: { source_type: 'media', media_type: 'video', role: 'evidence', field: 'video_url' }, description: '请查看视频中的动作是否合规。' },
                  options: [],
                  version: '1.0',
                },
                {
                  id: 'show_bundle',
                  type: 'ShowItem',
                  field: 'show_bundle',
                  label: '智能展示块',
                  required: false,
                  config: {
                    display_fields: [
                      { label: '标题', field: 'title', binding: { source_type: 'column', column_name: 'title', field: 'title' } },
                      { label: '视频', field: 'video_url', binding: { source_type: 'media', media_type: 'video', role: 'evidence', field: 'video_url' } },
                      { label: '音频', field: 'audio_url', binding: { source_type: 'media', media_type: 'audio', role: 'primary', field: 'audio_url' } },
                      { label: '转写', field: 'asr_text', binding: { source_type: 'derived_context', key: 'asr_text' } },
                    ],
                    layout: 'dense',
                  },
                  options: [],
                  version: '1.0',
                },
                {
                  id: 'category',
                  type: 'TextInput',
                  field: 'category',
                  label: '分类结果',
                  required: true,
                  config: { description: '填写最终分类标签。' },
                  options: [],
                  version: '1.0',
                },
                {
                  id: 'llm_helper',
                  type: 'LLMComponent',
                  field: 'llm_helper',
                  label: 'AI 标注建议',
                  required: false,
                  config: { button_text: '生成建议', prompt_hint: '结合图片和转写给出标签建议。' },
                  options: [],
                  version: '1.0',
                },
              ],
            },
          ],
          components: [],
          validation_rules: {},
          linkage_rules: [],
          llm_config: {},
        }}
        content={{
          title: '多字段智能展示标题',
          show_bundle: [
            { field: 'title', label: '标题', value: '多字段智能展示标题', binding: { source_type: 'column', column_name: 'title', field: 'title' } },
            {
              field: 'video_url',
              label: '视频',
              value: {
                type: 'video',
                role: 'evidence',
                field: 'video_url',
                file_id: 'uploaded-video',
                filename: 'uploaded-sample.mp4',
                name: 'uploaded-sample.mp4',
                mime_type: 'application/octet-stream',
              },
              binding: { source_type: 'media', media_type: 'video', role: 'evidence', field: 'video_url' },
            },
            {
              field: 'audio_url',
              label: '音频',
              value: { type: 'audio', role: 'primary', field: 'audio_url', url: 'https://example.com/sample.mp3?token=preview', name: 'sample.mp3' },
              binding: { source_type: 'media', media_type: 'audio', role: 'primary', field: 'audio_url' },
            },
            { field: 'asr_text', label: '转写', value: '这是一段音频转写文本', binding: { source_type: 'derived_context', key: 'asr_text' } },
          ],
          media: [
            { type: 'image/jpeg', role: 'primary', field: 'image_url', url: 'https://example.com/sample.png?token=preview' },
            { type: 'video/mp4', role: 'evidence', field: 'video_url', url: 'https://example.com/sample.mp4?token=preview' },
            { type: 'audio/mpeg', role: 'primary', field: 'audio_url', url: 'https://example.com/sample.mp3?token=preview', name: 'sample.mp3' },
          ],
          derived_context: { asr_text: '这是一段音频转写文本' },
        }}
        answers={{}}
        readonly
      />,
    );

    expect(screen.getByText('样本上下文')).toBeInTheDocument();
    expect(screen.getByText('先阅读图片和音频转写，再完成标注。')).toBeInTheDocument();
    expect(document.querySelector('.renderer-media-preview .workspace-media-preview__image')).toBeTruthy();
    expect(document.querySelector('.renderer-media-preview video.workspace-media-preview__player--video')).toHaveAttribute('src', 'https://example.com/sample.mp4?token=preview');
    await waitFor(() => expect(document.querySelector('video[aria-label="uploaded-sample.mp4 视频预览"]')).toHaveAttribute('src', 'http://testserver/api/v1/uploads/uploaded-video/playback?token=signed'));
    expect(document.querySelector('.renderer-show-grid-value .renderer-media-preview.is-audio audio.workspace-media-preview__player--audio')).toHaveAttribute('src', 'https://example.com/sample.mp3?token=preview');
    expect(screen.getByText('多字段智能展示标题')).toBeInTheDocument();
    expect(screen.getByText('智能展示块')).toBeInTheDocument();
    expect(screen.getAllByText('这是一段音频转写文本').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('分类结果 *')).toBeInTheDocument();
    expect(screen.getByText('填写最终分类标签。')).toBeInTheDocument();
    expect(screen.getByText('AI 标注建议')).toBeInTheDocument();
    expect(screen.getAllByText('结合图片和转写给出标签建议。').length).toBeGreaterThan(0);
    const previewButton = screen.getByRole('button', { name: /生成建议/ });
    expect(previewButton).toBeEnabled();
    await user.click(previewButton);
    expect(await screen.findByText('AI 辅助将在正式标注页运行')).toBeInTheDocument();
  });

  it('runs LLM assist from a readonly preview when a handler is provided', async () => {
    const user = userEvent.setup();
    const onAiAssistRequest = vi.fn();
    render(
      <TemplateRenderer
        schema={{
          schema_version: '1.0',
          tabs: [
            {
              id: 'tab_ai_preview',
              title: 'AI 预览页',
              components: [
                { id: 'answer', type: 'TextInput', field: 'answer', label: '答案', required: false, config: {}, options: [], version: '1.0' },
                { id: 'llm_preview', type: 'LLMComponent', field: 'llm_preview', label: 'AI 预览建议', required: false, config: { button_text: '预览生成' }, options: [], version: '1.0' },
              ],
            },
          ],
          components: [],
          validation_rules: {},
          linkage_rules: [],
          llm_config: {},
        }}
        content={{ text: 'preview sample' }}
        answers={{}}
        readonly
        onAiAssistRequest={onAiAssistRequest}
      />,
    );

    await user.click(screen.getByRole('button', { name: '预览生成' }));

    expect(onAiAssistRequest).toHaveBeenCalledTimes(1);
    expect(onAiAssistRequest.mock.calls[0][0].id).toBe('llm_preview');
    expect(screen.queryByText('AI 辅助将在正式标注页运行')).not.toBeInTheDocument();
  });

  it('copies and deletes templates from the management list', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    const draftTemplate = { ...templatePayload, template_id: 'template-draft', name: '草稿模板', status: 'draft' };
    const publishedDeleteTemplate = { ...templatePayload, template_id: 'template-published-delete', name: '可删除发布模板', status: 'published', reference_stats: { task_count: 0, active_task_count: 0 } };
    const copiedTemplate = { ...draftTemplate, template_id: 'template-copy', name: '草稿模板 副本' };
    const templateListResponse = apiResponse({ items: [templatePayload, publishedDeleteTemplate, draftTemplate], pagination: { page: 1, page_size: 3, total: 3, total_pages: 1 } });
    const datasetListResponse = apiResponse({ items: [rendererDatasetPayload], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } });
    vi.mocked(fetch).mockImplementation((input, init) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost').pathname;
      const method = init?.method ?? 'GET';
      if (url === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url === '/api/v1/datasets') return Promise.resolve(datasetListResponse.clone());
      if (url === '/api/v1/templates' && method === 'GET') return Promise.resolve(templateListResponse.clone());
      if (url === '/api/v1/templates/template-1/readiness') return Promise.resolve(apiResponse(templateReadinessPayload));
      if (url === '/api/v1/templates/template-1/preview') return Promise.resolve(apiResponse({ template: templatePayload, renderer_mode: 'preview' }));
      if (url === '/api/v1/templates/template-1/versions' && method === 'GET') return Promise.resolve(apiResponse(templateVersionsPayload));
      if (url === '/api/v1/templates/template-1/versions/diff' && method === 'GET') return Promise.resolve(apiResponse(templateVersionDiffPayload));
      if (url === '/api/v1/templates/template-1/copy') return Promise.resolve(apiResponse(copiedTemplate));
      if (url === '/api/v1/templates/template-published-delete' && method === 'DELETE') return Promise.resolve(apiResponse(null));
      if (url === '/api/v1/templates/template-copy' && method === 'DELETE') return Promise.resolve(apiResponse(null));
      if (url === '/api/v1/templates/template-draft' && method === 'DELETE') return Promise.resolve(apiResponse(null));
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="templates" />);

    expect(await screen.findByRole('heading', { name: '模板搭建' })).toBeInTheDocument();
    expect(await screen.findByText('多模态模板')).toBeInTheDocument();
    expect(await screen.findByText('草稿模板')).toBeInTheDocument();
    expect(screen.getAllByText('0 任务 / 0 进行中').length).toBeGreaterThan(1);
    await clickWorkspaceMoreMenuItem(user, '版本历史');
    expect(await screen.findByText('2 页签 / 3 组件 / 2 ShowItem')).toBeInTheDocument();
    expect(screen.getByText('1 任务 / 1 进行中')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Renderer 预览' })[0]);
    expect(await screen.findByRole('heading', { name: 'Renderer 预览' })).toBeInTheDocument();
    expect(screen.getByText('合同条款')).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: /样例行/ }));
    await user.click(await screen.findByText(/第 2 行/));
    expect(await screen.findByText('第二条款')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '返回模板搭建' }));
    expect(await screen.findByText('多模态模板 版本历史')).toBeInTheDocument();
    const versionHistoryDialog = screen.getAllByRole('dialog').at(-1)!;
    await user.click(within(versionHistoryDialog).getAllByRole('button', { name: /^导\s*出$/ })[0]);
    expect(URL.createObjectURL).toHaveBeenCalled();
    await user.keyboard('{Escape}');
    await clickWorkspaceMoreMenuItem(user, '版本历史');
    const reopenedVersionHistoryDialog = screen.getAllByRole('dialog').at(-1)!;
    await user.click(within(reopenedVersionHistoryDialog).getAllByRole('button', { name: '更多操作' })[0]);
    const compareVersionItem = await screen.findByRole('menuitem', { name: /对比上一版/ });
    compareVersionItem.style.pointerEvents = 'auto';
    await user.click(compareVersionItem);
    expect(await screen.findByText('v1 -> v2')).toBeInTheDocument();
    expect(screen.getByText('意图')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await clickWorkspaceMoreMenuItem(user, '复制模板');
    expect(await screen.findByText('草稿模板 副本')).toBeInTheDocument();

    const publishedDeleteRow = screen.getByText('可删除发布模板').closest('tr');
    expect(publishedDeleteRow).not.toBeNull();
    await clickRowMoreMenuItem(user, publishedDeleteRow!, '删除模板');
    await confirmLatestDialogAction(user, /删\s*除/, '删除模板？');
    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.some(([input, init]) => fetchUrl(input).includes('/api/v1/templates/template-published-delete') && init?.method === 'DELETE')).toBe(true);
    });
    await waitFor(() => expect(screen.queryByText('可删除发布模板')).not.toBeInTheDocument());

    const copiedRow = screen.getByText('草稿模板 副本').closest('tr');
    expect(copiedRow).not.toBeNull();
    await clickRowMoreMenuItem(user, copiedRow!, '删除模板');
    await confirmLatestDialogAction(user, /删\s*除/, '删除模板？');
    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.some(([input, init]) => fetchUrl(input).includes('/api/v1/templates/template-copy') && init?.method === 'DELETE')).toBe(true);
    });
    await waitFor(() => expect(screen.queryByText('草稿模板 副本')).not.toBeInTheDocument());
  }, 40000);

  it('imports and exports template schema from the template workspace', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation((input, init) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost').pathname;
      const method = init?.method ?? 'GET';
      if (url === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url === '/api/v1/datasets') return Promise.resolve(apiResponse({ items: [datasetPayload], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } }));
      if (url === '/api/v1/templates' && method === 'GET') return Promise.resolve(apiResponse({ items: [templatePayload], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } }));
      if (url === '/api/v1/templates/template-1' && method === 'GET') return Promise.resolve(apiResponse(templatePayload));
      if (url === '/api/v1/templates' && method === 'POST') return Promise.resolve(apiResponse({ ...templatePayload, template_id: 'template-imported', name: '导入模板', status: 'draft' }));
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="templates" />);

    expect(await screen.findByRole('heading', { name: '模板搭建' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '导入 schema' }));
    const importedSchema = {
      name: '导入模板',
      description: '从 schema 文件导入',
      reference_dataset_id: 'dataset-1',
      schema: {
        schema_version: '1.0',
        tabs: [
          {
            id: 'tab_import',
            title: '导入页签',
            components: [
              {
                id: 'show_title_import',
                type: 'ShowItem',
                field: 'show_title',
                label: '导入标题',
                required: false,
                config: {
                  content_field: 'image_url',
                  binding: { source_type: 'media', media_type: 'image', role: 'context', field: 'image_url' },
                },
                options: [],
                version: '1.0',
              },
              {
                id: 'summary_import',
                type: 'TextArea',
                field: 'summary',
                label: '导入摘要',
                required: true,
                config: { min_length: 5 },
                options: [],
                version: '1.0',
              },
            ],
          },
        ],
        components: [],
        validation_rules: {},
        linkage_rules: [],
        llm_config: {},
      },
    };
    const schemaFile = new File([JSON.stringify(importedSchema, null, 2)], 'imported-schema.json', { type: 'application/json' });
    const schemaFileInput = document.querySelector('.schema-import-modal input[type="file"]') as HTMLInputElement;
    await user.upload(schemaFileInput, schemaFile);
    await waitFor(() => expect((screen.getByPlaceholderText(/schema_version/) as HTMLTextAreaElement).value).toContain('导入模板'));
    await user.click(screen.getByRole('button', { name: '导入到 Designer' }));

    expect(await screen.findByRole('heading', { name: '导入模板' })).toBeInTheDocument();
    expect(screen.getByText('答案字段：summary')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '保存草稿' }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some((call) => fetchUrl(call[0]).endsWith('/api/v1/templates') && call[1]?.method === 'POST')).toBe(true));
    const createBody = JSON.parse(String(vi.mocked(fetch).mock.calls.find((call) => fetchUrl(call[0]).endsWith('/api/v1/templates') && call[1]?.method === 'POST')?.[1]?.body));
    expect(createBody.name).toBe('导入模板');
    expect(createBody.schema.tabs[0].components[0].config.binding).toMatchObject({ source_type: 'media', media_type: 'image', role: 'context', field: 'image_url' });
    expect(createBody.schema.tabs[0].components[1]).toMatchObject({ field: 'summary', label: '导入摘要', required: true });

    await waitFor(() => expect(screen.getAllByRole('button', { name: '更多操作' }).length).toBeGreaterThan(0));
    await user.click(screen.getAllByRole('button', { name: '更多操作' }).at(-1)!);
    await user.click(await screen.findByText('导出 schema'));
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('shows task production progress with review and storage metrics', async () => {
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    const taskWithProductionStats = {
      ...taskPayload,
      title: '生产进度任务',
      status: 'published',
      quota: 20,
      stats: { total: 20, claimed: 8, submitted: 4, approved: 12, rejected: 3 },
    };
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      const method = init?.method ?? 'GET';
      if (url.pathname === '/api/v1/teams/admin/overview') return apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] });
      if (url.pathname === '/api/v1/tasks' && method === 'GET') return apiResponse({ items: [taskWithProductionStats], pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 } });
      return apiResponse({});
    });

    render(<WorkspaceApp initialSession={adminSession} page="task-management" />);

    expect(await screen.findByRole('heading', { name: '任务管理' })).toBeInTheDocument();
    expect(screen.getByText('任务发布人')).toBeInTheDocument();
    expect(screen.getByText('总数据 20')).toBeInTheDocument();
    expect(screen.getByText('待人工审核 4')).toBeInTheDocument();
    expect(screen.getByText('已入库 12 · 打回 3')).toBeInTheDocument();
  });

  it('opens a published template version when its schema uses sparse legacy component fields', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    const legacyReviewTemplate = {
      ...templatePayload,
      template_id: 'template-title-clean',
      name: '商品标题清洗审核模板',
      status: 'published',
      show_item_count: 1,
      tab_count: 1,
      schema: {
        schema_version: '1.0',
        tabs: [
          {
            id: 'tab_main',
            title: '商品标题清洗',
            components: [
              { id: 'show_title', type: 'ShowItem', label: '原始标题', field: 'title', source_field: 'title' },
              { id: 'keywords', type: 'TagSelect', label: '关键词', field: 'keywords', required: true },
            ],
          },
        ],
        components: [],
        validation_rules: {},
        linkage_rules: [],
        llm_config: {},
      },
    };
    vi.mocked(fetch).mockImplementation((input) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost').pathname;
      if (url === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url === '/api/v1/datasets') return Promise.resolve(apiResponse({ items: [datasetPayload], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } }));
      if (url === '/api/v1/templates') return Promise.resolve(apiResponse({ items: [legacyReviewTemplate], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } }));
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="templates" />);

    expect(await screen.findByRole('heading', { name: '模板搭建' })).toBeInTheDocument();
    expect(await screen.findByText('商品标题清洗审核模板')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '新建版本' }));
    expect(await screen.findByRole('heading', { name: '商品标题清洗审核模板' })).toBeInTheDocument();
    expect(screen.getByText('原始标题')).toBeInTheDocument();
    expect(screen.getByText('关键词')).toBeInTheDocument();
    await user.click(screen.getByText('关键词'));
    expect(screen.getByLabelText('选项（每行一个）')).toHaveValue('');
  });

  it('keeps the template designer usable after all canvas materials are deleted', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }))
      .mockResolvedValueOnce(apiResponse({ items: [datasetPayload], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } }))
      .mockResolvedValueOnce(apiResponse({ items: [templatePayload], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } }));

    render(<WorkspaceApp initialSession={adminSession} page="templates" />);

    expect(await screen.findByRole('heading', { name: '模板搭建' })).toBeInTheDocument();
    expect(await screen.findByText('多模态模板')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '新建版本' }));
    expect(await screen.findByRole('heading', { name: '多模态模板' })).toBeInTheDocument();
    const titleComponent = screen.getAllByText('标题').find((node) => node.closest('.component-card'));
    expect(titleComponent).toBeTruthy();
    await user.click(titleComponent as HTMLElement);
    await user.click(screen.getByRole('button', { name: '删除' }));
    const imageComponent = screen.getAllByText('图片').find((node) => node.closest('.component-card'));
    expect(imageComponent).toBeTruthy();
    await user.click(imageComponent as HTMLElement);
    await user.click(screen.getByRole('button', { name: '删除' }));

    expect(screen.getByText('当前页签还没有物料')).toBeInTheDocument();
    expect(screen.getByLabelText('模板画布')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '添加输入字段' }));
    expect(screen.getByText('答案字段：text_1')).toBeInTheDocument();
  });

  it('autosaves a new published-template version and stops re-autosaving after manual save without further edits', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    const updateResponses = [
      apiResponse({
        ...templatePayload,
        template_id: 'template-1',
        name: '多模态模板-自动保存',
        status: 'draft',
        auto_saved: true,
        latest_version: 2,
        description: templatePayload.description,
        schema: templatePayload.schema,
      }),
      apiResponse({
        ...templatePayload,
        template_id: 'template-1',
        name: '多模态模板-手动保存',
        status: 'draft',
        auto_saved: false,
        latest_version: 2,
        description: templatePayload.description,
        schema: templatePayload.schema,
      }),
    ];
    const templateUpdateBodies: Array<Record<string, unknown>> = [];

    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      const method = init?.method ?? 'GET';
      if (url.pathname === '/api/v1/teams/admin/overview') return apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] });
      if (url.pathname === '/api/v1/datasets') return apiResponse({ items: [datasetPayload], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } });
      if (url.pathname === '/api/v1/templates' && method === 'GET') return apiResponse({ items: [templatePayload], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } });
      if (url.pathname === '/api/v1/templates/template-1' && method === 'PUT') {
        templateUpdateBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
        return updateResponses.shift() ?? apiResponse({
          ...templatePayload,
          template_id: 'template-1',
          name: '多模态模板-手动保存',
          status: 'draft',
          auto_saved: false,
          latest_version: 2,
          description: templatePayload.description,
          schema: templatePayload.schema,
        });
      }
      return apiResponse(null);
    });

    render(<WorkspaceApp initialSession={adminSession} page="templates" />);

    expect(await screen.findByRole('heading', { name: '模板搭建' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '新建版本' }));
    expect(await screen.findByRole('heading', { name: '多模态模板' })).toBeInTheDocument();
    expect(screen.getByText('标题')).toBeInTheDocument();
    expect(screen.getByText('图片')).toBeInTheDocument();

    const nameInput = screen.getByLabelText('模板名称');
    await user.clear(nameInput);
    await user.type(nameInput, '多模态模板-自动保存');

    await waitFor(() => expect(templateUpdateBodies).toHaveLength(1), { timeout: 3000 });
    expect(templateUpdateBodies[0]).toMatchObject({
      name: '多模态模板-自动保存',
      auto_saved: true,
      schema: expect.objectContaining({
        tabs: expect.arrayContaining([
          expect.objectContaining({ title: '阅读材料' }),
          expect.objectContaining({ title: '标注答案' }),
        ]),
      }),
    });

    await user.click(screen.getByRole('button', { name: '保存草稿' }));

    await waitFor(() => expect(templateUpdateBodies).toHaveLength(2));
    expect(templateUpdateBodies[1]).toMatchObject({
      name: '多模态模板-自动保存',
      auto_saved: false,
    });
    await new Promise((resolve) => window.setTimeout(resolve, 1800));

    expect(templateUpdateBodies).toHaveLength(2);
  });

  it('publishes an enterprise task with ShowItem column mapping and assignment link', async () => {
    const user = userEvent.setup();
    const publishDatasetPayload = {
      ...datasetPayload,
      row_count: 10,
      columns: [
        ...datasetPayload.columns,
        { name: 'video_url', data_type: 'video', samples: ['https://cdn.example.com/video-1.mp4'], comment: '', use_in_mapping: true },
      ],
      media_schema: [{ type: 'video', role: 'primary', field: 'video_url', source: 'external_url' }],
      preview_rows: Array.from({ length: 10 }, (_, index) => ({ title: `合同条款 ${index + 1}`, image_url: `https://cdn.example.com/img-${index + 1}.png`, video_url: `https://cdn.example.com/video-${index + 1}.mp4` })),
      rows: Array.from({ length: 10 }, (_, index) => ({ title: `合同条款 ${index + 1}`, image_url: `https://cdn.example.com/img-${index + 1}.png`, video_url: `https://cdn.example.com/video-${index + 1}.mp4` })),
    };
    const publishTemplatePayload = {
      ...templatePayload,
      show_item_count: 2,
      schema: {
        ...templatePayload.schema,
        tabs: [
          {
            id: 'tab_read',
            title: '阅读材料',
            components: [
              {
                id: 'show_title',
                type: 'ShowItem',
                field: 'show_title',
                label: '标题',
                required: false,
                config: {
                  display_fields: [
                    { label: '标题', field: 'title', binding: { source_type: 'column', column_name: 'title', field: 'title' } },
                    { label: '视频', field: 'video_url', binding: { source_type: 'media', media_type: 'video', role: 'primary', field: 'video_url' } },
                  ],
                },
                options: [],
                version: '1.0',
              },
              { id: 'show_image', type: 'ShowItem', field: 'show_image', label: '图片', required: false, config: {}, options: [], version: '1.0' },
            ],
          },
          {
            id: 'tab_label',
            title: '标注答案',
            components: [
              {
                id: 'damage_mask',
                type: 'ImageMaskAnnotation',
                field: 'damage_mask',
                label: '图片区域',
                required: false,
                config: {
                  source_binding: { source_type: 'media', media_type: 'image', role: 'template', field: 'template_image' },
                  source_field: 'template_image',
                  mode: 'rect',
                },
                options: [],
                version: '1.0',
              },
            ],
          },
        ],
      },
    };
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    const taskDraftResponse = {
      ...taskPayload,
      task_id: 'task-1',
      status: 'draft',
      auto_saved: false,
      assignment: { enabled: true, url: '/tasks/assigned/abc', qr_text: '/tasks/assigned/abc', expire_at: '2026-05-31T00:00:00Z' },
    };
    const publishedTaskResponse = {
      ...taskDraftResponse,
      title: '多模态合同条款标注',
      status: 'published',
      auto_saved: false,
    };
    const reviewerMembersPayload = {
      items: [
        { user_id: 'reviewer-1', username: 'reviewer01', display_name: 'Reviewer One', email: 'reviewer@example.com', team_role: 'reviewer', team_role_label: '审核员', permission_count: 4, assigned_tasks: ['review-task-1'], assigned_task_count: 1, member_status: 'active', email_verified: true, actions: { can_edit: true, can_remove: true, can_disable: true }, joined_at: '2026-05-23T00:00:00Z' },
        { user_id: 'reviewer-2', username: 'reviewer02', display_name: 'Reviewer Two', email: 'reviewer2@example.com', team_role: 'reviewer', team_role_label: '审核员', permission_count: 4, assigned_tasks: ['review-task-2'], assigned_task_count: 1, member_status: 'active', email_verified: true, actions: { can_edit: true, can_remove: true, can_disable: true }, joined_at: '2026-05-24T00:00:00Z' },
      ],
      pagination: { page: 1, page_size: 100, total: 2, total_pages: 1 },
    };
    const labelerMembersPayload = {
      items: [
        { user_id: 'labeler-1', username: 'labeler01', display_name: 'Labeler One', email: 'labeler@example.com', team_role: 'labeler', team_role_label: '标注员', permission_count: 2, assigned_task_count: 0, member_status: 'active', email_verified: true, actions: { can_edit: true, can_remove: true, can_disable: true }, joined_at: '2026-05-25T00:00:00Z' },
        { user_id: 'labeler-2', username: 'labeler02', display_name: 'Labeler Two', email: 'labeler2@example.com', team_role: 'labeler', team_role_label: '标注员', permission_count: 2, assigned_task_count: 0, member_status: 'active', email_verified: true, actions: { can_edit: true, can_remove: true, can_disable: true }, joined_at: '2026-05-25T01:00:00Z' },
        { user_id: 'owner-1', username: 'owner01', display_name: 'Owner One', email: 'owner@example.com', team_role: 'owner', team_role_label: '任务发布者', permission_count: 6, assigned_task_count: 2, member_status: 'active', email_verified: true, actions: { can_edit: true, can_remove: true, can_disable: true }, joined_at: '2026-05-24T00:00:00Z' },
        { user_id: 'reviewer-1', username: 'reviewer01', display_name: 'Reviewer One', email: 'reviewer@example.com', team_role: 'reviewer', team_role_label: '审核员', permission_count: 4, assigned_tasks: ['review-task-1'], assigned_task_count: 1, member_status: 'active', email_verified: true, actions: { can_edit: true, can_remove: true, can_disable: true }, joined_at: '2026-05-23T00:00:00Z' },
        { user_id: 'labeler-disabled', username: 'labeler_disabled', display_name: 'Disabled Labeler', email: 'disabled-labeler@example.com', team_role: 'labeler', team_role_label: '标注员', permission_count: 2, assigned_task_count: 0, member_status: 'disabled', email_verified: true, actions: { can_edit: true, can_remove: true, can_disable: false }, joined_at: '2026-05-22T00:00:00Z' },
        { user_id: 'agent-1', username: 'aiagt_team1', display_name: 'Agent', email: undefined, team_role: 'agent', team_role_label: 'AI资源管理员', permission_count: 3, assigned_task_count: 0, member_status: 'active', email_verified: true, is_system_member: true, actions: { can_edit: false, can_remove: false, can_disable: false }, joined_at: '2026-05-21T00:00:00Z' },
      ],
      pagination: { page: 1, page_size: 100, total: 6, total_pages: 1 },
    };
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      const method = init?.method ?? 'GET';
      if (url.pathname === '/api/v1/teams/admin/overview') return apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] });
      if (url.pathname === '/api/v1/teams/team-1/members' && url.searchParams.get('role') === 'reviewer') return apiResponse(reviewerMembersPayload);
      if (url.pathname === '/api/v1/teams/team-1/members' && url.searchParams.get('role') === 'labeler') return apiResponse(labelerMembersPayload);
      if (url.pathname === '/api/v1/datasets') return apiResponse({ items: [publishDatasetPayload], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } });
      if (url.pathname === '/api/v1/templates') return apiResponse({ items: [publishTemplatePayload], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } });
      if (url.pathname === '/api/v1/tasks' && method === 'GET') return apiResponse({ items: [publishedTaskResponse], pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 } });
      if (url.pathname === '/api/v1/tasks' && method === 'POST') return apiResponse(taskDraftResponse);
      if (url.pathname === '/api/v1/tasks/task-1' && method === 'PUT') return apiResponse(taskDraftResponse);
      if (url.pathname === '/api/v1/tasks/difficulty/evaluate') return apiResponse({ difficulty: 'medium', label: '中等', confidence: 0.82, reason: '测试返回中等难度', signals: [], missing_fields: [], prompt: '' });
      if (url.pathname === '/api/v1/tasks/task-1/readiness') return apiResponse({ ready: true, checks: [], blockers: [], warnings: [], summary: { question_count: 1, show_item_count: 2, mapped_show_item_count: 2, reviewer_count: 2, ai_enabled: true } });
      if (url.pathname === '/api/v1/tasks/task-1/publish') return apiResponse(publishedTaskResponse);
      return apiResponse({});
    });

    render(<WorkspaceHarness initialPage="publish-task" />);

    expect(await screen.findByRole('heading', { name: '新建任务' })).toBeInTheDocument();
    expect(screen.getByText('基础信息', { selector: '.ant-steps-item-title' })).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('请输入任务标题'), '多模态合同条款标注');
    await user.type(screen.getByPlaceholderText('说明任务目标、标注口径和交付要求'), '根据文本、图片或音频素材完成混合标注。');
    const basicInfoSelects = screen.getAllByRole('combobox');
    await user.click(basicInfoSelects[0]);
    await user.click(await screen.findByText('文本', { selector: '.ant-select-item-option-content' }));
    await user.click(await screen.findByText('图片', { selector: '.ant-select-item-option-content' }));
    await user.keyboard('{Escape}');
    const tagInput = screen.getByPlaceholderText('输入单个标签，例如：法律合同');
    await user.type(tagInput, '合同');
    await user.click(screen.getByRole('button', { name: /添\s*加/ }));
    await user.type(tagInput, '多模态');
    await user.click(screen.getByRole('button', { name: /添\s*加/ }));
    await user.click(screen.getByLabelText('长期有效'));
    await user.click(screen.getByText('模板与数据', { selector: '.ant-steps-item-title' }));
    await user.click(screen.getAllByRole('combobox')[0]);
    await user.click(await screen.findByText(/多模态模板/));
    await user.click(screen.getAllByRole('combobox')[1]);
    await user.click(await screen.findByText(/混合素材数据集/));
    expect(await screen.findByText(/请补齐图片 Mask 底图来源/)).toBeInTheDocument();
    const mappingTables = document.querySelectorAll('.task-mapping-table');
    expect(mappingTables.length).toBeGreaterThanOrEqual(2);
    const maskSourceSelect = within(mappingTables[mappingTables.length - 1] as HTMLElement).getByRole('combobox');
    await user.click(maskSourceSelect);
    await user.click(await screen.findByText('image_url · image', { selector: '.ant-select-item-option-content' }));
    expect(await screen.findByText(/ShowItem 映射完成 2\/2，Mask 底图完成 1\/1/)).toBeInTheDocument();
    await user.click(screen.getByText('分发与奖励', { selector: '.ant-steps-item-title' }));
    await user.click(screen.getByText('企业内流转'));
    await user.click(screen.getByRole('combobox'));
    await waitFor(() => expect(document.querySelectorAll('.ant-select-item-option-content').length).toBeGreaterThanOrEqual(2));
    const labelerOptions = Array.from(document.querySelectorAll('.ant-select-item-option-content')).map((item) => item.textContent);
    expect(labelerOptions).toContain('Labeler One / labeler@example.com');
    expect(labelerOptions).toContain('Labeler Two / labeler2@example.com');
    expect(labelerOptions).not.toContain('Owner One / owner@example.com');
    expect(labelerOptions).not.toContain('Reviewer One / reviewer@example.com');
    expect(labelerOptions).not.toContain('Disabled Labeler / disabled-labeler@example.com');
    expect(labelerOptions).not.toContain('Agent');
    const selectLabeler = (label: string) => {
      const option = Array.from(document.querySelectorAll('.ant-select-item-option-content')).find((item) => item.textContent === label);
      expect(option).toBeTruthy();
      fireEvent.click(option!);
    };
    selectLabeler('Labeler One / labeler@example.com');
    selectLabeler('Labeler Two / labeler2@example.com');
    expect(await screen.findByText('Labeler 任务分配比例')).toBeInTheDocument();
    expect(screen.getAllByText('约 5 条')).toHaveLength(2);
    expect(screen.getByText('共 10 条，预览合计 10 条')).toBeInTheDocument();
    expect(screen.queryByText('所需资质领域')).not.toBeInTheDocument();
    expect(screen.queryByText('最低完成任务数')).not.toBeInTheDocument();
    const labelerAllocationList = document.querySelector('.reviewer-allocation-list');
    expect(labelerAllocationList).toBeTruthy();
    const labelerAllocationInputs = within(labelerAllocationList as HTMLElement).getAllByRole('spinbutton');
    await user.clear(labelerAllocationInputs[0]);
    await user.clear(labelerAllocationInputs[1]);
    await user.type(labelerAllocationInputs[0], '70');
    await user.type(labelerAllocationInputs[1], '30');
    expect(await screen.findByText('合计 100%')).toBeInTheDocument();
    await user.click(screen.getByText('包大小分配'));
    await user.click(screen.getByRole('combobox'));
    await user.click((await screen.findAllByText('司法')).at(-1)!);
    const pointInput = screen.getAllByRole('spinbutton').at(-1);
    expect(pointInput).toBeDefined();
    await user.clear(pointInput!);
    await user.type(pointInput!, '5');
    await user.click(screen.getByText('基础信息', { selector: '.ant-steps-item-title' }));
    await user.click(screen.getByRole('button', { name: /开始评估/ }));
    expect(await screen.findByText('中等')).toBeInTheDocument();
    await user.click(screen.getByText('人工复审', { selector: '.ant-steps-item-title' }));
    expect(await screen.findByText('人工复审 Reviewer')).toBeInTheDocument();
    const reviewerSelect = await screen.findByRole('combobox');
    fireEvent.mouseDown(reviewerSelect);
    await waitFor(() => expect(document.querySelectorAll('.ant-select-item-option-content').length).toBeGreaterThanOrEqual(2));
    const selectReviewer = (label: string) => {
      const option = Array.from(document.querySelectorAll('.ant-select-item-option-content')).find((item) => item.textContent === label);
      expect(option).toBeTruthy();
      fireEvent.click(option!);
    };
    selectReviewer('Reviewer One / reviewer@example.com');
    selectReviewer('Reviewer Two / reviewer2@example.com');
    expect(await screen.findByText('审核员百分比分配')).toBeInTheDocument();
    expect(screen.getAllByText('约 5 条')).toHaveLength(2);
    expect(screen.getByText('共 10 条，预览合计 10 条')).toBeInTheDocument();
    const allocationList = document.querySelector('.reviewer-allocation-list');
    expect(allocationList).toBeTruthy();
    const allocationInputs = within(allocationList as HTMLElement).getAllByRole('spinbutton');
    await user.clear(allocationInputs[0]);
    await user.clear(allocationInputs[1]);
    await user.type(allocationInputs[0], '60');
    await user.type(allocationInputs[1], '30');
    expect(await screen.findByText('合计 90%')).toBeInTheDocument();
    expect(screen.getAllByText('待合计 100%')).toHaveLength(2);
    expect(screen.getByText('多位 Reviewer 的工作量百分比必须合计 100%。')).toBeInTheDocument();
    await user.click(screen.getByText('确认发布', { selector: '.ant-steps-item-title' }));
    expect(screen.getByText('多位 Reviewer 的百分比分配需要合计 100%')).toBeInTheDocument();
    await user.click(screen.getByText('人工复审', { selector: '.ant-steps-item-title' }));
    const correctedAllocationList = document.querySelector('.reviewer-allocation-list');
    expect(correctedAllocationList).toBeTruthy();
    const correctedAllocationInputs = within(correctedAllocationList as HTMLElement).getAllByRole('spinbutton');
    await user.clear(correctedAllocationInputs[1]);
    await user.type(correctedAllocationInputs[1], '40');
    expect(await screen.findByText('合计 100%')).toBeInTheDocument();
    expect(screen.getByText('约 6 条')).toBeInTheDocument();
    expect(screen.getByText('约 4 条')).toBeInTheDocument();
    await user.click(screen.getByText('确认发布', { selector: '.ant-steps-item-title' }));
    const finalDescriptions = document.querySelector('.task-step-descriptions');
    expect(finalDescriptions).toBeTruthy();
    expect(within(finalDescriptions as HTMLElement).getByText('截止日期')).toBeInTheDocument();
    expect(within(finalDescriptions as HTMLElement).getByText('长期有效')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /发布任务/ }));
    const publishCheckDialog = await screen.findByRole('dialog', { name: '发布前检查' });
    expect(within(publishCheckDialog).getByText('截止日期：长期有效')).toBeInTheDocument();
    await user.click(within(publishCheckDialog).getByRole('button', { name: '确认发布' }));

    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([input]) => new URL(fetchUrl(input), 'http://localhost').pathname === '/api/v1/tasks/task-1/publish')).toBe(true));
    const taskWriteCalls = vi.mocked(fetch).mock.calls.filter(([input, init]) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      return (url.pathname === '/api/v1/tasks' && init?.method === 'POST')
        || (url.pathname === '/api/v1/tasks/task-1' && init?.method === 'PUT');
    });
    const finalTaskBody = JSON.parse(String(taskWriteCalls.at(-1)?.[1]?.body));
    expect(finalTaskBody.tags).toEqual(['合同', '多模态']);
    expect(finalTaskBody.category).toBe('multimodal');
    expect(finalTaskBody.qualification_rules.category_tags).toEqual(['text', 'image']);
    expect(finalTaskBody.column_mapping).toMatchObject({ show_title: 'title', show_image: 'image_url' });
    expect(finalTaskBody.mapping_config.show_title.display_fields).toHaveLength(2);
    expect(finalTaskBody.mapping_config.show_title.display_fields[0]).toMatchObject({ field: 'title', binding: { source_type: 'column', column_name: 'title' } });
    expect(finalTaskBody.mapping_config.show_title.display_fields[1]).toMatchObject({ field: 'video_url', binding: { source_type: 'media', media_type: 'video', role: 'primary', field: 'video_url' } });
    expect(finalTaskBody.mapping_config.damage_mask).toBeUndefined();
    expect(finalTaskBody.component_bindings.damage_mask.mask_image).toMatchObject({ source_type: 'column', column_name: 'image_url', field: 'image_url' });
    expect(finalTaskBody.reviewer_ids).toEqual(['reviewer-1', 'reviewer-2']);
    expect(finalTaskBody.review_config).toMatchObject({
      reviewer_allocations: [
        { reviewer_id: 'reviewer-1', quota: 60 },
        { reviewer_id: 'reviewer-2', quota: 40 },
      ],
    });
    expect(finalTaskBody.required_certs).toEqual(['司法']);
    expect(finalTaskBody.ai_config).toMatchObject({ enabled: false, review_threshold: 0 });
    expect(finalTaskBody.agreement_config).toMatchObject({ required: true, use_default_template: true });
    expect(finalTaskBody.claim_config).toMatchObject({ completion_hours: null, deadline_mode: 'long_term' });
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '任务管理' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('dialog', { name: '发布前检查' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '新建任务' })).not.toBeInTheDocument();
    expect(await screen.findByText('多模态合同条款标注')).toBeInTheDocument();
  });

  it('parses uploaded task agreement text into the publish wizard agreement body', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      const method = init?.method ?? 'GET';
      if (url.pathname === '/api/v1/teams/admin/overview') return apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] });
      if (url.pathname === '/api/v1/datasets') return apiResponse({ items: [datasetPayload], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } });
      if (url.pathname === '/api/v1/templates') return apiResponse({ items: [templatePayload], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } });
      if (url.pathname === '/api/v1/ai-resources/configs') return apiResponse({ items: [], pagination: { page: 1, page_size: 20, total: 0, total_pages: 1 }, summary: {} });
      if (url.pathname === '/api/v1/ai-resources/teams/team-1/wallet') return apiResponse({ team_id: 'team-1', balance_points: 0, spent_points: 0, updated_at: null });
      if (url.pathname === '/api/v1/tasks' && method === 'POST') return apiResponse({ ...taskPayload, task_id: 'task-1', status: 'draft', auto_saved: true });
      return apiResponse({});
    });

    render(<WorkspaceApp initialSession={adminSession} page="publish-task" />);

    expect(await screen.findByRole('heading', { name: '新建任务' })).toBeInTheDocument();
    await user.click(screen.getByText('用户协议', { selector: '.ant-steps-item-title' }));
    const uploadInput = document.querySelector('.task-agreement-form input[type="file"]') as HTMLInputElement;
    expect(uploadInput).toBeTruthy();
    await user.upload(uploadInput, new File(['第一条：请遵守任务协议。\n第二条：不得泄露数据。'], 'agreement.txt', { type: 'text/plain' }));

    await waitFor(() => {
      expect(screen.getByLabelText('使用默认任务用户协议模板')).not.toBeChecked();
      expect(screen.getByPlaceholderText('填写标注员领取任务前需要阅读并同意的协议内容')).toHaveValue('第一条：请遵守任务协议。\n第二条：不得泄露数据。');
    });
  });

  it('opens the task publish AI assistant and applies generated basic info changes', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      const method = init?.method ?? 'GET';
      if (url.pathname === '/api/v1/teams/admin/overview') return apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] });
      if (url.pathname === '/api/v1/teams/team-1/members' && url.searchParams.get('role') === 'reviewer') return apiResponse({ items: [], pagination: { page: 1, page_size: 100, total: 0, total_pages: 1 } });
      if (url.pathname === '/api/v1/datasets') return apiResponse({ items: [datasetPayload], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } });
      if (url.pathname === '/api/v1/templates') return apiResponse({ items: [templatePayload], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } });
      if (url.pathname === '/api/v1/ai-resources/configs') return apiResponse({ items: [providerPayload] });
      if (url.pathname === '/api/v1/ai-resources/teams/team-1/wallet') return apiResponse({ team_id: 'team-1', balance_points: 330, spent_points: 0, updated_at: '2026-06-02T00:00:00Z' });
      if (url.pathname === '/api/v1/ai/task-publish-assistant/chat' && method === 'POST') {
        return apiResponse({
          conversation_id: 'task-publish-ai-test',
          message: '已为你生成 1 项任务发布变更：生成任务标题与描述。',
          reasoning: '基础信息缺失，先补齐标题、描述和标签。',
          changes: [{
            id: 'change-basic',
            type: 'update_basic_info',
            step: 'basic_info',
            title: '生成任务标题与描述',
            description: '补全基础信息。',
            before: {},
            after: {
              title: 'AI 图片分类标注任务',
              description: '请判断图片质量并选择合适分类。',
              category_values: ['image'],
              difficulty: 'medium',
              tag_items: ['图片分类', 'AI 辅助'],
            },
            riskLevel: 'low',
            dependencies: [],
            selected: true,
            expanded: true,
          }],
          suggestions: ['推荐奖励策略'],
          readiness_preview: { blockers: [], warnings: [], canPublish: false },
          cost_preview: null,
          provider: { provider_id: 'provider-1', route_name: '法务审核主路由', model: 'gpt-4.1-mini' },
          fallback: null,
        });
      }
      return apiResponse({});
    });

    render(<WorkspaceApp initialSession={adminSession} page="publish-task" />);

    expect(await screen.findByRole('heading', { name: '新建任务' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '打开任务发布 AI' }));
    expect(await screen.findByText('MarkUp 任务发布 AI')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('向 AI 发送指令，例如：帮我创建一个图片分类标注任务'), '帮我创建一个图片分类标注任务');
    const aiModal = screen.getByText('MarkUp 任务发布 AI').closest('.ant-modal') as HTMLElement;
    await user.click(within(aiModal).getByRole('button', { name: '发送任务发布 AI 指令' }));
    expect(await screen.findByText('生成任务标题与描述')).toBeInTheDocument();
    await user.click(within(aiModal).getByRole('button', { name: '清除对话' }));
    expect(await screen.findByText('确定要清除当前对话吗？清除后对话记录和未应用的 AI 变更都将被移除。')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '确认清除' }));
    expect(within(aiModal).queryByText('生成任务标题与描述')).not.toBeInTheDocument();
    expect(within(aiModal).getByText('你说 AI 做')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('向 AI 发送指令，例如：帮我创建一个图片分类标注任务'), '帮我创建一个图片分类标注任务');
    await user.click(within(aiModal).getByRole('button', { name: '发送任务发布 AI 指令' }));
    expect(await screen.findByText('生成任务标题与描述')).toBeInTheDocument();
    await user.click(within(aiModal).getByRole('button', { name: /应\s*用/ }));

    expect(screen.getByPlaceholderText('请输入任务标题')).toHaveValue('AI 图片分类标注任务');
    expect(screen.getByPlaceholderText('说明任务目标、标注口径和交付要求')).toHaveValue('请判断图片质量并选择合适分类。');
    expect(screen.getByText('图片分类')).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([callInput]) => new URL(fetchUrl(callInput), 'http://localhost').pathname === '/api/v1/ai/task-publish-assistant/chat')).toBe(true);
  });

  it('opens auto-saved task drafts in the publish wizard with editable template mapping', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    const autoSavedTask = {
      ...taskPayload,
      title: '自动保存草稿',
      auto_saved: true,
      claim_config: { deadline_mode: 'long_term', completion_hours: 24 },
      agreement_config: { required: true, use_default_template: true, text: '默认协议' },
      column_mapping: { show_title: 'title', show_image: null },
    };
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      const method = init?.method ?? 'GET';
      if (url.pathname === '/api/v1/teams/admin/overview') return apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] });
      if (url.pathname === '/api/v1/tasks' && method === 'GET') return apiResponse({ items: [autoSavedTask], pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 } });
      if (url.pathname === '/api/v1/datasets') return apiResponse({ items: [datasetPayload], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } });
      if (url.pathname === '/api/v1/templates') return apiResponse({ items: [templatePayload], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } });
      if (url.pathname === '/api/v1/ai-resources/configs') return apiResponse({ items: [], pagination: { page: 1, page_size: 20, total: 0, total_pages: 1 }, summary: {} });
      if (url.pathname === '/api/v1/ai-resources/teams/team-1/wallet') return apiResponse({ team_id: 'team-1', balance_points: 0, spent_points: 0, updated_at: null });
      return apiResponse({});
    });

    render(<WorkspaceApp initialSession={adminSession} page="task-management" />);

    expect(await screen.findByRole('heading', { name: '任务管理' })).toBeInTheDocument();
    await user.click(await screen.findByText('自动保存草稿'));
    expect(await screen.findByRole('heading', { name: '自动保存草稿' })).toBeInTheDocument();
    expect(document.querySelector('.ant-form-item-required')?.textContent).toContain('任务标题');

    await user.click(screen.getByText('模板与数据', { selector: '.ant-steps-item-title' }));
    expect(await screen.findByText('模板已选中')).toBeInTheDocument();
    const templateAndDatasetSelects = screen.getAllByRole('combobox');
    expect(templateAndDatasetSelects[0]).toBeEnabled();
    expect(templateAndDatasetSelects[1]).toBeEnabled();
    await user.click(templateAndDatasetSelects.at(-1)!);
    expect((await screen.findAllByText('image_url')).length).toBeGreaterThan(1);
  });

  it('opens manually saved task drafts in the publish wizard with editable template and dataset', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    const manualDraftTask = {
      ...taskPayload,
      title: '手动保存草稿',
      status: 'draft',
      auto_saved: false,
      claim_config: { deadline_mode: 'long_term', completion_hours: null },
      column_mapping: { show_title: 'title', show_image: null },
    };
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      const method = init?.method ?? 'GET';
      if (url.pathname === '/api/v1/teams/admin/overview') return apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] });
      if (url.pathname === '/api/v1/tasks' && method === 'GET') return apiResponse({ items: [manualDraftTask], pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 } });
      if (url.pathname === '/api/v1/datasets') return apiResponse({ items: [datasetPayload], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } });
      if (url.pathname === '/api/v1/templates') return apiResponse({ items: [templatePayload], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } });
      if (url.pathname === '/api/v1/ai-resources/configs') return apiResponse({ items: [], pagination: { page: 1, page_size: 20, total: 0, total_pages: 1 }, summary: {} });
      if (url.pathname === '/api/v1/ai-resources/teams/team-1/wallet') return apiResponse({ team_id: 'team-1', balance_points: 0, spent_points: 0, updated_at: null });
      return apiResponse({});
    });

    render(<WorkspaceApp initialSession={adminSession} page="task-management" />);

    expect(await screen.findByRole('heading', { name: '任务管理' })).toBeInTheDocument();
    await user.click(await screen.findByText('手动保存草稿'));
    expect(await screen.findByRole('heading', { name: '手动保存草稿' })).toBeInTheDocument();
    expect(screen.getByText('Draft Task')).toBeInTheDocument();

    await user.click(screen.getByText('模板与数据', { selector: '.ant-steps-item-title' }));
    expect(await screen.findByText('模板已选中')).toBeInTheDocument();
    expect(screen.queryByText('模板 ID')).not.toBeInTheDocument();
    const templateAndDatasetSelects = screen.getAllByRole('combobox');
    expect(templateAndDatasetSelects[0]).toBeEnabled();
    expect(templateAndDatasetSelects[1]).toBeEnabled();
  });

  it('opens published tasks in a readonly detail view instead of blocking view access', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    const publishedTask = {
      ...taskPayload,
      task_id: 'task-published-readonly',
      title: '发布中只读任务',
      status: 'published',
      stats: { total: 10, claimed: 2, submitted: 1, approved: 1, rejected: 0 },
    };
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      const method = init?.method ?? 'GET';
      if (url.pathname === '/api/v1/teams/admin/overview') return apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] });
      if (url.pathname === '/api/v1/tasks' && method === 'GET') return apiResponse({ items: [publishedTask], pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 } });
      if (url.pathname === '/api/v1/datasets') return apiResponse({ items: [datasetPayload], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } });
      if (url.pathname === '/api/v1/templates') return apiResponse({ items: [templatePayload], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } });
      if (url.pathname === '/api/v1/tasks/task-published-readonly/questions') return apiResponse({ items: [], pagination: { page: 1, page_size: 20, total: 0, total_pages: 1 }, summary: {} });
      if (url.pathname === '/api/v1/exports') return apiResponse({ items: [], pagination: { page: 1, page_size: 20, total: 0, total_pages: 1 }, summary: {} });
      if (url.pathname === '/api/v1/audit-logs') return apiResponse({ items: [], pagination: { page: 1, page_size: 20, total: 0, total_pages: 1 }, summary: {} });
      return apiResponse({});
    });

    render(<WorkspaceApp initialSession={adminSession} page="task-management" />);

    expect(await screen.findByRole('heading', { name: '任务管理' })).toBeInTheDocument();
    await user.click(await screen.findByText('发布中只读任务'));

    expect(await screen.findByRole('heading', { name: '发布中只读任务' })).toBeInTheDocument();
    expect(screen.queryByText('请先暂停发放')).not.toBeInTheDocument();
    expect(screen.getByText('只读查看')).toBeInTheDocument();
    expect(screen.getByText('当前为只读查看')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /保存修改/ })).not.toBeInTheDocument();
  });

  it('keeps autosaved draft template and dataset editable when the bound template is no longer published', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    const archivedTemplate = {
      ...templatePayload,
      template_id: 'template-archived',
      name: '当前绑定归档模板',
      status: 'archived',
    };
    const nextTemplate = {
      ...templatePayload,
      template_id: 'template-next',
      name: '可切换发布模板',
      status: 'published',
    };
    const autoSavedTask = {
      ...taskPayload,
      title: '绑定旧模板草稿',
      template_id: archivedTemplate.template_id,
      auto_saved: true,
      claim_config: { deadline_mode: 'long_term', completion_hours: null },
      column_mapping: { show_title: 'title', show_image: null },
    };
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      const method = init?.method ?? 'GET';
      if (url.pathname === '/api/v1/teams/admin/overview') return apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] });
      if (url.pathname === '/api/v1/tasks' && method === 'GET') return apiResponse({ items: [autoSavedTask], pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 } });
      if (url.pathname === '/api/v1/datasets') return apiResponse({ items: [datasetPayload], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } });
      if (url.pathname === '/api/v1/templates') return apiResponse({ items: [archivedTemplate, nextTemplate], pagination: { page: 1, page_size: 2, total: 2, total_pages: 1 } });
      if (url.pathname === '/api/v1/ai-resources/configs') return apiResponse({ items: [], pagination: { page: 1, page_size: 20, total: 0, total_pages: 1 }, summary: {} });
      if (url.pathname === '/api/v1/ai-resources/teams/team-1/wallet') return apiResponse({ team_id: 'team-1', balance_points: 0, spent_points: 0, updated_at: null });
      return apiResponse({});
    });

    render(<WorkspaceApp initialSession={adminSession} page="task-management" />);

    expect(await screen.findByRole('heading', { name: '任务管理' })).toBeInTheDocument();
    await user.click(await screen.findByText('绑定旧模板草稿'));
    expect(await screen.findByRole('heading', { name: '绑定旧模板草稿' })).toBeInTheDocument();
    await user.click(screen.getByText('模板与数据', { selector: '.ant-steps-item-title' }));
    expect(await screen.findByText('模板已选中')).toBeInTheDocument();
    expect(screen.getByText('当前绑定模板不是已发布状态')).toBeInTheDocument();

    const templateAndDatasetSelects = screen.getAllByRole('combobox');
    expect(templateAndDatasetSelects[0]).toBeEnabled();
    expect(templateAndDatasetSelects[1]).toBeEnabled();
    await user.click(templateAndDatasetSelects[0]);
    await user.click(await screen.findByText(/可切换发布模板/));
    expect((await screen.findAllByText(/可切换发布模板 \/ published/)).length).toBeGreaterThan(0);
  });

  it('switches AI review matrix to read-only preview after confirmation', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    const matrixDraftTask = {
      ...taskPayload,
      title: 'AI 矩阵草稿',
      status: 'draft',
      auto_saved: false,
      claim_config: { deadline_mode: 'long_term', completion_hours: null },
      ai_config: {
        enabled: true,
        provider_id: 'provider-1',
        selected_dimensions: ['准确性'],
        custom_dimensions: [],
        input_prompt: '字段说明草案',
        review_matrix: [{
          key: 'accuracy',
          dimension: '准确性',
          definition: '定义：检查答案是否准确',
          scoring_standard: '评分标准：0 到 100',
          deduction_rule: '扣分规则：事实错误扣分',
          reject_condition: '打回条件：低于 60',
          manual_condition: '人工复核条件：60 到 84',
        }],
        matrix_confirmed: false,
        thresholds: { pass: 85, reject: 60, manual_min: 60, manual_max: 84 },
      },
    };
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(fetchUrl(input), 'http://localhost');
      const method = init?.method ?? 'GET';
      if (url.pathname === '/api/v1/teams/admin/overview') return apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] });
      if (url.pathname === '/api/v1/tasks' && method === 'GET') return apiResponse({ items: [matrixDraftTask], pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 } });
      if (url.pathname === '/api/v1/datasets') return apiResponse({ items: [datasetPayload], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } });
      if (url.pathname === '/api/v1/templates') return apiResponse({ items: [templatePayload], pagination: { page: 1, page_size: 1, total: 1, total_pages: 1 } });
      if (url.pathname === '/api/v1/ai-resources/configs') return apiResponse({ items: [providerPayload], pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 }, summary: {} });
      if (url.pathname === '/api/v1/ai-resources/teams/team-1/wallet') return apiResponse({ team_id: 'team-1', balance_points: 0, spent_points: 0, updated_at: null });
      if (url.pathname === '/api/v1/tasks/task-1' && method === 'PUT') return apiResponse(matrixDraftTask);
      return apiResponse({});
    });

    render(<WorkspaceApp initialSession={adminSession} page="task-management" />);

    expect(await screen.findByRole('heading', { name: '任务管理' })).toBeInTheDocument();
    await user.click(await screen.findByText('AI 矩阵草稿'));
    await user.click(screen.getByText('AI 预审', { selector: '.ant-steps-item-title' }));
    expect(await screen.findByDisplayValue('定义：检查答案是否准确')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /确认矩阵/ }));

    expect(await screen.findByRole('button', { name: /修改矩阵/ })).toBeInTheDocument();
    expect(screen.queryByDisplayValue('定义：检查答案是否准确')).not.toBeInTheDocument();
    expect(screen.getByText('定义：检查答案是否准确')).toBeInTheDocument();
  });

  it('sets a breadcrumb tail for the standalone task publish page', async () => {
    const onBreadcrumbTailChange = vi.fn();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/teams/admin/overview') return apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] });
      if (url.pathname === '/api/v1/datasets') return apiResponse({ items: [datasetPayload], pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 } });
      if (url.pathname === '/api/v1/templates') return apiResponse({ items: [templatePayload], pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 } });
      return apiResponse({});
    });

    render(<WorkspaceApp initialSession={adminSession} page="publish-task" onBreadcrumbTailChange={onBreadcrumbTailChange} />);

    expect(await screen.findByRole('heading', { name: '新建任务' })).toBeInTheDocument();
    expect(onBreadcrumbTailChange).toHaveBeenCalledWith(expect.objectContaining({
      key: 'publish-task',
      parentKey: 'task-management',
      label: '新建任务',
    }));
  });

  it('emits breadcrumb parentOnClick for task management detail states', async () => {
    const user = userEvent.setup();
    const onBreadcrumbTailChange = vi.fn();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation((input, init) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost').pathname;
      const method = init?.method ?? 'GET';
      if (url === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url === '/api/v1/tasks' && method === 'GET') return Promise.resolve(apiResponse({ items: [taskPayload], pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 } }));
      if (url === '/api/v1/tasks/task-1/questions' && method === 'GET') return Promise.resolve(apiResponse({ items: [questionPayload], pagination: { page: 1, page_size: 50, total: 1, total_pages: 1 } }));
      if (url === '/api/v1/audit-logs') return Promise.resolve(apiResponse({ items: [], pagination: { page: 1, page_size: 20, total: 0, total_pages: 1 } }));
      if (url === '/api/v1/exports') return Promise.resolve(apiResponse({ items: [], pagination: { page: 1, page_size: 20, total: 0, total_pages: 1 } }));
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="task-management" onBreadcrumbTailChange={onBreadcrumbTailChange} />);

    expect(await screen.findByRole('heading', { name: '任务管理' })).toBeInTheDocument();
    await user.click(await screen.findByText('草稿题目任务'));

    const detailTailCall = onBreadcrumbTailChange.mock.calls
      .map(([tail]) => tail)
      .find((tail) => tail && typeof tail === 'object' && 'parentOnClick' in tail && tail.parentKey === 'task-management');

    expect(detailTailCall).toEqual(expect.objectContaining({
      parentKey: 'task-management',
      parentOnClick: expect.any(Function),
    }));
  });

  it('emits breadcrumb parentOnClick for template designer detail states', async () => {
    const user = userEvent.setup();
    const onBreadcrumbTailChange = vi.fn();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation((input) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost').pathname;
      if (url === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url === '/api/v1/templates') return Promise.resolve(apiResponse({ items: [templatePayload], pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 } }));
      if (url === '/api/v1/datasets') return Promise.resolve(apiResponse({ items: [datasetPayload], pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 } }));
      if (url === '/api/v1/templates/template-1') return Promise.resolve(apiResponse(templatePayload));
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="templates" onBreadcrumbTailChange={onBreadcrumbTailChange} />);

    expect(await screen.findByRole('heading', { name: '模板搭建' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '新建模板' }));

    const designerTailCall = onBreadcrumbTailChange.mock.calls
      .map(([tail]) => tail)
      .find((tail) => tail && typeof tail === 'object' && 'parentOnClick' in tail && tail.parentKey === 'templates');

    expect(designerTailCall).toEqual(expect.objectContaining({
      parentKey: 'templates',
      parentOnClick: expect.any(Function),
    }));
  });

  it('shows row-level question import errors in task management', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation((input, init) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost').pathname;
      const method = init?.method ?? 'GET';
      if (url === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url === '/api/v1/tasks' && method === 'GET') return Promise.resolve(apiResponse({ items: [taskPayload], pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 } }));
      if (url === '/api/v1/tasks/task-1/questions' && method === 'GET') return Promise.resolve(apiResponse({ items: [questionPayload], pagination: { page: 1, page_size: 50, total: 1, total_pages: 1 } }));
      if (url === '/api/v1/audit-logs') return Promise.resolve(apiResponse({ items: [], pagination: { page: 1, page_size: 20, total: 0, total_pages: 1 } }));
      if (url === '/api/v1/exports') return Promise.resolve(apiResponse({ items: [], pagination: { page: 1, page_size: 20, total: 0, total_pages: 1 } }));
      if (url === '/api/v1/tasks/task-1/questions/import' && method === 'POST') {
        return Promise.resolve(apiErrorResponse('JSONL 数据行格式错误', { row_errors: [{ row: 2, error: '每一行必须是对象' }, { row: 3, error: 'Expecting value' }] }));
      }
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="task-management" />);

    expect(await screen.findByRole('heading', { name: '任务管理' })).toBeInTheDocument();
    await user.click(await screen.findByText('草稿题目任务'));
    expect(await screen.findByText('题目管理')).toBeInTheDocument();
    await user.click(screen.getByText('题目管理'));
    await user.click(screen.getByRole('button', { name: '导入题目' }));
    const file = new File(['{"show_title":"ok"}\n[]\n{"broken":\n'], 'bad-questions.jsonl', { type: 'application/x-ndjson' });
    const input = document.querySelector('.question-import-form input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);
    await user.click(screen.getByRole('button', { name: '开始导入' }));

    expect(await screen.findByText('导入失败行')).toBeInTheDocument();
    expect(screen.getByText('第 2 行：每一行必须是对象')).toBeInTheDocument();
    expect(screen.getByText('第 3 行：Expecting value')).toBeInTheDocument();
  });

  it('batch finishes published and paused tasks from task management', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation((input, init) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost').pathname;
      const method = init?.method ?? 'GET';
      if (url === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url === '/api/v1/tasks' && method === 'GET') return Promise.resolve(apiResponse({ items: taskListForBatchPayload, pagination: { page: 1, page_size: 20, total: 3, total_pages: 1 } }));
      if (url.endsWith('/status') && method === 'POST') return Promise.resolve(apiResponse({ ...taskPayload, task_id: url.split('/').at(-2), status: 'finished' }));
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="task-management" />);

    expect(await screen.findByRole('heading', { name: '任务管理' })).toBeInTheDocument();
    expect(await screen.findByText('发布中任务')).toBeInTheDocument();
    await user.click(screen.getAllByLabelText('Select all')[0]);
    expect(screen.getByText(/已选择/)).toBeInTheDocument();
    expect(screen.getByText(/可结束/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '批量结束' }));
    await user.click((await screen.findAllByRole('button', { name: '批量结束' })).at(-1)!);

    await waitFor(() => {
      const calls = vi.mocked(fetch).mock.calls.filter(([input, init]) => fetchUrl(input).includes('/api/v1/tasks/') && fetchUrl(input).endsWith('/status') && init?.method === 'POST');
      expect(calls).toHaveLength(2);
    });
    const statusCalls = vi.mocked(fetch).mock.calls.filter(([input, init]) => fetchUrl(input).includes('/api/v1/tasks/') && fetchUrl(input).endsWith('/status') && init?.method === 'POST');
    expect(statusCalls).toHaveLength(2);
    expect(statusCalls.map(([input]) => fetchUrl(input))).toEqual(expect.arrayContaining(['/api/v1/tasks/task-published/status', '/api/v1/tasks/task-paused/status']));
  });

  it('allows pausing a published task that still has claimed or rejected questions', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    const publishedTask = {
      ...taskPayload,
      task_id: 'task-published',
      title: '发布中任务',
      status: 'published',
      stats: { total: 20, claimed: 6, submitted: 4, approved: 3, rejected: 2 },
    };
    vi.mocked(fetch).mockImplementation((input, init) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost').pathname;
      const method = init?.method ?? 'GET';
      if (url === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url === '/api/v1/tasks' && method === 'GET') return Promise.resolve(apiResponse({ items: [publishedTask], pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 } }));
      if (url === '/api/v1/tasks/task-published/stats' && method === 'GET') {
        return Promise.resolve(apiResponse({
          task_id: 'task-published',
          status: 'published',
          quota: 20,
          stats: publishedTask.stats,
          question_count: 20,
          question_status_counts: { pending: 5, claimed: 6, submitted: 4, approved: 3, rejected: 2 },
        }));
      }
      if (url === '/api/v1/tasks/task-published/status' && method === 'POST') return Promise.resolve(apiResponse({ ...publishedTask, status: 'paused' }));
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="task-management" />);

    expect(await screen.findByRole('heading', { name: '任务管理' })).toBeInTheDocument();
    expect(await screen.findByText('发布中任务')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /更\s*多/ }));
    await user.click(await screen.findByText('暂停发放'));
    const confirmButton = await screen.findByRole('button', { name: '确认暂停发放' });
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);

    await waitFor(() => {
      expect(
        vi.mocked(fetch).mock.calls.some(
          ([input, init]) => fetchUrl(input) === '/api/v1/tasks/task-published/status' && init?.method === 'POST',
        ),
      ).toBe(true);
    });
  });

  it('batch creates export jobs for exportable tasks from task management', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation((input, init) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost').pathname;
      const method = init?.method ?? 'GET';
      if (url === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url === '/api/v1/tasks' && method === 'GET') return Promise.resolve(apiResponse({ items: taskListForBatchPayload, pagination: { page: 1, page_size: 20, total: 3, total_pages: 1 } }));
      if (url === '/api/v1/exports' && method === 'POST') {
        const body = JSON.parse(String(init?.body));
        return Promise.resolve(apiResponse({
          export_id: `export-${body.task_id}`,
          team_id: 'team-1',
          task_id: body.task_id,
          created_by: 'admin-1',
          format: body.format,
          filters: body.filters,
          fields_config: {},
          include_review_records: body.include_review_records,
          status: 'completed',
          progress: 100,
          filename: `${body.task_id}.jsonl`,
          file_size: 12,
          download_count: 0,
          created_at: '2026-05-29T00:00:00Z',
        }));
      }
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="task-management" />);

    expect(await screen.findByRole('heading', { name: '任务管理' })).toBeInTheDocument();
    expect(await screen.findByText('发布中任务')).toBeInTheDocument();
    await user.click(screen.getAllByLabelText('Select all')[0]);
    await user.click(screen.getByRole('button', { name: '批量导出' }));
    expect(await screen.findByText('批量创建导出任务')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '批量创建导出' }));

    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.filter(([input, init]) => fetchUrl(input) === '/api/v1/exports' && init?.method === 'POST')).toHaveLength(2);
    });
    const exportCalls = vi.mocked(fetch).mock.calls.filter(([input, init]) => fetchUrl(input) === '/api/v1/exports' && init?.method === 'POST');
    expect(exportCalls.map(([, init]) => JSON.parse(String(init?.body)).task_id)).toEqual(expect.arrayContaining(['task-published', 'task-paused']));
    expect(exportCalls.every(([, init]) => JSON.parse(String(init?.body)).filters.status === 'approved')).toBe(true);
  });

  it('opens task result export drawer from row actions and creates a mapped export job', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation((input, init) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost');
      const method = init?.method ?? 'GET';
      if (url.pathname === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url.pathname === '/api/v1/tasks' && method === 'GET') return Promise.resolve(apiResponse({ items: taskListForBatchPayload, pagination: { page: 1, page_size: 20, total: 3, total_pages: 1 } }));
      if (url.pathname === '/api/v1/exports' && method === 'GET') {
        return Promise.resolve(apiResponse({
          items: url.searchParams.get('task_id') === 'task-published'
            ? [{
                export_id: 'export-history',
                team_id: 'team-1',
                task_id: 'task-published',
                created_by: 'admin-1',
                format: 'csv',
                filters: { status: 'approved' },
                fields_config: {},
                include_review_records: true,
                status: 'completed',
                progress: 100,
                filename: 'published.csv',
                file_size: 24,
                download_count: 1,
                created_at: '2026-05-29T00:00:00Z',
              }]
            : [],
          pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 },
        }));
      }
      if (url.pathname === '/api/v1/exports' && method === 'POST') {
        const body = JSON.parse(String(init?.body));
        return Promise.resolve(apiResponse({
          export_id: 'export-created',
          team_id: 'team-1',
          task_id: body.task_id,
          created_by: 'admin-1',
          format: body.format,
          filters: body.filters,
          fields_config: body.fields_config,
          include_review_records: body.include_review_records,
          status: 'completed',
          progress: 100,
          filename: 'published.jsonl',
          file_size: 48,
          download_count: 0,
          created_at: '2026-05-29T00:00:00Z',
        }));
      }
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="task-management" />);

    expect(await screen.findByRole('heading', { name: '任务管理' })).toBeInTheDocument();
    expect(await screen.findByText('发布中任务')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /更\s*多/ })[0]);
    await user.click(await screen.findByText('查看结果 / 导出'));

    expect(await screen.findByText('结果查看与导出：发布中任务')).toBeInTheDocument();
    expect(await screen.findByText('published.csv')).toBeInTheDocument();
    await user.type(screen.getAllByPlaceholderText('留空保持原字段名')[0], '题目ID');
    await user.click(screen.getByRole('button', { name: '创建导出任务' }));

    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.some(([input, init]) => fetchUrl(input) === '/api/v1/exports' && init?.method === 'POST')).toBe(true);
    });
    const exportCall = vi.mocked(fetch).mock.calls.find(([input, init]) => fetchUrl(input) === '/api/v1/exports' && init?.method === 'POST');
    expect(exportCall).toBeTruthy();
    const body = JSON.parse(String(exportCall?.[1]?.body));
    expect(body.task_id).toBe('task-published');
    expect(body.format).toBe('jsonl');
    expect(body.include_review_records).toBe(true);
    expect(body.fields_config.include).toEqual(expect.arrayContaining(['question_id', 'content.*', 'answers.*', 'review_records']));
    expect(body.fields_config.rename.question_id).toBe('题目ID');
  });

  it('batch appends tags to selected tasks from task management', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation((input, init) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost').pathname;
      const method = init?.method ?? 'GET';
      if (url === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url === '/api/v1/tasks' && method === 'GET') return Promise.resolve(apiResponse({ items: taskListForBatchPayload, pagination: { page: 1, page_size: 20, total: 3, total_pages: 1 } }));
      if (url.startsWith('/api/v1/tasks/') && method === 'PUT') {
        const body = JSON.parse(String(init?.body));
        return Promise.resolve(apiResponse({ ...taskPayload, task_id: url.split('/').at(-1), tags: body.tags }));
      }
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="task-management" />);

    expect(await screen.findByRole('heading', { name: '任务管理' })).toBeInTheDocument();
    expect(await screen.findByText('发布中任务')).toBeInTheDocument();
    await user.click(screen.getAllByLabelText('Select all')[0]);
    await user.click(screen.getByRole('button', { name: '批量打标签' }));
    expect(await screen.findByText('批量追加标签')).toBeInTheDocument();
    await user.type(screen.getByLabelText('批量新增标签'), '重点项目, 本周交付, 交付');
    await user.click(screen.getByRole('button', { name: '追加标签' }));

    await waitFor(() => {
      const calls = vi.mocked(fetch).mock.calls.filter(([input, init]) => fetchUrl(input).includes('/api/v1/tasks/') && init?.method === 'PUT');
      expect(calls).toHaveLength(3);
    });
    const updateCalls = vi.mocked(fetch).mock.calls.filter(([input, init]) => fetchUrl(input).includes('/api/v1/tasks/') && init?.method === 'PUT');
    expect(updateCalls).toHaveLength(3);
    const publishedBody = JSON.parse(String(updateCalls.find(([input]) => fetchUrl(input).endsWith('/task-published'))?.[1]?.body));
    expect(publishedBody.tags).toEqual(['交付', '重点项目', '本周交付']);
  });

  it('transfers task owner from task management row actions', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation((input, init) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost').pathname;
      const method = init?.method ?? 'GET';
      if (url === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url === '/api/v1/tasks' && method === 'GET') return Promise.resolve(apiResponse({ items: [taskPayload], pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 } }));
      if (url === '/api/v1/teams/team-1/members' && method === 'GET') return Promise.resolve(apiResponse(memberListPayload));
      if (url === '/api/v1/tasks/task-1/owner-transfer' && method === 'POST') {
        const body = JSON.parse(String(init?.body));
        return Promise.resolve(apiResponse({ ...taskPayload, owner_id: body.target_owner_id }));
      }
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="task-management" />);

    expect(await screen.findByRole('heading', { name: '任务管理' })).toBeInTheDocument();
    expect(await screen.findByText('草稿题目任务')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /更\s*多/ }));
    await user.click(await screen.findByText('转交负责人'));
    expect(await screen.findByText('转交任务负责人')).toBeInTheDocument();
    expect(screen.queryByText('负责人转交只迁移任务 owner，不改变题目领取、审核员分配或任务状态；操作会写入任务操作日志。')).not.toBeInTheDocument();
    const targetOwnerSelect = screen.getByLabelText('目标负责人账号').closest('.ant-select') as HTMLElement;
    expect(targetOwnerSelect).toHaveClass('task-owner-transfer-select');
    expect(targetOwnerSelect).toHaveStyle({ width: '100%' });
    fireEvent.mouseDown(screen.getByLabelText('目标负责人账号'));
    await user.click(await screen.findByText(/Owner One/));
    await user.type(screen.getByLabelText('转交原因'), '项目交接');
    await user.click(screen.getByRole('button', { name: '确认转交' }));

    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.some(([input, init]) => fetchUrl(input) === '/api/v1/tasks/task-1/owner-transfer' && init?.method === 'POST')).toBe(true);
    });
    const transferCall = vi.mocked(fetch).mock.calls.find(([input, init]) => fetchUrl(input) === '/api/v1/tasks/task-1/owner-transfer' && init?.method === 'POST');
    expect(JSON.parse(String(transferCall?.[1]?.body))).toEqual({ target_owner_id: 'owner-1', reason: '项目交接' });
  });

  it('updates internal labeler assignment with allocation percentages from row actions', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    const internalTask = {
      ...taskPayload,
      status: 'published',
      distribution: 'quota_grab',
      assignment: {
        enabled: false,
        target_labeler_ids: ['labeler-1', 'labeler-2'],
        target_labeler_allocations: [
          { labeler_id: 'labeler-1', quota: 60 },
          { labeler_id: 'labeler-2', quota: 40 },
        ],
      },
      stats: { total: 10, claimed: 0, submitted: 0, approved: 0, rejected: 0 },
    };
    const labelerMemberListPayload = {
      ...memberListPayload,
      items: [
        ...memberListPayload.items,
        { user_id: 'labeler-1', username: 'labeler01', display_name: 'Labeler One', email: 'labeler1@example.com', team_role: 'labeler', team_role_label: '标注员', permission_count: 2, assigned_task_count: 0, member_status: 'active', email_verified: true, actions: { can_edit: true, can_remove: true, can_disable: true }, joined_at: '2026-05-21T00:00:00Z' },
        { user_id: 'labeler-2', username: 'labeler02', display_name: 'Labeler Two', email: 'labeler2@example.com', team_role: 'labeler', team_role_label: '标注员', permission_count: 2, assigned_task_count: 0, member_status: 'active', email_verified: true, actions: { can_edit: true, can_remove: true, can_disable: true }, joined_at: '2026-05-21T00:00:00Z' },
        { user_id: 'labeler-disabled', username: 'labeler_disabled', display_name: 'Disabled Labeler', email: 'disabled-labeler@example.com', team_role: 'labeler', team_role_label: '标注员', permission_count: 2, assigned_task_count: 0, member_status: 'disabled', email_verified: true, actions: { can_edit: true, can_remove: true, can_disable: false }, joined_at: '2026-05-21T00:00:00Z' },
      ],
    };
    vi.mocked(fetch).mockImplementation((input, init) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost').pathname;
      const method = init?.method ?? 'GET';
      if (url === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url === '/api/v1/tasks' && method === 'GET') return Promise.resolve(apiResponse({ items: [internalTask], pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 } }));
      if (url === '/api/v1/teams/team-1/members' && method === 'GET') return Promise.resolve(apiResponse(labelerMemberListPayload));
      if (url === '/api/v1/tasks/task-1/internal-labelers' && method === 'PUT') {
        const body = JSON.parse(String(init?.body));
        return Promise.resolve(apiResponse({ ...internalTask, assignment: { ...internalTask.assignment, ...body } }));
      }
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="task-management" />);

    expect(await screen.findByRole('heading', { name: '任务管理' })).toBeInTheDocument();
    expect(await screen.findByText('草稿题目任务')).toBeInTheDocument();
    await clickWorkspaceMoreMenuItem(user, '分配企业 Labeler');
    await waitFor(() => {
      expect(screen.getAllByText('分配企业 Labeler').some((item) => item.closest('.ant-modal'))).toBe(true);
    });
    const internalLabelerDialog = screen.getAllByText('分配企业 Labeler').find((item) => item.closest('.ant-modal'))?.closest('.ant-modal');
    expect(internalLabelerDialog).toBeInTheDocument();
    expect(screen.queryByText('企业内流转不分配积分')).not.toBeInTheDocument();
    expect(screen.queryByText('指定名单只影响企业项目可见性和后续领取；不选择则所有 active 企业 Labeler 均可处理该任务。')).not.toBeInTheDocument();
    expect(screen.getByText('Labeler 任务分配比例')).toBeInTheDocument();
    expect(screen.getByText('合计 100%')).toBeInTheDocument();
    const modalLabelerCombobox = within(document.body).getAllByRole('combobox').find((combobox) => {
      const modal = combobox.closest('.ant-modal');
      return modal === internalLabelerDialog;
    });
    expect(modalLabelerCombobox).toBeInTheDocument();
    fireEvent.mouseDown(modalLabelerCombobox as HTMLElement);
    await waitFor(() => expect(document.querySelectorAll('.ant-select-item-option-content').length).toBeGreaterThanOrEqual(2));
    const modalLabelerOptions = Array.from(document.querySelectorAll('.ant-select-item-option-content')).map((item) => item.textContent);
    expect(modalLabelerOptions).toContain('Labeler One / labeler1@example.com');
    expect(modalLabelerOptions).toContain('Labeler Two / labeler2@example.com');
    expect(modalLabelerOptions).not.toContain('Reviewer One / reviewer@example.com');
    expect(modalLabelerOptions).not.toContain('Disabled Labeler / disabled-labeler@example.com');
    await user.keyboard('{Escape}');
    const labelerTwoRow = screen.getByText('Labeler Two').closest('.reviewer-allocation-row') as HTMLElement;
    const labelerTwoInput = within(labelerTwoRow).getByRole('spinbutton');
    await user.clear(labelerTwoInput);
    await user.type(labelerTwoInput, '50');
    const labelerOneRow = screen.getByText('Labeler One').closest('.reviewer-allocation-row') as HTMLElement;
    const labelerOneInput = within(labelerOneRow).getByRole('spinbutton');
    await user.clear(labelerOneInput);
    await user.type(labelerOneInput, '50');
    await user.click(screen.getByRole('button', { name: '保存分配' }));

    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.some(([input, init]) => fetchUrl(input) === '/api/v1/tasks/task-1/internal-labelers' && init?.method === 'PUT')).toBe(true);
    });
    const assignmentCall = vi.mocked(fetch).mock.calls.find(([input, init]) => fetchUrl(input) === '/api/v1/tasks/task-1/internal-labelers' && init?.method === 'PUT');
    expect(JSON.parse(String(assignmentCall?.[1]?.body))).toEqual({
      target_labeler_ids: ['labeler-1', 'labeler-2'],
      target_labeler_allocations: [
        { labeler_id: 'labeler-1', quota: 50 },
        { labeler_id: 'labeler-2', quota: 50 },
      ],
    });
  });

  it('copies a task from task management row actions and opens the draft copy', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    const copiedTask = { ...taskPayload, task_id: 'task-copy', title: '草稿题目任务 副本', status: 'draft' };
    vi.mocked(fetch).mockImplementation((input, init) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost').pathname;
      const method = init?.method ?? 'GET';
      if (url === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url === '/api/v1/tasks' && method === 'GET') {
        const hasCopied = vi.mocked(fetch).mock.calls.some(([calledInput, calledInit]) => fetchUrl(calledInput) === '/api/v1/tasks/task-1/copy' && calledInit?.method === 'POST');
        return Promise.resolve(apiResponse({ items: hasCopied ? [copiedTask, taskPayload] : [taskPayload], pagination: { page: 1, page_size: 20, total: hasCopied ? 2 : 1, total_pages: 1 } }));
      }
      if (url === '/api/v1/tasks/task-1/copy' && method === 'POST') return Promise.resolve(apiResponse(copiedTask));
      if (url === '/api/v1/tasks/task-copy/questions' && method === 'GET') return Promise.resolve(apiResponse({ items: [questionPayload], pagination: { page: 1, page_size: 50, total: 1, total_pages: 1 } }));
      if (url === '/api/v1/audit-logs') return Promise.resolve(apiResponse({ items: [], pagination: { page: 1, page_size: 20, total: 0, total_pages: 1 } }));
      if (url === '/api/v1/exports') return Promise.resolve(apiResponse({ items: [], pagination: { page: 1, page_size: 20, total: 0, total_pages: 1 } }));
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="task-management" />);

    expect(await screen.findByRole('heading', { name: '任务管理' })).toBeInTheDocument();
    expect(await screen.findByText('草稿题目任务')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /更\s*多/ }));
    await user.click(await screen.findByText('复制任务'));

    expect(await screen.findByRole('heading', { name: '草稿题目任务 副本' })).toBeInTheDocument();
    const copyCall = vi.mocked(fetch).mock.calls.find(([input, init]) => fetchUrl(input) === '/api/v1/tasks/task-1/copy' && init?.method === 'POST');
    expect(copyCall).toBeTruthy();
    expect(JSON.parse(String(copyCall?.[1]?.body))).toEqual({});
  });

  it('exports filtered task list metadata from task management header', async () => {
    const user = userEvent.setup();
    persistSession({
      access_token: adminSession.accessToken,
      refresh_token: adminSession.refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
      user: adminSession.user,
    });
    vi.mocked(fetch).mockImplementation((input, init) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost');
      const method = init?.method ?? 'GET';
      if (url.pathname === '/api/v1/teams/admin/overview') return Promise.resolve(apiResponse({ teams: [teamDetail], default_team_id: 'team-1', team_count: 1, notifications: [] }));
      if (url.pathname === '/api/v1/tasks' && method === 'GET') return Promise.resolve(apiResponse({ items: [taskPayload], pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 } }));
      if (url.pathname === '/api/v1/tasks/export') return Promise.resolve(blobResponse('task_id,title\n task-1,草稿题目任务\n'));
      return Promise.resolve(apiResponse(null));
    });

    render(<WorkspaceApp initialSession={adminSession} page="task-management" />);

    expect(await screen.findByRole('heading', { name: '任务管理' })).toBeInTheDocument();
    expect(await screen.findByText('草稿题目任务')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '导出任务清单' }));
    await user.click(await screen.findByText('导出 CSV 清单'));

    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.some(([input]) => fetchUrl(input).includes('/api/v1/tasks/export'))).toBe(true);
    });
    const exportCall = vi.mocked(fetch).mock.calls.find(([input]) => fetchUrl(input).includes('/api/v1/tasks/export'));
    expect(exportCall).toBeTruthy();
    expect(fetchUrl(exportCall![0])).toContain('format=csv');
  });
});
