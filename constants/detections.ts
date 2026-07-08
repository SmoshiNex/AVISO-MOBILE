export const CRASH_G_THRESHOLD = 2.5;
export const CRASH_ANGULAR_THRESHOLD = 2.0;
export const CRASH_WINDOW_MS = 500;
export const CRASH_LOCKOUT_MS = 5000;

// Display-only ride-state classification (camera HUD), independent of the
// crash trigger above. Placeholder-calibrated for phone sensors — recalibrate
// against the real IoT hardware's sensor characteristics once available.
export const NORMAL_G_MAX = 1.3;
export const BUMP_ANGULAR_THRESHOLD = 1.0;

// Voice-alert urgency ranking — lower number = more urgent. Shared by
// lib/voice-queue.ts (interrupt logic) and lib/select-priority-detection.ts
// (per-tick candidate selection) so both stay in sync with one source of truth.
export const VOICE_ALERT_PRIORITY: Record<string, number> = {
  'Pothole':              1,
  'Road Excavation':      1,
  'Road Barrier':         1,
  'Traffic Light Red':    2,
  'Traffic Light Orange': 2,
  'Traffic Light Green':  3,
  'Traffic Sign':         4,
};
export const DEFAULT_VOICE_PRIORITY = 5;
