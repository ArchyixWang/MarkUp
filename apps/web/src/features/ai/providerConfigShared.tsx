import { Alert, Descriptions, Form, Input, InputNumber, Select, Switch } from 'antd';
import type { FormInstance } from 'antd/es/form';
import type { CSSProperties, ReactNode } from 'react';
import type { AiProviderConfigPayload } from '../../types/api';

export type ProviderFormValues = {
  route_name: string;
  provider_kind: string;
  protocol_profile: string;
  api_base?: string;
  api_key?: string;
  model_id: string;
  azure_resource_name?: string;
  azure_api_version?: string;
  openai_organization_id?: string;
  openai_project_id?: string;
  openrouter_site_url?: string;
  openrouter_app_name?: string;
  anthropic_version?: string;
  gemini_api_version?: string;
  qwen_workspace_id?: string;
  ark_region?: string;
  ollama_keep_alive?: string;
  ollama_num_ctx?: number;
  custom_headers_json?: string;
  input_price_per_million: number;
  output_price_per_million: number;
  cache_hit_price_per_million: number;
  capabilities?: string[];
  transport_modes?: string[];
  supports_streaming?: boolean;
  capability_profile?: Record<string, {
    enabled?: boolean;
    transport_modes?: string[];
    supports_streaming?: boolean;
    request_part_type?: string;
    options?: {
      fps?: number;
      detail?: 'low' | 'high' | 'auto';
    };
  }>;
  temperature?: number;
  max_output_tokens?: number;
  timeout_ms?: number;
  reasoning_effort?: 'off' | 'minimal' | 'low' | 'medium' | 'high';
  status?: 'enabled' | 'disabled';
  remark?: string;
  is_platform_default?: boolean;
};

export type ProviderKindOption = {
  value: string;
  label: string;
  apiBase: string;
  intro: string;
  modelLabel: string;
  endpointLabel: string;
  keyHint: string;
};

export const providerFormGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 8,
} satisfies CSSProperties;

export const providerStatusColors: Record<string, string> = {
  enabled: 'green',
  disabled: 'default',
  missing: 'orange',
  success: 'green',
  failed: 'red',
  pending: 'processing',
};

export const providerKindOptions: ProviderKindOption[] = [
  {
    value: '方舟',
    label: '方舟',
    apiBase: 'https://ark.cn-beijing.volces.com/api/v3',
    intro: '火山方舟兼容接入，适合国内模型路由。',
    modelLabel: '接入点 / 模型 ID',
    endpointLabel: '方舟 API 域名',
    keyHint: '请输入方舟 API Key',
  },
  {
    value: '通义千问',
    label: '通义千问',
    apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    intro: '阿里云 DashScope 兼容接入。',
    modelLabel: '模型 ID',
    endpointLabel: 'DashScope Base URL',
    keyHint: '请输入 DashScope API Key',
  },
  {
    value: 'OpenAI',
    label: 'OpenAI',
    apiBase: 'https://api.openai.com/v1',
    intro: '原生 OpenAI 路由。',
    modelLabel: '模型 ID',
    endpointLabel: 'OpenAI Base URL',
    keyHint: '请输入 OpenAI API Key',
  },
  {
    value: 'OpenAI Compatible',
    label: 'OpenAI Compatible',
    apiBase: 'https://api.example.com/v1',
    intro: '兼容 OpenAI 协议的第三方网关。',
    modelLabel: '模型 ID',
    endpointLabel: '兼容网关 Base URL',
    keyHint: '请输入兼容网关 API Key',
  },
  {
    value: 'DeepSeek',
    label: 'DeepSeek',
    apiBase: 'https://api.deepseek.com/v1',
    intro: 'DeepSeek 官方 OpenAI 兼容接口。',
    modelLabel: '模型 ID',
    endpointLabel: 'DeepSeek Base URL',
    keyHint: '请输入 DeepSeek API Key',
  },
  {
    value: 'OpenRouter',
    label: 'OpenRouter',
    apiBase: 'https://openrouter.ai/api/v1',
    intro: '多模型统一路由。',
    modelLabel: '上游模型 ID',
    endpointLabel: 'OpenRouter Base URL',
    keyHint: '请输入 OpenRouter API Key',
  },
  {
    value: 'Anthropic',
    label: 'Anthropic',
    apiBase: 'https://api.anthropic.com/v1',
    intro: 'Claude 系列模型。',
    modelLabel: '模型 ID',
    endpointLabel: 'Anthropic Base URL',
    keyHint: '请输入 Anthropic API Key',
  },
  {
    value: 'Gemini',
    label: 'Gemini',
    apiBase: 'https://generativelanguage.googleapis.com/v1beta',
    intro: 'Google Gemini 原生接口。',
    modelLabel: '模型 ID',
    endpointLabel: 'Gemini API Base',
    keyHint: '请输入 Gemini API Key',
  },
  {
    value: 'Azure OpenAI',
    label: 'Azure OpenAI',
    apiBase: 'https://example-resource.openai.azure.com/openai/deployments/example-deployment',
    intro: 'Azure 部署路由。',
    modelLabel: 'Deployment 名称',
    endpointLabel: 'Azure Endpoint',
    keyHint: '请输入 Azure API Key',
  },
  {
    value: 'Ollama / LM Studio',
    label: 'Ollama / LM Studio',
    apiBase: 'http://127.0.0.1:11434/v1',
    intro: '本地模型或内网代理。',
    modelLabel: '本地模型名',
    endpointLabel: '本地服务地址',
    keyHint: '可留空，私有部署时再填写',
  },
];

