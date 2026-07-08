import { useThemePreferenceContext } from '@/contexts/theme-context';

export function useColorScheme() {
  return useThemePreferenceContext().colorScheme;
}
