/** One object found by the on-device model. Box is top-left x, y, w, h as 0..1 of the camera view. */
export type RawDetection = {
  classIndex: number;
  confidence: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type DetectionInfo = {
  /** Time the model took for this frame */
  inferenceMs: number;
  /** "GPU" or "CPU" */
  delegate: string;
};

export type DetectionsNativeEvent = {
  nativeEvent: { detections: string; inferenceMs: number; delegate: string };
};

/** Unpacks a native onDetections event; null if the payload is malformed. */
export function parseDetectionsEvent(
  event: DetectionsNativeEvent
): [RawDetection[], DetectionInfo] | null {
  const { detections, inferenceMs, delegate } = event.nativeEvent;
  try {
    return [JSON.parse(detections) as RawDetection[], { inferenceMs, delegate }];
  } catch {
    return null;
  }
}
