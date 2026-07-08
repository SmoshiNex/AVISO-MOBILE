import { useRef, useState, useEffect } from 'react';
import Toast from 'react-native-toast-message';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/lib/api-client';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useColorScheme } from '@/hooks/use-color-scheme';

const OTP_LENGTH = 6;

export default function ForgotPasswordOtpScreen() {
  const background     = useThemeColor({}, 'background');
  const backgroundElem = useThemeColor({}, 'backgroundElement');
  const text             = useThemeColor({}, 'text');
  const textSecondary    = useThemeColor({}, 'textSecondary');
  const placeholder     = useThemeColor({}, 'placeholder');
  const primary         = useThemeColor({}, 'primary');
  const actionBg        = useThemeColor({}, 'actionBg');
  const actionText      = useThemeColor({}, 'actionText');
  const colorScheme = useColorScheme();

  const { email } = useLocalSearchParams<{ email: string }>();
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputRefs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

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
      Toast.show({ type: 'error', text1: 'Please enter all 6 digits.' });
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<{ reset_token: string }>(
        '/rider/auth/forgot-password/verify',
        { email, otp },
      );
      router.push({
        pathname: '/(auth)/forgot-password-reset',
        params: { reset_token: res.reset_token },
      });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Verification Failed', text2: err?.message ?? 'Invalid or expired code.' });
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    try {
      await api.post('/rider/auth/forgot-password', { email });
      setCooldown(60);
      setDigits(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
      Toast.show({ type: 'success', text1: 'Code Sent', text2: 'A new reset code has been sent to your email.' });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err?.message ?? 'Could not resend code.' });
    } finally {
      setResending(false);
    }
  }

  const otpFilled = digits.join('').length === OTP_LENGTH;

  return (
    <View style={[styles.root, { backgroundColor: background }]}>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={background} />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.content}>
            <View style={styles.steps}>
              {[1, 2, 3].map((n) => (
                <View
                  key={n}
                  style={[
                    styles.stepDot,
                    { backgroundColor: n <= 2 ? primary : backgroundElem },
                    n <= 2 && styles.stepDotActive,
                  ]}
                />
              ))}
            </View>

            <Text style={[styles.title, { color: text }]}>Check your email</Text>
            <Text style={[styles.subtitle, { color: textSecondary }]}>
              We sent a 6-digit reset code to{'\n'}
              <Text style={[styles.emailText, { color: primary }]}>{email}</Text>
            </Text>

            <View style={styles.otpRow}>
              {digits.map((digit, i) => (
                <TextInput
                  key={i}
                  ref={(ref) => { inputRefs.current[i] = ref; }}
                  style={[
                    styles.otpBox,
                    { backgroundColor: backgroundElem, color: text },
                    digit ? [styles.otpBoxFilled, { backgroundColor: 'rgba(2, 116, 223, 0.07)', borderColor: primary }] : null,
                  ]}
                  value={digit}
                  onChangeText={(text) => handleDigitChange(text, i)}
                  onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
                  keyboardType="number-pad"
                  keyboardAppearance={colorScheme}
                  underlineColorAndroid="transparent"
                  maxLength={1}
                  selectTextOnFocus
                  textAlign="center"
                />
              ))}
            </View>

            <Pressable
              style={[styles.button, { backgroundColor: actionBg }, (!otpFilled || loading) && styles.buttonDisabled]}
              onPress={handleVerify}
              disabled={!otpFilled || loading}
            >
              {loading ? (
                <ActivityIndicator color={actionText} />
              ) : (
                <Text style={[styles.buttonText, { color: actionText }]}>Verify Code</Text>
              )}
            </Pressable>

            <Pressable
              onPress={handleResend}
              disabled={resending || cooldown > 0}
              style={styles.resendBtn}
            >
              {resending ? (
                <ActivityIndicator color={primary} size="small" />
              ) : (
                <Text style={[styles.resendText, { color: cooldown > 0 ? placeholder : primary }]}>
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                </Text>
              )}
            </Pressable>

            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Text style={[styles.backText, { color: placeholder }]}>← Go back</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  steps: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 28,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stepDotActive: {
    width: 24,
  },
  title: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 26,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 36,
  },
  emailText: {
    fontFamily: 'JetBrainsMono_600SemiBold',
  },
  otpRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 36,
  },
  otpBox: {
    width: 48,
    height: 58,
    borderRadius: 12,
    fontSize: 22,
    fontFamily: 'JetBrainsMono_700Bold',
    textAlign: 'center',
  },
  otpBoxFilled: {
    borderWidth: 1.5,
  },
  button: {
    borderRadius: 32,
    width: '100%',
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: {
    fontFamily: 'JetBrainsMono_600SemiBold',
    fontSize: 15,
  },
  resendBtn: {
    marginTop: 22,
    minHeight: 44,
    justifyContent: 'center',
  },
  resendText: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 14,
  },
  backBtn: {
    marginTop: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  backText: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 14,
  },
});
