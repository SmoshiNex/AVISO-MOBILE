import * as Speech from 'expo-speech';
import { HAZARD_WARNINGS } from '@/constants/hazards';
import type { DetectionResult } from '@/types';

// Priority: lower number = higher priority (spoken first, interrupts lower)
const PRIORITY: Record<string, number> = {
  'Pothole': 1,
  'Road Excavation': 1,
  'Road Barrier': 1,
  'Traffic Light Red': 2,
  'Traffic Light Orange': 2,
  'Traffic Light Green': 3,
  'Traffic Sign': 4,
};

type QueueItem = {
  text: string;
  priority: number;
};

let queue: QueueItem[] = [];
let speaking = false;
let lastSpokenType = '';
let lastSpokenAt = 0;
const COOLDOWN_MS = 6000; // don't repeat the same type within 6 seconds

function processQueue(): void {
  if (speaking || queue.length === 0) return;

  // Sort by priority (ascending = higher priority first)
  queue.sort((a, b) => a.priority - b.priority);
  const next = queue.shift()!;
  speaking = true;

  Speech.speak(next.text, {
    language: 'en-PH',
    rate: 0.95,
    onDone: () => {
      speaking = false;
      processQueue();
    },
    onError: () => {
      speaking = false;
      processQueue();
    },
    onStopped: () => {
      speaking = false;
      processQueue();
    },
  });
}

/**
 * Queues a voice alert for a detected hazard.
 * - Respects per-type cooldown to avoid spam
 * - High-priority hazards stop lower-priority speech
 * - Signs speak their sign instruction text
 */
export function announceDetection(
  result: DetectionResult,
  signInstruction?: string,
): void {
  const now = Date.now();
  const isSameType = result.type === lastSpokenType;
  const withinCooldown = now - lastSpokenAt < COOLDOWN_MS;

  if (isSameType && withinCooldown) return;

  let text: string;
  if (result.type === 'Traffic Sign' && signInstruction) {
    text = signInstruction;
  } else {
    const warning = HAZARD_WARNINGS[result.type];
    if (!warning) return;

    text = result.distance !== undefined
      ? `${result.distance} meters ahead — ${warning}`
      : warning;
  }

  const priority = PRIORITY[result.type] ?? 5;
  const newItem: QueueItem = { text, priority };

  // If something lower-priority is speaking and a high-priority item arrives, stop it
  if (speaking && priority < (queue[0]?.priority ?? 99)) {
    Speech.stop();
    speaking = false;
  }

  queue.push(newItem);
  lastSpokenType = result.type;
  lastSpokenAt = now;

  processQueue();
}

export function stopAllSpeech(): void {
  Speech.stop();
  queue = [];
  speaking = false;
}
