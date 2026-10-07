import { MODEL_CLASSES, isRoadHazard } from '@/constants/hazards';
import type { DetectionResult } from '@/types';
import { estimateDistance } from './distance-estimator';

/**
 * Converts a raw YOLO class index and bounding box into a DetectionResult,
 * using the model's 12-class order (MODEL_CLASSES). The model detects the
 * traffic-light colour and each traffic sign as its own class, so no extra
 * colour analysis is needed.
 */
export function classify(
  classIndex: number,
  confidence: number,
  bbox: { x: number; y: number; w: number; h: number },
): DetectionResult | null {
  const modelClass = MODEL_CLASSES[classIndex];
  if (!modelClass) return null;

  return {
    classIndex,
    type: modelClass.type,
    confidence,
    bbox,
    ...(modelClass.signKey && { signKey: modelClass.signKey }),
    ...(isRoadHazard(modelClass.type) && { distance: estimateDistance(modelClass.type, bbox.w) }),
  };
}