export const providerCapabilityOptions = [
  { value: 'text', label: '文本' },
  { value: 'image', label: '图像' },
  { value: 'audio', label: '音频' },
  { value: 'video', label: '视频' },
];

export const providerProtocolProfileOptions = [
  { value: 'ark_chat', label: 'Ark Chat' },
  { value: 'qwen_chat', label: 'Qwen Chat' },
  { value: 'openai_chat', label: 'OpenAI Chat' },
  { value: 'azure_openai_chat', label: 'Azure OpenAI Chat' },
  { value: 'openai_compatible_chat', label: 'OpenAI Compatible Chat' },
  { value: 'deepseek_chat', label: 'DeepSeek Chat' },
  { value: 'openrouter_chat', label: 'OpenRouter Chat' },
  { value: 'anthropic_messages', label: 'Anthropic Messages' },
  { value: 'gemini_native', label: 'Gemini Native' },
  { value: 'ollama_chat', label: 'Ollama Chat' },
];

const providerProtocolDefaultsByKind: Record<string, string> = {
  '方舟': 'ark_chat',
  '通义千问': 'qwen_chat',
  OpenAI: 'openai_chat',
  'OpenAI Compatible': 'openai_compatible_chat',
  DeepSeek: 'deepseek_chat',
  OpenRouter: 'openrouter_chat',
  Anthropic: 'anthropic_messages',
  Gemini: 'gemini_native',
  'Azure OpenAI': 'azure_openai_chat',
  'Ollama / LM Studio': 'ollama_chat',
};

const providerProtocolSpecs: Record<string, {
  supportsStreaming: boolean;
  modalities: Record<'image' | 'audio' | 'video', { transportModes: string[]; requestPartTypes: string[] }>;
}> = {
  openai_chat: {
    supportsStreaming: true,
    modalities: {
      image: { transportModes: ['external_url', 'inline_data'], requestPartTypes: ['image_url'] },
      audio: { transportModes: ['inline_data'], requestPartTypes: ['input_audio'] },
      video: { transportModes: [], requestPartTypes: [] },
    },
  },
  azure_openai_chat: {
    supportsStreaming: true,
    modalities: {
      image: { transportModes: ['external_url', 'inline_data'], requestPartTypes: ['image_url'] },
      audio: { transportModes: ['inline_data'], requestPartTypes: ['input_audio'] },
      video: { transportModes: [], requestPartTypes: [] },
    },
  },
  openai_compatible_chat: {
    supportsStreaming: true,
    modalities: {
      image: { transportModes: ['external_url', 'inline_data'], requestPartTypes: ['image_url'] },
      audio: { transportModes: ['external_url', 'inline_data'], requestPartTypes: ['audio_url', 'input_audio'] },
      video: { transportModes: ['external_url', 'inline_data'], requestPartTypes: ['video_url'] },
    },
  },
  deepseek_chat: {
    supportsStreaming: true,
    modalities: {
      image: { transportModes: ['external_url', 'inline_data'], requestPartTypes: ['image_url'] },
      audio: { transportModes: ['external_url', 'inline_data'], requestPartTypes: ['audio_url', 'input_audio'] },
      video: { transportModes: ['external_url', 'inline_data'], requestPartTypes: ['video_url'] },
    },
  },
  openrouter_chat: {
    supportsStreaming: true,
    modalities: {
      image: { transportModes: ['external_url', 'inline_data'], requestPartTypes: ['image_url'] },
      audio: { transportModes: ['external_url', 'inline_data'], requestPartTypes: ['audio_url', 'input_audio'] },
      video: { transportModes: ['external_url', 'inline_data'], requestPartTypes: ['video_url'] },
    },
  },
  ark_chat: {
    supportsStreaming: true,
    modalities: {
      image: { transportModes: ['external_url', 'inline_data'], requestPartTypes: ['image_url'] },
      audio: { transportModes: ['external_url', 'inline_data'], requestPartTypes: ['audio_url', 'input_audio'] },
      video: { transportModes: ['external_url', 'inline_data', 'file_api'], requestPartTypes: ['video_url', 'input_video'] },
    },
  },
  qwen_chat: {
    supportsStreaming: true,
    modalities: {
      image: { transportModes: ['external_url', 'inline_data'], requestPartTypes: ['image_url'] },
      audio: { transportModes: ['external_url', 'inline_data'], requestPartTypes: ['audio_url', 'input_audio'] },
      video: { transportModes: ['external_url', 'inline_data'], requestPartTypes: ['video_url'] },
    },
  },
  anthropic_messages: {
    supportsStreaming: true,
    modalities: {
      image: { transportModes: ['inline_data'], requestPartTypes: ['anthropic_image'] },
      audio: { transportModes: [], requestPartTypes: [] },
      video: { transportModes: [], requestPartTypes: [] },
    },
  },
  gemini_native: {
    supportsStreaming: true,
    modalities: {
      image: { transportModes: ['external_url', 'inline_data'], requestPartTypes: ['file_data', 'inline_data'] },
      audio: { transportModes: ['external_url', 'inline_data'], requestPartTypes: ['file_data', 'inline_data'] },
      video: { transportModes: ['external_url', 'inline_data'], requestPartTypes: ['file_data', 'inline_data'] },
    },
  },
  ollama_chat: {
    supportsStreaming: true,
    modalities: {
      image: { transportModes: ['external_url', 'inline_data'], requestPartTypes: ['image_url'] },
      audio: { transportModes: [], requestPartTypes: [] },
      video: { transportModes: [], requestPartTypes: [] },
    },
  },
};

