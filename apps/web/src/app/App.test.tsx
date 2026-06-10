import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { authenticatedApiRequest } from '../services/apiClient';
import { persistSession } from '../stores/authStore';

const labelerPayload = {
  access_token: 'labeler-access',
  refresh_token: 'labeler-refresh',
  expires_in: 1800,
  token_type: 'Bearer',
  user: {
    user_id: 'labeler-1',
    username: 'labeler01',
    display_name: '标注员一号',
    email: 'labeler@example.com',
    role: 'labeler',
    email_verified: true,
    permissions: ['label:read', 'label:write'],
  },
};

const ownerPayload = {
  access_token: 'owner-access',
  refresh_token: 'owner-refresh',
  expires_in: 1800,
  token_type: 'Bearer',
  user: {
    user_id: 'owner-1',
    username: 'owner01',
    display_name: '需求方一号',
    email: 'owner@example.com',
    role: 'owner',
    email_verified: true,
    permissions: ['team:create', 'team:manage'],
  },
};

const pendingPayload = {
  access_token: 'pending-access',
  refresh_token: 'pending-refresh',
  expires_in: 1800,
  token_type: 'Bearer',
  user: {
    user_id: 'pending-1',
    username: 'pending01',
    display_name: '待分流用户',
    email: 'pending@example.com',
    role: 'pending',
    email_verified: true,
    permissions: [],
  },
};

const platformAdminPayload = {
  access_token: 'platform-access',
  refresh_token: 'platform-refresh',
  expires_in: 1800,
  token_type: 'Bearer',
  user: {
    user_id: 'platform-1',
    username: 'platformadmin',
    display_name: '平台管理员',
    email: 'platform.admin@example.com',
    role: 'platform_admin',
    email_verified: true,
    permissions: ['platform:manage', 'certification:review'],
  },
};

const platformWorkbenchPayload = {
  summary: {
    total_commission_points: 0,
    month_commission_points: 0,
    pending_payment_count: 0,
    pending_payment_points: 0,
    pending_team_verifications: 0,
    pending_certifications: 0,
  },
  commission_setting: {
    commission_rate_bps: 1000,
    commission_rate_percent: 10,
    unit_hint: '积分',
  },
  settlement_trend: [],
  recent_settlements: [],
  pending_payments: [],
  unit_hint: '积分',
};

function apiResponse(data: unknown) {
  return new Response(
    JSON.stringify({
      code: 0,
      message: 'success',
      data,
      request_id: 'req',
      timestamp: '2026-05-29T00:00:00Z',
    }),
    { status: 200 },
  );
}

function apiErrorResponse(status: number, code: number, message: string) {
  return new Response(
    JSON.stringify({
      code,
      message,
      detail: null,
      request_id: 'req-error',
      timestamp: '2026-05-29T00:00:00Z',
    }),
    { status },
  );
}

