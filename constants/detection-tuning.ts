import type { DetectionResult } from '@/types';

/**
 * Every number that decides when a detection becomes a warning or a saved hazard.
 * Tune these from Real/Fake test-ride data (% Real per confidence range, per class);
 * the logic in lib/alert-gate.ts reads them and needs no change.
 *
 * On a moving motorcycle the detector checks only ~6–7 frames per second, so an object is
 * often detected just once. One detection is therefore enough; false alarms are filtered
 * by per-class levels, where the box is on screen and its size — not by repeat sightings.
 */

/** Boxes shown in the object-count pills (the native layer draws boxes from the same value). */
export const DISPLAY_MIN_CONFIDENCE = 0.25;

/** Below this speed (GPS) the object stays in view for many frames, so two detections are required. */
export const SLOW_SPEED_KMH = 10;
export const SLOW_SIGHTINGS = 2;
/** Detections of the same object within this window count together (slow-speed rule). */
export const SIGHTING_WINDOW_MS = 1500;

/** Potholes and excavations lie on the road: their box centre must be below this line (fraction of frame height). */
export const ROAD_MIN_CENTER_Y = 1 / 3;
/** Boxes shorter than this (fraction of frame height) are tiny specks: they need extra confidence. */
export const SMALL_BOX_H = 0.015;
export const SMALL_BOX_EXTRA = 0.1;

/** A sign/light encounter ends when it hasn't been seen for this long (one popup per pass). */
export const GONE_MS = 2000;
/** A pothole counts as passed after this long out of view (each pothole is its own object). */
export const POTHOLE_PASSED_MS = 1000;
/**
 * A barrier row (one or both sides) or a road-work site is ONE zone: it ends when none of its
 * objects has been seen for this long. Barriers are detected one by one, so without zones a
 * long row would warn every few seconds.
 */
export const ZONE_END_MS = 3000;
/** Minimum gap between two popups; waiting ones stay queued while in view. */
export const POPUP_SPACING_MS = 1200;

/**
 * Cooldowns between DIFFERENT objects/zones of the same kind (the same object is never repeated
 * while in view). Short on purpose: every new danger gets a warning, without nagging.
 */
export const COOLDOWN_MS = {
  pothole: 3000,
  barrierZone: 3000,
  roadworkZone: 3000,
  /** Per sign type (e.g. two "Slow Down" signs within 10 s → one reminder). */
  sign: 10_000,
  /** Traffic lights; a colour change always warns immediately. */
  light: 5000,
} as const;

/** Same pothole if the new box is within this share of the frame from the last one (grows with box size)... */
export const POTHOLE_MATCH_MIN = 0.12;
export const POTHOLE_MATCH_BOX_FACTOR = 1.5;
/** ...and hasn't jumped up the screen by more than this (approaching objects move down). */
export const POTHOLE_MATCH_MAX_RISE = 0.05;

/** 3+ pothole warnings within 10 s: one spoken "rough road" message; later cards stay silent. */
export const CLUSTER_COUNT = 3;
export const CLUSTER_WINDOW_MS = 10_000;

/** Minimum gap between SPOKEN warnings (cards still show); urgent ones may cut in. */
export const VOICE_GAP_MS = 3000;

/**
 * Saving to Hazard Logs (prediction data): one detection at this level is a sighting.
 * Confirmation comes from Times Seen across rides and Real/Fake checks, not repeated frames.
 */
export const SAVE_MIN_CONFIDENCE = 0.6;

type ClassTuning = {
  /** One detection at or above this: normal popup + voice. */
  normal: number;
  /** One detection from here up to `normal`: "possible" popup, no voice. */
  possible: number;
  /** Must be on the road (lower part of the picture). */
  onRoad: boolean;
};

/** Starting values per class. Weak classes (pothole, excavation, other sign) get lower bars. */
const CLASS_TUNING: Record<string, ClassTuning> = {
  Pothole: { normal: 0.45, possible: 0.3, onRoad: true },
  'Road Excavation': { normal: 0.45, possible: 0.3, onRoad: true },
  'Road Barrier': { normal: 0.5, possible: 0.35, onRoad: false },
  'Traffic Light Green': { normal: 0.5, possible: 0.35, onRoad: false },
  'Traffic Light Red': { normal: 0.5, possible: 0.35, onRoad: false },
  'Traffic Light Yellow': { normal: 0.5, possible: 0.35, onRoad: false },
  'sign:other': { normal: 0.45, possible: 0.3, onRoad: false },
  sign: { normal: 0.55, possible: 0.35, onRoad: false },
};

export function classTuning(d: DetectionResult): ClassTuning {
  if (d.signKey) return CLASS_TUNING[`sign:${d.signKey}`] ?? CLASS_TUNING.sign;
  return CLASS_TUNING[d.type] ?? CLASS_TUNING.sign;
}

/**
 * Related classes the model often splits one object between (e.g. construction signs read as
 * both "Road Excavation" and "Other Traffic Sign"). Overlapping boxes from the same group are
 * merged into one object with the stronger class and the combined evidence.
 */
export const RELATED_GROUPS: readonly (readonly string[])[] = [
  ['Road Excavation', 'Road Barrier', 'sign:other'],
];
/** Merge when this share of the smaller box overlaps the other (a sign inside an excavation box). */
export const RELATED_MERGE_OVERLAP = 0.5;

/** Group identity of a detection, matching RELATED_GROUPS entries. */
export function groupName(d: DetectionResult): string {
  return d.signKey ? `sign:${d.signKey}` : d.type;
}
