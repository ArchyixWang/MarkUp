import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  ApiOutlined,
  BorderOuterOutlined,
  CloseOutlined,
  CompressOutlined,
  DeleteOutlined,
  DownOutlined,
  ExpandAltOutlined,
  FileTextOutlined,
  MessageOutlined,
  PlusOutlined,
  RocketOutlined,
  SwitcherOutlined,
} from '@ant-design/icons';
import { Alert, Button, Drawer, Popover, Tag, Tooltip } from 'antd';
import { Bubble, Conversations, Prompts, Sender, Sources, Welcome, type BubbleItemType, type BubbleListProps, type PromptsItemType } from '@ant-design/x';
import type { ConversationItemType } from '@ant-design/x/es/conversations';
import { XMarkdown } from '@ant-design/x-markdown';
import { AgentAvatar } from './AgentAvatar';
import { getApiBaseUrl } from '../../services/apiClient';
import type { AuthSession } from '../../stores/authStore';
import './PlatformAgentDrawer.css';

interface PlatformAgentDrawerProps {
  open: boolean;
  session: AuthSession | null;
  onClose: () => void;
}

interface AgentSource {
  title: string;
  path: string;
  excerpt: string;
}

interface AgentMessage {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  status?: 'loading' | 'streaming' | 'success' | 'error';
  sources?: AgentSource[];
  fallback?: boolean;
}

interface AgentConversation {
  id: string;
  title: string;
  messages: AgentMessage[];
  value: string;
  error: string | null;
  createdAt: number;
}

interface PlatformPromptItem extends PromptsItemType {
  icon: ReactNode;
  question: string;
}

type ViewMode = 'sidebar' | 'floating' | 'expanded';

interface FloatingFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ActiveFloatingInteraction {
  type: 'drag' | 'resize';
  startX: number;
  startY: number;
  frame: FloatingFrame;
}

type ConversationListMode = 'popover' | 'aside';

const floatingMinWidth = 360;
const floatingMinHeight = 460;

const bubbleRole: BubbleListProps['role'] = {
  ai: {
    placement: 'start',
    variant: 'filled',
    shape: 'round',
    footerPlacement: 'outer-start',
    contentRender: (content, info) => (
      <XMarkdown
        className="platform-agent-markdown"
        content={String(content)}
        escapeRawHtml
        streaming={{
          hasNextChunk: info.status === 'updating',
          enableAnimation: info.status === 'updating',
        }}
      />
    ),
  },
  user: {
    placement: 'end',
    variant: 'filled',
    shape: 'round',
  },
};

const promptItems: PlatformPromptItem[] = [
  {
    key: 'publish',
    icon: <RocketOutlined />,
    label: '发布任务',
    description: '了解任务、模板、数据集的创建流程',
    question: '怎么发布任务？',
  },
  {
    key: 'review',
    icon: <ApiOutlined />,
    label: 'AI 预审',
    description: '查看 Provider、矩阵和阈值配置方式',
    question: 'AI 预审怎么配置？',
  },
  {
    key: 'label',
    icon: <FileTextOutlined />,
    label: '领取任务',
    description: '确认标注员如何进入任务和领取资格',
    question: '标注员怎么领任务？',
  },
];

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了，我是马克';
  if (hour < 12) return '早上好，我是马克';
  if (hour < 18) return '下午好，我是马克';
  return '晚上好，我是马克';
}

function compactSourcePath(path: string) {
  if (path.startsWith('/help')) return path;
  const hashIndex = path.indexOf('#');
  if (hashIndex >= 0) return `/help${path.slice(hashIndex)}`;
  return '/help';
}

