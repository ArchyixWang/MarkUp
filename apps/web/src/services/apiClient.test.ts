import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticatedApiRequest } from './apiClient';
import { persistSession } from '../stores/authStore';
import { getConnectivityStatus, markDisconnected, resetConnectivityStatusForTests } from './connectivityStatus';

const user = {
  user_id: 'u1',
  username: 'owner',
  display_name: 'Owner',
  email: 'owner@example.com',
  role: 'owner',
  permissions: ['team:manage'],
};

function envelope<T>(data: T) {
  return {
    code: 0,
    message: 'ok',
    data,
    request_id: 'req-ok',
    timestamp: '2026-05-28T00:00:00Z',
  };
}

describe('apiClient authenticated requests', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
    resetConnectivityStatusForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetConnectivityStatusForTests();
  });

  it('refreshes an expired access token and retries the original request once', async () => {
    persistSession({
      access_token: 'old-access',
      refresh_token: 'old-refresh',
      expires_in: 1800,
      token_type: 'Bearer',
      user,
    });

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 40102,
        message: 'Token已过期',
        detail: null,
        request_id: 'req-expired',
        timestamp: '2026-05-28T00:00:00Z',
      }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(envelope({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 1800,
        token_type: 'Bearer',
        user,
      })), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(envelope({ ok: true })), { status: 200 }));

    await expect(authenticatedApiRequest('/profile/me')).resolves.toEqual({ ok: true });

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenNthCalledWith(1, '/api/v1/profile/me', expect.objectContaining({
      headers: expect.any(Object),
    }));
    const initialHeaders = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers);
    expect(initialHeaders.get('Authorization')).toBe('Bearer old-access');
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/v1/auth/refresh', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ refresh_token: 'old-refresh' }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/v1/profile/me', expect.objectContaining({
      headers: expect.any(Object),
    }));
    const retryHeaders = new Headers(vi.mocked(fetch).mock.calls[2][1]?.headers);
    expect(retryHeaders.get('Authorization')).toBe('Bearer new-access');
    expect(window.localStorage.getItem('markup_access_token')).toBe('new-access');
    expect(window.localStorage.getItem('markup_refresh_token')).toBe('new-refresh');
    expect(getConnectivityStatus()).toBe('connected');
  });

  it('preserves Headers instance values when adding the bearer token', async () => {
    persistSession({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 1800,
      token_type: 'Bearer',
      user,
    });

    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(envelope({ ok: true })), { status: 200 }));

    const headers = new Headers({ 'X-Team-ID': 'team-1' });
    await expect(authenticatedApiRequest('/teams/team-1/dashboard', { headers })).resolves.toEqual({ ok: true });

    const sentHeaders = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers);
    expect(sentHeaders.get('X-Team-ID')).toBe('team-1');
    expect(sentHeaders.get('Authorization')).toBe('Bearer access-token');
  });

  it('does not force a JSON content type for FormData authenticated API requests', async () => {
    persistSession({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 1800,
      token_type: 'Bearer',
      user,
    });

    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(envelope({ ok: true })), { status: 200 }));

    const body = new FormData();
    body.append('file', new File(['avatar'], 'avatar.png', { type: 'image/png' }));

    await expect(authenticatedApiRequest('/uploads', { method: 'POST', body })).resolves.toEqual({ ok: true });

    const sentHeaders = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers);
    expect(sentHeaders.get('Authorization')).toBe('Bearer access-token');
    expect(sentHeaders.get('Content-Type')).toBeNull();
  });

  it('notifies session listeners after automatic refresh updates the stored session', async () => {
    persistSession({
      access_token: 'old-access',
      refresh_token: 'old-refresh',
      expires_in: 1800,
      token_type: 'Bearer',
      user,
    });
    const onSessionUpdated = vi.fn();
    window.addEventListener('markup:session-updated', onSessionUpdated);

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 40102,
        message: 'token expired',
        detail: null,
        request_id: 'req-expired',
        timestamp: '2026-05-31T00:00:00Z',
      }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(envelope({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 1800,
        token_type: 'Bearer',
        user: {
          ...user,
          permissions: ['team:read'],
        },
      })), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(envelope({ ok: true })), { status: 200 }));

    await expect(authenticatedApiRequest('/profile/me')).resolves.toEqual({ ok: true });

    expect(window.localStorage.getItem('markup_access_token')).toBe('new-access');
    expect(onSessionUpdated).toHaveBeenCalledTimes(1);
    window.removeEventListener('markup:session-updated', onSessionUpdated);
  });

  it('rebuilds the request body with the latest refresh token after an automatic refresh', async () => {
    persistSession({
      access_token: 'old-access',
      refresh_token: 'old-refresh',
      expires_in: 1800,
      token_type: 'Bearer',
      user,
    });

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 40102,
        message: 'Token已过期',
        detail: null,
        request_id: 'req-expired',
        timestamp: '2026-05-30T00:00:00Z',
      }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(envelope({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 1800,
        token_type: 'Bearer',
        user,
      })), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(envelope({ revoked_count: 2, kept_current_session: true })), { status: 200 }));

    await expect(
      authenticatedApiRequest('/auth/sessions/revoke-others', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: 'old-refresh' }),
        rebuildAfterRefresh: (session) => ({
          method: 'POST',
          body: JSON.stringify({ refresh_token: session.refreshToken }),
        }),
      }),
    ).resolves.toEqual({ revoked_count: 2, kept_current_session: true });

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/v1/auth/sessions/revoke-others', expect.objectContaining({
      body: JSON.stringify({ refresh_token: 'old-refresh' }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/v1/auth/refresh', expect.objectContaining({
      body: JSON.stringify({ refresh_token: 'old-refresh' }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/v1/auth/sessions/revoke-others', expect.objectContaining({
      body: JSON.stringify({ refresh_token: 'new-refresh' }),
    }));
    const retryHeaders = new Headers(vi.mocked(fetch).mock.calls[2][1]?.headers);
    expect(retryHeaders.get('Authorization')).toBe('Bearer new-access');
    expect(retryHeaders.get('Content-Type')).toBe('application/json');
  });

  it('can skip global invalidation when a caller handles logout cleanup locally', async () => {
    persistSession({
      access_token: 'expired-access',
      refresh_token: 'current-refresh',
      expires_in: 1800,
      token_type: 'Bearer',
      user,
    });

    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      code: 40101,
      message: '请先登录',
      detail: null,
      request_id: 'req-auth-required',
      timestamp: '2026-05-30T00:00:00Z',
    }), { status: 401 }));

    await expect(authenticatedApiRequest('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: 'current-refresh' }),
      invalidateOnAuthFailure: false,
      invalidateOnRefreshFailure: false,
    })).rejects.toMatchObject({ code: 40101 });

    expect(window.localStorage.getItem('markup_access_token')).toBe('expired-access');
    expect(window.localStorage.getItem('markup_refresh_token')).toBe('current-refresh');
  });

  it('clears stored sessions when refresh fails', async () => {
    persistSession({
      access_token: 'old-access',
      refresh_token: 'old-refresh',
      expires_in: 1800,
      token_type: 'Bearer',
      user,
    });

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 40102,
        message: 'Token已过期',
        detail: null,
        request_id: 'req-expired',
        timestamp: '2026-05-28T00:00:00Z',
      }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 40101,
        message: '请先登录',
        detail: null,
        request_id: 'req-refresh',
        timestamp: '2026-05-28T00:00:00Z',
      }), { status: 401 }));

    await expect(authenticatedApiRequest('/profile/me')).rejects.toMatchObject({ code: 40101 });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(window.localStorage.getItem('markup_access_token')).toBeNull();
    expect(window.localStorage.getItem('markup_refresh_token')).toBeNull();
  });

  it('marks connectivity as disconnected when the refresh request fails on the network', async () => {
    persistSession({
      access_token: 'old-access',
      refresh_token: 'old-refresh',
      expires_in: 1800,
      token_type: 'Bearer',
      user,
    });

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 40102,
        message: 'Token已过期',
        detail: null,
        request_id: 'req-expired',
        timestamp: '2026-05-31T00:00:00Z',
      }), { status: 401 }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(authenticatedApiRequest('/profile/me')).rejects.toMatchObject({ code: 40102 });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(getConnectivityStatus()).toBe('disconnected');
    expect(window.localStorage.getItem('markup_access_token')).toBeNull();
    expect(window.localStorage.getItem('markup_refresh_token')).toBeNull();
  });

  it('clears stored sessions when request is unauthorized without a refresh attempt', async () => {
    persistSession({
      access_token: 'old-access',
      refresh_token: 'old-refresh',
      expires_in: 1800,
      token_type: 'Bearer',
      user,
    });

    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      code: 40101,
      message: '请先登录',
      detail: null,
      request_id: 'req-auth-required',
      timestamp: '2026-05-29T00:00:00Z',
    }), { status: 401 }));

    await expect(authenticatedApiRequest('/profile/me')).rejects.toMatchObject({ code: 40101 });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('markup_access_token')).toBeNull();
    expect(window.localStorage.getItem('markup_refresh_token')).toBeNull();
  });

  it('marks connectivity as disconnected on server errors', async () => {
    persistSession({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 1800,
      token_type: 'Bearer',
      user,
    });

    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      code: 50001,
      message: '服务异常',
      detail: null,
      request_id: 'req-500',
      timestamp: '2026-05-30T00:00:00Z',
    }), { status: 500 }));

    await expect(authenticatedApiRequest('/profile/me')).rejects.toMatchObject({ code: 50001 });
    expect(getConnectivityStatus()).toBe('disconnected');
  });

  it('does not mark connectivity as disconnected on 4xx business errors', async () => {
    persistSession({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 1800,
      token_type: 'Bearer',
      user,
    });

    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      code: 42201,
      message: '答案校验未通过',
      detail: { field_errors: [] },
      request_id: 'req-422',
      timestamp: '2026-05-30T00:00:00Z',
    }), { status: 422 }));

    await expect(authenticatedApiRequest('/profile/me')).rejects.toMatchObject({ code: 42201 });
    expect(getConnectivityStatus()).toBe('connected');
  });

  it('marks connectivity as disconnected on network failures and recovers on the next success', async () => {
    persistSession({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 1800,
      token_type: 'Bearer',
      user,
    });

    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(JSON.stringify(envelope({ ok: true })), { status: 200 }));

    await expect(authenticatedApiRequest('/profile/me')).rejects.toThrow('Failed to fetch');
    expect(getConnectivityStatus()).toBe('disconnected');

    await expect(authenticatedApiRequest('/profile/me')).resolves.toEqual({ ok: true });
    expect(getConnectivityStatus()).toBe('connected');
  });

  it('recovers connectivity after a previous disconnected state when a later request succeeds', async () => {
    persistSession({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 1800,
      token_type: 'Bearer',
      user,
    });
    markDisconnected();

    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(envelope({ ok: true })), { status: 200 }));

    await expect(authenticatedApiRequest('/profile/me')).resolves.toEqual({ ok: true });
    expect(getConnectivityStatus()).toBe('connected');
  });
});
