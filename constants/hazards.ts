export const HAZARD_TYPES = [
  'Pothole',
  'Road Excavation',
  'Road Barrier',
  'Traffic Sign',
  'Traffic Light Red',
  'Traffic Light Orange',
  'Traffic Light Green',
] as const;

export const AREAS = [
  'City Proper',
  'Calarian',
  'San Roque',
  'Sta Maria',
  'Tugbungan',
  'Talon-Talon',
  'Pasonanca',
  'Putik',
  'Tumaga',
  'Lunzuran',
  'Baliwasan',
  'San Jose Gusu',
] as const;

export type HazardType = (typeof HAZARD_TYPES)[number];
export type Area = (typeof AREAS)[number];

export const HAZARD_COLORS: Record<string, string> = {
  'Pothole': '#EF4444',
  'Road Excavation': '#F97316',
  'Road Barrier': '#8B5CF6',
  'Traffic Sign': '#3B82F6',
  'Traffic Light Red': '#EF4444',
  'Traffic Light Orange': '#F59E0B',
  'Traffic Light Green': '#22C55E',
};

export const HAZARD_WARNINGS: Record<string, string> = {
  'Pothole': 'Pothole ahead — reduce speed',
  'Road Excavation': 'Road excavation ahead — proceed with caution',
  'Road Barrier': 'Road barrier ahead — reduce speed',
  'Traffic Sign': 'Road sign detected — follow instructions',
  'Traffic Light Red': 'RED LIGHT — STOP',
  'Traffic Light Orange': 'ORANGE LIGHT — Slow down',
  'Traffic Light Green': 'Green light — proceed safely',
};

// Real-world widths in cm — used for distance estimation (hazard classes only)
export const HAZARD_REAL_WIDTHS_CM: Partial<Record<string, number>> = {
  'Pothole': 60,
  'Road Excavation': 150,
  'Road Barrier': 100,
};

// YOLOv8n class index → base type mapping (Traffic Light needs further HSV analysis)
export const CLASS_INDEX_TO_TYPE: Record<number, string> = {
  0: 'Pothole',
  1: 'Road Excavation',
  2: 'Road Barrier',
  3: 'Traffic Light',   // state determined by HSV: Red | Orange | Green
  4: 'Traffic Sign',
};
