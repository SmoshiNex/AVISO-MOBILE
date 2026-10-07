import { Modal, Text, TouchableOpacity, View } from 'react-native';
import {
  IOT_RIDE_STATES,
  IOT_STATE_ORDER,
  PHONE_RIDE_STATES,
  PHONE_STATE_ORDER,
  type RideStateInfo,
} from '@/constants/ride-states';
import { styles } from '@/styles/camera.style';

type RideStateLegendProps = {
  visible: boolean;
  /** Which sensor the badge is reading right now. */
  source: 'iot' | 'phone';
  onClose: () => void;
};

/** What each riding state means and what triggers it, for the sensor currently in use. */
export function RideStateLegend({ visible, source, onClose }: RideStateLegendProps) {
  const states: RideStateInfo[] =
    source === 'iot'
      ? IOT_STATE_ORDER.map((key) => IOT_RIDE_STATES[key])
      : PHONE_STATE_ORDER.map((key) => PHONE_RIDE_STATES[key]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.legendBackdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.legendCard}>
          <View>
            <Text style={styles.legendTitle}>Riding States</Text>
            <Text style={styles.legendSource}>
              {source === 'iot'
                ? 'Source: IoT unit on the motorcycle (gravity removed: 0 g at rest)'
                : 'Source: phone sensors, backup while the IoT unit is not connected (1 g at rest)'}
            </Text>
          </View>
          {states.map((state) => (
            <View key={state.label} style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: state.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.legendLabel}>{state.label}</Text>
                <Text style={styles.legendRange}>{state.trigger}</Text>
              </View>
            </View>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}
