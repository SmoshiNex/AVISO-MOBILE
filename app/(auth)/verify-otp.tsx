import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { api } from '@/lib/api-client';
import type { User } from '@/types';

type VerifyResponse = { token: string; user: User };

const OTP_LENGTH = 6;

export default function VerifyOtpScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const inputRefs = useRef<Array<TextInput | null>>([]);

  function handleDigitChange(text: string, index: number) {
    const cleaned = text.replace(/[^0-9]/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = cleaned;
    setDigits(newDigits);
    if (cleaned && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyPress(key: string, index: number) {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function handleVerify() {
    const otp = digits.join('');
    if (otp.length < OTP_LENGTH) {
      Alert.alert('Incomplete', 'Please enter all 6 digits.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<VerifyResponse>('/rider/auth/verify-otp', { email, otp });
      await SecureStore.setItemAsync('rider_token', res.token);
      await SecureStore.setItemAsync('rider_user', JSON.stringify(res.user));
      router.replace('/(rider)/home');
    } catch (err: any) {
      Alert.alert('Verification Failed', err?.message ?? 'Invalid or expired code.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    try {
      await api.post('/rider/auth/register', { email });
      Alert.alert('Code Sent', 'A new verification code has been sent to your email.');
      setDigits(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not resend code.');
    } finally {
      setResending(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          <Text style={styles.title}>Check Your Email</Text>
          <Text style={styles.subtitle}>
            We sent a 6-digit code to{'\n'}
            <Text style={styles.emailText}>{email}</Text>
          </Text>

          <View style={styles.otpRow}>
            {digits.map((digit, i) => (
              <TextInput
                key={i}
                ref={(ref) => { inputRefs.current[i] = ref; }}
                style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
                value={digit}
                onChangeText={(text) => handleDigitChange(text, i)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
                textAlign="center"
              />
            ))}
          </View>

          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleVerify}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Verify Email</Text>
            )}
          </Pressable>

          <Pressable onPress={handleResend} disabled={resending} style={styles.resendBtn}>
            {resending ? (
              <ActivityIndicator color="#0274DF" size="small" />
            ) : (
              <Text style={styles.resendText}>Resend code</Text>
            )}
          </Pressable>

          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Go back</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  title: { fontSize: 26, fontWeight: '700', color: '#111827', marginBottom: 12 },
  subtitle: { fontSize: 16, color: '#6B7280', textAlign: 'center', lineHeight: 24, marginBottom: 32 },
  emailText: { color: '#0274DF', fontWeight: '600' },
  otpRow: { flexDirection: 'row', gap: 10, marginBottom: 32 },
  otpBox: {
    width: 44,
    height: 56,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  otpBoxFilled: { borderColor: '#0274DF' },
  button: {
    backgroundColor: '#0274DF',
    borderRadius: 8,
    width: '100%',
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  resendBtn: { marginTop: 20, minHeight: 44, justifyContent: 'center' },
  resendText: { color: '#0274DF', fontSize: 14 },
  backBtn: { marginTop: 8, minHeight: 44, justifyContent: 'center' },
  backText: { color: '#9CA3AF', fontSize: 14 },
});
