import type { AiProviderConfigPayload, AiTemplateAssistantAttachment, AiTemplateAssistantResponse, AiTemplateChange, TeamDetail, TemplateSchemaPayload } from '../../../types/api';

export type TemplateAiPanelState = 'guide' | 'thinking' | 'changes' | 'empty' | 'error';

export interface TemplateAiMessage {
  id: string;
  role: 'assistant' | 'user' | 'system';
  content: string;
  status?: 'loading' | 'success' | 'error';
  reasoning?: string | null;
  suggestions?: string[];
}

export interface TemplateAiAssistantProps {
  team: TeamDetail;
  templateId?: string;
  templateName: string;
  templateDescription?: string;
  schema: TemplateSchemaPayload;
  previewContent?: Record<string, unknown>;
  referenceDatasetContext?: Record<string, unknown> | null;
  providers: AiProviderConfigPayload[];
  loadingProviders?: boolean;
  onApplySchema: (schema: TemplateSchemaPayload) => void;
  uploadAttachment: (file: File) => Promise<AiTemplateAssistantAttachment>;
}

export interface TemplateAiAssistantState {
  conversationId?: string | null;
  response?: AiTemplateAssistantResponse | null;
  changes: AiTemplateChange[];
}
