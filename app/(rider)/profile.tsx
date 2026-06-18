import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { toast } from 'sonner-native';
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
  const background = useThemeColor({}, 'background');
  const backgroundElement = useThemeColor({}, 'backgroundElement');
  const card = useThemeColor({}, 'card');
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const primary = useThemeColor({}, 'primary');
  const danger = useThemeColor({}, 'danger');
  const border = useThemeColor({}, 'border');

  const [user, setUser] = useState<User | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync('rider_user').then((json) => {
      if (json) setUser(JSON.parse(json));
    });
  }, []);

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

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <Text style={[styles.headerTitle, { color: text }]}>Profile</Text>

        {/* Avatar + name */}
        <View style={styles.avatarSection}>
          <View style={[styles.avatarCircle, { backgroundColor: primary }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={[styles.fullName, { color: text }]}>
            {user ? `${user.first_name} ${user.last_name}` : 'â€”'}
          </Text>
          {user?.username && (
            <Text style={[styles.username, { color: textSecondary }]}>@{user.username}</Text>
          )}
        </View>

        {/* Info card */}
        <View style={[styles.infoCard, { backgroundColor: card, borderColor: border }]}>
          <InfoRow icon="mail-outline" label="Email" value={user?.email} textColor={text} labelColor={textSecondary} />
          <View style={[styles.divider, { backgroundColor: border }]} />
          <InfoRow icon="call-outline" label="Contact" value={user?.contact_number} textColor={text} labelColor={textSecondary} />
          {user?.address && (
            <>
              <View style={[styles.divider, { backgroundColor: border }]} />
              <InfoRow icon="location-outline" label="Address" value={user.address} textColor={text} labelColor={textSecondary} />
            </>
          )}
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
                <Ionicons
                  name={row.icon as any}
                  size={20}
                  color={row.danger ? danger : textSecondary}
                />
                <Text style={[styles.navLabel, { color: row.danger ? danger : text }]}>
                  {row.label}
                </Text>
                {!row.danger && (
                  <Ionicons name="chevron-forward" size={16} color={textSecondary} />
                )}
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Bottom padding for floating tab bar */}
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({
  icon,
  label,
  value,
  textColor,
  labelColor,
}: {
  icon: string;
  label: string;
  value?: string;
  textColor: string;
  labelColor: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon as any} size={16} color={labelColor} />
      <View style={styles.infoContent}>
        <Text style={[styles.infoLabel, { color: labelColor }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: textColor }]}>{value ?? 'â€”'}</Text>
      </View>
    </View>
  );
}

