import Mapbox from '@rnmapbox/maps';
import { StyleSheet, Text, View } from 'react-native';
import { HAZARD_COLORS } from '@/constants/hazards';
import { useThemeColor } from '@/hooks/use-theme-color';
import { bundledRiskSquares } from '@/lib/hazard-prediction';

/** Purple: predicted risk (not a detected hazard); hazard pins use red, orange and yellow. */
const RISK_FILL = '#8B5CF6';

type RiskAreasProps = { visible: boolean };

/**
 * "Risk areas" layer: the risk map's high-risk squares on the road (the same
 * squares that trigger "Possible hazard ahead"). Always mounted and hidden with
 * visibility so the layer keeps its place under the hazard pins.
 */
export function RiskAreas({ visible }: RiskAreasProps) {
  const squares = bundledRiskSquares();
  if (squares.features.length === 0) return null;

  return (
    <Mapbox.ShapeSource id="risk-areas-source" shape={squares}>
      <Mapbox.FillLayer
        id="risk-areas-fill"
        style={{
          visibility: visible ? 'visible' : 'none',
          fillColor: RISK_FILL,
          fillOpacity: 0.35,
          fillOutlineColor: RISK_FILL,
        }}
      />
    </Mapbox.ShapeSource>
  );
}

const DETECTED_COLORS = [HAZARD_COLORS['Pothole'], HAZARD_COLORS['Road Excavation'], HAZARD_COLORS['Road Barrier']];

type RiskAreasLegendProps = { bottom: number };

/** What the colors mean while Risk areas is on. */
export function RiskAreasLegend({ bottom }: RiskAreasLegendProps) {
  const card = useThemeColor({}, 'card');
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const border = useThemeColor({}, 'border');

  return (
    <View
      style={[styles.legend, { bottom, backgroundColor: card, borderColor: border }]}
      pointerEvents="none"
      accessibilityLabel="Map legend"
    >
      <View style={styles.row}>
        <View style={[styles.square, { backgroundColor: RISK_FILL }]} />
        <Text style={[styles.label, { color: text }]}>Possible hazard area (past records)</Text>
      </View>
      <View style={styles.row}>
        <View style={styles.dots}>
          {DETECTED_COLORS.map((color) => (
            <View key={color} style={[styles.dot, { backgroundColor: color }]} />
          ))}
        </View>
        <Text style={[styles.label, { color: text }]}>Detected hazard</Text>
      </View>
      <View style={styles.row}>
        <View style={[styles.square, styles.empty, { borderColor: textSecondary }]} />
        <Text style={[styles.label, { color: textSecondary }]}>No color: lower risk or not surveyed</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    position: 'absolute',
    left: 16,
    maxWidth: 260,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 5,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  square: {
    width: 22,
    height: 14,
    borderRadius: 3,
    opacity: 0.8,
  },
  empty: {
    borderWidth: 1,
    opacity: 1,
  },
  dots: {
    width: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 12,
  },
});
