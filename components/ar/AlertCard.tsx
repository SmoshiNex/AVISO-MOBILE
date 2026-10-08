import { useEffect } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  FadeInUp,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Polygon } from 'react-native-svg';
import { HAZARD_COLORS } from '@/constants/hazards';
import type { Alert } from '@/lib/alert-gate';
import { DISTANCE_WORD_LABEL, distanceWord } from '@/lib/distance-estimator';
import type { DetectionResult } from '@/types';
import { SignIcon } from './SignIcon';

const CARD_WIDTH = 270;
const CARD_HEIGHT = 76;

type BBox = DetectionResult['bbox'];

type AlertCardProps = {
  alert: Alert;
  /** Distance of the card's top edge from the top of the screen (fixed card),
   *  and the highest a following card may go (below the HUD). */
  top: number;
  /** Signs/lights: the object's latest box, so the card follows it in the
   *  video; null = the object left the view (card stays, dimmed). */
  trackedBbox?: BBox | null;
};

const POINTER = 10;
const GAP = 6;
const FOLLOW_MS = 120;

const ACCENT: Record<Alert['kind'], string> = {
  road: '#EF4444',
  sign: '#FACC15',
  light: '#22D3EE',
};

/**
 * AR popup for one alert: slides in, pulses its icon, and is tied to the
 * detected object by a leader line. Tilted slightly toward the viewer for a
 * floating, pseudo-3D look without a 3D renderer. Unmounting it (after the
 * camera screen's timer) plays the fade-out.
 */
export function AlertCard({ alert, top, trackedBbox }: AlertCardProps) {
  if (alert.kind !== 'road' && trackedBbox !== undefined) {
    return <AnchoredAlertCard alert={alert} minTop={top} bbox={trackedBbox ?? alert.detection.bbox} lost={trackedBbox === null} />;
  }
  return <FixedAlertCard alert={alert} top={top} />;
}

function accentOf(alert: Alert): string {
  return alert.kind === 'light' ? HAZARD_COLORS[alert.detection.type] ?? ACCENT.light : ACCENT[alert.kind];
}

function usePulse() {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(1.12, { duration: 280 }), withTiming(1, { duration: 280 })),
      3,
    );
  }, [pulse]);
  return useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
}

type AnchoredProps = { alert: Alert; minTop: number; bbox: BBox; lost: boolean };

/**
 * Pokémon-GO-style popup: floats just above the detected sign/light and
 * glides with it as it moves and grows in the video (below it when the
 * object is near the top). Only transform/opacity animate, on the UI thread.
 */
function AnchoredAlertCard({ alert, minTop, bbox, lost }: AnchoredProps) {
  const { width, height } = useWindowDimensions();
  const iconStyle = usePulse();
  const accent = accentOf(alert);

  const centerX = (bbox.x + bbox.w / 2) * width;
  const boxTop = bbox.y * height;
  const boxBottom = (bbox.y + bbox.h) * height;
  const above = boxTop - CARD_HEIGHT - POINTER - GAP >= minTop;
  const cardTop = above
    ? boxTop - CARD_HEIGHT - POINTER - GAP
    : Math.min(height - CARD_HEIGHT - 12, boxBottom + POINTER + GAP);
  const cardLeft = Math.max(12, Math.min(width - CARD_WIDTH - 12, centerX - CARD_WIDTH / 2));
  // Pointer stays under the object even when the card is pushed to an edge.
  const pointerX = Math.max(20, Math.min(CARD_WIDTH - 20, centerX - cardLeft));
  // Bigger as the object grows (= closer), within reason.
  const scale = Math.max(0.85, Math.min(1.15, 0.85 + bbox.h * 1.2));

  const x = useSharedValue(cardLeft);
  const y = useSharedValue(cardTop);
  const s = useSharedValue(scale);
  const opacity = useSharedValue(1);

  useEffect(() => {
    x.value = withTiming(cardLeft, { duration: FOLLOW_MS });
    y.value = withTiming(cardTop, { duration: FOLLOW_MS });
    s.value = withTiming(scale, { duration: FOLLOW_MS });
  }, [cardLeft, cardTop, scale, x, y, s]);

  useEffect(() => {
    opacity.value = withTiming(lost ? 0.6 : 1, { duration: 200 });
  }, [lost, opacity]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: s.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      entering={FadeInUp.duration(ENTER_MS)}
      exiting={FadeOut.duration(300)}
    >
      <Animated.View style={[styles.anchored, cardStyle]}>
        {!above && (
          <Svg width={CARD_WIDTH} height={POINTER} style={styles.pointerTop}>
            <Polygon
              points={`${pointerX - POINTER},${POINTER} ${pointerX + POINTER},${POINTER} ${pointerX},0`}
              fill={accent}
            />
          </Svg>
        )}
        <View
          style={[
            styles.cardBody,
            { borderColor: accent, shadowColor: accent },
            alert.tier === 'possible' && styles.possible,
          ]}
        >
          <Animated.View style={iconStyle}>
            <SignIcon detection={alert.detection} size={52} />
          </Animated.View>
          <View style={styles.textBlock}>
            <Text style={styles.title} numberOfLines={2}>
              {alert.popup}
            </Text>
          </View>
        </View>
        {above && (
          <Svg width={CARD_WIDTH} height={POINTER}>
            <Polygon
              points={`${pointerX - POINTER},0 ${pointerX + POINTER},0 ${pointerX},${POINTER}`}
              fill={accent}
            />
          </Svg>
        )}
      </Animated.View>
    </Animated.View>
  );
}

