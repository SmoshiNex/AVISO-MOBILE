import * as Network from 'expo-network';
import * as SecureStore from 'expo-secure-store';
import { api } from './api-client';
import {
  saveTrip,
  endTrip,
  saveHazardLog,
  getUnsyncedHazardLogs,
  markHazardLogSynced,
  reconcileHazardLogSynced,
  clearSyncedHazardLogs,
  getUnsyncedCrashEvents,
  markCrashEventSynced,
  upsertContact,
} from './local-db';
import { resolveArea } from './area-resolver';

let syncInProgress = false;
let lastPullMs = 0;
const PULL_COOLDOWN_MS = 60_000;

/**
 * Normalizes a backend list response into an array. The rider API is not
 * uniform: `/rider/hazard-logs` returns a bare array, `/rider/trips` returns a
 * Laravel paginator (`{ data: [...] }`), and `/rider/emergency-contacts`
 * returns `{ contacts: [...] }`. Without this, a `for...of` over the raw
 * response throws "not iterable" and aborts the whole pull.
 */
function asArray(res: unknown, ...keys: string[]): any[] {
  if (Array.isArray(res)) return res;
  if (res && typeof res === 'object') {
    for (const key of keys) {
      const val = (res as Record<string, unknown>)[key];
      if (Array.isArray(val)) return val;
    }
  }
  return [];
}

export async function syncPendingData(): Promise<{ synced: number }> {
  if (syncInProgress) return { synced: 0 };

  const state = await Network.getNetworkStateAsync();
  if (state.isConnected !== true || state.isInternetReachable === false) return { synced: 0 };

  syncInProgress = true;
  let synced = 0;
  try {
    const [hazardCount] = await Promise.all([syncHazardLogs(), syncCrashEvents()]);
    synced = hazardCount;
  } finally {
    syncInProgress = false;
  }
  return { synced };
}

async function syncHazardLogs(): Promise<number> {
  const logs = await getUnsyncedHazardLogs();
  if (logs.length === 0) return 0;

  const riderCode = await SecureStore.getItemAsync('rider_code') ?? '';
  let count = 0;

  for (const log of logs) {
    try {
      const area = log.area ?? resolveArea(log.latitude, log.longitude);
      const response = await api.post('/rider/hazard-logs', {
        type: log.type,
        latitude: log.latitude,
        longitude: log.longitude,
        confidence: log.confidence,
        distance: log.distance ?? null,
        area,
        rider_code: riderCode,
        detected_at: log.detected_at,
      });

      const remoteId = (response as any)?.data?.id;
      if (remoteId) {
        await markHazardLogSynced(log.id, remoteId);
        count++;
      }
    } catch {
      // Network failure — leave unsynced, will retry on next call
    }
  }
  return count;
}

async function syncCrashEvents(): Promise<void> {
  const events = await getUnsyncedCrashEvents();
  if (events.length === 0) return;

  for (const event of events) {
    try {
      await api.post('/rider/emergency/sos', {
        latitude: event.latitude,
        longitude: event.longitude,
      });
      await markCrashEventSynced(event.id);
    } catch {
      // Leave unsynced so this event is retried on the next sync interval.
      // This is the deferred SkySMS path: an SOS raised while offline reaches
      // the backend here once connectivity returns, notifying contacts and
      // surfacing the alert on the admin dashboard.
    }
  }
}

/**
 * Pulls community hazard logs and rider's own trips from the backend into SQLite.
 * Rate-limited to once per 60 seconds for automatic calls.
 * Pass force=true from pull-to-refresh to always fetch regardless of cooldown.
 */
export async function pullFromBackend(force = false): Promise<void> {
  const state = await Network.getNetworkStateAsync();
  if (!state.isConnected) return;

  const now = Date.now();
  if (!force && now - lastPullMs < PULL_COOLDOWN_MS) return;

  // Each section is isolated so one failing endpoint (or an auth/network error
  // on a single request) cannot abort the others — a trips failure must never
  // prevent the rider's hazard logs from loading.
  let anySucceeded = false;

  // Pull rider's own completed trips (paginated response → `.data`)
  try {
    const trips = asArray(await api.get('/rider/trips'), 'data');
    for (const t of trips) {
      const routePoints = typeof t.route_points === 'string'
        ? JSON.parse(t.route_points)
        : (t.route_points ?? []);

      const localId = await saveTrip({
        remote_id:     t.id,
        rider_code:    t.rider_code,
        start_lat:     t.start_lat ? parseFloat(String(t.start_lat)) : 0,
        start_lng:     t.start_lng ? parseFloat(String(t.start_lng)) : 0,
        end_lat:       t.end_lat ? parseFloat(String(t.end_lat)) : undefined,
        end_lng:       t.end_lng ? parseFloat(String(t.end_lng)) : undefined,
        route_points:  routePoints,
        status:        'active',
        started_at:    t.started_at,
        total_hazards: 0,
        synced:        true,
      });

      if (t.ended_at) {
        await endTrip(
          localId,
          t.end_lat ? parseFloat(String(t.end_lat)) : 0,
          t.end_lng ? parseFloat(String(t.end_lng)) : 0,
          t.ended_at,
        );
      }
    }
    anySucceeded = true;
  } catch (err) {
    console.warn('[sync] pull trips failed:', err);
  }

  // Pull rider's own hazard logs (bare array response).
  // Clear all locally-synced records first so they are replaced with authoritative
  // backend data. Unsynced (pending upload) records are preserved and reconciled
  // against the backend list to mark them synced if the server already has them.
  try {
    const logs = asArray(await api.get('/rider/hazard-logs'), 'data');
    await clearSyncedHazardLogs();
    for (const log of logs) {
      const reconciled = await reconcileHazardLogSynced(log.detected_at, log.type, log.id);
      if (!reconciled) {
        await saveHazardLog({
          remote_id:   log.id,
          type:        log.type,
          confidence:  parseFloat(String(log.confidence)) / 100,
          distance:    log.distance ? parseFloat(String(log.distance)) : undefined,
          latitude:    parseFloat(String(log.latitude)),
          longitude:   parseFloat(String(log.longitude)),
          area:        log.area,
          detected_at: log.detected_at,
          synced:      true,
        });
      }
    }
    anySucceeded = true;
  } catch (err) {
    console.warn('[sync] pull hazard logs failed:', err);
  }

  // Pull emergency contacts so SOS can reach them even on fresh install
  // (response shape: `{ contacts: [...] }`).
  try {
    const contacts = asArray(await api.get('/rider/emergency-contacts'), 'contacts', 'data');
    for (const c of contacts) {
      await upsertContact({
        id: c.id,
        name: c.name,
        relationship: c.relationship ?? '',
        contact_number: c.contact_number,
        is_active: true,
      });
    }
    anySucceeded = true;
  } catch (err) {
    console.warn('[sync] pull emergency contacts failed:', err);
  }

  // Only stamp the cooldown once something actually pulled, so a fully failed
  // or unauthenticated attempt does not consume the window and block a later
  // real pull.
  if (anySucceeded) lastPullMs = now;
}

/**
 * Starts a background sync interval (call once after initDb()).
 * Returns a cleanup function to clear the interval.
 */
export function startSyncInterval(intervalMs = 30_000): () => void {
  const id = setInterval(() => {
    syncPendingData().catch(() => {});
  }, intervalMs);
  return () => clearInterval(id);
}
