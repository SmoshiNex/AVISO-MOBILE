import { useCallback, useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import { api } from '@/lib/api-client';
import {
  saveTrip,
  updateTripLocation,
  endTrip as dbEndTrip,
  getActiveTrip,
} from '@/lib/local-db';
import type { LocalTrip } from '@/types';

const LOCATION_INTERVAL_MS = 3000;

export function useTrip() {
  const [trip, setTrip] = useState<LocalTrip | null>(null);
  const [isActive, setIsActive] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const routePointsRef = useRef<Array<{ lat: number; lng: number }>>([]);

  // Resume any in-progress trip on mount
  useEffect(() => {
    getActiveTrip().then((active) => {
      if (active) {
        setTrip(active);
        setIsActive(true);
        routePointsRef.current = active.route_points ?? [];
      }
    });
  }, []);

  const startTrip = useCallback(async () => {
    const riderCode = await SecureStore.getItemAsync('rider_code') ?? '';
    const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const { latitude, longitude } = location.coords;

    const startedAt = new Date().toISOString();

    // Save locally first
    const localId = await saveTrip({
      rider_code: riderCode,
      start_lat: latitude,
      start_lng: longitude,
      current_lat: latitude,
      current_lng: longitude,
      route_points: [{ lat: latitude, lng: longitude }],
      status: 'active',
      started_at: startedAt,
      total_hazards: 0,
      synced: false,
    });

    routePointsRef.current = [{ lat: latitude, lng: longitude }];

    const newTrip: LocalTrip = {
      id: localId,
      rider_code: riderCode,
      start_lat: latitude,
      start_lng: longitude,
      current_lat: latitude,
      current_lng: longitude,
      route_points: routePointsRef.current,
      status: 'active',
      started_at: startedAt,
      total_hazards: 0,
      synced: false,
    };

    setTrip(newTrip);
    setIsActive(true);

    // POST to backend (non-blocking)
    api.post('/rider/trips', {
      rider_code: riderCode,
      latitude,
      longitude,
    }).then((response: any) => {
      if (response?.id) {
        // Store remote_id for location updates
        setTrip((prev) => prev ? { ...prev, remote_id: response.id } : prev);
      }
    }).catch(() => {});
  }, []);

  const endTrip = useCallback(async () => {
    if (!trip) return;

    const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const { latitude, longitude } = location.coords;
    const endedAt = new Date().toISOString();

    await dbEndTrip(trip.id, latitude, longitude, endedAt);
    setTrip(null);
    setIsActive(false);
    routePointsRef.current = [];

    if (trip.remote_id) {
      api.put(`/rider/trips/${trip.remote_id}/end`, { latitude, longitude }).catch(() => {});
    }
  }, [trip]);

  // Location polling while trip is active
  useEffect(() => {
    if (!isActive || !trip) return;

    intervalRef.current = setInterval(async () => {
      try {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const { latitude, longitude } = location.coords;

        routePointsRef.current = [...routePointsRef.current, { lat: latitude, lng: longitude }];

        await updateTripLocation(trip.id, latitude, longitude, routePointsRef.current);
        setTrip((prev) =>
          prev ? { ...prev, current_lat: latitude, current_lng: longitude, route_points: routePointsRef.current } : prev
        );

        if (trip.remote_id) {
          api.put(`/rider/trips/${trip.remote_id}/location`, { latitude, longitude }).catch(() => {});
        }
      } catch {
        // Silent — location update failures are non-critical
      }
    }, LOCATION_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, trip?.id, trip?.remote_id]);

  return { trip, isActive, startTrip, endTrip };
}
