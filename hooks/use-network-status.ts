import { useState, useEffect, useRef } from 'react';
import Toast from 'react-native-toast-message';
import { syncPendingData } from '@/lib/sync-service';

const BACKEND_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/$/, '');
const HEALTH_ENDPOINT = `${BACKEND_URL}/up`;

/**
 * Polls the actual backend health endpoint every 4 seconds.
 * - On offline → online: fires an immediate sync + success toast
 * - On online → offline: fires an error toast
 * - On cold start: sets state silently with no toast
 *
 * Uses a real HTTP ping to the Laravel /up route instead of
 * expo-network's isInternetReachable (which checks external
 * servers and returns false on LAN-only networks).
 */
export function useNetworkStatus(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState(true);
  const wasOnlineRef = useRef(true);
  const initialCheckDone = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      let online = false;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(HEALTH_ENDPOINT, {
          method: 'GET',
          signal: controller.signal,
        });
        clearTimeout(timeout);
        online = res.ok;
      } catch {
        online = false;
      }

      if (cancelled) return;

      const wasOnline = wasOnlineRef.current;

      if (!initialCheckDone.current) {
        initialCheckDone.current = true;
        wasOnlineRef.current = online;
        setIsOnline(online);
        return;
      }

      if (!wasOnline && online) {
        Toast.show({
          type: 'info',
          text1: 'Back online',
          text2: 'Syncing pending detections…',
          visibilityTime: 3000,
        });
        try {
          const { synced } = await syncPendingData();
          Toast.show({
            type: 'success',
            text1: 'Synced ✓',
            text2: synced > 0 ? `${synced} detection(s) uploaded` : 'All up to date',
            visibilityTime: 3000,
          });
        } catch {
          // DB not ready or backend unreachable — batch interval will retry
        }
      } else if (wasOnline && !online) {
        Toast.show({
          type: 'error',
          text1: "You're offline",
          text2: 'Detections will sync when reconnected',
          visibilityTime: 4000,
        });
      }

      wasOnlineRef.current = online;
      setIsOnline(online);
    };

    check();
    const id = setInterval(check, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return { isOnline };
}

