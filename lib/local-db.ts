import * as SQLite from 'expo-sqlite';
import type { LocalTrip, LocalHazardLog, LocalCrashEvent, LocalEmergencyContact, LocalRideEvent } from '@/types';
import { ROAD_HAZARD_TYPES } from '@/constants/hazards';

let db: SQLite.SQLiteDatabase | null = null;

const SCHEMA = `
    CREATE TABLE IF NOT EXISTS trips (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      remote_id     INTEGER,
      rider_code    TEXT NOT NULL,
      start_lat     REAL,
      start_lng     REAL,
      current_lat   REAL,
      current_lng   REAL,
      end_lat       REAL,
      end_lng       REAL,
      route_points  TEXT DEFAULT '[]',
      status        TEXT DEFAULT 'active',
      started_at    TEXT,
      ended_at      TEXT,
      total_hazards INTEGER DEFAULT 0,
      synced        INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS hazard_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      remote_id   INTEGER,
      trip_id     INTEGER,
      type        TEXT NOT NULL,
      confidence  REAL,
      distance    REAL,
      latitude    REAL NOT NULL,
      longitude   REAL NOT NULL,
      area        TEXT,
      detected_at TEXT NOT NULL,
      synced      INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS crash_events (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      latitude         REAL NOT NULL,
      longitude        REAL NOT NULL,
      last_hazard_type TEXT,
      triggered_at     TEXT NOT NULL,
      sms_sent         INTEGER DEFAULT 0,
      synced           INTEGER DEFAULT 0,
      attempts         INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ride_events (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      event_uid         TEXT NOT NULL UNIQUE,
      event_type        TEXT NOT NULL,
      latitude          REAL NOT NULL,
      longitude         REAL NOT NULL,
      acceleration_peak REAL NOT NULL,
      vertical_g        REAL,
      horizontal_g      REAL,
      gyro_peak_dps     REAL,
      tilt_deg          REAL,
      detected_at       TEXT NOT NULL,
      synced            INTEGER DEFAULT 0,
      attempts          INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS emergency_contacts (
      id             INTEGER PRIMARY KEY,
      name           TEXT NOT NULL,
      relationship   TEXT,
      contact_number TEXT NOT NULL,
      is_active      INTEGER DEFAULT 1
    );
`;

async function openAndCreate(): Promise<SQLite.SQLiteDatabase> {
  const handle = await SQLite.openDatabaseAsync('aviso.db');
  // Run WAL separately from DDL — a result-returning PRAGMA batched with
  // CREATE statements can fault the native layer on some Android builds.
  await handle.execAsync('PRAGMA journal_mode = WAL');
  await handle.execAsync(SCHEMA);
  await migrate(handle);
  return handle;
}

/**
 * Additive column migrations for devices that already created the tables —
 * `CREATE TABLE IF NOT EXISTS` never adds columns to an existing table, and
 * SQLite has no `ADD COLUMN IF NOT EXISTS`, so each ALTER is attempted and its
 * "duplicate column" error swallowed.
 */
async function migrate(handle: SQLite.SQLiteDatabase): Promise<void> {
  const additions = [
    `ALTER TABLE crash_events ADD COLUMN attempts INTEGER DEFAULT 0`,
    `ALTER TABLE crash_events ADD COLUMN event_uid TEXT`,
    // When the last GPS point of a trip was saved; ends a ride cut short by a crash at that time.
    `ALTER TABLE trips ADD COLUMN last_point_at TEXT`,
  ];

  for (const sql of additions) {
    try {
      await handle.execAsync(sql);
    } catch {
      // Column already present — nothing to do.
    }
  }
}

export async function initDb(): Promise<void> {
  if (db) return; // idempotent — guard against re-init on Fast Refresh
  try {
    db = await openAndCreate();
  } catch (err) {
    // The local DB is a cache (data re-syncs from the backend). If it is
    // corrupted or locked from a prior crash, reset it and recreate once.
    console.warn('[local-db] init failed, resetting database:', err);
    try {
      if (db) await db.closeAsync().catch(() => {});
      await SQLite.deleteDatabaseAsync('aviso.db');
    } catch {
      // ignore — deletion may fail if the file never existed
    }
    db = await openAndCreate();
  }
}

