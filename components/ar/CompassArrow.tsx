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
};

const ARROW_SIZE = 120;
const RING_SIZE = 190;
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
export function CompassArrow({ angle, visibility, angleRef, compassRef }: CompassArrowProps) {
  const bob = useSharedValue(0);
  const ring = useSharedValue(0.5);
  const [status, setStatus] = useState({ text: 'ON COURSE', bearing: '', source: '' });

  useEffect(() => {
    bob.value = withRepeat(withSequence(withTiming(-10, { duration: 900 }), withTiming(0, { duration: 900 })), -1);
    ring.value = withRepeat(withSequence(withTiming(0.9, { duration: 1100 }), withTiming(0.5, { duration: 1100 })), -1);
  }, [bob, ring]);

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
    <Animated.View pointerEvents="none" style={[styles.anchor, containerStyle]}>
      {/* Ground ring + shadow, lying on the road */}
      <View style={styles.ground}>
        <Animated.View style={ringStyle}>
          <Svg width={RING_SIZE} height={RING_SIZE}>
            <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_SIZE / 2 - 6} stroke={RING} strokeWidth={4} fill="rgba(34,211,238,0.12)" />
            <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_SIZE / 2 - 30} stroke={RING} strokeWidth={2} strokeDasharray="8 8" fill="none" />
          </Svg>
        </Animated.View>
      </View>

      {/* Floating arrow, same ground plane, bobbing above the ring */}
      <Animated.View style={[styles.arrowLayer, floatStyle]}>
        <View style={styles.ground}>
          <Animated.View style={turnStyle}>
            <Svg width={ARROW_SIZE} height={ARROW_SIZE * 1.15} viewBox="0 0 120 138">
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

      <View style={styles.chips}>
        <View style={styles.chip}>
          <Text style={styles.chipText}>{status.text}</Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipText}>{status.source}</Text>
        </View>
        {status.bearing !== '' && (
          <View style={styles.chip}>
            <Text style={styles.chipText}>{status.bearing} BRG</Text>
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
    top: '42%',
    alignItems: 'center',
  },
  ground: {
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ perspective: 700 }, { rotateX: GROUND_TILT }],
  },
  arrowLayer: {
    position: 'absolute',
    top: (RING_SIZE - ARROW_SIZE * 1.15) / 2 - 24,
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
    marginTop: -40,
  },
  chip: {
    backgroundColor: 'rgba(15,23,42,0.8)',
    borderColor: 'rgba(34,211,238,0.6)',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    color: '#ECFEFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
