import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';
import * as SecureStore from 'expo-secure-store';
import Toast from 'react-native-toast-message';

/** Don't ask the update server more often than this when the app comes back to the front. */
const CHECK_INTERVAL_MS = 5 * 60_000;
const LAST_UPDATE_ID_KEY = 'last_update_id';

export type AppUpdateStatus = 'idle' | 'downloading' | 'ready';

/**
 * Over-the-air updates (EAS Update): checks when the app opens and when it
 * returns from the background, downloads a new update in the background
 * ("Downloading AVISO update…"), then reports it as ready to apply. A ready
 * update that isn't applied now is used automatically on the next app start.
 * Does nothing in development builds and Expo Go.
 */
export function useAppUpdates() {
  const [status, setStatus] = useState<AppUpdateStatus>('idle');
  const lastCheckAt = useRef(0);
  const busy = useRef(false);

  const check = useCallback(async () => {
    if (!Updates.isEnabled || __DEV__) return;
    if (busy.current || Date.now() - lastCheckAt.current < CHECK_INTERVAL_MS) return;
    busy.current = true;
    lastCheckAt.current = Date.now();
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) return;

      setStatus('downloading');
      Toast.show({ type: 'info', text1: 'Downloading AVISO update…', text2: 'You can keep using the app.' });
      const fetched = await Updates.fetchUpdateAsync();
      setStatus(fetched.isNew ? 'ready' : 'idle');
    } catch {
      // No internet or server unreachable: try again at the next check.
      setStatus((current) => (current === 'downloading' ? 'idle' : current));
    } finally {
      busy.current = false;
    }
  }, []);

  // After a restart into a new update, say so once.
  useEffect(() => {
    if (!Updates.isEnabled || __DEV__) return;
    const currentId = Updates.updateId;
    (async () => {
      try {
        const lastId = await SecureStore.getItemAsync(LAST_UPDATE_ID_KEY);
        if (currentId && lastId !== currentId) {
          if (lastId !== null) Toast.show({ type: 'success', text1: 'AVISO updated ✓' });
          await SecureStore.setItemAsync(LAST_UPDATE_ID_KEY, currentId);
        }
      } catch {
        // Only a notice; ignore storage errors.
      }
    })();
  }, []);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  const restart = useCallback(() => {
    Updates.reloadAsync().catch(() => {
      // If reloading fails the update still applies on the next app start.
    });
  }, []);

  return { status, restart };
}
