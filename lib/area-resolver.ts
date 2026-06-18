import { AREAS, type Area } from '@/constants/hazards';

// Approximate bounding boxes for Zamboanga City barangays/areas
// Format: [minLat, maxLat, minLng, maxLng]
const AREA_BOUNDS: Record<Area, [number, number, number, number]> = {
  'City Proper':   [6.895, 6.925, 122.055, 122.085],
  'Calarian':      [6.870, 6.900, 122.040, 122.070],
  'San Roque':     [6.905, 6.935, 122.060, 122.090],
  'Sta Maria':     [6.925, 6.950, 122.050, 122.080],
  'Tugbungan':     [6.935, 6.965, 122.040, 122.070],
  'Talon-Talon':   [6.845, 6.880, 122.035, 122.065],
  'Pasonanca':     [6.940, 6.975, 122.060, 122.095],
  'Putik':         [6.880, 6.915, 122.025, 122.055],
  'Tumaga':        [6.910, 6.940, 122.025, 122.060],
  'Lunzuran':      [6.855, 6.885, 122.060, 122.090],
  'Baliwasan':     [6.890, 6.915, 122.070, 122.100],
  'San Jose Gusu': [6.870, 6.905, 122.080, 122.110],
};

/**
 * Resolves GPS coordinates to one of the 12 Zamboanga City areas.
 * Falls back to 'City Proper' when coordinates don't match any known area.
 */
export function resolveArea(latitude: number, longitude: number): Area {
  for (const [area, [minLat, maxLat, minLng, maxLng]] of Object.entries(AREA_BOUNDS)) {
    if (
      latitude >= minLat && latitude <= maxLat &&
      longitude >= minLng && longitude <= maxLng
    ) {
      return area as Area;
    }
  }
  return 'City Proper';
}

/**
 * Checks whether coordinates are within Zamboanga City's general bounds.
 * Useful for validating GPS readings before syncing.
 */
export function isInZamboangaCity(latitude: number, longitude: number): boolean {
  return (
    latitude >= 6.840 && latitude <= 6.980 &&
    longitude >= 122.020 && longitude <= 122.120
  );
}

export { AREAS };
