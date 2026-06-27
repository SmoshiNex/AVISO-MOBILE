import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';

import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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

const HAZARD_STAT_GROUPS = [
  { label: 'Pothole',       types: ['Pothole'],                                                          icon: 'alert-circle-outline'  },
  { label: 'Excavation',    types: ['Road Excavation'],                                                  icon: 'construct-outline'     },
  { label: 'Barrier',       types: ['Road Barrier'],                                                     icon: 'stop-circle-outline'   },
  { label: 'Traffic Sign',  types: ['Traffic Sign'],                                                     icon: 'warning-outline'       },
  { label: 'Traffic Light', types: ['Traffic Light Red', 'Traffic Light Orange', 'Traffic Light Green'], icon: 'stopwatch-outline'     },
] as const;

type SelectedHazard = { source: 'local'; data: LocalHazardLog } | { source: 'api'; data: HazardLog };

const ZAMBOANGA_REGION = {
  latitude: 6.9214,
  longitude: 122.0790,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

export default function MapScreen() {
  const { trip_id } = useLocalSearchParams<{ trip_id?: string }>();
  const isHistoryMode = !!trip_id;
  const insets = useSafeAreaInsets();

  const background = useThemeColor({}, 'background');
  const card = useThemeColor({}, 'card');
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const primary = useThemeColor({}, 'primary');
  const danger = useThemeColor({}, 'danger');
  const success = useThemeColor({}, 'success');
  const border = useThemeColor({}, 'border');

  const { trip: activeTrip, isActive, startTrip, endTrip } = useTrip();

  const [historyTrip, setHistoryTrip] = useState<LocalTrip | null>(null);
  const [historyHazards, setHistoryHazards] = useState<LocalHazardLog[]>([]);
  const [loading, setLoading] = useState(false);

  const [liveHazards, setLiveHazards] = useState<LocalHazardLog[]>([]);
  const [backendHazards, setBackendHazards] = useState<HazardLog[]>([]);

  const [visibleBounds, setVisibleBounds] = useState<{
    minLat: number; maxLat: number; minLng: number; maxLng: number;
  } | null>(null);

  const [selectedHazard, setSelectedHazard] = useState<SelectedHazard | null>(null);

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

  // ── HISTORY MODE ────────────────────────────────────────────────────────────
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
          {routeCoords.length > 1 && (
            <Polyline coordinates={routeCoords} strokeColor={primary} strokeWidth={4} />
          )}
          {historyTrip.start_lat && historyTrip.start_lng && (
            <Marker
              coordinate={{ latitude: historyTrip.start_lat, longitude: historyTrip.start_lng }}
              title="Start"
              pinColor="#22C55E"
            />
          )}
          {historyTrip.end_lat && historyTrip.end_lng && (
            <Marker
              coordinate={{ latitude: historyTrip.end_lat, longitude: historyTrip.end_lng }}
              title="End"
              pinColor="#EF4444"
            />
          )}
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

  // ── LIVE MODE ───────────────────────────────────────────────────────────────
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
        onRegionChangeComplete={(region) => {
          setVisibleBounds({
            minLat: region.latitude - region.latitudeDelta / 2,
            maxLat: region.latitude + region.latitudeDelta / 2,
            minLng: region.longitude - region.longitudeDelta / 2,
            maxLng: region.longitude + region.longitudeDelta / 2,
          });
          setSelectedHazard(null);
        }}
      >
        {routeCoords.length > 1 && (
          <Polyline coordinates={routeCoords} strokeColor={primary} strokeWidth={3} />
        )}

        {activeTrip?.start_lat && activeTrip.start_lng && (
          <Marker
            coordinate={{ latitude: activeTrip.start_lat, longitude: activeTrip.start_lng }}
            title="Start"
            pinColor="#22C55E"
          />
        )}

        {liveHazards.map((h) => (
          <Marker
            key={`local-${h.id}`}
            coordinate={{ latitude: h.latitude, longitude: h.longitude }}
            title={h.type}
            pinColor={HAZARD_COLORS[h.type] ?? primary}
            onPress={() => setSelectedHazard({ source: 'local', data: h })}
          />
        ))}

        {backendHazards.map((h) => (
          <Marker
            key={`api-${h.id}`}
            coordinate={{
              latitude: parseFloat(h.latitude),
              longitude: parseFloat(h.longitude),
            }}
            title={h.type}
            pinColor={HAZARD_COLORS[h.type] ?? primary}
            onPress={() => setSelectedHazard({ source: 'api', data: h })}
          />
        ))}
      </MapView>

      {/* Per-type hazard stat cards */}
      {(liveHazards.length + backendHazards.length) > 0 && (
        <View style={[styles.statsPanel, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsScroll}>
            {HAZARD_STAT_GROUPS.map((group) => {
              const count = [...liveHazards, ...backendHazards].filter((h) => {
                if (!(group.types as readonly string[]).includes(h.type)) return false;
                if (!visibleBounds) return true;
                const lat = typeof h.latitude === 'number' ? h.latitude : parseFloat(h.latitude as string);
                const lng = typeof h.longitude === 'number' ? h.longitude : parseFloat(h.longitude as string);
                return (
                  lat >= visibleBounds.minLat && lat <= visibleBounds.maxLat &&
                  lng >= visibleBounds.minLng && lng <= visibleBounds.maxLng
                );
              }).length;
              return (
                <View key={group.label} style={styles.statCard}>
                  <View style={styles.statCardTop}>
                    <Ionicons name={group.icon as any} size={14} color={HAZARD_COLORS[group.types[0]] ?? primary} />
                    <Text style={styles.statCardCount}>{count}</Text>
                  </View>
                  <Text style={styles.statCardLabel}>{group.label}</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Hazard detail panel */}
      {selectedHazard && (() => {
        const d = selectedHazard.data;
        const lat  = typeof d.latitude   === 'number' ? d.latitude   : parseFloat(d.latitude  as string);
        const lng  = typeof d.longitude  === 'number' ? d.longitude  : parseFloat(d.longitude as string);
        const conf = typeof d.confidence === 'number' ? d.confidence : parseFloat(d.confidence as string);
        const confDisplay = conf <= 1 ? `${Math.round(conf * 100)}%` : `${Math.round(conf)}%`;
        return (
          <View style={[styles.hazardDetailPanel, { backgroundColor: card, borderColor: border, bottom: 160 + insets.bottom }]}>
            <View style={styles.hazardDetailHeader}>
              <View style={[styles.hazardDetailDot, { backgroundColor: HAZARD_COLORS[d.type] ?? primary }]} />
              <Text style={[styles.hazardDetailType, { color: text }]}>{d.type}</Text>
              <TouchableOpacity onPress={() => setSelectedHazard(null)} style={styles.hazardDetailClose}>
                <Ionicons name="close" size={18} color={textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.hazardDetailRow}>
              <Ionicons name="time-outline" size={13} color={textSecondary} />
              <Text style={[styles.hazardDetailText, { color: textSecondary }]}>
                {new Date(d.detected_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            {d.area ? (
              <View style={styles.hazardDetailRow}>
                <Ionicons name="location-outline" size={13} color={textSecondary} />
                <Text style={[styles.hazardDetailText, { color: textSecondary }]} numberOfLines={1}>{d.area}</Text>
              </View>
            ) : null}
            <View style={styles.hazardDetailRow}>
              <Ionicons name="navigate-outline" size={13} color={textSecondary} />
              <Text style={[styles.hazardDetailText, { color: textSecondary }]}>{lat.toFixed(5)}, {lng.toFixed(5)}</Text>
            </View>
            <View style={styles.hazardDetailRow}>
              <Ionicons name="stats-chart-outline" size={13} color={textSecondary} />
              <Text style={[styles.hazardDetailText, { color: textSecondary }]}>Confidence: {confDisplay}</Text>
            </View>
            {d.distance != null && (
              <View style={styles.hazardDetailRow}>
                <Ionicons name="resize-outline" size={13} color={textSecondary} />
                <Text style={[styles.hazardDetailText, { color: textSecondary }]}>Distance: {d.distance} m</Text>
              </View>
            )}
          </View>
        );
      })()}

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
