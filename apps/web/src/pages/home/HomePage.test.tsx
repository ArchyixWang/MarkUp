import { MemoryRouter, useLocation } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomePage } from './HomePage';
import type { AuthSession } from '../../stores/authStore';

const defaultMatchMedia = window.matchMedia;

function renderHome(onOpenLogin = vi.fn(), session: AuthSession | null = null) {
  const view = render(
    <MemoryRouter>
      <HomePage onOpenLogin={onOpenLogin} session={session} />
      <LocationProbe />
    </MemoryRouter>,
  );
  return { onOpenLogin, ...view };
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location-path">{location.pathname}{location.search}</span>;
}

function mockReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    })),
  });
}

function enterpriseSession(): AuthSession {
  return {
    accessToken: 'access',
    refreshToken: 'refresh',
    user: {
      user_id: 'owner-1',
      username: 'owner',
      email: 'owner@example.com',
      role: 'team_owner',
      permissions: ['task:create'],
      profile: {},
    },
  } as AuthSession;
}

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: defaultMatchMedia,
  });
  document.body.classList.remove('home-transparent-nav', 'home-nav-scrolled');
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    value: 0,
  });
});

describe('HomePage', () => {
  it('renders the replicated first-screen hero with an AI input bar', async () => {
    renderHome();

    expect(screen.getByRole('heading', { name: 'AI 开启数据标注新时代' })).toBeInTheDocument();
    expect(screen.getByText('让每一份数据，都有智能、有质量、有迹可循。')).toBeInTheDocument();
    expect(document.querySelector('.home-hero-logo')).toHaveAttribute('src', '/white_logo.svg');
    const aiBar = screen.getByLabelText('MarkUp AI 对话展示条');
    expect(aiBar).toHaveClass('home-ai-showcase-bar');
    expect(aiBar).not.toHaveClass('home-ai-template-floating');
    expect(within(aiBar).queryByRole('textbox')).not.toBeInTheDocument();
    await waitFor(() => expect(aiBar.textContent?.length ?? 0).toBeGreaterThan(0));
    expect(screen.queryByText(/大家都在搜/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /咨询 MarkUp Agent/ })).not.toBeInTheDocument();
    expect(document.body).toHaveClass('home-transparent-nav');
  });

  it('restores the normal nav surface after scrolling down from the hero', () => {
    renderHome();

    expect(document.body).toHaveClass('home-transparent-nav');
    expect(document.body).not.toHaveClass('home-nav-scrolled');

    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 48,
    });
    window.dispatchEvent(new Event('scroll'));

    expect(document.body).toHaveClass('home-nav-scrolled');

    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 0,
    });
    window.dispatchEvent(new Event('scroll'));

    expect(document.body).not.toHaveClass('home-nav-scrolled');
  });

  it('renders scenario content and keeps first-screen CTAs accessible immediately', () => {
    renderHome();

    expect(screen.getByRole('heading', { name: 'AI 数据标注，从任务到交付全链路提速' })).toBeInTheDocument();
    expect(screen.getAllByText('AI 贯穿标注生产').length).toBeGreaterThan(0);
    expect(screen.getAllByText('交付结果有迹可循').length).toBeGreaterThan(0);
    expect(screen.queryByText('模型评测')).not.toBeInTheDocument();
    expect(screen.queryByText(/内容风控/)).not.toBeInTheDocument();
    expect(screen.queryByText(/质量报告自动生成/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '查看更多' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI 辅助标注，不止在后台' })).toBeInTheDocument();
    expect(screen.getByText('AI 提供任务上下文和预审建议，标注者专注判断，审核者把关质量。每一次标注，都成为可复核的数据生产环节。')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI、多模态与追溯能力，共同构成 MarkUp 的标注生产力' })).toBeInTheDocument();
    expect(screen.queryByText('Product rhythm')).not.toBeInTheDocument();
    expect(screen.queryByText('任务怎样准备、流转、交付，一眼看清')).not.toBeInTheDocument();
    expect(screen.queryByText('Workflow tab')).not.toBeInTheDocument();

    expect(screen.getAllByRole('button', { name: /开始发布任务/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /浏览任务广场/ })).toHaveLength(2);
    expect(screen.getByRole('button', { name: /MarkUp AI/ })).toBeEnabled();
  });

  it('keeps command, scenario, and CTA content available with reduced motion', () => {
    mockReducedMotion(true);

    renderHome();

    const aiBar = screen.getByLabelText('MarkUp AI 对话展示条');
    expect(aiBar).toBeInTheDocument();
    expect(within(aiBar).queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI 数据标注，从任务到交付全链路提速' })).toBeInTheDocument();
    expect(screen.getByText('AI 给上下文')).toBeInTheDocument();
    expect(screen.getAllByText('从任务设计到预审复核').length).toBeGreaterThan(0);
    expect(screen.queryByText(/置顶|最新/)).not.toBeInTheDocument();
    expect(screen.getAllByText('AI 参与模板、发布和预审，不只停留在聊天入口').length).toBeGreaterThan(0);
    expect(screen.queryByText('Workflow tab')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /浏览任务广场/ })[0]).toBeEnabled();
  });

  it('opens registration from the primary CTA for anonymous users', async () => {
    const user = userEvent.setup();
    const { onOpenLogin } = renderHome();

    await user.click(screen.getAllByRole('button', { name: /开始发布任务/ })[0]);

    expect(onOpenLogin).toHaveBeenCalledWith('register');
  });

  it('navigates to task publishing when a session is present', async () => {
    const user = userEvent.setup();
    const { onOpenLogin } = renderHome(vi.fn(), enterpriseSession());

    await user.click(screen.getAllByRole('button', { name: /开始发布任务/ })[0]);

    expect(onOpenLogin).not.toHaveBeenCalled();
    expect(screen.getByTestId('location-path')).toHaveTextContent('/workspace?page=publish-task');
  });

  it('navigates visitors to the task square from the secondary CTA', async () => {
    const user = userEvent.setup();
    const { onOpenLogin } = renderHome();

    await user.click(screen.getAllByRole('button', { name: /浏览任务广场/ })[0]);

    expect(onOpenLogin).not.toHaveBeenCalled();
    expect(screen.getByTestId('location-path')).toHaveTextContent('/tasks');
  });
});
