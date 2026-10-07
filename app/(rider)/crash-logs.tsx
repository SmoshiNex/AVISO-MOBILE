import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import Toast from 'react-native-toast-message';
import { useThemeColor } from '@/hooks/use-theme-color';
import { api } from '@/lib/api-client';
import { countPendingRideEvents } from '@/lib/local-db';
import { MAX_RIDE_EVENT_ATTEMPTS, syncPendingData } from '@/lib/sync-service';
import type { IotEventType, MinAvgMax, RiderEventLog, RiderEventTypeStats } from '@/types';
import { styles } from '@/styles/crash-logs.style';

type Filter = IotEventType | 'all';

const CATEGORY: Record<IotEventType, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  normal: { label: 'Normal riding', color: '#22C55E', icon: 'pulse-outline' },
  hard_braking: { label: 'Hard braking', color: '#F59E0B', icon: 'speedometer-outline' },
  road_bump: { label: 'Road bump', color: '#0274DF', icon: 'trending-up-outline' },
  crash: { label: 'Crash', color: '#EF4444', icon: 'warning' },
};

const FILTERS: Filter[] = ['all', 'normal', 'hard_braking', 'road_bump', 'crash'];

type Page = { data: RiderEventLog[]; current_page: number; last_page: number; total: number };

const fmt = (v: string | null, digits: number, unit: string) =>
  v === null ? '-' : `${Number(v).toFixed(digits)}${unit}`;

const range = (r: MinAvgMax, unit: string) =>
  r.max === null ? '-' : `${r.min} / ${r.avg} / ${r.max}${unit}`;

/**
 * The rider's crash-detection log: every classification their IoT unit made
 * during rides, the value ranges per category (used to tune the thresholds)
 * and a CSV download.
 */
