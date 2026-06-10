import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logoutCurrentSession, revokeOtherSessions } from './authService';
import { persistSession } from '../stores/authStore';

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
    timestamp: '2026-05-30T00:00:00Z',
  };
}

describe('authService session-sensitive requests', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retries revoke-other-sessions with the rotated refresh token after access refresh', async () => {
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

    await expect(revokeOtherSessions()).resolves.toEqual({ revoked_count: 2, kept_current_session: true });

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/v1/auth/sessions/revoke-others', expect.objectContaining({
      body: JSON.stringify({ refresh_token: 'old-refresh' }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/v1/auth/sessions/revoke-others', expect.objectContaining({
      body: JSON.stringify({ refresh_token: 'new-refresh' }),
    }));
  });

  it('retries logout with the rotated refresh token after access refresh', async () => {
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
      .mockResolvedValueOnce(new Response(JSON.stringify(envelope(null)), { status: 200 }));

    await expect(logoutCurrentSession()).resolves.toBeNull();

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/v1/auth/logout', expect.objectContaining({
      body: JSON.stringify({ refresh_token: 'old-refresh' }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/v1/auth/logout', expect.objectContaining({
      body: JSON.stringify({ refresh_token: 'new-refresh' }),
    }));
  });
});