function getDb(): SQLite.SQLiteDatabase {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

// ─── TRIPS ───────────────────────────────────────────────────────────────────

export async function saveTrip(trip: Omit<LocalTrip, 'id'>): Promise<number> {
  const result = await getDb().runAsync(
    `INSERT INTO trips (remote_id, rider_code, start_lat, start_lng, current_lat, current_lng,
      route_points, status, started_at, total_hazards, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      trip.remote_id ?? null,
      trip.rider_code,
      trip.start_lat ?? null,
      trip.start_lng ?? null,
      trip.current_lat ?? null,
      trip.current_lng ?? null,
      JSON.stringify(trip.route_points ?? []),
      trip.status,
      trip.started_at,
      trip.total_hazards,
      trip.synced ? 1 : 0,
    ],
  );
  return result.lastInsertRowId;
}

export async function updateTripLocation(
  localId: number,
  lat: number,
  lng: number,
  routePoints: Array<{ lat: number; lng: number }>,
): Promise<void> {
  await getDb().runAsync(
    `UPDATE trips SET current_lat = ?, current_lng = ?, route_points = ? WHERE id = ?`,
    [lat, lng, JSON.stringify(routePoints), localId],
  );
}

/**
 * Adds one GPS point to a trip. Appends inside SQLite instead of rewriting the whole route,
 * so saving stays fast even on rides with thousands of points.
 */
export async function appendTripPoint(localId: number, lat: number, lng: number, at: string): Promise<void> {
  await getDb().runAsync(
    `UPDATE trips
        SET current_lat = ?, current_lng = ?, last_point_at = ?,
            route_points = json_insert(COALESCE(route_points, '[]'), '$[#]', json_object('lat', ?, 'lng', ?))
      WHERE id = ?`,
    [lat, lng, at, lat, lng, localId],
  );
}

/** Remembers the server's id for a trip so ending, location updates and detections can reference it. */
export async function setTripRemoteId(localId: number, remoteId: number): Promise<void> {
  await getDb().runAsync(`UPDATE trips SET remote_id = ? WHERE id = ?`, [remoteId, localId]);
}

export async function getTripByRemoteId(remoteId: number): Promise<LocalTrip | null> {
  const row = await getDb().getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM trips WHERE remote_id = ? LIMIT 1`,
    [remoteId],
  );
  return row ? rowToTrip(row) : null;
}

/** Ended rides whose start or end hasn't reached the server yet. */
export async function getUnsyncedEndedTrips(): Promise<LocalTrip[]> {
  const rows = await getDb().getAllAsync<Record<string, unknown>>(
    `SELECT * FROM trips WHERE status = 'ended' AND synced = 0 ORDER BY started_at`,
  );
  return rows.map(rowToTrip);
}

/**
 * Ends rides left "active" by an earlier app session (crash, force-close) at their last saved
 * point, so they appear in history and get synced instead of staying open forever.
 */
export async function closeStaleActiveTrips(sessionStartIso: string): Promise<number> {
  const result = await getDb().runAsync(
    `UPDATE trips
        SET status = 'ended',
            end_lat = current_lat,
            end_lng = current_lng,
            ended_at = COALESCE(last_point_at, started_at)
      WHERE status = 'active' AND started_at < ?`,
    [sessionStartIso],
  );
  return result.changes;
}

/** Updates a trip from the server's copy (download), keeping its local id so detections stay linked. */
export async function updateTripFromServer(
  localId: number,
  t: { route_points: { lat: number; lng: number }[]; end_lat?: number; end_lng?: number; ended_at?: string },
): Promise<void> {
  await getDb().runAsync(
    `UPDATE trips
        SET route_points = ?, end_lat = COALESCE(?, end_lat), end_lng = COALESCE(?, end_lng),
            ended_at = COALESCE(?, ended_at), status = CASE WHEN ? IS NOT NULL THEN 'ended' ELSE status END,
            synced = 1
      WHERE id = ?`,
    [
      JSON.stringify(t.route_points),
      t.end_lat ?? null,
      t.end_lng ?? null,
      t.ended_at ?? null,
      t.ended_at ?? null,
      localId,
    ],
  );
}

/** Trips by local id, for labelling detections with their ride. */
export async function getTripsByIds(ids: number[]): Promise<LocalTrip[]> {
  if (ids.length === 0) return [];
  const rows = await getDb().getAllAsync<Record<string, unknown>>(
    `SELECT * FROM trips WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids,
  );
  return rows.map(rowToTrip);
}

/** Detections per trip (local id → count); survives reinstalls, unlike the running total. */
export async function getTripHazardCounts(): Promise<Record<number, number>> {
  const rows = await getDb().getAllAsync<{ trip_id: number; n: number }>(
    `SELECT trip_id, COUNT(*) AS n FROM hazard_logs WHERE trip_id IS NOT NULL GROUP BY trip_id`,
  );
  return Object.fromEntries(rows.map((r) => [r.trip_id, r.n]));
}

export async function endTrip(
  localId: number,
  endLat: number,
  endLng: number,
  endedAt: string,
): Promise<void> {
  await getDb().runAsync(
    `UPDATE trips SET status = 'ended', end_lat = ?, end_lng = ?, ended_at = ? WHERE id = ?`,
    [endLat, endLng, endedAt, localId],
  );
}

export async function incrementTripHazards(localId: number): Promise<void> {
  await getDb().runAsync(
    `UPDATE trips SET total_hazards = total_hazards + 1 WHERE id = ?`,
    [localId],
  );
}

export async function getActiveTrip(): Promise<LocalTrip | null> {
  const row = await getDb().getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM trips WHERE status = 'active' ORDER BY started_at DESC LIMIT 1`,
  );
  return row ? rowToTrip(row) : null;
}

export async function getTrips(): Promise<LocalTrip[]> {
  const rows = await getDb().getAllAsync<Record<string, unknown>>(
    `SELECT * FROM trips WHERE status = 'ended' ORDER BY started_at DESC`,
  );
  return rows.map(rowToTrip);
}

export async function getTripById(id: number): Promise<LocalTrip | null> {
  const row = await getDb().getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM trips WHERE id = ?`,
    [id],
  );
  return row ? rowToTrip(row) : null;
}

export async function markTripSynced(localId: number, remoteId: number): Promise<void> {
  await getDb().runAsync(
    `UPDATE trips SET synced = 1, remote_id = ? WHERE id = ?`,
    [remoteId, localId],
  );
}

// ─── HAZARD LOGS ─────────────────────────────────────────────────────────────

export async function saveHazardLog(log: Omit<LocalHazardLog, 'id'>): Promise<number> {
  const result = await getDb().runAsync(
    `INSERT INTO hazard_logs (remote_id, trip_id, type, confidence, distance,
      latitude, longitude, area, detected_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      log.remote_id ?? null,
      log.trip_id ?? null,
      log.type,
      log.confidence,
      log.distance ?? null,
      log.latitude,
      log.longitude,
      log.area ?? null,
      log.detected_at,
      log.synced ? 1 : 0,
    ],
  );
  return result.lastInsertRowId;
}

