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
import { useThemeColor } from '@/hooks/use-theme-color';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { AddressBarangay } from '@/types';

const ZAMBOANGA_PROVINCE_ID = '09317';
const ZAMBOANGA_CITY_ID     = '0931700';
const ZAMBOANGA_REGION_ID   = '09';

export default function SignupScreen() {
  const background     = useThemeColor({}, 'background');
  const backgroundElem = useThemeColor({}, 'backgroundElement');
  const card            = useThemeColor({}, 'card');
  const text             = useThemeColor({}, 'text');
  const textSecondary    = useThemeColor({}, 'textSecondary');
  const placeholder     = useThemeColor({}, 'placeholder');
  const primary         = useThemeColor({}, 'primary');
  const border           = useThemeColor({}, 'border');
  const success          = useThemeColor({}, 'success');
  const danger            = useThemeColor({}, 'danger');
  const actionBg        = useThemeColor({}, 'actionBg');
  const actionText      = useThemeColor({}, 'actionText');
  const colorScheme = useColorScheme();

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
              <Text style={[styles.tagline, { color: textSecondary }]}>Create Rider Account</Text>
            </View>

            <View style={styles.form}>
              {/* First + Last name */}
              <View style={styles.row}>
                <View style={[styles.field, styles.half]}>
                  <Text style={[styles.label, { color: textSecondary }]}>First name</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: backgroundElem, color: text }]}
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="Juan"
                    placeholderTextColor={placeholder}
                    autoCapitalize="words"
                    returnKeyType="next"
                    onSubmitEditing={() => lastNameRef.current?.focus()}
                    blurOnSubmit={false}
                    keyboardAppearance={colorScheme}
                    underlineColorAndroid="transparent"
                  />
                </View>
                <View style={[styles.field, styles.half]}>
                  <Text style={[styles.label, { color: textSecondary }]}>Last name</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: backgroundElem, color: text }]}
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Dela Cruz"
                    placeholderTextColor={placeholder}
                    autoCapitalize="words"
                    returnKeyType="next"
                    ref={lastNameRef}
                    onSubmitEditing={() => middleNameRef.current?.focus()}
                    blurOnSubmit={false}
                    keyboardAppearance={colorScheme}
                    underlineColorAndroid="transparent"
                  />
                </View>
              </View>

              {/* Middle name — optional */}
              <View style={styles.field}>
                <Text style={[styles.label, { color: textSecondary }]}>
                  Middle name{' '}
                  <Text style={[styles.optional, { color: placeholder }]}>(optional)</Text>
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: backgroundElem, color: text }]}
                  value={middleName}
                  onChangeText={setMiddleName}
                  placeholder="e.g. Santos"
                  placeholderTextColor={placeholder}
                  autoCapitalize="words"
                  returnKeyType="next"
                  ref={middleNameRef}
                  onSubmitEditing={() => usernameRef.current?.focus()}
                  blurOnSubmit={false}
                  keyboardAppearance={colorScheme}
                  underlineColorAndroid="transparent"
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: textSecondary }]}>Username</Text>
                <View style={styles.inputWrapper}>
                  <Text style={[styles.atSign, { color: placeholder }]}>@</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: backgroundElem, color: text }, styles.inputWithAt]}
                    value={username}
                    onChangeText={(text) =>
                      setUsername(text.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30))
                    }
                    placeholder="your_username"
                    placeholderTextColor={placeholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    ref={usernameRef}
                    onSubmitEditing={() => emailRef.current?.focus()}
                    blurOnSubmit={false}
                    keyboardAppearance={colorScheme}
                    underlineColorAndroid="transparent"
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: textSecondary }]}>Email address</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: backgroundElem, color: text }]}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="rider@example.com"
                  placeholderTextColor={placeholder}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  ref={emailRef}
                  onSubmitEditing={() => contactRef.current?.focus()}
                  blurOnSubmit={false}
                  keyboardAppearance={colorScheme}
                  underlineColorAndroid="transparent"
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: textSecondary }]}>Contact number</Text>
                <View style={styles.phoneRow}>
                  <View style={[styles.phonePrefix, { backgroundColor: backgroundElem }]}>
                    <Text style={[styles.phonePrefixText, { color: textSecondary }]}>+63</Text>
                  </View>
                  <TextInput
                    style={[styles.phoneInput, { backgroundColor: backgroundElem, color: text }]}
                    value={contactDigits}
                    onChangeText={(text) => setContactDigits(text.replace(/\D/g, '').slice(0, 10))}
                    placeholder="9XXXXXXXXX"
                    placeholderTextColor={placeholder}
                    keyboardType="number-pad"
                    returnKeyType="next"
                    ref={contactRef}
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    blurOnSubmit={false}
                    keyboardAppearance={colorScheme}
                    underlineColorAndroid="transparent"
                    maxLength={10}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: textSecondary }]}>Password</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={[styles.input, { backgroundColor: backgroundElem, color: text }, password.length > 0 && styles.inputWithEye]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="At least 8 characters"
                    placeholderTextColor={placeholder}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    returnKeyType="next"
                    ref={passwordRef}
                    onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                    blurOnSubmit={false}
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
                          color={rule.met ? success : placeholder}
                        />
                        <Text style={[styles.checkerText, { color: rule.met ? success : placeholder }]}>
                          {rule.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: textSecondary }]}>Confirm password</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={[styles.input, { backgroundColor: backgroundElem, color: text }, passwordConfirmation.length > 0 && styles.inputWithEye]}
                    value={passwordConfirmation}
                    onChangeText={setPasswordConfirmation}
                    placeholder="Repeat your password"
                    placeholderTextColor={placeholder}
                    secureTextEntry={!showConfirm}
                    autoCapitalize="none"
                    returnKeyType="next"
                    ref={confirmPasswordRef}
                    onSubmitEditing={() => streetRef.current?.focus()}
                    blurOnSubmit={false}
                    keyboardAppearance={colorScheme}
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
                        color={textSecondary}
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
                        color={password === passwordConfirmation ? success : danger}
                      />
                      <Text style={[styles.checkerText, { color: password === passwordConfirmation ? success : danger }]}>
                        {password === passwordConfirmation ? 'Passwords match' : 'Passwords do not match'}
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              {/* Address (locked to Zamboanga City) */}
              <View style={styles.field}>
                <Text style={[styles.label, { color: textSecondary }]}>
                  Address
                </Text>

                {/* Locked city label */}
                <View style={[styles.input, { backgroundColor: backgroundElem, justifyContent: 'center', marginBottom: 8 }]}>
                  <Text style={{ color: textSecondary, fontSize: 13, fontFamily: 'JetBrainsMono_400Regular' }}>
                    City of Zamboanga, Zamboanga Peninsula
                  </Text>
                </View>

                {/* Barangay picker */}
                <TouchableOpacity
                  style={[styles.input, { backgroundColor: backgroundElem, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, opacity: loadingBarangays ? 0.6 : 1 }]}
                  onPress={() => { setPickerSearch(''); setShowBarangayPicker(true); }}
                  disabled={loadingBarangays}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: barangayCode ? text : placeholder, fontFamily: 'JetBrainsMono_400Regular', fontSize: 15 }}>
                    {loadingBarangays
                      ? 'Loading barangays…'
                      : (barangays.find(b => b.code === barangayCode)?.name ?? 'Select barangay')}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={textSecondary} />
                </TouchableOpacity>

                {/* Street input */}
                <TextInput
                  style={[styles.input, { backgroundColor: backgroundElem, color: text }]}
                  value={streetInput}
                  onChangeText={setStreetInput}
                  placeholder="Street / House No."
                  placeholderTextColor={placeholder}
                  autoCapitalize="words"
                  returnKeyType="done"
                  ref={streetRef}
                  onSubmitEditing={handleSignup}
                  keyboardAppearance={colorScheme}
                  underlineColorAndroid="transparent"
                  maxLength={255}
                />
              </View>

              {/* Terms Checkbox */}
              <View style={styles.termsRow}>
                <Pressable
                  style={[styles.checkbox, { borderColor: border, backgroundColor: card }, agreedToTerms && { borderColor: primary, backgroundColor: primary }]}
                  onPress={() => {
                    if (!agreedToTerms) {
                      setShowTerms(true);
                    } else {
                      setAgreedToTerms(false);
                    }
                  }}
                >
                  {agreedToTerms && <Ionicons name="checkmark" size={14} color={actionText} />}
                </Pressable>
                <Text style={[styles.termsText, { color: textSecondary }]}>
                  I agree to the{' '}
                  <Text style={[styles.termsLink, { color: primary }]} onPress={() => setShowTerms(true)}>
                    Terms & Conditions and Privacy Policy
                  </Text>
                </Text>
              </View>

              <Pressable
                style={[styles.button, { backgroundColor: actionBg }, (!agreedToTerms || loading) && styles.buttonDisabled]}
                onPress={handleSignup}
                disabled={!agreedToTerms || loading}
              >
                {loading ? (
                  <ActivityIndicator color={actionText} />
                ) : (
                  <Text style={[styles.buttonText, { color: actionText }]}>Create Account</Text>
                )}
              </Pressable>

              <Pressable onPress={() => router.back()} style={styles.linkRow}>
                <Text style={[styles.linkText, { color: textSecondary }]}>
                  Already have an account?{' '}
                  <Text style={[styles.linkBold, { color: primary }]}>Log in</Text>
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
          <View style={[pickerStyles.sheet, { backgroundColor: card }]}>
            <View style={[pickerStyles.header, { borderBottomColor: border }]}>
              <Text style={[pickerStyles.headerText, { color: text }]}>Select Barangay</Text>
              <Pressable onPress={() => setShowBarangayPicker(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={textSecondary} />
              </Pressable>
            </View>

            <TextInput
              style={[pickerStyles.search, { borderColor: border, backgroundColor: backgroundElem, color: text }]}
              value={pickerSearch}
              onChangeText={setPickerSearch}
              placeholder="Search barangay…"
              placeholderTextColor={placeholder}
              autoFocus
            />

            {loadingBarangays ? (
              <ActivityIndicator color={primary} style={{ padding: 24 }} />
            ) : (
              <FlatList
                keyboardShouldPersistTaps="handled"
                data={barangays.filter(b => b.name.toLowerCase().includes(pickerSearch.toLowerCase()))}
                keyExtractor={item => item.code}
                renderItem={({ item }: { item: AddressBarangay }) => (
                  <Pressable
                    style={[pickerStyles.item, { borderBottomColor: border }]}
                    onPress={() => { setBarangayCode(item.code); setShowBarangayPicker(false); }}
                  >
                    <Text style={[pickerStyles.itemText, { color: text }]}>{item.name}</Text>
                  </Pressable>
                )}
                ListEmptyComponent={
                  <View style={pickerStyles.empty}>
                    <Text style={[pickerStyles.emptyText, { color: textSecondary }]}>No results found</Text>
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
        <View style={[styles.termsRoot, { backgroundColor: background }]}>
          <View style={[styles.termsHeader, { borderBottomColor: border }]}>
            <Text style={[styles.termsTitle, { color: text }]}>Terms & Privacy Policy</Text>
            <Pressable onPress={() => setShowTerms(false)} hitSlop={8} style={styles.termsCloseBtn}>
              <Ionicons name="close" size={24} color={text} />
            </Pressable>
          </View>
          <ScrollView style={styles.termsScroll} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            <Text style={[styles.termsContentTitle, { color: text }]}>Data Collection and Usage</Text>
            <Text style={[styles.termsContentText, { color: textSecondary }]}>
              Aviso is designed to map and log road hazards in real-time. To make this possible, our application collects specific data from your edge device while you ride:
              {'\n\n'}• <Text style={{ fontFamily: 'JetBrainsMono_600SemiBold' }}>Camera Data:</Text> Our system processes real-time video feeds from your device to detect road hazards (such as potholes, road excavations, barriers, traffic lights, and traffic signs).
              {'\n\n'}• <Text style={{ fontFamily: 'JetBrainsMono_600SemiBold' }}>Hazard Logs:</Text> When a hazard is detected, the system records the hazard type, timestamp, and a confidence score. This data is synced to our secure cloud servers to update the global Admin Hazard Logs.
            </Text>

            <Text style={[styles.termsContentTitle, { color: text }]}>Location Tracking</Text>
            <Text style={[styles.termsContentText, { color: textSecondary }]}>
              • <Text style={{ fontFamily: 'JetBrainsMono_600SemiBold' }}>GPS Data:</Text> To accurately map detected hazards, Aviso requires continuous access to your device's location services (GPS) while the app is actively running or tracking a ride.
              {'\n\n'}• <Text style={{ fontFamily: 'JetBrainsMono_600SemiBold' }}>Privacy Guarantee:</Text> Your location data is strictly tied to detected road hazards. We do not use your location data to track your personal whereabouts for commercial purposes or share it with third-party advertisers.
            </Text>

            <Text style={[styles.termsContentTitle, { color: text }]}>User Accounts and Security</Text>
            <Text style={[styles.termsContentText, { color: textSecondary }]}>
              • You are responsible for maintaining the confidentiality of your account credentials (email, username, and password).
              {'\n\n'}• You agree to provide accurate and complete information during signup.
              {'\n\n'}• Administrative accounts hold the right to suspend or delete your account if you violate these terms or tamper with the application. For your privacy, administrators cannot view or modify your password.
            </Text>

            <Text style={[styles.termsContentTitle, { color: text }]}>Safety Disclaimer</Text>
            <Text style={[styles.termsContentText, { color: textSecondary }]}>
              • <Text style={{ fontFamily: 'JetBrainsMono_600SemiBold' }}>Not a Substitute for Safe Driving:</Text> Aviso is a supplementary warning system using text-to-speech (TTS) to announce hazards. It is not a substitute for attentive driving. You must always keep your eyes on the road and obey all traffic laws.
              {'\n\n'}• We are not liable for any accidents, damages, or injuries that occur while using the application.
            </Text>

            <Text style={[styles.termsContentTitle, { color: text }]}>Changes to These Terms</Text>
            <Text style={[styles.termsContentText, { color: textSecondary }]}>
              We reserve the right to update these Terms and Conditions at any time. Continued use of the application after changes implies your acceptance of the updated terms.
            </Text>
          </ScrollView>
          <View style={[styles.termsFooter, { borderTopColor: border, backgroundColor: background }]}>
            <Pressable
              style={[styles.button, { backgroundColor: actionBg }]}
              onPress={() => {
                setAgreedToTerms(true);
                setShowTerms(false);
              }}
            >
              <Text style={[styles.buttonText, { color: actionText }]}>I Understand and Agree</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet:      { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '75%' },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  headerText: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 16 },
  search:     { margin: 12, padding: 10, borderRadius: 8, borderWidth: 1, fontFamily: 'JetBrainsMono_400Regular', fontSize: 14 },
  item:       { padding: 16, borderBottomWidth: 1 },
  itemText:   { fontFamily: 'JetBrainsMono_400Regular', fontSize: 15 },
  empty:      { padding: 24, alignItems: 'center' },
  emptyText:  { fontFamily: 'JetBrainsMono_400Regular' },
});

const styles = StyleSheet.create({
  root: { flex: 1 },
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
    letterSpacing: -0.5,
  },
  tagline: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 13,
    marginTop: 4,
  },
  form: {},
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  field: { marginBottom: 14 },
  label: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 13,
    marginBottom: 8,
  },
  optional: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 12,
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    fontFamily: 'JetBrainsMono_400Regular',
    minHeight: 50,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: 8,
  },
  phonePrefix: {
    borderRadius: 12,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 50,
  },
  phonePrefixText: {
    fontFamily: 'JetBrainsMono_600SemiBold',
    fontSize: 15,
  },
  phoneInput: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    fontFamily: 'JetBrainsMono_400Regular',
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
    borderRadius: 32,
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: {
    fontFamily: 'JetBrainsMono_600SemiBold',
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
  },
  linkBold: {
    fontFamily: 'JetBrainsMono_600SemiBold',
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  termsText: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  termsLink: {
    fontFamily: 'JetBrainsMono_600SemiBold',
  },
  termsRoot: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 44 : 20,
  },
  termsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  termsTitle: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 18,
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
    marginTop: 24,
    marginBottom: 12,
  },
  termsContentText: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 14,
    lineHeight: 22,
  },
  termsFooter: {
    padding: 20,
    borderTopWidth: 1,
  },
});
