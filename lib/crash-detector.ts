import { Accelerometer, Gyroscope } from 'expo-sensors';
import {
  CRASH_ANGULAR_THRESHOLD,
  CRASH_G_THRESHOLD,
  CRASH_LOCKOUT_MS,
  CRASH_WINDOW_MS,
} from '@/constants/detections';

type Subscription = { remove: () => void };

export class CrashDetector {
  private accelSub: Subscription | null = null;
  private gyroSub: Subscription | null = null;
  private lastAccelSpike: number | null = null;
  private lastGyroSpike: number | null = null;
  private lockedUntil = 0;
  private readonly onCrash: () => void;

  constructor(onCrash: () => void) {
    this.onCrash = onCrash;
  }

  start() {
    Accelerometer.setUpdateInterval(100);
    Gyroscope.setUpdateInterval(100);

    this.accelSub = Accelerometer.addListener(({ x, y, z }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      if (magnitude >= CRASH_G_THRESHOLD) {
        this.lastAccelSpike = Date.now();
        this.checkCrash();
      }
    });

    this.gyroSub = Gyroscope.addListener(({ x, y, z }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      if (magnitude >= CRASH_ANGULAR_THRESHOLD) {
        this.lastGyroSpike = Date.now();
        this.checkCrash();
      }
    });
  }

  stop() {
    this.accelSub?.remove();
    this.gyroSub?.remove();
    this.accelSub = null;
    this.gyroSub = null;
  }

  private checkCrash() {
    const now = Date.now();
    if (now < this.lockedUntil) return;
    if (this.lastAccelSpike === null || this.lastGyroSpike === null) return;

    const diff = Math.abs(this.lastAccelSpike - this.lastGyroSpike);
    if (diff <= CRASH_WINDOW_MS) {
      this.lockedUntil = now + CRASH_LOCKOUT_MS;
      this.lastAccelSpike = null;
      this.lastGyroSpike = null;
      this.onCrash();
    }
  }
}
