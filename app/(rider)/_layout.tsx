import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { useCrashDetection } from '@/hooks/use-crash-detection';
import { generateJarvisAudio } from '@/lib/openai-tts';
import { SOS_TEXT, SOS_CACHE_KEY } from '@/constants/sos';
import { PermissionsGate } from '@/components/PermissionsGate';
import { TripProvider, useTripContext } from '@/contexts/trip-context';

function RiderStack() {
  const { isActive } = useTripContext();
  useCrashDetection(isActive);

  useEffect(() => {
    generateJarvisAudio(SOS_TEXT, SOS_CACHE_KEY).catch(() => {});
  }, []);

  return (
    <PermissionsGate>
      <Stack screenOptions={{ headerShown: false }} />
    </PermissionsGate>
  );
}

export default function RiderLayout() {
  return (
    <TripProvider>
      <RiderStack />
    </TripProvider>
  );
}
