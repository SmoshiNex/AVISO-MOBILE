import type { DetectionSource, DetectionResult } from './detection-source';

const DEMO_SEQUENCE: DetectionResult[] = [
  {
    classIndex: 0,
    type: 'Pothole',
    confidence: 0.88,
    bbox: { x: 0.2, y: 0.55, w: 0.18, h: 0.14 },
    distance: 8,
  },
  {
    classIndex: 3,
    type: 'Traffic Light Red',
    confidence: 0.94,
    bbox: { x: 0.45, y: 0.1, w: 0.08, h: 0.22 },
    trafficState: 'red',
  },
  {
    classIndex: 1,
    type: 'Road Excavation',
    confidence: 0.76,
    bbox: { x: 0.1, y: 0.6, w: 0.35, h: 0.2 },
    distance: 15,
  },
  {
    classIndex: 3,
    type: 'Traffic Light Green',
    confidence: 0.91,
    bbox: { x: 0.45, y: 0.1, w: 0.08, h: 0.22 },
    trafficState: 'green',
  },
  {
    classIndex: 4,
    type: 'Traffic Sign',
    confidence: 0.83,
    bbox: { x: 0.65, y: 0.15, w: 0.12, h: 0.18 },
    signKey: '0',
  },
  {
    classIndex: 2,
    type: 'Road Barrier',
    confidence: 0.79,
    bbox: { x: 0.3, y: 0.5, w: 0.25, h: 0.15 },
    distance: 5,
  },
  {
    classIndex: 3,
    type: 'Traffic Light Orange',
    confidence: 0.87,
    bbox: { x: 0.45, y: 0.1, w: 0.08, h: 0.22 },
    trafficState: 'orange',
  },
];

/**
 * Cycles through a preset sequence of detections to simulate the AR overlay
 * without requiring TFLite or a real camera feed (Expo Go compatible).
 */
export class DemoDetectionSource implements DetectionSource {
  private timer: ReturnType<typeof setInterval> | null = null;
  private index = 0;
  private callback: ((results: DetectionResult[]) => void) | null = null;
  private intervalMs: number;

  constructor(intervalMs = 2500) {
    this.intervalMs = intervalMs;
  }

  onDetections(callback: (results: DetectionResult[]) => void): void {
    this.callback = callback;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (!this.callback) return;
      const detection = DEMO_SEQUENCE[this.index % DEMO_SEQUENCE.length];
      this.index++;
      // Randomly skip some frames to feel more realistic
      if (Math.random() > 0.25) {
        this.callback([detection]);
      } else {
        this.callback([]);
      }
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.index = 0;
  }
}
