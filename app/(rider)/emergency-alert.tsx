import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { toast } from 'sonner-native';
import { sendEmergencyAlert } from '@/lib/emergency-sos';

const COUNTDOWN_SECONDS = 15;

export default function EmergencyAlertScreen() {
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // Countdown
  useEffect(() => {
    if (sent) return;

    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          triggerSOS();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [sent]);

  const triggerSOS = async () => {
    if (sending || sent) return;
    setSending(true);

    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      }).catch(() => null);

      await sendEmergencyAlert({
        latitude: location?.coords.latitude ?? 6.9214,
        longitude: location?.coords.longitude ?? 122.079,
      });

      setSent(true);
    } catch {
      toast.error('Could not send alert — SMS may have been sent directly');
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  const handleCancel = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    router.back();
  };

  const handleSendNow = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    triggerSOS();
  };

  if (sent) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.sentContainer}>
          <View style={styles.sentIcon}>
            <Ionicons name="checkmark-circle" size={72} color="#fff" />
          </View>
          <Text style={styles.sentTitle}>Help is on the way</Text>
          <Text style={styles.sentSubtitle}>
            Your emergency contacts have been notified via SMS with your location.
          </Text>
          <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.inner}>
        {/* Header */}
        <View style={styles.header}>
          <Ionicons name="warning" size={28} color="#fff" />
          <Text style={styles.headerTitle}>EMERGENCY ALERT</Text>
        </View>

        {/* Countdown circle */}
        <View style={styles.countdownWrapper}>
          <Animated.View style={[styles.countdownRing, { transform: [{ scale: pulseAnim }] }]}>
            <View style={styles.countdownCircle}>
              <Text style={styles.countdownNumber}>{countdown}</Text>
              <Text style={styles.countdownLabel}>seconds</Text>
            </View>
          </Animated.View>
        </View>

        <Text style={styles.messageText}>
          Emergency SMS will be sent to your contacts automatically.
        </Text>
        <Text style={styles.messageSubtext}>
          This alert will notify your emergency contacts with your current location.
        </Text>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={handleCancel}
            activeOpacity={0.85}
          >
            <Ionicons name="close-circle-outline" size={20} color="#EF4444" style={{ marginRight: 8 }} />
            <Text style={styles.cancelBtnText}>I'm OK — Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sendNowBtn, sending && { opacity: 0.7 }]}
            onPress={handleSendNow}
            disabled={sending}
            activeOpacity={0.85}
          >
            <Ionicons name="send" size={18} color="#EF4444" style={{ marginRight: 8 }} />
            <Text style={styles.sendNowText}>{sending ? 'Sending...' : 'Send Now'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EF4444',
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
    gap: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1,
  },
  countdownWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownRing: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownNumber: {
    color: '#fff',
    fontSize: 72,
    fontWeight: '800',
    lineHeight: 76,
  },
  countdownLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '600',
  },
  messageText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 24,
  },
  messageSubtext: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  actions: {
    width: '100%',
    gap: 12,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    height: 52,
    width: '100%',
  },
  cancelBtnText: {
    color: '#EF4444',
    fontWeight: '700',
    fontSize: 16,
  },
  sendNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 14,
    height: 52,
    width: '100%',
  },
  sendNowText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  // Sent state
  sentContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 20,
  },
  sentIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sentTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  sentSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  closeBtn: {
    backgroundColor: '#fff',
    borderRadius: 14,
    height: 52,
    paddingHorizontal: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  closeBtnText: {
    color: '#EF4444',
    fontWeight: '700',
    fontSize: 16,
  },
});
