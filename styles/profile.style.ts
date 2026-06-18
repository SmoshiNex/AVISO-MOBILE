import { StyleSheet } from 'react-native';
import { Spacing, Radius } from '@/constants/theme';

export const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
  headerTitle: { fontSize: 24, fontWeight: '800', marginBottom: Spacing.lg },
  avatarSection: { alignItems: 'center', marginBottom: Spacing.lg, gap: 8 },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '800' },
  fullName: { fontSize: 20, fontWeight: '700' },
  username: { fontSize: 14 },
  infoCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: 0,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
  },
  infoContent: { flex: 1, gap: 2 },
  infoLabel: { fontSize: 12, fontWeight: '600' },
  infoValue: { fontSize: 14 },
  divider: { height: 1, marginHorizontal: -Spacing.md },
  navCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: 12,
    minHeight: 52,
  },
  navLabel: { flex: 1, fontSize: 15, fontWeight: '500' },
});
