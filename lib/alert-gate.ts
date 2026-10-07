import {
  HAZARD_WARNINGS,
  LIGHT_VOICE,
  isTrafficLight,
} from '@/constants/hazards';
import { VOICE_ALERT_PRIORITY, DEFAULT_VOICE_PRIORITY } from '@/constants/detections';
import roadSigns from '@/assets/data/road_sign_instructions.json';
import { distanceWord, type DistanceWord } from '@/lib/distance-estimator';
import type { DetectionResult } from '@/types';

const HAZARD_VOICE: Record<DistanceWord, (type: string) => string> = {
  near: (type) => `${type} near. Slow down.`,
  ahead: (type) => `${type} ahead.`,
  far: (type) => `${type} far ahead.`,
};

/**
 * Decides when a detected object deserves a popup + voice alert.
 *
 * YOLO reports the same object on every frame it stays in view, so alerting
 * per frame repeats endlessly. The gate turns frames into "encounters":
 *  1. Confirm  — seen at least CONFIRM_HITS times, spread over CONFIRM_SPAN_MS,
 *                within CONFIRM_WINDOW_MS (ignores 1-frame blips).
 *  2. Alert once per encounter; later frames only keep it "in view".
 *  3. The encounter ends after GONE_MS without a sighting.
 *  4. A new encounter alerts again only when it is genuinely new
 *     (per-kind cooldown, sign distance, or a traffic-light colour change).
 * All rules use timestamps, not frame counts, so they behave the same at
 * 4 FPS or 30 FPS.
 */

const MIN_CONFIDENCE = 0.6;
const CONFIRM_HITS = 2;
const CONFIRM_SPAN_MS = 150;
const CONFIRM_WINDOW_MS = 1000;
const GONE_MS = 2000;
const GLOBAL_SPACING_MS = 2500;

const ROAD_HAZARD_COOLDOWN_MS = 15_000;
const SIGN_COOLDOWN_MS = 60_000;
const SIGN_MIN_DISTANCE_M = 100;
const LIGHT_COOLDOWN_MS = 10_000;
const LIGHT_COLOR_CHANGE_GAP_MS = 3000;

const LIGHT_KEY = 'traffic-light';

type SignInfo = { name: string; popup: string; voice: string | null };
const SIGNS = roadSigns as Record<string, SignInfo>;

export type LatLng = { latitude: number; longitude: number };

export type AlertKind = 'road' | 'sign' | 'light';

export type Alert = {
  key: string;
  kind: AlertKind;
  detection: DetectionResult;
  priority: number;
  /** Short text for the popup card. */
  popup: string;
  /** Spoken text, or null for popup-only alerts (unknown signs). */
  voice: string | null;
};

type KeyState = {
  hits: number[];
  lastSeenAt: number;
  latest: DetectionResult;
  inEncounter: boolean;
  /** Alert for this encounter already fired, or was deliberately skipped. */
  handled: boolean;
  lastAlertAt: number;
  lastAlertPos: LatLng | null;
  /** Lights only: colour (type) last alerted, and colour currently seen. */
  alertedType: string | null;
};

/** Identity of an object across frames (all traffic lights share one key). */
export function alertKey(d: DetectionResult): string {
  if (isTrafficLight(d.type)) return LIGHT_KEY;
  if (d.signKey) return `sign:${d.signKey}`;
  return d.type;
}

function kindOf(d: DetectionResult): AlertKind {
  if (isTrafficLight(d.type)) return 'light';
  if (d.signKey) return 'sign';
  return 'road';
}

