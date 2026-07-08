import * as Speech from 'expo-speech';
import { HAZARD_WARNINGS } from '@/constants/hazards';
import { VOICE_ALERT_PRIORITY, DEFAULT_VOICE_PRIORITY } from '@/constants/detections';
import type { DetectionResult } from '@/types';

const COOLDOWN_MS = 6000;

// Generation counter — incremented on every interrupt/stop.
// Callbacks capture their gen and skip if superseded.
let generation = 0;
let speaking = false;
let currentPriority = 99;
let lastSpokenType = '';
let lastSpokenAt = 0;

function buildAnnouncement(
  result: DetectionResult,
  signInstruction?: string,
): string {
  const type = result.type;
  if (type === 'Traffic Sign' && signInstruction) {
    return signInstruction;
  }
  
  if (result.distance !== undefined && result.distance !== null) {
    return `${type} detected ${Math.round(result.distance)} meters ahead.`;
  }
  
  return HAZARD_WARNINGS[type] ?? `${type} detected.`;
}

function stopCurrent(): void {
  generation++;
  speaking = false;
  currentPriority = 99;
  Speech.stop();
}

function speakNow(text: string, priority: number): void {
  const gen = generation;
  speaking = true;
  currentPriority = priority;

  Speech.speak(text, {
    language: 'en-US',
    rate: 0.9,
    pitch: 0.8,
    onDone: () => {
      if (generation !== gen) return;
      speaking = false;
      currentPriority = 99;
    },
    onError: () => {
      if (generation !== gen) return;
      speaking = false;
      currentPriority = 99;
    },
    onStopped: () => {},
  });
}

export function announceDetection(
  result: DetectionResult,
  signInstruction?: string,
): void {
  const now = Date.now();
  const isSameType = result.type === lastSpokenType;
  const withinCooldown = now - lastSpokenAt < COOLDOWN_MS;

  if (isSameType && withinCooldown) return;

  const priority = VOICE_ALERT_PRIORITY[result.type] ?? DEFAULT_VOICE_PRIORITY;
  const text = buildAnnouncement(result, signInstruction);

  lastSpokenType = result.type;
  lastSpokenAt = now;

  if (!speaking) {
    speakNow(text, priority);
    return;
  }

  // Only a strictly higher-priority (lower number) detection may interrupt
  // what's currently playing — a different-but-equal-or-lower-priority
  // detection is dropped instead of preempting, so two same-tier hazards
  // (e.g. Pothole then Road Excavation) can't repeatedly cut each other off.
  if (priority < currentPriority) {
    stopCurrent();
    speakNow(text, priority);
  }
}

export function stopAllSpeech(): void {
  stopCurrent();
  lastSpokenType = '';
  lastSpokenAt = 0;
}
