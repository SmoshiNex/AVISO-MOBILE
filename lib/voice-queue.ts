import * as Speech from 'expo-speech';
import { VOICE_GAP_MS } from '@/constants/detection-tuning';

// Repetition is decided upstream by lib/alert-gate.ts; this module only
// handles playback: keep spoken warnings at least VOICE_GAP_MS apart so the
// rider can still hear traffic, and let urgent warnings cut in.

// Generation counter — incremented on every interrupt/stop.
// Callbacks capture their gen and skip if superseded.
let generation = 0;
let speaking = false;
let currentPriority = 99;
let currentUrgent = false;
let lastSpokeAt = -Infinity;

function stopCurrent(): void {
  generation++;
  speaking = false;
  currentPriority = 99;
  currentUrgent = false;
  Speech.stop();
}

function speakNow(text: string, priority: number, urgent: boolean): void {
  const gen = generation;
  speaking = true;
  currentPriority = priority;
  currentUrgent = urgent;
  lastSpokeAt = Date.now();

  const done = () => {
    if (generation !== gen) return;
    speaking = false;
    currentPriority = 99;
    currentUrgent = false;
  };

  Speech.speak(text, {
    language: 'en-US',
    rate: 0.9,
    pitch: 0.8,
    onDone: done,
    onError: done,
    onStopped: () => {},
  });
}

/**
 * Speaks an alert. Lower `priority` = more urgent.
 *  - Urgent alerts (red light, children crossing, near hazard) always speak, cutting in over a
 *    non-urgent message or a less urgent urgent one.
 *  - Other alerts speak only when nothing is playing and the last message started at least
 *    VOICE_GAP_MS ago; otherwise only their card shows. This keeps the voice from talking
 *    continuously and two same-tier alerts from cutting each other off.
 */
export function announce(text: string, priority: number, urgent = false): void {
  if (urgent) {
    if (!speaking) {
      speakNow(text, priority, true);
    } else if (!currentUrgent || priority < currentPriority) {
      stopCurrent();
      speakNow(text, priority, true);
    }
    return;
  }

  if (speaking || Date.now() - lastSpokeAt < VOICE_GAP_MS) return;
  speakNow(text, priority, false);
}

export function stopAllSpeech(): void {
  stopCurrent();
}
