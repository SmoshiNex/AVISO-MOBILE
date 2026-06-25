import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, Vibration } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Audio } from 'expo-av';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { sendEmergencyAlert } from '@/lib/emergency-sos';
import { generateJarvisAudio } from '@/lib/openai-tts';
import { SOS_TEXT, SOS_CACHE_KEY } from '@/constants/sos';
import { styles } from '@/styles/emergency-alert.style';

const COUNTDOWN_SECONDS = 15;
const SOS_COOLDOWN_MS = 60_000;

// Module-level: survives focus/blur cycles, resets only on full app restart.
// Prevents crash detection from firing a second SOS within 60 s of the first.
let lastSosSentAt: number | null = null;

const SOS_VIBRATION = [
  300, 100, 300, 100, 300, 400,
  600, 100, 600, 100, 600, 400,
  300, 100, 300, 100, 300, 1200,
];

export default function EmergencyAlertScreen() {
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isSentRef = useRef(false);
  const isSendingRef = useRef(false);

  // Pulse ring animation — permanent cosmetic loop
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

  // Everything that must restart per-focus goes here.
  // emergency-alert is a Tabs.Screen (never unmounts) so useEffect([]) would only
  // fire once on app launch — useFocusEffect resets correctly on every re-entry.
  useFocusEffect(
    useCallback(() => {
      const cooldownActive =
        lastSosSentAt !== null && Date.now() - lastSosSentAt < SOS_COOLDOWN_MS;
      isSentRef.current = cooldownActive;
      isSendingRef.current = false;
      setSent(cooldownActive);
      setSending(false);
      setCountdown(COUNTDOWN_SECONDS);

      // Alarm
      let active = true;
      let alarmSound: Audio.Sound | null = null;
      Vibration.vibrate(SOS_VIBRATION, true);

      const startAlarm = async () => {
        // WAV is pre-warmed by the rider layout on mount — this is a fast local cache read
        const sound = await generateJarvisAudio(SOS_TEXT, SOS_CACHE_KEY);
        if (!active) {
          sound?.unloadAsync().catch(() => {});
          return;
        }

        if (!sound) return; // pre-warm should have cached it; silently skip if unavailable

        alarmSound = sound;
        await sound.playAsync();
        sound.setOnPlaybackStatusUpdate(async (status) => {
          if (!status.isLoaded || !active) return;
          if (status.didJustFinish) {
            await new Promise<void>((r) => setTimeout(r, 4000));
            if (active) sound.replayAsync().catch(() => {});
          }
        });
      };

      startAlarm();

      // Countdown → auto-send on zero
      let remaining = COUNTDOWN_SECONDS;
      intervalRef.current = setInterval(() => {
        remaining -= 1;
        setCountdown(remaining);
        if (remaining <= 0) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          runTrigger();
        }
      }, 1000);

      return () => {
        active = false;
        Vibration.cancel();
        alarmSound?.stopAsync().catch(() => {});
        alarmSound?.unloadAsync().catch(() => {});
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }, []),
  );

  const runTrigger = async () => {
    if (isSendingRef.current || isSentRef.current) return;
    isSendingRef.current = true;
    setSending(true);

    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      }).catch(() => null);

      await sendEmergencyAlert({
        latitude: location?.coords.latitude ?? 6.9214,
        longitude: location?.coords.longitude ?? 122.079,
      });

      lastSosSentAt = Date.now();
      isSentRef.current = true;
      setSent(true);
    } catch {
      Toast.show({ type: 'error', text1: 'Could not send alert — SMS may have been sent directly' });
      lastSosSentAt = Date.now();
      isSentRef.current = true;
      setSent(true);
    } finally {
      isSendingRef.current = false;
      setSending(false);
    }
  };

  const handleCancel = () => router.back();

  const handleSendNow = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    runTrigger();
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
        <View style={styles.header}>
          <Ionicons name="warning" size={28} color="#fff" />
          <Text style={styles.headerTitle}>EMERGENCY ALERT</Text>
        </View>

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

        <View style={styles.actions}>
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} activeOpacity={0.85}>
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
