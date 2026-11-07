import { StyleSheet, Text, View } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { HAZARD_COLORS } from '@/constants/hazards';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import type { BarangayHazardCount, CityOverview } from '@/types';

const SEGMENTS = [
  { key: 'potholes', label: 'Potholes', color: HAZARD_COLORS['Pothole'] },
  { key: 'roadBarriers', label: 'Barriers', color: HAZARD_COLORS['Road Barrier'] },
  { key: 'roadExcavation', label: 'Excavation', color: HAZARD_COLORS['Road Excavation'] },
] as const;

type CityOverviewCardProps = {
  overview: CityOverview | null;
};

/** City-wide hazard numbers and the top barangays, same as the admin dashboard. */
export function CityOverviewCard({ overview }: CityOverviewCardProps) {
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const backgroundElement = useThemeColor({}, 'backgroundElement');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const danger = HAZARD_COLORS['Pothole'];

  const barangays = overview?.top_barangays ?? [];
  const maxTotal = barangays.reduce((max, b) => (b.total > max ? b.total : max), 0);

  return (
    <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
      <Text style={[styles.title, { color: textSecondary }]}>CITY OVERVIEW</Text>

      <View style={styles.statsRow}>
        <View style={[styles.stat, { backgroundColor: backgroundElement, borderColor: border }]}>
          <Text style={[styles.statValue, { color: danger }]}>
            {overview ? overview.active_hazards.toLocaleString() : '—'}
          </Text>
          <Text style={[styles.statLabel, { color: textSecondary }]}>Active hazards</Text>
        </View>
        <View style={[styles.stat, { backgroundColor: backgroundElement, borderColor: border }]}>
          <Text style={[styles.statValue, { color: text }]}>
            {overview ? overview.today_detections.toLocaleString() : '—'}
          </Text>
          <Text style={[styles.statLabel, { color: textSecondary }]}>Detected today</Text>
        </View>
      </View>

      <Text style={[styles.subtitle, { color: text }]}>Hazard-prone barangays</Text>

      {overview && barangays.length === 0 && (
        <Text style={[styles.empty, { color: textSecondary }]}>No road hazards recorded yet.</Text>
      )}
      {!overview && (
        <Text style={[styles.empty, { color: textSecondary }]}>Connect to the internet to load.</Text>
      )}

      {barangays.map((b, i) => (
        <BarangayRow key={b.area} rank={i + 1} barangay={b} maxTotal={maxTotal} />
      ))}

      {barangays.length > 0 && (
        <View style={styles.legend}>
          {SEGMENTS.map((s) => (
            <View key={s.key} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: s.color }]} />
              <Text style={[styles.legendText, { color: textSecondary }]}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

type BarangayRowProps = { rank: number; barangay: BarangayHazardCount; maxTotal: number };

function BarangayRow({ rank, barangay, maxTotal }: BarangayRowProps) {
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const track = useThemeColor({}, 'backgroundElement');
  const width = maxTotal > 0 ? (barangay.total / maxTotal) * 100 : 0;

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${rank}. ${barangay.area}: ${barangay.total} hazards, ${barangay.potholes} potholes, ${barangay.roadBarriers} barriers, ${barangay.roadExcavation} excavations`}
    >
      <View style={styles.rowHeader}>
        <Text style={[styles.rank, { color: textSecondary }]}>{rank}</Text>
        <Text style={[styles.area, { color: text }]} numberOfLines={1}>{barangay.area}</Text>
        <Text style={[styles.total, { color: textSecondary }]}>{barangay.total}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: track }]}>
        <View style={[styles.bar, { width: `${width}%` }]}>
          {SEGMENTS.map((s) => (
            <View
              key={s.key}
              style={{
                width: `${barangay.total > 0 ? (barangay[s.key] / barangay.total) * 100 : 0}%`,
                backgroundColor: s.color,
              }}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  title: { fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 0.8, marginBottom: Spacing.sm },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  stat: { flex: 1, borderRadius: Radius.md, borderWidth: 1, padding: Spacing.sm, alignItems: 'center' },
  statValue: { fontSize: 24, fontFamily: Fonts.monoBold },
  statLabel: { fontSize: 12, fontFamily: Fonts.medium },
  subtitle: { fontSize: 14, fontFamily: Fonts.semibold, marginBottom: Spacing.sm },
  empty: { fontSize: 13, fontFamily: Fonts.regular },
  row: { marginBottom: 10 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  rank: { width: 18, fontSize: 12, fontFamily: Fonts.semibold, textAlign: 'center' },
  area: { flex: 1, fontSize: 13, fontFamily: Fonts.medium },
  total: { fontSize: 12, fontFamily: Fonts.monoBold },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  bar: { flexDirection: 'row', height: '100%' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, fontFamily: Fonts.regular },
});
