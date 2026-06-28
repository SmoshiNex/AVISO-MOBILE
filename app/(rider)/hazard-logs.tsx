import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import * as Network from 'expo-network';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getHazardLogs } from '@/lib/local-db';
import { pullFromBackend } from '@/lib/sync-service';
import { HAZARD_COLORS } from '@/constants/hazards';
import type { LocalHazardLog } from '@/types';
import { styles } from '@/styles/hazard-logs.style';

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

