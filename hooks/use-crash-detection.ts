import { useEffect } from 'react';
import { router } from 'expo-router';
import { CrashDetector } from '@/lib/crash-detector';

export function useCrashDetection(enabled: boolean = false) {
  useEffect(() => {
    if (!enabled) return;
    const detector = new CrashDetector(() => {
      // Phone's own backup check (runs only while the IoT unit is not connected).
      router.push({ pathname: '/(rider)/emergency-alert', params: { trigger: 'crash_phone' } });
    });
    detector.start();
    return () => detector.stop();
  }, [enabled]);
}
