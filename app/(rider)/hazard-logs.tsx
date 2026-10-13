import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  SectionList,
  ScrollView,
  TouchableOpacity,
  Modal,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import * as Network from 'expo-network';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getHazardLogs, getTripsByIds } from '@/lib/local-db';
import { placeLabel } from '@/lib/barangay-lookup';
import { rideLabel, tripRoute } from '@/lib/route-utils';
import { pullFromBackend } from '@/lib/sync-service';
import { distanceWord } from '@/lib/distance-estimator';
import { HAZARD_COLORS } from '@/constants/hazards';
import type { LocalHazardLog } from '@/types';
import { styles } from '@/styles/hazard-logs.style';

/** What a detection shows about the ride it was seen on. */
type TripInfo = { label: string; places: string };

const TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'Pothole', label: 'Pothole' },
  { key: 'Road Excavation', label: 'Excavation' },
  { key: 'Road Barrier', label: 'Barrier' },
] as const;
type TypeFilter = (typeof TYPE_FILTERS)[number]['key'];

const WHEN_FILTERS = [
  { key: 'today', label: 'Today', days: 1 },
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: 'all', label: 'All', days: null },
] as const;
type WhenFilter = (typeof WHEN_FILTERS)[number]['key'];

type DaySection = { key: string; title: string; data: LocalHazardLog[] };

/** Local calendar day, e.g. "2026-10-11" — groups detections by the rider's own date. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Start of the day `daysBack - 1` days ago (Today = since midnight, 7 days = today and the 6 before). */
function sinceMs(daysBack: number): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (daysBack - 1));
  return d.getTime();
}

/** "Today", "Yesterday", or e.g. "Sat, Oct 11". */
function dayTitle(d: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(d) === dayKey(today)) return 'Today';
  if (dayKey(d) === dayKey(yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
  });
}

