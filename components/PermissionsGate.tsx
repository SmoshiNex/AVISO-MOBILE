import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { Camera } from 'expo-camera';
import * as Location from 'expo-location';
import * as Contacts from 'expo-contacts';
import * as ImagePicker from 'expo-image-picker';
import { useThemeColor } from '@/hooks/use-theme-color';

type PermissionKey = 'camera' | 'location' | 'contacts' | 'media';

const PERMISSION_ORDER: PermissionKey[] = ['camera', 'location', 'contacts', 'media'];

async function isGranted(key: PermissionKey): Promise<boolean> {
  switch (key) {
    case 'camera':
      return (await Camera.getCameraPermissionsAsync()).granted;
    case 'location':
      return (await Location.getForegroundPermissionsAsync()).granted;
    case 'contacts':
      return (await Contacts.getPermissionsAsync()).granted;
    case 'media':
      return (await ImagePicker.getMediaLibraryPermissionsAsync()).granted;
  }
}

async function requestOne(key: PermissionKey): Promise<void> {
  switch (key) {
    case 'camera':
      await Camera.requestCameraPermissionsAsync();
      return;
    case 'location':
      await Location.requestForegroundPermissionsAsync();
      return;
    case 'contacts':
      await Contacts.requestPermissionsAsync();
      return;
    case 'media':
      await ImagePicker.requestMediaLibraryPermissionsAsync();
      return;
  }
}

/**
 * Wraps the rider app: on every mount it fires the standard native OS
 * permission dialogs for anything not yet granted (Camera, Location,
 * Contacts, Photos), one after another — same as a typical Android app's
 * cold-start permission flow. No custom screen; just a blank view behind
 * the native dialogs until they've all been answered.
 */
export function PermissionsGate({ children }: { children: ReactNode }) {
  const background = useThemeColor({}, 'background');
  const [ready, setReady] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let mounted = true;

    (async () => {
      for (const key of PERMISSION_ORDER) {
        if (await isGranted(key)) continue;
        await requestOne(key);
      }
      if (mounted) setReady(true);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  if (!ready) {
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: background }]} />;
  }

  return <>{children}</>;
}