const transportModeOptions = [
  { value: 'external_url', label: 'External URL' },
  { value: 'inline_data', label: 'Inline Base64' },
  { value: 'file_api', label: 'File API Upload' },
];

const imageDetailOptions = [
  { value: 'auto', label: 'Auto' },
  { value: 'high', label: 'High' },
  { value: 'low', label: 'Low' },
];

export function getProviderOptionMeta(kind: string): ProviderKindOption {
  return providerKindOptions.find((item) => item.value === kind) ?? providerKindOptions[0];
}

export function getProviderModelPlaceholder(kind: string): string {
  if (kind === '方舟') return '例如：doubao-seed-1-6-250615';
  if (kind === '通义千问') return '例如：qwen-plus';
  if (kind === 'OpenAI') return '例如：gpt-4.1-mini';
  if (kind === 'OpenAI Compatible') return '例如：deepseek-chat';
  if (kind === 'DeepSeek') return '例如：deepseek-chat';
  if (kind === 'OpenRouter') return '例如：openai/gpt-4.1-mini';
  if (kind === 'Anthropic') return '例如：claude-3-7-sonnet-20250219';
  if (kind === 'Gemini') return '例如：gemini-2.5-pro';
  if (kind === 'Azure OpenAI') return '例如：gpt-4o-prod';
  return '例如：qwen2.5:14b';
}
export function getDefaultProtocolProfile(kind: string): string {
  if (providerProtocolDefaultsByKind[kind]) return providerProtocolDefaultsByKind[kind];
  const normalized = kind.trim().toLowerCase();
  if (normalized.includes('ark') || kind.includes('方舟')) return 'ark_chat';
  if (normalized.includes('qwen') || normalized.includes('dashscope') || kind.includes('通义')) return 'qwen_chat';
  if (normalized.includes('azure')) return 'azure_openai_chat';
  if (normalized.includes('anthropic') || normalized.includes('claude')) return 'anthropic_messages';
  if (normalized.includes('gemini')) return 'gemini_native';
  if (normalized.includes('openrouter')) return 'openrouter_chat';
  if (normalized.includes('deepseek')) return 'deepseek_chat';
  if (normalized.includes('ollama') || normalized.includes('lm studio')) return 'ollama_chat';
  if (normalized === 'openai') return 'openai_chat';
  return 'openai_compatible_chat';
}

function getProtocolSpec(protocolProfile: string) {
  return providerProtocolSpecs[protocolProfile] ?? providerProtocolSpecs.openai_compatible_chat;
}

function getModalitySpec(protocolProfile: string, modality: 'image' | 'audio' | 'video') {
  return getProtocolSpec(protocolProfile).modalities[modality];
}

function buildCapabilityProfileEntry(
  protocolProfile: string,
  modality: 'image' | 'audio' | 'video',
  enabled: boolean,
  current?: NonNullable<ProviderFormValues['capability_profile']>[string],
) {
  const spec = getModalitySpec(protocolProfile, modality);
  const currentModes = (current?.transport_modes ?? []).filter((mode) => spec.transportModes.includes(mode));
  const requestPartType = spec.requestPartTypes.includes(current?.request_part_type ?? '')
    ? current?.request_part_type
    : spec.requestPartTypes[0];
  return {
    enabled,
    transport_modes: currentModes.length ? currentModes : spec.transportModes,
    supports_streaming: current?.supports_streaming ?? getProtocolSpec(protocolProfile).supportsStreaming,
    request_part_type: requestPartType,
    options: {
      ...(current?.options ?? {}),
    },
  };
}

