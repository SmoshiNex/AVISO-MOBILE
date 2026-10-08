import {
  HAZARD_WARNINGS,
  LIGHT_VOICE,
  isTrafficLight,
} from '@/constants/hazards';
import { VOICE_ALERT_PRIORITY, DEFAULT_VOICE_PRIORITY } from '@/constants/detections';
import {
  CONFIRM_FAST_SIGHTINGS,
  CONFIRM_SPAN_MS,
  CONFIRM_WINDOW_MS,
  FAR_THRESHOLD_DROP,
  FAST_PATH_CONFIDENCE,
  GONE_MS,
  LARGE_BOX_H,
  POPUP_SPACING_MS,
  POSSIBLE_MIN_MS,
  POSSIBLE_SIGHTINGS,
  RELATED_GROUPS,
  RELATED_MERGE_OVERLAP,
  SAVE_MIN_SIGHTINGS,
  SAVE_MIN_SMOOTHED,
  SIGHTINGS_CLOSE,
  SIGHTINGS_FAR,
  SMALL_BOX_H,
  SMOOTHING_TAU_MS,
  STEADY_CENTER_SHIFT,
  STEADY_IOU,
  classTuning,
  groupName,
} from '@/constants/detection-tuning';
import roadSigns from '@/assets/data/road_sign_instructions.json';
import { distanceWord, type DistanceWord } from '@/lib/distance-estimator';
import type { DetectionResult } from '@/types';

const HAZARD_VOICE: Record<DistanceWord, (type: string) => string> = {
  near: (type) => `${type} near. Slow down.`,
  ahead: (type) => `${type} ahead.`,
  far: (type) => `${type} far ahead.`,
};

/**
 * Decides when a detected object deserves a popup + voice alert, and when a road hazard is
 * confident enough to be saved to Hazard Logs.
 *
 * YOLO reports the same object on every frame and its confidence jumps between frames, so a
 * per-frame threshold is both late and noisy. Instead, each object keeps a smoothed confidence
 * (time-weighted, so it behaves the same at any FPS) and the bar it must clear adapts:
 *  - per class (weak classes like pothole get a lower bar),
 *  - per distance (small, far boxes pass with a lower bar but need more sightings),
 *  - a very confident frame takes a fast path,
 *  - weak but steady objects (same place, frame after frame) get a softer "possible" warning
 *    without voice, upgraded to a normal warning if confidence rises,
 *  - related classes overlapping one object (excavation + other sign) are merged.
 * Once warned, an object stays warned for the whole encounter (until gone for GONE_MS), and
 * cooldowns stop the same sign/hazard repeating. Saving uses a stricter, separate rule.
 * All values live in constants/detection-tuning.ts.
 */

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

/** "normal" = popup + voice; "possible" = softer popup, no voice (weak but steady object). */
export type AlertTier = 'normal' | 'possible';

export type Alert = {
  key: string;
  kind: AlertKind;
  tier: AlertTier;
  detection: DetectionResult;
  priority: number;
  /** Short text for the popup card. */
  popup: string;
  /** Spoken text, or null for popup-only alerts (unknown signs, "possible" warnings). */
  voice: string | null;
};

/** A road hazard encounter that met the save rule; detection = its closest (largest) sighting. */
export type HazardSave = {
  detection: DetectionResult;
  position: LatLng | null;
  at: number;
};

export type GateResult = { alert: Alert | null; saves: HazardSave[] };

type BBox = DetectionResult['bbox'];

