import { HAZARD_WARNINGS, LIGHT_VOICE, isTrafficLight } from '@/constants/hazards';
import { VOICE_ALERT_PRIORITY, DEFAULT_VOICE_PRIORITY } from '@/constants/detections';
import {
  CLUSTER_COUNT,
  CLUSTER_WINDOW_MS,
  COOLDOWN_MS,
  GONE_MS,
  POPUP_SPACING_MS,
  POTHOLE_MATCH_BOX_FACTOR,
  POTHOLE_MATCH_MAX_RISE,
  POTHOLE_MATCH_MIN,
  POTHOLE_PASSED_MS,
  RELATED_GROUPS,
  RELATED_MERGE_OVERLAP,
  ROAD_MIN_CENTER_Y,
  SAVE_MIN_CONFIDENCE,
  SIGHTING_WINDOW_MS,
  SLOW_SIGHTINGS,
  SLOW_SPEED_KMH,
  SMALL_BOX_EXTRA,
  SMALL_BOX_H,
  ZONE_END_MS,
  classTuning,
  groupName,
} from '@/constants/detection-tuning';
import roadSigns from '@/assets/data/road_sign_instructions.json';
import { distanceWord } from '@/lib/distance-estimator';
import type { DetectionResult } from '@/types';

/**
 * Decides when detected objects deserve a popup + voice alert, and which road hazards are saved.
 *
 * Triggers: ONE detection is enough while moving (the detector checks only ~6–7 frames per
 * second, so an object is often detected once); two when stopped/crawling. False alarms are
 * filtered by per-class levels, on-road position and box size. A detection at the class level
 * gives a normal popup + voice; the lower band gives a "possible" popup without voice.
 *
 * Grouping (what counts as "the same thing", so it's warned once per pass):
 *  - potholes: each pothole is its own object, followed in the video; passed after 1 s unseen,
 *  - road barriers: a row (one or both sides) is ONE barrier zone, ending after 3 s unseen,
 *  - excavation + barriers + road-work signs at one site: ONE road-work zone,
 *  - signs: per sign type; traffic lights: one group (a colour change warns again).
 * Short cooldowns between different objects of a kind (3 s hazards, 10 s per sign type, 5 s
 * lights). 3+ potholes in 10 s: one spoken "Rough road, slow down." and silent cards after.
 * Saving: one save per pothole / zone, from its strongest detection at the save level.
 * All values live in constants/detection-tuning.ts.
 */

type SignInfo = { name: string; popup: string; voice: string | null };
const SIGNS = roadSigns as Record<string, SignInfo>;

export type LatLng = {
  latitude: number;
  longitude: number;
  /** GPS accuracy radius in meters (how sure the phone is about the spot), saved with the hazard. */
  accuracy?: number | null;
  /** Direction of travel, degrees from north; null when stopped (saved with the hazard). */
  heading?: number | null;
};

export type AlertKind = 'road' | 'sign' | 'light';

/** "normal" = popup + voice; "possible" = softer popup, no voice (lower-confidence detection). */
export type AlertTier = 'normal' | 'possible';

/** What an alert is about: one pothole, a barrier zone, a road-work zone, a sign type, or the lights. */
type GroupKind = 'pothole' | 'barrierZone' | 'roadworkZone' | 'sign' | 'light';

export type Alert = {
  key: string;
  kind: AlertKind;
  tier: AlertTier;
  /** The nearest object of the group: the card follows it. */
  detection: DetectionResult;
  priority: number;
  /** Spoken first, and may cut into other speech (red light, children crossing, near hazard). */
  urgent: boolean;
  /** Short text for the popup card. */
  popup: string;
  /** Spoken text, or null for card-only alerts ("possible", unknown signs, rest of a cluster). */
  voice: string | null;
  /** Classes (groupName) the card may follow in later frames. */
  follow: readonly string[];
};

/** A road hazard object/zone that ended with a detection at the save level; its strongest one. */
export type HazardSave = {
  detection: DetectionResult;
  position: LatLng | null;
  at: number;
};

export type GateResult = { alert: Alert | null; saves: HazardSave[] };

