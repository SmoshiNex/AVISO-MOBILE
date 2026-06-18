import type { HazardType } from '@/constants/hazards';

export type User = {
  id: number;
  first_name: string;
  middle_name?: string;
  last_name: string;
  username: string;
  email: string;
  contact_number: string;
  address?: string;
  role: string;
};

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
  distance?: number;           // meters — only for hazard classes 0–2
  trafficState?: 'red' | 'orange' | 'green' | 'unknown'; // class 3 only
  signKey?: string;            // class 4 only — key into road_sign_instructions.json
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
};

// Local SQLite emergency contact (with local-only is_active toggle)
export type LocalEmergencyContact = {
  id: number;
  name: string;
  relationship?: string;
  contact_number: string;
  is_active: boolean;
};
