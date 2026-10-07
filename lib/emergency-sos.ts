import * as SMS from 'expo-sms';
import { getActiveContactNumbers, saveCrashEvent, markCrashEventSynced } from './local-db';
import { api } from './api-client';

export type SOSPayload = {
  latitude: number;
  longitude: number;
  lastHazardType?: string;
  /** Crash id from the IoT unit when the SOS started from a unit crash. */
  eventUid?: string;
};

/**
 * Sends an emergency SOS. Order of operations is deliberate:
 *
 * 1. Persist the crash event to SQLite immediately (offline-safe audit trail).
 * 2. PRIMARY — POST /rider/emergency/sos. The backend notifies every emergency
 *    contact via the SkySMS gateway automatically, with zero user interaction.
 *    This is the path an auto-triggered countdown depends on: `expo-sms` can
 *    only OPEN the native composer and requires a manual "Send" tap, which is
 *    useless when the rider is incapacitated after a crash.
 * 3. FALLBACK — only if the backend is unreachable (offline / network error),
 *    open the native SMS composer so a conscious rider can still send manually.
 *    The crash event stays unsynced so background sync re-POSTs (and SkySMS
 *    sends) once connectivity returns.
 */
export async function sendEmergencyAlert(payload: SOSPayload): Promise<boolean> {
  const { latitude, longitude, lastHazardType, eventUid } = payload;
  const triggeredAt = new Date().toISOString();

  // Step 1 — persist locally before anything else
  const crashEventId = await saveCrashEvent({
    latitude,
    longitude,
    last_hazard_type: lastHazardType,
    triggered_at: triggeredAt,
    sms_sent: false,
    synced: false,
    attempts: 0,
    event_uid: eventUid,
  });

  // Step 2 — PRIMARY: backend dispatches real SMS automatically via SkySMS.
  // `triggered_at` is the incident's identity: if this request succeeds but its
  // response is lost, the retry in sync-service re-sends the same timestamp and
  // the backend recognises it instead of raising a second alert.
  try {
    await api.post('/rider/emergency/sos', {
      latitude,
      longitude,
      triggered_at: triggeredAt,
      // Lets the server merge this with the unit's own backup report.
      ...(eventUid && { event_uid: eventUid }),
    });
    await markCrashEventSynced(crashEventId);
    return true; // SMS dispatched server-side — no composer needed.
  } catch (err) {
    // Offline or backend unreachable — fall through to the device composer.
    // Leave the crash event unsynced so background sync retries the backend
    // (and SkySMS) when the connection is restored.
    console.warn('[emergency-sos] backend SOS failed — falling back to device SMS', err);
  }

  // Step 3 — FALLBACK: open the native SMS composer for a manual send.
  const contactNumbers = await getActiveContactNumbers();
  if (contactNumbers.length === 0) return false;

  const available = await SMS.isAvailableAsync();
  if (!available) return false;

  const message =
    `AVISO EMERGENCY ALERT\n` +
    `A rider may need help.\n` +
    `GPS: ${latitude}, ${longitude}\n` +
    `(Search these coordinates in Google Maps)\n` +
    (lastHazardType ? `Last detected hazard: ${lastHazardType}\n` : '') +
    `Time: ${new Date(triggeredAt).toLocaleString('en-PH')}\n\n` +
    `Emergency Hotlines (Zamboanga City):\n` +
    `ZCDRRMO: 995-9601 / 990-1171\n` +
    `EOC: 0966-731-6242\n` +
    `Rescue: 0926-091-2492\n` +
    `EMS: 926-1848\n` +
    `Fire: 991-2267`;

  await SMS.sendSMSAsync(contactNumbers, message);
  return false; // the server was not reached
}

/**
 * Whether an SOS can be delivered right now — either the backend is the primary
 * path (assumed reachable) or, offline, the device can open the SMS composer
 * for at least one active contact.
 */
export async function canSendSOS(): Promise<boolean> {
  const [smsAvailable, contactNumbers] = await Promise.all([
    SMS.isAvailableAsync(),
    getActiveContactNumbers(),
  ]);
  return smsAvailable && contactNumbers.length > 0;
}
