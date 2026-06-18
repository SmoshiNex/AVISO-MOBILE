import * as Network from 'expo-network';
import * as SecureStore from 'expo-secure-store';
import { api } from './api-client';
import {
  getUnsyncedHazardLogs,
  markHazardLogSynced,
  getUnsyncedCrashEvents,
  markCrashEventSynced,
} from './local-db';
import { resolveArea } from './area-resolver';

let syncInProgress = false;

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
 * Starts a background sync interval (call once after initDb()).
 * Returns a cleanup function to clear the interval.
 */
export function startSyncInterval(intervalMs = 30_000): () => void {
  const id = setInterval(() => {
    syncPendingData().catch(() => {});
  }, intervalMs);
  return () => clearInterval(id);
}
