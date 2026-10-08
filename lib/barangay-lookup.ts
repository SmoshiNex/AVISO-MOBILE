import type { FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import barangayData from '@/assets/data/zamboanga-city-barangays.json';

/**
 * Finds the Zamboanga City barangay for a GPS point, offline, using the same boundary file the
 * maps draw. Used to label trip start/end places ("Tetuan → Sta. Maria").
 */

export const OUTSIDE_CITY = 'Outside Zamboanga City';

type Area = {
  name: string;
  polygons: Position[][][]; // each polygon: outer ring + holes, [lng, lat]
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
};

let areas: Area[] | null = null;

function loadAreas(): Area[] {
  if (areas) return areas;
  const data = barangayData as unknown as FeatureCollection<Polygon | MultiPolygon, { name: string }>;
  areas = data.features.map((f) => {
    const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const poly of polygons) {
      for (const [lng, lat] of poly[0]) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
    return { name: f.properties.name, polygons, minLng, maxLng, minLat, maxLat };
  });
  return areas;
}

/** Ray casting: is (lng, lat) inside this ring? */
function inRing(lng: number, lat: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Barangay name for a point, or null outside the city. */
export function barangayAt(lat: number, lng: number): string | null {
  for (const a of loadAreas()) {
    if (lng < a.minLng || lng > a.maxLng || lat < a.minLat || lat > a.maxLat) continue;
    for (const poly of a.polygons) {
      if (inRing(lng, lat, poly[0]) && !poly.slice(1).some((hole) => inRing(lng, lat, hole))) return a.name;
    }
  }
  return null;
}

/** Display label for a point: the barangay, "Outside Zamboanga City", or "Unknown" without GPS. */
export function placeLabel(lat?: number | null, lng?: number | null): string {
  if (lat == null || lng == null || (lat === 0 && lng === 0)) return 'Unknown';
  return barangayAt(lat, lng) ?? OUTSIDE_CITY;
}