function buildCapabilityProfileForForm(
  protocolProfile: string,
  capabilities: string[] = ['text'],
  current?: ProviderFormValues['capability_profile'],
): NonNullable<ProviderFormValues['capability_profile']> {
  return {
    image: buildCapabilityProfileEntry(protocolProfile, 'image', capabilities.includes('image'), current?.image),
    audio: buildCapabilityProfileEntry(protocolProfile, 'audio', capabilities.includes('audio'), current?.audio),
    video: buildCapabilityProfileEntry(protocolProfile, 'video', capabilities.includes('video'), current?.video),
  };
}

function buildTransportModesFromCapabilityProfile(capabilityProfile: ProviderFormValues['capability_profile'] | undefined): string[] {
  const values = new Set<string>();
  ['image', 'audio', 'video'].forEach((modality) => {
    const entry = capabilityProfile?.[modality];
    (entry?.transport_modes ?? []).forEach((mode) => values.add(mode));
  });
  return Array.from(values);
}

export function buildProviderCapabilityProfile(values: ProviderFormValues): Record<string, unknown> {
  const normalized = buildCapabilityProfileForForm(
    values.protocol_profile || getDefaultProtocolProfile(values.provider_kind),
    values.capabilities ?? ['text'],
    values.capability_profile,
  );
  return Object.fromEntries(
    Object.entries(normalized).map(([modality, entry]) => [
      modality,
      {
        enabled: Boolean(entry.enabled),
        transport_modes: entry.transport_modes ?? [],
        supports_streaming: entry.supports_streaming ?? values.supports_streaming ?? true,
        request_part_type: entry.request_part_type,
        options: Object.fromEntries(
          Object.entries(entry.options ?? {}).filter(([, optionValue]) => optionValue !== undefined && optionValue !== null),
        ),
      },
    ]),
  );
}

export function syncProviderProtocolDraft(form: FormInstance<ProviderFormValues>, patch: Partial<ProviderFormValues> = {}) {
  const nextKind = patch.provider_kind ?? form.getFieldValue('provider_kind') ?? providerKindOptions[0].value;
  const nextProtocol = patch.protocol_profile ?? form.getFieldValue('protocol_profile') ?? getDefaultProtocolProfile(nextKind);
  const nextCapabilities = patch.capabilities ?? form.getFieldValue('capabilities') ?? ['text'];
  const nextCapabilityProfile = buildCapabilityProfileForForm(
    nextProtocol,
    nextCapabilities,
    (patch.capability_profile ?? form.getFieldValue('capability_profile')) as ProviderFormValues['capability_profile'],
  );
  form.setFieldsValue({
    ...patch,
    protocol_profile: nextProtocol,
    supports_streaming: patch.supports_streaming ?? form.getFieldValue('supports_streaming') ?? getProtocolSpec(nextProtocol).supportsStreaming,
    capability_profile: nextCapabilityProfile,
    transport_modes: buildTransportModesFromCapabilityProfile(nextCapabilityProfile),
  });
}

export function buildProviderSpecificDefaults(kind: string): Partial<ProviderFormValues> {
  if (kind === '通义千问' || kind.includes('閫氫箟') || kind.toLowerCase().includes('qwen')) {
    return { qwen_workspace_id: '' };
  }
  if (kind === '方舟' || kind.includes('鏂硅垷') || kind.toLowerCase().includes('ark')) {
    return { ark_region: 'cn-beijing' };
  }
  if (kind === 'OpenAI') {
    return { openai_organization_id: '', openai_project_id: '' };
  }
  if (kind === 'OpenAI Compatible' || kind === 'DeepSeek') {
    return { custom_headers_json: '' };
  }
  if (kind === 'OpenRouter') {
    return { openrouter_site_url: '', openrouter_app_name: '' };
  }
  if (kind === 'Anthropic') {
    return { anthropic_version: '2023-06-01' };
  }
  if (kind === 'Gemini') {
    return { gemini_api_version: 'v1beta' };
  }
  if (kind === 'Azure OpenAI') {
    return { azure_resource_name: '', azure_api_version: '2024-02-15-preview' };
  }
  if (kind === 'Ollama / LM Studio') {
    return { ollama_keep_alive: '5m', ollama_num_ctx: 8192 };
  }
  if (kind === '通义千问') {
    return { qwen_workspace_id: '' };
  }
  if (kind === '方舟') {
    return { ark_region: 'cn-beijing' };
  }
  return {};
}

