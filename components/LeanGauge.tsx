import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { IOT_FALL_TILT_DEG } from '@/constants/detections';
import { Fonts } from '@/constants/theme';

type LeanGaugeProps = {
  /** Lean from the saved upright, degrees (direction-less). */
  tiltDeg: number;
  textColor: string;
  trackColor: string;
  size?: number;
};

const MAX_DEG = 90;
const SAFE_DEG = 30; // matches the unit's UPRIGHT_TILT_DEG

/** Point on the gauge arc: 0° at the top, MAX_DEG at the right end. */
function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg / MAX_DEG) * 90 - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arc(cx: number, cy: number, r: number, fromDeg: number, toDeg: number) {
  const a = polar(cx, cy, r, fromDeg);
  const b = polar(cx, cy, r, toDeg);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 0 1 ${b.x} ${b.y}`;
}

/**
 * Quarter-circle gauge of the motorcycle's lean as measured by the IoT unit:
 * upright at the top, lying flat at the right. Green = riding lean, amber =
 * unusual, red = fallen (the unit's crash threshold).
 */
export function LeanGauge({ tiltDeg, textColor, trackColor, size = 150 }: LeanGaugeProps) {
  // Pivot near the bottom-left so the quarter arc fills the square.
  const r = size * 0.66;
  const cx = size * 0.14;
  const cy = size * 0.84;
  const tilt = Math.max(0, Math.min(MAX_DEG, tiltDeg));
  const color = tilt >= IOT_FALL_TILT_DEG ? '#EF4444' : tilt >= SAFE_DEG ? '#F59E0B' : '#22C55E';
  const needle = polar(cx, cy, r, tilt);

  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size}>
        <Path d={arc(cx, cy, r, 0, MAX_DEG)} stroke={trackColor} strokeWidth={10} fill="none" strokeLinecap="round" />
        {tilt > 0.5 && (
          <Path d={arc(cx, cy, r, 0, tilt)} stroke={color} strokeWidth={10} fill="none" strokeLinecap="round" />
        )}
        <Line x1={cx} y1={cy} x2={needle.x} y2={needle.y} stroke={color} strokeWidth={4} strokeLinecap="round" />
        <Circle cx={cx} cy={cy} r={6} fill={color} />
      </Svg>
      <Text style={[styles.value, { color }]}>{Math.round(tilt)}°</Text>
      <Text style={[styles.caption, { color: textColor }]}>lean from upright</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  value: { fontSize: 22, fontFamily: Fonts.bold, marginTop: -8 },
  caption: { fontSize: 11, fontFamily: Fonts.regular },
});