export default function HazardLogsScreen() {
  const background = useThemeColor({}, 'background');
  const backgroundElement = useThemeColor({}, 'backgroundElement');
  const card = useThemeColor({}, 'card');
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const primary = useThemeColor({}, 'primary');
  const border = useThemeColor({}, 'border');

  const [logs, setLogs] = useState<LocalHazardLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<LocalHazardLog | null>(null);
  const [tripInfo, setTripInfo] = useState<Record<number, TripInfo>>({});
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [whenFilter, setWhenFilter] = useState<WhenFilter>('all');

  // Logs inside the chosen time range; the type chips count from these.
  const inRange = useMemo(() => {
    const days = WHEN_FILTERS.find((w) => w.key === whenFilter)?.days ?? null;
    if (days === null) return logs;
    const since = sinceMs(days);
    return logs.filter((l) => new Date(l.detected_at).getTime() >= since);
  }, [logs, whenFilter]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: inRange.length };
    for (const l of inRange) counts[l.type] = (counts[l.type] ?? 0) + 1;
    return counts;
  }, [inRange]);

  // Filtered, then grouped by day (logs are already newest first).
  const sections = useMemo(() => {
    const shown = typeFilter === 'all' ? inRange : inRange.filter((l) => l.type === typeFilter);
    const byDay: DaySection[] = [];
    for (const log of shown) {
      const d = new Date(log.detected_at);
      const key = dayKey(d);
      const last = byDay[byDay.length - 1];
      if (last?.key === key) last.data.push(log);
      else byDay.push({ key, title: dayTitle(d), data: [log] });
    }
    return byDay;
  }, [inRange, typeFilter]);

  const shownCount = useMemo(() => sections.reduce((n, s) => n + s.data.length, 0), [sections]);
  const isFiltered = typeFilter !== 'all' || whenFilter !== 'all';

  const loadLogs = useCallback(async () => {
    const data = await getHazardLogs();
    const tripIds = [...new Set(data.map((l) => l.trip_id).filter((id): id is number => !!id))];
    const trips = await getTripsByIds(tripIds);
    const info: Record<number, TripInfo> = {};
    for (const t of trips) {
      const route = tripRoute(t);
      const from = placeLabel(route[0]?.lat, route[0]?.lng);
      const last = route.length > 1 ? route[route.length - 1] : undefined;
      const to = last ? placeLabel(last.lat, last.lng) : from;
      info[t.id] = { label: rideLabel(t), places: from === to ? from : `${from} → ${to}` };
    }
    setTripInfo(info);
    setLogs(data);
  }, []);

  const openTrip = useCallback((tripId: number) => {
    setSelected(null);
    router.push({ pathname: '/(rider)/trip/[id]', params: { id: String(tripId) } });
  }, []);

  useEffect(() => {
    loadLogs().finally(() => setLoading(false));
  }, [loadLogs]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const state = await Network.getNetworkStateAsync();
    const online = state.isConnected === true && state.isInternetReachable !== false;
    await pullFromBackend(true);
    await loadLogs();
    setRefreshing(false);
    if (online) {
      Toast.show({ type: 'success', text1: 'Up to date', text2: 'Synced with server', visibilityTime: 2500 });
    } else {
      Toast.show({ type: 'info', text1: 'Offline', text2: 'Showing locally cached detections', visibilityTime: 3000 });
    }
  }, [loadLogs]);

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString('en-PH', {
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

  const renderItem = ({ item }: { item: LocalHazardLog }) => {
    const color = HAZARD_COLORS[item.type] ?? primary;
    return (
      <TouchableOpacity
        style={[styles.row, { backgroundColor: card, borderColor: border }]}
        onPress={() => setSelected(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.typeIndicator, { backgroundColor: color + '22' }]}>
          <View style={[styles.typeDot, { backgroundColor: color }]} />
        </View>
        <View style={styles.rowContent}>
          <Text style={[styles.rowType, { color: text }]} numberOfLines={1}>{item.type}</Text>
          <Text style={[styles.rowMeta, { color: textSecondary }]}>
            {formatDate(item.detected_at)} · {formatTime(item.detected_at)}
          </Text>
          {(item.area || !item.synced) && (
            <Text style={[styles.rowArea, { color: textSecondary }]} numberOfLines={1}>
              {item.area ?? 'Pending sync'}
            </Text>
          )}
          {item.nearest_hazard_distance !== undefined && (
            <Text style={[styles.rowArea, { color: textSecondary }]} numberOfLines={1}>
              {hazardToHazardLabel(item)}
            </Text>
          )}
          <View style={styles.rowTrip}>
            <Ionicons name="bicycle-outline" size={12} color={item.trip_id && tripInfo[item.trip_id] ? primary : textSecondary} />
            <Text
              style={[styles.rowTripText, { color: item.trip_id && tripInfo[item.trip_id] ? primary : textSecondary }]}
              numberOfLines={1}
            >
              {item.trip_id && tripInfo[item.trip_id] ? tripInfo[item.trip_id].label : 'No trip'}
            </Text>
          </View>
        </View>
        <View style={styles.rowRight}>
          <Text style={[styles.confidence, { color }]}>
            {Math.round(item.confidence * 100)}%
          </Text>
          {item.distance !== undefined && (
            <Text style={[styles.distance, { color: textSecondary }]}>
              ~{item.distance} m
            </Text>
          )}
          {!item.synced && (
            <Ionicons name="cloud-offline-outline" size={12} color={textSecondary} />
          )}
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
        <Text style={[styles.headerTitle, { color: text }]}>My Detections</Text>
        <Text style={[styles.headerCount, { color: textSecondary }]}>
          {isFiltered ? `${shownCount} of ${logs.length}` : `${logs.length} total`}
        </Text>
      </View>

      {/* Filters: type (with counts for the chosen time range) and time range */}
      {logs.length > 0 && (
        <View style={[styles.filterBar, { borderBottomColor: border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {TYPE_FILTERS.map((f) => (
              <FilterChip
                key={f.key}
                label={`${f.label} ${typeCounts[f.key] ?? 0}`}
                dotColor={f.key === 'all' ? undefined : HAZARD_COLORS[f.key]}
                active={typeFilter === f.key}
                onPress={() => setTypeFilter(f.key)}
                activeColor={primary}
                textColor={text}
                borderColor={border}
                background={card}
              />
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {WHEN_FILTERS.map((f) => (
              <FilterChip
                key={f.key}
                label={f.label}
                active={whenFilter === f.key}
                onPress={() => setWhenFilter(f.key)}
                activeColor={primary}
                textColor={text}
                borderColor={border}
                background={card}
              />
            ))}
          </ScrollView>
        </View>
      )}

      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: background }]}>
            <Text style={[styles.sectionTitle, { color: text }]}>{section.title}</Text>
            <Text style={[styles.sectionCount, { color: textSecondary }]}>
              {section.data.length} {section.data.length === 1 ? 'detection' : 'detections'}
            </Text>
          </View>
        )}
        stickySectionHeadersEnabled
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} />
        }
        ListEmptyComponent={
          logs.length > 0 ? (
            <View style={[styles.empty, { backgroundColor: backgroundElement }]}>
              <Ionicons name="filter-outline" size={48} color={textSecondary} />
              <Text style={[styles.emptyTitle, { color: text }]}>No detections</Text>
              <Text style={[styles.emptySubtitle, { color: textSecondary }]}>
                Nothing matches these filters. Try another type or a longer time range.
              </Text>
            </View>
          ) : (
            <View style={[styles.empty, { backgroundColor: backgroundElement }]}>
              <Ionicons name="warning-outline" size={48} color={textSecondary} />
              <Text style={[styles.emptyTitle, { color: text }]}>No detections yet</Text>
              <Text style={[styles.emptySubtitle, { color: textSecondary }]}>
                Hazards detected during your rides will appear here
              </Text>
            </View>
          )
        }
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      />

      {/* Detail Modal */}
      <Modal
        visible={!!selected}
        animationType="slide"
        transparent
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: card }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: text }]}>{selected?.type}</Text>
              <TouchableOpacity onPress={() => setSelected(null)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={textSecondary} />
              </TouchableOpacity>
            </View>

            {selected && (
              <View style={styles.detailGrid}>
                <DetailRow
                  icon="calendar-outline"
                  label="Detected"
                  value={`${formatDate(selected.detected_at)} at ${formatTime(selected.detected_at)}`}
                  textColor={text}
                  labelColor={textSecondary}
                />
                <DetailRow
                  icon="stats-chart-outline"
                  label="Confidence"
                  value={`${Math.round(selected.confidence * 100)}%`}
                  textColor={text}
                  labelColor={textSecondary}
                />
                {selected.distance !== undefined && (
                  <DetailRow
                    icon="resize-outline"
                    label="Camera Hazard Distance"
                    value={cameraDistanceLabel(selected.distance)}
                    textColor={text}
                    labelColor={textSecondary}
                  />
                )}
                <DetailRow
                  icon="git-compare-outline"
                  label="Hazard to Hazard Distance"
                  value={selected.synced ? hazardToHazardLabel(selected) : 'Calculated after sync'}
                  textColor={text}
                  labelColor={textSecondary}
                />
                {(selected.area || !selected.synced) && (
                  <DetailRow
                    icon="map-outline"
                    label="Barangay"
                    value={selected.area ?? 'Pending sync'}
                    textColor={text}
                    labelColor={textSecondary}
                  />
                )}
                <DetailRow
                  icon="location-outline"
                  label="Coordinates"
                  value={`${selected.latitude.toFixed(5)}, ${selected.longitude.toFixed(5)}`}
                  textColor={text}
                  labelColor={textSecondary}
                />
                <DetailRow
                  icon="cloud-outline"
                  label="Sync status"
                  value={selected.synced ? 'Synced' : 'Pending sync'}
                  textColor={selected.synced ? '#22C55E' : textSecondary}
                  labelColor={textSecondary}
                />
                <DetailRow
                  icon="bicycle-outline"
                  label="Trip"
                  value={
                    selected.trip_id && tripInfo[selected.trip_id]
                      ? `${tripInfo[selected.trip_id].label}
${tripInfo[selected.trip_id].places}`
                      : 'Not linked to a trip'
                  }
                  textColor={text}
                  labelColor={textSecondary}
                />
                {selected.trip_id && tripInfo[selected.trip_id] && (
                  <TouchableOpacity
                    style={[styles.tripButton, { backgroundColor: primary }]}
                    onPress={() => openTrip(selected.trip_id!)}
                    accessibilityLabel="View trip on map"
                  >
                    <Ionicons name="map-outline" size={18} color="#fff" />
                    <Text style={styles.tripButtonText}>View trip on map</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const DISTANCE_WORD_SHORT = { near: 'Near', ahead: 'Ahead', far: 'Far' } as const;

/** Camera distance is an estimate from the box size, so it carries the Near/Ahead/Far word. */
function cameraDistanceLabel(meters: number): string {
  return `~${meters} m · ${DISTANCE_WORD_SHORT[distanceWord(meters)]}`;
}

/** Nearest other hazard of the same type (from the server), e.g. "18 m → POT-20261011-0003". */
function hazardToHazardLabel(log: LocalHazardLog): string {
  if (log.nearest_hazard_distance === undefined || !log.nearest_hazard_code) return '—';
  return `${Math.round(log.nearest_hazard_distance)} m → ${log.nearest_hazard_code}`;
}

function FilterChip({
  label,
  dotColor,
  active,
  onPress,
  activeColor,
  textColor,
  borderColor,
  background,
}: {
  label: string;
  dotColor?: string;
  active: boolean;
  onPress: () => void;
  activeColor: string;
  textColor: string;
  borderColor: string;
  background: string;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        active
          ? { backgroundColor: activeColor, borderColor: activeColor }
          : { backgroundColor: background, borderColor },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`Show ${label}`}
    >
      {dotColor && <View style={[styles.chipDot, { backgroundColor: dotColor }]} />}
      <Text style={[styles.chipText, { color: active ? '#fff' : textColor }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function DetailRow({
  icon,
  label,
  value,
  textColor,
  labelColor,
}: {
  icon: string;
  label: string;
  value: string;
  textColor: string;
  labelColor: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon as any} size={16} color={labelColor} style={{ width: 20 }} />
      <Text style={[styles.detailLabel, { color: labelColor }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: textColor }]}>{value}</Text>
    </View>
  );
}

