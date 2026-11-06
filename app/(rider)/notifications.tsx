import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useThemeColor } from '@/hooks/use-theme-color';
import { Fonts } from '@/constants/theme';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_SCREENS,
  dayLabel,
  fetchNotifications,
  groupNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  timeLabel,
  type NotificationGroup,
} from '@/lib/notifications';
import type { RiderNotification, RiderNotificationCategory } from '@/types';
import { styles } from '@/styles/notifications.style';

const POLL_MS = 30_000;

const CATEGORY_STYLE: Record<RiderNotificationCategory, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  my_sos: { color: '#EF4444', icon: 'medkit-outline' },
  my_reports: { color: '#F59E0B', icon: 'camera-outline' },
  my_hazards: { color: '#22C55E', icon: 'construct-outline' },
  account: { color: '#0274DF', icon: 'person-circle-outline' },
};

/**
 * The rider's notifications: SOS progress, their "no longer there" reports,
 * hazards they detected that were fixed, and account changes. Grouped by day
 * and by what they are about.
 */
export default function NotificationsScreen() {
  const background = useThemeColor({}, 'background');
  const card = useThemeColor({}, 'card');
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const primary = useThemeColor({}, 'primary');
  const border = useThemeColor({}, 'border');

  const [category, setCategory] = useState<RiderNotificationCategory | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [items, setItems] = useState<RiderNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pageRef = useRef(1);

  const loadFirstPage = useCallback(async (quiet = false) => {
    try {
      const res = await fetchNotifications(1, category, unreadOnly);
      setItems(res.notifications);
      setUnread(res.unread);
      setPage(1);
      pageRef.current = 1;
      setLastPage(res.last_page);
    } catch {
      if (!quiet) Toast.show({ type: 'error', text1: 'Could not load notifications. Check your connection.' });
    }
  }, [category, unreadOnly]);

  useEffect(() => {
    setLoading(true);
    loadFirstPage().finally(() => setLoading(false));
  }, [loadFirstPage]);

  // Every 30 s while this screen is open and the app is in front (only while
  // the rider is still on the first page, so scrolling back never jumps).
  useFocusEffect(
    useCallback(() => {
      const timer = setInterval(() => {
        if (AppState.currentState === 'active' && pageRef.current === 1) loadFirstPage(true);
      }, POLL_MS);
      return () => clearInterval(timer);
    }, [loadFirstPage]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadFirstPage();
    setRefreshing(false);
  };

  const onEndReached = async () => {
    if (loadingMore || page >= lastPage) return;
    setLoadingMore(true);
    try {
      const res = await fetchNotifications(page + 1, category, unreadOnly);
      setItems((prev) => [...prev, ...res.notifications.filter((n) => !prev.some((p) => p.id === n.id))]);
      setPage(res.current_page);
      pageRef.current = res.current_page;
      setLastPage(res.last_page);
    } catch {
      // Keep what is shown; the next scroll retries.
    } finally {
      setLoadingMore(false);
    }
  };

  const markReadLocally = (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    setUnread((prev) => Math.max(0, prev - 1));
  };

  const openItem = (n: RiderNotification) => {
    if (n.read_at === null) {
      markReadLocally(n.id);
      markNotificationRead(n.id).catch(() => undefined);
    }
    if (n.link && NOTIFICATION_SCREENS[n.link]) {
      router.push(NOTIFICATION_SCREENS[n.link]);
    }
  };

  const readAll = async () => {
    if (unread === 0) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    setUnread(0);
    try {
      await markAllNotificationsRead();
    } catch {
      Toast.show({ type: 'error', text1: 'Could not mark them as read. Try again.' });
      loadFirstPage(true);
    }
  };

  const groups = useMemo(() => groupNotifications(items), [items]);

  const chip = (label: string, selected: boolean, onPress: () => void) => (
    <TouchableOpacity
      key={label}
      style={[styles.chip, { borderColor: primary, backgroundColor: selected ? primary : 'transparent' }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.chipText, { color: selected ? '#fff' : primary }]}>{label}</Text>
    </TouchableOpacity>
  );

  const header = (
    <View style={{ gap: 4 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {chip('All', category === null, () => setCategory(null))}
        {NOTIFICATION_CATEGORIES.map((c) => chip(c.label, category === c.value, () => setCategory(c.value)))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {chip('Any', !unreadOnly, () => setUnreadOnly(false))}
        {chip(`Unread${unread > 0 ? ` · ${unread}` : ''}`, unreadOnly, () => setUnreadOnly(true))}
      </ScrollView>
    </View>
  );

  const renderGroup = ({ item: group, index }: { item: NotificationGroup; index: number }) => {
    const latest = group.items[0];
    const style = CATEGORY_STYLE[latest.category] ?? CATEGORY_STYLE.account;
    const showDay = index === 0 || groups[index - 1].day !== group.day;

    return (
      <View style={{ gap: 8 }}>
        {showDay && <Text style={[styles.dayTitle, { color: textSecondary }]}>{dayLabel(latest.created_at).toUpperCase()}</Text>}
        <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
          <View style={[styles.cardIcon, { backgroundColor: `${style.color}22` }]}>
            <Ionicons name={style.icon} size={18} color={style.color} />
          </View>
          <View style={styles.cardBody}>
            {group.items.length > 1 && (
              <Text style={[styles.updates, { color: textSecondary }]}>{group.items.length} updates</Text>
            )}
            {group.items.map((n, i) => {
              const isUnread = n.read_at === null;
              const opens = n.link !== null;
              return (
                <TouchableOpacity
                  key={n.id}
                  style={[styles.item, i > 0 && [styles.itemDivider, { borderTopColor: border }]]}
                  onPress={() => openItem(n)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${isUnread ? 'Unread. ' : ''}${n.title}. ${n.body}`}
                  accessibilityHint={opens ? 'Opens the related screen' : 'Marks it as read'}
                >
                  <View style={[styles.dot, { backgroundColor: isUnread ? primary : 'transparent' }]} />
                  <View style={styles.itemBody}>
                    <Text style={[styles.itemTitle, { color: text, fontFamily: isUnread ? Fonts.bold : Fonts.medium }]}>
                      {n.title}
                    </Text>
                    <Text style={[styles.itemText, { color: textSecondary }]}>{n.body}</Text>
                    <Text style={[styles.itemTime, { color: textSecondary }]}>{timeLabel(n.created_at)}</Text>
                  </View>
                  {opens && <Ionicons name="chevron-forward" size={16} color={textSecondary} />}
                </TouchableOpacity>
              );
            })}
          </View>
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
        <Text style={[styles.headerTitle, { color: text }]}>Notifications</Text>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={readAll}
          disabled={unread === 0}
          accessibilityLabel="Mark all as read"
        >
          <Text style={[styles.readAll, { color: unread === 0 ? textSecondary : primary }]}>Read all</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={primary} />
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.key}
          renderItem={renderGroup}
          ListHeaderComponent={header}
          contentContainerStyle={styles.listContent}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} />}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={primary} /> : null}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={40} color={textSecondary} />
              <Text style={[styles.emptyText, { color: textSecondary }]}>
                {category || unreadOnly
                  ? 'Nothing here for this filter.'
                  : 'No notifications yet. SOS updates, your hazard reports and account changes show here.'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