describe('App auth session coordination', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('redirects to workspace home after a non-pending login succeeds', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValueOnce(apiResponse(labelerPayload));

    render(<App />);

    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: /登\s*录/ }));
    const authPanel = await screen.findByLabelText('认证面板');
    await user.type(within(authPanel).getByLabelText('邮箱或登录账号'), 'labeler@example.com');
    await user.type(within(authPanel).getByLabelText('密码'), 'SecurePass123!');
    await user.click(within(authPanel).getByRole('checkbox', { name: /我已阅读并同意/ }));
    await user.click(within(authPanel).getByRole('button', { name: '登录' }));

    await waitFor(() => expect(window.location.pathname).toBe('/workspace'));
    await waitFor(() => expect(screen.queryByLabelText('认证面板')).not.toBeInTheDocument());
  });

  it('leaves the workspace and reopens login when an authenticated request invalidates the session', async () => {
    persistSession(ownerPayload);
    window.history.replaceState({}, '', '/workspace');

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 40102,
        message: 'Token已过期',
        detail: null,
        request_id: 'req-expired',
        timestamp: '2026-05-29T00:00:00Z',
      }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 40101,
        message: '请先登录',
        detail: null,
        request_id: 'req-refresh',
        timestamp: '2026-05-29T00:00:00Z',
      }), { status: 401 }));

    render(<App />);

    await act(async () => {
      await expect(authenticatedApiRequest('/profile/me')).rejects.toMatchObject({ code: 40101 });
    });

    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(await screen.findByLabelText('认证面板')).toBeInTheDocument();
    expect(window.localStorage.getItem('markup_access_token')).toBeNull();
    expect(window.localStorage.getItem('markup_refresh_token')).toBeNull();
  });

  it('routes pending users to onboarding from the workspace entry', async () => {
    const user = userEvent.setup();
    persistSession(pendingPayload);

    render(<App />);

    await user.click(screen.getByRole('button', { name: '工作台' }));

    await waitFor(() => expect(window.location.pathname).toBe('/onboarding'));
    expect(await screen.findByRole('heading', { name: '选择你在 MarkUp 中的工作方式' })).toBeInTheDocument();
  });

  it('redirects non-pending users away from onboarding back to workspace', async () => {
    persistSession(labelerPayload);
    window.history.replaceState({}, '', '/onboarding');

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/workspace'));
  });

  it('redirects platform admins away from workspace to the platform workbench', async () => {
    persistSession(platformAdminPayload);
    window.history.replaceState({}, '', '/workspace');
    vi.mocked(fetch).mockResolvedValue(apiResponse(platformWorkbenchPayload));

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/platform'));
    expect(await screen.findByRole('heading', { name: '经营总览' })).toBeInTheDocument();
  });

  it('replaces invalid workspace page query with the user default page', async () => {
    persistSession(ownerPayload);
    window.history.replaceState({}, '', '/workspace?page=not-real');
    vi.mocked(fetch).mockResolvedValue(apiResponse(null));

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/workspace'));
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('renders oauth callback on top of the home page and opens the auth overlay', async () => {
    window.history.replaceState({}, '', '/oauth/callback?ticket=oauth-ticket&provider=github');
    vi.mocked(fetch).mockResolvedValueOnce(apiResponse({
      needs_account_link: true,
      provider: 'github',
      suggested_username: 'github-user',
      suggested_email: 'github-user@example.com',
      email_verified_by_provider: true,
      has_matching_user: false,
      bind_ticket: 'oauth-bind-ticket',
    }));

    render(<App />);

    expect(await screen.findByLabelText('认证面板')).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: '绑定已有账号' })).toBeInTheDocument();
  });

  it('completes bind-current-user callbacks without opening the oauth login overlay', async () => {
    persistSession(ownerPayload);
    window.history.replaceState({}, '', '/oauth/callback?ticket=oauth-ticket&provider=github&intent=bind_current_user&redirect_after_login=%2Fworkspace%3Fpage%3Daccount');
    vi.mocked(fetch).mockImplementation((input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname + input.search : String(input.url);
      if (url === '/api/v1/auth/oauth/link-current-user') {
        return Promise.resolve(apiResponse({
          provider: 'github',
          linked: true,
          identity: {
            provider: 'github',
            provider_user_id: 'gh-1',
            provider_username: 'owner-gh',
          },
        }));
      }
      if (url === '/api/v1/profile/me') {
        return Promise.resolve(apiResponse({
          user: { ...ownerPayload.user, status: 'active' },
          profile: {
            display_name: ownerPayload.user.display_name,
            real_name: '',
            phone: '',
            profession: '',
            location: '',
            bio: '',
          },
        }));
      }
      if (url === '/api/v1/auth/oauth/identities') {
        return Promise.resolve(apiResponse({ items: [] }));
      }
      if (url === '/api/v1/teams/admin/overview') {
        return Promise.resolve(apiResponse({ teams: [], default_team_id: null, team_count: 0, notifications: [] }));
      }
      return Promise.resolve(apiResponse(null));
    });

    render(<App />);

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/v1/auth/oauth/link-current-user',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ ticket: 'oauth-ticket' }),
        headers: expect.objectContaining({ Authorization: 'Bearer owner-access' }),
      }),
    ));
    await waitFor(() => expect(window.location.pathname).toBe('/workspace'));
    await waitFor(() => expect(window.location.search).toBe('?page=account'));
    expect(screen.queryByLabelText('认证面板')).not.toBeInTheDocument();
  });

  it('refreshes expired access tokens before completing bind-current-user callbacks', async () => {
    persistSession(ownerPayload);
    window.history.replaceState({}, '', '/oauth/callback?ticket=oauth-ticket&provider=github&intent=bind_current_user&redirect_after_login=%2Fworkspace%3Fpage%3Daccount');
    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname + input.search : String(input.url);
      const authorization = new Headers(init?.headers).get('Authorization');

      if (url === '/api/v1/auth/oauth/link-current-user' && authorization === 'Bearer owner-access') {
        return Promise.resolve(apiErrorResponse(401, 40102, 'Token expired'));
      }
      if (url === '/api/v1/auth/refresh') {
        return Promise.resolve(apiResponse({
          ...ownerPayload,
          access_token: 'owner-access-refreshed',
          refresh_token: 'owner-refresh-refreshed',
        }));
      }
      if (url === '/api/v1/auth/oauth/link-current-user' && authorization === 'Bearer owner-access-refreshed') {
        return Promise.resolve(apiResponse({
          provider: 'github',
          linked: true,
          identity: {
            provider: 'github',
            provider_user_id: 'gh-1',
            provider_username: 'owner-gh',
          },
        }));
      }
      return Promise.resolve(apiResponse(null));
    });

    render(<App />);

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/v1/auth/refresh',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ refresh_token: 'owner-refresh' }),
      }),
    ));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/v1/auth/oauth/link-current-user',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ ticket: 'oauth-ticket' }),
        headers: expect.objectContaining({ Authorization: 'Bearer owner-access-refreshed' }),
      }),
    ));
    await waitFor(() => expect(window.location.pathname).toBe('/workspace'));
    await waitFor(() => expect(window.location.search).toBe('?page=account'));
    expect(window.localStorage.getItem('markup_access_token')).toBe('owner-access-refreshed');
    expect(window.localStorage.getItem('markup_refresh_token')).toBe('owner-refresh-refreshed');
  });

  it('returns to login when bind-current-user token refresh fails', async () => {
    persistSession(ownerPayload);
    window.history.replaceState({}, '', '/oauth/callback?ticket=oauth-ticket&provider=github&intent=bind_current_user&redirect_after_login=%2Fworkspace%3Fpage%3Daccount');
    vi.mocked(fetch).mockImplementation((input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname + input.search : String(input.url);
      if (url === '/api/v1/auth/oauth/link-current-user') {
        return Promise.resolve(apiErrorResponse(401, 40102, 'Token expired'));
      }
      if (url === '/api/v1/auth/refresh') {
        return Promise.resolve(apiErrorResponse(401, 40101, 'Please log in'));
      }
      return Promise.resolve(apiResponse(null));
    });

    render(<App />);

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/v1/auth/refresh',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ refresh_token: 'owner-refresh' }),
      }),
    ));
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(window.sessionStorage.getItem('markup_auth_return_to')).toBe('/workspace?page=account');
    expect(window.localStorage.getItem('markup_access_token')).toBeNull();
    expect(window.localStorage.getItem('markup_refresh_token')).toBeNull();
  });

  it('returns to account page on bind-current-user conflicts without opening the oauth login overlay', async () => {
    persistSession(ownerPayload);
    window.history.replaceState({}, '', '/oauth/callback?ticket=oauth-ticket&provider=github&intent=bind_current_user&redirect_after_login=%2Fworkspace%3Fpage%3Daccount');
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 40901,
          message: '当前账号已绑定该平台的其他第三方账号',
          detail: null,
          request_id: 'req-conflict',
          timestamp: '2026-05-31T00:00:00Z',
        }),
        { status: 409 },
      ),
    );

    render(<App />);

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/v1/auth/oauth/link-current-user',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ ticket: 'oauth-ticket' }),
        headers: expect.objectContaining({ Authorization: 'Bearer owner-access' }),
      }),
    ));
    await waitFor(() => expect(window.location.pathname).toBe('/workspace'));
    await waitFor(() => expect(window.location.search).toBe('?page=account'));
    expect(screen.queryByLabelText('认证面板')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('markup_access_token')).toBe('owner-access');
  });

  it('keeps invite continuation for logged-out users and restores the join flow after login', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/onboarding?organization_action=join&invite_code=TM-INV-123');
    vi.mocked(fetch).mockResolvedValueOnce(apiResponse(pendingPayload));

    render(<App />);

    expect(await screen.findByRole('heading', { name: '通过企业邀请码加入' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '登录后加入' }));

    expect(window.sessionStorage.getItem('markup_auth_return_to')).toBe('/onboarding?organization_action=join&invite_code=TM-INV-123');

    const authPanel = await screen.findByLabelText('认证面板');
    await user.type(within(authPanel).getByLabelText('邮箱或登录账号'), 'pending@example.com');
    await user.type(within(authPanel).getByLabelText('密码'), 'SecurePass123!');
    await user.click(within(authPanel).getByRole('checkbox', { name: /我已阅读并同意/ }));
    await user.click(within(authPanel).getByRole('button', { name: '登录' }));

    await waitFor(() => expect(window.location.pathname).toBe('/onboarding'));
    await waitFor(() => expect(window.location.search).toBe('?organization_action=join&invite_code=TM-INV-123'));
    expect(await screen.findByDisplayValue('TM-INV-123')).toBeInTheDocument();
  });

  it('keeps assigned task share links as the login return target for logged-out users', async () => {
    window.history.replaceState({}, '', '/tasks/assigned/ASSIGN-123');
    vi.mocked(fetch).mockResolvedValue(apiResponse(null));

    render(<App />);

    expect(await screen.findByLabelText('认证面板')).toBeInTheDocument();
    expect(window.sessionStorage.getItem('markup_auth_return_to')).toBe('/tasks/assigned/ASSIGN-123');
    expect(window.location.pathname).toBe('/');
  });

  it('uses the workspace loading primitive while validating assigned task links', async () => {
    persistSession(labelerPayload);
    window.history.replaceState({}, '', '/tasks/assigned/ASSIGN-123');
    vi.mocked(fetch).mockImplementation(() => new Promise<Response>(() => undefined));

    render(<App />);

    expect(await screen.findByRole('status', { name: '正在校验指派链接' })).toBeInTheDocument();
  });

  it('uses an inline alert when an assigned task link is invalid', async () => {
    persistSession(labelerPayload);
    window.history.replaceState({}, '', '/tasks/assigned/EXPIRED');
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 40401,
          message: '指派链接无效或已过期',
          detail: null,
          request_id: 'req-assigned',
          timestamp: '2026-06-07T00:00:00Z',
        }),
        { status: 404 },
      ),
    );

    render(<App />);

    const errorTitle = await screen.findByText('指派链接无效或已过期');
    expect(errorTitle.closest('[role="alert"]')).toBeInTheDocument();
  });
});
