import * as Network from 'expo-network';
import * as SecureStore from 'expo-secure-store';
import { api } from './api-client';
import {
  saveTrip,
  endTrip,
  getTripById,
  getTripByRemoteId,
  getUnsyncedEndedTrips,
  setTripRemoteId,
  markTripSynced,
  updateTripFromServer,
  saveHazardLog,
  getUnsyncedHazardLogs,
  deleteNonRoadHazardLogs,
  markHazardLogSynced,
  reconcileHazardLogSynced,
  clearSyncedHazardLogs,
  getUnsyncedCrashEvents,
  markCrashEventSynced,
  incrementCrashEventAttempts,
  abandonCrashEvent,
  upsertContact,
  getUnsyncedRideEvents,
  markRideEventSynced,
  setRideEventAttempts,
  pruneSyncedRideEvents,
} from './local-db';
import type { LocalRideEvent } from '@/types';

let syncInProgress = false;
let lastPullMs = 0;
const PULL_COOLDOWN_MS = 60_000;

/** Transient-failure budget for an undelivered SOS before it is retired. */
const MAX_SOS_SYNC_ATTEMPTS = 10;

/** Past this age a crash event is history, not an emergency to dispatch. */
const SOS_SYNC_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Transient-failure budget for a crash-detection log row before it is dropped. */
export const MAX_RIDE_EVENT_ATTEMPTS = 20;
/** Upload at most this many queued log rows per sync run. */
const RIDE_EVENT_BATCH = 100;

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
    // Trips first, so detections can be linked to a trip the server already knows.
    await syncTrips();
    const [hazardCount] = await Promise.all([syncHazardLogs(), syncCrashEvents(), syncRideEvents()]);
    synced = hazardCount;
  } finally {
    syncInProgress = false;
  }
  return { synced };
}

/**
 * Uploads one queued crash-detection log row.
 * 'ok'    = the server has it (stored now or before: it dedupes on event_uid)
 * 'retry' = no connection / server busy, try again later
 * 'drop'  = rejected for good, retrying cannot help
 */
export async function uploadRideEvent(
  event: Omit<LocalRideEvent, 'id' | 'attempts'>,
): Promise<'ok' | 'retry' | 'drop'> {
  try {
    await api.post('/rider/events', {
      event_uid: event.event_uid,
      event_type: event.event_type,
      latitude: event.latitude,
      longitude: event.longitude,
      acceleration_peak: event.acceleration_peak,
      vertical_g: event.vertical_g,
      horizontal_g: event.horizontal_g,
      gyro_peak_dps: event.gyro_peak_dps,
      tilt_deg: event.tilt_deg,
      detected_at: event.detected_at,
    });
    await markRideEventSynced(event.event_uid);
    return 'ok';
  } catch (err) {
    const status = (err as { status?: number }).status;
    // A rejected row (validation) will never succeed: stop retrying it.
    // 429 (rate limit) is transient and is retried later.
    if (status !== undefined && status >= 400 && status < 500 && status !== 429) {
      await setRideEventAttempts(event.event_uid, MAX_RIDE_EVENT_ATTEMPTS);
      return 'drop';
    }
    return 'retry';
  }
}

/** Uploads crash-detection log rows recorded while the phone was offline. */
async function syncRideEvents(): Promise<void> {
  const events = await getUnsyncedRideEvents(RIDE_EVENT_BATCH, MAX_RIDE_EVENT_ATTEMPTS);
  for (const event of events) {
    const result = await uploadRideEvent(event);
    if (result === 'retry') {
      await setRideEventAttempts(event.event_uid, event.attempts + 1);
    }
  }
  await pruneSyncedRideEvents();
}

/** HTTP statuses where retrying can never succeed (bad data, not ours, gone): stop retrying. */
const isPermanentFailure = (err: unknown): boolean => {
  const status = (err as { status?: number })?.status;
  return status === 403 || status === 404 || status === 422;
};

/**
 * Delivers ended rides whose start or end never reached the server (no signal, app closed
 * before the server answered). Creates the trip if needed, then ends it with the phone's real
 * times and full route.
 */
