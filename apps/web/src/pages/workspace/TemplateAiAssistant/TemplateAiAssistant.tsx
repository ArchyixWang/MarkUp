import { useMemo, useRef, useState } from 'react';
import { Alert, App, Avatar, Button, Checkbox, Empty, Modal, Popconfirm, Segmented, Select, Space, Spin, Tag } from 'antd';
import { CloseOutlined, DownOutlined, PaperClipOutlined, ReloadOutlined, RobotOutlined, SaveOutlined, UpOutlined } from '@ant-design/icons';
import { Attachments, Bubble, Prompts, Sender, Think, Welcome, type AttachmentsProps, type BubbleItemType } from '@ant-design/x';
import { AgentAvatar } from '../../../components/agent/AgentAvatar';
import { chatWithTemplateAssistant, generateLabelingAiAssistPreview } from '../../../services/workspaceService';
import { TemplateRenderer } from '../TemplateRenderer';
import type { AiProviderConfigPayload, AiTemplateAssistantAttachment, AiTemplateChange, TemplateComponentSchema } from '../../../types/api';
import { applyTemplateAiChanges } from './changeUtils';
import { useTypingPlaceholder } from './useTypingPlaceholder';
import type { TemplateAiAssistantProps, TemplateAiMessage, TemplateAiPanelState } from './types';
import './TemplateAiAssistant.css';

const quickPrompts = [
  '帮我生成一个图片分类标注模版',
  '为目标检测任务添加标签和框选字段',
  '优化当前字段名称，让标注员更容易理解',
];

