import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { HAZARD_COLORS } from '@/constants/hazards';
import { knownHazardTitle, roundedDistance, type HazardAhead } from '@/lib/known-hazards';

type KnownHazardCardProps = {
  ahead: HazardAhead;
  /** Distance of the card's top edge from the top of the screen. */
  top: number;
  /** "known": a saved hazard (hazard color). "possible": a high-risk spot of the risk map (orange). */
  variant?: 'known' | 'possible';
};

/** Orange: a likely hazard, not a confirmed one. */
const POSSIBLE_COLOR = '#F59E0B';

/**
 * "Known pothole ahead – about 40 m": a hazard other riders already saved,
 * shown before the camera can see it. Fixed (not tied to the video), because
 * the hazard is usually still too far away to be in view.
 * With variant "possible": "Possible hazard ahead", a high-risk spot of the risk map.
 */
export function KnownHazardCard({ ahead, top, variant = 'known' }: KnownHazardCardProps) {
  const possible = variant === 'possible';
  const color = possible ? POSSIBLE_COLOR : (HAZARD_COLORS[ahead.hazard.type] ?? '#EF4444');
  const title = possible ? 'Possible hazard ahead' : knownHazardTitle(ahead);
  const meters = roundedDistance(ahead.distance);
  const source = possible ? 'high-risk area' : 'saved by riders';

  return (
    <Animated.View
      pointerEvents="none"
      entering={FadeInUp.duration(250)}
      exiting={FadeOut.duration(300)}
      style={[styles.card, { top, borderColor: color, shadowColor: color }]}
      accessibilityRole="alert"
      accessibilityLabel={`${title}, about ${meters} meters`}
    >
      <View style={[styles.icon, { backgroundColor: color }]}>
        <Ionicons name={possible ? 'alert-circle' : 'warning'} size={26} color="#FFFFFF" />
      </View>
      <View style={styles.textBlock}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          About {meters} m · {source}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: '50%',
    marginLeft: -140,
    width: 280,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(15, 23, 42, 0.86)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 10,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    flex: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    color: '#CBD5E1',
    fontSize: 12,
    marginTop: 2,
  },
});
