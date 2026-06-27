import { useEffect } from 'react';
import { router } from 'expo-router';
import { CrashDetector } from '@/lib/crash-detector';

export function useCrashDetection(enabled: boolean = false) {
  useEffect(() => {
    if (!enabled) return;
    const detector = new CrashDetector(() => {
      router.push('/(rider)/emergency-alert');
    });
    detector.start();
    return () => detector.stop();
  }, [enabled]);
}
