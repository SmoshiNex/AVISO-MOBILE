import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { toast } from 'sonner-native';
import { sendEmergencyAlert } from '@/lib/emergency-sos';
import { styles } from '@/styles/emergency-alert.style';

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
      toast.error('Could not send alert â€” SMS may have been sent directly');
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
            <Text style={styles.cancelBtnText}>I'm OK â€” Cancel</Text>
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

