import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, Checkbox, Descriptions, Empty, Input, Modal, Popconfirm, Segmented, Select, Space, Spin, Tag } from 'antd';
import { ArrowUpOutlined, CloseOutlined, DownOutlined, PaperClipOutlined, ReloadOutlined, SaveOutlined, UpOutlined } from '@ant-design/icons';
import { Attachments, Prompts, Sender, Think, Welcome, type AttachmentsProps } from '@ant-design/x';
import { AgentAvatar } from '../../../components/agent/AgentAvatar';
import { chatWithTaskPublishAssistant } from '../../../services/workspaceService';
import type { AiProviderConfigPayload, AiTaskPublishChange, AiTemplateAssistantAttachment } from '../../../types/api';
import { applyTaskPublishAiChanges } from './changeUtils';
import { useTaskPublishTypingPlaceholder } from './useTypingPlaceholder';
import type { TaskPublishAiAssistantProps, TaskPublishAiMessage, TaskPublishAiPanelState } from './types';
import './TaskPublishAiAssistant.css';

const quickPrompts = [
  '帮我创建一个图片分类标注任务',
  '根据当前模板和数据集补全发布配置',
  '帮我检查发布前还有哪些阻塞项',
];

export function TaskPublishAiAssistant<TForm extends Record<string, unknown>>({
  team,
  draftTaskId,
  context,
  form,
  mapping,
  providers,
  loadingProviders = false,
  placement = 'floating',
  onApplyDraft,
  uploadAttachment,
}: TaskPublishAiAssistantProps<TForm>) {
  const { message, modal } = App.useApp();
  const showToast = (kind: 'success' | 'error', content: string) => {
    if (typeof message.open === 'function') {
      message.open({ key: `task-publish-ai-${kind}`, type: kind, content, duration: 5 });
      return;
    }
    message[kind]?.(content, 5);
  };
  const enabledProviders = useMemo(() => providers.filter((provider) => provider.status === 'enabled'), [providers]);
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [providerId, setProviderId] = useState(enabledProviders[0]?.provider_id ?? '');
  const [messages, setMessages] = useState<TaskPublishAiMessage[]>([
    { id: 'welcome', role: 'assistant', content: '你好！我是任务发布 AI 助手，请告诉我你想创建或优化什么标注任务。' },
  ]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [panelState, setPanelState] = useState<TaskPublishAiPanelState>('guide');
  const [changes, setChanges] = useState<AiTaskPublishChange[]>([]);
  const [attachments, setAttachments] = useState<AiTemplateAssistantAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [rightTab, setRightTab] = useState<'changes' | 'preview'>('changes');
  const requestVersionRef = useRef(0);
  const selectedProvider = useMemo(
    () => enabledProviders.find((provider) => provider.provider_id === providerId) ?? enabledProviders[0] ?? null,
    [enabledProviders, providerId],
  );
  const selectedChanges = useMemo(() => changes.filter((change) => change.selected), [changes]);
  const previewDraft = useMemo(() => applyTaskPublishAiChanges(form, mapping, changes), [changes, form, mapping]);
  const attachmentItems = useMemo(() => attachments.map((file) => ({
    uid: file.id,
    name: file.name,
    status: 'done' as const,
    description: file.type,
  })), [attachments]);

  const resetConversation = useCallback(() => {
    requestVersionRef.current += 1;
    setInputValue('');
    setMessages([
      { id: 'welcome', role: 'assistant', content: '你好！我是任务发布 AI 助手，请告诉我你想创建或优化什么标注任务。' },
    ]);
    setConversationId(null);
    setPanelState('guide');
    setChanges([]);
    setAttachments([]);
    setLoading(false);
    setApplying(false);
    setError('');
    setRightTab('changes');
  }, []);

  const sendMessage = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || loading) return;
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    setOpen(true);
    setInputValue('');
    setLoading(true);
    setError('');
    setPanelState('thinking');
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: 'user', content: text },
      { id: `loading-${Date.now()}`, role: 'assistant', content: '正在分析当前任务发布配置...', status: 'loading' },
    ]);
    try {
      const response = await chatWithTaskPublishAssistant(team.team_id, {
        provider_id: selectedProvider?.provider_id ?? null,
        workspace_id: team.team_id,
        team_id: team.team_id,
        draft_task_id: draftTaskId ?? null,
        current_task_draft: context,
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
      const nextError = err instanceof Error ? err.message : '任务发布 AI 助手请求失败';
      setError(nextError);
      setPanelState('error');
      setMessages((current) => [
        ...current.filter((item) => item.status !== 'loading'),
        { id: `error-${Date.now()}`, role: 'assistant', content: nextError, status: 'error' },
      ]);
    } finally {
      if (requestVersion === requestVersionRef.current) setLoading(false);
    }
  }, [attachments, context, conversationId, draftTaskId, loading, selectedProvider, team.team_id]);

  const providerOptions = useMemo(() => enabledProviders.map((provider) => ({
    value: provider.provider_id,
    label: (
      <Space size={6} className="task-publish-ai-provider-option">
        {renderProviderAvatar(provider, team.logo_url)}
        <span>{provider.provider_name || provider.route_name || provider.default_model || provider.provider_kind}</span>
        {provider.scope === 'platform' ? <Tag color="blue">平台</Tag> : <Tag>企业</Tag>}
      </Space>
    ),
  })), [enabledProviders, team.logo_url]);

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
      const nextDraft = applyTaskPublishAiChanges(form, mapping, changes);
      if (stableStringify(nextDraft) === stableStringify({ form, mapping })) {
        const text = '所选 AI 变更未匹配当前发布向导字段，未产生可应用修改。请重新生成或检查变更里的字段名称。';
        setError(text);
        showToast('error', text);
        return;
      }
      onApplyDraft(nextDraft);
      setError('');
      setMessages((current) => [...current, { id: `applied-${Date.now()}`, role: 'system', content: `已应用 ${selectedChanges.length} 项变更到当前任务发布配置。` }]);
      setChanges((current) => current.map((change) => ({ ...change, selected: false })));
      showToast('success', 'AI 变更已应用到当前任务发布配置');
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
      <TaskPublishAiFloatingInput
        provider={selectedProvider}
        teamLogo={team.logo_url}
        placement={placement}
        onOpen={() => setOpen(true)}
        onSend={(text) => void sendMessage(text)}
      />

      {open ? (
        <Modal
          title={(
            <div className="task-publish-ai-modal-title">
            <Space>{renderProviderAvatar(selectedProvider, team.logo_url, 24)}<span>MarkUp 任务发布 AI</span></Space>
              <Space size={8}>
                <Button size="small" icon={<ReloadOutlined />} onClick={clearConversation}>清除对话</Button>
                {changes.some((change) => change.selected) ? (
                  <Popconfirm
                    title="当前有未应用的 AI 变更"
                    description="关闭后这些待应用变更不会写入当前任务发布配置，是否继续关闭？"
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
                      aria-label="关闭任务发布 AI"
                    />
                  </Popconfirm>
                ) : (
                  <Button
                    size="small"
                    type="text"
                    icon={<CloseOutlined />}
                    aria-label="关闭任务发布 AI"
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
          className="task-publish-ai-modal"
          closable={false}
          mask={{ closable: false }}
          keyboard={false}
        >
          <div className="task-publish-ai-dialog">
          <section className="task-publish-ai-chat">
            <div className="task-publish-ai-message-list" aria-label="任务发布 AI 对话记录">
              {messages.map((item) => (
                <article
                  className={[
                    'task-publish-ai-message',
                    `task-publish-ai-message--${item.role}`,
                    item.status ? `is-${item.status}` : '',
                  ].filter(Boolean).join(' ')}
                  key={item.id}
                >
                  <div className="task-publish-ai-message-bubble">
                    {item.status === 'loading' ? <Spin size="small" /> : null}
                    {item.reasoning ? (
                      <div className="task-publish-ai-message-content">
                        <Think title="思考过程" defaultExpanded={false}>
                          {item.reasoning}
                        </Think>
                        <span>{item.content}</span>
                      </div>
                    ) : (
                      <span>{item.content}</span>
                    )}
                  </div>
                  {item.suggestions?.length ? (
                    <div className="task-publish-ai-message-footer">
                      <Prompts
                        className="task-publish-ai-suggestion-prompts"
                        items={item.suggestions.map((suggestion) => ({ key: suggestion, label: suggestion }))}
                        wrap
                        onItemClick={({ data }) => void sendMessage(String(data.label || ''))}
                      />
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
            {error ? <Alert type="warning" showIcon title={error} /> : null}
            <div className="task-publish-ai-inputbar">
              <Space size={8} wrap>
                <Select
                  aria-label="选择 AI Provider"
                  className="task-publish-ai-provider-select"
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
                placeholder="向 AI 发送指令，例如：帮我创建一个图片分类标注任务"
                onChange={setInputValue}
                onSubmit={sendMessage}
                onCancel={stopGeneration}
                disabled={loadingProviders}
                suffix={(_, { components }) => (
                  loading
                    ? <components.LoadingButton aria-label="停止生成" />
                    : <components.SendButton aria-label="发送任务发布 AI 指令" />
                )}
              />
            </div>
          </section>

          <section className="task-publish-ai-side">
            {panelState === 'guide' && (
              <div className="task-publish-ai-guide">
                <Welcome
                  icon={<AgentAvatar motion="idle" size={50} />}
                  title="你说 AI 做"
                  description="任务创建 / 配置 / 检查，一句话搞定"
                  variant="borderless"
                />
                <p>你可以让 AI 根据任务目标、模板、数据集和审核要求，快速补全任务发布配置，并提前检查发布阻塞项。</p>
                <Prompts
                  title="快捷指令"
                  items={quickPrompts.map((item) => ({ key: item, label: item }))}
                  vertical
                  onItemClick={({ data }) => void sendMessage(String(data.label || ''))}
                />
              </div>
            )}
            {panelState === 'thinking' && (
              <div className="task-publish-ai-thinking">
                <Spin size="large" />
                <strong>正在分析当前任务配置并生成发布方案...</strong>
                <span>正在读取基础信息、模板数据、奖励、审核、协议和发布阻塞项。</span>
              </div>
            )}
            {panelState === 'error' && (
              <Alert type="error" showIcon title="生成失败" description={error || '请稍后重试，或换一种描述。'} />
            )}
            {panelState === 'empty' && (
              <Empty description="未识别到需要修改的任务发布配置，你可以尝试描述得更具体一些。" />
            )}
            {panelState === 'changes' && (
              <div className="task-publish-ai-changes">
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
                  <TaskPublishPreview form={previewDraft.form} mapping={previewDraft.mapping} />
                )}
                <div className="task-publish-ai-applybar">
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

function ChangePanel({ changes, onChange }: { changes: AiTaskPublishChange[]; onChange: (changes: AiTaskPublishChange[]) => void }) {
  const selectedCount = changes.filter((change) => change.selected).length;
  const allSelected = selectedCount === changes.length && changes.length > 0;
  return (
    <div className="task-publish-ai-change-panel">
      <div className="task-publish-ai-change-toolbar">
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
      <div className="task-publish-ai-change-list">
        {changes.map((change) => (
          <article className="task-publish-ai-change-card" key={change.id}>
            <div className="task-publish-ai-change-head">
              <Checkbox
                checked={change.selected}
                onChange={(event) => onChange(changes.map((item) => (item.id === change.id ? { ...item, selected: event.target.checked } : item)))}
              />
              <Tag color={changeTagColor(change.type)}>{changeTypeLabel(change.type)}</Tag>
              <Tag color={riskColor(change.riskLevel)}>{riskLabel(change.riskLevel)}</Tag>
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
            {change.dependencies?.length ? <Alert type="warning" showIcon title={`依赖：${change.dependencies.join('、')}`} /> : null}
            {change.expanded ? (
              <div className="task-publish-ai-change-detail">
                <DiffBlock title="修改前" value={change.before} empty="无原配置" />
                <DiffBlock title="修改后" value={change.after} empty="无新配置" />
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

function TaskPublishPreview({ form, mapping }: { form: Record<string, unknown>; mapping: Record<string, string | null> }) {
  const tags = Array.isArray(form.tag_items) ? form.tag_items.map(String).join('、') : String(form.tags || '未填写');
  const category = Array.isArray(form.category_values) ? form.category_values.map(String).join('、') : String(form.category || '未选择');
  const reviewerIds = Array.isArray(form.reviewer_ids) ? form.reviewer_ids.map(String) : [];
  const matrix = Array.isArray(form.ai_review_matrix) ? form.ai_review_matrix : [];
  const deadlineLabel = taskPublishDeadlineLabel(form);
  return (
    <div className="task-publish-ai-preview">
      <Descriptions
        title="基础信息"
        size="small"
        column={1}
        items={[
          { label: '任务标题', children: String(form.title || '未填写') },
          { label: '任务描述', children: String(form.description || '未填写') },
          { label: '分类 / 难度', children: `${category} / ${String(form.difficulty || '未选择')}` },
          { label: '标签', children: tags || '未填写' },
          { label: '截止', children: deadlineLabel },
        ]}
      />
      <Descriptions
        title="模板与数据"
        size="small"
        column={1}
        items={[
          { label: '模板', children: String(form.template_id || '未选择') },
          { label: '数据集', children: String(form.dataset_id || '未选择') },
          { label: '映射', children: Object.keys(mapping).length ? JSON.stringify(mapping) : '未配置' },
        ]}
      />
      <Descriptions
        title="分发与奖励"
        size="small"
        column={1}
        items={[
          { label: '分发策略', children: String(form.distribution || '未设置') },
          { label: '奖励模式', children: String(form.reward_mode || '未设置') },
          { label: '按条积分', children: String(form.points_per_item || '未填写') },
          { label: '任务总积分', children: String(form.total_points || '未填写') },
        ]}
      />
      <Descriptions
        title="审核与协议"
        size="small"
        column={1}
        items={[
          { label: 'AI 预审', children: form.ai_enabled ? `开启 / Provider ${String(form.ai_provider_id || '未选择')}` : '关闭' },
          { label: '评分矩阵', children: matrix.length ? `${matrix.length} 个维度 / ${form.ai_matrix_confirmed ? '已确认' : '未确认'}` : '未生成' },
          { label: '人工复审', children: reviewerIds.length ? reviewerIds.join('、') : '未选择' },
          { label: '用户协议', children: form.agreement_required ? (form.agreement_use_default ? '默认协议' : String(form.agreement_file_name || '自定义文本')) : '不要求' },
        ]}
      />
    </div>
  );
}

function taskPublishDeadlineLabel(form: Record<string, unknown>) {
  if (form.deadline_long_term === true || form.deadlineLongTerm === true || form.deadline_mode === 'long_term') return '长期有效';
  return String(form.deadline || '未设置');
}

function TaskPublishAiFloatingInput({
  provider,
  teamLogo,
  placement = 'floating',
  onOpen,
  onSend,
}: {
  provider: AiProviderConfigPayload | null;
  teamLogo?: string | null;
  placement?: 'floating' | 'inline';
  onOpen: () => void;
  onSend: (text: string) => void;
}) {
  const [value, setValue] = useState('');
  const [paused, setPaused] = useState(false);
  const typingText = useTaskPublishTypingPlaceholder(paused || Boolean(value));
  const pauseTyping = () => setPaused((current) => (current ? current : true));
  const resumeTyping = () => setPaused((current) => (current ? false : current));
  const submitValue = () => {
    const nextText = value.trim();
    if (!nextText) {
      onOpen();
      return;
    }
    onSend(nextText);
    setValue('');
  };

  return (
    <div
      className={`task-publish-ai-floating task-publish-ai-floating--${placement}`}
      onMouseEnter={pauseTyping}
      onMouseLeave={resumeTyping}
    >
      <div className="task-publish-ai-floating-control">
        <button type="button" className="task-publish-ai-floating-avatar" aria-label="打开任务发布 AI" onClick={onOpen}>
          {renderProviderAvatar(provider, teamLogo, 28)}
        </button>
        <Input.TextArea
          className="task-publish-ai-floating-textarea"
          value={value}
          placeholder=""
          autoSize={{ minRows: 1, maxRows: 1 }}
          onChange={(event) => setValue(event.target.value)}
          onFocus={() => {
            pauseTyping();
            onOpen();
          }}
          onBlur={resumeTyping}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submitValue();
            }
          }}
        />
        <Button
          className="task-publish-ai-floating-send"
          shape="circle"
          size="small"
          type="text"
          icon={<ArrowUpOutlined />}
          disabled={!value.trim()}
          aria-label="发送任务发布 AI 指令"
          onMouseDown={(event) => event.preventDefault()}
          onClick={submitValue}
        />
      </div>
      {!value && (
        <span className="task-publish-ai-typing" aria-hidden="true">
          {typingText}<i />
        </span>
      )}
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
    return <span className="task-publish-ai-provider-avatar" style={{ width: size, height: size }}><img src={teamLogo} alt="" /></span>;
  }
  const label = (provider.provider_name || provider.route_name || provider.provider_kind || 'AI').trim().slice(0, 1).toUpperCase();
  return <span className="task-publish-ai-provider-avatar" style={{ width: size, height: size }}>{label}</span>;
}

function changeTypeLabel(type: AiTaskPublishChange['type']) {
  return {
    update_basic_info: '基础信息',
    update_template_dataset: '模板与数据',
    update_field_mapping: '字段映射',
    update_distribution: '分发策略',
    update_reward: '奖励配置',
    update_ai_review: 'AI 预审',
    update_human_review: '人工复审',
    update_agreement: '用户协议',
    fix_readiness_blocker: '修复阻塞',
    update_publish_check: '发布检查',
  }[type];
}

function changeTagColor(type: AiTaskPublishChange['type']) {
  if (type === 'update_reward') return 'gold';
  if (type === 'update_ai_review') return 'blue';
  if (type === 'update_agreement') return 'purple';
  if (type === 'fix_readiness_blocker' || type === 'update_publish_check') return 'orange';
  return 'geekblue';
}

function riskLabel(value: AiTaskPublishChange['riskLevel']) {
  return value === 'high' ? '高风险' : value === 'medium' ? '中风险' : '低风险';
}

function riskColor(value: AiTaskPublishChange['riskLevel']) {
  return value === 'high' ? 'red' : value === 'medium' ? 'orange' : 'default';
}
