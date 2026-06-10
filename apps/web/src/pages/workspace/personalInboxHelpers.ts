import type { NotificationListResponse, NotificationPayload } from '../../types/api';
import { formatApiDateTime } from '../../utils/dateTime';

export const inboxTypeLabels: Record<string, string> = {
  system: '系统公告',
  team: '企业通知',
  organization: '企业通知',
  task: '任务提醒',
  review: '审核提醒',
  export: '导出提醒',
  points: '积分提醒',
  security: '安全提醒',
};

export const inboxStatusLabels: Record<string, string> = {
  unread: '未读',
  read: '已读',
  handled: '已处理',
  deleted: '已删除',
  revoked: '已撤回',
  expired: '已过期',
};

export const inboxPriorityColors: Record<string, string> = {
  normal: 'default',
  important: 'orange',
  urgent: 'red',
};

export function formatInboxTime(value?: string | null): string {
  return formatApiDateTime(value);
}

export function inboxSummaryFromItems(items: NotificationPayload[]): NotificationListResponse['summary'] {
  return {
    total: items.length,
    unread: items.filter((item) => item.status === 'unread').length,
    starred: items.filter((item) => item.is_starred).length,
    organization: items.filter((item) => item.notification_type === 'organization' || item.notification_type === 'team').length,
    team: items.filter((item) => item.notification_type === 'organization' || item.notification_type === 'team').length,
    task: items.filter((item) => item.notification_type === 'task').length,
    review: items.filter((item) => item.notification_type === 'review').length,
    export: items.filter((item) => item.notification_type === 'export').length,
    points: items.filter((item) => item.notification_type === 'points').length,
    security: items.filter((item) => item.notification_type === 'security').length,
    system: items.filter((item) => item.notification_type === 'system').length,
  };
}

export function isHandleableInboxItem(item: NotificationPayload): boolean {
  return item.notification_type !== 'organization' && item.notification_type !== 'team' && !['revoked', 'expired', 'deleted'].includes(item.status);
}
