import type { DetectionSource, DetectionResult } from './detection-source';
import { classify, analyzeTrafficState } from './detection-classifier';

/**
 * TFLite detection source — stub for EAS dev build.
 *
 * In a real build, swap the body of runInference() with:
 *   import { useTensorflowModel } from 'react-native-fast-tflite';
 *   const model = useTensorflowModel(require('../assets/models/yolov8n.tflite'));
 *   const outputs = model.run([frameBuffer]);
 *   // Parse outputs[0] (boxes), outputs[1] (scores), outputs[2] (classes)
 *
 * The interface contract stays the same — the overlay/voice code never changes.
 */
export class TFLiteDetectionSource implements DetectionSource {
  private running = false;
  private callback: ((results: DetectionResult[]) => void) | null = null;

  onDetections(callback: (results: DetectionResult[]) => void): void {
    this.callback = callback;
  }

  start(): void {
    this.running = true;
    // In a real EAS build: subscribe to frame processor or camera frame events here
    console.log('[TFLiteDetectionSource] Started — waiting for native frame processor');
  }

  stop(): void {
    this.running = false;
    console.log('[TFLiteDetectionSource] Stopped');
  }

  /**
   * Called by the frame processor on each camera frame.
   * rawBoxes: Float32Array with [x, y, w, h, confidence, classIndex] per detection
   * croppedPixels: nullable Uint8Array from the traffic-light bbox crop for HSV analysis
   */
  processFrame(
    rawBoxes: Array<{ x: number; y: number; w: number; h: number; confidence: number; classIndex: number }>,
    croppedPixels: Uint8Array | null = null,
  ): void {
    if (!this.running || !this.callback) return;

    const results: DetectionResult[] = [];
    for (const box of rawBoxes) {
      if (box.confidence < 0.5) continue;

      const trafficState = box.classIndex === 3
        ? analyzeTrafficState(croppedPixels)
        : 'unknown';

      const result = classify(box.classIndex, box.confidence, {
        x: box.x, y: box.y, w: box.w, h: box.h,
      }, trafficState);

      if (result) results.push(result);
    }

    this.callback(results);
  }
}