function metersBetween(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function buildAlert(key: string, d: DetectionResult): Alert {
  const kind = kindOf(d);
  // Lights are ranked by colour, signs and hazards by their own key.
  const priorityKey = kind === 'light' ? d.type : key;
  const priority = VOICE_ALERT_PRIORITY[priorityKey] ?? DEFAULT_VOICE_PRIORITY;

  if (kind === 'sign') {
    const sign = d.signKey ? SIGNS[d.signKey] : undefined;
    return {
      key, kind, detection: d, priority,
      popup: sign?.popup ?? 'Traffic sign ahead',
      voice: sign?.voice ?? null,
    };
  }

  if (kind === 'light') {
    return {
      key, kind, detection: d, priority,
      popup: HAZARD_WARNINGS[d.type] ?? d.type,
      voice: LIGHT_VOICE[d.type] ?? null,
    };
  }

  const word = d.distance !== undefined ? distanceWord(d.distance) : 'ahead';
  return {
    key, kind, detection: d, priority,
    popup: HAZARD_WARNINGS[d.type] ?? `${d.type} ahead`,
    voice: HAZARD_VOICE[word](d.type),
  };
}

export class AlertGate {
  private states = new Map<string, KeyState>();
  private lastGlobalAlertAt = -Infinity;

  /**
   * Feed one frame's detections. Returns the single alert to show/speak now,
   * or null. `position` is the rider's latest GPS fix (used for signs).
   */
  process(results: DetectionResult[], now: number, position: LatLng | null): Alert | null {
    // 1. Record sightings (one per key per frame — several barriers in one
    //    frame are one sighting of "Road Barrier").
    const seenThisFrame = new Map<string, DetectionResult>();
    for (const d of results) {
      if (d.confidence < MIN_CONFIDENCE) continue;
      const key = alertKey(d);
      const prev = seenThisFrame.get(key);
      if (!prev || d.confidence > prev.confidence) seenThisFrame.set(key, d);
    }

    for (const [key, d] of seenThisFrame) {
      let st = this.states.get(key);
      if (!st) {
        st = {
          hits: [], lastSeenAt: now, latest: d, inEncounter: false, handled: false,
          lastAlertAt: -Infinity, lastAlertPos: null, alertedType: null,
        };
        this.states.set(key, st);
      }
      // A light changing colour restarts confirmation for the new colour.
      if (key === LIGHT_KEY && st.latest.type !== d.type) st.hits = [];
      st.hits.push(now);
      st.lastSeenAt = now;
      st.latest = d;
    }

    // 2. Expire encounters and stale hits.
    for (const st of this.states.values()) {
      st.hits = st.hits.filter((t) => now - t <= CONFIRM_WINDOW_MS);
      if (st.inEncounter && now - st.lastSeenAt > GONE_MS) {
        st.inEncounter = false;
        st.handled = false;
      }
    }

    // 3. Collect objects due an alert.
    const candidates: Alert[] = [];
    for (const [key, st] of this.states) {
      if (now - st.lastSeenAt > GONE_MS) continue;

      const confirmed =
        st.hits.length >= CONFIRM_HITS && st.hits[st.hits.length - 1] - st.hits[0] >= CONFIRM_SPAN_MS;
      if (!confirmed && !st.inEncounter) continue;

      if (!st.inEncounter) {
        st.inEncounter = true;
        st.handled = !this.isNewEncounterWorthAlerting(key, st, now, position);
      }

      const lightChanged =
        key === LIGHT_KEY &&
        st.handled &&
        confirmed &&
        st.alertedType !== null &&
        st.latest.type !== st.alertedType &&
        now - st.lastAlertAt >= LIGHT_COLOR_CHANGE_GAP_MS;

      if (!st.handled || lightChanged) candidates.push(buildAlert(key, st.latest));
    }

    if (candidates.length === 0 || now - this.lastGlobalAlertAt < GLOBAL_SPACING_MS) return null;

    // 4. Fire the most urgent one; the rest wait for the next free slot while
    //    they stay in view.
    candidates.sort(
      (a, b) => a.priority - b.priority || b.detection.confidence - a.detection.confidence,
    );
    const alert = candidates[0];
    const st = this.states.get(alert.key)!;
    st.handled = true;
    st.lastAlertAt = now;
    st.lastAlertPos = position;
    st.alertedType = alert.detection.type;
    this.lastGlobalAlertAt = now;
    return alert;
  }

  /** Clears all memory, e.g. when a ride ends. */
  reset(): void {
    this.states.clear();
    this.lastGlobalAlertAt = -Infinity;
  }

  private isNewEncounterWorthAlerting(
    key: string,
    st: KeyState,
    now: number,
    position: LatLng | null,
  ): boolean {
    if (st.lastAlertAt === -Infinity) return true;
    const elapsed = now - st.lastAlertAt;

    if (key === LIGHT_KEY) {
      return elapsed >= LIGHT_COOLDOWN_MS || st.latest.type !== st.alertedType;
    }

    if (key.startsWith('sign:')) {
      if (elapsed < SIGN_COOLDOWN_MS) return false;
      // Without GPS, fall back to time alone.
      if (!position || !st.lastAlertPos) return true;
      return metersBetween(position, st.lastAlertPos) >= SIGN_MIN_DISTANCE_M;
    }

    return elapsed >= ROAD_HAZARD_COOLDOWN_MS;
  }
}
