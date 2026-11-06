import { useEffect, useRef, useState } from 'react';
import { File, Paths } from 'expo-file-system';
import { api } from '@/lib/api-client';
import type { LatLng } from '@/lib/alert-gate';
import { announce } from '@/lib/voice-queue';
import {
  createAheadTracker,
  groupKnownHazards,
  knownHazardVoice,
  type HazardAhead,
  type KnownHazard,
} from '@/lib/known-hazards';
import type { HazardLog } from '@/types';

/** Saved hazards are downloaded again this often while riding. */
const REFRESH_MS = 5 * 60 * 1000;
/** How often the rider's position is checked against the known hazards. */
const CHECK_MS = 1000;
/** How long the "Known ... ahead" card stays on screen. */
const CARD_MS = 6000;
/** Spoken like a camera road-hazard warning (VOICE_ALERT_PRIORITY), but never cuts in. */
const VOICE_PRIORITY = 1;
/** Last downloaded copy, so warnings still work when the signal drops mid-ride. */
const CACHE_FILE = 'known-hazards.json';

export type KnownHazardWarning = { ahead: HazardAhead; id: number };

/** The last known-hazard warning: the camera skips its own voice for the same type shortly after. */
export type LastKnownWarning = { type: string; at: number } | null;

function cacheFile(): File {
  return new File(Paths.document, CACHE_FILE);
}

async function readCache(): Promise<HazardLog[]> {
  try {
    const file = cacheFile();
    if (!file.exists) return [];
    const parsed: unknown = JSON.parse(await file.text());
    return Array.isArray(parsed) ? (parsed as HazardLog[]) : [];
  } catch {
    return [];
  }
}

function writeCache(logs: HazardLog[]): void {
  try {
    const file = cacheFile();
    if (!file.exists) file.create();
    file.write(JSON.stringify(logs));
  } catch {
    // The cache is only a fallback; the live copy still works.
  }
}

/**
 * Known hazard ahead: while a ride is active, warns (card + voice) about saved
 * hazards the rider is heading toward, ~5 s before reaching them. Once per pass:
 * a hazard warns again only after the rider has moved REARM_DISTANCE_M away.
 */
export function useKnownHazardsAhead(
  active: boolean,
  positionRef: React.MutableRefObject<LatLng | null>,
  speedKmhRef: React.MutableRefObject<number | null>,
): { warning: KnownHazardWarning | null; lastWarningRef: React.MutableRefObject<LastKnownWarning> } {
  const [warning, setWarning] = useState<KnownHazardWarning | null>(null);
  const hazardsRef = useRef<KnownHazard[]>([]);
  const lastWarningRef = useRef<LastKnownWarning>(null);

  // Download (and cache) the saved hazards while riding.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    readCache().then((logs) => {
      if (!cancelled && hazardsRef.current.length === 0) hazardsRef.current = groupKnownHazards(logs);
    });

    const load = async () => {
      try {
        const logs = await api.get<HazardLog[]>('/rider/hazards');
        if (cancelled || !Array.isArray(logs)) return;
        hazardsRef.current = groupKnownHazards(logs);
        writeCache(logs);
      } catch {
        // Offline: keep the last copy.
      }
    };

    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [active]);

  // Check the position every second.
  useEffect(() => {
    if (!active) {
      setWarning(null);
      return;
    }

    const tracker = createAheadTracker();
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    const interval = setInterval(() => {
      const now = Date.now();
      const ahead = tracker.check(now, positionRef.current, speedKmhRef.current, hazardsRef.current);
      if (!ahead) return;

      setWarning({ ahead, id: now });
      // Only a warning the rider actually heard silences the camera's voice for
      // that hazard; if another message was playing, the camera still speaks.
      if (announce(knownHazardVoice(ahead), VOICE_PRIORITY, false)) {
        lastWarningRef.current = { type: ahead.hazard.type, at: now };
      }

      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setWarning(null), CARD_MS);
    }, CHECK_MS);

    return () => {
      clearInterval(interval);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [active, positionRef, speedKmhRef]);

  return { warning, lastWarningRef };
}
