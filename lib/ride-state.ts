import { useSyncExternalStore } from 'react';

/**
 * Whether a ride is running right now, readable outside the rider screens
 * (the app-update banner lives in the root layout, above TripProvider).
 * The rider layout reports it; nothing that must not interrupt a ride
 * (like restarting the app for an update) should happen while it is true.
 */
let rideActive = false;
const listeners = new Set<() => void>();

export function setRideActive(active: boolean): void {
  if (rideActive === active) return;
  rideActive = active;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRideActive(): boolean {
  return useSyncExternalStore(subscribe, () => rideActive);
}
