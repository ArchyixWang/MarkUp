import { authenticatedApiRequest } from './apiClient';
import type { BatchReviewResponse, ReviewDiffResponse, ReviewHistoryResponse, ReviewQueueResponse, ReviewStatsResponse, ReviewSubmissionDetail } from '../types/api';

function teamHeaders(teamId?: string): Record<string, string> | undefined {
  return teamId ? { 'X-Team-ID': teamId } : undefined;
}

export function getReviewQueue(
  teamId?: string,
  params: { assigned_only?: boolean; ai_suggestion?: string; status?: 'submitted' | 'processed' | 'all'; stage?: 'all_stages' | 'initial_review' | 're_review' | 'final_review'; keyword?: string } = {},
): Promise<ReviewQueueResponse> {
  const search = new URLSearchParams();
  if (params.assigned_only !== undefined) search.set('assigned_only', String(params.assigned_only));
  if (params.ai_suggestion) search.set('ai_suggestion', params.ai_suggestion);
  if (params.status) search.set('status', params.status);
  if (params.stage) search.set('stage', params.stage);
  if (params.keyword) search.set('keyword', params.keyword);
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return authenticatedApiRequest<ReviewQueueResponse>(`/reviews/queue${suffix}`, { headers: teamHeaders(teamId) });
}

export function getReviewStats(teamId?: string, params: { assigned_only?: boolean } = {}): Promise<ReviewStatsResponse> {
  const search = new URLSearchParams();
  if (params.assigned_only !== undefined) search.set('assigned_only', String(params.assigned_only));
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return authenticatedApiRequest<ReviewStatsResponse>(`/reviews/stats${suffix}`, { headers: teamHeaders(teamId) });
}

export function getReviewSubmission(
  teamId: string | undefined,
  submissionId: string,
  params: { assigned_only?: boolean } = {},
): Promise<ReviewSubmissionDetail> {
  const search = new URLSearchParams();
  if (params.assigned_only !== undefined) search.set('assigned_only', String(params.assigned_only));
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return authenticatedApiRequest<ReviewSubmissionDetail>(`/reviews/submissions/${submissionId}${suffix}`, { headers: teamHeaders(teamId) });
}

export function getReviewHistory(
  teamId: string | undefined,
  submissionId: string,
  params: { assigned_only?: boolean } = {},
): Promise<ReviewHistoryResponse> {
  const search = new URLSearchParams();
  if (params.assigned_only !== undefined) search.set('assigned_only', String(params.assigned_only));
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return authenticatedApiRequest<ReviewHistoryResponse>(`/reviews/submissions/${submissionId}/history${suffix}`, { headers: teamHeaders(teamId) });
}

export function getReviewDiff(
  teamId: string | undefined,
  submissionId: string,
  params: { assigned_only?: boolean } = {},
): Promise<ReviewDiffResponse> {
  const search = new URLSearchParams();
  if (params.assigned_only !== undefined) search.set('assigned_only', String(params.assigned_only));
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return authenticatedApiRequest<ReviewDiffResponse>(`/reviews/submissions/${submissionId}/diff${suffix}`, { headers: teamHeaders(teamId) });
}

export function submitReviewDecision(
  teamId: string | undefined,
  submissionId: string,
  payload: { decision: 'approved' | 'rejected' | 'revise'; comment?: string; revised_answers?: Record<string, unknown> },
): Promise<ReviewSubmissionDetail> {
  return authenticatedApiRequest<ReviewSubmissionDetail>(`/reviews/submissions/${submissionId}`, {
    method: 'POST',
    headers: teamHeaders(teamId),
    body: JSON.stringify(payload),
  });
}

export function submitBatchReviewDecision(
  teamId: string | undefined,
  payload: { submission_ids: string[]; decision: 'approved' | 'rejected' | 'revise'; comment?: string },
): Promise<BatchReviewResponse> {
  return authenticatedApiRequest<BatchReviewResponse>('/reviews/submissions/batch', {
    method: 'POST',
    headers: teamHeaders(teamId),
    body: JSON.stringify(payload),
  });
}
