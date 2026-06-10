import type { AiProviderConfigPayload, AiTaskPublishAssistantResponse, AiTaskPublishChange, AiTemplateAssistantAttachment, TaskPublishDraftContext, TeamDetail } from '../../../types/api';

export type TaskPublishAiPanelState = 'guide' | 'thinking' | 'changes' | 'empty' | 'error';

export interface TaskPublishAiMessage {
  id: string;
  role: 'assistant' | 'user' | 'system';
  content: string;
  status?: 'loading' | 'success' | 'error';
  reasoning?: string | null;
  suggestions?: string[];
}

export interface TaskPublishAiAssistantProps<TForm extends Record<string, unknown>> {
  team: TeamDetail;
  draftTaskId?: string | null;
  context: TaskPublishDraftContext;
  form: TForm;
  mapping: Record<string, string | null>;
  providers: AiProviderConfigPayload[];
  loadingProviders?: boolean;
  placement?: 'floating' | 'inline';
  onApplyDraft: (next: { form: TForm; mapping: Record<string, string | null> }) => void;
  uploadAttachment: (file: File) => Promise<AiTemplateAssistantAttachment>;
}

export interface TaskPublishAiAssistantState {
  conversationId?: string | null;
  response?: AiTaskPublishAssistantResponse | null;
  changes: AiTaskPublishChange[];
}
