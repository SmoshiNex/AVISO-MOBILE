import type { Href } from 'expo-router';
import { api } from '@/lib/api-client';
import type { RiderNotification, RiderNotificationCategory, RiderNotificationScreen } from '@/types';

export type NotificationsPage = {
  notifications: RiderNotification[];
  current_page: number;
  last_page: number;
  unread: number;
};

/** The Notifications screen (cast: typed routes list it after the next `expo start`). */
export const NOTIFICATIONS_SCREEN = '/(rider)/notifications' as Href;

/** Filter chips, in order. */
export const NOTIFICATION_CATEGORIES: { value: RiderNotificationCategory; label: string }[] = [
  { value: 'my_sos', label: 'My SOS' },
  { value: 'my_reports', label: 'My reports' },
  { value: 'my_hazards', label: 'My hazards' },
  { value: 'account', label: 'Account' },
];

/** The screen each notification link opens. The SOS screen is never one: it starts a countdown. */
export const NOTIFICATION_SCREENS: Record<RiderNotificationScreen, Href> = {
  'crash-logs': '/(rider)/crash-logs',
  map: '/(rider)/(tabs)/map',
  'hazard-logs': '/(rider)/hazard-logs',
  profile: '/(rider)/(tabs)/profile',
  'emergency-contacts': '/(rider)/emergency-contacts',
};

export function fetchNotifications(
  page: number,
  category: RiderNotificationCategory | null,
  unreadOnly: boolean,
): Promise<NotificationsPage> {
  const query = [`page=${page}`];
  if (category) query.push(`category=${category}`);
  if (unreadOnly) query.push('unread=1');
  return api.get<NotificationsPage>(`/rider/notifications?${query.join('&')}`);
}

export async function fetchUnreadCount(): Promise<number> {
  const res = await api.get<{ unread: number }>('/rider/notifications/unread-count');
  return res.unread;
}

export function markNotificationRead(id: string): Promise<unknown> {
  return api.post(`/rider/notifications/${id}/read`);
}

export function markAllNotificationsRead(): Promise<unknown> {
  return api.post('/rider/notifications/read-all');
}

const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA');

/** "Today", "Yesterday" or "Thu, Nov 5". */
export function dayLabel(iso: string): string {
  const key = dayKey(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (key === today.toLocaleDateString('en-CA')) return 'Today';
  if (key === yesterday.toLocaleDateString('en-CA')) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

/** One card: the notifications about the same thing on the same day, newest first. */
export type NotificationGroup = { key: string; day: string; items: RiderNotification[] };

export function groupNotifications(notifications: RiderNotification[]): NotificationGroup[] {
  const groups: NotificationGroup[] = [];

  for (const n of notifications) {
    const day = dayKey(n.created_at);
    const group = n.context_key
      ? groups.find((g) => g.day === day && g.items[0].context_key === n.context_key)
      : undefined;

    if (group) group.items.push(n);
    else groups.push({ key: n.id, day, items: [n] });
  }

  return groups;
}
