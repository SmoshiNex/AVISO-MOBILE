import * as SMS from 'expo-sms';
import { getActiveContactNumbers, saveCrashEvent } from './local-db';
import { api } from './api-client';

export type SOSPayload = {
  latitude: number;
  longitude: number;
  lastHazardType?: string;
};

/**
 * Sends an emergency SOS. Order of operations is strict:
 * 1. Save crash event to SQLite immediately (offline-safe)
 * 2. Read active contacts from SQLite (never waits for network)
 * 3. Send SMS directly from phone
 * 4. POST /emergency/sos to backend (fire-and-forget — never blocks SMS)
 */
export async function sendEmergencyAlert(payload: SOSPayload): Promise<void> {
  const { latitude, longitude, lastHazardType } = payload;
  const triggeredAt = new Date().toISOString();

  // Step 1 — persist locally before anything else
  await saveCrashEvent({
    latitude,
    longitude,
    last_hazard_type: lastHazardType,
    triggered_at: triggeredAt,
    sms_sent: false,
    synced: false,
  });

  // Step 2 — read contacts from local SQLite (zero network dependency)
  const contactNumbers = await getActiveContactNumbers();

  // Step 3 — send SMS directly from the device
  if (contactNumbers.length > 0) {
    const available = await SMS.isAvailableAsync();
    if (available) {
      const mapsUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
      const message =
        `AVISO EMERGENCY ALERT\n` +
        `A rider may need help.\n` +
        `Last known location:\n${mapsUrl}\n` +
        (lastHazardType ? `Last detected hazard: ${lastHazardType}\n` : '') +
        `Time: ${new Date(triggeredAt).toLocaleString('en-PH')}`;

      await SMS.sendSMSAsync(contactNumbers, message);
    }
  }

  // Step 4 — fire-and-forget backend log (never blocks or delays SMS above)
  api.post('/rider/emergency/sos', { latitude, longitude }).catch(() => {
    // Sync service will retry from crash_events table
  });
}

/**
 * Checks whether the device can send SMS and at least one active contact exists.
 */
export async function canSendSOS(): Promise<boolean> {
  const [smsAvailable, contactNumbers] = await Promise.all([
    SMS.isAvailableAsync(),
    getActiveContactNumbers(),
  ]);
  return smsAvailable && contactNumbers.length > 0;
}
