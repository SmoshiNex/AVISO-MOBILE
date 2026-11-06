import { isRoadHazard } from '@/constants/hazards';
import type { LatLng } from '@/lib/alert-gate';
import type { HazardLog } from '@/types';

/**
 * Known hazard ahead: warn the rider about hazards other riders already saved,
 * before the camera can see them (the camera only reaches ~8 m for a pothole,
 * ~30 m for an excavation or barrier).
 *
 * Pure functions only — the hook in hooks/use-known-hazards-ahead.ts feeds them
 * the downloaded hazards and the live GPS fix.
 */

/**
 * Saves of one real hazard lie within this many meters of each other (same
 * type, same direction). Same values as the server's HazardLog::GROUP_RADIUS_M.
 */
export const GROUP_RADIUS_M: Record<string, number> = {
  Pothole: 10,
  'Road Excavation': 25,
  'Road Barrier': 30,
};

/** Warn about this many seconds before reaching the hazard... */
export const WARN_SECONDS = 5;
/** ...but never closer than this (slow riding) or farther than this (fast riding), meters. */
export const WARN_MIN_M = 30;
export const WARN_MAX_M = 80;
/** Closer than this the rider is already on it: too late for a useful warning. */
export const TOO_CLOSE_M = 8;
/** The hazard must be within this angle (°) either side of the direction of travel. */
export const AHEAD_ANGLE = 30;
/**
 * ...and at most this far (m) to the side of the rider's path. Keeps hazards on a
 * parallel road or a side street out, while still allowing for GPS error (±5–15 m).
 */
export const MAX_SIDEWAYS_M = 10;
/** A saved hazard counts for this rider only if it was saved going within this angle (°) of their direction. */
export const SAME_DIRECTION_ANGLE = 45;
/** Below this speed the rider counts as stopped: no warnings. */
export const MIN_SPEED_KMH = 7;
/** Once warned, a hazard can warn again only after the rider is this far from it (a new pass). */
export const REARM_DISTANCE_M = 120;
/** Stopped at least this long (resting at the roadside): already-warned hazards may warn again. A traffic light is shorter. */
export const LONG_STOP_MS = 60_000;
/** After a stop, this many moving checks in a row (1 s apart) before warnings resume. */
export const MOVING_CHECKS_TO_RESUME = 2;
/** A GPS fix unchanged for longer than this means the phone is standing still. */
export const STALE_FIX_MS = 3000;
/** GPS fixes less accurate than this (meters) are not used for warnings. */
export const MAX_GPS_ACCURACY_M = 20;

export type KnownHazard = {
  /** Stable id of the group (the id of its first save). */
  key: number;
  type: string;
  latitude: number;
  longitude: number;
  /** Direction of travel when saved (degrees from north), null when unknown. */
  heading: number | null;
};

export type RiderFix = {
  latitude: number;
  longitude: number;
  /** Direction of travel, degrees from north; null when stopped or unknown. */
  heading: number | null;
  speedKmh: number | null;
};

export type HazardAhead = {
  hazard: KnownHazard;
  /** Straight-line distance from the rider, meters. */
  distance: number;
};

