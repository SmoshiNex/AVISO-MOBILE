import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import { api } from '@/lib/api-client';
import {
  saveTrip,
  appendTripPoint,
  endTrip as dbEndTrip,
  getActiveTrip,
  setTripRemoteId,
  markTripSynced,
  closeStaleActiveTrips,
} from '@/lib/local-db';
import type { LocalTrip } from '@/types';

const LOCATION_INTERVAL_MS = 3000;

// Captures when this JS module first loaded (= current app session start).
// Trips started before this moment survived a crash — don't auto-resume them.
const SESSION_START = Date.now();

export function useTrip() {
  const [trip, setTrip] = useState<LocalTrip | null>(null);
  const [isActive, setIsActive] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const routePointsRef = useRef<Array<{ lat: number; lng: number }>>([]);

  // Resume any in-progress trip on mount — but only if it started in this session.
  // Trips left open by a previous session (crash, force-close) are ended at their last saved
  // point, so they show in history and get synced instead of staying open forever.
  useEffect(() => {
    closeStaleActiveTrips(new Date(SESSION_START).toISOString())
      .catch(() => 0)
      .then(() => getActiveTrip())
      .then((active) => {
      if (!active) return;
      const startedAt = new Date(active.started_at).getTime();
      if (startedAt < SESSION_START) return; // stale crash survivor — ignore
      setTrip(active);
      setIsActive(true);
      routePointsRef.current = active.route_points ?? [];
      });
  }, []);

  const startTrip = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Location permission is required. Please enable it in Settings.');
    }
    if (Platform.OS === 'android') {
      await Location.enableNetworkProviderAsync().catch(() => {});
    }

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

    // POST to backend (non-blocking). The server wraps the trip in `data`. If this fails
    // (no signal), the background sync creates the trip on the server after the ride ends.
    api.post('/rider/trips', {
      latitude,
      longitude,
      started_at: startedAt,
    }).then(async (response: any) => {
      const remoteId: number | undefined = response?.data?.id ?? response?.id;
      if (!remoteId) return;
      await setTripRemoteId(localId, remoteId);
      setTrip((prev) => (prev && prev.id === localId ? { ...prev, remote_id: remoteId } : prev));
    }).catch(() => {});
  }, []);

  const endTrip = useCallback(async () => {
    if (!trip) return;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Location permission is required. Please enable it in Settings.');
    }
    if (Platform.OS === 'android') {
      await Location.enableNetworkProviderAsync().catch(() => {});
    }

    const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const { latitude, longitude } = location.coords;
    const endedAt = new Date().toISOString();

    await dbEndTrip(trip.id, latitude, longitude, endedAt);
    const routePoints = routePointsRef.current;
    setTrip(null);
    setIsActive(false);
    routePointsRef.current = [];

    // Unsynced on failure: the background sync retries with the same times and route.
    if (trip.remote_id) {
      const remoteId = trip.remote_id;
      api.put(`/rider/trips/${remoteId}/end`, {
        latitude,
        longitude,
        ended_at: endedAt,
        route_points: routePoints,
      })
        .then(() => markTripSynced(trip.id, remoteId))
        .catch(() => {});
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

        await appendTripPoint(trip.id, latitude, longitude, new Date().toISOString());
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
