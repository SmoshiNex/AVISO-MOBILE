import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getHazardLogs } from '@/lib/local-db';
import { HAZARD_COLORS } from '@/constants/hazards';
import { Spacing, Radius } from '@/constants/theme';
import type { LocalHazardLog } from '@/types';

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

  const loadLogs = useCallback(async () => {
    const data = await getHazardLogs();
    setLogs(data);
  }, []);

  useEffect(() => {
    loadLogs().finally(() => setLoading(false));
  }, [loadLogs]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadLogs();
    setRefreshing(false);
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
          {item.area && (
            <Text style={[styles.rowArea, { color: textSecondary }]} numberOfLines={1}>
              {item.area}
            </Text>
          )}
        </View>
        <View style={styles.rowRight}>
          <Text style={[styles.confidence, { color }]}>
            {Math.round(item.confidence * 100)}%
          </Text>
          {item.distance !== undefined && (
            <Text style={[styles.distance, { color: textSecondary }]}>
              {item.distance}m
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
        <Text style={[styles.headerCount, { color: textSecondary }]}>{logs.length} total</Text>
      </View>

      <FlatList
        data={logs}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} />
        }
        ListEmptyComponent={
          <View style={[styles.empty, { backgroundColor: backgroundElement }]}>
            <Ionicons name="warning-outline" size={48} color={textSecondary} />
            <Text style={[styles.emptyTitle, { color: text }]}>No detections yet</Text>
            <Text style={[styles.emptySubtitle, { color: textSecondary }]}>
              Hazards detected during your rides will appear here
            </Text>
          </View>
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
                    label="Distance"
                    value={`${selected.distance} meters`}
                    textColor={text}
                    labelColor={textSecondary}
                  />
                )}
                {selected.area && (
                  <DetailRow
                    icon="map-outline"
                    label="Area"
                    value={selected.area}
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
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
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
  listContent: { padding: Spacing.md, paddingBottom: 100 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    gap: 12,
    minHeight: 44,
  },
  typeIndicator: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeDot: { width: 12, height: 12, borderRadius: 6 },
  rowContent: { flex: 1, gap: 2 },
  rowType: { fontSize: 14, fontWeight: '600' },
  rowMeta: { fontSize: 12 },
  rowArea: { fontSize: 12 },
  rowRight: { alignItems: 'flex-end', gap: 2 },
  confidence: { fontSize: 13, fontWeight: '700' },
  distance: { fontSize: 11 },
  empty: {
    borderRadius: Radius.xl,
    padding: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptySubtitle: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  closeBtn: { padding: 4, minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  detailGrid: { gap: 14 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailLabel: { fontSize: 13, width: 90 },
  detailValue: { fontSize: 13, fontWeight: '600', flex: 1 },
});
