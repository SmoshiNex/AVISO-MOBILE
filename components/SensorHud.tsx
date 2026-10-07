import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIotTelemetry } from '@/contexts/iot-context';
import {
  CRASH_ANGULAR_THRESHOLD,
  CRASH_G_THRESHOLD,
  IOT_FALL_TILT_DEG,
  IOT_IMPACT_G,
  IOT_IMPACT_GYRO_DPS,
} from '@/constants/detections';
import { IOT_RIDE_STATES, PHONE_RIDE_STATES } from '@/constants/ride-states';
import type { RideState } from '@/lib/ride-state-classifier';
import { RideStateLegend } from '@/components/RideStateLegend';
import { styles } from '@/styles/camera.style';

type SensorHudProps = {
  /** Phone readings (fallback when the IoT unit is not connected). */
  phoneG: number;
  phoneGyro: number;
  phoneState: RideState;
};

const OK = '#22C55E';
const ALERT = '#EF4444';

/**
 * G-Force / Gyro panel on the camera screen. Shows the IoT unit's readings
 * (measured on the motorcycle) when connected, the phone's otherwise.
 * Lives in its own component so 10 updates/s only re-render this panel.
 */
export function SensorHud({ phoneG, phoneGyro, phoneState }: SensorHudProps) {
  const iot = useIotTelemetry();
  const state = iot ? IOT_RIDE_STATES[iot.st] : PHONE_RIDE_STATES[phoneState];
  const [showLegend, setShowLegend] = useState(false);

  return (
    <View style={styles.sensorHud}>
      <TouchableOpacity
        style={[styles.stateBadge, { backgroundColor: state.color }]}
        onPress={() => setShowLegend(true)}
        accessibilityLabel={`${state.label}. Show what each riding state means`}
      >
        <Text style={styles.stateBadgeText}>{state.label}</Text>
        <Ionicons name="information-circle-outline" size={14} color="#fff" />
      </TouchableOpacity>

      <Text style={[styles.sensorLabel, { marginTop: 6 }]}>
        Source: {iot ? 'IoT unit' : 'Phone (backup)'}
      </Text>

      <Text style={[styles.sensorLabel, { marginTop: 6 }]}>G-Force</Text>
      {iot ? (
        <Text style={[styles.sensorValue, { color: iot.g >= IOT_IMPACT_G ? ALERT : OK }]}>
          {iot.g.toFixed(2)} g
        </Text>
      ) : (
        <Text style={[styles.sensorValue, { color: phoneG >= CRASH_G_THRESHOLD ? ALERT : OK }]}>
          {phoneG} g
        </Text>
      )}

      <Text style={[styles.sensorLabel, { marginTop: 6 }]}>Gyro</Text>
      {iot ? (
        <Text style={[styles.sensorValue, { color: iot.gy >= IOT_IMPACT_GYRO_DPS ? ALERT : OK }]}>
          {Math.round(iot.gy)} °/s
        </Text>
      ) : (
        <Text style={[styles.sensorValue, { color: phoneGyro >= CRASH_ANGULAR_THRESHOLD ? ALERT : OK }]}>
          {phoneGyro} rad/s
        </Text>
      )}

      {iot && (
        <>
          <Text style={[styles.sensorLabel, { marginTop: 6 }]}>Lean</Text>
          <Text style={[styles.sensorValue, { color: iot.tilt >= IOT_FALL_TILT_DEG ? ALERT : OK }]}>
            {Math.round(iot.tilt)}°
          </Text>
        </>
      )}

      <RideStateLegend
        visible={showLegend}
        source={iot ? 'iot' : 'phone'}
        onClose={() => setShowLegend(false)}
      />
    </View>
  );
}