type BBox = DetectionResult['bbox'];
type Evidence = { detection: DetectionResult; raw: number };

type GroupState = {
  kind: GroupKind;
  /** Cooldown bucket: same for all potholes, all barrier zones, one per sign type... */
  cooldownKey: string;
  /** Detection times within SIGHTING_WINDOW_MS (slow-speed rule). */
  hits: number[];
  lastSeenAt: number;
  /** Nearest member seen last frame (card follows it; pothole matching uses its box). */
  latest: DetectionResult;
  inEncounter: boolean;
  /** Cooldown decided this object/zone shows no popup. */
  blocked: boolean;
  alertedTier: AlertTier | null;
  /** Highest tier detected; kept while in view, so a single detection still gets its popup. */
  pendingTier: AlertTier | null;
  /** Strongest road-hazard detection at the save level (one save per object/zone). */
  best: HazardSave | null;
  bestRaw: number;
};

const ROAD_WORK_MEMBERS = ['Road Excavation', 'Road Barrier', 'sign:other'] as const;
const BARRIER_MEMBERS = ['Road Barrier', 'sign:other'] as const;
const LIGHT_MEMBERS = ['Traffic Light Red', 'Traffic Light Yellow', 'Traffic Light Green'] as const;
const LIGHT_KEY = 'traffic-light';
const TIER_RANK: Record<AlertTier, number> = { possible: 1, normal: 2 };

/** Pothole cluster voice; later pothole cards in the cluster are silent. */
const CLUSTER_VOICE = 'Rough road, slow down.';

const ZONE_NAME: Record<'pothole' | 'barrierZone' | 'roadworkZone', string> = {
  pothole: 'Pothole',
  barrierZone: 'Barrier',
  roadworkZone: 'Roadwork',
};

const isRoadType = (type: string) => type === 'Pothole' || type === 'Road Excavation' || type === 'Road Barrier';

function overlapOfSmaller(a: BBox, b: BBox): number {
  const iw = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const ih = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const smaller = Math.min(a.w * a.h, b.w * b.h);
  return smaller <= 0 ? 0 : (iw * ih) / smaller;
}

const centerOf = (b: BBox) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const area = (b: BBox) => b.w * b.h;

/** A detection in a place its class can't be: a pothole/excavation in the sky. */
function plausible(d: DetectionResult): boolean {
  if (!classTuning(d).onRoad) return true;
  return d.bbox.y + d.bbox.h / 2 >= ROAD_MIN_CENTER_Y;
}

/**
 * Merges overlapping boxes of related classes into one object: the stronger class wins and the
 * confidences combine (1 - (1-a)(1-b)); the class's own confidence is kept as `raw`.
 */
