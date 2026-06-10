import { ApiClientError, authenticatedApiRequest, authenticatedFetch, authenticatedUploadRequest } from './apiClient';
import type { UploadProgressInfo } from './apiClient';
import type {
  AdminOverview,
  AgentSettingsPayload,
  AiCallLogListResponse,
  AiCostReportPayload,
  AiTemplateAssistantRequest,
  AiTemplateAssistantResponse,
  AiTaskPublishAssistantRequest,
  AiTaskPublishAssistantResponse,
  AiReviewInputGenerateResponse,
  AiReviewMatrixGenerateResponse,
  AiProviderConfigListResponse,
  AiProviderConfigPayload,
  AuditLogListResponse,
  AuditLogPayload,
  BatchUpdateMemberRoleResponse,
  BudgetRequestListResponse,
  BudgetRequestPayload,
  Certification,
  CreateMemberAccountRequest,
  CertTypeListResponse,
  DatasetListResponse,
  DatasetPayload,
  ComponentBindingsPayload,
  DataBindingPayload,
  LabelingAiAssistPayload,
  ExportJobListResponse,
  ExportJobPayload,
  ImportMembersRequest,
  ImportMembersResponse,
  InviteMemberRequest,
  MemberSecurityReminderResponse,
  NotificationListResponse,
  NotificationPayload,
  NotificationRecipientPreview,
  PersonalLabelerDashboardPayload,
  PointsPayload,
  ReputationPayload,
  RechargeTeamPointsBudgetRequest,
  RequestTaskAssistanceRequest,
  TeamAiHistoryResponse,
  TeamMembershipPayload,
  TeamMembershipSubscribeRequest,
  TeamPointsWalletLedgerResponse,
  ProfilePayload,
  RechargeTeamAiWalletRequest,
  TransferTeamPointsToAiWalletRequest,
  TaskPayload,
  TaskDifficultyEvaluateResponse,
  TaskQuestionListResponse,
  TaskQuestionPayload,
  TaskQuestionBatchResponse,
  TaskAssistancePayload,
  TaskReadinessPayload,
  TaskListResponse,
  TaskStatsPayload,
  TeamCreateRequest,
  TeamDashboardPayload,
  TeamLabelerDashboardPayload,
  TeamVerificationRequest,
  TeamBudgetPayload,
  TeamDetail,
  TeamInvitationListResponse,
  TeamInvitationPayload,
  TeamInvitationRecord,
  TeamAiWalletLedgerResponse,
  TeamAiWalletPayload,
  TeamMember,
  TeamMembersResponse,
  TeamPointsBudgetPayload,
  TeamPointsPaymentPasswordStatusPayload,
  WithdrawTeamPointsBudgetRequest,
  TemplateListResponse,
  TemplatePayload,
  TemplatePreviewPayload,
  TemplateReadinessPayload,
  TemplateSchemaPayload,
  TemplateValidationPayload,
  TemplateVersionDiffPayload,
  TemplateVersionListResponse,
  UpdateMemberRequest,
  UpdateAgentSettingsRequest,
  UploadPayload,
  SetTeamPointsPaymentPasswordRequest,
  ChangeTeamPointsPaymentPasswordRequest,
  ResetTeamPointsPaymentPasswordRequest,
} from '../types/api';

export function getAdminOverview(): Promise<AdminOverview> {
  return authenticatedApiRequest<AdminOverview>('/teams/admin/overview');
}

export function getTeamDashboard(teamId: string): Promise<TeamDashboardPayload> {
  return authenticatedApiRequest<TeamDashboardPayload>(`/teams/${teamId}/dashboard`, { headers: withTeamHeader(teamId) });
}

export function getTeamLabelerDashboard(teamId: string): Promise<TeamLabelerDashboardPayload> {
  return authenticatedApiRequest<TeamLabelerDashboardPayload>(`/teams/${teamId}/labeler-dashboard`, { headers: withTeamHeader(teamId) });
}

export function getPersonalLabelerDashboard(): Promise<PersonalLabelerDashboardPayload> {
  return authenticatedApiRequest<PersonalLabelerDashboardPayload>('/profile/dashboard');
}

