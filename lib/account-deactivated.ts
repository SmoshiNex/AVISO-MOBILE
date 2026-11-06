import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';
import { clearRiderData } from '@/lib/local-db';

/** Sent by the server (RequireRiderRole) when an admin deactivated this rider. */
export const ACCOUNT_DEACTIVATED = 'account_deactivated';

let handling = false;

/**
 * An admin deactivated this account: sign the phone out the same way the
 * Log Out button does, and show the server's message on the login screen.
 * Several requests can fail at once (sync, polling), so it runs once.
 */
export async function handleAccountDeactivated(message: string): Promise<void> {
  if (handling) return;
  handling = true;

  try {
    await clearRiderData().catch(() => {});
    await Promise.all([
      SecureStore.deleteItemAsync('rider_token'),
      SecureStore.deleteItemAsync('rider_user'),
      SecureStore.deleteItemAsync('rider_code'),
    ]);
    router.replace('/(auth)/login');
    Toast.show({ type: 'error', text1: 'Account Deactivated', text2: message, visibilityTime: 6000 });
  } finally {
    handling = false;
  }
}
