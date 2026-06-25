import { useCallback, useState } from 'react';
import Toast from 'react-native-toast-message';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/use-theme-color';
import { api } from '@/lib/api-client';
import { sanitizeText } from '@/lib/sanitize';
import { useAddressCascade } from '@/hooks/use-address-cascade';
import type { User, AddressBarangay } from '@/types';
import { styles } from '@/styles/profile.style';

const ZAMBOANGA_PROVINCE_ID = '09317';
const ZAMBOANGA_CITY_ID     = '0931700';
const ZAMBOANGA_REGION_ID   = '09';

type NavRow = {
  icon: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
};

export default function ProfileScreen() {
  const background        = useThemeColor({}, 'background');
  const backgroundElement = useThemeColor({}, 'backgroundElement');
  const card              = useThemeColor({}, 'card');
  const text              = useThemeColor({}, 'text');
  const textSecondary     = useThemeColor({}, 'textSecondary');
  const primary           = useThemeColor({}, 'primary');
  const actionBg          = useThemeColor({}, 'actionBg');
  const danger            = useThemeColor({}, 'danger');
  const border            = useThemeColor({}, 'border');

  const [user,           setUser]           = useState<User | null>(null);
  const [loggingOut,     setLoggingOut]     = useState(false);
  const [uploadingAvatar,setUploadingAvatar]= useState(false);

  // Username editing
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput,   setUsernameInput]   = useState('');
  const [savingUsername,  setSavingUsername]  = useState(false);

  // Address editing
  const [editingAddress,   setEditingAddress]   = useState(false);
  const [streetInput,      setStreetInput]      = useState('');
  const [selBarangayCode,  setSelBarangayCode]  = useState('');
  const [savingAddress,    setSavingAddress]    = useState(false);
  const [showBarangayPicker, setShowBarangayPicker] = useState(false);
  const [pickerSearch,     setPickerSearch]     = useState('');

  const { barangays, loading: loadingBarangays } = useAddressCascade();

  useFocusEffect(
    useCallback(() => {
      SecureStore.getItemAsync('rider_user').then((json) => {
        if (json) setUser(JSON.parse(json));
      });
    }, []),
  );

  const handlePickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Toast.show({ type: 'error', text1: 'Permission Required', text2: 'AVISO needs access to your photos to set a profile picture.' });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const formData = new FormData();
    formData.append('avatar', {
      uri: asset.uri,
      name: 'avatar.jpg',
      type: 'image/jpeg',
    } as any);

    setUploadingAvatar(true);
    try {
      const res: any = await api.postForm('/rider/profile/avatar', formData);
      const updatedUser = { ...user!, avatar_url: res.avatar_url };
      setUser(updatedUser);
      await SecureStore.setItemAsync('rider_user', JSON.stringify(updatedUser));
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Upload Failed', text2: err?.message ?? 'Could not upload photo. Try again.' });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleStartEditUsername = () => {
    setUsernameInput(user?.username ?? '');
    setEditingUsername(true);
  };

  const handleSaveUsername = async () => {
    const trimmed = usernameInput.trim();
    if (trimmed.length < 3) {
      Toast.show({ type: 'error', text1: 'Invalid Username', text2: 'Username must be at least 3 characters.' });
      return;
    }
    setSavingUsername(true);
    try {
      const res: any = await api.patch('/rider/profile', { username: trimmed });
      const updatedUser = { ...user!, username: res.username };
      setUser(updatedUser);
      await SecureStore.setItemAsync('rider_user', JSON.stringify(updatedUser));
      await SecureStore.setItemAsync('rider_code', res.username);
      setEditingUsername(false);
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err?.message ?? 'Could not update username.' });
    } finally {
      setSavingUsername(false);
    }
  };

  const handleCancelEditUsername = () => {
    setEditingUsername(false);
    setUsernameInput('');
  };

  const handleStartEditAddress = () => {
    setStreetInput(user?.street ?? '');
    setSelBarangayCode(user?.barangay_id ?? '');
    setEditingAddress(true);
  };

  const handleSaveAddress = async () => {
    setSavingAddress(true);
    try {
      const street = sanitizeText(streetInput);
      const res: any = await api.patch('/rider/profile', {
        street:      street || null,
        province_id: ZAMBOANGA_PROVINCE_ID,
        city_id:     ZAMBOANGA_CITY_ID,
        barangay_id: selBarangayCode || null,
        region_id:   ZAMBOANGA_REGION_ID,
      });
      const updatedUser = {
        ...user!,
        street:      res.street,
        province_id: res.province_id,
        city_id:     res.city_id,
        barangay_id: res.barangay_id,
        region_id:   res.region_id,
        address:     res.address,
      };
      setUser(updatedUser);
      await SecureStore.setItemAsync('rider_user', JSON.stringify(updatedUser));
      setEditingAddress(false);
      Toast.show({ type: 'success', text1: 'Address updated!' });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err?.message ?? 'Could not update address.' });
    } finally {
      setSavingAddress(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          try {
            await api.delete('/rider/auth/logout').catch(() => {});
            await Promise.all([
              SecureStore.deleteItemAsync('rider_token'),
              SecureStore.deleteItemAsync('rider_user'),
              SecureStore.deleteItemAsync('rider_code'),
            ]);
            router.replace('/(auth)/login');
          } finally {
            setLoggingOut(false);
          }
        },
      },
    ]);
  };

  const navRows: NavRow[] = [
    {
      icon: 'people-outline',
      label: 'Emergency Contacts',
      onPress: () => router.push('/(rider)/emergency-contacts'),
    },
    {
      icon: 'map-outline',
      label: 'Trip History',
      onPress: () => router.push('/(rider)/trip-history'),
    },
    {
      icon: 'log-out-outline',
      label: loggingOut ? 'Logging out...' : 'Log Out',
      onPress: handleLogout,
      danger: true,
    },
  ];

  const initials = user
    ? `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase()
    : 'R';

  const currentBarangayName = barangays.find(b => b.code === selBarangayCode)?.name ?? '';

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.headerTitle, { color: text }]}>Profile</Text>

        {/* Avatar + name */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={handlePickAvatar} style={styles.avatarWrapper} activeOpacity={0.8}>
            {user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} contentFit="cover" />
            ) : (
              <View style={[styles.avatarCircle, { backgroundColor: actionBg }]}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            )}
            {uploadingAvatar && (
              <View style={styles.avatarUploadOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
            {!uploadingAvatar && (
              <View style={[styles.avatarEditBadge, { backgroundColor: primary }]}>
                <Ionicons name="camera" size={13} color="#fff" />
              </View>
            )}
          </TouchableOpacity>

          <Text style={[styles.fullName, { color: text }]}>
            {user ? `${user.first_name} ${user.last_name}` : '—'}
          </Text>

          {editingUsername ? (
            <View style={styles.usernameEditContainer}>
              <TextInput
                style={[styles.usernameInput, { backgroundColor: backgroundElement, color: text, borderColor: border }]}
                value={usernameInput}
                onChangeText={setUsernameInput}
                placeholder="Enter username"
                placeholderTextColor={textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                maxLength={30}
              />
              <View style={styles.usernameActions}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: border }]}
                  onPress={handleCancelEditUsername}
                  disabled={savingUsername}
                >
                  <Text style={[styles.cancelBtnText, { color: textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: primary, opacity: savingUsername ? 0.6 : 1 }]}
                  onPress={handleSaveUsername}
                  disabled={savingUsername}
                >
                  {savingUsername
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.saveBtnText}>Save</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.usernameRow} onPress={handleStartEditUsername}>
              <Text style={[styles.username, { color: textSecondary }]}>@{user?.username ?? '—'}</Text>
              <Ionicons name="pencil-outline" size={13} color={textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Info card */}
        <View style={[styles.infoCard, { backgroundColor: card, borderColor: border }]}>
          <InfoRow icon="mail-outline" label="Email" value={user?.email} textColor={text} labelColor={textSecondary} />
          <View style={[styles.divider, { backgroundColor: border }]} />
          <InfoRow icon="call-outline" label="Contact" value={user?.contact_number} textColor={text} labelColor={textSecondary} />
          <View style={[styles.divider, { backgroundColor: border }]} />

          {/* Address row — tappable to edit */}
          {!editingAddress ? (
            <TouchableOpacity style={styles.infoRow} onPress={handleStartEditAddress} activeOpacity={0.7}>
              <Ionicons name="location-outline" size={16} color={textSecondary} />
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: textSecondary }]}>Address</Text>
                <Text style={[styles.infoValue, { color: text }]}>{user?.address ?? '—'}</Text>
              </View>
              <Ionicons name="pencil-outline" size={14} color={textSecondary} />
            </TouchableOpacity>
          ) : (
            <View style={{ padding: 12, gap: 10 }}>
              {/* Locked city label */}
              <View style={{ backgroundColor: backgroundElement, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: border }}>
                <Text style={{ color: textSecondary, fontSize: 13 }}>City of Zamboanga, Zamboanga Peninsula</Text>
              </View>

              {/* Barangay picker */}
              <Text style={[styles.infoLabel, { color: textSecondary }]}>Barangay</Text>
              <TouchableOpacity
                style={{ backgroundColor: backgroundElement, borderColor: border, borderWidth: 1, borderRadius: 8, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', opacity: loadingBarangays ? 0.6 : 1 }}
                onPress={() => { setPickerSearch(''); setShowBarangayPicker(true); }}
                disabled={loadingBarangays}
              >
                <Text style={{ color: selBarangayCode ? text : textSecondary }}>
                  {loadingBarangays
                    ? 'Loading barangays…'
                    : currentBarangayName || (selBarangayCode || 'Select barangay')}
                </Text>
                <Ionicons name="chevron-down" size={16} color={textSecondary} />
              </TouchableOpacity>

              {/* Street input */}
              <Text style={[styles.infoLabel, { color: textSecondary }]}>Street / House No. (Optional)</Text>
              <TextInput
                style={{ backgroundColor: backgroundElement, borderColor: border, borderWidth: 1, borderRadius: 8, padding: 12, color: text }}
                value={streetInput}
                onChangeText={setStreetInput}
                placeholder="e.g. 123 Rizal St., Purok 5"
                placeholderTextColor={textSecondary}
                maxLength={255}
              />

              {/* Save / Cancel */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <TouchableOpacity
                  style={{ flex: 1, borderRadius: 8, borderWidth: 1, borderColor: border, padding: 12, alignItems: 'center' }}
                  onPress={() => setEditingAddress(false)}
                  disabled={savingAddress}
                >
                  <Text style={{ color: textSecondary }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, borderRadius: 8, backgroundColor: primary, padding: 12, alignItems: 'center', opacity: savingAddress ? 0.6 : 1 }}
                  onPress={handleSaveAddress}
                  disabled={savingAddress}
                >
                  {savingAddress
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={{ color: '#fff', fontWeight: '600' }}>Save</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Barangay picker modal */}
        <Modal
          visible={showBarangayPicker}
          animationType="slide"
          transparent
          onRequestClose={() => setShowBarangayPicker(false)}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: background, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '75%' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: border }}>
                <Text style={{ fontWeight: '700', fontSize: 16, color: text }}>Select Barangay</Text>
                <TouchableOpacity onPress={() => setShowBarangayPicker(false)}>
                  <Ionicons name="close" size={22} color={textSecondary} />
                </TouchableOpacity>
              </View>

              <TextInput
                style={{ margin: 12, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: border, backgroundColor: backgroundElement, color: text }}
                value={pickerSearch}
                onChangeText={setPickerSearch}
                placeholder="Search barangay…"
                placeholderTextColor={textSecondary}
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
                    <TouchableOpacity
                      style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: border }}
                      onPress={() => {
                        setSelBarangayCode(item.code);
                        setShowBarangayPicker(false);
                      }}
                    >
                      <Text style={{ color: text }}>{item.name}</Text>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={
                    <View style={{ padding: 24, alignItems: 'center' }}>
                      <Text style={{ color: textSecondary }}>No results found</Text>
                    </View>
                  }
                />
              )}
            </View>
          </View>
        </Modal>

        {/* Navigation rows */}
        <View style={[styles.navCard, { backgroundColor: card, borderColor: border }]}>
          {navRows.map((row, index) => (
            <View key={row.label}>
              {index > 0 && <View style={[styles.divider, { backgroundColor: border }]} />}
              <TouchableOpacity
                style={styles.navRow}
                onPress={row.onPress}
                disabled={loggingOut && row.danger}
                activeOpacity={0.7}
              >
                <Ionicons name={row.icon as any} size={20} color={row.danger ? danger : textSecondary} />
                <Text style={[styles.navLabel, { color: row.danger ? danger : text }]}>{row.label}</Text>
                {!row.danger && <Ionicons name="chevron-forward" size={16} color={textSecondary} />}
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({
  icon, label, value, textColor, labelColor,
}: {
  icon: string; label: string; value?: string; textColor: string; labelColor: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon as any} size={16} color={labelColor} />
      <View style={styles.infoContent}>
        <Text style={[styles.infoLabel, { color: labelColor }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: textColor }]}>{value ?? '—'}</Text>
      </View>
    </View>
  );
}