export async function getHazardLogs(): Promise<LocalHazardLog[]> {
  const rows = await getDb().getAllAsync<Record<string, unknown>>(
    `SELECT * FROM hazard_logs ORDER BY detected_at DESC`,
  );
  return rows.map(rowToHazardLog);
}

export async function getHazardLogsForTrip(tripId: number): Promise<LocalHazardLog[]> {
  const rows = await getDb().getAllAsync<Record<string, unknown>>(
    `SELECT * FROM hazard_logs WHERE trip_id = ? ORDER BY detected_at ASC`,
    [tripId],
  );
  return rows.map(rowToHazardLog);
}

export async function getUnsyncedHazardLogs(): Promise<LocalHazardLog[]> {
  const rows = await getDb().getAllAsync<Record<string, unknown>>(
    `SELECT * FROM hazard_logs WHERE synced = 0 ORDER BY detected_at ASC`,
  );
  return rows.map(rowToHazardLog);
}

// Drops queued light/sign rows recorded before only road hazards were logged;
// the server rejects those types, so they would otherwise retry forever.
export async function deleteNonRoadHazardLogs(): Promise<void> {
  const placeholders = ROAD_HAZARD_TYPES.map(() => '?').join(', ');
  await getDb().runAsync(
    `DELETE FROM hazard_logs WHERE type NOT IN (${placeholders})`,
    [...ROAD_HAZARD_TYPES],
  );
}

