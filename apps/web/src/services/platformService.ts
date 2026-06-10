import { authenticatedApiRequest } from './apiClient';
import type { AiProviderConfigPayload } from '../types/api';

export interface PaginationPayload {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface PlatformCommissionSetting {
  commission_rate_bps: number;
  commission_rate_percent: number;
  unit_hint: string;
  updated_by?: string | null;
  updated_at?: string | null;
}

export interface PlatformAgentEmbeddingSetting {
  api_base?: string | null;
  model: string;
  api_key_configured: boolean;
  updated_by?: string | null;
  updated_at?: string | null;
}

export interface PlatformSettlement {
  ledger_id: string;
  transaction_type: string;
  source_type?: string | null;
  source_id?: string | null;
  team_id?: string | null;
  team_name?: string | null;
  task_id?: string | null;
  labeler_id?: string | null;
  labeler_name?: string | null;
  reward_points: number;
  commission_rate_bps: number;
  amount_points: number;
  amount_yuan: number;
  status: string;
  note?: string | null;
  created_at?: string | null;
}

export interface PlatformPaymentRequest {
  request_id: string;
  request_type: string;
  owner_type: 'team' | 'user' | string;
  owner_id: string;
  owner_name?: string | null;
  amount_points: number;
  amount_yuan: number;
  payout_method?: string | null;
  account_name?: string | null;
  account_no?: string | null;
  bank_name?: string | null;
  note?: string | null;
  status: string;
  reviewer_id?: string | null;
  review_comment?: string | null;
  reviewed_at?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  unit_hint: string;
}

export interface PlatformTeamVerification {
  team_id: string;
  company_name: string;
  verification_status: string;
  legal_name?: string | null;
  registration_number?: string | null;
  verification_contact?: string | null;
  verification_phone?: string | null;
  verification_materials: Array<string | Record<string, unknown>>;
  verification_review_comment?: string | null;
  verification_submitted_at?: string | null;
  created_at?: string | null;
}

export interface PlatformCertification {
  cert_id: string;
  cert_category: string;
  cert_type: string;
  cert_name: string;
  status: string;
  provider?: string | null;
  submitted_data: Record<string, unknown>;
  documents: Array<string | Record<string, unknown>>;
  reviewer_notes?: string | null;
  created_at?: string | null;
  user: {
    user_id: string;
    username: string;
    display_name: string;
    email?: string | null;
    role: string;
    status: string;
  };
}

export interface PlatformReputationAppeal {
  appeal_id: string;
  ledger_id: string;
  reason: string;
  status: string;
  reviewer_id?: string | null;
  reviewer_notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  user?: {
    user_id: string;
    username: string;
    display_name?: string | null;
    email?: string | null;
    role?: string;
    status?: string;
  } | null;
  ledger?: {
    ledger_id: string;
    change: number;
    reason: string;
    source_type?: string | null;
    source_id?: string | null;
    balance_after: number;
    metadata?: Record<string, unknown>;
    appeal_status?: string | null;
    created_at?: string | null;
  } | null;
  refund_adjustment?: unknown;
}

export interface PlatformWorkbench {
  summary: {
    total_commission_points: number;
    month_commission_points: number;
    pending_payment_count: number;
    pending_payment_points: number;
    pending_team_verifications: number;
    pending_certifications: number;
  };
  commission_setting: PlatformCommissionSetting;
  settlement_trend: Array<{
    date: string;
    commission_points: number;
    commission_yuan: number;
  }>;
  recent_settlements: PlatformSettlement[];
  pending_payments: PlatformPaymentRequest[];
  unit_hint: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationPayload;
}

export interface PlatformAiProviderUpsertPayload {
  route_name: string;
  provider_kind: string;
  protocol_profile?: string;
  scope: 'platform';
  is_platform_default?: boolean;
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
}

export interface PlatformAiProviderDraftTestPayload {
  route_name: string;
  provider_kind: string;
  protocol_profile?: string;
  scope: 'platform';
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
}

export interface ProviderConnectionTestResult {
  provider_id?: string;
  route_name: string;
  provider_kind: string;
  model: string;
  latency_ms: number;
  status: string;
  request_id?: string | null;
}

function buildQuery(params: Record<string, string | number | undefined | null>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export function getPlatformWorkbench() {
  return authenticatedApiRequest<PlatformWorkbench>('/platform/workbench');
}

export function listPlatformSettlements(params: {
  page?: number;
  page_size?: number;
  status?: string;
  team_id?: string;
  keyword?: string;
  start_date?: string;
  end_date?: string;
} = {}) {
  return authenticatedApiRequest<PaginatedResponse<PlatformSettlement>>(`/platform/settlements${buildQuery(params)}`);
}

export function listPlatformPaymentRequests(params: {
  page?: number;
  page_size?: number;
  status?: string;
  owner_type?: string;
  keyword?: string;
  start_date?: string;
  end_date?: string;
} = {}) {
  return authenticatedApiRequest<PaginatedResponse<PlatformPaymentRequest>>(`/platform/payment-requests${buildQuery(params)}`);
}

export function reviewPlatformPaymentRequest(requestId: string, payload: { decision: 'approved' | 'rejected'; comment?: string }) {
  return authenticatedApiRequest<PlatformPaymentRequest>(`/platform/payment-requests/${requestId}/review`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listPlatformTeamVerificationQueue(params: {
  page?: number;
  page_size?: number;
  status?: string;
  keyword?: string;
  start_date?: string;
  end_date?: string;
} = {}) {
  return authenticatedApiRequest<PaginatedResponse<PlatformTeamVerification>>(`/platform/teams/verification-queue${buildQuery(params)}`);
}

export function reviewPlatformTeamVerification(teamId: string, payload: { decision: 'approved' | 'rejected'; comment?: string }) {
  return authenticatedApiRequest<PlatformTeamVerification>(`/platform/teams/${teamId}/verification/review`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listPlatformCertifications(params: { page?: number; page_size?: number; status?: string; cert_category?: string; keyword?: string } = {}) {
  return authenticatedApiRequest<PaginatedResponse<PlatformCertification>>(`/platform/certifications/review-queue${buildQuery(params)}`);
}

export function reviewPlatformCertification(certId: string, payload: { decision: 'approved' | 'rejected'; reviewer_notes?: string }) {
  return authenticatedApiRequest<PlatformCertification>(`/platform/certifications/${certId}/review`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listPlatformReputationAppeals(params: { page?: number; page_size?: number; status?: string } = {}) {
  return authenticatedApiRequest<PaginatedResponse<PlatformReputationAppeal>>(`/platform/reputation-appeals${buildQuery(params)}`);
}

export function reviewPlatformReputationAppeal(appealId: string, payload: { decision: 'approved' | 'rejected'; reviewer_notes?: string }) {
  return authenticatedApiRequest<PlatformReputationAppeal>(`/platform/reputation-appeals/${appealId}/review`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getPlatformCommissionSetting() {
  return authenticatedApiRequest<PlatformCommissionSetting>('/platform/settings/commission');
}

export function updatePlatformCommissionSetting(commission_rate_bps: number) {
  return authenticatedApiRequest<PlatformCommissionSetting>('/platform/settings/commission', {
    method: 'PUT',
    body: JSON.stringify({ commission_rate_bps }),
  });
}

export function getPlatformAgentEmbeddingSetting() {
  return authenticatedApiRequest<PlatformAgentEmbeddingSetting>('/platform/settings/agent-embedding');
}

export function updatePlatformAgentEmbeddingSetting(payload: { api_base?: string | null; api_key?: string; model: string }) {
  return authenticatedApiRequest<PlatformAgentEmbeddingSetting>('/platform/settings/agent-embedding', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function listPlatformAiProviderConfigs() {
  return authenticatedApiRequest<{ items: AiProviderConfigPayload[] }>('/ai-resources/configs');
}

export function createPlatformAiProviderConfig(payload: PlatformAiProviderUpsertPayload) {
  return authenticatedApiRequest<AiProviderConfigPayload>('/ai-resources/configs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updatePlatformAiProviderConfig(providerId: string, payload: Partial<PlatformAiProviderUpsertPayload>) {
  return authenticatedApiRequest<AiProviderConfigPayload>(`/ai-resources/configs/${providerId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function duplicatePlatformAiProviderConfig(providerId: string) {
  return authenticatedApiRequest<AiProviderConfigPayload>(`/ai-resources/configs/${providerId}/duplicate`, {
    method: 'POST',
  });
}

export function setPlatformAiProviderConfigStatus(providerId: string, status: string) {
  return authenticatedApiRequest<AiProviderConfigPayload>(`/ai-resources/configs/${providerId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}

export function deletePlatformAiProviderConfig(providerId: string) {
  return authenticatedApiRequest<{ provider_id: string }>(`/ai-resources/configs/${providerId}`, {
    method: 'DELETE',
  });
}

export function testPlatformAiProviderConfig(providerId: string, payload: { message?: string } = {}) {
  return authenticatedApiRequest<ProviderConnectionTestResult>(`/ai-resources/configs/${providerId}/test`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function testDraftPlatformAiProviderConfig(payload: PlatformAiProviderDraftTestPayload) {
  return authenticatedApiRequest<ProviderConnectionTestResult>('/ai-resources/configs/test-draft', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
