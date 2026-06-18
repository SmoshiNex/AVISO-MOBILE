import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { toast } from 'sonner-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useTrip } from '@/hooks/use-trip';
import { DemoDetectionSource } from '@/lib/demo-detection-source';
import { announceDetection, stopAllSpeech } from '@/lib/voice-queue';
import { saveHazardLog, incrementTripHazards } from '@/lib/local-db';
import { resolveArea } from '@/lib/area-resolver';
import { HAZARD_COLORS, HAZARD_WARNINGS } from '@/constants/hazards';
import type { DetectionResult } from '@/types';
import roadSigns from '@/assets/data/road_sign_instructions.json';
import { styles } from '@/styles/camera.style';

type SourceMode = 'native' | 'otg';

const detectionSource = new DemoDetectionSource(2500);
const LOG_COOLDOWN_MS = 8000;
const lastLoggedAt: Record<string, number> = {};

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [sourceMode, setSourceMode] = useState<SourceMode>('native');
  const [detections, setDetections] = useState<DetectionResult[]>([]);
  const [warningText, setWarningText] = useState<string | null>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { trip, isActive, startTrip } = useTrip();
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const primary = useThemeColor({}, 'primary');

  // Start the detection source and subscribe to results
  useEffect(() => {
    detectionSource.onDetections(handleDetections);
    detectionSource.start();
    return () => {
      detectionSource.stop();
      stopAllSpeech();
    };
  }, []);

  const handleDetections = useCallback(async (results: DetectionResult[]) => {
    setDetections(results);

    for (const result of results) {
      if (result.confidence < 0.6) continue;

      // Log to SQLite with cooldown per type
      const now = Date.now();
      if (!lastLoggedAt[result.type] || now - lastLoggedAt[result.type] > LOG_COOLDOWN_MS) {
        lastLoggedAt[result.type] = now;

        try {
          const location = await Location.getLastKnownPositionAsync();
          if (location) {
            const { latitude, longitude } = location.coords;
            const area = resolveArea(latitude, longitude);
            await saveHazardLog({
              trip_id: trip?.id,
              type: result.type,
              confidence: result.confidence,
              distance: result.distance,
              latitude,
              longitude,
              area,
              detected_at: new Date().toISOString(),
              synced: false,
            });
            if (trip?.id) await incrementTripHazards(trip.id);
          }
        } catch {
          // Location unavailable â€” still log without coords
        }
      }

      // Voice alert
      const signInstruction = result.signKey
        ? (roadSigns as Record<string, { instruction: string }>)[result.signKey]?.instruction
        : undefined;
      announceDetection(result, signInstruction);

      // Warning banner
      const warning = result.type === 'Traffic Sign' && signInstruction
        ? signInstruction
        : HAZARD_WARNINGS[result.type];

      if (warning) {
        setWarningText(warning);
        if (warningTimer.current) clearTimeout(warningTimer.current);
        warningTimer.current = setTimeout(() => setWarningText(null), 4000);
      }
    }

    if (results.length === 0) {
      // Don't clear immediately â€” let warning banner fade out naturally
    }
  }, [trip]);

  const handleStartRide = useCallback(async () => {
    toast.promise(startTrip(), {
      loading: 'Starting ride...',
      success: () => 'Ride started â€” stay safe!',
      error: () => 'Could not start ride. Check your connection.',
    });
  }, [startTrip]);

  // Permission not yet determined
  if (!permission) return <View style={styles.container} />;

  // Permission denied
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionContainer} edges={['top']}>
        <Ionicons name="camera-outline" size={64} color="#9CA3AF" />
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionText}>
          AVISO needs camera access to detect road hazards in real time.
        </Text>
        <TouchableOpacity style={[styles.permissionBtn, { backgroundColor: primary }]} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>Grant Permission</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera feed */}
      {sourceMode === 'native' ? (
        <CameraView style={StyleSheet.absoluteFill} facing="back" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.otgPlaceholder]}>
          <Ionicons name="hardware-chip-outline" size={64} color="#9CA3AF" />
          <Text style={styles.otgText}>Connect Raspberry Pi via USB OTG</Text>
          <Text style={styles.otgSubtext}>Hardware camera feed will appear here</Text>
        </View>
      )}

      {/* AR Overlay â€” bounding boxes */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {detections.map((d, i) => {
          const left = d.bbox.x * screenWidth;
          const top = d.bbox.y * screenHeight;
          const width = d.bbox.w * screenWidth;
          const height = d.bbox.h * screenHeight;
          const boxColor = getBoxColor(d);

          return (
            <View key={i} style={[styles.boundingBox, { left, top, width, height, borderColor: boxColor }]}>
              <View style={[styles.labelBadge, { backgroundColor: boxColor }]}>
                <Text style={styles.labelText} numberOfLines={1}>
                  {getBadgeLabel(d)}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Warning Banner */}
      {warningText && (
        <View style={styles.warningBanner} pointerEvents="none">
          <Ionicons name="warning" size={16} color="#fff" />
          <Text style={styles.warningText} numberOfLines={2}>{warningText}</Text>
        </View>
      )}

      {/* Top Controls */}
      <SafeAreaView style={styles.topOverlay} edges={['top']} pointerEvents="box-none">
        {/* Source toggle */}
        <View style={styles.sourceToggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, sourceMode === 'native' && styles.toggleBtnActive]}
            onPress={() => setSourceMode('native')}
          >
            <Ionicons name="camera-outline" size={14} color={sourceMode === 'native' ? '#fff' : '#9CA3AF'} />
            <Text style={[styles.toggleText, sourceMode === 'native' && styles.toggleTextActive]}>
              Phone Cam
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, sourceMode === 'otg' && styles.toggleBtnActive]}
            onPress={() => setSourceMode('otg')}
          >
            <Ionicons name="hardware-chip-outline" size={14} color={sourceMode === 'otg' ? '#fff' : '#9CA3AF'} />
            <Text style={[styles.toggleText, sourceMode === 'otg' && styles.toggleTextActive]}>
              OTG Hardware
            </Text>
          </TouchableOpacity>
        </View>

        {/* SOS button */}
        <TouchableOpacity
          style={styles.sosBtn}
          onPress={() => router.push('/(rider)/emergency-alert')}
        >
          <Text style={styles.sosBtnText}>SOS</Text>
        </TouchableOpacity>
      </SafeAreaView>

      {/* Demo badge */}
      <View style={styles.demoBadge} pointerEvents="none">
        <Text style={styles.demoBadgeText}>DEMO MODE</Text>
      </View>

      {/* Start Ride overlay (when no active trip) */}
      {!isActive && (
        <View style={styles.startRideOverlay}>
          <View style={styles.startRideCard}>
            <Ionicons name="bicycle" size={32} color={primary} style={{ marginBottom: 8 }} />
            <Text style={styles.startRideTitle}>Ready to ride?</Text>
            <Text style={styles.startRideSubtitle}>
              Start a ride to log detections and track your route
            </Text>
            <TouchableOpacity
              style={[styles.startRideBtn, { backgroundColor: primary }]}
              onPress={handleStartRide}
            >
              <Text style={styles.startRideBtnText}>Start Ride</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

function getBoxColor(d: DetectionResult): string {
  if (d.distance !== undefined) {
    if (d.distance < 5) return '#EF4444';
    if (d.distance < 15) return '#F59E0B';
  }
  return HAZARD_COLORS[d.type] ?? '#0274DF';
}

function getBadgeLabel(d: DetectionResult): string {
  if (d.distance !== undefined) return `${d.type} â€¢ ${d.distance}m`;
  if (d.trafficState) return d.type;
  if (d.signKey) {
    const sign = (roadSigns as Record<string, { name: string }>)[d.signKey];
    return sign?.name ?? 'Traffic Sign';
  }
  return d.type;
}

