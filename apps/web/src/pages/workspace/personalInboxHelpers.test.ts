import { describe, expect, it } from 'vitest';
import { inboxStatusLabels, inboxSummaryFromItems, isHandleableInboxItem } from './personalInboxHelpers';
import type { NotificationPayload } from '../../types/api';

const baseNotice: NotificationPayload = {
  notification_id: 'notice-1',
  team_id: 'team-1',
  title: '通知',
  content: '通知内容',
  notification_type: 'review',
  priority: 'important',
  target_type: 'member',
  target_roles: [],
  target_user_ids: ['user-1'],
  status: 'unread',
  is_read: false,
  is_handled: false,
  is_starred: false,
  is_deleted: false,
  read_count: 0,
  handled_count: 0,
  email_enabled: false,
  in_app_enabled: true,
  created_at: '2026-06-07T10:00:00Z',
};

describe('personalInboxHelpers', () => {
  it('treats expired notifications as expired instead of unread or handleable', () => {
    const expiredNotice = {
      ...baseNotice,
      notification_id: 'notice-expired',
      status: 'expired',
      is_read: false,
      expire_at: '2026-06-06T10:00:00Z',
    };

    expect(inboxStatusLabels.expired).toBe('已过期');
    expect(inboxSummaryFromItems([expiredNotice]).unread).toBe(0);
    expect(isHandleableInboxItem(expiredNotice)).toBe(false);
  });
});