type KeyState = {
  /** Sighting times within CONFIRM_WINDOW_MS. */
  hits: number[];
  lastSeenAt: number;
  latest: DetectionResult;
  /** Trend of the merged confidence: evidence for "possible" warnings only. */
  smoothed: number;
  /**
   * Trend of the class's own confidence: used for normal warnings and saving, so merging two weak
   * classes can never produce a voiced warning or a saved hazard on its own.
   */
  rawSmoothed: number;
  /** The class's own confidence in the latest frame (fast path). */
  latestRaw: number;
  lastBox: BBox | null;
  /** Consecutive sightings in about the same place, and when that run started. */
  steadyCount: number;
  steadySince: number;

  inEncounter: boolean;
  /** Cooldown decided this encounter shows no popup. */
  blocked: boolean;
  /** Highest tier already shown this encounter. */
  alertedTier: AlertTier | null;
  lastAlertAt: number;
  lastAlertPos: LatLng | null;
  /** Lights only: colour (type) last alerted. */
  alertedType: string | null;

  /** Road hazards: met the save rule this encounter, and its closest sighting so far. */
  saveEligible: boolean;
  best: HazardSave | null;
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

function iou(a: BBox, b: BBox): number {
  const iw = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const ih = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = iw * ih;
  const union = a.w * a.h + b.w * b.h - inter;
  return union <= 0 ? 0 : inter / union;
}

/** Share of the smaller box covered by the other: 1 when a small box sits inside a big one. */
function overlapOfSmaller(a: BBox, b: BBox): number {
  const iw = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const ih = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const smaller = Math.min(a.w * a.h, b.w * b.h);
  return smaller <= 0 ? 0 : (iw * ih) / smaller;
}

function isSteady(prev: BBox, next: BBox): boolean {
  if (iou(prev, next) >= STEADY_IOU) return true;
  const shift = Math.hypot(
    prev.x + prev.w / 2 - (next.x + next.w / 2),
    prev.y + prev.h / 2 - (next.y + next.h / 2),
  );
  return shift <= STEADY_CENTER_SHIFT;
}

/** 0 for a small (far) box, 1 for a large (close) one, linear in between. */
function closeness(bbox: BBox): number {
  return Math.min(1, Math.max(0, (bbox.h - SMALL_BOX_H) / (LARGE_BOX_H - SMALL_BOX_H)));
}

type Evidence = { detection: DetectionResult; raw: number };

/**
 * Merges overlapping boxes of related classes into one object: the stronger class wins and the
 * confidences combine (1 - (1-a)(1-b)), since both are evidence of the same object.
 */
function mergeRelated(results: DetectionResult[]): Evidence[] {
  const sorted = [...results].sort((a, b) => b.confidence - a.confidence);
  const kept: Evidence[] = [];
  for (const d of sorted) {
    const group = RELATED_GROUPS.find((g) => g.includes(groupName(d)));
    const target = group
      ? kept.find(
          (k) =>
            k.detection !== d &&
            group.includes(groupName(k.detection)) &&
            overlapOfSmaller(k.detection.bbox, d.bbox) >= RELATED_MERGE_OVERLAP,
        )
      : undefined;
    if (target) {
      const combined = 1 - (1 - target.detection.confidence) * (1 - d.confidence);
      target.detection = { ...target.detection, confidence: Math.min(0.99, combined) };
    } else {
      kept.push({ detection: d, raw: d.confidence });
    }
  }
  return kept;
}

function possibleLabel(d: DetectionResult): string {
  if (d.signKey) return SIGNS[d.signKey]?.name?.toLowerCase() ?? 'traffic sign';
  if (isTrafficLight(d.type)) return `${d.type.replace('Traffic Light ', '').toLowerCase()} traffic light`;
  return d.type.toLowerCase();
}

function buildAlert(key: string, d: DetectionResult, tier: AlertTier): Alert {
  const kind = kindOf(d);
  // Lights are ranked by colour, signs and hazards by their own key.
  const priorityKey = kind === 'light' ? d.type : key;
  const priority = VOICE_ALERT_PRIORITY[priorityKey] ?? DEFAULT_VOICE_PRIORITY;

  if (tier === 'possible') {
    return { key, kind, tier, detection: d, priority, popup: `Possible ${possibleLabel(d)} ahead`, voice: null };
  }

  if (kind === 'sign') {
    const sign = d.signKey ? SIGNS[d.signKey] : undefined;
    return {
      key, kind, tier, detection: d, priority,
      popup: sign?.popup ?? 'Traffic sign ahead',
      voice: sign?.voice ?? null,
    };
  }

  if (kind === 'light') {
    return {
      key, kind, tier, detection: d, priority,
      popup: HAZARD_WARNINGS[d.type] ?? d.type,
      voice: LIGHT_VOICE[d.type] ?? null,
    };
  }

  const word = d.distance !== undefined ? distanceWord(d.distance) : 'ahead';
  return {
    key, kind, tier, detection: d, priority,
    popup: HAZARD_WARNINGS[d.type] ?? `${d.type} ahead`,
    voice: HAZARD_VOICE[word](d.type),
  };
}

const TIER_RANK: Record<AlertTier, number> = { possible: 1, normal: 2 };

export class AlertGate {
  private states = new Map<string, KeyState>();
  private lastGlobalAlertAt = -Infinity;

  /**
   * Feed one frame's detections (all of them, including weak ones). Returns the single alert to
   * show/speak now (or null) and any road hazards whose encounter ended and met the save rule.
   * `position` is the rider's latest GPS fix.
   */
  process(results: DetectionResult[], now: number, position: LatLng | null): GateResult {
    // 1. One piece of evidence per key per frame (several barriers in one frame are one sighting).
    const seenThisFrame = new Map<string, Evidence>();
    for (const ev of mergeRelated(results)) {
      const key = alertKey(ev.detection);
      const prev = seenThisFrame.get(key);
      if (!prev || ev.detection.confidence > prev.detection.confidence) seenThisFrame.set(key, ev);
    }

    for (const [key, { detection: d, raw }] of seenThisFrame) {
      let st = this.states.get(key);
      if (!st) {
        st = {
          hits: [], lastSeenAt: -Infinity, latest: d, smoothed: 0, rawSmoothed: 0, latestRaw: raw,
          lastBox: null, steadyCount: 0, steadySince: now,
          inEncounter: false, blocked: false, alertedTier: null,
          lastAlertAt: -Infinity, lastAlertPos: null, alertedType: null,
          saveEligible: false, best: null,
        };
        this.states.set(key, st);
      }

      const fresh = now - st.lastSeenAt > GONE_MS;
      // A light changing colour restarts the evidence for the new colour.
      const colourChange = key === LIGHT_KEY && st.latest.type !== d.type;
      if (fresh || colourChange) {
        st.smoothed = d.confidence;
        st.rawSmoothed = raw;
        st.hits = [];
        st.lastBox = null;
      } else {
        // Time-weighted average: the same at 6 or 30 FPS.
        const alpha = 1 - Math.exp(-(now - st.lastSeenAt) / SMOOTHING_TAU_MS);
        st.smoothed += alpha * (d.confidence - st.smoothed);
        st.rawSmoothed += alpha * (raw - st.rawSmoothed);
      }

      if (st.lastBox && isSteady(st.lastBox, d.bbox)) {
        st.steadyCount += 1;
      } else {
        st.steadyCount = 1;
        st.steadySince = now;
      }
      st.lastBox = d.bbox;
      st.hits.push(now);
      st.lastSeenAt = now;
      st.latest = d;
      st.latestRaw = raw;
    }

    // 2. Expire stale sightings; finished encounters release their save.
    const saves: HazardSave[] = [];
    for (const st of this.states.values()) {
      st.hits = st.hits.filter((t) => now - t <= CONFIRM_WINDOW_MS);
      if (now - st.lastSeenAt > GONE_MS) {
        if (st.saveEligible && st.best) saves.push(st.best);
        st.saveEligible = false;
        st.best = null;
        st.inEncounter = false;
        st.blocked = false;
        st.alertedTier = null;
        st.steadyCount = 0;
      }
    }

    // 3. Save rule (road hazards only, strict) and warning tiers.
    const candidates: Alert[] = [];
    for (const [key, st] of this.states) {
      if (now - st.lastSeenAt > GONE_MS) continue;
      const d = st.latest;

      if (kindOf(d) === 'road' && seenThisFrame.has(key)) {
        if (st.rawSmoothed >= SAVE_MIN_SMOOTHED && st.hits.length >= SAVE_MIN_SIGHTINGS) {
          st.saveEligible = true;
        }
        // Keep the closest sighting (largest box): best position and confidence for the logs.
        if (st.saveEligible) {
          const area = d.bbox.w * d.bbox.h;
          const bestArea = st.best ? st.best.detection.bbox.w * st.best.detection.bbox.h : -1;
          if (area >= bestArea) st.best = { detection: d, position, at: now };
        }
      }

      const tier = this.tierFor(st, now);
      if (tier && !st.inEncounter) {
        st.inEncounter = true;
        st.blocked = !this.isNewEncounterWorthAlerting(key, st, now, position);
      }

      const lightChanged =
        key === LIGHT_KEY &&
        tier === 'normal' &&
        st.alertedType !== null &&
        d.type !== st.alertedType &&
        now - st.lastAlertAt >= LIGHT_COLOR_CHANGE_GAP_MS;

      const upgrade = tier !== null && TIER_RANK[tier] > (st.alertedTier ? TIER_RANK[st.alertedTier] : 0);
      if (tier && ((!st.blocked && upgrade) || lightChanged)) candidates.push(buildAlert(key, d, tier));
    }

    if (candidates.length === 0 || now - this.lastGlobalAlertAt < POPUP_SPACING_MS) {
      return { alert: null, saves };
    }

    // 4. Fire the most urgent one; the rest stay queued while their object is in view.
    candidates.sort(
      (a, b) =>
        TIER_RANK[b.tier] - TIER_RANK[a.tier] ||
        a.priority - b.priority ||
        b.detection.confidence - a.detection.confidence,
    );
    const alert = candidates[0];
    const st = this.states.get(alert.key)!;
    st.alertedTier = alert.tier;
    st.lastAlertAt = now;
    st.lastAlertPos = position;
    st.alertedType = alert.detection.type;
    this.lastGlobalAlertAt = now;
    return { alert, saves };
  }

  /** Clears all memory, e.g. when a ride ends. */
  reset(): void {
    this.states.clear();
    this.lastGlobalAlertAt = -Infinity;
  }

  /** Which warning (if any) the object's evidence supports right now. */
  private tierFor(st: KeyState, now: number): AlertTier | null {
    const d = st.latest;
    const tuning = classTuning(d);
    const span = st.hits.length > 0 ? st.hits[st.hits.length - 1] - st.hits[0] : 0;

    const t = closeness(d.bbox);
    const normalThreshold = tuning.normal - FAR_THRESHOLD_DROP * (1 - t);
    const sightingsNeeded = t < 0.5 ? SIGHTINGS_FAR : SIGHTINGS_CLOSE;
    const trendPasses =
      st.rawSmoothed >= normalThreshold && st.hits.length >= sightingsNeeded && span >= CONFIRM_SPAN_MS;
    const fastPasses =
      st.latestRaw >= FAST_PATH_CONFIDENCE && st.hits.length >= CONFIRM_FAST_SIGHTINGS && span >= CONFIRM_SPAN_MS;
    if (trendPasses || fastPasses) return 'normal';

    const steadyPasses =
      st.smoothed >= tuning.possible &&
      st.steadyCount >= POSSIBLE_SIGHTINGS &&
      now - st.steadySince >= POSSIBLE_MIN_MS;
    return steadyPasses ? 'possible' : null;
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
