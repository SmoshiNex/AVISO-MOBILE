import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getTrips } from '@/lib/local-db';
import { Spacing, Radius } from '@/constants/theme';
import type { LocalTrip } from '@/types';

export default function TripHistoryScreen() {
  const background = useThemeColor({}, 'background');
  const backgroundElement = useThemeColor({}, 'backgroundElement');
  const card = useThemeColor({}, 'card');
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const primary = useThemeColor({}, 'primary');
  const border = useThemeColor({}, 'border');
  const success = useThemeColor({}, 'success');

  const [trips, setTrips] = useState<LocalTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadTrips = useCallback(async () => {
    const data = await getTrips();
    setTrips(data);
  }, []);

  useEffect(() => {
    loadTrips().finally(() => setLoading(false));
  }, [loadTrips]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTrips();
    setRefreshing(false);
  }, [loadTrips]);

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString('en-PH', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (dateStr: string): string => {
    return new Date(dateStr).toLocaleTimeString('en-PH', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (trip: LocalTrip): string => {
    if (!trip.started_at || !trip.ended_at) return '';
    const ms = new Date(trip.ended_at).getTime() - new Date(trip.started_at).getTime();
    const mins = Math.round(ms / 60000);
    if (mins < 1) return '< 1 min';
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  const handleTripPress = (trip: LocalTrip) => {
    router.navigate({ pathname: '/(rider)/map', params: { trip_id: String(trip.id) } });
  };

  const renderItem = ({ item }: { item: LocalTrip }) => (
    <TouchableOpacity
      style={[styles.tripCard, { backgroundColor: card, borderColor: border }]}
      onPress={() => handleTripPress(item)}
      activeOpacity={0.75}
    >
      <View style={styles.tripCardTop}>
        <View style={[styles.tripIconWrap, { backgroundColor: primary + '15' }]}>
          <Ionicons name="bicycle" size={22} color={primary} />
        </View>
        <View style={styles.tripInfo}>
          <Text style={[styles.tripDate, { color: text }]}>{formatDate(item.started_at)}</Text>
          <Text style={[styles.tripTime, { color: textSecondary }]}>
            {formatTime(item.started_at)}
            {item.ended_at ? ` — ${formatTime(item.ended_at)}` : ''}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={textSecondary} />
      </View>

      <View style={[styles.tripStats, { borderTopColor: border }]}>
        <View style={styles.statItem}>
          <Ionicons name="time-outline" size={14} color={textSecondary} />
          <Text style={[styles.statText, { color: textSecondary }]}>
            {item.ended_at ? formatDuration(item) : 'In progress'}
          </Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="warning-outline" size={14} color={item.total_hazards > 0 ? '#F59E0B' : textSecondary} />
          <Text style={[
            styles.statText,
            { color: item.total_hazards > 0 ? '#F59E0B' : textSecondary },
          ]}>
            {item.total_hazards} hazard{item.total_hazards !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons
            name={item.synced ? 'cloud-done-outline' : 'cloud-offline-outline'}
            size={14}
            color={item.synced ? success : textSecondary}
          />
          <Text style={[styles.statText, { color: item.synced ? success : textSecondary }]}>
            {item.synced ? 'Synced' : 'Local'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

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
        <Text style={[styles.headerTitle, { color: text }]}>Trip History</Text>
        <Text style={[styles.headerCount, { color: textSecondary }]}>{trips.length} trips</Text>
      </View>

      <FlatList
        data={trips}
        keyExtractor={(item) => String(item.id)}
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  headerCount: { fontSize: 13 },
  listContent: { padding: Spacing.md, paddingBottom: 40 },
  tripCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tripCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: 12,
  },
  tripIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripInfo: { flex: 1 },
  tripDate: { fontSize: 15, fontWeight: '600' },
  tripTime: { fontSize: 13, marginTop: 2 },
  tripStats: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: Spacing.md,
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 12 },
  empty: {
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptySubtitle: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