export default function CrashLogsScreen() {
  const background = useThemeColor({}, 'background');
  const card = useThemeColor({}, 'card');
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const primary = useThemeColor({}, 'primary');
  const border = useThemeColor({}, 'border');

  const [filter, setFilter] = useState<Filter>('all');
  const [events, setEvents] = useState<RiderEventLog[]>([]);
  const [stats, setStats] = useState<RiderEventTypeStats[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const typeQuery = filter === 'all' ? '' : `&type=${filter}`;

  const loadPage = useCallback(async (pageNumber: number) => {
    const res = await api.get<Page>(`/rider/events?page=${pageNumber}&per_page=25${typeQuery}`);
    setEvents((prev) => (pageNumber === 1 ? res.data : [...prev, ...res.data]));
    setPage(res.current_page);
    setLastPage(res.last_page);
    setTotal(res.total);
  }, [typeQuery]);

  const loadAll = useCallback(async () => {
    try {
      // Send anything recorded offline first, so the list is complete.
      await syncPendingData().catch(() => undefined);
      setPending(await countPendingRideEvents(MAX_RIDE_EVENT_ATTEMPTS));
      const [statsRes] = await Promise.all([
        api.get<{ stats: RiderEventTypeStats[] }>('/rider/events/stats'),
        loadPage(1),
      ]);
      setStats(statsRes.stats);
    } catch {
      Toast.show({ type: 'error', text1: 'Could not load the logs. Check your connection.' });
    }
  }, [loadPage]);

  useEffect(() => {
    setLoading(true);
    loadAll().finally(() => setLoading(false));
  }, [loadAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const onEndReached = async () => {
    if (loadingMore || page >= lastPage) return;
    setLoadingMore(true);
    try {
      await loadPage(page + 1);
    } catch {
      // Keep what is shown; the next scroll retries.
    } finally {
      setLoadingMore(false);
    }
  };

  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const csv = await api.get<string>(`/rider/events/export?${typeQuery.slice(1)}`);
      const name = `crash_detection_logs_${filter}_${new Date().toISOString().slice(0, 10)}.csv`;
      const file = new File(Paths.cache, name);
      if (file.exists) file.delete();
      file.create();
      file.write(typeof csv === 'string' ? csv : String(csv));

      // Loaded on tap, not at startup: on an app build made before expo-sharing
      // was added, its native part is missing, and a top-level import would
      // crash every screen (Expo Router loads all routes at launch).
      let Sharing: typeof import('expo-sharing') | null = null;
      try {
        Sharing = await import('expo-sharing');
      } catch {
        Sharing = null;
      }

      if (Sharing && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Save or share the CSV' });
      } else {
        Toast.show({
          type: 'info',
          text1: 'CSV saved on the phone',
          text2: 'Sharing needs the latest app build.',
        });
      }
    } catch {
      Toast.show({ type: 'error', text1: 'Download failed. Check your connection.' });
    } finally {
      setDownloading(false);
    }
  };

  const header = (
    <View style={{ gap: 8 }}>
      {pending > 0 && (
        <View style={styles.pending}>
          <Ionicons name="cloud-upload-outline" size={16} color="#B45309" />
          <Text style={styles.pendingText}>
            {pending} record{pending === 1 ? '' : 's'} recorded offline, uploading when online
          </Text>
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {FILTERS.map((f) => {
          const selected = f === filter;
          const color = f === 'all' ? primary : CATEGORY[f].color;
          return (
            <TouchableOpacity
              key={f}
              style={[styles.chip, { borderColor: color, backgroundColor: selected ? color : 'transparent' }]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.chipText, { color: selected ? '#fff' : color }]}>
                {f === 'all' ? 'All' : CATEGORY[f].label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Text style={[styles.sectionTitle, { color: text }]}>Threshold reference</Text>
      <Text style={[styles.sectionHint, { color: textSecondary }]}>
        min / avg / max per category, across all your rides
      </Text>
      <View style={styles.statsGrid}>
        {stats.map((s) => (
          <TouchableOpacity
            key={s.type}
            style={[styles.statCard, { backgroundColor: card, borderColor: filter === s.type ? CATEGORY[s.type].color : border }]}
            onPress={() => setFilter(s.type)}
          >
            <View style={styles.statHead}>
              <Ionicons name={CATEGORY[s.type].icon} size={14} color={CATEGORY[s.type].color} />
              <Text style={[styles.statLabel, { color: text }]} numberOfLines={1}>{s.label}</Text>
              <Text style={[styles.statCount, { color: CATEGORY[s.type].color }]}>{s.total}</Text>
            </View>
            <Text style={[styles.statLine, { color: textSecondary }]}>G {range(s.g, ' g')}</Text>
            <Text style={[styles.statLine, { color: textSecondary }]}>Vert {range(s.vertical_g, ' g')}</Text>
            <Text style={[styles.statLine, { color: textSecondary }]}>Horiz {range(s.horizontal_g, ' g')}</Text>
            <Text style={[styles.statLine, { color: textSecondary }]}>Gyro {range(s.gyro_dps, '°/s')}</Text>
            <Text style={[styles.statLine, { color: textSecondary }]}>Tilt {range(s.tilt_deg, '°')}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { color: text }]}>
        {filter === 'all' ? 'All records' : CATEGORY[filter].label} · {total}
      </Text>
    </View>
  );

  const renderItem = ({ item }: { item: RiderEventLog }) => {
    const c = CATEGORY[item.event_type];
    return (
      <View style={[styles.row, { backgroundColor: card, borderColor: border }]}>
        <View style={[styles.rowIcon, { backgroundColor: `${c.color}22` }]}>
          <Ionicons name={c.icon} size={18} color={c.color} />
        </View>
        <View style={styles.rowBody}>
          <Text style={[styles.rowTitle, { color: text }]}>
            {c.label} · {fmt(item.acceleration_peak, 2, ' g')}
          </Text>
          <Text style={[styles.rowValues, { color: textSecondary }]}>
            vert {fmt(item.vertical_g, 2, ' g')} · horiz {fmt(item.horizontal_g, 2, ' g')} · gyro{' '}
            {fmt(item.gyro_peak_dps, 0, '°/s')} · tilt {fmt(item.tilt_deg, 0, '°')}
          </Text>
          <Text style={[styles.rowMeta, { color: textSecondary }]}>
            {new Date(item.detected_at).toLocaleString('en-PH')}
            {item.area ? ` · ${item.area}` : ''}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: background }]}>
      <View style={[styles.header, { borderBottomColor: border }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: text }]}>Crash Detection Logs</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={download} accessibilityLabel="Download CSV" disabled={downloading}>
          {downloading ? (
            <ActivityIndicator color={primary} />
          ) : (
            <Ionicons name="download-outline" size={22} color={primary} />
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={primary} />
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          ListHeaderComponent={header}
          contentContainerStyle={styles.listContent}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} />}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={primary} /> : null}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="hardware-chip-outline" size={40} color={textSecondary} />
              <Text style={[styles.emptyText, { color: textSecondary }]}>
                No records yet. They appear while you ride with the IoT unit connected.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
