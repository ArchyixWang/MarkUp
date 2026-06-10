import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthSession } from '../../stores/authStore';
import { persistSession } from '../../stores/authStore';
import { OnboardingPage } from './OnboardingPage';

const pendingSession: AuthSession = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  user: {
    user_id: 'user-1',
    username: 'newuser',
    display_name: '新用户展示名',
    email: 'newuser@example.com',
    role: 'pending',
    permissions: [],
    email_verified: true,
  },
};

function onboardingResponse(role: string) {
  return {
    code: 0,
    message: '完成账号设置',
    data: {
      access_token: `${role}-token`,
      refresh_token: `${role}-refresh`,
      expires_in: 1800,
      token_type: 'Bearer',
      user: { ...pendingSession.user, role },
    },
    request_id: 'req-onboarding',
    timestamp: '2026-05-27T00:00:00Z',
  };
}

function renderAuthenticatedPage(path = '/onboarding', onComplete = vi.fn()) {
  persistSession({
    access_token: pendingSession.accessToken,
    refresh_token: pendingSession.refreshToken,
    expires_in: 1800,
    token_type: 'Bearer',
    user: pendingSession.user,
  });

  render(
    <MemoryRouter initialEntries={[path]}>
      <OnboardingPage session={pendingSession} onComplete={onComplete} />
    </MemoryRouter>,
  );

  return onComplete;
}

describe('OnboardingPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a public invite continuation state for logged-out users', async () => {
    const onOpenAuth = vi.fn();

    render(
      <MemoryRouter initialEntries={['/onboarding?organization_action=join&invite_code=TM-INV-123']}>
        <OnboardingPage onOpenAuth={onOpenAuth} inviteEntryPath="/onboarding?organization_action=join&invite_code=TM-INV-123" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: '通过企业邀请码加入' })).toBeInTheDocument();
    expect(screen.getAllByText('TM-INV-123')).toHaveLength(2);
    expect(screen.getByText('MarkUp 引导')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: '登录后加入' }));
    expect(onOpenAuth).toHaveBeenCalledWith('login', '/onboarding?organization_action=join&invite_code=TM-INV-123');
  });

  it('uses display_name in the authenticated header', () => {
    renderAuthenticatedPage();

    expect(screen.getByText('新用户展示名')).toBeInTheDocument();
    expect(screen.queryByText('newuser@example.com')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '完成账号初始化' })).toBeInTheDocument();
    expect(screen.getByText('选择身份').closest('li')).toHaveClass('is-current');
    expect(screen.getByText('补充资料').closest('li')).not.toHaveClass('is-current');
    expect(screen.getByText('进入工作台').closest('li')).not.toHaveClass('is-current');
  });

  it('completes labeler onboarding and updates stored session', async () => {
    const user = userEvent.setup();
    const onComplete = renderAuthenticatedPage();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(onboardingResponse('labeler')), { status: 200 }));

    await user.click(screen.getByRole('button', { name: /我是标注员/ }));
    expect(screen.getByRole('heading', { name: '完善标注员资料' })).toBeInTheDocument();
    expect(screen.getByText('选择身份').closest('li')).toHaveClass('is-done');
    expect(screen.getByText('补充资料').closest('li')).toHaveClass('is-current');
    expect(screen.getByText('进入工作台').closest('li')).not.toHaveClass('is-current');
    await user.clear(screen.getByLabelText('经验说明'));
    await user.type(screen.getByLabelText('经验说明'), '两年文本标注经验');
    await user.click(screen.getByRole('button', { name: '完成并进入工作台' }));

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ user: expect.objectContaining({ role: 'labeler' }) }));
    expect(JSON.parse(window.localStorage.getItem('markup_user') || '{}')).toMatchObject({ role: 'labeler' });
    expect(fetch).toHaveBeenCalledWith('/api/v1/auth/onboarding/complete', expect.objectContaining({
      body: JSON.stringify({
        identity: 'labeler',
        labeler_profile: {
          domains: '文本分类, 图像标注',
          qualification: '无需资质',
          task_types: '文本 / 图像',
          experience: '两年文本标注经验',
        },
      }),
    }));
  });

  it('registers a new organization as admin in local onboarding state', async () => {
    const user = userEvent.setup();
    const onComplete = renderAuthenticatedPage();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(onboardingResponse('admin')), { status: 200 }));

    await user.click(screen.getByRole('button', { name: /我是需求方/ }));
    expect(screen.getByRole('heading', { name: '连接你的企业工作空间' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /登记新公司 \/ 企业/ }));
    expect(screen.getByRole('heading', { name: '创建企业空间' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('公司 / 企业名称'), '示例科技');
    await user.type(screen.getByLabelText('行业领域'), 'AI 数据服务');
    await user.clear(screen.getByLabelText('联系人姓名'));
    await user.type(screen.getByLabelText('联系人姓名'), '李四');
    await user.type(screen.getByLabelText('联系电话'), '13800000000');
    await user.type(screen.getByLabelText('业务说明'), '需要发布文本和图像标注任务');
    await user.click(screen.getByRole('button', { name: '完成企业登记' }));

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ user: expect.objectContaining({ role: 'admin' }) }));
    expect(fetch).toHaveBeenCalledWith('/api/v1/auth/onboarding/complete', expect.objectContaining({
      body: expect.stringContaining('"company_name":"示例科技"'),
    }));
  });

  it('auto-enters join organization flow from invite query params', async () => {
    const user = userEvent.setup();
    const onComplete = renderAuthenticatedPage('/onboarding?organization_action=join&invite_code=MKP-TEAM-2026');
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(onboardingResponse('owner')), { status: 200 }));

    expect(screen.getByDisplayValue('MKP-TEAM-2026')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '加入并进入工作台' }));

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ user: expect.objectContaining({ role: 'owner' }) }));
    expect(fetch).toHaveBeenCalledWith('/api/v1/auth/onboarding/complete', expect.objectContaining({
      body: JSON.stringify({ identity: 'requester', organization_action: 'join', invite_code: 'MKP-TEAM-2026' }),
    }));
  });
});