export function TemplateAiAssistant({
  team,
  templateId,
  templateName,
  templateDescription,
  schema,
  previewContent = {},
  referenceDatasetContext = null,
  providers,
  loadingProviders = false,
  onApplySchema,
  uploadAttachment,
}: TemplateAiAssistantProps) {
  const { message, modal } = App.useApp();
  const showToast = (kind: 'success' | 'error', content: string) => {
    if (typeof message.open === 'function') {
      message.open({ key: `template-ai-${kind}`, type: kind, content, duration: 5 });
      return;
    }
    message[kind]?.(content, 5);
  };
  const enabledProviders = providers.filter((provider) => provider.status === 'enabled');
  const [open, setOpen] = useState(false);
  const [floatingValue, setFloatingValue] = useState('');
  const [floatingPaused, setFloatingPaused] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [providerId, setProviderId] = useState(enabledProviders[0]?.provider_id ?? '');
  const [messages, setMessages] = useState<TemplateAiMessage[]>([
    { id: 'welcome', role: 'assistant', content: '你好！我是模版搭建 AI 助手，请告诉我你想对模版做哪些修改。' },
  ]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [panelState, setPanelState] = useState<TemplateAiPanelState>('guide');
  const [changes, setChanges] = useState<AiTemplateChange[]>([]);
  const [attachments, setAttachments] = useState<AiTemplateAssistantAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [rightTab, setRightTab] = useState<'changes' | 'preview'>('changes');
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, unknown>>({});
  const [previewAiAssisting, setPreviewAiAssisting] = useState(false);
  const requestVersionRef = useRef(0);
  const typingText = useTypingPlaceholder(floatingPaused || Boolean(floatingValue));
  const selectedProvider = enabledProviders.find((provider) => provider.provider_id === providerId) ?? enabledProviders[0] ?? null;
  const selectedChanges = changes.filter((change) => change.selected);
  const previewSchema = useMemo(() => applyTemplateAiChanges(schema, changes), [changes, schema]);
  const attachmentItems = attachments.map((file) => ({
    uid: file.id,
    name: file.name,
    status: 'done' as const,
    description: file.type,
  }));

  function resetConversation() {
    requestVersionRef.current += 1;
    setFloatingValue('');
    setInputValue('');
    setMessages([
      { id: 'welcome', role: 'assistant', content: '你好！我是模版搭建 AI 助手，请告诉我你想对模版做哪些修改。' },
    ]);
    setConversationId(null);
    setPanelState('guide');
    setChanges([]);
    setAttachments([]);
    setLoading(false);
    setApplying(false);
    setError('');
    setRightTab('changes');
    setPreviewAnswers({});
    setPreviewAiAssisting(false);
  }

  async function runPreviewAiAssist(component: TemplateComponentSchema) {
    if (previewAiAssisting) return;
    if (!String(component.config.provider_id || '').trim()) {
      const text = '请先在模板 Designer 中为该 LLM 组件选择 Provider';
      setError(text);
      showToast('error', text);
      return;
    }
    setPreviewAiAssisting(true);
    setError('');
    try {
      const componentPrompt = String(component.config.prompt_hint || '').trim();
      const result = await generateLabelingAiAssistPreview(team.team_id, {
        schema: previewSchema,
        content: previewContent,
        answers: previewAnswers,
        prompt: componentPrompt ? `Template assistant preview hint: ${componentPrompt}` : undefined,
        component_id: component.id,
      });
      const nextAnswers = result.answers && typeof result.answers === 'object' ? result.answers : {};
      setPreviewAnswers((current) => ({ ...current, ...nextAnswers }));
      showToast('success', `AI 预览已生成 ${Object.keys(nextAnswers).length} 条建议。`);
    } catch (err) {
      const text = err instanceof Error ? err.message : 'AI 预览生成失败';
      setError(text);
      showToast('error', text);
    } finally {
      setPreviewAiAssisting(false);
    }
  }

  async function sendMessage(raw: string) {
    const text = raw.trim();
    if (!text || loading) return;
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    setOpen(true);
    setInputValue('');
    setFloatingValue('');
    setLoading(true);
    setError('');
    setPanelState('thinking');
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: 'user', content: text },
      { id: `loading-${Date.now()}`, role: 'assistant', content: '正在分析当前模版结构...', status: 'loading' },
    ]);
    try {
      const response = await chatWithTemplateAssistant(team.team_id, {
        provider_id: selectedProvider?.provider_id ?? null,
        workspace_id: team.team_id,
        template_id: templateId ?? null,
        template_name: templateName,
        template_description: templateDescription,
        current_template: schema,
        reference_dataset: referenceDatasetContext,
        message: text,
        attachments,
        conversation_id: conversationId,
      });
      if (requestVersion !== requestVersionRef.current) return;
      setConversationId(response.conversation_id);
      setChanges(response.changes ?? []);
      setPanelState(response.changes?.length ? 'changes' : 'empty');
      setRightTab('changes');
      setMessages((current) => [
        ...current.filter((item) => item.status !== 'loading'),
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: response.fallback ? `${response.message}（当前为结构化兜底方案）` : response.message,
          reasoning: response.reasoning,
          suggestions: response.suggestions,
        },
      ]);
    } catch (err) {
      if (requestVersion !== requestVersionRef.current) return;
      const nextError = err instanceof Error ? err.message : '模板 AI 助手请求失败';
      setError(nextError);
      setPanelState('error');
      setMessages((current) => [
        ...current.filter((item) => item.status !== 'loading'),
        { id: `error-${Date.now()}`, role: 'assistant', content: nextError, status: 'error' },
      ]);
    } finally {
      if (requestVersion === requestVersionRef.current) setLoading(false);
    }
  }

  const bubbleItems: BubbleItemType[] = messages.map((item) => ({
    key: item.id,
    role: item.role === 'user' ? 'user' : 'ai',
    content: item.content,
    loading: item.status === 'loading',
    contentRender: item.reasoning ? (content) => (
      <div className="template-ai-message-content">
        <Think title="思考过程" defaultExpanded={false}>
          {item.reasoning}
        </Think>
        <span>{String(content)}</span>
      </div>
    ) : undefined,
    footer: item.suggestions?.length ? (
      <div className="template-ai-message-footer">
        <Prompts
          className="template-ai-suggestion-prompts"
          items={item.suggestions.map((suggestion) => ({ key: suggestion, label: suggestion }))}
          wrap
          onItemClick={({ data }) => void sendMessage(String(data.label || ''))}
        />
      </div>
    ) : undefined,
  }));

  const providerOptions = enabledProviders.map((provider) => ({
    value: provider.provider_id,
    label: (
      <Space size={6} className="template-ai-provider-option">
        {renderProviderAvatar(provider, team.logo_url)}
        <span>{provider.provider_name || provider.route_name || provider.default_model || provider.provider_kind}</span>
        {provider.scope === 'platform' ? <Tag color="blue">平台</Tag> : <Tag>企业</Tag>}
      </Space>
    ),
  }));

  function stopGeneration() {
    requestVersionRef.current += 1;
    setLoading(false);
    setPanelState(changes.length ? 'changes' : 'guide');
    setMessages((current) => [
      ...current.filter((item) => item.status !== 'loading'),
      { id: `stopped-${Date.now()}`, role: 'system', content: '已停止本次生成。' },
    ]);
  }

  function clearConversation() {
    const confirm = typeof modal.confirm === 'function' ? modal.confirm : Modal.confirm;
    confirm({
      title: '清除对话',
      content: '确定要清除当前对话吗？清除后对话记录和未应用的 AI 变更都将被移除。',
      okText: '确认清除',
      cancelText: '取消',
      onOk: resetConversation,
    });
  }

  function closeDialog() {
    setOpen(false);
  }

  function applyChanges() {
    if (!selectedChanges.length) return;
    setApplying(true);
    try {
      const nextSchema = applyTemplateAiChanges(schema, changes);
      if (stableStringify(nextSchema) === stableStringify(schema)) {
        const text = '所选 AI 变更未匹配当前模板 schema，未产生可应用修改。请重新生成或检查目标字段、页签和组件类型。';
        setError(text);
        showToast('error', text);
        return;
      }
      onApplySchema(nextSchema);
      setError('');
      setMessages((current) => [...current, { id: `applied-${Date.now()}`, role: 'system', content: `已应用 ${selectedChanges.length} 项变更到当前模版。` }]);
      setChanges((current) => current.map((change) => ({ ...change, selected: false })));
      showToast('success', 'AI 变更已应用到当前模版');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '应用变更失败，请稍后重试');
    } finally {
      setApplying(false);
    }
  }

  const uploadProps: AttachmentsProps = {
    beforeUpload: async (file) => {
      try {
        const uploaded = await uploadAttachment(file);
        setAttachments((current) => [...current, uploaded]);
        showToast('success', '附件已上传');
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : '附件上传失败');
      }
      return false;
    },
    showUploadList: false,
    disabled: loading,
  };

  return (
    <>
      <div
        className="template-ai-floating"
        onMouseEnter={() => setFloatingPaused(true)}
        onMouseLeave={() => setFloatingPaused(false)}
      >
        <Sender
          className="template-ai-floating-sender"
          prefix={(
            <button type="button" className="template-ai-floating-avatar" aria-label="打开模板搭建 AI" onClick={() => setOpen(true)}>
              {renderProviderAvatar(selectedProvider, team.logo_url, 28)}
            </button>
          )}
          value={floatingValue}
          placeholder=""
          autoSize={{ minRows: 1, maxRows: 1 }}
          onChange={setFloatingValue}
          onFocus={() => {
            setFloatingPaused(true);
            setOpen(true);
          }}
          onBlur={() => setFloatingPaused(false)}
          onSubmit={sendMessage}
          disabled={loadingProviders}
        />
        {!floatingValue && (
          <span className="template-ai-typing" aria-hidden="true">
            {typingText}<i />
          </span>
        )}
      </div>

      {open ? (
        <Modal
          title={(
            <div className="template-ai-modal-title">
              <Space>{renderProviderAvatar(selectedProvider, team.logo_url, 24)}<span>MarkUp 模版搭建 AI</span></Space>
              <Space size={8}>
                <Button size="small" icon={<ReloadOutlined />} onClick={clearConversation}>清除对话</Button>
                {changes.some((change) => change.selected) ? (
                  <Popconfirm
                    title="当前有未应用的 AI 变更"
                    description="关闭后这些待应用变更不会写入当前模版，是否继续关闭？"
                    okText="继续关闭"
                    cancelText="返回查看"
                    placement="bottomRight"
                    arrow
                    getPopupContainer={() => document.body}
                    onConfirm={closeDialog}
                  >
                    <Button
                      size="small"
                      type="text"
                      icon={<CloseOutlined />}
                      aria-label="关闭模板搭建 AI"
                    />
                  </Popconfirm>
                ) : (
                  <Button
                    size="small"
                    type="text"
                    icon={<CloseOutlined />}
                    aria-label="关闭模板搭建 AI"
                    onClick={closeDialog}
                  />
                )}
              </Space>
            </div>
          )}
          open={open}
          width="min(1120px, calc(100vw - 48px))"
          centered
          destroyOnHidden
          focusable={{ focusTriggerAfterClose: false }}
          footer={null}
          className="template-ai-modal"
          closable={false}
          mask={{ closable: false }}
          keyboard={false}
        >
          <div className="template-ai-dialog">
            <section className="template-ai-chat">
            <Bubble.List
              autoScroll
              items={bubbleItems}
              role={{
                ai: { placement: 'start', variant: 'filled', shape: 'round' },
                user: { placement: 'end', variant: 'filled', shape: 'round' },
              }}
            />
            {error ? <Alert type="warning" showIcon title={error} /> : null}
            <div className="template-ai-inputbar">
              <Space size={8} wrap>
                <Select
                  aria-label="选择 AI Provider"
                  className="template-ai-provider-select"
                  placeholder={loadingProviders ? '加载 Provider...' : '选择 Provider'}
                  loading={loadingProviders}
                  value={selectedProvider?.provider_id}
                  options={providerOptions}
                  onChange={setProviderId}
                  popupMatchSelectWidth={280}
                  getPopupContainer={() => document.body}
                  notFoundContent={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可用 Provider" />}
                />
                <Attachments
                  {...uploadProps}
                  items={attachmentItems}
                  onRemove={(file) => {
                    setAttachments((current) => current.filter((item) => item.id !== file.uid));
                    return true;
                  }}
                  overflow="wrap"
                >
                  <Button icon={<PaperClipOutlined />} disabled={loading}>上传附件</Button>
                </Attachments>
              </Space>
              <Sender
                value={inputValue}
                loading={loading}
                placeholder="向 AI 发送指令，例如：帮我生成一个图片分类标注模版"
                onChange={setInputValue}
                onSubmit={sendMessage}
                onCancel={stopGeneration}
                disabled={loadingProviders}
                suffix={(_, { components }) => (
                  loading
                    ? <components.LoadingButton aria-label="停止生成" />
                    : <components.SendButton aria-label="发送模板 AI 指令" />
                )}
              />
            </div>
            </section>

            <section className="template-ai-side">
              {panelState === 'guide' && (
                <div className="template-ai-guide">
                  <Welcome
                    icon={<AgentAvatar motion="idle" size={50} />}
                    title="你说 AI 做"
                    description="标注模版增 / 删 / 改，一句话搞定"
                    variant="borderless"
                  />
                  <p>你可以让 AI 根据任务类型、标注规范或样例数据，快速生成和优化标注字段、标签选项与质检规则。</p>
                  <Prompts
                    title="快捷指令"
                    items={quickPrompts.map((item) => ({ key: item, label: item }))}
                    vertical
                    onItemClick={({ data }) => void sendMessage(String(data.label || ''))}
                  />
                </div>
              )}
              {panelState === 'thinking' && (
                <div className="template-ai-thinking">
                  <Spin size="large" />
                  <strong>正在分析当前模版并生成修改方案...</strong>
                  <span>正在读取当前 schema、字段类型、页签结构和附件元信息。</span>
                </div>
              )}
              {panelState === 'error' && (
                <Alert type="error" showIcon title="生成失败" description={error || '请稍后重试，或换一种描述。'} />
              )}
              {panelState === 'empty' && (
                <Empty description="未识别到需要修改的模版内容，你可以尝试描述得更具体一些。" />
              )}
              {panelState === 'changes' && (
                <div className="template-ai-changes">
                  <Segmented
                    value={rightTab}
                    onChange={(value) => setRightTab(value as 'changes' | 'preview')}
                    options={[
                      { label: '变更', value: 'changes' },
                      { label: '预览', value: 'preview' },
                    ]}
                  />
                  {rightTab === 'changes' ? (
                    <ChangePanel changes={changes} onChange={setChanges} />
                  ) : (
                    <div className="template-ai-preview">
                      <TemplateRenderer
                        schema={previewSchema}
                        content={previewContent}
                        answers={previewAnswers}
                        readonly
                        variant="survey"
                        onAiAssistRequest={(component) => void runPreviewAiAssist(component)}
                        aiAssistLoading={previewAiAssisting}
                        aiAssistDisabled={previewAiAssisting}
                      />
                    </div>
                  )}
                  <div className="template-ai-applybar">
                    <span>已选 {selectedChanges.length} / {changes.length} 项</span>
                    <Button type="primary" icon={<SaveOutlined />} loading={applying} disabled={!selectedChanges.length} onClick={applyChanges}>
                      应用
                    </Button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function stableStringify(value: unknown) {
  return JSON.stringify(value);
}

function ChangePanel({ changes, onChange }: { changes: AiTemplateChange[]; onChange: (changes: AiTemplateChange[]) => void }) {
  const selectedCount = changes.filter((change) => change.selected).length;
  const allSelected = selectedCount === changes.length && changes.length > 0;
  return (
    <div className="template-ai-change-panel">
      <div className="template-ai-change-toolbar">
        <Checkbox
          checked={allSelected}
          indeterminate={selectedCount > 0 && selectedCount < changes.length}
          onChange={(event) => onChange(changes.map((change) => ({ ...change, selected: event.target.checked })))}
        >
          全选（{selectedCount}/{changes.length} 项已选）
        </Checkbox>
        <Space>
          <Button size="small" icon={<DownOutlined />} onClick={() => onChange(changes.map((change) => ({ ...change, expanded: true })))}>展开全部</Button>
          <Button size="small" icon={<UpOutlined />} onClick={() => onChange(changes.map((change) => ({ ...change, expanded: false })))}>折叠全部</Button>
        </Space>
      </div>
      <div className="template-ai-change-list">
        {changes.map((change) => (
          <article className="template-ai-change-card" key={change.id}>
            <div className="template-ai-change-head">
              <Checkbox
                checked={change.selected}
                onChange={(event) => onChange(changes.map((item) => (item.id === change.id ? { ...item, selected: event.target.checked } : item)))}
              />
              <Tag color={changeTagColor(change.type)}>{changeTypeLabel(change.type)}</Tag>
              <strong>{change.title}</strong>
              <Button
                size="small"
                type="default"
                icon={change.expanded ? <UpOutlined /> : <DownOutlined />}
                onClick={() => onChange(changes.map((item) => (item.id === change.id ? { ...item, expanded: !item.expanded } : item)))}
              >
                {change.expanded ? '收起' : '展开'}
              </Button>
            </div>
            {change.description ? <p>{change.description}</p> : null}
            {change.expanded ? (
              <div className="template-ai-change-detail">
                <DiffBlock title="修改前" value={change.before} empty="无原字段" />
                <DiffBlock title="修改后" value={change.after} empty="无新字段" />
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

function DiffBlock({ title, value, empty }: { title: string; value: unknown; empty: string }) {
  return (
    <div>
      <span>{title}</span>
      <pre>{value === undefined || value === null ? empty : JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

function renderProviderAvatar(provider: AiProviderConfigPayload | null, teamLogo?: string | null, size = 24) {
  if (!provider || provider.scope === 'platform' || provider.is_platform_default) {
    return <AgentAvatar motion="idle" size={size} />;
  }
  if (teamLogo) {
    return <Avatar size={size} src={teamLogo} icon={<RobotOutlined />} />;
  }
  const label = (provider.provider_name || provider.route_name || provider.provider_kind || 'AI').trim().slice(0, 1).toUpperCase();
  return <Avatar size={size}>{label}</Avatar>;
}

function changeTypeLabel(type: AiTemplateChange['type']) {
  return {
    create_field: '新增字段',
    delete_field: '删除字段',
    update_field: '修改字段',
    reorder_field: '调整顺序',
    update_options: '修改选项',
    update_validation: '修改校验',
    create_quality_rule: '质检规则',
  }[type];
}

function changeTagColor(type: AiTemplateChange['type']) {
  if (type === 'delete_field') return 'red';
  if (type === 'create_field') return 'green';
  if (type === 'create_quality_rule') return 'blue';
  return 'geekblue';
}