function mergeRelated(results: DetectionResult[]): Evidence[] {
  const sorted = [...results].sort((a, b) => b.confidence - a.confidence);
  const kept: Evidence[] = [];
  for (const d of sorted) {
    const group = RELATED_GROUPS.find((g) => g.includes(groupName(d)));
    const target = group
      ? kept.find(
          (k) =>
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

/** Tier one detection supports on its own (class level, tiny-box extra). */
function evidenceTier({ detection: d, raw }: Evidence): AlertTier | null {
  const tuning = classTuning(d);
  const extra = d.bbox.h < SMALL_BOX_H ? SMALL_BOX_EXTRA : 0;
  // Normal uses the class's own confidence; merged evidence only helps the "possible" tier.
  if (raw >= tuning.normal + extra) return 'normal';
  if (d.confidence >= tuning.possible + extra) return 'possible';
  return null;
}

function goneAfter(kind: GroupKind): number {
  if (kind === 'pothole') return POTHOLE_PASSED_MS;
  if (kind === 'barrierZone' || kind === 'roadworkZone') return ZONE_END_MS;
  return GONE_MS;
}

function buildAlert(key: string, st: GroupState, tier: AlertTier, d: DetectionResult): Alert {
  const signKey = d.signKey;
  const groupPriorityKey =
    st.kind === 'light' ? d.type : st.kind === 'sign' ? `sign:${signKey ?? 'other'}` : 'Pothole';
  const priority = VOICE_ALERT_PRIORITY[groupPriorityKey] ?? DEFAULT_VOICE_PRIORITY;

  if (st.kind === 'pothole' || st.kind === 'barrierZone' || st.kind === 'roadworkZone') {
    const name = ZONE_NAME[st.kind];
    const near = d.distance !== undefined && distanceWord(d.distance) === 'near';
    const follow =
      st.kind === 'pothole' ? ['Pothole'] : st.kind === 'barrierZone' ? [...BARRIER_MEMBERS] : [...ROAD_WORK_MEMBERS];
    // Card shows the roadwork icon even when the nearest member is a barrier or sign.
    const shown = st.kind === 'roadworkZone' ? { ...d, type: 'Road Excavation', signKey: undefined } : d;
    return {
      key, kind: 'road', tier, detection: shown, priority, follow,
      urgent: tier === 'normal' && near,
      popup: tier === 'possible' ? `Possible ${name.toLowerCase()}` : name,
      voice: tier === 'possible' ? null : near ? `${name}, slow down.` : `${name} ahead.`,
    };
  }

  if (st.kind === 'light') {
    const color = d.type.replace('Traffic Light ', '').toLowerCase();
    return {
      key, kind: 'light', tier, detection: d, priority, follow: [...LIGHT_MEMBERS],
      urgent: tier === 'normal' && d.type === 'Traffic Light Red',
      popup: tier === 'possible' ? `Possible ${color} light` : HAZARD_WARNINGS[d.type] ?? d.type,
      voice: tier === 'possible' ? null : LIGHT_VOICE[d.type] ?? null,
    };
  }

  const sign = signKey ? SIGNS[signKey] : undefined;
  return {
    key, kind: 'sign', tier, detection: d, priority, follow: [key],
    urgent: tier === 'normal' && signKey === 'children_crossing',
    popup: tier === 'possible' ? `Possible ${(sign?.name ?? 'traffic sign').toLowerCase()}` : sign?.popup ?? 'Traffic sign',
    voice: tier === 'possible' ? null : sign?.voice ?? null,
  };
}

export class AlertGate {
  private groups = new Map<string, GroupState>();
  /** Per cooldown bucket: when it last warned and (lights) which colour. */
  private lastAlert = new Map<string, { at: number; type: string }>();
  private lastGlobalAlertAt = -Infinity;
  private potholeAlertTimes: number[] = [];
  private nextPotholeId = 1;

  /**
   * Feed one frame's detections (all of them, including weak ones). Returns the single alert to
   * show/speak now (or null) and any road hazard objects/zones that ended with a save-level
   * detection. `position` is the rider's latest GPS fix, `speedKmh` the GPS speed (null if unknown).
   */
  process(
    results: DetectionResult[],
    now: number,
    position: LatLng | null,
    speedKmh: number | null = null,
  ): GateResult {
    const evidence = mergeRelated(results.filter(plausible));

    // 1. Assign each detection to its object/zone for this frame.
    const frame = new Map<string, Evidence[]>();
    const add = (key: string, ev: Evidence) => frame.set(key, [...(frame.get(key) ?? []), ev]);

    const isActive = (key: string) => {
      const g = this.groups.get(key);
      return !!g && now - g.lastSeenAt <= goneAfter(g.kind);
    };
    const excavationNow = evidence.some((e) => e.detection.type === 'Road Excavation');
    const barrierNow = evidence.some((e) => e.detection.type === 'Road Barrier');
    const roadworkOn = excavationNow || isActive('zone:roadwork');

    for (const ev of evidence) {
      const g = groupName(ev.detection);
      if (g === 'Pothole') continue; // matched individually below
      if (g === 'Road Excavation') add('zone:roadwork', ev);
      else if (g === 'Road Barrier') add(roadworkOn ? 'zone:roadwork' : 'zone:barrier', ev);
      else if (g === 'sign:other' && roadworkOn) add('zone:roadwork', ev);
      else if (g === 'sign:other' && (barrierNow || isActive('zone:barrier'))) add('zone:barrier', ev);
      else if (isTrafficLight(ev.detection.type)) add(LIGHT_KEY, ev);
      else add(g, ev);
    }
    for (const [key, ev] of this.matchPotholes(evidence.filter((e) => e.detection.type === 'Pothole'), now)) {
      add(key, ev);
    }

    // 2. Update each object/zone seen this frame.
    for (const [key, members] of frame) {
      // The card follows the nearest (largest) member.
      const nearest = members.reduce((a, b) => (area(b.detection.bbox) > area(a.detection.bbox) ? b : a));
      let st = this.groups.get(key);
      if (!st) {
        const kind: GroupKind = key.startsWith('pothole#')
          ? 'pothole'
          : key === 'zone:barrier'
            ? 'barrierZone'
            : key === 'zone:roadwork'
              ? 'roadworkZone'
              : key === LIGHT_KEY
                ? 'light'
                : 'sign';
        st = {
          kind,
          cooldownKey: kind === 'pothole' ? 'pothole' : key,
          hits: [], lastSeenAt: -Infinity, latest: nearest.detection,
          inEncounter: false, blocked: false, alertedTier: null, pendingTier: null,
          best: null, bestRaw: 0,
        };
        this.groups.set(key, st);
      }
      // A light changing colour starts a new count for the new colour.
      if (st.kind === 'light' && st.latest.type !== nearest.detection.type) {
        st.hits = [];
        st.pendingTier = null;
      }
      st.hits.push(now);
      st.lastSeenAt = now;
      st.latest = nearest.detection;

      // One save per object/zone: its strongest road-hazard detection at the save level
      // (the class's own confidence; a bigger box breaks ties: closer = better GPS match).
      for (const m of members) {
        if (!isRoadType(m.detection.type) || m.raw < SAVE_MIN_CONFIDENCE) continue;
        const better =
          !st.best || m.raw > st.bestRaw || (m.raw === st.bestRaw && area(m.detection.bbox) > area(st.best.detection.bbox));
        if (better) {
          // Save the model's own score for this box, never the merged value used for popups.
          st.best = { detection: { ...m.detection, confidence: m.raw }, position, at: now };
          st.bestRaw = m.raw;
        }
      }

      // Best tier any member supports; stopped/crawling needs two detections.
      const slow = speedKmh !== null && speedKmh < SLOW_SPEED_KMH;
      st.hits = st.hits.filter((t) => now - t <= SIGHTING_WINDOW_MS);
      let tier: AlertTier | null = null;
      if (!slow || st.hits.length >= SLOW_SIGHTINGS) {
        for (const m of members) {
          const t = evidenceTier(m);
          if (t && (!tier || TIER_RANK[t] > TIER_RANK[tier])) tier = t;
        }
      }
      if (tier && (!st.pendingTier || TIER_RANK[tier] > TIER_RANK[st.pendingTier])) st.pendingTier = tier;
      if (tier && !st.inEncounter) {
        st.inEncounter = true;
        st.blocked = !this.worthAlerting(st, now);
      }
    }

    // 3. Finished objects/zones release their save and are forgotten.
    const saves: HazardSave[] = [];
    for (const [key, st] of this.groups) {
      if (now - st.lastSeenAt <= goneAfter(st.kind)) continue;
      if (st.best) saves.push(st.best);
      this.groups.delete(key);
    }

    // 4. Collect popups due, then fire the most urgent one.
    const candidates: { alert: Alert; st: GroupState }[] = [];
    for (const [key, st] of this.groups) {
      const due = st.pendingTier;
      const upgrade = due !== null && TIER_RANK[due] > (st.alertedTier ? TIER_RANK[st.alertedTier] : 0);
      // Kept while the light is in view, so a colour change during the popup gap isn't lost.
      const lightChanged =
        st.kind === 'light' &&
        due === 'normal' &&
        st.alertedTier !== null &&
        this.lastAlert.get(st.cooldownKey)?.type !== st.latest.type;
      if (due && ((!st.blocked && upgrade) || lightChanged)) {
        candidates.push({ alert: buildAlert(key, st, due, st.latest), st });
      }
    }

    if (candidates.length === 0 || now - this.lastGlobalAlertAt < POPUP_SPACING_MS) {
      return { alert: null, saves };
    }

    candidates.sort(
      (a, b) =>
        Number(b.alert.urgent) - Number(a.alert.urgent) ||
        TIER_RANK[b.alert.tier] - TIER_RANK[a.alert.tier] ||
        a.alert.priority - b.alert.priority ||
        b.alert.detection.confidence - a.alert.detection.confidence,
    );
    const { alert, st } = candidates[0];

    // Pothole clusters: the 3rd warning in 10 s speaks once for all; later ones stay silent.
    if (st.kind === 'pothole' && alert.voice) {
      this.potholeAlertTimes = this.potholeAlertTimes.filter((t) => now - t <= CLUSTER_WINDOW_MS);
      this.potholeAlertTimes.push(now);
      const n = this.potholeAlertTimes.length;
      if (n === CLUSTER_COUNT) alert.voice = CLUSTER_VOICE;
      else if (n > CLUSTER_COUNT && !alert.urgent) alert.voice = null;
    }

    st.alertedTier = alert.tier;
    this.lastAlert.set(st.cooldownKey, { at: now, type: st.latest.type });
    this.lastGlobalAlertAt = now;
    return { alert, saves };
  }

  /** Clears all memory, e.g. when a ride ends. */
  reset(): void {
    this.groups.clear();
    this.lastAlert.clear();
    this.potholeAlertTimes = [];
    this.lastGlobalAlertAt = -Infinity;
  }

  /**
   * Gives each pothole detection its object: the closest active pothole it plausibly moved from
   * (overlapping, or near and not jumping up the screen), else a new pothole.
   */
  private matchPotholes(potholes: Evidence[], now: number): [string, Evidence][] {
    const out: [string, Evidence][] = [];
    const used = new Set<string>();
    const sorted = [...potholes].sort((a, b) => b.detection.confidence - a.detection.confidence);
    for (const ev of sorted) {
      const box = ev.detection.bbox;
      const c = centerOf(box);
      let bestKey: string | null = null;
      let bestDist = Infinity;
      for (const [key, st] of this.groups) {
        if (st.kind !== 'pothole' || used.has(key) || now - st.lastSeenAt > POTHOLE_PASSED_MS) continue;
        const prev = st.latest.bbox;
        const pc = centerOf(prev);
        const dist = Math.hypot(c.x - pc.x, c.y - pc.y);
        const allowed = Math.max(POTHOLE_MATCH_MIN, POTHOLE_MATCH_BOX_FACTOR * Math.max(prev.w, prev.h, box.w, box.h));
        const same = overlapOfSmaller(prev, box) >= 0.3 || (dist <= allowed && c.y >= pc.y - POTHOLE_MATCH_MAX_RISE);
        if (same && dist < bestDist) {
          bestDist = dist;
          bestKey = key;
        }
      }
      const key = bestKey ?? `pothole#${this.nextPotholeId++}`;
      used.add(key);
      out.push([key, ev]);
    }
    return out;
  }

  /** Cooldown between different objects/zones of the same kind (the same one never repeats). */
  private worthAlerting(st: GroupState, now: number): boolean {
    const last = this.lastAlert.get(st.cooldownKey);
    if (!last) return true;
    const elapsed = now - last.at;
    switch (st.kind) {
      case 'pothole':
        return elapsed >= COOLDOWN_MS.pothole;
      case 'barrierZone':
        return elapsed >= COOLDOWN_MS.barrierZone;
      case 'roadworkZone':
        return elapsed >= COOLDOWN_MS.roadworkZone;
      case 'light':
        return elapsed >= COOLDOWN_MS.light || st.latest.type !== last.type;
      case 'sign':
        // Time only: a repeated sign type within 10 s gets one reminder.
        return elapsed >= COOLDOWN_MS.sign;
    }
  }
}

/** Identity used by older callers: the class group of a detection. */
export function alertKey(d: DetectionResult): string {
  return groupName(d);
}
