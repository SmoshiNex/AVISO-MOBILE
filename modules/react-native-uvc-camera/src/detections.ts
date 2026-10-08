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
  /** Total time the detector took for this frame */
  inferenceMs: number;
  /** "GPU" or "CPU" */
  delegate: string;
  /** Fitting the camera frame into the model input */
  prepMs: number;
  /** Running the model itself */
  modelMs: number;
  /** Finding boxes and removing duplicates */
  boxesMs: number;
  /** Camera frame size the detector received */
  frameWidth: number;
  frameHeight: number;
  /** Bundled model export, e.g. "v6-960x544-fp32" */
  modelVersion: string;
};

export type DetectionsNativeEvent = {
  nativeEvent: { detections: string } & DetectionInfo;
};

/** Unpacks a native onDetections event; null if the payload is malformed. */
export function parseDetectionsEvent(
  event: DetectionsNativeEvent
): [RawDetection[], DetectionInfo] | null {
  const { detections, ...info } = event.nativeEvent;
  try {
    return [JSON.parse(detections) as RawDetection[], info];
  } catch {
    return null;
  }
}
