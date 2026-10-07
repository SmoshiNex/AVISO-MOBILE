export const CRASH_G_THRESHOLD = 2.5;
export const CRASH_ANGULAR_THRESHOLD = 2.0;
export const CRASH_WINDOW_MS = 500;
export const CRASH_LOCKOUT_MS = 5000;

// Display-only ride-state classification (camera HUD), independent of the
// crash trigger above. Placeholder-calibrated for phone sensors — recalibrate
// against the real IoT hardware's sensor characteristics once available.
export const NORMAL_G_MAX = 1.3;
export const BUMP_ANGULAR_THRESHOLD = 1.0;

// Alert urgency ranking — lower number = more urgent. Keyed by the alert key
// lib/alert-gate.ts gives each object: the road hazard / light type, or
// `sign:<signKey>` for traffic signs.
export const VOICE_ALERT_PRIORITY: Record<string, number> = {
  'Pothole':                 1,
  'Road Excavation':         1,
  'Road Barrier':            1,
  'Traffic Light Red':       2,
  'Traffic Light Yellow':    3,
  'sign:children_crossing':  3,
  'sign:speed_limit_20':     3,
  'sign:slow_down':          3,
  'sign:no_left_turn':       4,
  'Traffic Light Green':     5,
  'sign:no_parking':         5,
  'sign:other':              6,
};
export const DEFAULT_VOICE_PRIORITY = 5;

// IoT unit (BNO055) display thresholds — mirror crash-detection/aviso-iot/config.h.
// The unit reports linear acceleration (gravity removed: 0 g at rest) and
// rotation in degrees/second, unlike the phone (1 g at rest, rad/s).
export const IOT_IMPACT_G = 3.0;
export const IOT_IMPACT_GYRO_DPS = 250;
export const IOT_FALL_TILT_DEG = 60;
export const IOT_UPRIGHT_TILT_DEG = 30;
export const IOT_IMPACT_TO_FALL_S = 3;
export const IOT_FALL_CONFIRM_S = 3;
export const IOT_TIPOVER_CONFIRM_S = 5;
export const IOT_STILL_GYRO_DPS = 30;
export const IOT_BUMP_VERTICAL_G = 0.8;
export const IOT_BRAKE_HORIZONTAL_G = 0.45;
export const IOT_BRAKE_MAX_GYRO_DPS = 60;
export const IOT_BRAKE_MIN_S = 0.2;
