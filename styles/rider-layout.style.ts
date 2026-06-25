import { StyleSheet } from 'react-native';
import { Radius } from '@/constants/theme';

export const styles = StyleSheet.create({
  tabBarWrapper: {
    position: 'absolute',
    left: 24,
    right: 24,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: Radius.pill,
    padding: 6,
    gap: 4,
    overflow: 'hidden',
    elevation: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
  },
  tabItem: {
    width: 52,
    height: 44,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
