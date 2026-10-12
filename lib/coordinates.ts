// Reads coordinates typed into the map search, e.g. "6.92314, 122.08251"
// (copied from My Detections or Google Maps) or "6.92314 122.08251".
// The same rules live in the admin site (aviso-main/resources/js/lib/coordinates.ts).

export type ParsedCoordinates =
  | { kind: 'coordinates'; latitude: number; longitude: number; outsideCity: boolean }
  | { kind: 'invalid' }
  | { kind: 'not-coordinates' };

// Zamboanga City, roughly.
const CITY_BOUNDS = { minLat: 6.8, maxLat: 7.2, minLng: 121.9, maxLng: 122.3 };

const TWO_NUMBERS = /^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/;

export function parseCoordinates(text: string): ParsedCoordinates {
  const match = TWO_NUMBERS.exec(text);
  if (!match) return { kind: 'not-coordinates' };

  let latitude = Number(match[1]);
  let longitude = Number(match[2]);

  // Typed the other way round ("122.08251, 6.92314"): a latitude can never pass 90.
  if (Math.abs(latitude) > 90 && Math.abs(longitude) <= 90) {
    [latitude, longitude] = [longitude, latitude];
  }

  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return { kind: 'invalid' };

  const outsideCity =
    latitude < CITY_BOUNDS.minLat ||
    latitude > CITY_BOUNDS.maxLat ||
    longitude < CITY_BOUNDS.minLng ||
    longitude > CITY_BOUNDS.maxLng;

  return { kind: 'coordinates', latitude, longitude, outsideCity };
}

export function formatCoordinates(latitude: number, longitude: number): string {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}
