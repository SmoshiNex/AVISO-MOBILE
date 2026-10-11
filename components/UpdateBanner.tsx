import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

/** Space kept free for the tab bar so the banner never covers it. */
const TAB_BAR_CLEARANCE = 72;

interface UpdateBannerProps {
  onRestart: () => void;
  onLater: () => void;
}

/** "Update ready" card with Restart now / Later, shown above the tab bar. */
export function UpdateBanner({ onRestart, onLater }: UpdateBannerProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.card, { bottom: insets.bottom + TAB_BAR_CLEARANCE }]} accessibilityRole="alert">
      <Ionicons name="cloud-download-outline" size={20} color="#fff" />
      <View style={styles.texts}>
        <Text style={styles.title}>Update ready</Text>
        <Text style={styles.subtitle}>Restart AVISO to use the new version.</Text>
      </View>
      <Pressable onPress={onLater} style={styles.later} accessibilityLabel="Install the update later" hitSlop={8}>
        <Text style={styles.laterText}>Later</Text>
      </Pressable>
      <Pressable onPress={onRestart} style={styles.restart} accessibilityLabel="Restart now to install the update">
        <Text style={styles.restartText}>Restart now</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#111827',
    zIndex: 999,
    elevation: 8,
  },
  texts: { flex: 1 },
  title: { color: '#fff', fontSize: 14, fontWeight: '600' },
  subtitle: { color: '#D1D5DB', fontSize: 12, marginTop: 2 },
  later: { paddingVertical: 8, paddingHorizontal: 6 },
  laterText: { color: '#D1D5DB', fontSize: 13, fontWeight: '500' },
  restart: { backgroundColor: '#fff', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  restartText: { color: '#111827', fontSize: 13, fontWeight: '600' },
});
