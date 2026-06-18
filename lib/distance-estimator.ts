import { HAZARD_REAL_WIDTHS_CM } from '@/constants/hazards';

// iPhone 13 / mid-range Android focal length in pixels at 1080p
const FOCAL_LENGTH_PX = 1150;
const FRAME_WIDTH_PX = 1080;

/**
 * Estimates distance to a detected hazard using the focal-length formula:
 *   distance = (real_width * focal_length) / pixel_width
 *
 * Only applicable for physical road hazards (classes 0–2).
 * Traffic lights and signs return undefined.
 */
export function estimateDistance(
  hazardType: string,
  bboxWidthNormalized: number,
): number | undefined {
  const realWidthCm = HAZARD_REAL_WIDTHS_CM[hazardType];
  if (realWidthCm === undefined || bboxWidthNormalized <= 0) return undefined;

  const pixelWidth = bboxWidthNormalized * FRAME_WIDTH_PX;
  const distanceCm = (realWidthCm * FOCAL_LENGTH_PX) / pixelWidth;
  return Math.round(distanceCm / 100); // convert cm → meters, rounded
}
