import { createContext, useContext, type ReactNode } from 'react';
import { useTrip as useTripState } from '@/hooks/use-trip';

type TripContextValue = ReturnType<typeof useTripState>;

const TripContext = createContext<TripContextValue | null>(null);

export function TripProvider({ children }: { children: ReactNode }) {
  const value = useTripState();
  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTripContext(): TripContextValue {
  const ctx = useContext(TripContext);
  if (!ctx) {
    throw new Error('useTripContext must be used within a TripProvider');
  }
  return ctx;
}
