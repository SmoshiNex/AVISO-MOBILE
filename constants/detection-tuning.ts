import type { DetectionResult } from '@/types';

/**
 * Every number that decides when a detection becomes a warning or a saved hazard.
 * Tune these from Real/Fake test-ride data (% Real per confidence range, per class);
 * the logic in lib/alert-gate.ts reads them and needs no change.
 *
 * Confidence is judged as a trend (smoothed over time), not per frame: the model's
 * score for one object rises as the bike gets closer and jumps between frames.
 */

/** Smoothing time constant: how quickly the trend follows new frames. */
export const SMOOTHING_TAU_MS = 400;

/** Boxes shown in the object-count pills (the native layer draws boxes from the same value). */
export const DISPLAY_MIN_CONFIDENCE = 0.25;

/** Box height (fraction of the frame) treated as far away / close; thresholds blend in between. */
export const SMALL_BOX_H = 0.04;
export const LARGE_BOX_H = 0.15;

/** Normal warning: sightings needed in the last second for a far vs a close object. */
export const SIGHTINGS_FAR = 3;
export const SIGHTINGS_CLOSE = 2;
/** Sightings must span at least this long, so one burst of frames can't confirm alone. */
export const CONFIRM_SPAN_MS = 150;
export const CONFIRM_WINDOW_MS = 1000;
/** Far objects may pass with a threshold this much lower than close ones. */
export const FAR_THRESHOLD_DROP = 0.1;

/** A single frame this confident skips the trend: warn after CONFIRM_FAST_SIGHTINGS. */
export const FAST_PATH_CONFIDENCE = 0.8;
export const CONFIRM_FAST_SIGHTINGS = 2;

/** "Possible ..." warning for weak classes: steady sightings, same place, over a minimum time. */
export const POSSIBLE_SIGHTINGS = 5;
export const POSSIBLE_MIN_MS = 800;
/** A box counts as the same object if it overlaps the previous one at least this much (IoU)... */
export const STEADY_IOU = 0.3;
/** ...or its centre moved less than this (fraction of the frame). */
export const STEADY_CENTER_SHIFT = 0.12;

/** Encounter ends when the object hasn't been seen for this long. */
export const GONE_MS = 2000;
/** Minimum gap between two popups; waiting ones stay queued while in view. */
export const POPUP_SPACING_MS = 1200;

/** Saving to Hazard Logs stays strict: this data trains the prediction model. */
export const SAVE_MIN_SMOOTHED = 0.6;
export const SAVE_MIN_SIGHTINGS = 3;

type ClassTuning = {
  /** Smoothed confidence for a normal warning on a close (large) object. */
  normal: number;
  /** Smoothed confidence floor for a "possible" warning (needs steadiness). */
  possible: number;
};

/** Starting values per class. Weak classes (pothole, excavation) get lower bars. */
const CLASS_TUNING: Record<string, ClassTuning> = {
  Pothole: { normal: 0.45, possible: 0.2 },
  'Road Excavation': { normal: 0.45, possible: 0.2 },
  'Road Barrier': { normal: 0.5, possible: 0.25 },
  'Traffic Light Green': { normal: 0.55, possible: 0.25 },
  'Traffic Light Red': { normal: 0.55, possible: 0.25 },
  'Traffic Light Yellow': { normal: 0.55, possible: 0.25 },
  'sign:other': { normal: 0.45, possible: 0.2 },
  sign: { normal: 0.55, possible: 0.25 },
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
