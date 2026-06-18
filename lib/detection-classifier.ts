import { CLASS_INDEX_TO_TYPE } from '@/constants/hazards';
import type { DetectionResult } from '@/types';
import { estimateDistance } from './distance-estimator';

export type TrafficState = 'red' | 'orange' | 'green' | 'unknown';

/**
 * Converts a raw YOLO class index and bounding box into a full DetectionResult.
 * Traffic light class (3) requires HSV color analysis from the cropped frame —
 * pass a `trafficState` value from the HSV analyzer (or 'unknown' for demo mode).
 */
export function classify(
  classIndex: number,
  confidence: number,
  bbox: { x: number; y: number; w: number; h: number },
  trafficState: TrafficState = 'unknown',
  signKey?: string,
): DetectionResult | null {
  const baseType = CLASS_INDEX_TO_TYPE[classIndex];
  if (!baseType) return null;

  let finalType: string = baseType;

  if (classIndex === 3) {
    // Traffic light — resolve to the correct backend type string
    if (trafficState === 'red') finalType = 'Traffic Light Red';
    else if (trafficState === 'orange') finalType = 'Traffic Light Orange';
    else if (trafficState === 'green') finalType = 'Traffic Light Green';
    else finalType = 'Traffic Light Red'; // default to red (safest assumption)

    return {
      classIndex,
      type: finalType,
      confidence,
      bbox,
      trafficState,
    };
  }

  if (classIndex === 4) {
    // Traffic sign — signKey is the index into road_sign_instructions.json
    return {
      classIndex,
      type: 'Traffic Sign',
      confidence,
      bbox,
      signKey,
    };
  }

  // Road hazards 0–2: Pothole, Road Excavation, Road Barrier — estimate distance
  const distance = estimateDistance(baseType, bbox.w);
  return {
    classIndex,
    type: baseType,
    confidence,
    bbox,
    distance,
  };
}

/**
 * HSV-based traffic light state analysis.
 * In a real TFLite build this would sample the cropped bbox pixels from the frame.
 * In demo mode this is bypassed — trafficState is set by DemoDetectionSource directly.
 *
 * Hue ranges (0–360):
 *   Red:    0–15 and 345–360
 *   Orange: 16–45
 *   Green:  90–150
 */
export function analyzeTrafficState(
  _croppedPixels: Uint8Array | null,
): TrafficState {
  // Stub — real implementation samples pixels from the YOLO bbox crop
  // and counts dominant hue using HSV histogram.
  return 'unknown';
}
