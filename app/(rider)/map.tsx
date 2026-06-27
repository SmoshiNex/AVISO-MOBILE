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
import Toast from 'react-native-toast-message';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useTrip } from '@/hooks/use-trip';
import { getTripById, getHazardLogsForTrip, getHazardLogs } from '@/lib/local-db';
import { api } from '@/lib/api-client';
import { HAZARD_COLORS } from '@/constants/hazards';
import type { LocalTrip, LocalHazardLog, HazardLog } from '@/types';
import { styles } from '@/styles/map.style';

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

  // Live mode — locally detected hazards from SQLite (this rider's session)
  const [liveHazards, setLiveHazards] = useState<LocalHazardLog[]>([]);

  // Live mode — all active hazards from the backend (all riders, synced with admin map)
  const [backendHazards, setBackendHazards] = useState<HazardLog[]>([]);

  useEffect(() => {
    if (isHistoryMode) return;
    const load = () => getHazardLogs().then(setLiveHazards);
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [isHistoryMode]);

  useEffect(() => {
    if (isHistoryMode) return;
    const fetchBackendHazards = async () => {
      try {
        const data = await api.get<HazardLog[]>('/rider/hazards');
        setBackendHazards(data);
      } catch {}
    };
    fetchBackendHazards();
    const interval = setInterval(fetchBackendHazards, 15000);
    return () => clearInterval(interval);
  }, [isHistoryMode]);

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
    Toast.show({ type: 'info', text1: 'Starting ride...' });
    try {
      await startTrip();
      Toast.show({ type: 'success', text1: 'Ride started — drive safe!' });
    } catch {
      Toast.show({ type: 'error', text1: 'Could not start. Check your connection.' });
    }
  }, [startTrip]);

  const handleEndRide = useCallback(async () => {
    Toast.show({ type: 'info', text1: 'Ending ride...' });
    try {
      await endTrip();
      Toast.show({ type: 'success', text1: 'Ride ended and saved!' });
    } catch {
      Toast.show({ type: 'error', text1: 'Could not end ride.' });
    }
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

        {/* Local hazards detected this session */}
        {liveHazards.map((h) => (
          <Marker
            key={`local-${h.id}`}
            coordinate={{ latitude: h.latitude, longitude: h.longitude }}
            title={h.type}
            description={`${Math.round(h.confidence * 100)}% confidence`}
            pinColor={HAZARD_COLORS[h.type] ?? primary}
          />
        ))}

        {/* Community hazard layer — all riders' detected hazards (synced with admin map) */}
        {backendHazards.map((h) => (
          <Marker
            key={`api-${h.id}`}
            coordinate={{
              latitude: parseFloat(h.latitude),
              longitude: parseFloat(h.longitude),
            }}
            title={h.type}
            description={`${h.area ?? ''} · ${h.confidence}% confidence`}
            pinColor={HAZARD_COLORS[h.type] ?? primary}
          />
        ))}
      </MapView>

      {/* Hazard count badge */}
      {(liveHazards.length + backendHazards.length) > 0 && (
        <SafeAreaView edges={['top']} style={styles.hazardCountWrapper} pointerEvents="none">
          <View style={[styles.hazardCountBadge, { backgroundColor: primary }]}>
            <Ionicons name="warning-outline" size={12} color="#fff" />
            <Text style={styles.hazardCountText}>
              {liveHazards.length + backendHazards.length} hazards
            </Text>
          </View>
        </SafeAreaView>
      )}

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
