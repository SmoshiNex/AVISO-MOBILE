import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Mapbox from '@rnmapbox/maps';
import { Map, MapMarker, MapRoute } from '@/components/ui/map';
import { BarangayBoundaries } from '@/components/BarangayBoundaries';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getTripById, getHazardLogsForTrip } from '@/lib/local-db';
import { placeLabel } from '@/lib/barangay-lookup';
import {
  formatDistance,
  formatDuration,
  formatTime,
  routeBounds,
  routeDistanceKm,
  simplifyRoute,
  tripRoute,
} from '@/lib/route-utils';
import { HAZARD_COLORS } from '@/constants/hazards';
import type { LocalHazardLog, LocalTrip } from '@/types';
import { styles } from '@/styles/trip-detail.style';

const START_COLOR = '#22C55E';
const END_COLOR = '#EF4444';

function MarkerDot({ color }: { color: string }) {
  return <View style={[styles.markerDot, { backgroundColor: color }]} />;
}

/**
 * One ride on the map, like Strava: the whole route fitted on screen, start and end places with
 * times, the hazards found on it, and distance / duration. Opened from Trip History and from a
 * detection in My Detections; Back returns there (the Map tab stays the live map).
 */
export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const background = useThemeColor({}, 'background');
  const card = useThemeColor({}, 'card');
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const primary = useThemeColor({}, 'primary');
  const border = useThemeColor({}, 'border');

  const [trip, setTrip] = useState<LocalTrip | null>(null);
  const [hazards, setHazards] = useState<LocalHazardLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tripId = Number(id);
    if (!Number.isFinite(tripId)) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    Promise.all([getTripById(tripId), getHazardLogsForTrip(tripId)])
      .then(([t, h]) => {
        if (cancelled) return;
        setTrip(t);
        setHazards(h);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Everything derived from the route is computed once per trip, not on every render.
  const view = useMemo(() => {
    if (!trip) return null;
    const route = tripRoute(trip);
    const simplified = simplifyRoute(route, 5);
    const start = route[0] ?? null;
    const end = route.length > 1 ? route[route.length - 1] : null;
    return {
      coords: simplified.map((p) => [p.lng, p.lat] as [number, number]),
      bounds: routeBounds(simplified),
      start,
      end,
      startPlace: placeLabel(start?.lat, start?.lng),
      endPlace: end ? placeLabel(end.lat, end.lng) : '—',
      distance: formatDistance(routeDistanceKm(route)),
    };
  }, [trip]);

  const hazardFeatures = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: hazards.map((h) => ({
        type: 'Feature' as const,
        id: `trip-hazard-${h.id}`,
        geometry: { type: 'Point' as const, coordinates: [h.longitude, h.latitude] },
        properties: { color: HAZARD_COLORS[h.type] ?? primary },
      })),
    }),
    [hazards, primary],
  );

  const header = (
    <View style={[styles.header, { borderBottomColor: border }]}>
      <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} accessibilityLabel="Back">
        <Ionicons name="chevron-back" size={24} color={text} />
      </TouchableOpacity>
      <Text style={[styles.headerTitle, { color: text }]} numberOfLines={1}>
        {trip
          ? new Date(trip.started_at).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
          : 'Trip'}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: background }]}>
        {header}
        <View style={styles.center}>
          <ActivityIndicator color={primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!trip || !view) {
    return (
      <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: background }]}>
        {header}
        <View style={styles.center}>
          <Ionicons name="map-outline" size={48} color={textSecondary} />
          <Text style={[styles.emptyText, { color: textSecondary }]}>Trip not found</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[styles.backLink, { color: primary }]}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: background }]}>
      {header}
      <View style={styles.mapWrap}>
        <Map bounds={view.bounds ? { ...view.bounds, padding: 64 } : undefined}>
          <BarangayBoundaries visible />
          {view.coords.length > 1 && <MapRoute coordinates={view.coords} color={primary} width={4} />}
          {view.start && (
            <MapMarker longitude={view.start.lng} latitude={view.start.lat} label={`Start · ${formatTime(trip.started_at)}`}>
              <MarkerDot color={START_COLOR} />
            </MapMarker>
          )}
          {view.end && (
            <MapMarker
              longitude={view.end.lng}
              latitude={view.end.lat}
              label={trip.ended_at ? `End · ${formatTime(trip.ended_at)}` : 'Last point'}
            >
              <MarkerDot color={END_COLOR} />
            </MapMarker>
          )}
          <Mapbox.ShapeSource id="trip-hazards-source" shape={hazardFeatures}>
            <Mapbox.CircleLayer
              id="trip-hazards-layer"
              style={{
                circleRadius: 6,
                circleColor: ['get', 'color'],
                circleStrokeWidth: 2,
                circleStrokeColor: 'white',
                circlePitchAlignment: 'map',
              }}
            />
          </Mapbox.ShapeSource>
        </Map>

        <View style={[styles.summary, { backgroundColor: card, borderColor: border, bottom: insets.bottom + 16 }]}>
          <View style={styles.placesRow}>
            <View style={[styles.dot, { backgroundColor: START_COLOR }]} />
            <View style={styles.placeBlock}>
              <Text style={[styles.placeLabel, { color: textSecondary }]}>Start</Text>
              <Text style={[styles.placeName, { color: text }]} numberOfLines={1}>{view.startPlace}</Text>
              <Text style={[styles.placeTime, { color: textSecondary }]}>{formatTime(trip.started_at)}</Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color={textSecondary} />
            <View style={[styles.dot, { backgroundColor: END_COLOR }]} />
            <View style={styles.placeBlock}>
              <Text style={[styles.placeLabel, { color: textSecondary }]}>End</Text>
              <Text style={[styles.placeName, { color: text }]} numberOfLines={1}>{view.endPlace}</Text>
              <Text style={[styles.placeTime, { color: textSecondary }]}>
                {trip.ended_at ? formatTime(trip.ended_at) : 'In progress'}
              </Text>
            </View>
          </View>
          <View style={[styles.stats, { borderTopColor: border }]}>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: text }]}>{view.distance}</Text>
              <Text style={[styles.statLabel, { color: textSecondary }]}>Distance</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: text }]}>{formatDuration(trip)}</Text>
              <Text style={[styles.statLabel, { color: textSecondary }]}>Duration</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: hazards.length > 0 ? '#F59E0B' : text }]}>{hazards.length}</Text>
              <Text style={[styles.statLabel, { color: textSecondary }]}>Hazards</Text>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
