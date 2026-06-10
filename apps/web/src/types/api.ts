export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
  request_id: string | null;
  timestamp: string;
}

export interface ApiErrorEnvelope {
  code: number;
  message: string;
  detail?: unknown;
  request_id?: string | null;
  timestamp?: string;
}

export interface PaginationPayload {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface ApiUser {
  user_id: string;
  username: string;
  display_name?: string | null;
  email: string;
  role: 'admin' | 'labeler' | 'reviewer' | 'owner' | 'team_admin' | 'platform_admin' | 'agent' | string;
  avatar?: string | null;
  email_verified?: boolean;
  permissions: string[];
  team_id?: string | null;
  default_team_id?: string | null;
  team_name?: string | null;
  default_team_name?: string | null;
  team_role?: 'owner' | 'reviewer' | 'labeler' | 'team_admin' | 'agent' | string | null;
  team_role_label?: string | null;
  created_at?: string | null;
}

export interface BillingInfo {
  invoice_type?: string | null;
  invoice_title?: string | null;
  tax_number?: string | null;
  invoice_address?: string | null;
  invoice_phone?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  invoice_email?: string | null;
  invoice_remark?: string | null;
}

export interface MailingInfo {
  recipient_name?: string | null;
  recipient_phone?: string | null;
  region?: string | null;
  detail_address?: string | null;
  postal_code?: string | null;
  address_alias?: string | null;
  is_default?: boolean | null;
}

export type TaskQualification =
  | 'none'
  | 'law'
  | 'medical'
  | 'finance'
  | 'code'
  | 'autonomous_driving'
  | 'audio'
  | 'fact_check';

export interface PublicTask {
  task_id: string;
  team_id?: string;
  title: string;
  category: 'text' | 'image' | 'audio' | 'multimodal';
  description: string;
  unit_points: number;
  bundle_options: number[];
  available_items: number;
  deadline?: string | null;
  deadline_mode?: 'date' | 'long_term' | string;
  completion_hours?: number | null;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
  status: 'open' | 'in_progress' | 'closed';
  owner_team_name?: string | null;
  estimated_minutes: number;
  published_at: string;
  priority: 'recommended' | 'urgent' | 'new' | 'standard';
  team_verified: boolean;
  distribution?: 'first_come_all' | 'quota_grab' | 'assigned_link' | string;
  deliverable: string;
  qualification_required: TaskQualification;
  review_notes: string;
  agreement_config?: {
    required?: boolean;
    use_default_template?: boolean;
    text?: string | null;
    file_name?: string | null;
  };
}

export interface PublicTasksResponse {
  items: PublicTask[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

export interface TaskQualificationCheckPayload {
  task_id: string;
  eligible: boolean;
  qualification_required: TaskQualification;
  checks: Array<{
    key: string;
    label: string;
    required: string | number;
    actual: string | number;
    passed: boolean;
    message: string;
  }>;
  failed_checks: Array<{
    key: string;
    label: string;
    required: string | number;
    actual: string | number;
    passed: boolean;
    message: string;
  }>;
  summary: string;
}

export interface LabelerContributionsPayload {
  summary: {
    claimed_questions: number;
    pending_questions: number;
    total_submissions: number;
    submitted: number;
    approved: number;
    rejected: number;
    accuracy_rate: number;
    earned_points: number;
    estimated_points: number;
  };
  recent_items: Array<{
    submission_id: string;
    task_id: string;
    task_title: string;
    question_id: string;
    row_index?: number | null;
    status: string;
    unit_points: number;
    submitted_at?: string | null;
    updated_at?: string | null;
    progress?: LabelingWorkbenchPayload['progress'];
    status_counts?: {
      submitted: number;
      approved: number;
      rejected: number;
    };
    questions?: Array<{
      question_id: string;
      row_index: number;
      status: string;
      question_status?: string | null;
      content_summary?: string | null;
      submitted_at?: string | null;
      updated_at?: string | null;
    }>;
  }>;
}

export interface LabelerTaskListPayload {
  items: Array<{
    task: LabelingWorkbenchPayload['task'];
    progress: LabelingWorkbenchPayload['progress'];
    latest_question_id?: string | null;
    last_updated_at?: string | null;
    task_submitted?: boolean;
    needs_revision?: boolean;
  }>;
  summary: {
    total_tasks: number;
    active_tasks: number;
    submitted_questions: number;
    pending_questions: number;
    rejected_questions: number;
  };
}

export interface LabelerDashboardSummaryCard {
  key: string;
  label: string;
  value: number | string;
  status: 'success' | 'processing' | 'warning' | 'error' | string;
  hint?: string;
}

export interface LabelerDashboardTodoItem {
  key: string;
  type: 'success' | 'info' | 'warning' | 'error' | string;
  title: string;
  count: number;
  target_page?: string;
}

export interface LabelerDashboardShortcut {
  key: string;
  label: string;
  target_page?: string;
  target_url?: string;
  kind: 'primary' | 'default' | string;
}

export interface LabelerDashboardProfile {
  user_id: string;
  username: string;
  display_name: string;
  avatar?: string | null;
  email?: string | null;
  basic_info_status?: string | null;
  reputation_score?: number;
  labeler_account?: ProfilePayload['labeler_account'];
}

export interface LabelerDashboardLabeling {
  total_tasks: number;
  active_tasks: number;
  total_questions: number;
  pending_questions: number;
  submitted_questions: number;
  approved_questions: number;
  rejected_questions: number;
  completion_percent: number;
  status_distribution: Array<{ label: string; value: number }>;
  submission_distribution: Array<{ label: string; value: number }>;
}

export interface LabelerDashboardQuality {
  approval_rate: number;
  rework_rate: number;
  pending_review: number;
  reviewed: number;
  accuracy_rate: number;
}

export interface TeamLabelerDashboardPayload {
  viewer_role: 'team_labeler';
  team: {
    team_id: string;
    company_name: string;
    status?: string | null;
    verification_status?: string | null;
  };
  profile: LabelerDashboardProfile;
  summary_cards: LabelerDashboardSummaryCard[];
  todo_items: LabelerDashboardTodoItem[];
  labeling: LabelerDashboardLabeling;
  quality: LabelerDashboardQuality;
  recent_tasks: LabelerTaskListPayload['items'];
  recent_records: LabelerContributionsPayload['recent_items'];
  notifications: NotificationPayload[];
  shortcuts: LabelerDashboardShortcut[];
  generated_at: string;
}

export interface PersonalLabelerDashboardPayload {
  viewer_role: 'personal_labeler';
  profile: LabelerDashboardProfile;
  summary_cards: LabelerDashboardSummaryCard[];
  todo_items: LabelerDashboardTodoItem[];
  labeling: LabelerDashboardLabeling;
  quality: LabelerDashboardQuality;
  points: {
    wallet: PointsPayload['wallet'];
    overview?: PointsPayload['overview'];
    recent_items: PointsPayload['items'];
  };
  certifications: {
    summary?: NonNullable<ProfilePayload['labeler_account']>['certifications'];
    items: Array<{
      certification_id: string;
      cert_category: string;
      cert_type: string;
      cert_name: string;
      status: string;
      reviewer_notes?: string | null;
      created_at?: string | null;
    }>;
  };
  recent_tasks: LabelerTaskListPayload['items'];
  recent_records: LabelerContributionsPayload['recent_items'];
  recommended_tasks: PublicTask[];
  shortcuts: LabelerDashboardShortcut[];
  generated_at: string;
}

export interface ReviewQueueItem {
  submission_id: string;
  task_id: string;
  task_title: string;
  question_id: string;
  row_index: number;
  labeler_id: string;
  labeler_name?: string | null;
  status: string;
  current_round: number;
  title?: string | null;
  summary?: string | null;
  tags?: string[];
  responsible_reviewers?: Array<{
    user_id: string;
    display_name: string;
    email?: string | null;
    assignment_type?: string | null;
  }>;
  responsible_reviewer_ids?: string[];
  responsible_reviewer_names?: string[];
  ai_review?: AiReviewJobPayload | null;
  ai_status?: string | null;
  ai_score?: number | string | null;
  ai_suggestion?: 'pass' | 'reject' | 'manual' | string | null;
  ai_reason?: string | null;
  risk_flags?: string[];
  submitted_at?: string | null;
  updated_at?: string | null;
}

export interface ReviewQueueResponse {
  items: ReviewQueueItem[];
  summary: {
    pending: number;
    rounds: number[];
    tasks: number;
    ai_suggestions?: {
      pass: number;
      reject: number;
      manual: number;
    };
  };
}

export interface ReviewStatsResponse {
  pending: number;
  completed: number;
  approved: number;
  rejected: number;
  total_visible: number;
  task_count: number;
  by_status: Record<string, number>;
}

export interface ReviewSubmissionDetail {
  submission: LabelingSubmissionPayload;
  task: TaskPayload;
  question: TaskQuestionPayload;
  ai_review?: AiReviewJobPayload | null;
  review_context: {
    current_round: number;
    decision_options: string[];
    comment_required_for: string[];
  };
}

export interface ReviewHistoryResponse {
  submission_id: string;
  task_id: string;
  question_id: string;
  items: Array<{
    history_id: string;
    round: number;
    stage: string;
    decision?: string | null;
    comment?: string | null;
    operator_id?: string | null;
    operator_name?: string | null;
    action: string;
    created_at?: string | null;
    changes: Record<string, unknown>;
  }>;
  summary: {
    total: number;
    current_round: number;
  };
}

export interface ReviewDiffResponse {
  submission_id: string;
  task_id: string;
  question_id: string;
  base: string;
  target: string;
  items: Array<{
    field: string;
    change_type: 'added' | 'removed' | 'changed' | 'unchanged' | string;
    previous_value: unknown;
    current_value: unknown;
  }>;
  summary: {
    changed: number;
    unchanged: number;
  };
}

export interface BatchReviewResponse {
  decision: 'approved' | 'rejected' | 'revise';
  total: number;
  success_count: number;
  failed_count: number;
  results: Array<{
    submission_id: string;
    status: 'success' | 'failed' | string;
    code?: number;
    message?: string;
    submission?: LabelingSubmissionPayload;
  }>;
}

export interface AiReviewJobPayload {
  job_id: string;
  team_id: string;
  task_id: string;
  submission_id: string;
  question_id: string;
  labeler_id: string;
  prompt?: string | null;
  dimensions: Array<Record<string, unknown>>;
  status: 'pending' | 'processing' | 'completed' | 'failed' | string;
  retry_count: number;
  result: Record<string, unknown>;
  error?: string | null;
  idempotency_key: string;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AiReviewJobsResponse {
  items: AiReviewJobPayload[];
  summary: {
    total: number;
    pending: number;
    processing?: number;
    failed: number;
    by_status: Record<string, number>;
    concurrency?: AiReviewConcurrencyPayload;
    ai_suggestions?: {
      pass?: number;
      reject?: number;
      manual?: number;
    };
  };
}

export interface AiReviewConcurrencyPayload {
  limit: number;
  processing: number;
  available: number;
  queued: number;
}

export interface AiReviewTaskOverviewPayload {
  task_id: string;
  team_id: string;
  title: string;
  description?: string | null;
  status: string;
  owner_id: string;
  ai_enabled: boolean;
  provider_id?: string | null;
  provider_name?: string | null;
  model?: string | null;
  total_questions: number;
  submission_total: number;
  submitted_count: number;
  job_total: number;
  coverage_rate: number;
  status_counts: Record<string, number>;
  suggestion_counts: Record<string, number>;
  pending_count: number;
  processing_count: number;
  completed_count: number;
  failed_count: number;
  manual_count: number;
  last_activity_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AiReviewTaskOverviewResponse {
  items: AiReviewTaskOverviewPayload[];
  summary: {
    task_total: number;
    ai_enabled: number;
    job_total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    manual: number;
    status_counts: Record<string, number>;
    suggestion_counts: Record<string, number>;
    concurrency?: AiReviewConcurrencyPayload;
  };
  pagination: PaginationPayload;
}

export interface AiReviewTaskSubmissionPayload {
  submission_id: string;
  task_id: string;
  question_id: string;
  labeler_id: string;
  submission_status: string;
  question_status?: string | null;
  ai_job?: AiReviewJobPayload | null;
  ai_status: 'not_created' | 'pending' | 'processing' | 'completed' | 'failed' | string;
  ai_suggestion?: 'pass' | 'reject' | 'manual' | string | null;
  ai_score?: number | string | null;
  ai_reason?: string | null;
  error?: string | null;
  retry_count: number;
  submitted_at?: string | null;
  updated_at?: string | null;
}

export interface AiReviewTaskSubmissionsResponse {
  task: AiReviewTaskOverviewPayload;
  items: AiReviewTaskSubmissionPayload[];
  summary: {
    submission_total: number;
    job_total: number;
    status_counts: Record<string, number>;
    suggestion_counts: Record<string, number>;
    concurrency?: AiReviewConcurrencyPayload;
  };
  pagination: PaginationPayload;
}

export interface BatchTriggerAiReviewResponse {
  total: number;
  success_count: number;
  failed_count: number;
  results: Array<{
    submission_id: string;
    status: 'success' | 'failed' | string;
    code?: number;
    message?: string;
    job?: AiReviewJobPayload;
  }>;
}

export interface LoginRequest {
  account: string;
  password: string;
}

export interface SendEmailCodeRequest {
  email: string;
  purpose: 'register' | 'bind_email' | 'reset_password' | 'team_payment_password_reset';
}

export interface RegisterRequest {
  display_name: string;
  username: string;
  email: string;
  password: string;
  role: 'pending' | 'owner' | 'labeler' | 'reviewer';
  email_code: string;
}

export interface AdminRegisterRequest {
  display_name: string;
  username: string;
  email: string;
  password: string;
  email_code: string;
}

export interface ResetPasswordRequest {
  email: string;
  email_code: string;
  new_password: string;
}

export interface LoginPayload {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: 'Bearer' | string;
  user: ApiUser;
  needs_email_binding?: false;
  needs_account_link?: false;
}

export interface OAuthEmailBindingPayload {
  needs_email_binding: true;
  provider: 'github' | 'google' | 'huggingface' | string;
  suggested_username?: string | null;
  bind_ticket: string;
}

export interface OAuthAccountChoicePayload {
  needs_account_link: true;
  provider: 'github' | 'google' | 'huggingface' | string;
  suggested_username?: string | null;
  suggested_email?: string | null;
  email_verified_by_provider: boolean;
  has_matching_user: boolean;
  bind_ticket: string;
}

export type OAuthIntent = 'login' | 'bind_current_user';

export interface OAuthLinkAccountRequest {
  ticket: string;
  account: string;
  password: string;
}

export interface OAuthLinkCurrentUserRequest {
  ticket: string;
}

export interface OAuthRegisterAccountRequest {
  ticket: string;
  display_name: string;
  username: string;
  email?: string;
  email_code?: string;
  password: string;
  role: 'pending';
}

export type OAuthExchangePayload = LoginPayload | OAuthEmailBindingPayload | OAuthAccountChoicePayload;

export interface OAuthIdentityPayload {
  provider: 'github' | 'google' | 'huggingface' | string;
  provider_user_id: string;
  provider_username?: string | null;
  provider_email?: string | null;
  email_verified_by_provider?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface OAuthIdentitiesResponse {
  items: OAuthIdentityPayload[];
}

export interface OAuthCurrentUserLinkResponse {
  provider: 'github' | 'google' | 'huggingface' | string;
  linked: boolean;
  identity: OAuthIdentityPayload;
}

export interface TeamDetail {
  team_id: string;
  company_name: string;
  industry?: string | null;
  contact_phone?: string | null;
  description?: string | null;
  logo_url?: string | null;
  website?: string | null;
  address?: string | null;
  owner_user_id?: string | null;
  status: string;
  verification_status?: 'unverified' | 'pending_review' | 'verified' | 'rejected' | string;
  legal_name?: string | null;
  registration_number?: string | null;
  verification_contact?: string | null;
  verification_phone?: string | null;
  verification_materials?: string[];
  verification_review_comment?: string | null;
  verification_submitted_at?: string | null;
  billing_info?: BillingInfo | null;
  mailing_info?: MailingInfo | null;
  member_count: number;
  member_stats: {
    team_admins: number;
    owners: number;
    reviewers: number;
    agents: number;
    labelers: number;
  };
  ai_budget?: {
    total_limit: number;
    used: number;
    remaining: number;
  };
  membership?: TeamMembershipPayload;
  created_at?: string | null;
}

export type TeamMembershipPlanKey = 'free' | 'basic' | 'pro' | 'enterprise' | string;

export interface TeamMembershipPlanOption {
  plan: TeamMembershipPlanKey | 'more';
  name: string;
  annual_fee_points?: number | null;
  member_limit?: number | null;
  active_task_limit?: number | null;
  storage_bytes_limit?: number | null;
  purchasable: boolean;
  contact_only: boolean;
}

export interface TeamMembershipUsage {
  members: number;
  active_tasks: number;
  storage_bytes: number;
}

export interface TeamMembershipPayload {
  team_id: string;
  current_plan: TeamMembershipPlanKey;
  effective_plan: TeamMembershipPlanKey;
  status: 'active' | 'expired' | string;
  started_at?: string | null;
  expires_at?: string | null;
  next_plan?: TeamMembershipPlanKey | null;
  last_paid_at?: string | null;
  plans: TeamMembershipPlanOption[];
  usage: TeamMembershipUsage;
  limits: TeamMembershipUsage;
  over_limit_items: Array<{ key: keyof TeamMembershipUsage | string; current: number; limit: number }>;
}

export interface TeamMembershipSubscribeRequest {
  target_plan: 'free' | 'basic' | 'pro' | 'enterprise';
  payment_password?: string;
}

export interface AdminOverview {
  teams: TeamDetail[];
  default_team_id: string | null;
  team_count: number;
  notifications: Array<{ id?: string; title?: string; content?: string; created_at?: string }>;
}

export interface TeamDashboardPayload {
  team: {
    team_id: string;
    company_name: string;
    status?: string | null;
    verification_status?: string | null;
    member_count: number;
    member_stats: Record<string, number>;
    membership: {
      current_plan?: string | null;
      effective_plan?: string | null;
      status?: string | null;
      expires_at?: string | null;
      next_plan?: string | null;
    };
  };
  viewer_role: 'team_admin' | 'owner' | 'reviewer' | 'agent' | string;
  summary_cards: Array<{
    key: string;
    label: string;
    value: number | string;
    status: 'success' | 'processing' | 'warning' | 'error' | string;
    hint?: string;
  }>;
  todo_items: Array<{
    key: string;
    type: 'success' | 'info' | 'warning' | 'error' | string;
    title: string;
    count: number;
    target_page?: string;
  }>;
  production: {
    tasks: Record<'total' | 'draft' | 'pending_review' | 'published' | 'paused' | 'finished', number>;
    questions: Record<'total' | 'claimed' | 'submitted' | 'approved' | 'rejected', number>;
    recent_tasks: Array<{
      task_id: string;
      title: string;
      status: string;
      owner_id?: string | null;
      question_total: number;
      claimed: number;
      submitted: number;
      approved: number;
      rejected: number;
      progress_percent: number;
      updated_at?: string | null;
    }>;
  };
  review: ReviewStatsResponse;
  ai: {
    jobs: {
      total: number;
      pending: number;
      processing: number;
      completed: number;
      failed: number;
      by_status: Record<string, number>;
    };
    wallet: TeamAiWalletPayload;
    providers: {
      total: number;
      enabled: number;
      platform_shared: number;
      team_owned: number;
    };
    recent_jobs: Array<{
      job_id: string;
      task_id: string;
      submission_id: string;
      status: string;
      error?: string | null;
      updated_at?: string | null;
    }>;
  };
  exports: {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    cancelled: number;
    recent_exports: ExportJobPayload[];
  };
  resources: {
    points_wallet: TeamPointsBudgetPayload;
    membership: TeamMembershipPayload;
  };
  governance: {
    notifications: NotificationPayload[];
    audit_logs: AuditLogPayload[];
  };
  shortcuts: Array<{
    key: string;
    label: string;
    target_page: string;
    kind: 'primary' | 'default' | string;
  }>;
  generated_at: string;
}

export interface TeamCreateRequest {
  company_name: string;
  industry?: string;
  contact_phone?: string;
  description?: string;
  logo_url?: string;
  website?: string;
  address?: string;
  billing_info?: BillingInfo;
  mailing_info?: MailingInfo;
}

export interface TeamVerificationRequest {
  legal_name: string;
  registration_number: string;
  verification_contact: string;
  verification_phone: string;
  verification_materials: string[];
}

export interface TeamMember {
  user_id: string;
  username?: string;
  email?: string;
  display_name?: string;
  avatar?: string | null;
  position?: string | null;
  phone?: string | null;
  last_active_at?: string | null;
  global_role?: string;
  team_role: string;
  team_role_label?: string;
  permissions?: string[];
  permission_count?: number;
  assigned_tasks?: string[];
  assigned_task_count?: number;
  member_status?: string;
  user_status?: string;
  email_verified?: boolean;
  is_current_user?: boolean;
  is_system_member?: boolean;
  actions?: Record<string, boolean>;
  joined_at?: string | null;
}

export interface TeamMembersResponse {
  items: TeamMember[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

export interface CreateMemberAccountRequest {
  username: string;
  email: string;
  password: string;
  display_name: string;
  team_role: 'owner' | 'reviewer' | 'labeler';
  assigned_review_tasks?: string[];
  send_email?: boolean;
}

export interface InviteMemberRequest {
  invite_mode?: 'email' | 'code';
  email?: string;
  team_role: 'owner' | 'reviewer' | 'labeler';
  message?: string;
  expire_hours?: number;
}

export interface UpdateMemberRequest {
  team_role?: 'owner' | 'reviewer' | 'labeler';
  assigned_review_tasks?: string[];
  status?: 'active' | 'disabled';
}

export interface BatchUpdateMemberRoleResponse {
  requested_count: number;
  updated_count: number;
  skipped_count: number;
  target_role: 'owner' | 'reviewer' | 'labeler' | 'team_admin';
  results: Array<{
    user_id: string;
    status: 'updated' | 'skipped';
    reason?: string;
    from_role?: string;
    to_role?: string;
  }>;
  members: TeamMember[];
}

export interface ImportMembersRequest {
  rows: Array<{
    email: string;
    team_role: 'owner' | 'reviewer' | 'labeler';
    username?: string;
    display_name?: string;
    password?: string;
    assigned_review_tasks?: string[];
  }>;
  default_password?: string;
  send_email?: boolean;
}

export interface ImportMembersResponse {
  requested_count: number;
  imported_count: number;
  skipped_count: number;
  results: Array<{
    row: number;
    email: string;
    user_id?: string;
    status: 'imported' | 'skipped';
    team_role?: string;
    reason?: string;
  }>;
  members: TeamMember[];
}

export interface MemberSecurityReminderResponse {
  requested_count: number;
  sent_count: number;
  skipped_count: number;
  results: Array<{
    user_id: string;
    status: 'sent' | 'skipped';
    reason?: string;
  }>;
  notification: NotificationPayload;
}

export interface TeamInvitationPayload {
  invite_code: string;
  invite_url: string;
  expire_at: string;
  invite_mode?: 'email' | 'code';
  email?: string | null;
}

export interface TeamInvitationRecord {
  invitation_id: string;
  team_id: string;
  invite_mode?: 'email' | 'code';
  email?: string | null;
  team_role: string;
  team_role_label?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired' | 'revoked' | string;
  message?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  expire_at?: string | null;
  responded_at?: string | null;
  created_at?: string | null;
  invite_code?: string;
  invite_url?: string;
}

export interface TeamInvitationListResponse {
  items: TeamInvitationRecord[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

export interface TeamBudgetPayload {
  team_id: string;
  total_limit: number;
  used: number;
  remaining: number;
  usage_percent: number;
  alert_enabled: boolean;
  alert_threshold: number;
  updated_at?: string | null;
}

export interface TeamPointsBudgetPayload {
  team_id: string;
  balance_points: number;
  reserved_points: number;
  pending_payment_points?: number;
  spent_points: number;
  available_points: number;
  alert_enabled: boolean;
  alert_threshold: number;
  updated_at?: string | null;
}

export interface TeamPointsWalletLedgerItem {
  ledger_id: string;
  team_id: string;
  transaction_type: 'recharge' | 'withdraw' | 'reward_spend' | string;
  direction: 'in' | 'out' | string;
  amount: number;
  balance_after: number;
  status: 'completed' | 'pending' | 'failed' | string;
  note: string;
  payment_method?: 'wechat' | 'alipay' | 'bank_transfer' | string | null;
  source_type?: string | null;
  source_id?: string | null;
  reference_no?: string | null;
  operator_id?: string | null;
  meta?: Record<string, unknown>;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface TeamPointsWalletLedgerResponse {
  items: TeamPointsWalletLedgerItem[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

export interface AgentAvatarPresetOption {
  key: string;
  label: string;
  url: string;
  description?: string | null;
}

export interface AgentSettingsPayload {
  user_id: string;
  username: string;
  team_role: 'agent' | string;
  role_label: string;
  display_name: string;
  avatar: string;
  preset_avatar_key?: string | null;
  default_display_name: string;
  default_avatar_url: string;
  preset_avatar_options: AgentAvatarPresetOption[];
  is_system_member: boolean;
  editable_fields: string[];
}

export interface UpdateAgentSettingsRequest {
  display_name: string;
  avatar: string;
  preset_avatar_key?: string | null;
}

export interface RechargeTeamPointsBudgetRequest {
  amount: number;
  payment_method: 'wechat' | 'alipay' | 'bank_transfer';
}

export interface WithdrawTeamPointsBudgetRequest {
  amount: number;
  payout_method: 'wechat' | 'alipay' | 'bank_transfer';
  account_name?: string;
  account_no: string;
  bank_name?: string;
  note?: string;
  payment_password: string;
}

export interface TeamPointsPaymentPasswordStatusPayload {
  is_set: boolean;
  updated_at?: string | null;
  updated_by?: string | null;
}

export interface SetTeamPointsPaymentPasswordRequest {
  new_password: string;
  confirm_password: string;
}

export interface ChangeTeamPointsPaymentPasswordRequest {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

export interface ResetTeamPointsPaymentPasswordRequest {
  email: string;
  email_code: string;
  new_password: string;
  confirm_password: string;
}

export interface BudgetRequestPayload {
  request_id: string;
  team_id: string;
  requester_id: string;
  requester_name?: string | null;
  amount: number;
  purpose: string;
  related_task_id?: string | null;
  valid_until?: string | null;
  description: string;
  status: 'pending' | 'approved' | 'rejected' | string;
  approved_amount?: number | null;
  approver_name?: string | null;
  approval_comment?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface BudgetRequestListResponse {
  items: BudgetRequestPayload[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

export interface AiProviderConfigPayload {
  provider_id: string;
  team_id?: string | null;
  provider_name?: string | null;
  route_name?: string;
  provider_kind?: string;
  provider: string;
  scope: 'team' | 'platform' | string;
  is_platform_default?: boolean;
  team_can_manage?: boolean;
  api_base?: string | null;
  api_key_configured: boolean;
  model_id?: string;
  default_model: string;
  models: string[];
  pricing?: {
    input_price_per_million: number;
    output_price_per_million: number;
    cache_hit_price_per_million: number;
  };
  capabilities?: string[];
  protocol_profile?: string;
  transport_modes?: string[];
  supports_streaming?: boolean;
  capability_profile?: Record<string, unknown>;
  runtime_config?: {
    temperature?: number;
    max_output_tokens?: number;
    timeout_ms?: number;
    [key: string]: unknown;
  };
  status: 'enabled' | 'disabled' | 'missing' | string;
  remark?: string | null;
  last_test_status?: 'success' | 'failed' | 'pending' | string | null;
  last_test_at?: string | null;
  last_test_latency_ms?: number | null;
  last_test_error?: string | null;
  last_request_id?: string | null;
  updated_at?: string | null;
}

export interface AiProviderConfigListResponse {
  items: AiProviderConfigPayload[];
}

export interface TeamAiWalletPayload {
  team_id: string;
  balance_points: number;
  updated_at?: string | null;
}

export interface TeamAiWalletLedgerItem {
  ledger_id: string;
  team_id: string;
  transaction_type: 'recharge' | 'ai_spend' | 'adjustment' | string;
  direction: 'credit' | 'debit' | string;
  amount_points: number;
  balance_after: number;
  provider_id?: string | null;
  route_name?: string | null;
  payment_method?: 'wechat' | 'alipay' | 'bank_transfer' | string | null;
  source_type?: string | null;
  source_id?: string | null;
  request_id?: string | null;
  meta?: Record<string, unknown>;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface TeamAiWalletLedgerResponse {
  items: TeamAiWalletLedgerItem[];
}

export interface RechargeTeamAiWalletRequest {
  amount: number;
  payment_method: 'wechat' | 'alipay' | 'bank_transfer';
}

export interface TransferTeamPointsToAiWalletRequest {
  amount: number;
  payment_password: string;
}

export interface AiCallLogPayload {
  log_id: string;
  team_id: string;
  task_id?: string | null;
  user_id?: string | null;
  provider_id?: string | null;
  route_name?: string | null;
  operation_type: string;
  provider: string;
  model: string;
  tokens: number;
  cost: number;
  billable?: boolean;
  charged_points?: number;
  source_type?: string | null;
  source_id?: string | null;
  latency_ms: number;
  status: string;
  error?: string | null;
  request_id?: string | null;
  created_at?: string | null;
}

export interface AiCallLogListResponse {
  items: AiCallLogPayload[];
}

export interface TeamAiHistoryItem {
  history_id: string;
  record_type: 'transfer_in' | 'ai_call' | 'adjustment' | string;
  created_at?: string | null;
  provider_name?: string | null;
  model_name?: string | null;
  route_name?: string | null;
  tokens?: number | null;
  points_delta: number;
  balance_after?: number | null;
  status: string;
  request_id?: string | null;
  source_label?: string | null;
}

export interface TeamAiHistoryResponse {
  items: TeamAiHistoryItem[];
}

export interface AiReviewMatrixGeneratePayload {
  key?: string;
  dimension: string;
  definition: string;
  scoring_standard: string;
  deduction_rule: string;
  reject_condition: string;
  manual_condition: string;
}

export interface AiReviewMatrixGenerateResponse {
  items: AiReviewMatrixGeneratePayload[];
  provider_id: string;
  model: string;
  request_id?: string | null;
  latency_ms?: number;
  tokens?: number;
  cost?: number;
}

export interface AiReviewInputGenerateResponse {
  input_prompt: string;
  provider_id: string;
  model: string;
  request_id?: string | null;
  latency_ms?: number;
  tokens?: number;
  cost?: number;
}

export interface TaskDifficultyEvaluateResponse {
  difficulty?: 'easy' | 'medium' | 'hard' | null;
  label?: string | null;
  confidence?: number | null;
  reason: string;
  signals: string[];
  missing_fields: string[];
  prompt: string;
  fallback?: boolean;
  model?: string;
  request_id?: string | null;
  latency_ms?: number;
}

export interface AiCostReportPayload {
  team_id: string;
  total_tokens: number;
  total_cost: number;
  by_model: Array<{ model: string; tokens: number; cost: number; calls: number }>;
}

export interface CertTypePayload {
  cert_type: string;
  cert_name: string;
  required_docs: string[];
  verification_method: string;
  status: string;
  referenced_tasks: number;
}

export interface CertTypeListResponse {
  items: CertTypePayload[];
}

export interface UploadPayload {
  file_id: string;
  team_id: string;
  filename: string;
  content_type: string;
  category: string;
  size: number;
  url: string;
  created_at?: string | null;
}

export interface ProfilePayload {
  user: ApiUser & { status?: string };
  profile: {
    display_name?: string | null;
    real_name?: string | null;
    gender?: string | null;
    birthday?: string | null;
    profession?: string | null;
    work_years?: string | null;
    bio?: string | null;
    phone?: string | null;
    location?: string | null;
    education_summary?: string | null;
    education_school?: string | null;
    education_report_mode?: 'chsi' | 'manual' | null;
    education_report_documents?: Array<Record<string, unknown>>;
    expertise_tags?: string[];
    notification_settings?: Record<string, unknown>;
    labeler_basic_info_status?: 'incomplete' | 'not_submitted' | 'pending_review' | 'approved' | 'rejected' | string;
  };
  certifications: Certification[];
  points: PointsWallet;
  labeler_account?: {
    welcome_title: string;
    welcome_subtitle: string;
    basic_info: {
      completed_count: number;
      total_count: number;
      completion_percent: number;
      missing_fields: string[];
    };
    basic_info_status?: 'incomplete' | 'not_submitted' | 'pending_review' | 'approved' | 'rejected' | string;
    certifications: {
      total_count: number;
      approved_count: number;
      pending_count: number;
      rejected_count: number;
      education_status: string;
      domain_status: string;
    };
    points: PointsWallet;
    readiness_steps: Array<{
      key: string;
      label: string;
      status: string;
      description: string;
    }>;
  };
}

export interface Certification {
  cert_id: string;
  cert_category: string;
  cert_type: string;
  cert_name: string;
  status: string;
  provider?: string;
  submitted_data?: Record<string, unknown>;
  documents?: Array<Record<string, unknown>>;
  reviewer_notes?: string | null;
  verified_at?: string | null;
  expires_at?: string | null;
  created_at?: string | null;
}

export interface PointsWallet {
  total_points: number;
  available_points: number;
  level: string;
  updated_at?: string | null;
}

export interface PointsPayload {
  wallet: PointsWallet;
  overview?: {
    total_points: number;
    available_points: number;
    settled_points: number;
    pending_points: number;
    spent_points: number;
    today_points: number;
    month_points: number;
    level: string;
    next_level_gap: number;
    updated_at?: string | null;
  };
  items: Array<{
    ledger_id: string;
    change: number;
    reason: string;
    source_type?: string | null;
    source_id?: string | null;
    metadata?: Record<string, unknown>;
    balance_after: number;
    created_at?: string | null;
  }>;
}


export interface ReputationWallet {
  score: number;
  last_recovered_at?: string | null;
  updated_at?: string | null;
}

export interface ReputationLedgerItem {
  ledger_id: string;
  change: number;
  reason: string;
  source_type?: string | null;
  source_id?: string | null;
  balance_after: number;
  metadata?: Record<string, unknown>;
  appeal_status?: string | null;
  appeal_id?: string | null;
  created_at?: string | null;
}

export interface ReputationPayload {
  wallet: ReputationWallet;
  overview: {
    score: number;
    max_score: number;
    min_score: number;
    claim_min_score: number;
    month_gain: number;
    month_deduction: number;
    can_claim_task: boolean;
    updated_at?: string | null;
  };
  items: ReputationLedgerItem[];
  rules: Array<{ title: string; description: string }>;
}
export interface DatasetColumn {
  name: string;
  data_type: 'text' | 'number' | 'image' | 'audio' | 'video' | 'document' | 'json' | 'media_list' | 'empty' | string;
  samples: unknown[];
  comment?: string;
  use_in_mapping?: boolean;
  derived?: boolean;
  source_column?: string | null;
  expression?: string | null;
  media_role?: 'primary' | 'context' | 'evidence' | string | null;
}

export interface DatasetMediaRef {
  id?: string;
  type?: 'image' | 'audio' | 'video' | 'document' | 'file' | 'text' | string;
  media_type?: 'image' | 'audio' | 'video' | 'document' | 'file' | 'text' | string;
  role?: 'primary' | 'context' | 'evidence' | string;
  source?: 'uploaded_file' | 'external_url' | 'object_storage' | 'inline_text' | string;
  field?: string;
  url?: string;
  file_id?: string;
  name?: string;
  filename?: string;
  mime_type?: string;
  size?: number;
  duration_ms?: number;
  width?: number;
  height?: number;
  status?: 'ready' | 'processing' | 'failed' | string;
}

export interface DatasetContextField {
  key: string;
  data_type?: string;
  label?: string;
}

export interface DatasetPayload {
  dataset_id: string;
  team_id: string;
  owner_id?: string;
  owner_name?: string | null;
  updated_by?: string | null;
  updated_by_name?: string | null;
  name: string;
  description?: string | null;
  source_format: string;
  columns: DatasetColumn[];
  preview_rows: Array<Record<string, unknown>>;
  rows?: Array<Record<string, unknown>>;
  media_assets: DatasetMediaRef[];
  media_schema?: DatasetMediaRef[];
  context_schema?: DatasetContextField[];
  processing_summary?: Record<string, number | string | boolean | null | undefined>;
  row_count: number;
  storage_bytes?: number;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
  merge_summary?: {
    primary_key: string;
    incoming_rows: number;
    matched_rows: number;
    appended_rows: number;
  };
}

export interface DataBindingPayload {
  source_type: 'column' | 'media' | 'derived_context' | 'attachment' | string;
  column_name?: string | null;
  media_type?: 'image' | 'audio' | 'video' | 'document' | 'file' | 'text' | string | null;
  role?: 'primary' | 'context' | 'evidence' | string | null;
  field?: string | null;
  key?: string | null;
  display_fields?: Array<{
    label?: string;
    field?: string;
    binding?: DataBindingPayload;
  }>;
}

export type ComponentBindingsPayload = Record<string, Record<string, DataBindingPayload>>;

export interface DatasetListResponse {
  items: DatasetPayload[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

export type TemplateComponentType =
  | 'ShowItem'
  | 'TextInput'
  | 'TextArea'
  | 'SingleSelect'
  | 'MultiSelect'
  | 'TagSelect'
  | 'Scale'
  | 'Ranking'
  | 'RichEditor'
  | 'FileUpload'
  | 'ImageUpload'
  | 'ImageMaskAnnotation'
  | 'AudioUpload'
  | 'VideoUpload'
  | 'JsonEditor'
  | 'LLMComponent'
  | 'GroupContainer';

export interface TemplateComponentSchema {
  id: string;
  type: TemplateComponentType;
  field: string;
  label: string;
  required: boolean;
  config: Record<string, unknown>;
  options: Array<{ value: string; label: string }>;
  version: string;
}

export interface TemplateTabSchema {
  id: string;
  title: string;
  components: TemplateComponentSchema[];
}

export interface TemplateSchemaPayload {
  schema_version: string;
  tabs: TemplateTabSchema[];
  components: TemplateComponentSchema[];
  validation_rules: TemplateValidationRulesPayload;
  linkage_rules: TemplateLinkageRule[];
  llm_config: Record<string, unknown>;
  compatibility?: {
    normalized_from?: string;
    normalized_to?: string;
    strategy?: string;
  };
}

export type TemplateValidationRulesPayload = Record<string, TemplateValidationRulePayload[] | TemplateValidationRulePayload>;

export interface TemplateValidationRulePayload {
  type?: 'required' | 'min_length' | 'max_length' | 'pattern' | 'regex' | 'min_selected' | 'max_selected' | 'custom_text' | string;
  rule?: string;
  value?: unknown;
  limit?: number;
  length?: number;
  count?: number;
  pattern?: string;
  operator?: 'contains' | 'not_contains' | 'starts_with' | 'ends_with' | string;
  message?: string;
  enabled?: boolean;
}

export interface TemplateLinkageCondition {
  source_field?: string;
  source_component_id?: string;
  field?: string;
  when_field?: string;
  operator?: 'equals' | 'eq' | 'is' | 'not_equals' | 'neq' | 'not' | 'contains' | 'not_contains' | 'not_empty' | 'filled' | 'empty' | 'is_empty' | string;
  value?: unknown;
}

export interface TemplateLinkageRule {
  source_field?: string;
  source_component_id?: string;
  field?: string;
  when_field?: string;
  operator?: 'equals' | 'eq' | 'is' | 'not_equals' | 'neq' | 'not' | 'contains' | 'not_contains' | 'not_empty' | 'filled' | 'empty' | 'is_empty' | string;
  value?: unknown;
  target_component_id?: string;
  target_component?: string;
  target_id?: string;
  target_field?: string;
  target?: string;
  then_field?: string;
  action?: 'show' | 'hide' | string;
  effect?: 'show' | 'hide' | string;
  conditions?: TemplateLinkageCondition[];
  condition_mode?: 'all' | 'any' | 'and' | 'or' | string;
  logic?: 'all' | 'any' | 'and' | 'or' | string;
}

export type AiTemplateChangeType =
  | 'create_field'
  | 'delete_field'
  | 'update_field'
  | 'reorder_field'
  | 'update_options'
  | 'update_validation'
  | 'create_quality_rule';

export interface AiTemplateChange {
  id: string;
  type: AiTemplateChangeType;
  title: string;
  description?: string | null;
  targetFieldId?: string | null;
  targetFieldName?: string | null;
  position?: {
    type: 'append' | 'prepend' | 'before' | 'after';
    fieldId?: string | null;
    tabId?: string | null;
  } | null;
  before?: unknown;
  after?: unknown;
  selected: boolean;
  expanded?: boolean;
}

export interface AiTemplateAssistantAttachment {
  id: string;
  name: string;
  url?: string | null;
  type?: string | null;
}

export interface AiTemplateAssistantRequest {
  provider_id?: string | null;
  workspace_id: string;
  template_id?: string | null;
  template_name?: string | null;
  template_description?: string | null;
  current_template: TemplateSchemaPayload;
  reference_dataset?: Record<string, unknown> | null;
  message: string;
  attachments?: AiTemplateAssistantAttachment[];
  conversation_id?: string | null;
}

export interface AiTemplateAssistantResponse {
  conversation_id: string;
  message: string;
  reasoning?: string | null;
  changes: AiTemplateChange[];
  usage?: {
    points?: number | null;
    tokens?: number | null;
  } | null;
  suggestions?: string[];
  provider?: {
    provider_id?: string | null;
    route_name?: string | null;
    model?: string | null;
  } | null;
  fallback?: 'mock' | 'provider_parse_failed' | null;
}

export type AiTaskPublishChangeType =
  | 'update_basic_info'
  | 'update_template_dataset'
  | 'update_field_mapping'
  | 'update_distribution'
  | 'update_reward'
  | 'update_ai_review'
  | 'update_human_review'
  | 'update_agreement'
  | 'fix_readiness_blocker'
  | 'update_publish_check';

export type AiTaskPublishStep =
  | 'basic_info'
  | 'template_dataset'
  | 'distribution_reward'
  | 'ai_review'
  | 'human_review'
  | 'agreement'
  | 'readiness_check';

export interface AiTaskPublishChange {
  id: string;
  type: AiTaskPublishChangeType;
  step: AiTaskPublishStep;
  title: string;
  description?: string | null;
  before?: unknown;
  after?: unknown;
  riskLevel?: 'low' | 'medium' | 'high';
  dependencies?: string[];
  selected: boolean;
  expanded?: boolean;
}

export interface TaskPublishDraftContext {
  workspaceId: string;
  teamId?: string;
  draftTaskId?: string | null;
  currentStep?: string;
  basicInfo: Record<string, unknown>;
  templateAndData: Record<string, unknown>;
  distributionAndReward: Record<string, unknown>;
  aiReview: Record<string, unknown>;
  humanReview: Record<string, unknown>;
  agreement: Record<string, unknown>;
  readiness: Record<string, unknown>;
  autoSave: Record<string, unknown>;
}

export interface AiTaskPublishAssistantRequest {
  provider_id?: string | null;
  workspace_id: string;
  team_id?: string | null;
  draft_task_id?: string | null;
  current_task_draft: TaskPublishDraftContext;
  message: string;
  attachments?: AiTemplateAssistantAttachment[];
  conversation_id?: string | null;
}

export interface AiTaskPublishAssistantResponse {
  conversation_id: string;
  message: string;
  reasoning?: string | null;
  changes: AiTaskPublishChange[];
  usage?: {
    points?: number | null;
    tokens?: number | null;
  } | null;
  suggestions?: string[];
  readiness_preview?: {
    blockers: string[];
    warnings: string[];
    canPublish: boolean;
  } | null;
  cost_preview?: {
    labelerRewardPoints?: number | null;
    estimatedEnterpriseCost?: number | null;
    platformFee?: number | null;
    rowCount?: number | null;
  } | null;
  provider?: {
    provider_id?: string | null;
    route_name?: string | null;
    model?: string | null;
  } | null;
  fallback?: 'mock' | 'provider_parse_failed' | null;
}

export interface TemplatePayload {
  template_id: string;
  team_id: string;
  owner_id?: string;
  owner_name?: string | null;
  name: string;
  description?: string | null;
  latest_version: number;
  status: 'draft' | 'published' | 'archived' | string;
  auto_saved?: boolean;
  show_item_count: number;
  tab_count: number;
  reference_stats?: { task_count: number; active_task_count: number } | null;
  schema?: TemplateSchemaPayload;
  archived_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface TemplateVersionPayload {
  version_id: string;
  version: number;
  is_published: boolean;
  schema?: TemplateSchemaPayload;
  component_stats?: {
    tab_count: number;
    component_count: number;
    show_item_count: number;
    answer_field_count: number;
    llm_count: number;
  };
  reference_stats?: { task_count: number; active_task_count: number };
  created_at?: string | null;
}

export interface TemplateListResponse {
  items: TemplatePayload[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

export interface TemplateVersionListResponse {
  versions: TemplateVersionPayload[];
}

export interface TemplatePreviewPayload {
  template: TemplatePayload;
  renderer_mode: string;
}

export interface TemplateVersionDiffPayload {
  template_id: string;
  from_version: number;
  to_version: number;
  summary: {
    added_components: Array<Record<string, unknown>>;
    removed_components: Array<Record<string, unknown>>;
    modified_components: Array<{ component_id: string; label?: string | null; changed_fields: string[] }>;
    field_changes: Array<{ component_id: string; from?: string | null; to?: string | null }>;
    validation_changed: boolean;
    linkage_changed: boolean;
    high_risk_changes: Array<Record<string, unknown>>;
  };
}

export interface TemplateReadinessPayload {
  template_id: string;
  ready: boolean;
  checks: Array<{ key: string; label: string; status: 'pass' | 'block' | 'warning' | string; message: string }>;
  blockers: Array<{ key: string; label: string; status: string; message: string }>;
  warnings: Array<{ key: string; label: string; message: string }>;
  summary: {
    tab_count: number;
    component_count: number;
    show_item_count: number;
    answer_field_count: number;
    llm_count: number;
  };
}

export interface TemplateValidationPayload {
  valid: boolean;
  field_errors: Array<{ component_id?: string | null; field?: string | null; label?: string | null; rule: string; message: string }>;
  warnings: Array<{ component_id?: string | null; field?: string | null; message: string }>;
  summary: {
    answer_field_count: number;
    error_count: number;
    warning_count: number;
  };
}

export interface LabelingSubmissionPayload {
  submission_id: string;
  team_id: string;
  task_id: string;
  question_id: string;
  labeler_id: string;
  template_id: string;
  template_version_id?: string | null;
  answers: Record<string, unknown>;
  draft: Record<string, unknown>;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'abandoned' | string;
  current_round: number;
  validation_result?: TemplateValidationPayload | Record<string, unknown>;
  submitted_at?: string | null;
  task_submitted_at?: string | null;
  ai_review_job?: AiReviewJobPayload | null;
  abandoned_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface LabelingQuestionPayload {
  question_id: string;
  team_id: string;
  task_id: string;
  dataset_id: string;
  row_index: number;
  content: Record<string, unknown>;
  status: 'claimed' | 'submitted' | 'rejected' | 'abandoned' | string;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  submission?: LabelingSubmissionPayload | null;
  template_schema?: TemplateSchemaPayload;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface LabelingRejectionPayload {
  question_id: string;
  submission_id: string;
  task_id: string;
  status: string;
  current_round: number;
  latest?: {
    review_id: string;
    round?: number | null;
    stage: string;
    decision?: 'rejected' | 'revise' | string | null;
    comment?: string | null;
    reviewer_id?: string | null;
    created_at?: string | null;
    changes: Record<string, unknown>;
  } | null;
  history: Array<{
    review_id: string;
    round?: number | null;
    stage: string;
    decision?: 'rejected' | 'revise' | string | null;
    comment?: string | null;
    reviewer_id?: string | null;
    created_at?: string | null;
    changes: Record<string, unknown>;
  }>;
  ai_review?: Record<string, unknown> | null;
}

export interface LabelingAiAssistPayload {
  question_id: string;
  answers: Record<string, unknown>;
  explanation: string;
  field_explanations: Record<string, string>;
  assist_usage?: {
    percent: number;
    limit: number;
    used: number;
    remaining: number;
  };
  annotated_images?: Array<{
    source_id: string;
    label: string;
    original_url?: string | null;
    annotated_url: string;
    annotations: Array<{
      label: string;
      shape: 'circle' | 'rect' | string;
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
  }>;
  model?: string | null;
  request_id?: string | null;
  latency_ms?: number | null;
}

export interface LabelingWorkbenchPayload {
  task: Pick<TaskPayload, 'task_id' | 'title' | 'description' | 'rich_content' | 'tags' | 'status' | 'category' | 'difficulty' | 'deadline' | 'reward_rule' | 'template_id' | 'template_version_id' | 'component_bindings' | 'stats'>;
  template: {
    template_id: string;
    template_version_id?: string | null;
    version: number;
    schema: TemplateSchemaPayload;
  };
  questions: Array<{
    question_id: string;
    row_index: number;
    status: string;
    submission_status?: string | null;
    updated_at?: string | null;
  }>;
  current_question: LabelingQuestionPayload;
  progress: {
    total: number;
    submitted: number;
    rejected: number;
    abandoned?: number;
    remaining: number;
    percent: number;
    abandon_limit?: number;
    abandon_used?: number;
    abandon_remaining?: number;
    ai_assist_percent?: number;
    ai_assist_limit?: number;
    ai_assist_used?: number;
    ai_assist_remaining?: number;
  };
  timeline?: Array<{
    key?: string;
    title: string;
    description?: string | null;
    status?: 'wait' | 'process' | 'finish' | 'error' | string;
    time?: string | null;
  }>;
}

export interface TaskPayload {
  task_id: string;
  team_id: string;
  owner_id?: string;
  owner_name?: string | null;
  title: string;
  description: string;
  rich_content?: string | null;
  tags: string[];
  status: 'draft' | 'pending_review' | 'published' | 'paused' | 'finished' | string;
  auto_saved?: boolean;
  category: string;
  difficulty: string;
  deadline?: string | null;
  quota: number;
  distribution: 'first_come_all' | 'quota_grab' | 'assigned_link' | string;
  reward_rule: Record<string, unknown>;
  reviewer_ids: string[];
  reviewer_names?: string[];
  reviewers?: Array<{ user_id: string; display_name: string; email?: string | null }>;
  review_config?: Record<string, unknown>;
  ai_config: Record<string, unknown>;
  qualification_rules: Record<string, unknown>;
  required_certs: string[];
  agreement_config: Record<string, unknown>;
  claim_config: Record<string, unknown>;
  template_id: string;
  template_version_id?: string | null;
  dataset_id: string;
  column_mapping: Record<string, string | null>;
  mapping_config?: Record<string, DataBindingPayload>;
  component_bindings?: ComponentBindingsPayload;
  assignment: {
    enabled?: boolean;
    url?: string;
    qr_text?: string;
    expire_at?: string;
    expire_hours?: number;
    target_labeler_ids?: string[];
    target_labeler_allocations?: Array<{ labeler_id: string; quota: number | null }>;
  };
  stats: Record<string, number>;
  delete_eligibility?: {
    deletable: boolean;
    mode: 'draft' | 'finished_cascade' | string | null;
    reason?: string | null;
    blockers?: Record<string, number>;
    counts: {
      questions: number;
      pending_questions: number;
      claimed_questions: number;
      submitted_questions: number;
      approved_questions: number;
      rejected_questions: number;
      closed_questions: number;
      submissions: number;
      draft_submissions: number;
      submitted_submissions: number;
      approved_submissions: number;
      rejected_submissions: number;
      abandoned_submissions: number;
      claim_bundles: number;
      ai_review_jobs: number;
      export_jobs: number;
      notifications: number;
      [key: string]: number;
    };
  } | null;
  published_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface TaskListResponse {
  items: TaskPayload[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

export interface TaskStatsPayload {
  task_id: string;
  status: string;
  quota: number;
  stats: Record<string, number>;
  question_count: number;
  question_status_counts: Record<string, number>;
}

export interface TaskQuestionPayload {
  question_id: string;
  team_id: string;
  task_id: string;
  dataset_id: string;
  row_index: number;
  content: Record<string, unknown>;
  status: string;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  template_schema?: TemplateSchemaPayload;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface TaskQuestionListResponse {
  items: TaskQuestionPayload[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

export interface TaskQuestionBatchResponse {
  items: TaskQuestionPayload[];
  created_count: number;
  source_format?: string;
  replaced?: boolean;
}

export interface TaskReadinessPayload {
  task_id: string;
  ready: boolean;
  checks: Array<{ key: string; label: string; status: 'pass' | 'block' | 'warning' | string; message: string }>;
  blockers: Array<{ key: string; label: string; status: string; message: string }>;
  warnings: Array<{ key: string; label: string; message: string }>;
  summary: {
    question_count: number;
    show_item_count: number;
    mapped_show_item_count: number;
    reviewer_count: number;
    ai_enabled: boolean;
  };
}

export interface RequestTaskAssistanceRequest {
  target_reviewer_id: string;
  submission_ids?: string[];
  reason?: string | null;
}

export interface TaskAssistancePayload {
  task_id: string;
  task_title?: string | null;
  target_reviewer_id: string;
  submission_ids?: string[];
  reason?: string | null;
  assigned_review_tasks?: string[];
  already_assigned?: boolean;
}

export interface ExportJobPayload {
  export_id: string;
  team_id: string;
  task_id: string;
  created_by: string;
  format: 'json' | 'jsonl' | 'csv' | 'excel' | string;
  filters: Record<string, unknown>;
  fields_config: Record<string, unknown>;
  include_review_records: boolean;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | string;
  progress: number;
  filename: string;
  file_size: number;
  download_count: number;
  error?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
}

export interface ExportJobListResponse {
  items: ExportJobPayload[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

export interface AuditLogPayload {
  log_id: string;
  team_id?: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  operator_id?: string | null;
  operator_name?: string | null;
  request_id?: string | null;
  changes: Record<string, unknown>;
  ip_address?: string | null;
  user_agent?: string | null;
  risk_level?: 'normal' | 'important' | 'high' | string;
  summary?: string | null;
  created_at?: string | null;
}

export interface AuditLogListResponse {
  items: AuditLogPayload[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

export interface NotificationPayload {
  notification_id: string;
  team_id: string;
  source_team_name?: string | null;
  title: string;
  content: string;
  notification_type: 'system' | 'task' | 'review' | 'export' | 'points' | 'security' | 'organization' | string;
  priority: 'normal' | 'important' | 'urgent' | string;
  target_type: 'team' | 'role' | 'member' | 'task' | string;
  target_roles: string[];
  target_user_ids: string[];
  related_entity_type?: string | null;
  related_entity_id?: string | null;
  event_key?: string | null;
  action_url?: string | null;
  metadata?: Record<string, unknown>;
  sender_id?: string | null;
  sender_name?: string | null;
  status: 'unread' | 'read' | 'handled' | 'revoked' | 'expired' | 'deleted' | string;
  is_read: boolean;
  is_handled: boolean;
  is_starred?: boolean;
  is_deleted?: boolean;
  is_revoked?: boolean;
  read_count: number;
  handled_count: number;
  email_enabled: boolean;
  in_app_enabled: boolean;
  recipient_summary?: NotificationRecipientPreview | null;
  expire_at?: string | null;
  revoked_at?: string | null;
  revoked_by?: string | null;
  created_at?: string | null;
}

export interface NotificationRecipientPreview {
  total: number;
  role_counts: Record<string, number>;
  user_ids: string[];
}

export interface NotificationListResponse {
  items: NotificationPayload[];
  summary: {
    total?: number;
    unread: number;
    starred?: number;
    team?: number;
    organization?: number;
    task?: number;
    review?: number;
    export?: number;
    points?: number;
    security?: number;
    system?: number;
    [key: string]: number | undefined;
  };
  type_options?: Array<{ key: string; label: string; count: number; unread_count: number }>;
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}
