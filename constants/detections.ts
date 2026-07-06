export const CRASH_G_THRESHOLD = 2.5;
export const CRASH_ANGULAR_THRESHOLD = 2.0;
export const CRASH_WINDOW_MS = 500;
export const CRASH_LOCKOUT_MS = 5000;

// Display-only ride-state classification (camera HUD), independent of the
// crash trigger above. Placeholder-calibrated for phone sensors — recalibrate
// against the real IoT hardware's sensor characteristics once available.
export const NORMAL_G_MAX = 1.3;
export const BUMP_ANGULAR_THRESHOLD = 1.0;
