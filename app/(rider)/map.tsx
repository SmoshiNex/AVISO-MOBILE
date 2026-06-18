import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { toast } from 'sonner-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useTrip } from '@/hooks/use-trip';
import { getTripById, getHazardLogsForTrip } from '@/lib/local-db';
import { HAZARD_COLORS } from '@/constants/hazards';
import { Spacing, Radius } from '@/constants/theme';
import type { LocalTrip, LocalHazardLog } from '@/types';

// Zamboanga City center
const ZAMBOANGA_REGION = {
  latitude: 6.9214,
  longitude: 122.0790,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

export default function MapScreen() {
  const { trip_id } = useLocalSearchParams<{ trip_id?: string }>();
  const isHistoryMode = !!trip_id;

  const background = useThemeColor({}, 'background');
  const card = useThemeColor({}, 'card');
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const primary = useThemeColor({}, 'primary');
  const danger = useThemeColor({}, 'danger');
  const success = useThemeColor({}, 'success');
  const border = useThemeColor({}, 'border');

  const { trip: activeTrip, isActive, startTrip, endTrip } = useTrip();

  // History mode state
  const [historyTrip, setHistoryTrip] = useState<LocalTrip | null>(null);
  const [historyHazards, setHistoryHazards] = useState<LocalHazardLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isHistoryMode) return;
    setLoading(true);
    const id = parseInt(trip_id, 10);
    Promise.all([getTripById(id), getHazardLogsForTrip(id)])
      .then(([t, hazards]) => {
        setHistoryTrip(t);
        setHistoryHazards(hazards);
      })
      .finally(() => setLoading(false));
  }, [trip_id, isHistoryMode]);

  const handleStartRide = useCallback(async () => {
    toast.promise(startTrip(), {
      loading: 'Starting ride...',
      success: 'Ride started — drive safe!',
      error: 'Could not start. Check your connection.',
    });
  }, [startTrip]);

  const handleEndRide = useCallback(async () => {
    toast.promise(endTrip(), {
      loading: 'Ending ride...',
      success: 'Ride ended and saved!',
      error: 'Could not end ride.',
    });
  }, [endTrip]);

  const formatDuration = (trip: LocalTrip): string => {
    if (!trip.started_at || !trip.ended_at) return '';
    const mins = Math.round(
      (new Date(trip.ended_at).getTime() - new Date(trip.started_at).getTime()) / 60000,
    );
    return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  // HISTORY MODE
  if (isHistoryMode) {
    if (loading) {
      return (
        <View style={[styles.center, { backgroundColor: background }]}>
          <ActivityIndicator color={primary} />
        </View>
      );
    }

    if (!historyTrip) {
      return (
        <View style={[styles.center, { backgroundColor: background }]}>
          <Text style={[styles.emptyText, { color: textSecondary }]}>Trip not found</Text>
        </View>
      );
    }

    const routeCoords = historyTrip.route_points.map((p) => ({
      latitude: p.lat,
      longitude: p.lng,
    }));

    const initialRegion = historyTrip.start_lat && historyTrip.start_lng
      ? {
          latitude: historyTrip.start_lat,
          longitude: historyTrip.start_lng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }
      : ZAMBOANGA_REGION;

    return (
      <View style={styles.container}>
        <MapView
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_DEFAULT}
          initialRegion={initialRegion}
          showsUserLocation={false}
        >
          {/* Route polyline */}
          {routeCoords.length > 1 && (
            <Polyline
              coordinates={routeCoords}
              strokeColor={primary}
              strokeWidth={4}
              lineDashPattern={undefined}
            />
          )}

          {/* Start marker */}
          {historyTrip.start_lat && historyTrip.start_lng && (
            <Marker
              coordinate={{ latitude: historyTrip.start_lat, longitude: historyTrip.start_lng }}
              title="Start"
              pinColor="#22C55E"
            />
          )}

          {/* End marker */}
          {historyTrip.end_lat && historyTrip.end_lng && (
            <Marker
              coordinate={{ latitude: historyTrip.end_lat, longitude: historyTrip.end_lng }}
              title="End"
              pinColor="#EF4444"
            />
          )}

          {/* Hazard pins */}
          {historyHazards.map((h) => (
            <Marker
              key={h.id}
              coordinate={{ latitude: h.latitude, longitude: h.longitude }}
              title={h.type}
              description={`${Math.round(h.confidence * 100)}% confidence`}
              pinColor={HAZARD_COLORS[h.type] ?? primary}
            />
          ))}
        </MapView>

        {/* Trip info card */}
        <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.historyCardWrapper}>
          <View style={[styles.historyCard, { backgroundColor: card, borderColor: border }]}>
            <Text style={[styles.historyTitle, { color: text }]} numberOfLines={1}>
              {new Date(historyTrip.started_at).toLocaleDateString('en-PH', {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </Text>
            <View style={styles.historyMeta}>
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={14} color={textSecondary} />
                <Text style={[styles.metaText, { color: textSecondary }]}>
                  {historyTrip.ended_at ? formatDuration(historyTrip) : 'In progress'}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="warning-outline" size={14} color={textSecondary} />
                <Text style={[styles.metaText, { color: textSecondary }]}>
                  {historyTrip.total_hazards} detected
                </Text>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // LIVE MODE
  const liveRegion = activeTrip?.current_lat && activeTrip?.current_lng
    ? {
        latitude: activeTrip.current_lat,
        longitude: activeTrip.current_lng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }
    : ZAMBOANGA_REGION;

  const routeCoords = activeTrip?.route_points?.map((p) => ({
    latitude: p.lat,
    longitude: p.lng,
  })) ?? [];

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_DEFAULT}
        initialRegion={liveRegion}
        showsUserLocation
        followsUserLocation={isActive}
      >
        {routeCoords.length > 1 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor={primary}
            strokeWidth={3}
          />
        )}

        {activeTrip?.start_lat && activeTrip.start_lng && (
          <Marker
            coordinate={{ latitude: activeTrip.start_lat, longitude: activeTrip.start_lng }}
            title="Start"
            pinColor="#22C55E"
          />
        )}
      </MapView>

      {/* Start/End Ride controls */}
      <SafeAreaView edges={['bottom']} style={styles.rideControls} pointerEvents="box-none">
        {isActive ? (
          <TouchableOpacity
            style={[styles.rideBtn, { backgroundColor: danger }]}
            onPress={handleEndRide}
          >
            <Ionicons name="stop-circle-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.rideBtnText}>End Ride</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.rideBtn, { backgroundColor: success }]}
            onPress={handleStartRide}
          >
            <Ionicons name="play-circle-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.rideBtnText}>Start Ride</Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 16 },
  historyCardWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  historyCard: {
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    gap: 6,
  },
  historyTitle: { fontSize: 15, fontWeight: '700' },
  historyMeta: { flexDirection: 'row', gap: Spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13 },
  rideControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: 90,
  },
  rideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
    height: 52,
    paddingHorizontal: 32,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  rideBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
