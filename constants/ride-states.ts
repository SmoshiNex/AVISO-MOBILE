import {
  BUMP_ANGULAR_THRESHOLD,
  CRASH_ANGULAR_THRESHOLD,
  CRASH_G_THRESHOLD,
  CRASH_WINDOW_MS,
  IOT_BRAKE_HORIZONTAL_G,
  IOT_BRAKE_MAX_GYRO_DPS,
  IOT_BRAKE_MIN_S,
  IOT_BUMP_VERTICAL_G,
  IOT_FALL_CONFIRM_S,
  IOT_FALL_TILT_DEG,
  IOT_IMPACT_G,
  IOT_IMPACT_GYRO_DPS,
  IOT_IMPACT_TO_FALL_S,
  IOT_STILL_GYRO_DPS,
  IOT_TIPOVER_CONFIRM_S,
  IOT_UPRIGHT_TILT_DEG,
  NORMAL_G_MAX,
} from '@/constants/detections';
import type { RideState } from '@/lib/ride-state-classifier';
import type { IotMotionState } from '@/types';

/** Name, color and what triggers a riding state; shown on the sensor badge and its legend. */
export type RideStateInfo = { label: string; color: string; trigger: string };

// Same names and colors as the crash-detection logs (app and admin website).
export const RIDE_STATE_COLORS = {
  normal: '#22C55E',
  bump: '#0274DF',
  hardBraking: '#F59E0B',
  impact: '#F97316',
  fallen: '#B91C1C',
  crash: '#EF4444',
} as const;

/** IoT unit states, in the order a crash check moves through them. Mirrors crash-detection/aviso-iot/detector.cpp. */
export const IOT_RIDE_STATES: Record<IotMotionState, RideStateInfo> = {
  normal: {
    label: 'Normal riding',
    color: RIDE_STATE_COLORS.normal,
    trigger: 'None of the states below.',
  },
  bump: {
    label: 'Road bump',
    color: RIDE_STATE_COLORS.bump,
    trigger: `Up-and-down jolt of ${IOT_BUMP_VERTICAL_G} g or more while upright (lean under ${IOT_UPRIGHT_TILT_DEG}°).`,
  },
  hard_braking: {
    label: 'Hard braking',
    color: RIDE_STATE_COLORS.hardBraking,
    trigger:
      `Forward/back force of ${IOT_BRAKE_HORIZONTAL_G} g or more held for ${IOT_BRAKE_MIN_S} s, ` +
      `rotation under ${IOT_BRAKE_MAX_GYRO_DPS}°/s, upright, no up-and-down jolt.`,
  },
  impact: {
    label: 'Impact',
    color: RIDE_STATE_COLORS.impact,
    trigger:
      `Hit of ${IOT_IMPACT_G} g or more, or spin of ${IOT_IMPACT_GYRO_DPS}°/s or more. ` +
      `Crash check starts: the bike must fall within ${IOT_IMPACT_TO_FALL_S} s, otherwise it is ignored (pothole, kerb).`,
  },
  fallen: {
    label: 'Bike down',
    color: RIDE_STATE_COLORS.fallen,
    trigger:
      `Lean of ${IOT_FALL_TILT_DEG}° or more after the hit. Standing it back up cancels the check.`,
  },
  crash: {
    label: 'Crash',
    color: RIDE_STATE_COLORS.crash,
    trigger:
      `Down and still (under ${IOT_STILL_GYRO_DPS}°/s) for ${IOT_FALL_CONFIRM_S} s after a hit, ` +
      `or ${IOT_TIPOVER_CONFIRM_S} s with no hit. Opens the SOS countdown.`,
  },
};

/**
 * Phone sensor states (backup when the IoT unit is not connected). The phone
 * reads 1 g at rest because gravity is included. Display only: the SOS
 * trigger is lib/crash-detector.ts.
 */
export const PHONE_RIDE_STATES: Record<RideState, RideStateInfo> = {
  normal: {
    label: 'Normal riding',
    color: RIDE_STATE_COLORS.normal,
    trigger: `Under ${NORMAL_G_MAX} g.`,
  },
  bump: {
    label: 'Road bump',
    color: RIDE_STATE_COLORS.bump,
    trigger: `${NORMAL_G_MAX}–${CRASH_G_THRESHOLD} g with rotation of ${BUMP_ANGULAR_THRESHOLD} rad/s or more.`,
  },
  hard_braking: {
    label: 'Hard braking',
    color: RIDE_STATE_COLORS.hardBraking,
    trigger: `${NORMAL_G_MAX}–${CRASH_G_THRESHOLD} g with rotation under ${BUMP_ANGULAR_THRESHOLD} rad/s.`,
  },
  crash: {
    label: 'Crash',
    color: RIDE_STATE_COLORS.crash,
    trigger:
      `${CRASH_G_THRESHOLD} g or more and rotation of ${CRASH_ANGULAR_THRESHOLD} rad/s or more ` +
      `within ${CRASH_WINDOW_MS / 1000} s of each other. Opens the SOS countdown.`,
  },
};

export const IOT_STATE_ORDER: IotMotionState[] = ['normal', 'bump', 'hard_braking', 'impact', 'fallen', 'crash'];
export const PHONE_STATE_ORDER: RideState[] = ['normal', 'bump', 'hard_braking', 'crash'];
