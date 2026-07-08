import { createContext, useContext, type ReactNode } from 'react';
import { useThemePreference } from '@/hooks/use-theme-preference';

type ThemePreferenceContextValue = ReturnType<typeof useThemePreference>;

const ThemePreferenceContext = createContext<ThemePreferenceContextValue | null>(null);

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const value = useThemePreference();
  return <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>;
}

export function useThemePreferenceContext(): ThemePreferenceContextValue {
  const ctx = useContext(ThemePreferenceContext);
  if (!ctx) {
    throw new Error('useThemePreferenceContext must be used within a ThemePreferenceProvider');
  }
  return ctx;
}
