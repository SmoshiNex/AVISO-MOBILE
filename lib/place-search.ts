// Place search for the map (Mapbox geocoding), limited to Zamboanga City —
// the same search the admin Live Map uses.

export type PlaceResult = {
  id: string;
  name: string;
  /** Full address line, e.g. "Pasonanca, Zamboanga City, Zamboanga del Sur, Philippines" */
  placeName: string;
  latitude: number;
  longitude: number;
};

// Zamboanga City, roughly: minLng, minLat, maxLng, maxLat.
const CITY_BBOX = '121.9,6.8,122.3,7.2';

type GeocodingResponse = {
  features?: { id: string; text: string; place_name: string; center: [number, number] }[];
};

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  const token = process.env.EXPO_PUBLIC_MAPBOX_API_KEY;
  if (!token || !query.trim()) return [];

  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query.trim())}.json` +
    `?bbox=${CITY_BBOX}&limit=5&access_token=${token}`;

  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as GeocodingResponse;

  return (data.features ?? []).map((f) => ({
    id: f.id,
    name: f.text,
    placeName: f.place_name,
    longitude: f.center[0],
    latitude: f.center[1],
  }));
}
