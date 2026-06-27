import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { useCrashDetection } from '@/hooks/use-crash-detection';
import { useTrip } from '@/hooks/use-trip';
import { generateJarvisAudio } from '@/lib/openai-tts';
import { SOS_TEXT, SOS_CACHE_KEY } from '@/constants/sos';

export default function RiderLayout() {
  const { isActive } = useTrip();
  useCrashDetection(isActive);

  useEffect(() => {
    generateJarvisAudio(SOS_TEXT, SOS_CACHE_KEY).catch(() => {});
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