// Removes all locally-synced records so pullFromBackend can replace them with
// authoritative backend data. Unsynced (pending) records are never touched.
export async function clearSyncedHazardLogs(): Promise<void> {
  await getDb().runAsync('DELETE FROM hazard_logs WHERE synced = 1');
}

export async function markHazardLogSynced(
  localId: number,
  remoteId: number,
  area?: string,
): Promise<void> {
  await getDb().runAsync(
    `UPDATE hazard_logs SET synced = 1, remote_id = ?, area = COALESCE(?, area) WHERE id = ?`,
    [remoteId, area ?? null, localId],
  );
}

export async function reconcileHazardLogSynced(
  detectedAt: string,
  type: string,
  remoteId: number,
): Promise<boolean> {
  // SUBSTR to 19 chars strips ms/µs differences:
  // local → "2026-06-22T05:18:00.123Z", backend → "2026-06-22T05:18:00.000000Z"
  const result = await getDb().runAsync(
    `UPDATE hazard_logs SET synced = 1, remote_id = ?
     WHERE synced = 0 AND type = ? AND SUBSTR(detected_at, 1, 19) = SUBSTR(?, 1, 19)`,
    [remoteId, type, detectedAt],
  );
  return result.changes > 0;
}

// ─── CRASH EVENTS ────────────────────────────────────────────────────────────

export async function saveCrashEvent(event: Omit<LocalCrashEvent, 'id'>): Promise<number> {
  const result = await getDb().runAsync(
    `INSERT INTO crash_events (latitude, longitude, last_hazard_type, triggered_at, sms_sent, synced, attempts, event_uid)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.latitude,
      event.longitude,
      event.last_hazard_type ?? null,
      event.triggered_at,
      event.sms_sent ? 1 : 0,
      event.synced ? 1 : 0,
      event.attempts,
      event.event_uid ?? null,
    ],
  );
  return result.lastInsertRowId;
}

/**
 * Crash events still awaiting backend delivery, oldest first. `maxAttempts`
 * excludes rows that have already exhausted the retry budget so a permanently
 * failing event stops being replayed forever.
 */
export async function getUnsyncedCrashEvents(maxAttempts: number): Promise<LocalCrashEvent[]> {
  const rows = await getDb().getAllAsync<Record<string, unknown>>(
    `SELECT * FROM crash_events
     WHERE synced = 0 AND attempts < ?
     ORDER BY triggered_at ASC`,
    [maxAttempts],
  );
  return rows.map(rowToCrashEvent);
}

export async function markCrashEventSynced(localId: number): Promise<void> {
  await getDb().runAsync(
    `UPDATE crash_events SET synced = 1 WHERE id = ?`,
    [localId],
  );
}

/** Records a failed delivery so the retry budget can run out. */
export async function incrementCrashEventAttempts(localId: number): Promise<void> {
  await getDb().runAsync(
    `UPDATE crash_events SET attempts = attempts + 1 WHERE id = ?`,
    [localId],
  );
}

/**
 * Retires an event that must never be retried again — a request the backend
 * rejected outright, or one too old to still be an emergency. The row is kept
 * as a local audit trail but taken out of the send queue.
 */
export async function abandonCrashEvent(localId: number, maxAttempts: number): Promise<void> {
  await getDb().runAsync(
    `UPDATE crash_events SET attempts = ? WHERE id = ?`,
    [maxAttempts, localId],
  );
}

// ─── EMERGENCY CONTACTS ──────────────────────────────────────────────────────

export async function upsertContact(contact: LocalEmergencyContact): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO emergency_contacts (id, name, relationship, contact_number, is_active)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       relationship = excluded.relationship,
       contact_number = excluded.contact_number`,
    [contact.id, contact.name, contact.relationship ?? null, contact.contact_number, contact.is_active ? 1 : 0],
  );
}