export function getProviderInitialValues(kind = providerKindOptions[0].value): ProviderFormValues {
  const protocolProfile = getDefaultProtocolProfile(kind);
  const capabilityProfile = buildCapabilityProfileForForm(protocolProfile, ['text']);
  return {
    route_name: '',
    provider_kind: kind,
    protocol_profile: protocolProfile,
    api_base: getProviderOptionMeta(kind).apiBase,
    api_key: '',
    model_id: '',
    ...buildProviderSpecificDefaults(kind),
    input_price_per_million: 0,
    output_price_per_million: 0,
    cache_hit_price_per_million: 0,
    capabilities: ['text'],
    transport_modes: buildTransportModesFromCapabilityProfile(capabilityProfile),
    supports_streaming: getProtocolSpec(protocolProfile).supportsStreaming,
    capability_profile: capabilityProfile,
    temperature: 0,
    max_output_tokens: 2048,
    timeout_ms: 60000,
    reasoning_effort: 'off',
    status: 'enabled',
    remark: '',
    is_platform_default: false,
  };
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

export function applyProviderKindDefaults(form: FormInstance<ProviderFormValues>, kind: string) {
  const nextProtocol = getDefaultProtocolProfile(kind);
  syncProviderProtocolDraft(form, {
    provider_kind: kind,
    protocol_profile: nextProtocol,
    api_base: getProviderOptionMeta(kind).apiBase,
    ...buildProviderSpecificDefaults(kind),
  });
}

export function parseOptionalJson(value: string | undefined, fieldLabel: string): Record<string, string> | undefined {
  if (!value?.trim()) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error();
    }
    const entries = Object.entries(parsed as Record<string, unknown>)
      .filter(([key]) => key.trim())
      .reduce<Record<string, string>>((accumulator, [key, entryValue]) => {
        accumulator[key.trim()] = String(entryValue ?? '');
        return accumulator;
      }, {});
    return Object.keys(entries).length ? entries : undefined;
  } catch {
    throw new Error(`${fieldLabel} 需要填写合法 JSON 对象`);
  }
}

export function buildProviderApiBase(values: ProviderFormValues): string | undefined {
  const raw = values.api_base?.trim();
  if (values.provider_kind !== 'Azure OpenAI') {
    return raw || undefined;
  }
  const resourceName = values.azure_resource_name?.trim();
  const deploymentName = values.model_id.trim();
  if (!resourceName || !deploymentName) {
    return raw || undefined;
  }
  return `https://${resourceName}.openai.azure.com/openai/deployments/${deploymentName}`;
}

export function buildProviderRuntimeConfig(values: ProviderFormValues): Record<string, unknown> {
  const runtime: Record<string, unknown> = {
    temperature: values.temperature,
    max_output_tokens: values.max_output_tokens,
    timeout_ms: values.timeout_ms,
    reasoning_effort: values.reasoning_effort && values.reasoning_effort !== 'off' ? values.reasoning_effort : undefined,
  };
  if (values.provider_kind === 'OpenAI') {
    runtime.organization_id = values.openai_organization_id?.trim() || undefined;
    runtime.project_id = values.openai_project_id?.trim() || undefined;
  }
  if (values.provider_kind === 'OpenAI Compatible' || values.provider_kind === 'DeepSeek') {
    runtime.custom_headers = parseOptionalJson(values.custom_headers_json, '自定义请求头');
  }
  if (values.provider_kind === 'OpenRouter') {
    runtime.site_url = values.openrouter_site_url?.trim() || undefined;
    runtime.app_name = values.openrouter_app_name?.trim() || undefined;
  }
  if (values.provider_kind === 'Anthropic') {
    runtime.anthropic_version = values.anthropic_version?.trim() || undefined;
  }
  if (values.provider_kind === 'Gemini') {
    runtime.api_version = values.gemini_api_version?.trim() || undefined;
  }
  if (values.provider_kind === 'Azure OpenAI') {
    runtime.resource_name = values.azure_resource_name?.trim() || undefined;
    runtime.api_version = values.azure_api_version?.trim() || undefined;
  }
  if (values.provider_kind === 'Ollama / LM Studio') {
    runtime.keep_alive = values.ollama_keep_alive?.trim() || undefined;
    runtime.num_ctx = values.ollama_num_ctx ?? undefined;
  }
  if (values.provider_kind === '通义千问' || values.provider_kind.includes('閫氫箟') || values.provider_kind.toLowerCase().includes('qwen')) {
    runtime.workspace_id = values.qwen_workspace_id?.trim() || undefined;
  }
  if (values.provider_kind === '方舟' || values.provider_kind.includes('鏂硅垷') || values.provider_kind.toLowerCase().includes('ark')) {
    runtime.region = values.ark_region?.trim() || undefined;
  }
  return Object.fromEntries(Object.entries(runtime).filter(([, value]) => value !== undefined && value !== ''));
}

export function extractAzureResourceName(apiBase: string | null | undefined): string | undefined {
  if (!apiBase) return undefined;
  const matched = apiBase.match(/^https:\/\/([^.]+)\.openai\.azure\.com/i);
  return matched?.[1];
}

