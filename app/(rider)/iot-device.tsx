import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useIot, useIotTelemetry } from '@/contexts/iot-context';
import { LeanGauge } from '@/components/LeanGauge';
import { IOT_RIDE_STATES } from '@/constants/ride-states';
import type { IotEvent } from '@/types';
import { styles } from '@/styles/iot-device.style';

const EVENT_LABEL: Record<IotEvent['type'], string> = {
  normal: 'Normal riding',
  road_bump: 'Road bump',
  hard_braking: 'Hard braking',
  crash: 'Crash',
};

/** Reset reasons that point at a hardware problem worth telling the rider. */
const RESET_WARNINGS: Record<string, string> = {
  BROWNOUT: 'The unit restarted from a power dip. Check the buck converter, fuse and wiring.',
  WDT_TIMEOUT: 'The unit restarted after freezing. If this repeats, reflash the firmware.',
  PANIC: 'The unit restarted after a software error. If this repeats, reflash the firmware.',
};

function formatUptime(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatAgo(iso: string | null): string {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

/** Live readings — its own component so 10 updates/s only re-render this card. */
function LiveCard({ text, textSecondary, card, border }: { text: string; textSecondary: string; card: string; border: string }) {
  const t = useIotTelemetry();
  if (!t) return null;

  const metric = (label: string, value: string) => (
    <View style={styles.row} key={label}>
      <Text style={[styles.label, { color: textSecondary }]}>{label}</Text>
      <Text style={[styles.value, { color: text }]}>{value}</Text>
    </View>
  );

  return (
    <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
      <Text style={[styles.cardTitle, { color: text }]}>Live telemetry</Text>
      <View style={styles.liveRow}>
        <LeanGauge tiltDeg={t.tilt} textColor={textSecondary} trackColor={border} size={130} />
        <View style={styles.metrics}>
          {metric('State', IOT_RIDE_STATES[t.st].label)}
          {metric('G-force', `${t.g.toFixed(2)} g`)}
          {metric('  Vertical', `${t.vg.toFixed(2)} g`)}
          {metric('  Horizontal', `${t.hg.toFixed(2)} g`)}
          {metric('Gyro', `${Math.round(t.gy)} °/s`)}
          {metric('Turn rate', `${Math.round(Math.abs(t.yaw))} °/s`)}
        </View>
      </View>
    </View>
  );
}

export default function IotDeviceScreen() {
  const background = useThemeColor({}, 'background');
  const card = useThemeColor({}, 'card');
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const primary = useThemeColor({}, 'primary');
  const border = useThemeColor({}, 'border');
  const success = useThemeColor({}, 'success');
  const danger = useThemeColor({}, 'danger');
  const warning = useThemeColor({}, 'warning');

  const iot = useIot();
  const [pairing, setPairing] = useState<{ code: string; expiresAt: number } | null>(null);
  const [ipDraft, setIpDraft] = useState(iot.manualIp ?? '');
  const [now, setNow] = useState(Date.now());

  useEffect(() => setIpDraft(iot.manualIp ?? ''), [iot.manualIp]);

  // Ticks the pairing-code countdown.
  useEffect(() => {
    if (!pairing) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pairing]);

  const statusMeta = {
    connected: { label: 'Connected', color: success },
    connecting: { label: 'Connecting…', color: warning },
    disconnected: { label: 'Reconnecting…', color: warning },
    idle: { label: iot.device ? 'Offline' : 'Not paired', color: textSecondary },
  }[iot.status];

  const resetWarning = iot.hello ? RESET_WARNINGS[iot.hello.reset] : iot.device?.reset_reason ? RESET_WARNINGS[iot.device.reset_reason] : undefined;
  const secondsLeft = pairing ? Math.max(0, Math.round((pairing.expiresAt - now) / 1000)) : 0;

  const getPairingCode = async () => {
    try {
      const res = await iot.requestPairingCode();
      setPairing({ code: res.code, expiresAt: new Date(res.expires_at).getTime() });
      setNow(Date.now());
    } catch {
      Toast.show({ type: 'error', text1: 'Could not get a pairing code. Check your connection.' });
    }
  };

  const confirmCalibrate = () => {
    Alert.alert(
      'Calibrate upright',
      'Put the motorcycle upright on its center stand and keep it still for 2 seconds.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Calibrate',
          onPress: () => {
            if (!iot.calibrateUpright()) Toast.show({ type: 'error', text1: 'Unit not connected' });
          },
        },
      ],
    );
  };

  const confirmUnpair = () => {
    Alert.alert('Unpair unit', 'The unit will stop reporting to your account until you pair it again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unpair',
        style: 'destructive',
        onPress: () => iot.unpair().catch(() => Toast.show({ type: 'error', text1: 'Could not unpair' })),
      },
    ]);
  };

  const row = (label: string, value: string) => (
    <View style={styles.row}>
      <Text style={[styles.label, { color: textSecondary }]}>{label}</Text>
      <Text style={[styles.value, { color: text }]}>{value}</Text>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: background }]}>
      <View style={[styles.header, { borderBottomColor: border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: text }]}>IoT Device</Text>
        <View style={[styles.pill, { backgroundColor: statusMeta.color }]}>
          <View style={styles.pillDot} />
          <Text style={styles.pillText}>{statusMeta.label}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Unit */}
        <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.cardTitle, { color: text }]}>Crash-detection unit</Text>
          {iot.device ? (
            <>
              {row('Device', iot.device.device_uid)}
              {row('Address', iot.host ?? 'unknown')}
              {row('Firmware', iot.hello?.fw ?? iot.device.firmware_version ?? '—')}
              {row('Wi-Fi signal', `${iot.hello?.rssi ?? iot.device.rssi ?? '—'} dBm`)}
              {row('Uptime', formatUptime(iot.hello?.uptime ?? iot.device.uptime_seconds))}
              {row('Last seen by server', formatAgo(iot.device.last_seen_at))}
              {row('Last restart', iot.hello?.reset ?? iot.device.reset_reason ?? '—')}
            </>
          ) : (
            <Text style={[styles.label, { color: textSecondary }]}>
              No unit paired yet. Follow the setup steps below.
            </Text>
          )}
          {resetWarning && (
            <View style={styles.warning}>
              <Text style={styles.warningText}>{resetWarning}</Text>
            </View>
          )}
        </View>

        {/* Live */}
        <LiveCard text={text} textSecondary={textSecondary} card={card} border={border} />

        {/* Sensor health */}
        {iot.hello && (
          <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
            <Text style={[styles.cardTitle, { color: text }]}>Sensor health</Text>
            {row('Gyro calibration', `${iot.hello.cal.gyro}/3`)}
            {row('Accelerometer calibration', `${iot.hello.cal.accel}/3`)}
            {row('Saved sensor offsets', iot.hello.offsets_saved ? 'yes' : 'no')}
            {row('Upright position saved', iot.hello.upright_saved ? 'yes' : 'no — calibrate below')}
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: iot.connected ? primary : border }]}
            onPress={confirmCalibrate}
            disabled={!iot.connected}
          >
            <Ionicons name="locate-outline" size={16} color="#fff" />
            <Text style={styles.actionText}>Calibrate upright</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: iot.connected ? primary : border }]}
            onPress={() => iot.testBuzzer()}
            disabled={!iot.connected}
          >
            <Ionicons name="volume-high-outline" size={16} color="#fff" />
            <Text style={styles.actionText}>Test buzzer</Text>
          </TouchableOpacity>
        </View>

        {/* Recent events */}
        {iot.recentEvents.length > 0 && (
          <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
            <Text style={[styles.cardTitle, { color: text }]}>Recent events</Text>
            {iot.recentEvents.map((e) => (
              <View key={e.id} style={styles.eventRow}>
                <Ionicons
                  name={e.type === 'crash' ? 'warning' : e.type === 'road_bump' ? 'pulse-outline' : 'speedometer-outline'}
                  size={16}
                  color={e.type === 'crash' ? danger : primary}
                />
                <Text style={[styles.eventText, { color: text }]}>
                  {EVENT_LABEL[e.type]} · {e.peak_g.toFixed(2)} g
                </Text>
                <Text style={[styles.eventTime, { color: textSecondary }]}>
                  {new Date(e.receivedAt).toLocaleTimeString('en-PH')}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Pairing */}
        <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.cardTitle, { color: text }]}>Pairing</Text>
          {pairing && secondsLeft > 0 ? (
            <>
              <Text style={[styles.pairCode, { color: primary }]}>{pairing.code}</Text>
              <Text style={[styles.label, { color: textSecondary, textAlign: 'center' }]}>
                Type this on the unit&apos;s setup page · expires in {Math.floor(secondsLeft / 60)}:
                {String(secondsLeft % 60).padStart(2, '0')}
              </Text>
            </>
          ) : (
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: primary }]} onPress={getPairingCode}>
              <Ionicons name="key-outline" size={16} color="#fff" />
              <Text style={styles.actionText}>Get pairing code</Text>
            </TouchableOpacity>
          )}
          {iot.device && (
            <TouchableOpacity style={[styles.actionBtn, styles.outlineBtn, { borderColor: danger }]} onPress={confirmUnpair}>
              <Text style={[styles.actionText, { color: danger }]}>Unpair unit</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Manual address */}
        <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.cardTitle, { color: text }]}>Unit address (optional)</Text>
          <Text style={[styles.label, { color: textSecondary }]}>
            Normally found automatically. Set it only if the server is unreachable.
          </Text>
          <View style={styles.actions}>
            <TextInput
              style={[styles.input, { color: text, borderColor: border }]}
              value={ipDraft}
              onChangeText={setIpDraft}
              placeholder="e.g. 192.168.43.120"
              placeholderTextColor={textSecondary}
              keyboardType="decimal-pad"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: primary, flex: 0, paddingHorizontal: 16 }]}
              onPress={() => iot.setManualIp(ipDraft || null)}
            >
              <Text style={styles.actionText}>{ipDraft ? 'Save' : 'Clear'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Setup guide */}
        <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.cardTitle, { color: text }]}>Setup guide</Text>
          {[
            '1. Tap "Get pairing code" above.',
            '2. Power the unit. Connect your phone to the Wi-Fi "AVISO-SETUP-xxxx" (password aviso1234) and open http://192.168.4.1.',
            '3. Enter your phone hotspot name and password, the server address, and the pairing code.',
            '4. Turn on your phone hotspot. The unit joins it and beeps once when paired.',
            '5. Put the motorcycle on its center stand and tap "Calibrate upright".',
            'Every ride: turn on your hotspot before starting the ride.',
          ].map((step) => (
            <Text key={step} style={[styles.step, { color: textSecondary }]}>{step}</Text>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
