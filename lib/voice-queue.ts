import * as Speech from 'expo-speech';

// Repetition is decided upstream by lib/alert-gate.ts; this module only
// handles playback: speak now, or let a strictly more urgent alert interrupt.

// Generation counter — incremented on every interrupt/stop.
// Callbacks capture their gen and skip if superseded.
let generation = 0;
let speaking = false;
let currentPriority = 99;

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

  const done = () => {
    if (generation !== gen) return;
    speaking = false;
    currentPriority = 99;
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
 * Speaks an alert. Lower `priority` = more urgent. While something is playing,
 * only a strictly more urgent alert interrupts it; others are dropped, so two
 * same-tier alerts can't keep cutting each other off.
 */
export function announce(text: string, priority: number): void {
  if (!speaking) {
    speakNow(text, priority);
    return;
  }

  if (priority < currentPriority) {
    stopCurrent();
    speakNow(text, priority);
  }
}

export function stopAllSpeech(): void {
  stopCurrent();
}
