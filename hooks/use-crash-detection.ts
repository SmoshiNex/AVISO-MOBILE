import { useEffect } from 'react';
import { router } from 'expo-router';
import { CrashDetector } from '@/lib/crash-detector';

export function useCrashDetection() {
  useEffect(() => {
    const detector = new CrashDetector(() => {
      router.push('/(rider)/emergency-alert');
    });
    detector.start();
    return () => detector.stop();
  }, []);
}
