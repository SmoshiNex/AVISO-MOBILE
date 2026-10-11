export const HAZARD_TYPES = [
  'Pothole',
  'Road Excavation',
  'Road Barrier',
  'Traffic Sign',
  'Traffic Light Red',
  'Traffic Light Yellow',
  'Traffic Light Green',
] as const;

export type HazardType = (typeof HAZARD_TYPES)[number];

// Only these are recorded as hazard data (hazard logs, admin, prediction).
// Traffic lights and signs are live rider warnings only — never saved.
export const ROAD_HAZARD_TYPES = ['Pothole', 'Road Excavation', 'Road Barrier'] as const;

export function isRoadHazard(type: string): boolean {
  return (ROAD_HAZARD_TYPES as readonly string[]).includes(type);
}

export const HAZARD_COLORS: Record<string, string> = {
  'Pothole': '#EF4444',
  'Road Excavation': '#F97316',
  'Road Barrier': '#8B5CF6',
  'Traffic Sign': '#3B82F6',
  'Traffic Light Red': '#EF4444',
  'Traffic Light Yellow': '#F59E0B',
  'Traffic Light Green': '#22C55E',
};

export const HAZARD_WARNINGS: Record<string, string> = {
  'Pothole': 'Pothole',
  'Road Excavation': 'Roadwork',
  'Road Barrier': 'Barrier',
  'Traffic Sign': 'Traffic sign',
  'Traffic Light Red': 'Red light — stop',
  'Traffic Light Yellow': 'Yellow — prepare to stop',
  'Traffic Light Green': 'Green light',
};

// Spoken text for lights (road hazards use their distance; signs use
// road_sign_instructions.json).
export const LIGHT_VOICE: Record<string, string> = {
  'Traffic Light Red': 'Red light, stop.',
  'Traffic Light Yellow': 'Yellow, prepare to stop.',
  'Traffic Light Green': 'Green light.',
};

// Real-world widths in cm — used for distance estimation (hazard classes only)
export const HAZARD_REAL_WIDTHS_CM: Partial<Record<string, number>> = {
  'Pothole': 60,
  'Road Excavation': 150,
  'Road Barrier': 100,
};

/**
 * Farthest distance (m) at which the model first detected each hazard in the team's
 * field test (USB webcam, daytime, measured with the iPhone Measure app). A camera
 * distance estimate is never larger than this.
 */
export const HAZARD_MAX_RANGE_M: Partial<Record<string, number>> = {
  'Pothole': 8.2,
  'Road Excavation': 32.6,
  'Road Barrier': 27.3,
};

// The traffic signs the model can tell apart (keys of road_sign_instructions.json).
export type SignKey =
  | 'children_crossing'
  | 'no_left_turn'
  | 'no_parking'
  | 'other'
  | 'slow_down'
  | 'speed_limit_20';

// YOLOv8 class index → display name (as the model prints it) + app type.
// MUST match the `names:` order in the model's data.yaml
// (Roboflow v1-local-and-online-datasets-12-classess v5).
export const MODEL_CLASSES: readonly { name: string; type: string; signKey?: SignKey }[] = [
  { name: 'Children Crossing', type: 'Traffic Sign', signKey: 'children_crossing' },
  { name: 'No Left Turn', type: 'Traffic Sign', signKey: 'no_left_turn' },
  { name: 'No Parking', type: 'Traffic Sign', signKey: 'no_parking' },
  { name: 'Other Traffic Sign', type: 'Traffic Sign', signKey: 'other' },
  { name: 'Pothole', type: 'Pothole' },
  { name: 'Road Barrier', type: 'Road Barrier' },
  { name: 'Road Excavation', type: 'Road Excavation' },
  { name: 'Slow Down', type: 'Traffic Sign', signKey: 'slow_down' },
  { name: 'Speed Limit 20 KPH', type: 'Traffic Sign', signKey: 'speed_limit_20' },
  { name: 'Traffic Light - Green', type: 'Traffic Light Green' },
  { name: 'Traffic Light - Red', type: 'Traffic Light Red' },
  { name: 'Traffic Light - Yellow', type: 'Traffic Light Yellow' },
];

export const MODEL_CLASS_NAMES: readonly string[] = MODEL_CLASSES.map((c) => c.name);

// Ultralytics' box palette (Colors.hexs in ultralytics/utils/plotting.py), by class index —
// the same colors the native layer draws the boxes in (YoloAnnotator.kt).
const YOLO_PALETTE = [
  '#042AFF', '#0BDBEB', '#F3F3F3', '#00DFB7', '#111F68', '#FF6FDD', '#FF444F', '#CCED00', '#00F344', '#BD00FF',
  '#00B4FF', '#DD00BA', '#00FFFF', '#26C000', '#01FFB3', '#7D24FF', '#7B0068', '#FF1B6C', '#FC6D2F', '#A2FF0B',
];

export function modelClassColor(classIndex: number): string {
  return YOLO_PALETTE[classIndex % YOLO_PALETTE.length];
}

export function modelClassName(classIndex: number): string {
  return MODEL_CLASSES[classIndex]?.name ?? `Class ${classIndex}`;
}

export function isTrafficLight(type: string): boolean {
  return type.startsWith('Traffic Light');
}
