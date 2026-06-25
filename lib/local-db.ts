import * as SQLite from 'expo-sqlite';
import type { LocalTrip, LocalHazardLog, LocalCrashEvent, LocalEmergencyContact } from '@/types';

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
      synced           INTEGER DEFAULT 0
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
  return handle;
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

export async function markHazardLogSynced(localId: number, remoteId: number): Promise<void> {
  await getDb().runAsync(
    `UPDATE hazard_logs SET synced = 1, remote_id = ? WHERE id = ?`,
    [remoteId, localId],
  );
}

// ─── CRASH EVENTS ────────────────────────────────────────────────────────────

export async function saveCrashEvent(event: Omit<LocalCrashEvent, 'id'>): Promise<number> {
  const result = await getDb().runAsync(
    `INSERT INTO crash_events (latitude, longitude, last_hazard_type, triggered_at, sms_sent, synced)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      event.latitude,
      event.longitude,
      event.last_hazard_type ?? null,
      event.triggered_at,
      event.sms_sent ? 1 : 0,
      event.synced ? 1 : 0,
    ],
  );
  return result.lastInsertRowId;
}

export async function getUnsyncedCrashEvents(): Promise<LocalCrashEvent[]> {
  const rows = await getDb().getAllAsync<Record<string, unknown>>(
    `SELECT * FROM crash_events WHERE synced = 0 ORDER BY triggered_at ASC`,
  );
  return rows.map(rowToCrashEvent);
}

export async function markCrashEventSynced(localId: number): Promise<void> {
  await getDb().runAsync(
    `UPDATE crash_events SET synced = 1 WHERE id = ?`,
    [localId],
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
    remote_id: r.remote_id as number | undefined,
    rider_code: r.rider_code as string,
    start_lat: r.start_lat as number | undefined,
    start_lng: r.start_lng as number | undefined,
    current_lat: r.current_lat as number | undefined,
    current_lng: r.current_lng as number | undefined,
    end_lat: r.end_lat as number | undefined,
    end_lng: r.end_lng as number | undefined,
    route_points: JSON.parse((r.route_points as string) ?? '[]'),
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
