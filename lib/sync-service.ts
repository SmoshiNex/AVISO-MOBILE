import * as Network from 'expo-network';
import * as SecureStore from 'expo-secure-store';
import { api } from './api-client';
import {
  saveTrip,
  endTrip,
  saveHazardLog,
  getUnsyncedHazardLogs,
  markHazardLogSynced,
  getUnsyncedCrashEvents,
  markCrashEventSynced,
  upsertContact,
} from './local-db';
import { resolveArea } from './area-resolver';

let syncInProgress = false;
let lastPullMs = 0;
const PULL_COOLDOWN_MS = 60_000;

export async function syncPendingData(): Promise<void> {
  if (syncInProgress) return;

  const state = await Network.getNetworkStateAsync();
  if (!state.isConnected || !state.isInternetReachable) return;

  syncInProgress = true;
  try {
    await Promise.all([syncHazardLogs(), syncCrashEvents()]);
  } finally {
    syncInProgress = false;
  }
}

async function syncHazardLogs(): Promise<void> {
  const logs = await getUnsyncedHazardLogs();
  if (logs.length === 0) return;

  const riderCode = await SecureStore.getItemAsync('rider_code') ?? '';

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

      if (response?.id) {
        await markHazardLogSynced(log.id, response.id);
      }
    } catch {
      // Network failure — leave unsynced, will retry on next call
    }
  }
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
      // Fire-and-forget — mark it anyway to avoid spamming the endpoint
      // The SMS was already sent, so admin visibility is best-effort
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
  lastPullMs = now;

  try {
    // Pull rider's own completed trips
    const trips: any[] = await api.get('/rider/trips');
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

    // Pull community hazard logs (all riders — for the area hazard map)
    const logs: any[] = await api.get('/rider/hazard-logs');
    for (const log of logs) {
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
    // Pull emergency contacts so SOS can reach them even on fresh install
    const contacts: any[] = await api.get('/rider/emergency-contacts');
    for (const c of contacts) {
      await upsertContact({
        id: c.id,
        name: c.name,
        relationship: c.relationship ?? '',
        contact_number: c.contact_number,
        is_active: true,
      });
    }
  } catch {
    // Offline or not yet authenticated — silently skip
  }
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
