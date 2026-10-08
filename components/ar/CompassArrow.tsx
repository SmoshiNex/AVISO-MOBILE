import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Polygon } from 'react-native-svg';
import { iotTelemetryStore } from '@/lib/iot-client';

type CompassArrowProps = {
  /** Locked direction relative to the camera, degrees (+ = right). */
  angle: SharedValue<number>;
  /** 0 hidden … 1 shown. */
  visibility: SharedValue<number>;
  angleRef: React.MutableRefObject<number>;
  compassRef: React.MutableRefObject<number | null>;
  /**
   * Small version that sits in the empty band under the video instead of over the road.
   * Used for the USB webcam, whose video is only a strip in the middle of the screen.
   */
  compact?: boolean;
};

const FULL = { arrow: 120, ring: 190, bob: -10, chipFont: 12, chipPadH: 12, chipPadV: 6, chipsGap: -40 };
const COMPACT = { arrow: 56, ring: 92, bob: -5, chipFont: 10, chipPadH: 8, chipPadV: 3, chipsGap: -22 };
/** Bottom edge of the compact arrow: just above the Ride Live bar (sessionBar bottom 100 + its height). */
const COMPACT_BOTTOM = 156;
const GROUND_TILT = '58deg';
const ON_COURSE_DEG = 10;
const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// AVISO colours: lit face, shaded face, side (thickness), ring.
const FACE_LIGHT = '#67E8F9';
const FACE_DARK = '#0891B2';
const FACE_SIDE = '#155E75';
const RING = '#22D3EE';

/**
 * Pokémon-GO-style AR direction arrow: a folded, pseudo-3D arrow floating
 * over a glowing ring that lies on the road, turning like a compass needle.
 * Plain views + SVG with a perspective tilt (no 3D engine), so it always
 * draws over the camera video and leaves the GPU to the detection model.
 */
export function CompassArrow({ angle, visibility, angleRef, compassRef, compact = false }: CompassArrowProps) {
  const size = compact ? COMPACT : FULL;
  const bob = useSharedValue(0);
  const ring = useSharedValue(0.5);
  const [status, setStatus] = useState({ text: 'ON COURSE', bearing: '', source: '' });

  useEffect(() => {
    bob.value = withRepeat(withSequence(withTiming(size.bob, { duration: 900 }), withTiming(0, { duration: 900 })), -1);
    ring.value = withRepeat(withSequence(withTiming(0.9, { duration: 1100 }), withTiming(0.5, { duration: 1100 })), -1);
  }, [bob, ring, size.bob]);

  // Text chips: 2 updates per second is plenty and keeps React work tiny.
  useEffect(() => {
    const id = setInterval(() => {
      const a = Math.round(angleRef.current);
      const text = Math.abs(a) < ON_COURSE_DEG ? 'ON COURSE' : `TURN ${a > 0 ? 'RIGHT' : 'LEFT'} ${Math.abs(a)}°`;
      let bearing = '';
      if (compassRef.current !== null) {
        const b = Math.round((compassRef.current + a + 360) % 360);
        bearing = `${b}° ${CARDINALS[Math.round(b / 45) % 8]}`;
      }
      // The webcam has no motion sensor: the arrow turns with whatever sensor
      // moves with it — the IoT box (bolted to the bike) or the phone.
      const source = iotTelemetryStore.getFresh() ? 'IoT BOX' : 'PHONE';
      setStatus((s) =>
        s.text === text && s.bearing === bearing && s.source === source ? s : { text, bearing, source },
      );
    }, 500);
    return () => clearInterval(id);
  }, [angleRef, compassRef]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: visibility.value }));
  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));
  const turnStyle = useAnimatedStyle(() => ({ transform: [{ rotateZ: `${angle.value}deg` }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: ring.value }));

  return (
    <Animated.View pointerEvents="none" style={[styles.anchor, compact ? styles.anchorCompact : styles.anchorFull, containerStyle]}>
      {/* Ground ring + shadow, lying on the road */}
      <View style={styles.ground}>
        <Animated.View style={ringStyle}>
          <Svg width={size.ring} height={size.ring} viewBox="0 0 190 190">
            <Circle cx={95} cy={95} r={89} stroke={RING} strokeWidth={4} fill="rgba(34,211,238,0.12)" />
            <Circle cx={95} cy={95} r={65} stroke={RING} strokeWidth={2} strokeDasharray="8 8" fill="none" />
          </Svg>
        </Animated.View>
      </View>

      {/* Floating arrow, same ground plane, bobbing above the ring */}
      <Animated.View style={[styles.arrowLayer, { top: (size.ring - size.arrow * 1.15) / 2 - size.ring / 8 }, floatStyle]}>
        <View style={styles.ground}>
          <Animated.View style={turnStyle}>
            <Svg width={size.arrow} height={size.arrow * 1.15} viewBox="0 0 120 138">
              {/* Side/thickness: the outline shifted toward the viewer */}
              <Polygon points="60,10 0,130 60,106 120,130" fill={FACE_SIDE} />
              {/* Folded top: lit left face, shaded right face, bright ridge */}
              <Polygon points="60,0 0,120 60,96" fill={FACE_LIGHT} />
              <Polygon points="60,0 120,120 60,96" fill={FACE_DARK} />
              <Polygon points="60,0 60,96 56,90" fill="#ECFEFF" opacity={0.8} />
              <Circle cx={60} cy={6} r={6} fill="#FFFFFF" />
            </Svg>
          </Animated.View>
        </View>
      </Animated.View>

      <View style={[styles.chips, { marginTop: size.chipsGap }]}>
        <View style={[styles.chip, { paddingHorizontal: size.chipPadH, paddingVertical: size.chipPadV }]}>
          <Text style={[styles.chipText, { fontSize: size.chipFont }]}>{status.text}</Text>
        </View>
        <View style={[styles.chip, { paddingHorizontal: size.chipPadH, paddingVertical: size.chipPadV }]}>
          <Text style={[styles.chipText, { fontSize: size.chipFont }]}>{status.source}</Text>
        </View>
        {status.bearing !== '' && (
          <View style={[styles.chip, { paddingHorizontal: size.chipPadH, paddingVertical: size.chipPadV }]}>
            <Text style={[styles.chipText, { fontSize: size.chipFont }]}>{status.bearing} BRG</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  anchorFull: { top: '42%' },
  anchorCompact: { bottom: COMPACT_BOTTOM },
  ground: {
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ perspective: 700 }, { rotateX: GROUND_TILT }],
  },
  arrowLayer: {
    position: 'absolute',
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    backgroundColor: 'rgba(15,23,42,0.8)',
    borderColor: 'rgba(34,211,238,0.6)',
    borderWidth: 1,
    borderRadius: 16,
  },
  chipText: {
    color: '#ECFEFF',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
