// TEMPORARY diagnostic screen — confirms whether the app can see an
// OTG-connected USB webcam as an "external" camera device before wiring
// vision-camera into the real camera/detection screen. Safe to delete
// once OTG support is confirmed working (also remove the nav row in
// (tabs)/profile.tsx that links here).
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Camera,
  useCameraDevice,
  useCameraDevices,
  useCameraPermission,
} from 'react-native-vision-camera';

export default function CameraOtgTestScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const devices = useCameraDevices();
  const externalDevice = useCameraDevice('external');
  const [deviceCount, setDeviceCount] = useState(0);

  useEffect(() => {
    setDeviceCount(devices.length);
  }, [devices]);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>OTG Camera Test</Text>
      </View>

      {externalDevice ? (
        <Camera
          style={StyleSheet.absoluteFill}
          device={externalDevice}
          isActive={true}
        />
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="hardware-chip-outline" size={64} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>No external camera detected</Text>
          <Text style={styles.emptySubtitle}>
            Plug in your USB webcam via the OTG adapter, then wait a couple
            seconds. This screen listens for device changes automatically.
          </Text>
        </View>
      )}

      <View style={styles.debugPanel} pointerEvents="none">
        <Text style={styles.debugText}>Permission: {String(hasPermission)}</Text>
        <Text style={styles.debugText}>Devices detected: {deviceCount}</Text>
        <Text style={styles.debugText}>
          External found: {externalDevice ? 'YES' : 'NO'}
        </Text>
        {devices.map((d) => (
          <Text key={d.id} style={styles.debugText}>
            - {d.position} / {d.name}
          </Text>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 10,
  },
  backBtn: { marginRight: 12 },
  title: { color: '#fff', fontSize: 16, fontWeight: '600' },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubtitle: {
    color: '#9CA3AF',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  debugPanel: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 8,
    padding: 10,
  },
  debugText: { color: '#22C55E', fontSize: 11, fontFamily: 'monospace' },
});
