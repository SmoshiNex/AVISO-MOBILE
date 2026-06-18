import { useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import * as SecureStore from 'expo-secure-store';
import { Toaster } from 'sonner-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { initDb } from '@/lib/local-db';
import { startSyncInterval } from '@/lib/sync-service';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let stopSync: (() => void) | undefined;

    (async () => {
      await initDb();
      stopSync = startSyncInterval(30_000);

      const token = await SecureStore.getItemAsync('rider_token');
      if (token) {
        router.replace('/(rider)/home');
      } else {
        router.replace('/(auth)/login');
      }
      setChecked(true);
    })();

    return () => stopSync?.();
  }, []);

  if (!checked) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="auto" />
      <Toaster
        position="top-center"
        offset={16}
        richColors
        toastOptions={{
          style: { marginTop: 8 },
        }}
      />
    </ThemeProvider>
  );
}
