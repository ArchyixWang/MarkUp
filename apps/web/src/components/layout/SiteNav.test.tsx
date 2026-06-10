import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SiteNav } from './SiteNav';
import type { AuthSession } from '../../stores/authStore';
import { markDisconnected, resetConnectivityStatusForTests } from '../../services/connectivityStatus';

const inboxPayload = {
  items: [],
  summary: { unread: 0, team: 0, review: 0, export: 0, system: 0 },
  pagination: { page: 1, page_size: 5, total: 0, total_pages: 1 },
};

const apiResponse = (data: unknown) => Promise.resolve(new Response(JSON.stringify({ code: 0, message: 'success', data }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

const session: AuthSession = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  user: {
    user_id: 'u1',
    username: 'owner01',
    display_name: 'Owner One',
    email: 'owner@example.com',
    role: 'owner',
    permissions: ['team:manage'],
  },
};

function sseResponse(events: string[]): Promise<Response> {
  const encoder = new TextEncoder();
  return Promise.resolve(new Response(new ReadableStream({
    start(controller) {
      events.forEach((event) => controller.enqueue(encoder.encode(event)));
      controller.close();
    },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));
}

async function clickSenderSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'arrow-up' }));
}

describe('SiteNav', () => {
  beforeEach(() => {
    resetConnectivityStatusForTests();
    vi.stubGlobal('fetch', vi.fn(() => apiResponse(inboxPayload)));
  });

  afterEach(() => {
    resetConnectivityStatusForTests();
    vi.unstubAllGlobals();
  });

  it('renders the public platform AI entry when logged out', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <SiteNav session={null} onOpenLogin={() => undefined} onLogout={() => undefined} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('img', { name: 'MarkUp' })).toHaveAttribute('src', '/color_logo.svg');
    expect(container.querySelector('.site-nav-logo--white')).toHaveAttribute('src', '/white_logo.svg');
    expect(screen.queryByLabelText('网络连接正常')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '小马克' }));

    expect(await screen.findByRole('button', { name: '切换对话' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '解决方案' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '帮助文档' })).toHaveAttribute('href', '/help');
    expect(screen.getByPlaceholderText('问我 MarkUp 平台使用问题')).toBeInTheDocument();
  });

  it('keeps the home register action as a blue primary button', () => {
    document.body.classList.add('home-transparent-nav');
    const { container } = render(
      <MemoryRouter>
        <SiteNav session={null} onOpenLogin={() => undefined} onLogout={() => undefined} />
      </MemoryRouter>,
    );

    const registerButton = container.querySelector<HTMLButtonElement>('.site-nav-register-btn.ant-btn-primary');
    expect(registerButton).toBeTruthy();
    expect(registerButton).toHaveClass('site-nav-register-btn');
    expect(registerButton).toHaveClass('ant-btn-color-primary');
    expect(registerButton).toHaveClass('ant-btn-variant-solid');
    document.body.classList.remove('home-transparent-nav');
  });

  it('keeps the logged-in icon controls in a stable order', () => {
    const { container } = render(
      <MemoryRouter>
        <SiteNav session={session} onOpenLogin={() => undefined} onLogout={() => undefined} />
      </MemoryRouter>,
    );

    const actionSpace = container.querySelector('.site-nav-actions .ant-space');
    expect(actionSpace?.children[0]).toContainElement(screen.getByLabelText('网络连接正常'));
    expect(actionSpace?.children[1]).toContainElement(screen.getByRole('button', { name: '小马克' }));
    expect(actionSpace?.children[2]).toContainElement(screen.getByRole('button', { name: '个人信箱' }));
    expect(actionSpace?.children[3]).toContainElement(screen.getByRole('button', { name: '工作台' }));
  });

  it('opens a personal inbox preview and links to the full workspace page', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(() => apiResponse({
      items: [{
        notification_id: 'notice-1',
        team_id: 'team-1',
        source_team_name: 'MarkUp Team',
        title: '审核提醒',
        content: '你有一条待处理审核提醒',
        notification_type: 'review',
        priority: 'important',
        target_type: 'member',
        target_roles: [],
        target_user_ids: ['u1'],
        status: 'unread',
        is_read: false,
        is_handled: false,
        read_count: 0,
        handled_count: 0,
        email_enabled: false,
        in_app_enabled: true,
        created_at: '2026-05-30T10:00:00Z',
      }],
      summary: { unread: 1, team: 0, review: 1, export: 0, system: 0 },
      pagination: { page: 1, page_size: 5, total: 1, total_pages: 1 },
    }));

    render(
      <MemoryRouter>
        <SiteNav session={session} onOpenLogin={() => undefined} onLogout={() => undefined} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '个人信箱' }));

    expect(await screen.findByLabelText('个人信箱概览')).toBeInTheDocument();
    expect(screen.getAllByText('审核提醒').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '查看全部' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/notifications/my?page_size=5', expect.any(Object));
  });

  it('keeps the inbox badge total after marking a preview item read', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const previewNotice = {
      notification_id: 'notice-1',
      team_id: 'team-1',
      source_team_name: 'MarkUp Team',
      title: '审核提醒',
      content: '你有一条待处理审核提醒',
      notification_type: 'review',
      priority: 'important',
      target_type: 'member',
      target_roles: [],
      target_user_ids: ['u1'],
      status: 'unread',
      is_read: false,
      is_handled: false,
      read_count: 0,
      handled_count: 0,
      email_enabled: false,
      in_app_enabled: true,
      created_at: '2026-05-30T10:00:00Z',
    };
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes('/api/v1/notifications/my/notice-1/state') && init?.method === 'POST') {
        return apiResponse({ ...previewNotice, status: 'read', is_read: true, read_count: 1 });
      }
      return apiResponse({
        items: [previewNotice],
        summary: { unread: 12, team: 0, review: 12, export: 0, system: 0 },
        pagination: { page: 1, page_size: 5, total: 12, total_pages: 3 },
      });
    });

    render(
      <MemoryRouter>
        <SiteNav session={session} onOpenLogin={() => undefined} onLogout={() => undefined} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '个人信箱' }));
    expect(await screen.findByText('12 条未读')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: '已读' }));

    expect(await screen.findByText('11 条未读')).toBeInTheDocument();
  });

  it('does not expose read actions for expired inbox preview items', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(() => apiResponse({
      items: [{
        notification_id: 'notice-expired',
        team_id: 'team-1',
        source_team_name: 'MarkUp Team',
        title: 'Expired preview notice',
        content: 'Historical visibility only.',
        notification_type: 'review',
        priority: 'important',
        target_type: 'member',
        target_roles: [],
        target_user_ids: ['u1'],
        status: 'expired',
        is_read: false,
        is_handled: false,
        read_count: 0,
        handled_count: 0,
        email_enabled: false,
        in_app_enabled: true,
        expire_at: '2026-06-06T10:00:00Z',
        created_at: '2026-06-05T10:00:00Z',
      }],
      summary: { unread: 0, team: 0, review: 1, export: 0, system: 0 },
      pagination: { page: 1, page_size: 5, total: 1, total_pages: 1 },
    }));

    render(
      <MemoryRouter>
        <SiteNav session={session} onOpenLogin={() => undefined} onLogout={() => undefined} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '个人信箱' }));
    const panel = await screen.findByLabelText('个人信箱概览');

    expect(within(panel).getByText('Expired preview notice')).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: '已读' })).not.toBeInTheDocument();
  });

  it('streams a platform AI answer and renders sources', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input) => {
      if (String(input).includes('/platform-agent/chat/stream')) {
        return sseResponse([
          'event: meta\ndata: {"fallback":"rag_summary"}\n\n',
          'event: delta\ndata: {"content":"可以先 **创建模板**"}\n\n',
          'event: delta\ndata: {"content":" 和数据集。"}\n\n',
          'event: sources\ndata: {"items":[{"title":"帮助文档","path":"/help#quickstart","excerpt":"任务发布说明"}]}\n\n',
          'event: done\ndata: {"fallback":"rag_summary"}\n\n',
        ]);
      }
      return apiResponse(inboxPayload);
    });

    render(
      <MemoryRouter>
        <SiteNav session={null} onOpenLogin={() => undefined} onLogout={() => undefined} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '小马克' }));
    await user.type(await screen.findByPlaceholderText('问我 MarkUp 平台使用问题'), '怎么发布任务？');
    await clickSenderSubmit(user);

    expect(await screen.findByText(/可以先/)).toBeInTheDocument();
    expect(await screen.findByText('创建模板')).toBeInTheDocument();
    expect(screen.queryByText(/\*\*创建模板\*\*/)).not.toBeInTheDocument();
    expect(await screen.findByText('引用来源')).toBeInTheDocument();
    expect(await screen.findByText('当前使用公开文档摘要兜底')).toBeInTheDocument();
    const agentDialog = screen.getByRole('dialog', { name: /平台问答 AI/ });
    expect(within(agentDialog).getByText('/help#quickstart')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/platform-agent/chat/stream', expect.objectContaining({ method: 'POST' }));
  });

  it('sends an explicit question when an empty-state prompt card is clicked', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input) => {
      if (String(input).includes('/platform-agent/chat/stream')) {
        return sseResponse([
          'event: meta\ndata: {}\n\n',
          'event: delta\ndata: {"content":"发布任务可以从任务入口开始。"}\n\n',
          'event: done\ndata: {}\n\n',
        ]);
      }
      return apiResponse(inboxPayload);
    });

    render(
      <MemoryRouter>
        <SiteNav session={null} onOpenLogin={() => undefined} onLogout={() => undefined} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '小马克' }));
    const agentDialog = await screen.findByRole('dialog', { name: /平台问答 AI/ });
    await user.click(within(agentDialog).getByText('发布任务'));

    expect((await screen.findAllByText('怎么发布任务？')).length).toBeGreaterThan(0);
    expect(await screen.findByText('发布任务可以从任务入口开始。')).toBeInTheDocument();
    const requestBody = JSON.parse(String(fetchMock.mock.calls.find(([input]) => String(input).includes('/platform-agent/chat/stream'))?.[1]?.body));
    expect(requestBody.message).toBe('怎么发布任务？');
  });

  it('keeps only one panel agent visual and supports sidebar, floating, and expanded modes', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SiteNav session={null} onOpenLogin={() => undefined} onLogout={() => undefined} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '小马克' }));
    const agentDialog = await screen.findByRole('dialog', { name: /平台问答 AI/ });
    expect(agentDialog.querySelectorAll('.agent-avatar')).toHaveLength(1);
    expect(document.querySelector('.platform-agent-drawer-root--sidebar')).toBeInTheDocument();
    expect(within(agentDialog).getByRole('button', { name: '切换悬浮窗' })).toBeInTheDocument();
    expect(within(agentDialog).getByRole('button', { name: '新建对话' })).toBeInTheDocument();
    expect(within(agentDialog).getByRole('button', { name: '清空当前对话' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '切换悬浮窗' }));
    const floatingRoot = document.querySelector('.platform-agent-drawer-root--floating') as HTMLElement;
    expect(floatingRoot).toBeInTheDocument();
    expect(within(agentDialog).getByRole('button', { name: '调整悬浮窗大小' })).toBeInTheDocument();
    const dragZone = agentDialog.querySelector('.platform-agent-drag-zone') as HTMLElement;
    const initialLeft = floatingRoot.style.getPropertyValue('--platform-agent-floating-left');
    const initialWidth = floatingRoot.style.getPropertyValue('--platform-agent-floating-width');
    const initialHeight = floatingRoot.style.getPropertyValue('--platform-agent-floating-height');

    fireEvent.pointerDown(dragZone, { button: 0, clientX: 220, clientY: 150, pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerMove(window, { clientX: 260, clientY: 190, pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerUp(window, { pointerId: 1, pointerType: 'mouse' });
    expect(floatingRoot.style.getPropertyValue('--platform-agent-floating-left')).not.toBe(initialLeft);

    fireEvent.pointerDown(within(agentDialog).getByRole('button', { name: '调整悬浮窗大小' }), { button: 0, clientX: 520, clientY: 620, pointerId: 2, pointerType: 'mouse' });
    fireEvent.pointerMove(window, { clientX: 560, clientY: 660, pointerId: 2, pointerType: 'mouse' });
    fireEvent.pointerUp(window, { pointerId: 2, pointerType: 'mouse' });
    expect(floatingRoot.style.getPropertyValue('--platform-agent-floating-width')).not.toBe(initialWidth);
    expect(floatingRoot.style.getPropertyValue('--platform-agent-floating-height')).not.toBe(initialHeight);

    await user.click(screen.getByRole('button', { name: '切换侧栏' }));
    expect(document.querySelector('.platform-agent-drawer-root--sidebar')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '扩大窗口' }));
    expect(document.querySelector('.platform-agent-drawer-root--expanded')).toBeInTheDocument();
    expect(within(agentDialog).getByLabelText('对话列表')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '恢复侧栏' }));
    expect(document.querySelector('.platform-agent-drawer-root--sidebar')).toBeInTheDocument();
  });

  it('manages local conversations with Ant Design X Conversations', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input) => {
      if (String(input).includes('/platform-agent/chat/stream')) {
        return sseResponse([
          'event: meta\ndata: {}\n\n',
          'event: delta\ndata: {"content":"收到。"}\n\n',
          'event: done\ndata: {}\n\n',
        ]);
      }
      return apiResponse(inboxPayload);
    });

    render(
      <MemoryRouter>
        <SiteNav session={null} onOpenLogin={() => undefined} onLogout={() => undefined} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '小马克' }));
    await user.type(await screen.findByPlaceholderText('问我 MarkUp 平台使用问题'), '第一个问题');
    await clickSenderSubmit(user);
    expect((await screen.findAllByText('第一个问题')).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: '新建对话' }));
    const agentDialog = screen.getByRole('dialog', { name: /平台问答 AI/ });
    expect(within(agentDialog).queryByText('收到。')).not.toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('问我 MarkUp 平台使用问题'), '第二个问题');
    await clickSenderSubmit(user);
    expect((await screen.findAllByText('第二个问题')).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: '切换对话' }));
    await user.click((await screen.findAllByText('第一个问题'))[0]);
    expect(within(agentDialog).getAllByText('第一个问题').length).toBeGreaterThan(0);
    expect(within(agentDialog).queryByText('第二个问题', { selector: '.ant-bubble-content *' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '切换对话' }));
    const secondConversations = await screen.findAllByText('第二个问题');
    const secondConversation = secondConversations[secondConversations.length - 1];
    const secondItem = secondConversation.closest('li') ?? secondConversation;
    await user.click(within(secondItem as HTMLElement).getByLabelText('ellipsis'));
    expect(await screen.findByText('删除对话')).toBeInTheDocument();
  });

  it('keeps floating window size stable while streaming long answers', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input) => {
      if (String(input).includes('/platform-agent/chat/stream')) {
        return sseResponse([
          'event: meta\ndata: {"request_id":"stream-1"}\n\n',
          'event: delta\ndata: {"content":"第一段回答。"}\n\n',
          'event: delta\ndata: {"content":"第二段回答，内容更长一些，用来模拟持续流式输出。"}\n\n',
          'event: done\ndata: {"request_id":"stream-1","tokens":42}\n\n',
        ]);
      }
      return apiResponse(inboxPayload);
    });

    const { container } = render(
      <MemoryRouter>
        <SiteNav session={null} onOpenLogin={() => undefined} onLogout={() => undefined} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '小马克' }));
    await user.click(await screen.findByRole('button', { name: '切换悬浮窗' }));
    const floatingRoot = document.querySelector('.platform-agent-drawer-root--floating') as HTMLElement;
    const widthBefore = floatingRoot.style.getPropertyValue('--platform-agent-floating-width');
    const heightBefore = floatingRoot.style.getPropertyValue('--platform-agent-floating-height');
    await user.type(await screen.findByPlaceholderText('问我 MarkUp 平台使用问题'), '帮我介绍一下发布任务的步骤');
    await clickSenderSubmit(user);

    expect(await screen.findByText(/第一段回答/)).toBeInTheDocument();
    expect(await screen.findByText(/第二段回答/)).toBeInTheDocument();
    expect(floatingRoot.style.getPropertyValue('--platform-agent-floating-width')).toBe(widthBefore);
    expect(floatingRoot.style.getPropertyValue('--platform-agent-floating-height')).toBe(heightBefore);
  });

  it('shows a clear diagnostic when the platform AI endpoint is not registered', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input) => {
      if (String(input).includes('/platform-agent/chat/stream')) {
        return Promise.resolve(new Response('not found', { status: 404 }));
      }
      return apiResponse(inboxPayload);
    });

    render(
      <MemoryRouter>
        <SiteNav session={null} onOpenLogin={() => undefined} onLogout={() => undefined} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '小马克' }));
    await user.type(await screen.findByPlaceholderText('问我 MarkUp 平台使用问题'), '怎么发布任务？');
    await clickSenderSubmit(user);

    expect((await screen.findAllByText(/平台问答接口未注册/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\/api\/v1\/platform-agent\/chat\/stream/).length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/platform-agent/chat/stream', expect.objectContaining({ method: 'POST' }));
  });

  it('renders the connection status indicator in the mobile drawer workspace entry', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SiteNav session={session} onOpenLogin={() => undefined} onLogout={() => undefined} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '打开导航菜单' }));

    const dialog = await screen.findByRole('dialog');
    const mobileWorkspaceButton = within(dialog).getByRole('button', { name: '网络连接正常 工作台' });

    expect(within(dialog).queryByRole('button', { name: /个人信箱/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '个人信箱' })).toBeInTheDocument();
    expect(mobileWorkspaceButton).toBeInTheDocument();
    expect(within(mobileWorkspaceButton).getByLabelText('网络连接正常')).toBeInTheDocument();
  });

  it('updates the rendered indicator when connectivity changes to disconnected', () => {
    render(
      <MemoryRouter>
        <SiteNav session={session} onOpenLogin={() => undefined} onLogout={() => undefined} />
      </MemoryRouter>,
    );

    act(() => {
      markDisconnected();
    });

    expect(screen.getByLabelText('连接失败')).toBeInTheDocument();
  });
});