function createConversation(title = '新对话'): AgentConversation {
  return {
    id: `conversation-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    messages: [],
    value: '',
    error: null,
    createdAt: Date.now(),
  };
}

function titleFromQuestion(question: string) {
  const title = question.trim().replace(/\s+/g, ' ');
  return title.length > 16 ? `${title.slice(0, 16)}...` : title || '新对话';
}

function getNavOffset() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--nav-height');
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 64;
}

function clampFloatingFrame(frame: FloatingFrame): FloatingFrame {
  const navOffset = getNavOffset();
  const maxWidth = Math.max(floatingMinWidth, window.innerWidth - 24);
  const maxHeight = Math.max(floatingMinHeight, window.innerHeight - navOffset - 24);
  const width = Math.min(Math.max(frame.width, floatingMinWidth), maxWidth);
  const height = Math.min(Math.max(frame.height, floatingMinHeight), maxHeight);
  return {
    width,
    height,
    left: Math.min(Math.max(12, frame.left), Math.max(12, window.innerWidth - width - 12)),
    top: Math.min(Math.max(navOffset + 12, frame.top), Math.max(navOffset + 12, window.innerHeight - height - 12)),
  };
}

function isInteractiveToolbarTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest('button, .ant-btn, .ant-popover, .ant-popover-open, a, input, textarea, [role="button"]'));
}

function getFloatingFrameStyle(frame: FloatingFrame) {
  return {
    '--platform-agent-floating-left': `${frame.left}px`,
    '--platform-agent-floating-top': `${frame.top}px`,
    '--platform-agent-floating-width': `${frame.width}px`,
    '--platform-agent-floating-height': `${frame.height}px`,
  } as CSSProperties;
}

export function PlatformAgentDrawer({ open, session, onClose }: PlatformAgentDrawerProps) {
  const [conversations, setConversations] = useState<AgentConversation[]>(() => [createConversation()]);
  const [activeConversationId, setActiveConversationId] = useState(() => conversations[0].id);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('sidebar');
  const [conversationOpen, setConversationOpen] = useState(false);
  const [floatingFrame, setFloatingFrame] = useState<FloatingFrame>(() => ({
    left: Math.max(16, window.innerWidth - 476),
    top: Math.max(80, window.innerHeight - 620),
    width: 420,
    height: 560,
  }));
  const abortRef = useRef<AbortController | null>(null);
  const dragRef = useRef<ActiveFloatingInteraction | null>(null);
  const liveFrameRef = useRef(floatingFrame);
  const pendingFrameRef = useRef<FloatingFrame | null>(null);
  const rafRef = useRef<number | null>(null);
  const cleanupInteractionRef = useRef<(() => void) | null>(null);
  const bodyInteractionStyleRef = useRef<{ cursor: string; userSelect: string } | null>(null);
  const activeConversation = conversations.find((item) => item.id === activeConversationId) ?? conversations[0];
  const messages = activeConversation?.messages ?? [];
  const value = activeConversation?.value ?? '';
  const error = activeConversation?.error ?? null;
  const conversationItems = useMemo<ConversationItemType[]>(() => conversations.map((conversation) => ({
    key: conversation.id,
    label: conversation.title,
    icon: <MessageOutlined />,
    group: '本地会话',
    title: conversation.title,
    'data-conversation-key': conversation.id,
  })), [conversations]);
  const floatingStyle = viewMode === 'floating' ? getFloatingFrameStyle(floatingFrame) : undefined;

  function getFloatingRootElement() {
    return document.querySelector('.platform-agent-drawer-root--floating') as HTMLElement | null;
  }

  function applyFloatingFrame(frame: FloatingFrame) {
    const floatingRoot = getFloatingRootElement();
    if (!floatingRoot) return;
    floatingRoot.style.setProperty('--platform-agent-floating-left', `${frame.left}px`);
    floatingRoot.style.setProperty('--platform-agent-floating-top', `${frame.top}px`);
    floatingRoot.style.setProperty('--platform-agent-floating-width', `${frame.width}px`);
    floatingRoot.style.setProperty('--platform-agent-floating-height', `${frame.height}px`);
  }

  function flushPendingFloatingFrame() {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (!pendingFrameRef.current) return;
    applyFloatingFrame(pendingFrameRef.current);
    pendingFrameRef.current = null;
  }

  function scheduleFloatingFrame(frame: FloatingFrame) {
    liveFrameRef.current = frame;
    pendingFrameRef.current = frame;
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      if (!pendingFrameRef.current) return;
      applyFloatingFrame(pendingFrameRef.current);
      pendingFrameRef.current = null;
    });
  }

  function syncFloatingFrame(frame: FloatingFrame) {
    liveFrameRef.current = frame;
    applyFloatingFrame(frame);
  }

  function endFloatingInteraction(commit = true, restoreFrame = floatingFrame) {
    cleanupInteractionRef.current?.();
    cleanupInteractionRef.current = null;
    dragRef.current = null;
    flushPendingFloatingFrame();
    document.body.classList.remove('platform-agent-interacting', 'platform-agent-interacting--drag', 'platform-agent-interacting--resize');
    if (bodyInteractionStyleRef.current) {
      document.body.style.cursor = bodyInteractionStyleRef.current.cursor;
      document.body.style.userSelect = bodyInteractionStyleRef.current.userSelect;
      bodyInteractionStyleRef.current = null;
    } else {
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
    }
    if (commit) {
      setFloatingFrame(liveFrameRef.current);
    } else {
      syncFloatingFrame(restoreFrame);
      liveFrameRef.current = restoreFrame;
    }
  }

  useEffect(() => {
    if (!open || viewMode !== 'floating') return undefined;
    const handleResize = () => {
      setFloatingFrame((current) => {
        const next = clampFloatingFrame(current);
        liveFrameRef.current = next;
        return next;
      });
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [open, viewMode]);

  useEffect(() => {
    liveFrameRef.current = floatingFrame;
    if (open && viewMode === 'floating') {
      syncFloatingFrame(floatingFrame);
    }
  }, [floatingFrame, open, viewMode]);

  useEffect(() => () => {
    endFloatingInteraction(false, liveFrameRef.current);
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
    }
  }, []);

  const bubbleItems = useMemo<BubbleItemType[]>(() => messages.map((message) => ({
    key: message.id,
    role: message.role === 'user' ? 'user' : 'ai',
    status: message.role === 'user'
      ? 'local'
      : message.status === 'streaming'
        ? 'updating'
        : message.status ?? 'success',
    content: message.content || (message.status === 'loading' ? '正在连接平台问答 AI...' : '正在处理...'),
    loading: message.status === 'loading',
    streaming: message.status === 'streaming',
    footer: message.role === 'assistant' && (message.sources?.length || message.fallback) ? (
      <div className="platform-agent-sources">
        {message.fallback && <Tag color="gold">当前使用公开文档摘要兜底</Tag>}
        {message.sources?.length ? (
          <>
            <Sources
              title="引用来源"
              inline
              popoverOverlayWidth={320}
              items={message.sources.map((source) => ({
                key: source.path,
                title: source.title,
                description: `${compactSourcePath(source.path)} · ${source.excerpt}`,
              }))}
            />
            <div className="platform-agent-source-paths" aria-label="引用路径">
              {message.sources.map((source) => (
                <span key={source.path}>{compactSourcePath(source.path)}</span>
              ))}
            </div>
          </>
        ) : null}
      </div>
    ) : undefined,
  })), [messages]);

  function patchConversation(
    conversationId: string,
    patch: Partial<AgentConversation> | ((current: AgentConversation) => Partial<AgentConversation>),
  ) {
    setConversations((current) => current.map((conversation) => {
      if (conversation.id !== conversationId) return conversation;
      const nextPatch = typeof patch === 'function' ? patch(conversation) : patch;
      return { ...conversation, ...nextPatch };
    }));
  }

  function resetConversation() {
    abortRef.current?.abort();
    patchConversation(activeConversationId, { messages: [], error: null, value: '', title: '新对话' });
    setLoading(false);
  }

  function createNewConversation() {
    abortRef.current?.abort();
    const next = createConversation();
    setConversations((current) => [next, ...current]);
    setActiveConversationId(next.id);
    setConversationOpen(false);
    setLoading(false);
  }

  function deleteConversation(conversationId: string) {
    setConversationOpen(false);
    setConversations((current) => {
      if (current.length <= 1) {
        const replacement = createConversation();
        setActiveConversationId(replacement.id);
        return [replacement];
      }
      const next = current.filter((item) => item.id !== conversationId);
      if (conversationId === activeConversationId) {
        setActiveConversationId(next[0].id);
      }
      return next;
    });
  }

  function setActiveValue(nextValue: string) {
    patchConversation(activeConversationId, { value: nextValue });
  }

  async function submit(nextValue: string) {
    const question = nextValue.trim();
    const conversationId = activeConversationId;
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!question || loading || !conversation) return;

    const id = `${Date.now()}`;
    const assistantId = `assistant-${id}`;
    const nextMessages: AgentMessage[] = [
      ...conversation.messages,
      { id: `user-${id}`, role: 'user', content: question, status: 'success' },
      { id: assistantId, role: 'assistant', content: '', status: 'loading' },
    ];
    patchConversation(conversationId, (current) => ({
      messages: nextMessages,
      value: '',
      error: null,
      title: current.messages.length === 0 ? titleFromQuestion(question) : current.title,
    }));
    setLoading(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestUrl = `${getApiBaseUrl()}/platform-agent/chat/stream`;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 45_000);

    try {
      const response = await fetch(requestUrl, {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
        },
        body: JSON.stringify({
          message: question,
          history: conversation.messages.slice(-8).map((item) => ({ role: item.role, content: item.content })),
        }),
      });
      await consumeAgentStream(response, conversationId, assistantId, requestUrl);
    } catch (err) {
      if ((err as Error).name === 'AbortError' && !timedOut) return;
      const message = timedOut
        ? `平台问答 AI 响应超时，请检查平台默认 Provider、后端服务或 API Base：${requestUrl}`
        : err instanceof Error ? err.message : '平台问答 AI 请求失败';
      patchConversation(conversationId, { error: message });
      updateAssistantMessage(conversationId, assistantId, { content: message, status: 'error' });
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
      abortRef.current = null;
    }
  }

  function handlePromptClick({ data }: { data: PromptsItemType }) {
    const prompt = promptItems.find((item) => item.key === data.key);
    if (!prompt) return;
    void submit(prompt.question);
  }

  async function consumeAgentStream(response: Response, conversationId: string, assistantId: string, requestUrl: string) {
    if (!response.body) {
      throw new Error('平台问答 AI 暂无响应流');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fallback = false;
    let receivedEvent = false;
    let completed = false;

    for (;;) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      buffer += decoder.decode(chunk, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        const event = parseSseEvent(part);
        if (!event) continue;
        receivedEvent = true;
        if (event.event === 'error') {
          const message = String(event.data.message || '平台问答 AI 请求失败');
          patchConversation(conversationId, { error: message });
          updateAssistantMessage(conversationId, assistantId, { content: message, status: 'error' });
          completed = true;
          continue;
        }
        if (event.event === 'meta') {
          fallback = event.data.fallback === 'rag_summary';
          updateAssistantMessage(conversationId, assistantId, { status: 'streaming', fallback });
          continue;
        }
        if (event.event === 'delta') {
          const delta = String(event.data.content || '');
          updateAssistantMessage(conversationId, assistantId, (current) => ({
            content: `${current.content}${delta}`,
            status: 'streaming',
            fallback,
          }));
          continue;
        }
        if (event.event === 'sources') {
          const sources = Array.isArray(event.data.items) ? event.data.items as AgentSource[] : [];
          updateAssistantMessage(conversationId, assistantId, { sources, fallback });
          continue;
        }
        if (event.event === 'done') {
          updateAssistantMessage(conversationId, assistantId, { status: 'success', fallback: fallback || event.data.fallback === 'rag_summary' });
          completed = true;
        }
      }
    }

    if (!receivedEvent) {
      if (response.status === 404) {
        throw new Error(`平台问答接口未注册（HTTP 404），请确认后端已重启，并检查 API Base 是否指向当前后端：${requestUrl}`);
      }
      if (response.status === 429) {
        throw new Error(`平台问答请求过于频繁（HTTP 429），请稍后再试：${requestUrl}`);
      }
      if (response.status === 503) {
        throw new Error(`平台默认 Provider 暂不可用（HTTP 503），请到 /platform?page=providers 检查配置：${requestUrl}`);
      }
      throw new Error(response.ok ? '平台问答 AI 未返回有效事件' : `平台问答 AI 请求失败（HTTP ${response.status}）：${requestUrl}`);
    }
    if (!completed) {
      updateAssistantMessage(conversationId, assistantId, { status: 'success', fallback });
    }
  }

  function updateAssistantMessage(
    conversationId: string,
    id: string,
    patch: Partial<AgentMessage> | ((current: AgentMessage) => Partial<AgentMessage>),
  ) {
    patchConversation(conversationId, (conversation) => ({
      messages: conversation.messages.map((item) => {
        if (item.id !== id) return item;
        const nextPatch = typeof patch === 'function' ? patch(item) : patch;
        return { ...item, ...nextPatch };
      }),
    }));
  }

  function cancel() {
    abortRef.current?.abort();
    setLoading(false);
  }

  function renderConversations(mode: ConversationListMode) {
    return (
      <Conversations
        className={`platform-agent-conversations platform-agent-conversations--${mode}`}
        items={conversationItems}
        activeKey={activeConversationId}
        onActiveChange={(key) => {
          setActiveConversationId(String(key));
          if (mode === 'popover') setConversationOpen(false);
        }}
        groupable
        creation={{ label: '新建对话', icon: <PlusOutlined />, onClick: createNewConversation }}
        menu={(conversation) => ({
          items: [{
            key: 'delete',
            label: '删除对话',
            icon: <DeleteOutlined />,
            danger: true,
            onClick: () => deleteConversation(String(conversation.key)),
          }],
          onClick: ({ key }) => {
            if (key === 'delete') deleteConversation(String(conversation.key));
          },
        })}
      />
    );
  }

  function startFloatingInteraction(event: ReactPointerEvent<HTMLElement>, type: 'drag' | 'resize') {
    if (viewMode !== 'floating' || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (type === 'drag' && isInteractiveToolbarTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    endFloatingInteraction(false, liveFrameRef.current);
    bodyInteractionStyleRef.current = {
      cursor: document.body.style.cursor,
      userSelect: document.body.style.userSelect,
    };
    document.body.style.cursor = type === 'drag' ? 'grabbing' : 'nwse-resize';
    document.body.style.userSelect = 'none';
    document.body.classList.add('platform-agent-interacting', type === 'drag' ? 'platform-agent-interacting--drag' : 'platform-agent-interacting--resize');
    dragRef.current = {
      type,
      startX: event.clientX,
      startY: event.clientY,
      frame: liveFrameRef.current,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const handleMove = (moveEvent: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      moveEvent.preventDefault();
      const deltaX = moveEvent.clientX - current.startX;
      const deltaY = moveEvent.clientY - current.startY;
      const nextFrame = current.type === 'drag'
        ? {
          ...current.frame,
          left: current.frame.left + deltaX,
          top: current.frame.top + deltaY,
        }
        : {
          ...current.frame,
          width: current.frame.width + deltaX,
          height: current.frame.height + deltaY,
        };
      scheduleFloatingFrame(clampFloatingFrame(nextFrame));
    };

    const handleUp = () => {
      endFloatingInteraction(true);
    };

    cleanupInteractionRef.current = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      window.removeEventListener('blur', handleUp);
    };

    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    window.addEventListener('blur', handleUp);
  }

  function switchToSidebar() {
    setConversationOpen(false);
    setViewMode('sidebar');
  }

  function switchToFloating() {
    setConversationOpen(false);
    setFloatingFrame((current) => clampFloatingFrame(current));
    setViewMode('floating');
  }

  function toggleExpanded() {
    setConversationOpen(false);
    setViewMode((current) => current === 'expanded' ? 'sidebar' : 'expanded');
  }

  return (
    <Drawer
      title="平台问答 AI"
      placement="right"
      size={420}
      mask={false}
      autoFocus={false}
      focusable={{ trap: false }}
      open={open}
      onClose={onClose}
      rootClassName={`platform-agent-drawer-root platform-agent-drawer-root--${viewMode}`}
      rootStyle={floatingStyle}
      className="platform-agent-drawer"
    >
      <section className="platform-agent-panel" aria-label="平台问答 AI">
        <header className="platform-agent-toolbar">
          <div className="platform-agent-toolbar-primary">
            <Popover
            trigger="click"
            placement="bottomLeft"
            open={conversationOpen}
            onOpenChange={setConversationOpen}
            overlayClassName="platform-agent-conversations-popover"
            destroyOnHidden
            content={renderConversations('popover')}
          >
            <button className="platform-agent-thread-title" type="button" aria-label="切换对话">
              <span>{activeConversation?.title ?? '新对话'}</span>
              <DownOutlined aria-hidden="true" />
            </button>
          </Popover>
            {viewMode === 'floating' && (
              <div
                className="platform-agent-drag-zone"
                aria-hidden="true"
                onPointerDown={(event) => startFloatingInteraction(event, 'drag')}
              />
            )}
          </div>
          <div className="platform-agent-toolbar-actions">
            <Tooltip title="新建对话">
              <Button aria-label="新建对话" type="text" icon={<PlusOutlined />} onClick={createNewConversation} />
            </Tooltip>
            <Tooltip title="清空当前对话">
              <Button aria-label="清空当前对话" type="text" icon={<DeleteOutlined />} onClick={resetConversation} />
            </Tooltip>
            {viewMode !== 'sidebar' && (
              <Tooltip title="切换侧栏">
                <Button aria-label="切换侧栏" type="text" icon={<BorderOuterOutlined />} onClick={switchToSidebar} />
              </Tooltip>
            )}
            {viewMode !== 'floating' && (
              <Tooltip title="切换悬浮窗">
                <Button aria-label="切换悬浮窗" type="text" icon={<SwitcherOutlined />} onClick={switchToFloating} />
              </Tooltip>
            )}
            <Tooltip title={viewMode === 'expanded' ? '恢复侧栏' : '扩大窗口'}>
              <Button
                aria-label={viewMode === 'expanded' ? '恢复侧栏' : '扩大窗口'}
                type="text"
                icon={viewMode === 'expanded' ? <CompressOutlined /> : <ExpandAltOutlined />}
                onClick={toggleExpanded}
              />
            </Tooltip>
            <Tooltip title="关闭">
              <Button aria-label="关闭平台问答 AI" type="text" icon={<CloseOutlined />} onClick={onClose} />
            </Tooltip>
          </div>
        </header>

        <div className="platform-agent-workspace">
          {viewMode === 'expanded' && (
            <aside className="platform-agent-conversations-aside" aria-label="对话列表">
              {renderConversations('aside')}
            </aside>
          )}
          <main className="platform-agent-canvas">
            <div className="platform-agent-support-strip">
              <span>需要更多帮助？</span>
              <Button size="small" href="/help">
                帮助文档
              </Button>
            </div>

            <div className="platform-agent-conversation">
              {messages.length === 0 ? (
                <div className="platform-agent-empty">
                  <Welcome
                    className="platform-agent-welcome"
                    variant="borderless"
                    icon={<AgentAvatar motion="idle" size={64} />}
                    title={getGreeting()}
                    description="今天想了解 MarkUp 平台的哪一部分？"
                  />
                  <Prompts
                    title="你可以这样问"
                    items={promptItems}
                    vertical
                    fadeIn
                    className="platform-agent-prompts"
                    onItemClick={handlePromptClick}
                  />
                </div>
              ) : (
                <Bubble.List
                  autoScroll
                  items={bubbleItems}
                  className="platform-agent-bubble-list"
                  role={bubbleRole}
                />
              )}
            </div>
          </main>
        </div>

        <footer className="platform-agent-composer">
          {error && <Alert className="platform-agent-inline-alert" type="error" showIcon message={error} />}
          <Sender
            value={value}
            loading={loading}
            placeholder="问我 MarkUp 平台使用问题"
            autoSize={{ minRows: 1, maxRows: 4 }}
            className="platform-agent-sender"
            onChange={setActiveValue}
            onSubmit={submit}
            onCancel={cancel}
          />
        </footer>
        {viewMode === 'floating' && (
          <button
            type="button"
            className="platform-agent-resize-handle"
            aria-label="调整悬浮窗大小"
            onPointerDown={(event) => startFloatingInteraction(event, 'resize')}
          />
        )}
      </section>
    </Drawer>
  );
}

function parseSseEvent(raw: string): { event: string; data: Record<string, unknown> } | null {
  const eventLine = raw.split('\n').find((line) => line.startsWith('event:'));
  const dataLine = raw.split('\n').find((line) => line.startsWith('data:'));
  if (!eventLine || !dataLine) return null;
  try {
    return {
      event: eventLine.replace(/^event:\s*/, '').trim(),
      data: JSON.parse(dataLine.replace(/^data:\s*/, '').trim()),
    };
  } catch {
    return null;
  }
}
