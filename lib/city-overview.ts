import { api } from '@/lib/api-client';
import type { CityOverview } from '@/types';

// Last good answer, so the home screen keeps showing numbers when offline.
let lastOverview: CityOverview | null = null;

export function getCachedCityOverview(): CityOverview | null {
  return lastOverview;
}

/** City-wide hazard numbers (same as the admin dashboard). Falls back to the last copy. */
export async function fetchCityOverview(): Promise<CityOverview | null> {
  try {
    lastOverview = await api.get<CityOverview>('/rider/dashboard');
  } catch {
    // Offline or server busy: keep the last copy.
  }
  return lastOverview;
}
