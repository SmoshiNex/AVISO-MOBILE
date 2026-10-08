import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getTrips, getTripHazardCounts } from '@/lib/local-db';
import { pullFromBackend } from '@/lib/sync-service';
import { placeLabel } from '@/lib/barangay-lookup';
import { formatDistance, formatDuration, routeDistanceKm, tripRoute, type RoutePoint } from '@/lib/route-utils';
import { RouteThumbnail } from '@/components/RouteThumbnail';
import type { LocalTrip } from '@/types';
import { styles } from '@/styles/trip-history.style';

/** A trip plus what the card shows, computed once when the list loads. */
type TripRow = {
  trip: LocalTrip;
  route: RoutePoint[];
  places: string;
  distance: string;
  hazards: number;
};

function toRow(trip: LocalTrip, hazardCounts: Record<number, number>): TripRow {
  const route = tripRoute(trip);
  const start = route[0];
  const end = route.length > 1 ? route[route.length - 1] : undefined;
  const from = placeLabel(start?.lat, start?.lng);
  const to = end ? placeLabel(end.lat, end.lng) : from;
  return {
    trip,
    route,
    places: from === to ? from : `${from} → ${to}`,
    distance: formatDistance(routeDistanceKm(route)),
    hazards: hazardCounts[trip.id] ?? trip.total_hazards ?? 0,
  };
}

export default function TripHistoryScreen() {
  const background = useThemeColor({}, 'background');
  const backgroundElement = useThemeColor({}, 'backgroundElement');
  const card = useThemeColor({}, 'card');
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const primary = useThemeColor({}, 'primary');
  const border = useThemeColor({}, 'border');
  const success = useThemeColor({}, 'success');

  const [trips, setTrips] = useState<TripRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadTrips = useCallback(async () => {
    const [data, counts] = await Promise.all([getTrips(), getTripHazardCounts()]);
    setTrips(data.map((t) => toRow(t, counts)));
  }, []);

  useEffect(() => {
    loadTrips().finally(() => setLoading(false));
  }, [loadTrips]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await pullFromBackend(true);
    await loadTrips();
    setRefreshing(false);
  }, [loadTrips]);

  const formatDate = (dateStr: string): string =>
    new Date(dateStr).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  const formatTime = (dateStr: string): string =>
    new Date(dateStr).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });

  const renderItem = ({ item }: { item: TripRow }) => {
    const { trip } = item;
    return (
      <TouchableOpacity
        style={[styles.tripCard, { backgroundColor: card, borderColor: border }]}
        onPress={() => router.push({ pathname: '/(rider)/trip/[id]', params: { id: String(trip.id) } })}
        activeOpacity={0.75}
        accessibilityLabel={`Trip ${item.places}, ${formatDate(trip.started_at)}`}
      >
        <View style={styles.tripCardTop}>
          <RouteThumbnail points={item.route} size={64} color={primary} background={backgroundElement} />
          <View style={styles.tripInfo}>
            <Text style={[styles.tripPlaces, { color: text }]} numberOfLines={1}>{item.places}</Text>
            <Text style={[styles.tripDate, { color: text }]}>{formatDate(trip.started_at)}</Text>
            <Text style={[styles.tripTime, { color: textSecondary }]}>
              {formatTime(trip.started_at)}
              {trip.ended_at ? ` — ${formatTime(trip.ended_at)}` : ''}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={textSecondary} />
        </View>

        <View style={[styles.tripStats, { borderTopColor: border }]}>
          <View style={styles.statItem}>
            <Ionicons name="navigate-outline" size={14} color={textSecondary} />
            <Text style={[styles.statText, { color: textSecondary }]}>{item.distance}</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="time-outline" size={14} color={textSecondary} />
            <Text style={[styles.statText, { color: textSecondary }]}>{formatDuration(trip)}</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="warning-outline" size={14} color={item.hazards > 0 ? '#F59E0B' : textSecondary} />
            <Text style={[styles.statText, { color: item.hazards > 0 ? '#F59E0B' : textSecondary }]}>
              {item.hazards} hazard{item.hazards !== 1 ? 's' : ''}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons
              name={trip.synced ? 'cloud-done-outline' : 'cloud-offline-outline'}
              size={14}
              color={trip.synced ? success : textSecondary}
            />
            <Text style={[styles.statText, { color: trip.synced ? success : textSecondary }]}>
              {trip.synced ? 'Synced' : 'Pending'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: background }]}>
        <ActivityIndicator color={primary} />
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: border }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={24} color={text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: text }]}>Trip History</Text>
        </View>
        <Text style={[styles.headerCount, { color: textSecondary }]}>{trips.length} trips</Text>
      </View>

      <FlatList
        data={trips}
        keyExtractor={(item) => String(item.trip.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} />
        }
        ListEmptyComponent={
          <View style={[styles.empty, { backgroundColor: backgroundElement }]}>
            <Ionicons name="map-outline" size={48} color={textSecondary} />
            <Text style={[styles.emptyTitle, { color: text }]}>No trips yet</Text>
            <Text style={[styles.emptySubtitle, { color: textSecondary }]}>
              Start your first ride from the Home or Map tab
            </Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      />
    </SafeAreaView>
  );
}