async function syncTrips(): Promise<void> {
  const trips = await getUnsyncedEndedTrips();
  for (const trip of trips) {
    try {
      let remoteId = trip.remote_id;
      if (!remoteId) {
        const response = await api.post<{ data?: { id?: number }; id?: number }>('/rider/trips', {
          latitude: trip.start_lat,
          longitude: trip.start_lng,
          started_at: trip.started_at,
        });
        remoteId = response?.data?.id ?? response?.id;
        if (!remoteId) continue;
        await setTripRemoteId(trip.id, remoteId);
      }

      await api.put(`/rider/trips/${remoteId}/end`, {
        latitude: trip.end_lat ?? trip.current_lat ?? trip.start_lat,
        longitude: trip.end_lng ?? trip.current_lng ?? trip.start_lng,
        ended_at: trip.ended_at,
        route_points: trip.route_points,
      });
      await markTripSynced(trip.id, remoteId);
    } catch (err) {
      // Already ended on the server, too old, or not this rider's: nothing left to deliver.
      if (isPermanentFailure(err)) await markTripSynced(trip.id, trip.remote_id ?? 0);
      // Otherwise (network): stay unsynced, retry on the next run.
    }
  }
}

/** Server id of the ride a detection was saved on, if that ride has reached the server. */
async function remoteTripId(localTripId?: number): Promise<number | null> {
  if (!localTripId) return null;
  const trip = await getTripById(localTripId);
  return trip?.remote_id ?? null;
}

async function syncHazardLogs(): Promise<number> {
  await deleteNonRoadHazardLogs();
  const logs = await getUnsyncedHazardLogs();
  if (logs.length === 0) return 0;

  const riderCode = await SecureStore.getItemAsync('rider_code') ?? '';
  let count = 0;

  for (const log of logs) {
    try {
      const response = await api.post('/rider/hazard-logs', {
        type: log.type,
        latitude: log.latitude,
        longitude: log.longitude,
        confidence: log.confidence,
        distance: log.distance ?? null,
        rider_code: riderCode,
        detected_at: log.detected_at,
        trip_id: await remoteTripId(log.trip_id),
      });

      const remoteId = (response as any)?.data?.id;
      if (remoteId) {
        // Store the barangay the server resolved from the GPS point.
        await markHazardLogSynced(log.id, remoteId, (response as any)?.data?.area);
        count++;
      }
    } catch {
      // Network failure — leave unsynced, will retry on next call
    }
  }
  return count;
}

/**
 * Delivers SOS events that never reached the backend — the deferred SkySMS
 * path, so an SOS raised while offline still notifies contacts and reaches the
 * admin dashboard once connectivity returns.
 *
 * The queue is deliberately bounded. An unbounded version re-POSTed a stuck
 * event every 30 seconds for the life of the install, and because the backend
 * used to de-duplicate only against *pending* alerts, every replay that landed
 * after an admin resolved the alert raised a brand-new one. Three independent
 * stopping conditions now apply: client errors are never retried, attempts are
 * capped, and events older than a day are retired.
 */
async function syncCrashEvents(): Promise<void> {
  const events = await getUnsyncedCrashEvents(MAX_SOS_SYNC_ATTEMPTS);
  if (events.length === 0) return;

  for (const event of events) {
    // Too old to still be an emergency worth dispatching.
    if (Date.now() - new Date(event.triggered_at).getTime() > SOS_SYNC_MAX_AGE_MS) {
      await abandonCrashEvent(event.id, MAX_SOS_SYNC_ATTEMPTS);
      continue;
    }

    try {
      await api.post('/rider/emergency/sos', {
        latitude: event.latitude,
        longitude: event.longitude,
        // The incident's identity — lets the backend recognise a replay of an
        // alert it has already recorded instead of creating a duplicate.
        triggered_at: event.triggered_at,
        ...(event.event_uid && { event_uid: event.event_uid }),
      });
      await markCrashEventSynced(event.id);
    } catch (err) {
      const status = (err as { status?: number }).status;

      // A rejected request (expired token, validation failure) will never
      // succeed by repeating it. Retire the event rather than loop forever.
      if (status !== undefined && status >= 400 && status < 500) {
        console.warn('[sync-service] SOS rejected by backend, abandoning', status);
        await abandonCrashEvent(event.id, MAX_SOS_SYNC_ATTEMPTS);
        continue;
      }

      // Transient failure — spend one attempt and try again next interval.
      await incrementCrashEventAttempts(event.id);
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

      // Already on the phone (recorded here, or downloaded before): update it instead of duplicating.
      const existing = await getTripByRemoteId(t.id);
      if (existing) {
        await updateTripFromServer(existing.id, {
          route_points: routePoints.length >= existing.route_points.length ? routePoints : existing.route_points,
          end_lat: t.end_lat ? parseFloat(String(t.end_lat)) : undefined,
          end_lng: t.end_lng ? parseFloat(String(t.end_lng)) : undefined,
          ended_at: t.ended_at ?? undefined,
        });
        continue;
      }

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
        // The server links detections to its trip id; translate it to this phone's trip.
        const localTrip = log.trip_id ? await getTripByRemoteId(log.trip_id) : null;
        await saveHazardLog({
          remote_id:   log.id,
          trip_id:     localTrip?.id,
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
