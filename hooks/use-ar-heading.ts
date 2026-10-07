import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import { useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import type { LatLng } from '@/lib/alert-gate';
import { iotTelemetryStore } from '@/lib/iot-client';

/** Below this speed (m/s, ~7 km/h) the rider counts as stopped. */
const MOVING_SPEED_MS = 2;
/** Turn rates below this (°/s) are sensor noise; ignoring them stops drift while still. */
const DEADBAND_DPS = 0.7;
/** While riding straight, how fast the arrow re-centres on the travel direction (per sample). */
const RECENTRE_RATE = 0.1;
/** "Riding straight" = turning slower than this (°/s). */
const STRAIGHT_DPS = 4;
/** Sign votes against compass/GPS needed before a gyro's direction is flipped. */
const SIGN_VOTES_TO_FLIP = 5;
const CALIBRATION_MIN_RATE = 8;
const COMPASS_STALE_MS = 600;
const SENSOR_INTERVAL_MS = 100;
/** The arrow never points further round than this (°), so it stays in front of the camera. */
const MAX_ANGLE = 120;

export type ArHeading = {
  /**
   * Where the locked direction is relative to the camera, degrees:
   * 0 = straight ahead, +90 = to the right, −90 = to the left.
   * Read every frame by the 3D arrow (no React re-render).
   */
  angleRef: React.MutableRefObject<number>;
  /** Same angle, animated, for the 2D fallback arrow. */
  angle: SharedValue<number>;
  /** 0 = hidden, 1 = shown. */
  visibility: SharedValue<number>;
  /** Latest GPS fix, for alerts that depend on distance travelled. */
  positionRef: React.MutableRefObject<LatLng | null>;
  /** Compass bearing of the camera (0 = north, degrees), null until known. */
  compassRef: React.MutableRefObject<number | null>;
};

const wrapDegrees = (d: number) => ((d + 540) % 360) - 180;

/**
 * World-locked heading for the AR arrow, like a compass needle.
 *
 * The camera's heading is tracked by integrating its turn rate:
 * - the IoT unit's BNO055 when connected (bolted to the motorcycle, like the
 *   webcam, so it turns exactly with the camera), else
 * - the phone gyroscope, around the gravity axis (works in any orientation).
 * The arrow points at a direction locked in the world: it starts straight
 * ahead, stays put while the camera turns (so it rotates on screen), and
 * while riding straight it eases back onto the direction of travel.
 *
 * Each gyro's rotation direction is checked against the compass (standing)
 * and GPS course (riding) and flipped if a mounting makes it backwards.
 */
export function useArHeading(active: boolean): ArHeading {
  const angleRef = useRef(0);
  const angle = useSharedValue(0);
  const visibility = useSharedValue(0);
  const positionRef = useRef<LatLng | null>(null);
  const compassRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      angleRef.current = 0;
      angle.value = withSpring(0);
      visibility.value = withTiming(0, { duration: 300 });
      return;
    }
    visibility.value = withTiming(1, { duration: 400 });

    // Physics default for "clockwise turn = positive": Android's accelerometer
    // points up at rest, iOS's points down. Votes below correct any mismatch.
    const signs = {
      phone: { sign: Platform.OS === 'ios' ? 1 : -1, votes: 0 },
      iot: { sign: -1, votes: 0 },
    };

    let heading = 0;          // camera heading, degrees, arbitrary zero
    let target = 0;           // locked world direction, same frame
    let lastSampleAt = Date.now();
    let moving = false;
    let gravity = { x: 0, y: 0, z: 1 };

    let gpsRate = 0;
    let lastGpsHeading: number | null = null;
    let lastGpsHeadingAt = 0;
    let compassRate = 0;
    let compassAt = 0;
    let lastCompass: number | null = null;

    const reference = () => {
      if (moving) return gpsRate;
      return Date.now() - compassAt < COMPASS_STALE_MS ? compassRate : 0;
    };

    const vote = (src: { sign: number; votes: number }, measured: number) => {
      const ref = reference();
      if (Math.abs(ref) < CALIBRATION_MIN_RATE || Math.abs(measured) < CALIBRATION_MIN_RATE) return;
      // +1 when our clockwise estimate agrees with the reference.
      src.votes += Math.sign(ref) * Math.sign(measured);
      if (src.votes <= -SIGN_VOTES_TO_FLIP) {
        src.sign = -src.sign;
        src.votes = 0;
      } else if (src.votes > SIGN_VOTES_TO_FLIP) {
        src.votes = SIGN_VOTES_TO_FLIP;
      }
    };

    const step = (phoneYawCcw: number) => {
      const now = Date.now();
      const dt = Math.min(0.5, (now - lastSampleAt) / 1000);
      lastSampleAt = now;

      // Clockwise turn rate of the camera, °/s.
      const iot = iotTelemetryStore.getFresh();
      const src = iot ? signs.iot : signs.phone;
      let rate = src.sign * (iot ? iot.yaw : phoneYawCcw);
      vote(src, rate);
      if (Math.abs(rate) < DEADBAND_DPS) rate = 0;

      heading += rate * dt;
      if (moving && Math.abs(rate) < STRAIGHT_DPS) {
        target += RECENTRE_RATE * wrapDegrees(heading - target);
      }

      const a = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, wrapDegrees(target - heading)));
      angleRef.current = a;
      angle.value = withSpring(a, { damping: 18, stiffness: 120 });
    };

    Accelerometer.setUpdateInterval(SENSOR_INTERVAL_MS);
    Gyroscope.setUpdateInterval(SENSOR_INTERVAL_MS);

    const accelSub = Accelerometer.addListener(({ x, y, z }) => {
      gravity = {
        x: gravity.x + 0.1 * (x - gravity.x),
        y: gravity.y + 0.1 * (y - gravity.y),
        z: gravity.z + 0.1 * (z - gravity.z),
      };
    });

    const gyroSub = Gyroscope.addListener(({ x, y, z }) => {
      const g = Math.hypot(gravity.x, gravity.y, gravity.z) || 1;
      // Rotation around the accelerometer's axis (rad/s → °/s).
      step(((x * gravity.x + y * gravity.y + z * gravity.z) / g) * (180 / Math.PI));
    });

    let locationSub: Location.LocationSubscription | null = null;
    let headingSub: Location.LocationSubscription | null = null;
    let cancelled = false;

    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 1 },
      ({ coords, timestamp }) => {
        positionRef.current = { latitude: coords.latitude, longitude: coords.longitude };
        moving = (coords.speed ?? 0) >= MOVING_SPEED_MS;
        const course = coords.heading;
        if (moving && course !== null && course >= 0) {
          if (lastGpsHeading !== null && timestamp > lastGpsHeadingAt) {
            gpsRate = wrapDegrees(course - lastGpsHeading) / ((timestamp - lastGpsHeadingAt) / 1000);
          }
          lastGpsHeading = course;
          lastGpsHeadingAt = timestamp;
        } else {
          gpsRate = 0;
          lastGpsHeading = null;
        }
      },
    )
      .then((sub) => (cancelled ? sub.remove() : (locationSub = sub)))
      .catch(() => {
        // No location: the gyro still drives the arrow.
      });

    // Compass, only to check the gyro's rotation direction while standing.
    Location.watchHeadingAsync(({ magHeading, trueHeading }) => {
      compassRef.current = trueHeading >= 0 ? trueHeading : magHeading;
      const now = Date.now();
      if (lastCompass === null) {
        lastCompass = magHeading;
        compassAt = now;
        return;
      }
      if (now - compassAt < 150) return;
      compassRate = wrapDegrees(magHeading - lastCompass) / ((now - compassAt) / 1000);
      lastCompass = magHeading;
      compassAt = now;
    })
      .then((sub) => (cancelled ? sub.remove() : (headingSub = sub)))
      .catch(() => {
        // No compass: default rotation direction is used.
      });

    return () => {
      cancelled = true;
      accelSub.remove();
      gyroSub.remove();
      locationSub?.remove();
      headingSub?.remove();
      angleRef.current = 0;
      angle.value = withSpring(0);
      visibility.value = withTiming(0, { duration: 300 });
    };
  }, [active, angle, visibility]);

  return { angleRef, angle, visibility, positionRef, compassRef };
}