export function buildProviderFormValuesFromConfig(item: AiProviderConfigPayload): ProviderFormValues {
  const providerKind = getProviderKind(item);
  const runtime = item.runtime_config as Record<string, unknown> | undefined;
  const protocolProfile = item.protocol_profile ?? getDefaultProtocolProfile(providerKind);
  const capabilityProfile = buildCapabilityProfileForForm(
    protocolProfile,
    item.capabilities?.length ? item.capabilities : ['text'],
    item.capability_profile as ProviderFormValues['capability_profile'] | undefined,
  );
  return {
    ...getProviderInitialValues(providerKind),
    route_name: getProviderRouteName(item),
    provider_kind: providerKind,
    protocol_profile: protocolProfile,
    api_base: item.api_base ?? getProviderOptionMeta(providerKind).apiBase,
    api_key: '',
    model_id: getProviderModelId(item),
    azure_resource_name: asOptionalString(runtime?.resource_name) || extractAzureResourceName(item.api_base),
    azure_api_version: asOptionalString(runtime?.api_version),
    openai_organization_id: asOptionalString(runtime?.organization_id),
    openai_project_id: asOptionalString(runtime?.project_id),
    openrouter_site_url: asOptionalString(runtime?.site_url),
    openrouter_app_name: asOptionalString(runtime?.app_name),
    anthropic_version: asOptionalString(runtime?.anthropic_version),
    gemini_api_version: providerKind === 'Gemini' ? asOptionalString(runtime?.api_version) || 'v1beta' : undefined,
    qwen_workspace_id: asOptionalString(runtime?.workspace_id),
    ark_region: asOptionalString(runtime?.region),
    ollama_keep_alive: asOptionalString(runtime?.keep_alive),
    ollama_num_ctx: typeof runtime?.num_ctx === 'number' ? runtime.num_ctx : undefined,
    custom_headers_json: runtime?.custom_headers ? JSON.stringify(runtime.custom_headers, null, 2) : '',
    input_price_per_million: item.pricing?.input_price_per_million ?? 0,
    output_price_per_million: item.pricing?.output_price_per_million ?? 0,
    cache_hit_price_per_million: item.pricing?.cache_hit_price_per_million ?? 0,
    capabilities: item.capabilities?.length ? item.capabilities : ['text'],
    transport_modes: item.transport_modes?.length ? item.transport_modes : buildTransportModesFromCapabilityProfile(capabilityProfile),
    supports_streaming: item.supports_streaming ?? getProtocolSpec(protocolProfile).supportsStreaming,
    capability_profile: capabilityProfile,
    temperature: item.runtime_config?.temperature,
    max_output_tokens: item.runtime_config?.max_output_tokens,
    timeout_ms: item.runtime_config?.timeout_ms,
    reasoning_effort: item.runtime_config?.reasoning_effort as ProviderFormValues['reasoning_effort'],
    status: item.status === 'disabled' ? 'disabled' : 'enabled',
    remark: item.remark ?? '',
    is_platform_default: Boolean(item.is_platform_default),
  };
}

export function renderProviderAccessFields(kind: string, form: FormInstance<ProviderFormValues>): ReactNode {
  if (kind === 'OpenAI') {
    return (
      <>
        <Form.Item name="openai_organization_id" label="Organization ID">
          <Input placeholder="org_xxx" />
        </Form.Item>
        <Form.Item name="openai_project_id" label="Project ID">
          <Input placeholder="proj_xxx" />
        </Form.Item>
      </>
    );
  }
  if (kind === 'OpenAI Compatible' || kind === 'DeepSeek') {
    return (
      <Form.Item
        name="custom_headers_json"
        label="自定义请求头"
        style={{ gridColumn: '1 / -1' }}
        rules={[{
          validator: (_, value) => {
            if (!value?.trim()) return Promise.resolve();
            try {
              const parsed = JSON.parse(value);
              return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                ? Promise.resolve()
                : Promise.reject(new Error('请填写 JSON 对象'));
            } catch {
              return Promise.reject(new Error('请填写合法 JSON'));
            }
          },
        }]}
      >
        <Input.TextArea rows={4} placeholder={'例如：{\n  "x-tenant-id": "team_a"\n}'} />
      </Form.Item>
    );
  }
  if (kind === 'OpenRouter') {
    return (
      <>
        <Form.Item name="openrouter_site_url" label="站点地址">
          <Input placeholder="https://workspace.markup.example" />
        </Form.Item>
        <Form.Item name="openrouter_app_name" label="应用名称">
          <Input placeholder="MarkUp Resource Center" />
        </Form.Item>
      </>
    );
  }
  if (kind === 'Anthropic') {
    return (
      <Form.Item name="anthropic_version" label="Anthropic Version">
        <Input placeholder="2023-06-01" />
      </Form.Item>
    );
  }
  if (kind === 'Gemini') {
    return (
      <Form.Item name="gemini_api_version" label="API Version">
        <Input placeholder="v1beta" />
      </Form.Item>
    );
  }
  if (kind === 'Azure OpenAI') {
    return (
      <>
        <Form.Item
          name="azure_resource_name"
          label="Azure 资源名"
          rules={[{ required: true, message: '请输入 Azure 资源名' }]}
        >
          <Input
            placeholder="example-resource"
            onChange={(event) => {
              const resourceName = event.target.value.trim();
              const deploymentName = form.getFieldValue('model_id')?.trim() || '';
              if (resourceName && deploymentName) {
                form.setFieldValue(
                  'api_base',
                  `https://${resourceName}.openai.azure.com/openai/deployments/${deploymentName}`,
                );
              }
            }}
          />
        </Form.Item>
        <Form.Item name="azure_api_version" label="API Version">
          <Input placeholder="2024-02-15-preview" />
        </Form.Item>
      </>
    );
  }
  if (kind === 'Ollama / LM Studio') {
    return (
      <>
        <Form.Item name="ollama_keep_alive" label="Keep Alive">
          <Input placeholder="例如：5m" />
        </Form.Item>
        <Form.Item name="ollama_num_ctx" label="上下文窗口">
          <InputNumber min={512} step={512} style={{ width: '100%' }} />
        </Form.Item>
      </>
    );
  }
  if (kind === '通义千问') {
    return (
      <Form.Item name="qwen_workspace_id" label="Workspace ID">
        <Input placeholder="可选，用于区分租户空间" />
      </Form.Item>
    );
  }
  if (kind === '方舟') {
    return (
      <Form.Item name="ark_region" label="Region">
        <Input placeholder="cn-beijing" />
      </Form.Item>
    );
  }
  return null;
}

