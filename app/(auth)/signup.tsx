import { useState, useRef } from 'react';
import Toast from 'react-native-toast-message';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/lib/api-client';
import { useAddressCascade } from '@/hooks/use-address-cascade';
import type { AddressBarangay } from '@/types';

const ZAMBOANGA_PROVINCE_ID = '09317';
const ZAMBOANGA_CITY_ID     = '0931700';
const ZAMBOANGA_REGION_ID   = '09';

export default function SignupScreen() {
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [contactDigits, setContactDigits] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const lastNameRef = useRef<TextInput>(null);
  const middleNameRef = useRef<TextInput>(null);
  const usernameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const contactRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  const streetRef = useRef<TextInput>(null);

  // Address (optional, locked to Zamboanga City)
  const [barangayCode,       setBarangayCode]       = useState('');
  const [streetInput,        setStreetInput]        = useState('');
  const [showBarangayPicker, setShowBarangayPicker] = useState(false);
  const [pickerSearch,       setPickerSearch]       = useState('');

  const { barangays, loading: loadingBarangays } = useAddressCascade();

  async function handleSignup() {
    if (!firstName.trim() || !lastName.trim() || !username.trim() || !email.trim() || !contactDigits.trim() || !password || !passwordConfirmation || !barangayCode || !streetInput.trim()) {
      Toast.show({ type: 'error', text1: 'Missing Fields', text2: 'Please fill in all required fields.' });
      return;
    }
    if (!agreedToTerms) {
      Toast.show({ type: 'error', text1: 'Terms Required', text2: 'You must agree to the Terms and Conditions to proceed.' });
      return;
    }
    if (username.trim().length < 3) {
      Toast.show({ type: 'error', text1: 'Username Too Short', text2: 'Username must be at least 3 characters.' });
      return;
    }
    if (contactDigits.length !== 10 || !contactDigits.startsWith('9')) {
      Toast.show({ type: 'error', text1: 'Invalid Number', text2: 'Must be 10 digits starting with 9 (e.g. 9171234567).' });
      return;
    }
    if (password !== passwordConfirmation) {
      Toast.show({ type: 'error', text1: 'Password Mismatch', text2: 'Passwords do not match.' });
      return;
    }
    setLoading(true);
    try {
      await api.post('/rider/auth/register', {
        first_name:  firstName.trim(),
        middle_name: middleName.trim() || undefined,
        last_name:   lastName.trim(),
        username:    username.trim(),
        email:       email.trim(),
        contact_number: '+63' + contactDigits.trim(),
        password,
        password_confirmation: passwordConfirmation,
        barangay_id: barangayCode,
        province_id: ZAMBOANGA_PROVINCE_ID,
        city_id:     ZAMBOANGA_CITY_ID,
        region_id:   ZAMBOANGA_REGION_ID,
        street:      streetInput.trim(),
      });
      router.push({ pathname: '/(auth)/verify-otp', params: { email: email.trim() } });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Registration Failed', text2: err?.message ?? 'Could not create account. Please try again.' });
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
              <Text style={styles.appName}>AVISO</Text>
              <Text style={styles.tagline}>Create Rider Account</Text>
            </View>

            <View style={styles.form}>
              {/* First + Last name */}
              <View style={styles.row}>
                <View style={[styles.field, styles.half]}>
                  <Text style={styles.label}>First name</Text>
                  <TextInput
                    style={styles.input}
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="Juan"
                    placeholderTextColor="#BBBBBB"
                    autoCapitalize="words"
                    returnKeyType="next"
                    onSubmitEditing={() => lastNameRef.current?.focus()}
                    blurOnSubmit={false}
                    keyboardAppearance="light"
                    underlineColorAndroid="transparent"
                  />
                </View>
                <View style={[styles.field, styles.half]}>
                  <Text style={styles.label}>Last name</Text>
                  <TextInput
                    style={styles.input}
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Dela Cruz"
                    placeholderTextColor="#BBBBBB"
                    autoCapitalize="words"
                    returnKeyType="next"
                    ref={lastNameRef}
                    onSubmitEditing={() => middleNameRef.current?.focus()}
                    blurOnSubmit={false}
                    keyboardAppearance="light"
                    underlineColorAndroid="transparent"
                  />
                </View>
              </View>

              {/* Middle name â€” optional */}
              <View style={styles.field}>
                <Text style={styles.label}>
                  Middle name{' '}
                  <Text style={styles.optional}>(optional)</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  value={middleName}
                  onChangeText={setMiddleName}
                  placeholder="e.g. Santos"
                  placeholderTextColor="#BBBBBB"
                  autoCapitalize="words"
                  returnKeyType="next"
                  ref={middleNameRef}
                  onSubmitEditing={() => usernameRef.current?.focus()}
                  blurOnSubmit={false}
                  keyboardAppearance="light"
                  underlineColorAndroid="transparent"
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Username</Text>
                <View style={styles.inputWrapper}>
                  <Text style={styles.atSign}>@</Text>
                  <TextInput
                    style={[styles.input, styles.inputWithAt]}
                    value={username}
                    onChangeText={(text) =>
                      setUsername(text.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30))
                    }
                    placeholder="your_username"
                    placeholderTextColor="#BBBBBB"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    ref={usernameRef}
                    onSubmitEditing={() => emailRef.current?.focus()}
                    blurOnSubmit={false}
                    keyboardAppearance="light"
                    underlineColorAndroid="transparent"
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Email address</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="rider@example.com"
                  placeholderTextColor="#BBBBBB"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  ref={emailRef}
                  onSubmitEditing={() => contactRef.current?.focus()}
                  blurOnSubmit={false}
                  keyboardAppearance="light"
                  underlineColorAndroid="transparent"
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Contact number</Text>
                <View style={styles.phoneRow}>
                  <View style={styles.phonePrefix}>
                    <Text style={styles.phonePrefixText}>+63</Text>
                  </View>
                  <TextInput
                    style={styles.phoneInput}
                    value={contactDigits}
                    onChangeText={(text) => setContactDigits(text.replace(/\D/g, '').slice(0, 10))}
                    placeholder="9XXXXXXXXX"
                    placeholderTextColor="#BBBBBB"
                    keyboardType="number-pad"
                    returnKeyType="next"
                    ref={contactRef}
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    blurOnSubmit={false}
                    keyboardAppearance="light"
                    underlineColorAndroid="transparent"
                    maxLength={10}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Password</Text>
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
                    ref={passwordRef}
                    onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                    blurOnSubmit={false}
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
                    {([
                      { label: 'At least 8 characters', met: password.length >= 8 },
                      { label: 'At least one uppercase letter', met: /[A-Z]/.test(password) },
                      { label: 'At least one lowercase letter', met: /[a-z]/.test(password) },
                    ] as { label: string; met: boolean }[]).map((rule, i) => (
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
                    returnKeyType="next"
                    ref={confirmPasswordRef}
                    onSubmitEditing={() => streetRef.current?.focus()}
                    blurOnSubmit={false}
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
                {passwordConfirmation.length > 0 && (
                  <View style={styles.checker}>
                    <View style={styles.checkerRow}>
                      <Ionicons
                        name={password === passwordConfirmation ? 'checkmark-circle' : 'close-circle'}
                        size={14}
                        color={password === passwordConfirmation ? '#22C55E' : '#EF4444'}
                      />
                      <Text style={[styles.checkerText, { color: password === passwordConfirmation ? '#22C55E' : '#EF4444' }]}>
                        {password === passwordConfirmation ? 'Passwords match' : 'Passwords do not match'}
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              {/* Address (locked to Zamboanga City) */}
              <View style={styles.field}>
                <Text style={styles.label}>
                  Address
                </Text>

                {/* Locked city label */}
                <View style={[styles.input, { justifyContent: 'center', marginBottom: 8 }]}>
                  <Text style={{ color: '#6B6B6B', fontSize: 13, fontFamily: 'JetBrainsMono_400Regular' }}>
                    City of Zamboanga, Zamboanga Peninsula
                  </Text>
                </View>

                {/* Barangay picker */}
                <TouchableOpacity
                  style={[styles.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, opacity: loadingBarangays ? 0.6 : 1 }]}
                  onPress={() => { setPickerSearch(''); setShowBarangayPicker(true); }}
                  disabled={loadingBarangays}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: barangayCode ? '#111111' : '#BBBBBB', fontFamily: 'JetBrainsMono_400Regular', fontSize: 15 }}>
                    {loadingBarangays
                      ? 'Loading barangays…'
                      : (barangays.find(b => b.code === barangayCode)?.name ?? 'Select barangay')}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color="#888888" />
                </TouchableOpacity>

                {/* Street input */}
                <TextInput
                  style={styles.input}
                  value={streetInput}
                  onChangeText={setStreetInput}
                  placeholder="Street / House No."
                  placeholderTextColor="#BBBBBB"
                  autoCapitalize="words"
                  returnKeyType="done"
                  ref={streetRef}
                  onSubmitEditing={handleSignup}
                  keyboardAppearance="light"
                  underlineColorAndroid="transparent"
                  maxLength={255}
                />
              </View>

              {/* Terms Checkbox */}
              <View style={styles.termsRow}>
                <Pressable
                  style={[styles.checkbox, agreedToTerms && styles.checkboxActive]}
                  onPress={() => {
                    if (!agreedToTerms) {
                      setShowTerms(true);
                    } else {
                      setAgreedToTerms(false);
                    }
                  }}
                >
                  {agreedToTerms && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                </Pressable>
                <Text style={styles.termsText}>
                  I agree to the{' '}
                  <Text style={styles.termsLink} onPress={() => setShowTerms(true)}>
                    Terms & Conditions and Privacy Policy
                  </Text>
                </Text>
              </View>

              <Pressable
                style={[styles.button, (!agreedToTerms || loading) && styles.buttonDisabled]}
                onPress={handleSignup}
                disabled={!agreedToTerms || loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonText}>Create Account</Text>
                )}
              </Pressable>

              <Pressable onPress={() => router.back()} style={styles.linkRow}>
                <Text style={styles.linkText}>
                  Already have an account?{' '}
                  <Text style={styles.linkBold}>Log in</Text>
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Barangay picker modal */}
      <Modal
        visible={showBarangayPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowBarangayPicker(false)}
      >
        <View style={pickerStyles.overlay}>
          <View style={pickerStyles.sheet}>
            <View style={pickerStyles.header}>
              <Text style={pickerStyles.headerText}>Select Barangay</Text>
              <Pressable onPress={() => setShowBarangayPicker(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color="#888888" />
              </Pressable>
            </View>

            <TextInput
              style={pickerStyles.search}
              value={pickerSearch}
              onChangeText={setPickerSearch}
              placeholder="Search barangay…"
              placeholderTextColor="#BBBBBB"
              autoFocus
            />

            {loadingBarangays ? (
              <ActivityIndicator color="#111111" style={{ padding: 24 }} />
            ) : (
              <FlatList
                keyboardShouldPersistTaps="handled"
                data={barangays.filter(b => b.name.toLowerCase().includes(pickerSearch.toLowerCase()))}
                keyExtractor={item => item.code}
                renderItem={({ item }: { item: AddressBarangay }) => (
                  <Pressable
                    style={pickerStyles.item}
                    onPress={() => { setBarangayCode(item.code); setShowBarangayPicker(false); }}
                  >
                    <Text style={pickerStyles.itemText}>{item.name}</Text>
                  </Pressable>
                )}
                ListEmptyComponent={
                  <View style={pickerStyles.empty}>
                    <Text style={pickerStyles.emptyText}>No results found</Text>
                  </View>
                }
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Terms Modal */}
      <Modal
        visible={showTerms}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowTerms(false)}
      >
        <View style={styles.termsRoot}>
          <View style={styles.termsHeader}>
            <Text style={styles.termsTitle}>Terms & Privacy Policy</Text>
            <Pressable onPress={() => setShowTerms(false)} hitSlop={8} style={styles.termsCloseBtn}>
              <Ionicons name="close" size={24} color="#111111" />
            </Pressable>
          </View>
          <ScrollView style={styles.termsScroll} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.termsContentTitle}>Data Collection and Usage</Text>
            <Text style={styles.termsContentText}>
              Aviso is designed to map and log road hazards in real-time. To make this possible, our application collects specific data from your edge device while you ride:
              {'\n\n'}• <Text style={{ fontFamily: 'JetBrainsMono_600SemiBold' }}>Camera Data:</Text> Our system processes real-time video feeds from your device to detect road hazards (such as potholes, road excavations, barriers, traffic lights, and traffic signs).
              {'\n\n'}• <Text style={{ fontFamily: 'JetBrainsMono_600SemiBold' }}>Hazard Logs:</Text> When a hazard is detected, the system records the hazard type, timestamp, and a confidence score. This data is synced to our secure cloud servers to update the global Admin Hazard Logs.
            </Text>

            <Text style={styles.termsContentTitle}>Location Tracking</Text>
            <Text style={styles.termsContentText}>
              • <Text style={{ fontFamily: 'JetBrainsMono_600SemiBold' }}>GPS Data:</Text> To accurately map detected hazards, Aviso requires continuous access to your device's location services (GPS) while the app is actively running or tracking a ride.
              {'\n\n'}• <Text style={{ fontFamily: 'JetBrainsMono_600SemiBold' }}>Privacy Guarantee:</Text> Your location data is strictly tied to detected road hazards. We do not use your location data to track your personal whereabouts for commercial purposes or share it with third-party advertisers.
            </Text>

            <Text style={styles.termsContentTitle}>User Accounts and Security</Text>
            <Text style={styles.termsContentText}>
              • You are responsible for maintaining the confidentiality of your account credentials (email, username, and password).
              {'\n\n'}• You agree to provide accurate and complete information during signup.
              {'\n\n'}• Administrative accounts hold the right to suspend or delete your account if you violate these terms or tamper with the application. For your privacy, administrators cannot view or modify your password.
            </Text>

            <Text style={styles.termsContentTitle}>Safety Disclaimer</Text>
            <Text style={styles.termsContentText}>
              • <Text style={{ fontFamily: 'JetBrainsMono_600SemiBold' }}>Not a Substitute for Safe Driving:</Text> Aviso is a supplementary warning system using text-to-speech (TTS) to announce hazards. It is not a substitute for attentive driving. You must always keep your eyes on the road and obey all traffic laws.
              {'\n\n'}• We are not liable for any accidents, damages, or injuries that occur while using the application.
            </Text>

            <Text style={styles.termsContentTitle}>Changes to These Terms</Text>
            <Text style={styles.termsContentText}>
              We reserve the right to update these Terms and Conditions at any time. Continued use of the application after changes implies your acceptance of the updated terms.
            </Text>
          </ScrollView>
          <View style={styles.termsFooter}>
            <Pressable 
              style={styles.button} 
              onPress={() => {
                setAgreedToTerms(true);
                setShowTerms(false);
              }}
            >
              <Text style={styles.buttonText}>I Understand and Agree</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: '#F7F7F7', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '75%' },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#EBEBEB' },
  headerText: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 16, color: '#111111' },
  search:     { margin: 12, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#EBEBEB', backgroundColor: '#FFFFFF', fontFamily: 'JetBrainsMono_400Regular', fontSize: 14, color: '#111111' },
  item:       { padding: 16, borderBottomWidth: 1, borderBottomColor: '#EBEBEB' },
  itemText:   { fontFamily: 'JetBrainsMono_400Regular', fontSize: 15, color: '#111111' },
  empty:      { padding: 24, alignItems: 'center' },
  emptyText:  { fontFamily: 'JetBrainsMono_400Regular', color: '#888888' },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F7F7' },
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 32,
  },
  brand: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoImg: { width: 80, height: 80, marginBottom: 16 },
  appName: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 28,
    color: '#111111',
    letterSpacing: -0.5,
  },
  tagline: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 13,
    color: '#6B6B6B',
    marginTop: 4,
  },
  form: {},
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  field: { marginBottom: 14 },
  label: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 13,
    color: '#6B6B6B',
    marginBottom: 8,
  },
  optional: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 12,
    color: '#AAAAAA',
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
  phoneRow: {
    flexDirection: 'row',
    gap: 8,
  },
  phonePrefix: {
    backgroundColor: '#EBEBEB',
    borderRadius: 12,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 50,
  },
  phonePrefixText: {
    fontFamily: 'JetBrainsMono_600SemiBold',
    fontSize: 15,
    color: '#6B6B6B',
  },
  phoneInput: {
    flex: 1,
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
  inputWithAt: { paddingLeft: 34 },
  atSign: {
    position: 'absolute',
    left: 14,
    top: 0,
    bottom: 0,
    textAlignVertical: 'center',
    lineHeight: 50,
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 15,
    color: '#AAAAAA',
    zIndex: 1,
  },
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
  linkRow: {
    alignItems: 'center',
    marginTop: 22,
    minHeight: 44,
    justifyContent: 'center',
  },
  linkText: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 14,
    color: '#888888',
  },
  linkBold: {
    fontFamily: 'JetBrainsMono_600SemiBold',
    color: '#0274DF',
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
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 12,
    paddingHorizontal: 4,
    gap: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#AAAAAA',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxActive: {
    borderColor: '#0274DF',
    backgroundColor: '#0274DF',
  },
  termsText: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 13,
    color: '#6B6B6B',
    flex: 1,
    lineHeight: 18,
  },
  termsLink: {
    fontFamily: 'JetBrainsMono_600SemiBold',
    color: '#0274DF',
  },
  termsRoot: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 44 : 20,
  },
  termsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  termsTitle: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 18,
    color: '#111111',
  },
  termsCloseBtn: {
    padding: 4,
    marginRight: -4,
  },
  termsScroll: {
    flex: 1,
    padding: 20,
  },
  termsContentTitle: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 16,
    color: '#111111',
    marginTop: 24,
    marginBottom: 12,
  },
  termsContentText: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 14,
    color: '#444444',
    lineHeight: 22,
  },
  termsFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    backgroundColor: '#FFFFFF',
  },
});
