import { authenticatedApiRequest } from './apiClient';
import type {
  AiReviewJobPayload,
  AiReviewJobsResponse,
  AiReviewTaskOverviewResponse,
  AiReviewTaskSubmissionsResponse,
  BatchTriggerAiReviewResponse,
} from '../types/api';

function teamHeaders(teamId?: string): Record<string, string> | undefined {
  return teamId ? { 'X-Team-ID': teamId } : undefined;
}

export function getAiReviewJobs(teamId?: string, params: { task_id?: string; status?: string } = {}): Promise<AiReviewJobsResponse> {
  const search = new URLSearchParams();
  if (params.task_id) search.set('task_id', params.task_id);
  if (params.status) search.set('status', params.status);
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return authenticatedApiRequest<AiReviewJobsResponse>(`/ai-reviews/tasks${suffix}`, { headers: teamHeaders(teamId) });
}

export function getAiReviewTaskOverviews(
  teamId?: string,
  params: {
    keyword?: string;
    task_status?: string;
    ai_status?: string;
    provider_id?: string;
    only_anomalies?: boolean;
    page?: number;
    page_size?: number;
  } = {},
): Promise<AiReviewTaskOverviewResponse> {
  const search = new URLSearchParams();
  if (params.keyword) search.set('keyword', params.keyword);
  if (params.task_status) search.set('task_status', params.task_status);
  if (params.ai_status) search.set('ai_status', params.ai_status);
  if (params.provider_id) search.set('provider_id', params.provider_id);
  if (params.only_anomalies) search.set('only_anomalies', 'true');
  if (params.page) search.set('page', String(params.page));
  if (params.page_size) search.set('page_size', String(params.page_size));
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return authenticatedApiRequest<AiReviewTaskOverviewResponse>(`/ai-reviews/task-overviews${suffix}`, { headers: teamHeaders(teamId) });
}

export function getAiReviewTaskSubmissions(
  teamId: string | undefined,
  taskId: string,
  params: { status?: string; suggestion?: string; keyword?: string; page?: number; page_size?: number } = {},
): Promise<AiReviewTaskSubmissionsResponse> {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.suggestion) search.set('suggestion', params.suggestion);
  if (params.keyword) search.set('keyword', params.keyword);
  if (params.page) search.set('page', String(params.page));
  if (params.page_size) search.set('page_size', String(params.page_size));
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return authenticatedApiRequest<AiReviewTaskSubmissionsResponse>(`/ai-reviews/task-overviews/${taskId}/submissions${suffix}`, { headers: teamHeaders(teamId) });
}

export function getAiReviewJob(teamId: string | undefined, jobId: string): Promise<AiReviewJobPayload> {
  return authenticatedApiRequest<AiReviewJobPayload>(`/ai-reviews/tasks/${jobId}`, { headers: teamHeaders(teamId) });
}

export function triggerAiReview(teamId: string | undefined, submissionId: string): Promise<AiReviewJobPayload> {
  return authenticatedApiRequest<AiReviewJobPayload>(`/ai-reviews/submissions/${submissionId}/trigger`, {
    method: 'POST',
    headers: teamHeaders(teamId),
  });
}

export function batchTriggerAiReview(teamId: string | undefined, submissionIds: string[]): Promise<BatchTriggerAiReviewResponse> {
  return authenticatedApiRequest<BatchTriggerAiReviewResponse>('/ai-reviews/batch-trigger', {
    method: 'POST',
    headers: teamHeaders(teamId),
    body: JSON.stringify({ submission_ids: submissionIds }),
  });
}

export function retryAiReviewJob(teamId: string | undefined, jobId: string): Promise<AiReviewJobPayload> {
  return authenticatedApiRequest<AiReviewJobPayload>(`/ai-reviews/tasks/${jobId}/retry`, {
    method: 'POST',
    headers: teamHeaders(teamId),
  });
}
