import { beforeEach, describe, expect, it, vi } from 'vitest';
import { persistSession } from '../stores/authStore';
import { checkTaskQualification, claimTaskBundle } from './taskService';

const user = {
  user_id: 'labeler-1',
  username: 'labeler',
  email: 'labeler@example.com',
  role: 'labeler',
  email_verified: true,
  permissions: ['label:read', 'submission:submit'],
};

function envelope<T>(data: T) {
  return {
    code: 0,
    message: 'ok',
    data,
    request_id: 'req-ok',
    timestamp: '2026-06-10T00:00:00Z',
  };
}

describe('taskService', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    persistSession({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 1800,
      token_type: 'Bearer',
      user,
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('sends team context when checking and claiming enterprise flow tasks', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(envelope({
        task_id: 'task-1',
        eligible: true,
        qualification_required: 'none',
        checks: [],
        failed_checks: [],
        summary: 'ok',
      })), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(envelope({
        task_id: 'task-1',
        bundle_size: 50,
        claimed_items: 50,
        remaining_items: 0,
      })), { status: 200 }));

    await checkTaskQualification('task-1', 'team-1');
    await claimTaskBundle('task-1', 50, false, 'team-1');

    const checkHeaders = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers);
    const claimHeaders = new Headers(vi.mocked(fetch).mock.calls[1][1]?.headers);
    expect(checkHeaders.get('X-Team-ID')).toBe('team-1');
    expect(checkHeaders.get('Authorization')).toBe('Bearer access-token');
    expect(claimHeaders.get('X-Team-ID')).toBe('team-1');
    expect(claimHeaders.get('Authorization')).toBe('Bearer access-token');
    expect(vi.mocked(fetch).mock.calls[1][1]?.body).toBe(JSON.stringify({ bundle_size: 50, agreement_accepted: false }));
  });
});