/** Fixed card at the top, for road hazards (informational popup). */
function FixedAlertCard({ alert, top }: { alert: Alert; top: number }) {
  const { width, height } = useWindowDimensions();
  const iconStyle = usePulse();

  const { bbox } = alert.detection;
  const objectX = (bbox.x + bbox.w / 2) * width;
  const objectY = bbox.y * height;
  const cardLeft = Math.max(12, Math.min(width - CARD_WIDTH - 12, objectX - CARD_WIDTH / 2));
  const cardBottom = top + CARD_HEIGHT;
  const anchorX = Math.max(cardLeft + 24, Math.min(cardLeft + CARD_WIDTH - 24, objectX));
  const showLeader = objectY > cardBottom + 12;

  const accent = accentOf(alert);

  return (
    <Animated.View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      entering={FadeInUp.duration(ENTER_MS)}
      exiting={FadeOut.duration(300)}
    >
      {showLeader && (
        <Svg style={StyleSheet.absoluteFill}>
          <Line
            x1={anchorX}
            y1={cardBottom}
            x2={objectX}
            y2={objectY}
            stroke={accent}
            strokeWidth={2}
            strokeDasharray="6 4"
          />
          <Circle cx={objectX} cy={objectY} r={5} fill={accent} />
        </Svg>
      )}

      <View
        style={[
          styles.card,
          { top, left: cardLeft, borderColor: accent, shadowColor: accent },
          alert.tier === 'possible' && styles.possible,
        ]}
      >
        <Animated.View style={iconStyle}>
          <SignIcon detection={alert.detection} size={52} />
        </Animated.View>
        <View style={styles.textBlock}>
          <Text style={styles.title} numberOfLines={2}>
            {alert.popup}
          </Text>
          {alert.detection.distance !== undefined && (
            <Text style={styles.subtitle}>
              {DISTANCE_WORD_LABEL[distanceWord(alert.detection.distance)]}
            </Text>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

/** Quick fade-in: the warning should appear as soon as it's decided. */
const ENTER_MS = 160;

const styles = StyleSheet.create({
  // "Possible ..." warnings (weak but steady detections): dashed and dimmer, no voice.
  possible: {
    borderStyle: 'dashed',
    opacity: 0.85,
  },
  card: {
    position: 'absolute',
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 2,
    backgroundColor: 'rgba(15, 23, 42, 0.86)',
    // Slight backward tilt + glow: reads as floating in the scene.
    transform: [{ perspective: 600 }, { rotateX: '12deg' }],
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 10,
  },
  anchored: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: CARD_WIDTH,
  },
  pointerTop: {
    marginBottom: -1,
  },
  cardBody: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 2,
    backgroundColor: 'rgba(15, 23, 42, 0.86)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 10,
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
