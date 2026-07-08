import type { DetectionResult } from '@/types';
import { VOICE_ALERT_PRIORITY, DEFAULT_VOICE_PRIORITY } from '@/constants/detections';

/**
 * Picks the single most urgent detection from one detection-source tick/batch
 * so the voice dispatcher only ever receives one candidate per tick — even once
 * a real multi-object detector starts emitting several simultaneous results.
 *
 * Priority-first (lower VOICE_ALERT_PRIORITY number = more urgent). Ties broken
 * by higher confidence, then by larger bounding-box area (a larger normalized
 * box generally means the hazard is closer/more prominent). Bounding-box area
 * is used instead of `distance` because `distance` is undefined for traffic
 * signs and lights — bbox is the one field every DetectionResult always has.
 */
export function selectPriorityDetection(
  results: DetectionResult[],
): DetectionResult | null {
  if (results.length === 0) return null;

  let best = results[0];
  let bestPriority = VOICE_ALERT_PRIORITY[best.type] ?? DEFAULT_VOICE_PRIORITY;

  for (let i = 1; i < results.length; i++) {
    const candidate = results[i];
    const candidatePriority = VOICE_ALERT_PRIORITY[candidate.type] ?? DEFAULT_VOICE_PRIORITY;

    if (candidatePriority < bestPriority) {
      best = candidate;
      bestPriority = candidatePriority;
      continue;
    }
    if (candidatePriority > bestPriority) continue;

    if (candidate.confidence > best.confidence) {
      best = candidate;
    } else if (candidate.confidence === best.confidence) {
      const bestArea = best.bbox.w * best.bbox.h;
      const candidateArea = candidate.bbox.w * candidate.bbox.h;
      if (candidateArea > bestArea) best = candidate;
    }
  }

  return best;
}
