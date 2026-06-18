import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#11181C',
    textSecondary: '#6B7280',
    background: '#FFFFFF',
    backgroundElement: '#F0F4F8',
    tint: '#0274DF',
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: '#0274DF',
    primary: '#0274DF',
    accent: '#208AEF',
    danger: '#EF4444',
    success: '#22C55E',
    warning: '#F59E0B',
    border: '#E5E7EB',
    card: '#FFFFFF',
    tabBar: '#FFFFFF',
  },
  dark: {
    text: '#ECEDEE',
    textSecondary: '#9BA1A6',
    background: '#0F172A',
    backgroundElement: '#1E2328',
    tint: '#208AEF',
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: '#208AEF',
    primary: '#0274DF',
    accent: '#208AEF',
    danger: '#EF4444',
    success: '#22C55E',
    warning: '#F59E0B',
    border: '#374151',
    card: '#1E2328',
    tabBar: '#1E2328',
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 32,
};
