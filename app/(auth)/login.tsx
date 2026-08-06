import { useState } from 'react';
import Toast from 'react-native-toast-message';
import {
  ActivityIndicator,
  Image,
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
import * as SecureStore from 'expo-secure-store';
import { api } from '@/lib/api-client';
import { pullFromBackend } from '@/lib/sync-service';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { User } from '@/types';

type LoginResponse = { token: string; user: User };

export default function LoginScreen() {
  const background     = useThemeColor({}, 'background');
  const backgroundElem = useThemeColor({}, 'backgroundElement');
  const text            = useThemeColor({}, 'text');
  const textSecondary    = useThemeColor({}, 'textSecondary');
  const placeholder     = useThemeColor({}, 'placeholder');
  const primary         = useThemeColor({}, 'primary');
  const actionBg        = useThemeColor({}, 'actionBg');
  const actionText      = useThemeColor({}, 'actionText');
  const colorScheme = useColorScheme();

  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password) return;
    setLoading(true);
    try {
      const res = await api.post<LoginResponse>('/rider/auth/login', { email, password });
      await SecureStore.setItemAsync('rider_token', res.token);
      await SecureStore.setItemAsync('rider_user', JSON.stringify(res.user));
      await SecureStore.setItemAsync('rider_code', res.user.username ?? '');
      // Force the pull so it is never skipped by the cooldown, and await it so
      // the rider's trips/hazard logs/contacts are in the local DB before the
      // home screen mounts. A pull failure must not block login navigation.
      try {
        await pullFromBackend(true);
      } catch {
        // Data will load on the next sync or pull-to-refresh.
      }
      router.replace('/(rider)/(tabs)/home');
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Login Failed', text2: err?.message ?? 'Invalid credentials. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: background }]}>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={background} />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            automaticallyAdjustKeyboardInsets={true}
          >
            <View style={styles.brand}>
              <Image
                source={require('../../assets/images/logo.png')}
                style={styles.logoImg}
                resizeMode="contain"
              />
              <Text style={[styles.appName, { color: text }]}>AVISO</Text>
              <Text style={[styles.tagline, { color: textSecondary }]}>Rider Safety Platform</Text>
            </View>

            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={[styles.label, { color: textSecondary }]}>Email or username</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: backgroundElem, color: text }]}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email or username"
                  placeholderTextColor={placeholder}
                  keyboardType="default"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  keyboardAppearance={colorScheme}
                  underlineColorAndroid="transparent"
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: textSecondary }]}>Password</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={[styles.input, { backgroundColor: backgroundElem, color: text }, password.length > 0 && styles.inputWithEye]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Your password"
                    placeholderTextColor={placeholder}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                    keyboardAppearance={colorScheme}
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
                        color={textSecondary}
                      />
                    </Pressable>
                  )}
                </View>
              </View>

              <Pressable
                style={[styles.button, { backgroundColor: actionBg }, loading && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={actionText} />
                ) : (
                  <Text style={[styles.buttonText, { color: actionText }]}>Log In</Text>
                )}
              </Pressable>

              <Pressable
                onPress={() => router.push('/(auth)/forgot-password')}
                style={styles.forgotBtn}
              >
                <Text style={[styles.forgotText, { color: primary }]}>Forgot password?</Text>
              </Pressable>

              <Pressable onPress={() => router.push('/(auth)/signup')} style={styles.linkRow}>
                <Text style={[styles.linkText, { color: textSecondary }]}>
                  Don't have an account?{' '}
                  <Text style={[styles.linkBold, { color: primary }]}>Sign up</Text>
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 40,
  },
  brand: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoImg: { width: 80, height: 80, marginBottom: 16 },
  appName: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 30,
    letterSpacing: -0.5,
  },
  tagline: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 13,
    marginTop: 4,
  },
  form: {},
  field: { marginBottom: 16 },
  label: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 13,
    marginBottom: 8,
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: 'JetBrainsMono_400Regular',
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
  button: {
    borderRadius: 32,
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: {
    fontFamily: 'JetBrainsMono_600SemiBold',
    fontSize: 15,
  },
  forgotBtn: {
    alignItems: 'center',
    marginTop: 14,
    minHeight: 36,
    justifyContent: 'center',
  },
  forgotText: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 14,
  },
  linkRow: {
    alignItems: 'center',
    marginTop: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  linkText: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 14,
  },
  linkBold: {
    fontFamily: 'JetBrainsMono_600SemiBold',
  },
});