export async function getContacts(): Promise<LocalEmergencyContact[]> {
  const rows = await getDb().getAllAsync<Record<string, unknown>>(
    `SELECT * FROM emergency_contacts ORDER BY name ASC`,
  );
  return rows.map(rowToContact);
}

export async function getActiveContactNumbers(): Promise<string[]> {
  const rows = await getDb().getAllAsync<{ contact_number: string }>(
    `SELECT contact_number FROM emergency_contacts WHERE is_active = 1`,
  );
  return rows.map((r) => r.contact_number);
}

export async function setContactActive(id: number, isActive: boolean): Promise<void> {
  await getDb().runAsync(
    `UPDATE emergency_contacts SET is_active = ? WHERE id = ?`,
    [isActive ? 1 : 0, id],
  );
}

export async function deleteContact(id: number): Promise<void> {
  await getDb().runAsync(`DELETE FROM emergency_contacts WHERE id = ?`, [id]);
}

export async function getContactCount(): Promise<number> {
  const row = await getDb().getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM emergency_contacts WHERE is_active = 1`,
  );
  return row?.count ?? 0;
}

// ─── DASHBOARD STATS ─────────────────────────────────────────────────────────

export async function getDashboardStats(): Promise<{
  totalTrips: number;
  totalDetections: number;
  recentDetections: LocalHazardLog[];
  lastTrip: LocalTrip | null;
}> {
  const [tripsRow, detectionsRow, recentRows, lastTripRow] = await Promise.all([
    getDb().getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM trips WHERE status = 'ended'`,
    ),
    getDb().getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM hazard_logs`,
    ),
    getDb().getAllAsync<Record<string, unknown>>(
      `SELECT * FROM hazard_logs ORDER BY detected_at DESC LIMIT 3`,
    ),
    getDb().getFirstAsync<Record<string, unknown>>(
      `SELECT * FROM trips WHERE status = 'ended' ORDER BY ended_at DESC LIMIT 1`,
    ),
  ]);

  return {
    totalTrips: tripsRow?.count ?? 0,
    totalDetections: detectionsRow?.count ?? 0,
    recentDetections: recentRows.map(rowToHazardLog),
    lastTrip: lastTripRow ? rowToTrip(lastTripRow) : null,
  };
}

// ─── ROW MAPPERS ─────────────────────────────────────────────────────────────

function rowToTrip(r: Record<string, unknown>): LocalTrip {
  return {
    id: r.id as number,
    remote_id: (r.remote_id as number | null) ?? undefined,
    rider_code: r.rider_code as string,
    start_lat: r.start_lat as number | undefined,
    start_lng: r.start_lng as number | undefined,
    current_lat: r.current_lat as number | undefined,
    current_lng: r.current_lng as number | undefined,
    end_lat: r.end_lat as number | undefined,
    end_lng: r.end_lng as number | undefined,
    route_points: JSON.parse((r.route_points as string) ?? '[]'),
    last_point_at: (r.last_point_at as string | null) ?? undefined,
    status: r.status as 'active' | 'ended',
    started_at: r.started_at as string,
    ended_at: r.ended_at as string | undefined,
    total_hazards: r.total_hazards as number,
    synced: r.synced === 1,
  };
}

function rowToHazardLog(r: Record<string, unknown>): LocalHazardLog {
  return {
    id: r.id as number,
    remote_id: r.remote_id as number | undefined,
    trip_id: r.trip_id as number | undefined,
    type: r.type as string,
    confidence: r.confidence as number,
    distance: r.distance as number | undefined,
    latitude: r.latitude as number,
    longitude: r.longitude as number,
    area: r.area as string | undefined,
    detected_at: r.detected_at as string,
    synced: r.synced === 1,
  };
}

function rowToCrashEvent(r: Record<string, unknown>): LocalCrashEvent {
  return {
    id: r.id as number,
    latitude: r.latitude as number,
    longitude: r.longitude as number,
    last_hazard_type: r.last_hazard_type as string | undefined,
    triggered_at: r.triggered_at as string,
    sms_sent: r.sms_sent === 1,
    synced: r.synced === 1,
    attempts: (r.attempts as number | null) ?? 0,
    event_uid: (r.event_uid as string | null) ?? undefined,
  };
}

function rowToContact(r: Record<string, unknown>): LocalEmergencyContact {
  return {
    id: r.id as number,
    name: r.name as string,
    relationship: r.relationship as string | undefined,
    contact_number: r.contact_number as string,
    is_active: r.is_active === 1,
  };
}

// ─── RIDE EVENTS (IoT crash-detection log upload queue) ──────────────────────
// Every classification from the IoT unit is queued here first, so nothing is
// lost while the phone has no signal. sync-service uploads and then prunes.

export async function queueRideEvent(event: Omit<LocalRideEvent, 'id' | 'attempts'>): Promise<void> {
  await getDb().runAsync(
    `INSERT OR IGNORE INTO ride_events
       (event_uid, event_type, latitude, longitude, acceleration_peak, vertical_g, horizontal_g, gyro_peak_dps, tilt_deg, detected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.event_uid,
      event.event_type,
      event.latitude,
      event.longitude,
      event.acceleration_peak,
      event.vertical_g,
      event.horizontal_g,
      event.gyro_peak_dps,
      event.tilt_deg,
      event.detected_at,
    ],
  );
}

