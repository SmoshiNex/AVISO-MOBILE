import { useCallback, useState } from 'react';
import Toast from 'react-native-toast-message';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/use-theme-color';
import { api } from '@/lib/api-client';
import type { User } from '@/types';
import { styles } from '@/styles/profile.style';

type NavRow = {
  icon: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
};

export default function ProfileScreen() {
  const background        = useThemeColor({}, 'background');
  const card              = useThemeColor({}, 'card');
  const text              = useThemeColor({}, 'text');
  const textSecondary     = useThemeColor({}, 'textSecondary');
  const primary           = useThemeColor({}, 'primary');
  const actionBg          = useThemeColor({}, 'actionBg');
  const danger            = useThemeColor({}, 'danger');
  const border            = useThemeColor({}, 'border');

  const [user,            setUser]            = useState<User | null>(null);
  const [loggingOut,      setLoggingOut]      = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

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
      icon: 'person-outline',
      label: 'Personal Information',
      onPress: () => router.push('/(rider)/personal-information'),
    },
    {
      icon: 'warning-outline',
      label: 'My Detections',
      onPress: () => router.push('/(rider)/hazard-logs'),
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

          <Text style={[styles.username, { color: textSecondary }]}>@{user?.username ?? '—'}</Text>
        </View>

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
