import { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getDashboardStats, getContactCount } from '@/lib/local-db';
import { pullFromBackend } from '@/lib/sync-service';
import { Colors } from '@/constants/theme';
import { HAZARD_COLORS } from '@/constants/hazards';
import type { LocalTrip, LocalHazardLog } from '@/types';
import { styles } from '@/styles/home.style';

type DashboardData = {
  riderName: string;
  avatarUrl: string | null;
  contactCount: number;
  totalTrips: number;
  totalDetections: number;
  recentDetections: LocalHazardLog[];
  lastTrip: LocalTrip | null;
};

export default function HomeScreen() {
  const background = useThemeColor({}, 'background');
  const backgroundElement = useThemeColor({}, 'backgroundElement');
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const primary = useThemeColor({}, 'primary');
  const actionBg = useThemeColor({}, 'actionBg');
  const actionText = useThemeColor({}, 'actionText');
  const success = useThemeColor({}, 'success');
  const warning = useThemeColor({}, 'warning');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');

  const [data, setData] = useState<DashboardData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const [userJson, stats, contactCount] = await Promise.all([
      SecureStore.getItemAsync('rider_user'),
      getDashboardStats(),
      getContactCount(),
    ]);

    const user = userJson ? JSON.parse(userJson) : null;
    const riderName = user?.first_name ?? 'Rider';
    const avatarUrl = user?.avatar_url ?? null;

    setData({
      riderName,
      avatarUrl,
      contactCount,
      totalTrips: stats.totalTrips,
      totalDetections: stats.totalDetections,
      recentDetections: stats.recentDetections,
      lastTrip: stats.lastTrip,
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      pullFromBackend().catch(() => {}).finally(() => loadData());
    }, [loadData]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await pullFromBackend(true).catch(() => {});
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const greeting = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const formatDate = (): string => {
    return new Date().toLocaleDateString('en-PH', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTripDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDuration = (trip: LocalTrip): string => {
    if (!trip.started_at || !trip.ended_at) return '';
    const mins = Math.round(
      (new Date(trip.ended_at).getTime() - new Date(trip.started_at).getTime()) / 60000
    );
    return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: textSecondary }]}>
              {greeting()}, {data?.riderName ?? '—'}
            </Text>
            <Text style={[styles.date, { color: text }]}>{formatDate()}</Text>
          </View>
          {data?.avatarUrl ? (
            <Image
              source={{ uri: data.avatarUrl }}
              style={[styles.avatarCircle, { borderRadius: 999 }]}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.avatarCircle, { backgroundColor: actionBg }]}>
              <Text style={styles.avatarText}>
                {data?.riderName?.[0]?.toUpperCase() ?? 'R'}
              </Text>
            </View>
          )}
        </View>

        {/* Safety Status Card */}
        <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.cardTitle, { color: textSecondary }]}>SAFETY STATUS</Text>

          <View style={styles.statusRow}>
            <Ionicons name="shield-checkmark" size={18} color={success} />
            <Text style={[styles.statusLabel, { color: text }]}>Crash detection</Text>
            <Text style={[styles.statusValue, { color: success }]}>Active</Text>
          </View>

          <View style={styles.statusRow}>
            <Ionicons
              name={data && data.contactCount > 0 ? 'people' : 'people-outline'}
              size={18}
              color={data && data.contactCount > 0 ? success : warning}
            />
            <Text style={[styles.statusLabel, { color: text }]}>Emergency contacts</Text>
            <Text style={[
              styles.statusValue,
              { color: data && data.contactCount > 0 ? success : warning }
            ]}>
              {data ? `${data.contactCount} set` : '—'}
            </Text>
          </View>
        </View>

        {/* Start Ride Button */}
        <TouchableOpacity
          style={[styles.startButton, { backgroundColor: actionBg }]}
          onPress={() => router.navigate('/(rider)/camera')}
          activeOpacity={0.85}
        >
          <Ionicons name="bicycle" size={22} color={actionText} style={{ marginRight: 8 }} />
          <Text style={[styles.startButtonText, { color: actionText }]}>Start Ride</Text>
        </TouchableOpacity>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: backgroundElement, borderColor: border }]}>
            <Text style={[styles.statValue, { color: text }]}>
              {data?.totalTrips ?? '—'}
            </Text>
            <Text style={[styles.statLabel, { color: textSecondary }]}>Total Trips</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: backgroundElement, borderColor: border }]}>
            <Text style={[styles.statValue, { color: text }]}>
              {data?.totalDetections ?? '—'}
            </Text>
            <Text style={[styles.statLabel, { color: textSecondary }]}>Total Detections</Text>
          </View>
        </View>

        {/* Last Trip Card */}
        {data?.lastTrip && (
          <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
            <View style={styles.lastTripHeader}>
              <Text style={[styles.cardTitle, { color: textSecondary }]}>LAST TRIP</Text>
              <Text style={[styles.tripMeta, { color: textSecondary }]}>
                {formatTripDate(data.lastTrip.started_at)}
                {data.lastTrip.ended_at ? ` • ${formatDuration(data.lastTrip)}` : ''}
              </Text>
            </View>

            {data.recentDetections.length > 0 && (
              <View style={styles.detectionPills}>
                {data.recentDetections.map((d, i) => (
                  <View
                    key={i}
                    style={[
                      styles.pill,
                      { backgroundColor: (HAZARD_COLORS[d.type] ?? Colors.light.primary) + '22' },
                    ]}
                  >
                    <View
                      style={[
                        styles.pillDot,
                        { backgroundColor: HAZARD_COLORS[d.type] ?? Colors.light.primary },
                      ]}
                    />
                    <Text style={[styles.pillText, { color: HAZARD_COLORS[d.type] ?? text }]}>
                      {d.type}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {data.recentDetections.length === 0 && (
              <Text style={[styles.noDetections, { color: textSecondary }]}>
                No detections logged
              </Text>
            )}

            <TouchableOpacity
              onPress={() => router.navigate('/(rider)/trip-history')}
              style={styles.viewHistoryRow}
            >
              <Text style={[styles.viewHistoryText, { color: primary }]}>
                View Trip History
              </Text>
              <Ionicons name="chevron-forward" size={16} color={primary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Empty state when no trips */}
        {data && !data.lastTrip && (
          <View style={[styles.emptyCard, { backgroundColor: backgroundElement, borderColor: border }]}>
            <Ionicons name="bicycle-outline" size={40} color={textSecondary} />
            <Text style={[styles.emptyTitle, { color: text }]}>No rides yet</Text>
            <Text style={[styles.emptySubtitle, { color: textSecondary }]}>
              Tap Start Ride above to begin your first trip
            </Text>
          </View>
        )}

        {/* Bottom padding for floating tab bar */}
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