export async function getUnsyncedRideEvents(limit: number, maxAttempts: number): Promise<LocalRideEvent[]> {
  const rows = await getDb().getAllAsync<Record<string, unknown>>(
    `SELECT * FROM ride_events WHERE synced = 0 AND attempts < ? ORDER BY detected_at ASC LIMIT ?`,
    [maxAttempts, limit],
  );
  return rows.map((r) => ({
    id: r.id as number,
    event_uid: r.event_uid as string,
    event_type: r.event_type as LocalRideEvent['event_type'],
    latitude: r.latitude as number,
    longitude: r.longitude as number,
    acceleration_peak: r.acceleration_peak as number,
    vertical_g: (r.vertical_g as number | null) ?? null,
    horizontal_g: (r.horizontal_g as number | null) ?? null,
    gyro_peak_dps: (r.gyro_peak_dps as number | null) ?? null,
    tilt_deg: (r.tilt_deg as number | null) ?? null,
    detected_at: r.detected_at as string,
    attempts: (r.attempts as number | null) ?? 0,
  }));
}

export async function countPendingRideEvents(maxAttempts: number): Promise<number> {
  const row = await getDb().getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM ride_events WHERE synced = 0 AND attempts < ?`,
    [maxAttempts],
  );
  return row?.n ?? 0;
}

export async function markRideEventSynced(eventUid: string): Promise<void> {
  await getDb().runAsync(`UPDATE ride_events SET synced = 1 WHERE event_uid = ?`, [eventUid]);
}

export async function setRideEventAttempts(eventUid: string, attempts: number): Promise<void> {
  await getDb().runAsync(`UPDATE ride_events SET attempts = ? WHERE event_uid = ?`, [attempts, eventUid]);
}

/** Uploaded rows are kept on the server; drop the local copies. */
export async function pruneSyncedRideEvents(): Promise<void> {
  await getDb().runAsync(`DELETE FROM ride_events WHERE synced = 1`);
}
