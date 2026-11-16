import { useEffect, useState } from 'react';
import type { LatLng } from '@/lib/alert-gate';
import { announce } from '@/lib/voice-queue';
import { createAheadTracker, distanceMeters, type HazardAhead, type KnownHazard } from '@/lib/known-hazards';
import {
  SAME_SPOT_M,
  bundledRiskZones,
  possibleHazardVoice,
  withoutKnownHazards,
  withoutWarnedSpots,
  type RiskZone,
} from '@/lib/hazard-prediction';
import type { LastKnownWarning } from '@/hooks/use-known-hazards-ahead';

/** How often the rider's position is checked against the high-risk squares. */
const CHECK_MS = 1000;
/** How long the "Possible hazard ahead" card stays on screen. */
const CARD_MS = 6000;
/** Lower than "Known hazard ahead" (1); never cuts in on another voice. */
const VOICE_PRIORITY = 2;
/** Stay quiet this long after a "Known ... ahead" warning (the rider was just warned). */
const AFTER_KNOWN_MS = 15000;

export type PossibleHazardWarning = { ahead: HazardAhead; id: number };

/**
 * Possible hazard ahead: while a ride is active, warns (card + voice) when the
 * rider heads toward a high-risk square of the team's risk map, ~5 s before
 * reaching it. Same rules as "Known hazard ahead" (not when stopped, behind, off
 * to the side or with poor GPS), plus: quiet near saved hazards and shortly after
 * a known-hazard warning, and once per risky spot (SAME_SPOT_M).
 */
export function useHazardPredictionAhead(
  active: boolean,
  positionRef: React.MutableRefObject<LatLng | null>,
  speedKmhRef: React.MutableRefObject<number | null>,
  knownHazardsRef: React.MutableRefObject<KnownHazard[]>,
  lastKnownWarningRef: React.MutableRefObject<LastKnownWarning>,
): PossibleHazardWarning | null {
  const [warning, setWarning] = useState<PossibleHazardWarning | null>(null);

  useEffect(() => {
    if (!active) {
      setWarning(null);
      return;
    }

    const allZones = bundledRiskZones();
    if (allZones.length === 0) return;

    const tracker = createAheadTracker();
    let warnedSpots: { latitude: number; longitude: number }[] = [];
    let knownSource: KnownHazard[] | null = null;
    let zones: RiskZone[] = allZones;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    const interval = setInterval(() => {
      const now = Date.now();
      const position = positionRef.current;

      // Recompute only when the saved hazards were downloaded again.
      if (knownHazardsRef.current !== knownSource) {
        knownSource = knownHazardsRef.current;
        zones = withoutKnownHazards(allZones, knownSource);
      }

      if (position) {
        warnedSpots = warnedSpots.filter(
          (w) => distanceMeters(position.latitude, position.longitude, w.latitude, w.longitude) <= SAME_SPOT_M,
        );
      }

      const lastKnown = lastKnownWarningRef.current;
      const justWarnedKnown = lastKnown !== null && now - lastKnown.at < AFTER_KNOWN_MS;
      // The tracker still sees every fix (for its stop rules), just with no squares to warn about.
      const candidates = justWarnedKnown ? [] : withoutWarnedSpots(zones, warnedSpots);
      const ahead = tracker.check(now, position, speedKmhRef.current, candidates);
      if (!ahead) return;

      warnedSpots.push({ latitude: ahead.hazard.latitude, longitude: ahead.hazard.longitude });
      setWarning({ ahead, id: now });
      announce(possibleHazardVoice(ahead.distance), VOICE_PRIORITY, false);

      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setWarning(null), CARD_MS);
    }, CHECK_MS);

    return () => {
      clearInterval(interval);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [active, positionRef, speedKmhRef, knownHazardsRef, lastKnownWarningRef]);

  return warning;
}
