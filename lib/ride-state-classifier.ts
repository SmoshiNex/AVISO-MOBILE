import {
  CRASH_G_THRESHOLD,
  CRASH_ANGULAR_THRESHOLD,
  NORMAL_G_MAX,
  BUMP_ANGULAR_THRESHOLD,
} from '@/constants/detections';

export type RideState = 'normal' | 'hard_braking' | 'bump' | 'crash';

export function classifyRideState(accelMag: number, gyroMag: number): RideState {
  if (accelMag >= CRASH_G_THRESHOLD && gyroMag >= CRASH_ANGULAR_THRESHOLD) return 'crash';
  if (accelMag < NORMAL_G_MAX) return 'normal';
  return gyroMag >= BUMP_ANGULAR_THRESHOLD ? 'bump' : 'hard_braking';
}