export function renderProviderProtocolFields(form: FormInstance<ProviderFormValues>): ReactNode {
  return (
    <Form.Item noStyle shouldUpdate>
      {() => {
        const providerKind = form.getFieldValue('provider_kind') ?? providerKindOptions[0].value;
        const protocolProfile = form.getFieldValue('protocol_profile') ?? getDefaultProtocolProfile(providerKind);
        const capabilities = (form.getFieldValue('capabilities') ?? ['text']) as string[];
        const modalityBlocks = (['image', 'audio', 'video'] as const).filter((modality) => capabilities.includes(modality));

        return (
          <>
            <Form.Item name="protocol_profile" label="协议模板">
              <Select
                options={providerProtocolProfileOptions}
                onChange={(value) => {
                  syncProviderProtocolDraft(form, { protocol_profile: value });
                }}
              />
            </Form.Item>
            <Form.Item name="supports_streaming" label="流式输出" valuePropName="checked">
              <Switch />
            </Form.Item>
            {modalityBlocks.map((modality) => {
              const spec = getModalitySpec(protocolProfile, modality);
              return (
                <div
                  key={modality}
                  style={{
                    gridColumn: '1 / -1',
                    border: '1px solid var(--ant-colorBorderSecondary)',
                    borderRadius: 10,
                    padding: 12,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 10 }}>{getProviderCapabilityLabel(modality)} 输入协议</div>
                  <div
                    style={{
                      ...providerFormGridStyle,
                      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                    }}
                  >
                    <Form.Item name={['capability_profile', modality, 'transport_modes']} label="传输方式">
                      <Select mode="multiple" options={transportModeOptions.filter((item) => spec.transportModes.includes(item.value))} />
                    </Form.Item>
                    <Form.Item name={['capability_profile', modality, 'request_part_type']} label="传入模板">
                      <Select
                        options={spec.requestPartTypes.map((value) => ({
                          value,
                          label: value,
                        }))}
                      />
                    </Form.Item>
                    {modality === 'video' && spec.requestPartTypes.includes('video_url') ? (
                      <Form.Item name={['capability_profile', modality, 'options', 'fps']} label="视频 FPS">
                        <InputNumber min={1} max={120} precision={0} style={{ width: '100%' }} />
                      </Form.Item>
                    ) : null}
                    {modality === 'image' && spec.requestPartTypes.includes('image_url') ? (
                      <Form.Item name={['capability_profile', modality, 'options', 'detail']} label="图像 Detail">
                        <Select options={imageDetailOptions} allowClear />
                      </Form.Item>
                    ) : null}
                    <Form.Item name={['capability_profile', modality, 'supports_streaming']} label="该模态允许流式" valuePropName="checked">
                      <Switch />
                    </Form.Item>
                  </div>
                </div>
              );
            })}
          </>
        );
      }}
    </Form.Item>
  );
}