/** Smallest angle between two compass directions, 0–180°. */
export function angleBetween(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

/** Great-circle (haversine) distance in meters. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(a)) * 6371000;
}

/** Compass bearing from point 1 to point 2, degrees from north. */
export function bearingDegrees(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = Math.PI / 180;
  const y = Math.sin((lng2 - lng1) * toRad) * Math.cos(lat2 * toRad);
  const x =
    Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
    Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos((lng2 - lng1) * toRad);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * One entry per real hazard. The server keeps one row per save, so a pothole
 * passed five times is five rows; saves of the same type, within the type's
 * radius and going the same direction, become one known hazard (one warning).
 */
export function groupKnownHazards(logs: HazardLog[]): KnownHazard[] {
  const groups: KnownHazard[] = [];

  for (const log of logs) {
    if (!isRoadHazard(log.type)) continue;
    const latitude = toNumber(log.latitude);
    const longitude = toNumber(log.longitude);
    if (latitude === null || longitude === null) continue;
    // The server's placement direction also covers older saves without a GPS heading.
    const heading = toNumber(log.travel_heading ?? log.heading);
    const radius = GROUP_RADIUS_M[log.type] ?? 10;

    const match = groups.find(
      (g) =>
        g.type === log.type &&
        distanceMeters(g.latitude, g.longitude, latitude, longitude) <= radius &&
        (g.heading === null || heading === null || angleBetween(g.heading, heading) <= SAME_DIRECTION_ANGLE),
    );

    if (match) {
      if (match.heading === null) match.heading = heading;
      continue;
    }
    groups.push({ key: log.id, type: log.type, latitude, longitude, heading });
  }

  return groups;
}

/** How far ahead to warn at this speed: about WARN_SECONDS of riding, 30–80 m. */
export function warnDistance(speedKmh: number): number {
  const metersPerSecond = speedKmh / 3.6;
  return Math.min(WARN_MAX_M, Math.max(WARN_MIN_M, metersPerSecond * WARN_SECONDS));
}

/**
 * The nearest known hazard the rider is heading toward and should be warned
 * about now, or null. Skips hazards already announced on this pass.
 * No warning when stopped, when the hazard is behind or off to the side (more
 * than MAX_SIDEWAYS_M from the rider's path), or
 * when it was saved by riders going the other way (the other lane).
 */
export function findHazardAhead(
  rider: RiderFix,
  hazards: KnownHazard[],
  announced: ReadonlySet<number>,
): HazardAhead | null {
  if (rider.heading === null || rider.speedKmh === null || rider.speedKmh < MIN_SPEED_KMH) {
    return null;
  }

  const range = warnDistance(rider.speedKmh);
  let best: HazardAhead | null = null;

  for (const hazard of hazards) {
    if (announced.has(hazard.key)) continue;

    const distance = distanceMeters(rider.latitude, rider.longitude, hazard.latitude, hazard.longitude);
    if (distance > range || distance < TOO_CLOSE_M) continue;

    const bearing = bearingDegrees(rider.latitude, rider.longitude, hazard.latitude, hazard.longitude);
    const offAngle = angleBetween(bearing, rider.heading);
    if (offAngle > AHEAD_ANGLE) continue;
    if (distance * Math.sin((offAngle * Math.PI) / 180) > MAX_SIDEWAYS_M) continue;

    if (hazard.heading !== null && angleBetween(hazard.heading, rider.heading) > SAME_DIRECTION_ANGLE) continue;

    if (best === null || distance < best.distance) best = { hazard, distance };
  }

  return best;
}

/**
 * The once-a-second check while riding, with the stop rules:
 * - stopped (under MIN_SPEED_KMH, no direction, or no fresh GPS fix): no warnings;
 * - stopped LONG_STOP_MS or more (resting at the roadside): hazards already
 *   warned about may warn again when the rider rides on; a traffic light is shorter;
 * - moving again: warnings resume after MOVING_CHECKS_TO_RESUME moving checks in a row
 *   (pulling out at an angle, or a GPS jump while parked, is not riding);
 * - GPS fixes worse than MAX_GPS_ACCURACY_M are not used;
 * - once per pass: a warned hazard warns again only REARM_DISTANCE_M away from it.
 */
export function createAheadTracker() {
  const announced = new Map<number, KnownHazard>();
  let stoppedSince: number | null = null;
  let movingStreak = 0;
  let lastFix: LatLng | null = null;
  let lastFixAt = 0;

  return {
    check(now: number, position: LatLng | null, speedKmh: number | null, hazards: KnownHazard[]): HazardAhead | null {
      if (!position) return null;

      // The GPS stops sending updates while the phone stands still, which would
      // leave the speed and direction from before the stop. A fix that has not
      // changed for a while means the rider is stopped.
      if (position !== lastFix) {
        lastFix = position;
        lastFixAt = now;
      }
      const fresh = now - lastFixAt <= STALE_FIX_MS;
      const heading = position.heading ?? null;
      const moving = fresh && heading !== null && speedKmh !== null && speedKmh >= MIN_SPEED_KMH;

      if (!moving) {
        movingStreak = 0;
        if (stoppedSince === null) stoppedSince = now;
        if (now - stoppedSince >= LONG_STOP_MS) announced.clear();
        return null;
      }
      stoppedSince = null;

      if (position.accuracy != null && position.accuracy > MAX_GPS_ACCURACY_M) {
        movingStreak = 0;
        return null;
      }
      movingStreak += 1;
      if (movingStreak < MOVING_CHECKS_TO_RESUME) return null;

      for (const [key, hazard] of announced) {
        if (distanceMeters(position.latitude, position.longitude, hazard.latitude, hazard.longitude) > REARM_DISTANCE_M) {
          announced.delete(key);
        }
      }

      const ahead = findHazardAhead(
        { latitude: position.latitude, longitude: position.longitude, heading, speedKmh },
        hazards,
        new Set(announced.keys()),
      );
      if (ahead) announced.set(ahead.hazard.key, ahead.hazard);
      return ahead;
    },
  };
}

/** Distance rounded to 5 m: GPS is only good to about ±5–15 m. */
export function roundedDistance(meters: number): number {
  return Math.max(5, Math.round(meters / 5) * 5);
}

const SPOKEN_NAMES: Record<string, string> = {
  Pothole: 'pothole',
  'Road Excavation': 'road excavation',
  'Road Barrier': 'road barrier',
};

/** e.g. "Known pothole ahead, about 40 meters." */
export function knownHazardVoice(ahead: HazardAhead): string {
  const name = SPOKEN_NAMES[ahead.hazard.type] ?? 'hazard';
  return `Known ${name} ahead, about ${roundedDistance(ahead.distance)} meters.`;
}

/** Card title, e.g. "Known Pothole ahead". */
export function knownHazardTitle(ahead: HazardAhead): string {
  return `Known ${ahead.hazard.type} ahead`;
}
