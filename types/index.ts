import type { HazardType, SignKey } from '@/constants/hazards';

export type User = {
  id: number;
  first_name: string;
  middle_name?: string;
  last_name: string;
  username?: string;
  email: string;
  contact_number: string;
  address?: string;
  street?: string | null;
  barangay_id?: string | null;
  city_id?: string | null;
  province_id?: string | null;
  region_id?: string | null;
  avatar_url?: string;
  role: string;
};

export type AddressProvince = { province_id: string; name: string; region_id: string };
export type AddressCity     = { city_id: string; name: string };
export type AddressBarangay = { code: string; name: string };

export type Trip = {
  id: number;
  rider_code: string;
  start_lat: number;
  start_lng: number;
  current_lat?: number;
  current_lng?: number;
  end_lat?: number;
  end_lng?: number;
  route_points: Array<{ lat: number; lng: number }>;
  status: 'active' | 'ended';
  started_at: string;
  ended_at?: string;
};

export type HazardLog = {
  id: number;
  haz_code?: string;
  type: HazardType;
  area?: string;
  latitude: string;
  longitude: string;
  confidence: string;
  distance?: string;
  status: string;
  detected_at: string;
};

export type EmergencyContact = {
  id: number;
  name: string;
  relationship?: string;
  contact_number: string;
};

export type EmergencyAlert = {
  id: number;
  latitude: number;
  longitude: number;
  triggered_at: string;
  status: 'pending' | 'acknowledged' | 'resolved';
};

// AR detection result from any detection source (demo, TFLite, or OTG)
export type DetectionResult = {
  classIndex: number;
  type: HazardType | string;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number }; // 0–1 normalized
  distance?: number;           // meters — road hazards only
  signKey?: SignKey;           // traffic signs only — key into road_sign_instructions.json
};

// Local SQLite trip record
export type LocalTrip = {
  id: number;
  remote_id?: number;
  rider_code: string;
  start_lat?: number;
  start_lng?: number;
  current_lat?: number;
  current_lng?: number;
  end_lat?: number;
  end_lng?: number;
  route_points: Array<{ lat: number; lng: number }>;
  status: 'active' | 'ended';
  started_at: string;
  ended_at?: string;
  total_hazards: number;
  synced: boolean;
};

// Local SQLite hazard log record
export type LocalHazardLog = {
  id: number;
  remote_id?: number;
  trip_id?: number;
  type: string;
  confidence: number;
  distance?: number;
  latitude: number;
  longitude: number;
  area?: string;
  detected_at: string;
  synced: boolean;
};

// Local SQLite crash event
export type LocalCrashEvent = {
  id: number;
  latitude: number;
  longitude: number;
  last_hazard_type?: string;
  triggered_at: string;
  sms_sent: boolean;
  synced: boolean;
  /** Backend delivery attempts so far. Caps the retry queue in sync-service. */
  attempts: number;
  /** Crash id from the IoT unit, when the SOS started from a unit crash. */
  event_uid?: string;
};

// Local SQLite emergency contact (with local-only is_active toggle)
export type LocalEmergencyContact = {
  id: number;
  name: string;
  relationship?: string;
  contact_number: string;
  is_active: boolean;
};

// ─── AVISO IoT unit (ESP32 + BNO055) ─────────────────────────────────────────

export type IotMotionState = 'normal' | 'bump' | 'hard_braking' | 'impact' | 'fallen' | 'crash';

/** Live readings from the unit, ~10 per second. */
export type IotTelemetry = {
  /** Linear acceleration in g (gravity removed: 0 at rest). */
  g: number;
  /** Up/down part (bumps). */
  vg: number;
  /** Forward/back/sideways part (braking). */
  hg: number;
  /** Rotation speed, degrees/second. */
  gy: number;
  /** Rotation around vertical (turning), degrees/second. */
  yaw: number;
  /** Lean from the saved upright, degrees. */
  tilt: number;
  st: IotMotionState;
};

export type IotHello = {
  uid: string;
  fw: string;
  reset: string;
  uptime: number;
  rssi: number;
  paired: boolean;
  upright_saved: boolean;
  offsets_saved: boolean;
  cal: { sys: number; gyro: number; accel: number };
};

export type IotEventType = 'normal' | 'road_bump' | 'hard_braking' | 'crash';

export type IotEvent = {
  id: string;
  type: IotEventType;
  peak_g: number;
  /** Peak up/down part, g. */
  vg: number;
  /** Peak forward/back/sideways part, g. */
  hg: number;
  peak_gyro: number;
  tilt: number;
  /** Phone time it arrived (ms). */
  receivedAt: number;
};

/** The rider's paired unit as known by the server. */
export type IotDeviceInfo = {
  device_uid: string;
  local_ip: string | null;
  rssi: number | null;
  firmware_version: string | null;
  uptime_seconds: number | null;
  reset_reason: string | null;
  last_seen_at: string | null;
  online: boolean;
};

// ─── Crash-detection log (server: rider_events) ─────────────────────────────

/** One logged classification, as returned by GET /rider/events. */
export type RiderEventLog = {
  id: number;
  event_uid: string | null;
  event_type: IotEventType;
  area: string | null;
  acceleration_peak: string;
  vertical_g: string | null;
  horizontal_g: string | null;
  gyro_peak_dps: string | null;
  tilt_deg: string | null;
  detected_at: string;
};

export type MinAvgMax = { min: number | null; avg: number | null; max: number | null };

/** Per-category ranges (GET /rider/events/stats). */
export type RiderEventTypeStats = {
  type: IotEventType;
  label: string;
  total: number;
  g: MinAvgMax;
  vertical_g: MinAvgMax;
  horizontal_g: MinAvgMax;
  gyro_dps: MinAvgMax;
  tilt_deg: MinAvgMax;
};

/** Event waiting in the phone's SQLite queue for upload. */
export type LocalRideEvent = {
  id: number;
  event_uid: string;
  event_type: IotEventType;
  latitude: number;
  longitude: number;
  acceleration_peak: number;
  vertical_g: number | null;
  horizontal_g: number | null;
  gyro_peak_dps: number | null;
  tilt_deg: number | null;
  detected_at: string;
  attempts: number;
};
