import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { useCrashDetection } from '@/hooks/use-crash-detection';
import { generateJarvisAudio } from '@/lib/openai-tts';
import { SOS_TEXT, SOS_CACHE_KEY } from '@/constants/sos';
import { PermissionsGate } from '@/components/PermissionsGate';
import { TripProvider, useTripContext } from '@/contexts/trip-context';
import { IotProvider, useIot } from '@/contexts/iot-context';

function RiderStack() {
  const { isActive } = useTripContext();
  const { connected: iotConnected } = useIot();

  // The IoT unit on the motorcycle is the crash detector when connected. The
  // phone's own sensors are only the fallback, so a dropped phone can't
  // trigger an SOS while the unit is watching the bike.
  useCrashDetection(isActive && !iotConnected);

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
      <IotProvider>
        <RiderStack />
      </IotProvider>
    </TripProvider>
  );
}
