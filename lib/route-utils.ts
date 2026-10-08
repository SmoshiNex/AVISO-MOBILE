import type { LocalTrip } from '@/types';

export type RoutePoint = { lat: number; lng: number };

/** Great-circle distance in meters. */
export function metersBetween(a: RoutePoint, b: RoutePoint): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function routeDistanceKm(points: RoutePoint[]): number {
  let m = 0;
  for (let i = 1; i < points.length; i++) m += metersBetween(points[i - 1], points[i]);
  return m / 1000;
}

/**
 * Drops points closer than `minMeters` to the last kept one (GPS jitter while stopped), always
 * keeping the first and last. Keeps the route's shape while making long rides cheap to draw.
 */
export function simplifyRoute(points: RoutePoint[], minMeters = 5): RoutePoint[] {
  if (points.length <= 2) return points;
  const kept: RoutePoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    if (metersBetween(kept[kept.length - 1], points[i]) >= minMeters) kept.push(points[i]);
  }
  kept.push(points[points.length - 1]);
  return kept;
}

/** Route of a trip including its start and end points, ignoring empty (0,0) fixes. */
export function tripRoute(trip: LocalTrip): RoutePoint[] {
  const valid = (p?: RoutePoint | null): p is RoutePoint => !!p && !(p.lat === 0 && p.lng === 0);
  const pts = trip.route_points.filter(valid);
  const start = trip.start_lat != null && trip.start_lng != null ? { lat: trip.start_lat, lng: trip.start_lng } : null;
  const end = trip.end_lat != null && trip.end_lng != null ? { lat: trip.end_lat, lng: trip.end_lng } : null;
  if (valid(start) && (pts.length === 0 || metersBetween(pts[0], start) > 1)) pts.unshift(start);
  if (valid(end) && (pts.length === 0 || metersBetween(pts[pts.length - 1], end) > 1)) pts.push(end);
  return pts;
}

/** Map camera bounds ([lng, lat]) around a route. */
export function routeBounds(points: RoutePoint[]): { ne: [number, number]; sw: [number, number] } | null {
  if (points.length === 0) return null;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  // A ride that never moved still needs a visible area (~100 m).
  const pad = 0.0005;
  if (maxLat - minLat < pad) { minLat -= pad; maxLat += pad; }
  if (maxLng - minLng < pad) { minLng -= pad; maxLng += pad; }
  return { ne: [maxLng, maxLat], sw: [minLng, minLat] };
}

export function formatDuration(trip: LocalTrip): string {
  if (!trip.started_at || !trip.ended_at) return 'In progress';
  const mins = Math.round((new Date(trip.ended_at).getTime() - new Date(trip.started_at).getTime()) / 60000);
  if (mins < 1) return '< 1 min';
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

/** Short ride label for a detection: "Ride · Oct 8, 4:51 PM". */
export function rideLabel(trip: LocalTrip): string {
  const d = new Date(trip.started_at);
  return `Ride · ${d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}, ${formatTime(trip.started_at)}`;
}
