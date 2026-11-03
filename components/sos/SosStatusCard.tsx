import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { etaText, getLatestEmergencyAlert } from '@/lib/emergency-sos';
import type { EmergencyAlertStatus } from '@/types';

const POLL_MS = 10_000;
/** An alert older than this before the SOS was sent belongs to an earlier emergency. */
const SAME_SOS_WINDOW_MS = 2 * 60_000;

type SosStatusCardProps = {
  /** When this SOS was sent (ms), to ignore an older alert. */
  sentAt: number;
};

type Step = { icon: keyof typeof Ionicons.glyphMap; color: string; title: string; detail: string };

function describe(alert: EmergencyAlertStatus | null): Step {
  if (!alert || alert.status === 'pending') {
    return {
      icon: 'time-outline',
      color: '#F59E0B',
      title: 'SOS sent – waiting for admin',
      detail: 'The AVISO admin is contacting responders for you.',
    };
  }
  if (alert.status === 'resolved') {
    return {
      icon: 'checkmark-circle',
      color: '#16A34A',
      title: alert.outcome_label ? `Resolved – ${alert.outcome_label}` : 'Resolved',
      detail: alert.agency_label ? `Handled by ${alert.agency_label}.` : 'The admin closed this emergency.',
    };
  }
  if (alert.on_scene_at) {
    return {
      icon: 'medkit',
      color: '#16A34A',
      title: 'Responders have arrived',
      detail: alert.agency_label ? `${alert.agency_label} is at your location.` : 'Help is at your location.',
    };
  }
  const eta = etaText(alert.eta_minutes);
  return {
    icon: 'car',
    color: '#0274DF',
    title: 'Help is on the way',
    detail: [alert.agency_label, eta].filter(Boolean).join(', ') || 'Responders were dispatched.',
  };
}

/**
 * Live progress of the rider's SOS on the "sent" screen: waiting for admin →
 * help on the way (agency, ETA) → responders arrived → resolved. Checks the
 * server every 10 s while the screen is open; stops once resolved.
 */
export function SosStatusCard({ sentAt }: SosStatusCardProps) {
  const [alert, setAlert] = useState<EmergencyAlertStatus | null>(null);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let stopped = false;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const poll = async () => {
        let resolved = false;
        try {
          const latest = await getLatestEmergencyAlert();
          const triggered = latest?.triggered_at ? new Date(latest.triggered_at).getTime() : 0;
          const isThisSos = !!latest && triggered >= sentAt - SAME_SOS_WINDOW_MS;
          if (!stopped) setAlert(isThisSos ? latest : null);
          resolved = isThisSos && latest?.status === 'resolved';
        } catch {
          // Offline: keep the last known status and try again.
        } finally {
          if (!stopped) setLoaded(true);
        }
        if (!stopped && !resolved) timer = setTimeout(poll, POLL_MS);
      };

      poll();
      return () => {
        stopped = true;
        if (timer) clearTimeout(timer);
      };
    }, [sentAt]),
  );

  const step = describe(alert);

  return (
    <View style={styles.card} accessibilityRole="summary" accessibilityLiveRegion="polite">
      {loaded ? (
        <Ionicons name={step.icon} size={28} color={step.color} />
      ) : (
        <ActivityIndicator color={step.color} />
      )}
      <View style={styles.body}>
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.detail}>{step.detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    alignSelf: 'stretch',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '700', color: '#111827' },
  detail: { fontSize: 13, color: '#4B5563', lineHeight: 18 },
});
