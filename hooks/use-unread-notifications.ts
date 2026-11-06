import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { fetchUnreadCount } from '@/lib/notifications';

/** How often the bell's unread number is refreshed while its screen is open. */
const POLL_MS = 30_000;

/**
 * The unread number for the Home screen's bell. Refreshed when the screen is
 * focused, every 30 s while it stays focused and the app is in front, and when
 * the app comes back to the front. Offline: keeps the last number.
 */
export function useUnreadNotifications(): number {
  const [unread, setUnread] = useState(0);
  const focused = useRef(false);

  const refresh = useCallback(() => {
    fetchUnreadCount().then(setUnread).catch(() => undefined);
  }, []);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      refresh();
      const timer = setInterval(() => {
        if (AppState.currentState === 'active') refresh();
      }, POLL_MS);

      return () => {
        focused.current = false;
        clearInterval(timer);
      };
    }, [refresh]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && focused.current) refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return unread;
}
