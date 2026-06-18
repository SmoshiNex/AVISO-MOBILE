import type { DetectionResult } from '@/types';

export type { DetectionResult };

export interface DetectionSource {
  start(): void;
  stop(): void;
  onDetections(callback: (results: DetectionResult[]) => void): void;
}