export function renderProviderRuntimeDetails(
  provider: AiProviderConfigPayload,
  options: { formatFullNumber?: (value: number) => string } = {},
): ReactNode {
  const kind = getProviderKind(provider);
  const runtime = (provider.runtime_config ?? {}) as Record<string, unknown>;
  const items: Array<{ label: string; value: string }> = [];
  if (kind === 'OpenAI') {
    items.push(
      { label: 'Organization ID', value: asOptionalString(runtime.organization_id) || '-' },
      { label: 'Project ID', value: asOptionalString(runtime.project_id) || '-' },
    );
  }
  if (kind === 'OpenAI Compatible' || kind === 'DeepSeek') {
    items.push({
      label: '自定义请求头',
      value: runtime.custom_headers ? JSON.stringify(runtime.custom_headers) : '-',
    });
  }
  if (kind === 'OpenRouter') {
    items.push(
      { label: '站点地址', value: asOptionalString(runtime.site_url) || '-' },
      { label: '应用名称', value: asOptionalString(runtime.app_name) || '-' },
    );
  }
  if (kind === 'Anthropic') {
    items.push({ label: 'Anthropic Version', value: asOptionalString(runtime.anthropic_version) || '-' });
  }
  if (kind === 'Gemini') {
    items.push({ label: 'API Version', value: asOptionalString(runtime.api_version) || '-' });
  }
  if (kind === 'Azure OpenAI') {
    items.push(
      { label: 'Azure 资源名', value: asOptionalString(runtime.resource_name) || '-' },
      { label: 'API Version', value: asOptionalString(runtime.api_version) || '-' },
    );
  }
  if (kind === 'Ollama / LM Studio') {
    items.push(
      { label: 'Keep Alive', value: asOptionalString(runtime.keep_alive) || '-' },
      {
        label: '上下文窗口',
        value: typeof runtime.num_ctx === 'number'
          ? (options.formatFullNumber ? options.formatFullNumber(runtime.num_ctx) : String(runtime.num_ctx))
          : '-',
      },
    );
  }
  if (kind === '通义千问') {
    items.push({ label: 'Workspace ID', value: asOptionalString(runtime.workspace_id) || '-' });
  }
  if (kind === '方舟') {
    items.push({ label: 'Region', value: asOptionalString(runtime.region) || '-' });
  }
  items.push({ label: 'Reasoning Effort', value: asOptionalString(runtime.reasoning_effort) || '-' });
  if (items.length === 0) {
    return <Alert type="info" showIcon message="当前 Provider 没有额外接入参数。" />;
  }
  return (
    <Descriptions size="small" column={2}>
      {items.map((item) => (
        <Descriptions.Item key={item.label} label={item.label}>
          {item.value}
        </Descriptions.Item>
      ))}
    </Descriptions>
  );
}

export function getProviderRouteName(provider: AiProviderConfigPayload): string {
  return provider.route_name?.trim() || `${getProviderKind(provider)} / ${getProviderModelId(provider)}`;
}

export function getProviderDisplayName(provider: AiProviderConfigPayload): string {
  return (
    provider.provider_name?.trim()
    || provider.route_name?.trim()
    || getProviderKind(provider)
    || getProviderModelId(provider)
    || '未命名 Provider'
  );
}

export function getProviderKind(provider: AiProviderConfigPayload): string {
  return provider.provider_kind?.trim() || provider.provider;
}

export function getProviderModelId(provider: AiProviderConfigPayload): string {
  return provider.model_id?.trim() || provider.default_model || provider.models[0] || provider.provider;
}

export function getProviderCapabilityLabel(capability: string): string {
  if (capability === 'image') return '图像';
  if (capability === 'audio') return '音频';
  if (capability === 'video') return '视频';
  return '文本';
}

export function providerSupportsCapability(provider: AiProviderConfigPayload | null | undefined, capability: string): boolean {
  if (!provider) return false;
  return (provider.capabilities?.length ? provider.capabilities : ['text']).includes(capability);
}

export function providerSupportsTaskCategory(provider: AiProviderConfigPayload | null | undefined, category: string): boolean {
  if (!provider) return false;
  if (category === 'text') return providerSupportsCapability(provider, 'text');
  if (category === 'image') return providerSupportsCapability(provider, 'image');
  if (category === 'audio') return providerSupportsCapability(provider, 'audio');
  if (category === 'video') return providerSupportsCapability(provider, 'video');
  if (category === 'multimodal') {
    return providerSupportsCapability(provider, 'image')
      || providerSupportsCapability(provider, 'audio')
      || providerSupportsCapability(provider, 'video');
  }
  return true;
}

export function getProviderTestStatusLabel(status: string | null | undefined): string {
  if (status === 'success') return '最近测试成功';
  if (status === 'failed') return '最近测试失败';
  if (status === 'pending') return '测试中';
  return '未测试';
}

export function formatProviderPricingSummary(
  provider: AiProviderConfigPayload,
  formatMoneyByMillion: (value: number) => string,
): string {
  const pricing = provider.pricing;
  return `输入 ${formatMoneyByMillion(pricing?.input_price_per_million ?? 0)} / 输出 ${formatMoneyByMillion(pricing?.output_price_per_million ?? 0)} / Cache ${formatMoneyByMillion(pricing?.cache_hit_price_per_million ?? 0)}`;
}

export function maskStoredApiKey(configured: boolean): string {
  return configured ? '••••••••••••••••' : '未配置';
}
