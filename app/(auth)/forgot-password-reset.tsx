import { useState } from 'react';
import Toast from 'react-native-toast-message';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/lib/api-client';

export default function ForgotPasswordResetScreen() {
  const { reset_token } = useLocalSearchParams<{ reset_token: string }>();
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const passwordRules = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'At least one uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'At least one lowercase letter', met: /[a-z]/.test(password) },
  ] as { label: string; met: boolean }[];

  const passwordValid = passwordRules.every((r) => r.met);

  async function handleReset() {
    if (!passwordValid) {
      Toast.show({ type: 'error', text1: 'Weak Password', text2: 'Please meet all password requirements.' });
      return;
    }
    if (password !== passwordConfirmation) {
      Toast.show({ type: 'error', text1: 'Password Mismatch', text2: 'Passwords do not match.' });
      return;
    }
    setLoading(true);
    try {
      await api.post('/rider/auth/forgot-password/reset', {
        reset_token,
        password,
        password_confirmation: passwordConfirmation,
      });
      Toast.show({ type: 'success', text1: 'Password Reset!', text2: 'Redirecting you to log in...' });
      setTimeout(() => router.replace('/(auth)/login'), 1500);
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Reset Failed', text2: err?.message ?? 'Could not reset password. Please start over.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F7F7" />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.steps}>
              {[1, 2, 3].map((n) => (
                <View key={n} style={[styles.stepDot, styles.stepDotActive]} />
              ))}
            </View>

            <Text style={styles.title}>Create new password</Text>
            <Text style={styles.subtitle}>
              Choose a strong password for your AVISO account.
            </Text>

            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={styles.label}>New password</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={[styles.input, password.length > 0 && styles.inputWithEye]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="At least 8 characters"
                    placeholderTextColor="#BBBBBB"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    returnKeyType="next"
                    keyboardAppearance="light"
                    underlineColorAndroid="transparent"
                  />
                  {password.length > 0 && (
                    <Pressable
                      onPress={() => setShowPassword((p) => !p)}
                      style={styles.eyeBtn}
                      hitSlop={8}
                    >
                      <Ionicons
                        name={showPassword ? 'eye-off' : 'eye'}
                        size={18}
                        color="#888888"
                      />
                    </Pressable>
                  )}
                </View>
                {password.length > 0 && (
                  <View style={styles.checker}>
                    {passwordRules.map((rule, i) => (
                      <View key={i} style={styles.checkerRow}>
                        <Ionicons
                          name={rule.met ? 'checkmark-circle' : 'ellipse-outline'}
                          size={14}
                          color={rule.met ? '#22C55E' : '#AAAAAA'}
                        />
                        <Text style={[styles.checkerText, { color: rule.met ? '#22C55E' : '#AAAAAA' }]}>
                          {rule.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Confirm password</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={[styles.input, passwordConfirmation.length > 0 && styles.inputWithEye]}
                    value={passwordConfirmation}
                    onChangeText={setPasswordConfirmation}
                    placeholder="Repeat your password"
                    placeholderTextColor="#BBBBBB"
                    secureTextEntry={!showConfirm}
                    autoCapitalize="none"
                    returnKeyType="done"
                    onSubmitEditing={handleReset}
                    keyboardAppearance="light"
                    underlineColorAndroid="transparent"
                  />
                  {passwordConfirmation.length > 0 && (
                    <Pressable
                      onPress={() => setShowConfirm((p) => !p)}
                      style={styles.eyeBtn}
                      hitSlop={8}
                    >
                      <Ionicons
                        name={showConfirm ? 'eye-off' : 'eye'}
                        size={18}
                        color="#888888"
                      />
                    </Pressable>
                  )}
                </View>
              </View>

              <Pressable
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleReset}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonText}>Reset Password</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F7F7' },
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 40,
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
    backgroundColor: '#DDDDDD',
  },
  stepDotActive: {
    backgroundColor: '#0274DF',
    width: 24,
  },
  title: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 26,
    color: '#111111',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 14,
    color: '#6B6B6B',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  form: {},
  field: { marginBottom: 14 },
  label: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 13,
    color: '#6B6B6B',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#EBEBEB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    fontFamily: 'JetBrainsMono_400Regular',
    color: '#111111',
    minHeight: 50,
  },
  inputWrapper: { position: 'relative' },
  inputWithEye: { paddingRight: 50 },
  eyeBtn: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 44,
  },
  checker: {
    marginTop: 10,
    gap: 5,
    paddingHorizontal: 2,
  },
  checkerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  checkerText: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  button: {
    backgroundColor: '#111111',
    borderRadius: 32,
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: {
    fontFamily: 'JetBrainsMono_600SemiBold',
    color: '#FFFFFF',
    fontSize: 15,
  },
});
