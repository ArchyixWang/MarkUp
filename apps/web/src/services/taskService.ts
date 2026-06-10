import { apiRequest, authenticatedApiRequest } from './apiClient';
import type { LabelerContributionsPayload, LabelerTaskListPayload, LabelingAiAssistPayload, LabelingQuestionPayload, LabelingRejectionPayload, LabelingSubmissionPayload, LabelingWorkbenchPayload, PublicTasksResponse, TaskPayload, TaskQualificationCheckPayload } from '../types/api';

export function getPublicTasks(params: URLSearchParams, teamId?: string): Promise<PublicTasksResponse> {
  const query = params.toString();
  if (teamId) {
    return authenticatedApiRequest<PublicTasksResponse>(`/labels/tasks${query ? `?${query}` : ''}`, {
      headers: { 'X-Team-ID': teamId },
    });
  }
  return apiRequest<PublicTasksResponse>(`/labels/tasks${query ? `?${query}` : ''}`);
}

function teamHeaders(teamId?: string): HeadersInit | undefined {
  return teamId ? { 'X-Team-ID': teamId } : undefined;
}

export function claimTaskBundle(taskId: string, bundleSize: number, agreementAccepted = false, teamId?: string): Promise<unknown> {
  return authenticatedApiRequest(`/labels/tasks/${taskId}/claim`, {
    method: 'POST',
    headers: teamHeaders(teamId),
    body: JSON.stringify({ bundle_size: bundleSize, agreement_accepted: agreementAccepted }),
  });
}

export function completeLabelingTask(taskId: string): Promise<LabelerContributionsPayload['recent_items'][number]> {
  return authenticatedApiRequest<LabelerContributionsPayload['recent_items'][number]>(`/labels/tasks/${taskId}/complete`, {
    method: 'POST',
  });
}

export function checkTaskQualification(taskId: string, teamId?: string): Promise<TaskQualificationCheckPayload> {
  return authenticatedApiRequest<TaskQualificationCheckPayload>(`/labels/tasks/${taskId}/qualification-check`, {
    headers: teamHeaders(teamId),
  });
}

export function getLabelingWorkbench(taskId: string): Promise<LabelingWorkbenchPayload> {
  return authenticatedApiRequest<LabelingWorkbenchPayload>(`/labels/workbench/${taskId}`);
}

export function getLabelingQuestion(questionId: string): Promise<LabelingQuestionPayload> {
  return authenticatedApiRequest<LabelingQuestionPayload>(`/labels/questions/${questionId}`);
}

export function getLabelingRejection(questionId: string): Promise<LabelingRejectionPayload> {
  return authenticatedApiRequest<LabelingRejectionPayload>(`/labels/questions/${questionId}/rejection`);
}

export function getLabelerContributions(): Promise<LabelerContributionsPayload> {
  return authenticatedApiRequest<LabelerContributionsPayload>('/labels/contributions');
}

export function getMyLabelingTasks(): Promise<LabelerTaskListPayload> {
  return authenticatedApiRequest<LabelerTaskListPayload>('/labels/my-tasks');
}

export function saveLabelingDraft(questionId: string, answers: Record<string, unknown>): Promise<LabelingSubmissionPayload> {
  return authenticatedApiRequest<LabelingSubmissionPayload>(`/labels/questions/${questionId}/draft`, {
    method: 'PUT',
    body: JSON.stringify({ answers }),
  });
}

export function submitLabelingQuestion(questionId: string, answers: Record<string, unknown>): Promise<LabelingSubmissionPayload> {
  return authenticatedApiRequest<LabelingSubmissionPayload>(`/labels/questions/${questionId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  });
}

export function abandonLabelingQuestion(questionId: string): Promise<{ question: LabelingQuestionPayload; progress: LabelingWorkbenchPayload['progress']; remaining_items: number }> {
  return authenticatedApiRequest(`/labels/questions/${questionId}/abandon`, {
    method: 'POST',
  });
}

export function generateLabelingAiAssist(questionId: string, payload: { prompt?: string; component_id?: string } = {}): Promise<LabelingAiAssistPayload> {
  return authenticatedApiRequest<LabelingAiAssistPayload>(`/labels/questions/${questionId}/llm-assist`, {
    method: 'POST',
    body: JSON.stringify({ prompt: payload.prompt?.trim() || undefined, component_id: payload.component_id || undefined }),
  });
}

export function getAssignedTask(code: string): Promise<TaskPayload & { login_required?: boolean; assigned_to_user_id?: string }> {
  return authenticatedApiRequest(`/tasks/assigned/${code}`);
}