export function createTeam(payload: TeamCreateRequest): Promise<TeamDetail> {
  return authenticatedApiRequest<TeamDetail>('/teams', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getTeamDetail(teamId: string): Promise<TeamDetail> {
  return authenticatedApiRequest<TeamDetail>(`/teams/${teamId}`, { headers: withTeamHeader(teamId) });
}

export function updateTeam(teamId: string, payload: Partial<TeamCreateRequest>): Promise<TeamDetail> {
  return authenticatedApiRequest<TeamDetail>(`/teams/${teamId}`, {
    method: 'PUT',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function submitTeamVerification(teamId: string, payload: TeamVerificationRequest): Promise<TeamDetail> {
  return authenticatedApiRequest<TeamDetail>(`/teams/${teamId}/verification`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function getTeamMembers(teamId: string, params: { role?: string; status?: string; keyword?: string } = {}): Promise<TeamMembersResponse> {
  const search = new URLSearchParams();
  search.set('status', params.status ?? 'active');
  if (params.role && params.role !== 'all') search.set('role', params.role);
  if (params.keyword?.trim()) search.set('keyword', params.keyword.trim());
  return authenticatedApiRequest<TeamMembersResponse>(`/teams/${teamId}/members?${search.toString()}`, { headers: withTeamHeader(teamId) });
}

export function createMemberAccount(teamId: string, payload: CreateMemberAccountRequest): Promise<TeamMember> {
  return authenticatedApiRequest<TeamMember>(`/teams/${teamId}/members/accounts`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function importTeamMembers(teamId: string, payload: ImportMembersRequest): Promise<ImportMembersResponse> {
  return authenticatedApiRequest<ImportMembersResponse>(`/teams/${teamId}/members/import`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function inviteTeamMember(teamId: string, payload: InviteMemberRequest): Promise<TeamInvitationPayload> {
  return authenticatedApiRequest<TeamInvitationPayload>(`/teams/${teamId}/invite`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function listTeamInvitations(teamId: string, status = 'all'): Promise<TeamInvitationListResponse> {
  const search = new URLSearchParams();
  if (status !== 'all') search.set('status', status);
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return authenticatedApiRequest<TeamInvitationListResponse>(`/teams/${teamId}/invitations${suffix}`, { headers: withTeamHeader(teamId) });
}

export function resendTeamInvitation(teamId: string, invitationId: string, payload: { message?: string; expire_hours?: number } = {}): Promise<TeamInvitationPayload & { invitation_id?: string; status?: string }> {
  return authenticatedApiRequest<TeamInvitationPayload & { invitation_id?: string; status?: string }>(`/teams/${teamId}/invitations/${invitationId}/resend`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function revokeTeamInvitation(teamId: string, invitationId: string, reason?: string): Promise<TeamInvitationRecord> {
  return authenticatedApiRequest<TeamInvitationRecord>(`/teams/${teamId}/invitations/${invitationId}/revoke`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify({ reason }),
  });
}

export function updateTeamMember(teamId: string, userId: string, payload: UpdateMemberRequest): Promise<TeamMember> {
  return authenticatedApiRequest<TeamMember>(`/teams/${teamId}/members/${userId}`, {
    method: 'PUT',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function batchUpdateTeamMemberRole(teamId: string, payload: { user_ids: string[]; team_role: UpdateMemberRequest['team_role'] }): Promise<BatchUpdateMemberRoleResponse> {
  return authenticatedApiRequest<BatchUpdateMemberRoleResponse>(`/teams/${teamId}/members/batch-role`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function sendMemberSecurityReminder(teamId: string, payload: { user_ids: string[]; title?: string; content?: string }): Promise<MemberSecurityReminderResponse> {
  return authenticatedApiRequest<MemberSecurityReminderResponse>(`/teams/${teamId}/members/security-reminders`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function removeTeamMember(teamId: string, userId: string): Promise<void> {
  return authenticatedApiRequest<void>(`/teams/${teamId}/members/${userId}`, {
    method: 'DELETE',
    headers: withTeamHeader(teamId),
  });
}

export function getTeamPointsBudget(teamId: string): Promise<TeamPointsBudgetPayload> {
  return authenticatedApiRequest<TeamPointsBudgetPayload>(`/teams/${teamId}/points-budget`, { headers: withTeamHeader(teamId) });
}

export function getTeamMembership(teamId: string): Promise<TeamMembershipPayload> {
  return authenticatedApiRequest<TeamMembershipPayload>(`/teams/${teamId}/membership`, { headers: withTeamHeader(teamId) });
}

export function subscribeTeamMembership(teamId: string, payload: TeamMembershipSubscribeRequest): Promise<TeamMembershipPayload> {
  return authenticatedApiRequest<TeamMembershipPayload>(`/teams/${teamId}/membership/subscribe`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function cancelTeamMembershipScheduledChange(teamId: string): Promise<TeamMembershipPayload> {
  return authenticatedApiRequest<TeamMembershipPayload>(`/teams/${teamId}/membership/cancel-scheduled-change`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
  });
}

export function getTeamPointsWalletLedger(teamId: string): Promise<TeamPointsWalletLedgerResponse> {
  return authenticatedApiRequest<TeamPointsWalletLedgerResponse>(`/teams/${teamId}/points-budget/ledger`, { headers: withTeamHeader(teamId) });
}

export function getTeamPointsPaymentPasswordStatus(teamId: string): Promise<TeamPointsPaymentPasswordStatusPayload> {
  return authenticatedApiRequest<TeamPointsPaymentPasswordStatusPayload>(`/teams/${teamId}/points-budget/payment-password/status`, { headers: withTeamHeader(teamId) });
}

export function getAgentSettings(teamId: string): Promise<AgentSettingsPayload> {
  return authenticatedApiRequest<AgentSettingsPayload>(`/teams/${teamId}/agent-settings`, { headers: withTeamHeader(teamId) });
}

export function updateAgentSettings(teamId: string, payload: UpdateAgentSettingsRequest): Promise<AgentSettingsPayload> {
  return authenticatedApiRequest<AgentSettingsPayload>(`/teams/${teamId}/agent-settings`, {
    method: 'PUT',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function rechargeTeamPointsBudget(teamId: string, payload: RechargeTeamPointsBudgetRequest): Promise<TeamPointsBudgetPayload> {
  return authenticatedApiRequest<TeamPointsBudgetPayload>(`/teams/${teamId}/points-budget/recharge`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function withdrawTeamPointsBudget(teamId: string, payload: WithdrawTeamPointsBudgetRequest): Promise<TeamPointsBudgetPayload> {
  return authenticatedApiRequest<TeamPointsBudgetPayload>(`/teams/${teamId}/points-budget/withdraw`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function setTeamPointsPaymentPassword(teamId: string, payload: SetTeamPointsPaymentPasswordRequest): Promise<TeamPointsPaymentPasswordStatusPayload> {
  return authenticatedApiRequest<TeamPointsPaymentPasswordStatusPayload>(`/teams/${teamId}/points-budget/payment-password/set`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function changeTeamPointsPaymentPassword(teamId: string, payload: ChangeTeamPointsPaymentPasswordRequest): Promise<TeamPointsPaymentPasswordStatusPayload> {
  return authenticatedApiRequest<TeamPointsPaymentPasswordStatusPayload>(`/teams/${teamId}/points-budget/payment-password/change`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function resetTeamPointsPaymentPassword(teamId: string, payload: ResetTeamPointsPaymentPasswordRequest): Promise<TeamPointsPaymentPasswordStatusPayload> {
  return authenticatedApiRequest<TeamPointsPaymentPasswordStatusPayload>(`/teams/${teamId}/points-budget/payment-password/reset`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function setTeamPointsBudgetAlert(teamId: string, payload: { enabled: boolean; threshold: number }): Promise<TeamPointsBudgetPayload> {
  return authenticatedApiRequest<TeamPointsBudgetPayload>(`/teams/${teamId}/points-budget/alerts`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function getTeamBudget(teamId: string): Promise<TeamBudgetPayload> {
  return authenticatedApiRequest<TeamBudgetPayload>(`/ai-resources/teams/${teamId}/budget`, { headers: withTeamHeader(teamId) });
}

export function getTeamAiWallet(teamId: string): Promise<TeamAiWalletPayload> {
  return authenticatedApiRequest<TeamAiWalletPayload>(`/ai-resources/teams/${teamId}/wallet`, { headers: withTeamHeader(teamId) });
}

export function listTeamAiWalletLedger(teamId: string): Promise<TeamAiWalletLedgerResponse> {
  return authenticatedApiRequest<TeamAiWalletLedgerResponse>(`/ai-resources/teams/${teamId}/wallet/ledger`, { headers: withTeamHeader(teamId) });
}

export function rechargeTeamAiWallet(teamId: string, payload: RechargeTeamAiWalletRequest): Promise<TeamAiWalletPayload> {
  return authenticatedApiRequest<TeamAiWalletPayload>(`/ai-resources/teams/${teamId}/wallet/recharge`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function transferTeamPointsToAiWallet(teamId: string, payload: TransferTeamPointsToAiWalletRequest): Promise<TeamAiWalletPayload> {
  return authenticatedApiRequest<TeamAiWalletPayload>(`/ai-resources/teams/${teamId}/wallet/transfer-in`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function listTeamAiHistory(teamId: string): Promise<TeamAiHistoryResponse> {
  return authenticatedApiRequest<TeamAiHistoryResponse>(`/ai-resources/teams/${teamId}/history`, {
    headers: withTeamHeader(teamId),
  });
}

export function setTeamBudgetLimit(teamId: string, totalLimit: number): Promise<TeamBudgetPayload> {
  return authenticatedApiRequest<TeamBudgetPayload>(`/ai-resources/teams/${teamId}/budget/limit`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify({ total_limit: totalLimit }),
  });
}

export function setTeamBudgetAlert(teamId: string, payload: { enabled: boolean; threshold: number }): Promise<TeamBudgetPayload> {
  return authenticatedApiRequest<TeamBudgetPayload>(`/ai-resources/teams/${teamId}/budget/alerts`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function createBudgetRequest(teamId: string, payload: { amount: number; purpose: string; related_task_id?: string; valid_until?: string; description: string }): Promise<BudgetRequestPayload> {
  return authenticatedApiRequest<BudgetRequestPayload>(`/teams/${teamId}/budget/requests`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function listBudgetRequests(teamId: string): Promise<BudgetRequestListResponse> {
  return authenticatedApiRequest<BudgetRequestListResponse>(`/teams/${teamId}/budget/requests`, { headers: withTeamHeader(teamId) });
}

export function approveBudgetRequest(teamId: string, requestId: string, payload: { decision: 'approved' | 'rejected'; approved_amount?: number; comment?: string }): Promise<BudgetRequestPayload> {
  return authenticatedApiRequest<BudgetRequestPayload>(`/teams/${teamId}/budget/requests/${requestId}/approve`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function listAiProviderConfigs(teamId: string): Promise<AiProviderConfigListResponse> {
  return authenticatedApiRequest<AiProviderConfigListResponse>(`/ai-resources/configs?team_id=${encodeURIComponent(teamId)}`, { headers: withTeamHeader(teamId) });
}

export function createAiProviderConfig(payload: {
  route_name: string;
  provider_kind: string;
  protocol_profile?: string;
  scope: 'team' | 'platform';
  is_platform_default?: boolean;
  team_id?: string;
  api_base?: string;
  api_key?: string;
  model_id: string;
  pricing: {
    input_price_per_million: number;
    output_price_per_million: number;
    cache_hit_price_per_million: number;
  };
  capabilities: string[];
  transport_modes?: string[];
  supports_streaming?: boolean;
  capability_profile?: Record<string, unknown>;
  runtime_config: {
    temperature?: number;
    max_output_tokens?: number;
    timeout_ms?: number;
    [key: string]: unknown;
  };
  status: string;
  remark?: string;
}): Promise<AiProviderConfigPayload> {
  return authenticatedApiRequest<AiProviderConfigPayload>('/ai-resources/configs', {
    method: 'POST',
    headers: payload.team_id ? withTeamHeader(payload.team_id) : undefined,
    body: JSON.stringify(payload),
  });
}

export function updateAiProviderConfig(teamId: string, providerId: string, payload: {
  route_name?: string;
  provider_kind?: string;
  protocol_profile?: string;
  is_platform_default?: boolean;
  api_base?: string;
  api_key?: string;
  model_id?: string;
  pricing?: {
    input_price_per_million: number;
    output_price_per_million: number;
    cache_hit_price_per_million: number;
  };
  capabilities?: string[];
  transport_modes?: string[];
  supports_streaming?: boolean;
  capability_profile?: Record<string, unknown>;
  runtime_config?: {
    temperature?: number;
    max_output_tokens?: number;
    timeout_ms?: number;
    [key: string]: unknown;
  };
  status?: string;
  remark?: string;
}): Promise<AiProviderConfigPayload> {
  return authenticatedApiRequest<AiProviderConfigPayload>(`/ai-resources/configs/${providerId}`, {
    method: 'PATCH',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function duplicateAiProviderConfig(teamId: string, providerId: string): Promise<AiProviderConfigPayload> {
  return authenticatedApiRequest<AiProviderConfigPayload>(`/ai-resources/configs/${providerId}/duplicate`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
  });
}

export function setAiProviderConfigStatus(teamId: string, providerId: string, status: string): Promise<AiProviderConfigPayload> {
  return authenticatedApiRequest<AiProviderConfigPayload>(`/ai-resources/configs/${providerId}/status`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify({ status }),
  });
}

export function deleteAiProviderConfig(teamId: string, providerId: string): Promise<{ provider_id: string }> {
  return authenticatedApiRequest<{ provider_id: string }>(`/ai-resources/configs/${providerId}`, {
    method: 'DELETE',
    headers: withTeamHeader(teamId),
  });
}

export function testAiProviderConfig(teamId: string, providerId: string, payload: { message?: string } = {}): Promise<{ provider_id: string; route_name: string; provider_kind: string; model: string; latency_ms: number; status: string; request_id?: string | null }> {
  return authenticatedApiRequest<{ provider_id: string; route_name: string; provider_kind: string; model: string; latency_ms: number; status: string; request_id?: string | null }>(`/ai-resources/configs/${providerId}/test`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function testDraftAiProviderConfig(teamId: string, payload: {
  route_name: string;
  provider_kind: string;
  protocol_profile?: string;
  scope: 'team';
  team_id: string;
  api_base?: string;
  api_key?: string;
  model_id: string;
  capabilities?: string[];
  transport_modes?: string[];
  supports_streaming?: boolean;
  capability_profile?: Record<string, unknown>;
  runtime_config: {
    temperature?: number;
    max_output_tokens?: number;
    timeout_ms?: number;
    [key: string]: unknown;
  };
  message?: string;
}): Promise<{ route_name: string; provider_kind: string; model: string; latency_ms: number; status: string; request_id?: string | null }> {
  return authenticatedApiRequest<{ route_name: string; provider_kind: string; model: string; latency_ms: number; status: string; request_id?: string | null }>('/ai-resources/configs/test-draft', {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function listAiCallLogs(teamId: string): Promise<AiCallLogListResponse> {
  return authenticatedApiRequest<AiCallLogListResponse>(`/ai-resources/calls?team_id=${encodeURIComponent(teamId)}`, { headers: withTeamHeader(teamId) });
}

export function getAiCostReport(teamId: string): Promise<AiCostReportPayload> {
  return authenticatedApiRequest<AiCostReportPayload>(`/ai-resources/teams/${teamId}/reports/cost`, { headers: withTeamHeader(teamId) });
}

export function estimateAiCost(payload: { provider_id: string; prompt_chars: number; completion_chars: number; cache_hit_chars?: number }): Promise<{ provider_id: string; route_name: string; model: string; estimated_prompt_tokens: number; estimated_completion_tokens: number; estimated_cache_hit_tokens: number; estimated_tokens: number; estimated_cost: number }> {
  return authenticatedApiRequest<{ provider_id: string; route_name: string; model: string; estimated_prompt_tokens: number; estimated_completion_tokens: number; estimated_cache_hit_tokens: number; estimated_tokens: number; estimated_cost: number }>('/ai-resources/estimate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listCertTypes(): Promise<CertTypeListResponse> {
  return authenticatedApiRequest<CertTypeListResponse>('/ai-resources/cert-types');
}

export function getMyProfile(): Promise<ProfilePayload> {
  return authenticatedApiRequest<ProfilePayload>('/profile/me');
}

export function updateMyProfile(payload: {
  avatar?: string | null;
  display_name?: string;
  real_name?: string;
  gender?: string;
  birthday?: string;
  profession?: string;
  work_years?: string;
  bio?: string;
  phone?: string;
  location?: string;
  education_summary?: string;
  education_school?: string;
  education_report_mode?: 'chsi' | 'manual';
  education_report_documents?: Array<Record<string, unknown>>;
  expertise_tags?: string[];
  notification_settings?: Record<string, unknown>;
}): Promise<ProfilePayload> {
  return authenticatedApiRequest<ProfilePayload>('/profile/me', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}


export function getReputation(): Promise<ReputationPayload> {
  return authenticatedApiRequest<ReputationPayload>('/profile/reputation');
}

export function submitReputationAppeal(payload: { ledger_id: string; reason: string }): Promise<{ appeal_id: string; ledger_id: string; reason: string; status: string; created_at?: string | null }> {
  return authenticatedApiRequest<{ appeal_id: string; ledger_id: string; reason: string; status: string; created_at?: string | null }>('/profile/reputation/appeals', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
export function respondTeamInvitation(inviteCode: string, action: 'accept' | 'reject' = 'accept'): Promise<unknown> {
  return authenticatedApiRequest(`/teams/invitations/${encodeURIComponent(inviteCode)}/respond`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}

export async function uploadProfileAvatar(file: File): Promise<UploadPayload> {
  const formData = new FormData();
  formData.set('category', 'image');
  formData.set('file', file);
  const response = await authenticatedFetch('/uploads', {
    method: 'POST',
    body: formData,
  });
  const envelope = await response.json().catch(() => null);
  if (!response.ok || !envelope || envelope.code !== 0) {
    throw new ApiClientError(envelope?.message || '头像上传失败', {
      code: envelope?.code ?? response.status,
      detail: envelope?.detail,
      requestId: envelope?.request_id ?? null,
      status: response.status,
    });
  }
  return envelope.data as UploadPayload;
}

export function submitDomainCertification(payload: {
  domain: string;
  industry?: string;
  evidence_type?: string;
  cert_name: string;
  real_name: string;
  title?: string;
  organization?: string;
  display_type?: 'detail' | 'fuzzy';
  registration_number?: string;
  agreement_accepted?: boolean;
  description?: string;
  supplement_documents?: Array<Record<string, unknown>>;
  documents: Array<Record<string, unknown>>;
}): Promise<Certification> {
  return authenticatedApiRequest<Certification>('/profile/certifications/domain', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function submitEducationCertification(payload: {
  real_name: string;
  education_level: 'associate' | 'bachelor' | 'master' | 'doctor' | 'other';
  school: string;
  major?: string;
  graduation_year?: number;
  degree?: string;
  documents: Array<Record<string, unknown>>;
}): Promise<Certification> {
  return authenticatedApiRequest<Certification>('/profile/certifications/education', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function uploadFile(teamId: string, file: File, category = 'document'): Promise<UploadPayload> {
  const formData = new FormData();
  formData.set('category', category);
  formData.set('file', file);
  const response = await authenticatedFetch('/uploads', {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: formData,
  });
  const envelope = await response.json().catch(() => null);
  if (!response.ok || !envelope || envelope.code !== 0) {
    throw new ApiClientError(envelope?.message || '文件上传失败', {
      code: envelope?.code ?? response.status,
      detail: envelope?.detail,
      requestId: envelope?.request_id ?? null,
      status: response.status,
    });
  }
  return envelope.data as UploadPayload;
}

export async function uploadTeamAgentAvatar(teamId: string, file: File): Promise<UploadPayload> {
  const formData = new FormData();
  formData.set('file', file);
  const response = await authenticatedFetch(`/teams/${encodeURIComponent(teamId)}/agent-settings/avatar`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: formData,
  });
  const envelope = await response.json().catch(() => null);
  if (!response.ok || !envelope || envelope.code !== 0) {
    throw new ApiClientError(envelope?.message || 'Agent 头像上传失败', {
      code: envelope?.code ?? response.status,
      detail: envelope?.detail,
      requestId: envelope?.request_id ?? null,
      status: response.status,
    });
  }
  return envelope.data as UploadPayload;
}

export async function uploadProfileMaterial(file: File, category = 'verification'): Promise<UploadPayload> {
  const formData = new FormData();
  formData.set('category', category);
  formData.set('file', file);
  const response = await authenticatedFetch('/profile/certifications/materials', {
    method: 'POST',
    body: formData,
  });
  const envelope = await response.json().catch(() => null);
  if (!response.ok || !envelope || envelope.code !== 0) {
    throw new ApiClientError(envelope?.message || '证明材料上传失败', {
      code: envelope?.code ?? response.status,
      detail: envelope?.detail,
      requestId: envelope?.request_id ?? null,
      status: response.status,
    });
  }
  return envelope.data as UploadPayload;
}

export function getPoints(): Promise<PointsPayload> {
  return authenticatedApiRequest<PointsPayload>('/profile/points');
}

function withTeamHeader(teamId: string): Record<string, string> {
  return { 'X-Team-ID': teamId };
}

export function listDatasets(teamId: string): Promise<DatasetListResponse> {
  return authenticatedApiRequest<DatasetListResponse>('/datasets', { headers: withTeamHeader(teamId) });
}

export function getDataset(teamId: string, datasetId: string): Promise<DatasetPayload> {
  return authenticatedApiRequest<DatasetPayload>(`/datasets/${datasetId}`, { headers: withTeamHeader(teamId) });
}

export async function uploadDataset(
  teamId: string,
  payload: { name: string; description?: string; file: File; mediaFiles?: File[]; mediaAssets?: Array<Record<string, unknown>> },
  onProgress?: (progress: UploadProgressInfo) => void,
): Promise<DatasetPayload> {
  const formData = new FormData();
  formData.set('name', payload.name);
  formData.set('description', payload.description ?? '');
  formData.set('media_assets', JSON.stringify(payload.mediaAssets ?? []));
  formData.set('file', payload.file);
  for (const mediaFile of payload.mediaFiles ?? []) {
    formData.append('media_files', mediaFile);
  }
  return authenticatedUploadRequest<DatasetPayload>('/datasets', {
    method: 'POST',
    headers: {
      ...withTeamHeader(teamId),
    },
    body: formData,
    onProgress,
    fallbackMessage: '数据集导入失败',
  });
}

export function updateDataset(teamId: string, datasetId: string, payload: {
  name?: string;
  description?: string | null;
  columns?: Array<{ name: string; comment?: string; use_in_mapping?: boolean }>;
  derived_columns?: Array<{
    name: string;
    data_type: string;
    comment?: string;
    use_in_mapping?: boolean;
    source_column?: string | null;
    default_value?: string | null;
    expression?: string | null;
  }>;
}): Promise<DatasetPayload> {
  return authenticatedApiRequest<DatasetPayload>(`/datasets/${datasetId}`, {
    method: 'PUT',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function updateDatasetTable(teamId: string, datasetId: string, payload: {
  columns: Array<{ name: string; data_type?: string; comment?: string; use_in_mapping?: boolean }>;
  rows: Array<Record<string, unknown>>;
}): Promise<DatasetPayload> {
  return authenticatedApiRequest<DatasetPayload>(`/datasets/${datasetId}/table`, {
    method: 'PUT',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function bindDatasetMediaAsset(teamId: string, datasetId: string, payload: {
  asset_index: number;
  row_index: number;
  role?: 'primary' | 'context' | 'evidence';
  field?: string | null;
  media_type?: string | null;
}): Promise<DatasetPayload> {
  return authenticatedApiRequest<DatasetPayload>(`/datasets/${datasetId}/media-assets/bind`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export async function patchUploadDataset(teamId: string, datasetId: string, payload: {
  primaryKey: string;
  file: File;
  mediaFiles?: File[];
  mediaAssets?: Array<Record<string, unknown>>;
}, onProgress?: (progress: UploadProgressInfo) => void): Promise<DatasetPayload> {
  const formData = new FormData();
  formData.set('primary_key', payload.primaryKey);
  formData.set('media_assets', JSON.stringify(payload.mediaAssets ?? []));
  formData.set('file', payload.file);
  for (const mediaFile of payload.mediaFiles ?? []) {
    formData.append('media_files', mediaFile);
  }
  return authenticatedUploadRequest<DatasetPayload>(`/datasets/${datasetId}/patch-upload`, {
    method: 'POST',
    headers: {
      ...withTeamHeader(teamId),
    },
    body: formData,
    onProgress,
    fallbackMessage: '补上传合并失败',
  });
}

export function deleteDataset(teamId: string, datasetId: string): Promise<void> {
  return authenticatedApiRequest<void>(`/datasets/${datasetId}`, {
    method: 'DELETE',
    headers: withTeamHeader(teamId),
  });
}

export async function downloadDataset(teamId: string, datasetId: string, format: 'json' | 'jsonl' | 'csv' = 'jsonl'): Promise<Blob> {
  const response = await authenticatedFetch(`/datasets/${datasetId}/download?format=${format}`, {
    headers: {
      ...withTeamHeader(teamId),
    },
  });
  if (!response.ok) {
    const envelope = await response.json().catch(() => null);
    throw new ApiClientError(envelope?.message || '数据集下载失败', {
      code: envelope?.code ?? response.status,
      detail: envelope?.detail,
      requestId: envelope?.request_id ?? null,
      status: response.status,
    });
  }
  return response.blob();
}

export function listTemplates(teamId: string): Promise<TemplateListResponse> {
  return authenticatedApiRequest<TemplateListResponse>('/templates', { headers: withTeamHeader(teamId) });
}

export function createTemplate(teamId: string, payload: { name: string; description?: string; schema: TemplateSchemaPayload; auto_saved?: boolean }): Promise<TemplatePayload> {
  return authenticatedApiRequest<TemplatePayload>('/templates', {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function getTemplate(teamId: string, templateId: string): Promise<TemplatePayload> {
  return authenticatedApiRequest<TemplatePayload>(`/templates/${templateId}`, { headers: withTeamHeader(teamId) });
}

export function updateTemplate(teamId: string, templateId: string, payload: { name?: string; description?: string | null; schema?: TemplateSchemaPayload; auto_saved?: boolean }): Promise<TemplatePayload> {
  return authenticatedApiRequest<TemplatePayload>(`/templates/${templateId}`, {
    method: 'PUT',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function publishTemplate(teamId: string, templateId: string): Promise<TemplatePayload> {
  return authenticatedApiRequest<TemplatePayload>(`/templates/${templateId}/publish`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
  });
}

export function getTemplateReadiness(teamId: string, templateId: string): Promise<TemplateReadinessPayload> {
  return authenticatedApiRequest<TemplateReadinessPayload>(`/templates/${templateId}/readiness`, { headers: withTeamHeader(teamId) });
}

export function copyTemplate(teamId: string, templateId: string, payload: { name?: string; description?: string | null } = {}): Promise<TemplatePayload> {
  return authenticatedApiRequest<TemplatePayload>(`/templates/${templateId}/copy`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function archiveTemplate(teamId: string, templateId: string): Promise<TemplatePayload> {
  return authenticatedApiRequest<TemplatePayload>(`/templates/${templateId}/archive`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
  });
}

export function deleteTemplate(teamId: string, templateId: string): Promise<void> {
  return authenticatedApiRequest<void>(`/templates/${templateId}`, {
    method: 'DELETE',
    headers: withTeamHeader(teamId),
  });
}

export function listTemplateVersions(teamId: string, templateId: string): Promise<TemplateVersionListResponse> {
  return authenticatedApiRequest<TemplateVersionListResponse>(`/templates/${templateId}/versions`, { headers: withTeamHeader(teamId) });
}

export function getTemplateVersionDiff(teamId: string, templateId: string, fromVersion: number, toVersion: number): Promise<TemplateVersionDiffPayload> {
  return authenticatedApiRequest<TemplateVersionDiffPayload>(`/templates/${templateId}/versions/diff?from_version=${fromVersion}&to_version=${toVersion}`, { headers: withTeamHeader(teamId) });
}

export function validateTemplateAnswers(teamId: string, payload: { schema: TemplateSchemaPayload; answers: Record<string, unknown>; content?: Record<string, unknown> }): Promise<TemplateValidationPayload> {
  return authenticatedApiRequest<TemplateValidationPayload>('/templates/validate', {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function generateLabelingAiAssistPreview(teamId: string, payload: { schema: TemplateSchemaPayload; content: Record<string, unknown>; answers?: Record<string, unknown>; prompt?: string; component_id?: string }): Promise<LabelingAiAssistPayload> {
  return authenticatedApiRequest<LabelingAiAssistPayload>('/labels/llm-assist/preview', {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function getTemplatePreview(teamId: string, templateId: string): Promise<TemplatePreviewPayload> {
  return authenticatedApiRequest<TemplatePreviewPayload>(`/templates/${templateId}/preview`, { headers: withTeamHeader(teamId) });
}

export function chatWithTemplateAssistant(teamId: string, payload: AiTemplateAssistantRequest): Promise<AiTemplateAssistantResponse> {
  return authenticatedApiRequest<AiTemplateAssistantResponse>('/ai/template-assistant/chat', {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function chatWithTaskPublishAssistant(teamId: string, payload: AiTaskPublishAssistantRequest): Promise<AiTaskPublishAssistantResponse> {
  return authenticatedApiRequest<AiTaskPublishAssistantResponse>('/ai/task-publish-assistant/chat', {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

type LabelerAllocationInput = { labeler_id: string; quota: number | null };
type TaskAssignmentInput = {
  enabled: boolean;
  expire_hours: number;
  target_labeler_ids?: string[];
  target_labeler_allocations?: LabelerAllocationInput[];
};

export function createTask(teamId: string, payload: {
  title: string;
  description: string;
  tags: string[];
  auto_saved?: boolean;
  category?: string;
  difficulty?: string;
  deadline?: string | null;
  distribution: 'first_come_all' | 'quota_grab' | 'assigned_link';
  quota?: number;
  reward_rule: { mode: 'task' | 'item'; total_points?: number; points_per_item?: number };
  reviewer_ids?: string[];
  review_config?: Record<string, unknown>;
  ai_config?: Record<string, unknown>;
  qualification_rules?: Record<string, unknown>;
  required_certs?: string[];
  agreement_config?: Record<string, unknown>;
  claim_config?: Record<string, unknown>;
  template_id?: string;
  dataset_id?: string;
  column_mapping: Record<string, string | null>;
  mapping_config?: Record<string, DataBindingPayload>;
  component_bindings?: ComponentBindingsPayload;
  assignment: TaskAssignmentInput;
}): Promise<TaskPayload> {
  return authenticatedApiRequest<TaskPayload>('/tasks', {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function generateAiReviewInputPrompt(teamId: string, payload: {
  provider_id: string;
  model?: string | null;
  dataset?: Record<string, unknown> | null;
  template?: Record<string, unknown> | null;
  context?: Record<string, unknown>;
}): Promise<AiReviewInputGenerateResponse> {
  return authenticatedApiRequest<AiReviewInputGenerateResponse>('/tasks/ai-review/input/generate', {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function generateAiReviewMatrix(teamId: string, payload: {
  provider_id: string;
  model?: string | null;
  dimensions: string[];
  input_prompt?: string | null;
  dataset?: Record<string, unknown> | null;
  template?: Record<string, unknown> | null;
  context?: Record<string, unknown>;
}): Promise<AiReviewMatrixGenerateResponse> {
  return authenticatedApiRequest<AiReviewMatrixGenerateResponse>('/tasks/ai-review/matrix/generate', {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function evaluateTaskDifficulty(teamId: string, payload: {
  dataset_id?: string | null;
  template_id?: string | null;
  required_certs: string[];
  qualification_rules?: Record<string, unknown>;
  context?: Record<string, unknown>;
}): Promise<TaskDifficultyEvaluateResponse> {
  return authenticatedApiRequest<TaskDifficultyEvaluateResponse>('/tasks/difficulty/evaluate', {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function listTasks(teamId: string, params: {
  status?: string;
  keyword?: string;
  owner_id?: string;
  reviewer_id?: string;
  tag?: string;
  category?: string;
  difficulty?: string;
} = {}): Promise<TaskListResponse> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value && value !== 'all') search.set(key, value);
  });
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return authenticatedApiRequest<TaskListResponse>(`/tasks${suffix}`, { headers: withTeamHeader(teamId) });
}

export async function exportTaskList(teamId: string, params: {
  status?: string;
  keyword?: string;
  category?: string;
  difficulty?: string;
  format?: 'csv' | 'json';
} = {}): Promise<Blob> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value && value !== 'all') search.set(key, value);
  });
  const suffix = search.toString() ? `?${search.toString()}` : '';
  const response = await authenticatedFetch(`/tasks/export${suffix}`, {
    headers: withTeamHeader(teamId),
  });
  if (!response.ok) {
    const envelope = await response.json().catch(() => null);
    throw new ApiClientError(envelope?.message || '任务清单导出失败', {
      code: envelope?.code ?? response.status,
      detail: envelope?.detail,
      requestId: envelope?.request_id ?? null,
      status: response.status,
    });
  }
  return response.blob();
}

export function getTask(teamId: string, taskId: string): Promise<TaskPayload> {
  return authenticatedApiRequest<TaskPayload>(`/tasks/${taskId}`, { headers: withTeamHeader(teamId) });
}

export function updateTask(teamId: string, taskId: string, payload: Partial<{
  title: string;
  description: string;
  rich_content: string | null;
  tags: string[];
  auto_saved: boolean;
  category: string;
  difficulty: string;
  deadline: string | null;
  distribution: 'first_come_all' | 'quota_grab' | 'assigned_link';
  quota: number;
  reward_rule: { mode: 'task' | 'item'; total_points?: number; points_per_item?: number };
  reviewer_ids: string[];
  ai_config: Record<string, unknown>;
  qualification_rules: Record<string, unknown>;
  required_certs: string[];
  agreement_config: Record<string, unknown>;
  claim_config: Record<string, unknown>;
  template_id: string;
  dataset_id: string;
  column_mapping: Record<string, string | null>;
  mapping_config: Record<string, DataBindingPayload>;
  component_bindings?: ComponentBindingsPayload;
  assignment: TaskAssignmentInput;
}>): Promise<TaskPayload> {
  return authenticatedApiRequest<TaskPayload>(`/tasks/${taskId}`, {
    method: 'PUT',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function publishTask(teamId: string, taskId: string): Promise<TaskPayload> {
  return authenticatedApiRequest<TaskPayload>(`/tasks/${taskId}/publish`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
  });
}

export function changeTaskStatus(teamId: string, taskId: string, action: 'approve' | 'pause' | 'resume' | 'finish'): Promise<TaskPayload> {
  return authenticatedApiRequest<TaskPayload>(`/tasks/${taskId}/status`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify({ action }),
  });
}

export function transferTaskOwner(teamId: string, taskId: string, payload: { target_owner_id: string; reason?: string }): Promise<TaskPayload> {
  return authenticatedApiRequest<TaskPayload>(`/tasks/${taskId}/owner-transfer`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function updateTaskInternalLabelers(teamId: string, taskId: string, payload: { target_labeler_ids: string[]; target_labeler_allocations?: LabelerAllocationInput[] }): Promise<TaskPayload> {
  return authenticatedApiRequest<TaskPayload>(`/tasks/${taskId}/internal-labelers`, {
    method: 'PUT',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function requestTaskAssistance(teamId: string, taskId: string, payload: RequestTaskAssistanceRequest): Promise<TaskAssistancePayload> {
  return authenticatedApiRequest<TaskAssistancePayload>(`/tasks/${taskId}/request-assistance`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function copyTask(teamId: string, taskId: string, payload: { title?: string } = {}): Promise<TaskPayload> {
  return authenticatedApiRequest<TaskPayload>(`/tasks/${taskId}/copy`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function deleteTask(teamId: string, taskId: string): Promise<void> {
  return authenticatedApiRequest<void>(`/tasks/${taskId}`, {
    method: 'DELETE',
    headers: withTeamHeader(teamId),
  });
}

export function getTaskStats(teamId: string, taskId: string): Promise<TaskStatsPayload> {
  return authenticatedApiRequest<TaskStatsPayload>(`/tasks/${taskId}/stats`, { headers: withTeamHeader(teamId) });
}

export function getTaskReadiness(teamId: string, taskId: string): Promise<TaskReadinessPayload> {
  return authenticatedApiRequest<TaskReadinessPayload>(`/tasks/${taskId}/readiness`, { headers: withTeamHeader(teamId) });
}

export function listTaskQuestions(teamId: string, taskId: string, params: {
  status?: string;
  assigned_to?: string;
  page?: number;
  page_size?: number;
} = {}): Promise<TaskQuestionListResponse> {
  const search = new URLSearchParams();
  if (params.status && params.status !== 'all') search.set('status', params.status);
  if (params.assigned_to) search.set('assigned_to', params.assigned_to);
  if (params.page) search.set('page', String(params.page));
  if (params.page_size) search.set('page_size', String(params.page_size));
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return authenticatedApiRequest<TaskQuestionListResponse>(`/tasks/${taskId}/questions${suffix}`, { headers: withTeamHeader(teamId) });
}

export function getTaskQuestion(teamId: string, taskId: string, questionId: string): Promise<TaskQuestionPayload> {
  return authenticatedApiRequest<TaskQuestionPayload>(`/tasks/${taskId}/questions/${questionId}`, { headers: withTeamHeader(teamId) });
}

export function batchCreateTaskQuestions(teamId: string, taskId: string, items: Array<Record<string, unknown>>): Promise<TaskQuestionBatchResponse> {
  return authenticatedApiRequest<TaskQuestionBatchResponse>(`/tasks/${taskId}/questions/batch`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify({ items }),
  });
}

export async function importTaskQuestions(teamId: string, taskId: string, file: File, options: { replace_existing?: boolean; column_mapping?: Record<string, string> } = {}): Promise<TaskQuestionBatchResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('replace_existing', String(Boolean(options.replace_existing)));
  if (options.column_mapping && Object.keys(options.column_mapping).length > 0) {
    formData.append('column_mapping', JSON.stringify(options.column_mapping));
  }
  const response = await authenticatedFetch(`/tasks/${taskId}/questions/import`, {
    method: 'POST',
    headers: {
      ...withTeamHeader(teamId),
    },
    body: formData,
  });
  const envelope = await response.json().catch(() => null);
  if (!response.ok || !envelope || envelope.code !== 0) {
    throw new ApiClientError(envelope?.message || '题目导入失败', {
      code: envelope?.code ?? response.status,
      detail: envelope?.detail,
      requestId: envelope?.request_id ?? null,
      status: response.status,
    });
  }
  return envelope.data as TaskQuestionBatchResponse;
}

export function updateTaskQuestion(teamId: string, taskId: string, questionId: string, payload: { content?: Record<string, unknown>; status?: string; assigned_to?: string | null }): Promise<TaskQuestionPayload> {
  return authenticatedApiRequest<TaskQuestionPayload>(`/tasks/${taskId}/questions/${questionId}`, {
    method: 'PUT',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function deleteTaskQuestion(teamId: string, taskId: string, questionId: string): Promise<void> {
  return authenticatedApiRequest<void>(`/tasks/${taskId}/questions/${questionId}`, {
    method: 'DELETE',
    headers: withTeamHeader(teamId),
  });
}

export function batchDeleteTaskQuestions(teamId: string, taskId: string, questionIds: string[]): Promise<{ deleted_count: number }> {
  return authenticatedApiRequest<{ deleted_count: number }>(`/tasks/${taskId}/questions/batch`, {
    method: 'DELETE',
    headers: withTeamHeader(teamId),
    body: JSON.stringify({ question_ids: questionIds }),
  });
}

export async function exportTaskQuestions(teamId: string, taskId: string, format: 'json' | 'jsonl' | 'csv' | 'excel' = 'jsonl'): Promise<Blob> {
  const response = await authenticatedFetch(`/tasks/${taskId}/questions/export?format=${format}`, {
    headers: withTeamHeader(teamId),
  });
  if (!response.ok) {
    const envelope = await response.json().catch(() => null);
    throw new ApiClientError(envelope?.message || '题目导出失败', {
      code: envelope?.code ?? response.status,
      detail: envelope?.detail,
      requestId: envelope?.request_id ?? null,
      status: response.status,
    });
  }
  return response.blob();
}

export function createExportJob(teamId: string, payload: {
  task_id: string;
  format: 'json' | 'jsonl' | 'csv' | 'excel';
  filters?: Record<string, unknown>;
  fields_config?: Record<string, unknown>;
  include_review_records?: boolean;
}): Promise<ExportJobPayload> {
  return authenticatedApiRequest<ExportJobPayload>('/exports', {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function listExportJobs(teamId: string, params: { task_id?: string; status?: string; page?: number; page_size?: number } = {}): Promise<ExportJobListResponse> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value && value !== 'all') search.set(key, String(value));
  });
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return authenticatedApiRequest<ExportJobListResponse>(`/exports${suffix}`, { headers: withTeamHeader(teamId) });
}

export function cancelExportJob(teamId: string, exportId: string): Promise<ExportJobPayload> {
  return authenticatedApiRequest<ExportJobPayload>(`/exports/${exportId}`, {
    method: 'DELETE',
    headers: withTeamHeader(teamId),
  });
}

export async function downloadExportJob(teamId: string, exportId: string): Promise<Blob> {
  const response = await authenticatedFetch(`/exports/${exportId}/download`, { headers: withTeamHeader(teamId) });
  if (!response.ok) {
    const envelope = await response.json().catch(() => null);
    throw new ApiClientError(envelope?.message || '导出下载失败', {
      code: envelope?.code ?? response.status,
      detail: envelope?.detail,
      requestId: envelope?.request_id ?? null,
      status: response.status,
    });
  }
  return response.blob();
}

export function listAuditLogs(teamId: string, params: {
  entity_type?: string;
  entity_id?: string;
  action?: string;
  operator_id?: string;
  keyword?: string;
  risk_level?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  page_size?: number;
} = {}): Promise<AuditLogListResponse> {
  const search = new URLSearchParams({ team_id: teamId });
  Object.entries(params).forEach(([key, value]) => {
    if (value && value !== 'all') search.set(key, String(value));
  });
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return authenticatedApiRequest<AuditLogListResponse>(`/audit-logs${suffix}`, { headers: withTeamHeader(teamId) });
}

export function getAuditLog(teamId: string, logId: string): Promise<AuditLogPayload> {
  return authenticatedApiRequest<AuditLogPayload>(`/audit-logs/${logId}`, { headers: withTeamHeader(teamId) });
}

export async function exportAuditLogs(teamId: string, params: {
  entity_type?: string;
  entity_id?: string;
  action?: string;
  operator_id?: string;
  keyword?: string;
  risk_level?: string;
  start_date?: string;
  end_date?: string;
  export_format?: 'csv' | 'json';
} = {}): Promise<Blob> {
  const search = new URLSearchParams({ team_id: teamId, export_format: params.export_format ?? 'csv' });
  Object.entries(params).forEach(([key, value]) => {
    if (value && value !== 'all') search.set(key, String(value));
  });
  const response = await authenticatedFetch(`/audit-logs/export?${search.toString()}`, { headers: withTeamHeader(teamId) });
  if (!response.ok) {
    const envelope = await response.json().catch(() => null);
    throw new ApiClientError(envelope?.message || '操作日志导出失败', {
      code: envelope?.code ?? response.status,
      detail: envelope?.detail,
      requestId: envelope?.request_id ?? null,
      status: response.status,
    });
  }
  return response.blob();
}

export function listNotifications(teamId: string, params: {
  notification_type?: string;
  status?: string;
  keyword?: string;
  page?: number;
  page_size?: number;
} = {}): Promise<NotificationListResponse> {
  const search = new URLSearchParams({ team_id: teamId });
  Object.entries(params).forEach(([key, value]) => {
    if (value && value !== 'all') search.set(key, String(value));
  });
  return authenticatedApiRequest<NotificationListResponse>(`/notifications?${search.toString()}`, { headers: withTeamHeader(teamId) });
}

export function createNotification(teamId: string, payload: {
  title: string;
  content: string;
  notification_type: string;
  priority: string;
  target_type: string;
  target_roles: string[];
  target_user_ids: string[];
  related_entity_type?: string;
  related_entity_id?: string;
  email_enabled: boolean;
  in_app_enabled: boolean;
  expire_at?: string;
}): Promise<NotificationPayload> {
  return authenticatedApiRequest<NotificationPayload>(`/notifications?team_id=${encodeURIComponent(teamId)}`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify(payload),
  });
}

export function previewNotificationRecipients(teamId: string, params: {
  target_type: string;
  target_roles?: string[];
  target_user_ids?: string[];
  related_entity_id?: string;
}): Promise<NotificationRecipientPreview> {
  const search = new URLSearchParams({ team_id: teamId, target_type: params.target_type });
  params.target_roles?.forEach((role) => search.append('target_roles', role));
  params.target_user_ids?.forEach((userId) => search.append('target_user_ids', userId));
  if (params.related_entity_id) search.set('related_entity_id', params.related_entity_id);
  return authenticatedApiRequest<NotificationRecipientPreview>(`/notifications/preview?${search.toString()}`, { headers: withTeamHeader(teamId) });
}

export type NotificationStateAction = 'read' | 'unread' | 'handled' | 'unhandled' | 'star' | 'unstar' | 'delete';

export function updateNotificationState(teamId: string, notificationId: string, status: NotificationStateAction): Promise<NotificationPayload> {
  return authenticatedApiRequest<NotificationPayload>(`/notifications/${notificationId}/state`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify({ action: status }),
  });
}

export function revokeNotification(teamId: string, notificationId: string, reason?: string): Promise<NotificationPayload> {
  return authenticatedApiRequest<NotificationPayload>(`/notifications/${notificationId}/revoke?team_id=${encodeURIComponent(teamId)}`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
    body: JSON.stringify({ reason }),
  });
}

export function deleteNotification(teamId: string, notificationId: string): Promise<{ notification_id: string; deleted: boolean }> {
  return authenticatedApiRequest<{ notification_id: string; deleted: boolean }>(`/notifications/${notificationId}?team_id=${encodeURIComponent(teamId)}`, {
    method: 'DELETE',
    headers: withTeamHeader(teamId),
  });
}

export function markAllNotificationsRead(teamId: string): Promise<{ updated: number }> {
  return authenticatedApiRequest<{ updated: number }>(`/notifications/mark-all-read?team_id=${encodeURIComponent(teamId)}`, {
    method: 'POST',
    headers: withTeamHeader(teamId),
  });
}

export function listMyNotifications(params: {
  notification_type?: string;
  status?: string;
  keyword?: string;
  page?: number;
  page_size?: number;
} = {}): Promise<NotificationListResponse> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value && value !== 'all') search.set(key, String(value));
  });
  const query = search.toString();
  return authenticatedApiRequest<NotificationListResponse>(`/notifications/my${query ? `?${query}` : ''}`);
}

export function updateMyNotificationState(notificationId: string, status: NotificationStateAction): Promise<NotificationPayload> {
  return authenticatedApiRequest<NotificationPayload>(`/notifications/my/${notificationId}/state`, {
    method: 'POST',
    body: JSON.stringify({ action: status }),
  });
}

export function markAllMyNotificationsRead(): Promise<{ updated: number }> {
  return authenticatedApiRequest<{ updated: number }>('/notifications/my/mark-all-read', {
    method: 'POST',
  });
}

export function batchUpdateMyNotificationState(notificationIds: string[], action: NotificationStateAction): Promise<{
  updated_count: number;
  skipped_count: number;
  items: Array<{ notification_id: string; updated: boolean; reason?: string; status?: string }>;
}> {
  return authenticatedApiRequest('/notifications/my/batch-state', {
    method: 'POST',
    body: JSON.stringify({ notification_ids: notificationIds, action }),
  });
}
