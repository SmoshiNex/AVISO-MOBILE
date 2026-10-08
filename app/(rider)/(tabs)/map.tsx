import { useEffect, useState, useCallback, useRef, useMemo, useId } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from 'react-native';

import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Map, MapMarker, MapRoute, MapUserLocation, MapControls, MapHeatmap, useMap } from '@/components/ui/map';
import { Ionicons } from '@expo/vector-icons';
import Mapbox from '@rnmapbox/maps';
import Toast from 'react-native-toast-message';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useTripContext } from '@/contexts/trip-context';
import { BarangayBoundaries } from '@/components/BarangayBoundaries';
import { getHazardLogs } from '@/lib/local-db';
import { api } from '@/lib/api-client';
import { HAZARD_COLORS } from '@/constants/hazards';
import type { LocalHazardLog, HazardLog } from '@/types';
import { styles } from '@/styles/map.style';

const HAZARD_STAT_GROUPS = [
  { label: 'Pothole',       types: ['Pothole'],                                                          icon: 'alert-circle-outline'  },
  { label: 'Excavation',    types: ['Road Excavation'],                                                  icon: 'construct-outline'     },
  { label: 'Barrier',       types: ['Road Barrier'],                                                     icon: 'stop-circle-outline'   },
] as const;

type SelectedHazard = { source: 'local'; data: LocalHazardLog } | { source: 'api'; data: HazardLog };

// Mapbox uses [longitude, latitude] order (GeoJSON convention)
const ZAMBOANGA_CENTER: [number, number] = [122.0790, 6.9214];
const ZAMBOANGA_ZOOM = 12;

function MarkerDot({ color }: { color: string }) {
  return (
    <View
      style={{
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: color,
        borderWidth: 3,
        borderColor: '#fff',
        elevation: 4,
      }}
    />
  );
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();

  const card = useThemeColor({}, 'card');
  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const primary = useThemeColor({}, 'primary');
  const danger = useThemeColor({}, 'danger');
  const success = useThemeColor({}, 'success');
  const border = useThemeColor({}, 'border');

  const { trip: activeTrip, isActive, startTrip, endTrip } = useTripContext();

  const [liveHazards, setLiveHazards] = useState<LocalHazardLog[]>([]);
  const [backendHazards, setBackendHazards] = useState<HazardLog[]>([]);
  const [mapTheme, setMapTheme] = useState<"system" | "light" | "dark">("system");

  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showBarangays, setShowBarangays] = useState(true);
  const [currentZoom, setCurrentZoom] = useState(14);

  const heatmapData = useMemo(() => {
    return [...backendHazards, ...liveHazards]
      .filter(h => ["Pothole", "Road Excavation", "Road Barrier"].includes(h.type))
      .map(h => ({
        latitude: typeof h.latitude === 'number' ? h.latitude : parseFloat(h.latitude as string),
        longitude: typeof h.longitude === 'number' ? h.longitude : parseFloat(h.longitude as string),
        weight: typeof h.confidence === 'number' ? h.confidence : parseFloat(h.confidence as string)
      }));
  }, [backendHazards, liveHazards, showHeatmap]);

  const markerFeatures = useMemo(() => {
    return {
      type: 'FeatureCollection' as const,
      features: [
        ...liveHazards.map(h => ({
          type: 'Feature' as const,
          id: `live-${h.id}`,
          geometry: { type: 'Point' as const, coordinates: [h.longitude, h.latitude] },
          properties: { id: `live-${h.id}`, color: HAZARD_COLORS[h.type] ?? primary }
        })),
        ...backendHazards.map(h => ({
          type: 'Feature' as const,
          id: `api-${h.id}`,
          geometry: { type: 'Point' as const, coordinates: [parseFloat(h.longitude), parseFloat(h.latitude)] },
          properties: { id: `api-${h.id}`, color: HAZARD_COLORS[h.type] ?? primary }
        }))
      ]
    };
  }, [liveHazards, backendHazards, primary]);

  const [visibleBounds, setVisibleBounds] = useState<{
    minLat: number; maxLat: number; minLng: number; maxLng: number;
  } | null>(null);

  const [selectedHazard, setSelectedHazard] = useState<SelectedHazard | null>(null);
  const isFeaturePressRef = useRef(false);

  useEffect(() => {
    const load = () => getHazardLogs().then(setLiveHazards);
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchBackendHazards = async () => {
      try {
        const data = await api.get<HazardLog[]>('/rider/hazards');
        setBackendHazards(data);
      } catch {}
    };
    fetchBackendHazards();
    const interval = setInterval(fetchBackendHazards, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleStartRide = useCallback(async () => {
    Toast.show({ type: 'info', text1: 'Starting ride...' });
    try {
      await startTrip();
      Toast.show({ type: 'success', text1: 'Ride started — drive safe!' });
    } catch {
      Toast.show({ type: 'error', text1: 'Could not start. Check your connection.' });
    }
  }, [startTrip]);

  const handleEndRide = useCallback(async () => {
    Toast.show({ type: 'info', text1: 'Ending ride...' });
    try {
      await endTrip();
      Toast.show({ type: 'success', text1: 'Ride ended and saved!' });
    } catch {
      Toast.show({ type: 'error', text1: 'Could not end ride.' });
    }
  }, [endTrip]);

  // ── LIVE MODE ───────────────────────────────────────────────────────────────
  const liveCenter: [number, number] = activeTrip?.current_lat && activeTrip?.current_lng
    ? [activeTrip.current_lng, activeTrip.current_lat]
    : ZAMBOANGA_CENTER;
  const liveZoom = activeTrip?.current_lat && activeTrip?.current_lng ? 15 : ZAMBOANGA_ZOOM;

  // GeoJSON order: [lng, lat]
  const routeCoords: [number, number][] =
    activeTrip?.route_points?.map((p) => [p.lng, p.lat] as [number, number]) ?? [];

  return (
    <View style={styles.container}>
      <Map
        center={liveCenter}
        zoom={liveZoom}
        theme={mapTheme}
        followUserLocation={isActive}
        onCameraChanged={(state) => {
          setCurrentZoom(state.properties.zoom);
          const { ne, sw } = state.properties.bounds;
          setVisibleBounds({
            minLat: Math.min(sw[1], ne[1]),
            maxLat: Math.max(sw[1], ne[1]),
            minLng: Math.min(sw[0], ne[0]),
            maxLng: Math.max(sw[0], ne[0]),
          });
        }}
        onPress={() => {
          if (!isFeaturePressRef.current) setSelectedHazard(null);
        }}
      >
        <MapUserLocation showHeading />
        <MapControls position="top-right" showLocate showZoom className="mt-[80px]" />
        
        <MapHeatmap data={heatmapData} visible={showHeatmap} />
        <MapFeatureToggles 
          showHeatmap={showHeatmap} 
          setShowHeatmap={setShowHeatmap} 
          showBarangays={showBarangays}
          setShowBarangays={setShowBarangays}
          mapTheme={mapTheme}
          setMapTheme={setMapTheme}
          insets={insets} 
        />

        {routeCoords.length > 1 && (
          <MapRoute coordinates={routeCoords} color={primary} width={3} />
        )}

        {activeTrip?.start_lat && activeTrip.start_lng && (
          <MapMarker
            longitude={activeTrip.start_lng}
            latitude={activeTrip.start_lat}
            label="Start"
          >
            <MarkerDot color="#22C55E" />
          </MapMarker>
        )}

        <BarangayBoundaries visible={showBarangays} />

        {/* Render markers natively for 60fps performance */}
        <Mapbox.ShapeSource 
          id="hazards-markers-source" 
          shape={markerFeatures} 
          onPress={(e) => {
            isFeaturePressRef.current = true;
            const feature = e.features[0];
            const id = feature?.properties?.id;
            if (!id) return;
            if (id.startsWith('live-')) {
              const data = liveHazards.find(h => `live-${h.id}` === id);
              if (data) setSelectedHazard({ source: 'local', data });
            } else {
              const data = backendHazards.find(h => `api-${h.id}` === id);
              if (data) setSelectedHazard({ source: 'api', data });
            }
            setTimeout(() => { isFeaturePressRef.current = false; }, 100);
          }}
        >
          <Mapbox.CircleLayer
            id="hazards-markers-layer"
            minZoomLevel={12.5}
            style={{
              visibility: showHeatmap ? 'none' : 'visible',
              circleRadius: 6,
              circleColor: ['get', 'color'],
              circleStrokeWidth: 2,
              circleStrokeColor: 'white',
              circlePitchAlignment: 'map',
            }}
          />
        </Mapbox.ShapeSource>
      </Map>

      {/* Per-type hazard stat cards */}
      {(liveHazards.length + backendHazards.length) > 0 && (
        <View style={[styles.statsPanel, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsScroll}>
            {HAZARD_STAT_GROUPS.map((group) => {
              const count = [...liveHazards, ...backendHazards].filter((h) => {
                if (!(group.types as readonly string[]).includes(h.type)) return false;
                if (!visibleBounds) return true;
                const lat = typeof h.latitude === 'number' ? h.latitude : parseFloat(h.latitude as string);
                const lng = typeof h.longitude === 'number' ? h.longitude : parseFloat(h.longitude as string);
                return (
                  lat >= visibleBounds.minLat && lat <= visibleBounds.maxLat &&
                  lng >= visibleBounds.minLng && lng <= visibleBounds.maxLng
                );
              }).length;
              return (
                <View key={group.label} style={styles.statCard}>
                  <View style={styles.statCardTop}>
                    <Ionicons name={group.icon as any} size={14} color={HAZARD_COLORS[group.types[0]] ?? primary} />
                    <Text style={styles.statCardCount}>{count}</Text>
                  </View>
                  <Text style={styles.statCardLabel}>{group.label}</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {selectedHazard && (() => {
        const d = selectedHazard.data;
        const lat  = typeof d.latitude   === 'number' ? d.latitude   : parseFloat(d.latitude  as string);
        const lng  = typeof d.longitude  === 'number' ? d.longitude  : parseFloat(d.longitude as string);
        const conf = typeof d.confidence === 'number' ? d.confidence : parseFloat(d.confidence as string);
        const confDisplay = conf <= 1 ? `${Math.round(conf * 100)}%` : `${Math.round(conf)}%`;
        return (
          <View style={[styles.hazardDetailPanel, { backgroundColor: card, borderColor: border, bottom: 160 + insets.bottom }]}>
            <View style={styles.hazardDetailHeader}>
              <View style={[styles.hazardDetailDot, { backgroundColor: HAZARD_COLORS[d.type] ?? primary }]} />
              <Text style={[styles.hazardDetailType, { color: text }]}>{d.type}</Text>
              <TouchableOpacity onPress={() => setSelectedHazard(null)} style={styles.hazardDetailClose}>
                <Ionicons name="close" size={18} color={textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.hazardDetailRow}>
              <Ionicons name="time-outline" size={13} color={textSecondary} />
              <Text style={[styles.hazardDetailText, { color: textSecondary }]}>
                {new Date(d.detected_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            {d.area ? (
              <View style={styles.hazardDetailRow}>
                <Ionicons name="location-outline" size={13} color={textSecondary} />
                <Text style={[styles.hazardDetailText, { color: textSecondary }]} numberOfLines={1}>{d.area}</Text>
              </View>
            ) : null}
            <View style={styles.hazardDetailRow}>
              <Ionicons name="navigate-outline" size={13} color={textSecondary} />
              <Text style={[styles.hazardDetailText, { color: textSecondary }]}>{lat.toFixed(5)}, {lng.toFixed(5)}</Text>
            </View>
            <View style={styles.hazardDetailRow}>
              <Ionicons name="stats-chart-outline" size={13} color={textSecondary} />
              <Text style={[styles.hazardDetailText, { color: textSecondary }]}>Confidence: {confDisplay}</Text>
            </View>
            {d.distance != null && (
              <View style={styles.hazardDetailRow}>
                <Ionicons name="resize-outline" size={13} color={textSecondary} />
                <Text style={[styles.hazardDetailText, { color: textSecondary }]}>Distance: {d.distance} m</Text>
              </View>
            )}
          </View>
        );
      })()}

      {/* Start/End Ride controls */}
      <SafeAreaView edges={['bottom']} style={styles.rideControls} pointerEvents="box-none">
        {isActive ? (
          <TouchableOpacity
            style={[styles.rideBtn, { backgroundColor: danger }]}
            onPress={handleEndRide}
          >
            <Ionicons name="stop-circle-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.rideBtnText}>End Ride</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.rideBtn, { backgroundColor: success }]}
            onPress={handleStartRide}
          >
            <Ionicons name="play-circle-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.rideBtnText}>Start Ride</Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>
    </View>
  );
}

function MapFeatureToggles({ showHeatmap, setShowHeatmap, showBarangays, setShowBarangays, mapTheme, setMapTheme, insets }: any) {
  const { cameraRef, isLoaded, registerOverlay, unregisterOverlay, theme: currentTheme } = useMap();
  const [is3D, setIs3D] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const rotationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const overlayId = useId();

  const toggle3D = useCallback(() => {
    const next = !is3D;
    setIs3D(next);
    if (cameraRef?.current) {
      cameraRef.current.easeTo({ pitch: next ? 60 : 0, duration: 1000 });
    }
  }, [is3D, cameraRef]);

  const toggleRotation = useCallback(() => {
    const next = !isRotating;
    setIsRotating(next);
    if (next) {
      let bearing = 0;
      const rotate = () => {
        bearing += 90;
        cameraRef?.current?.easeTo({ heading: bearing, duration: 2000, easing: "linear" });
      };
      rotate();
      rotationRef.current = setInterval(rotate, 2000);
    } else {
      if (rotationRef.current) clearInterval(rotationRef.current);
      cameraRef?.current?.easeTo({ heading: 0, duration: 1000 });
    }
  }, [isRotating, cameraRef]);

  const controlsElement = useMemo(() => (
    <View style={[styles.featureToggles, { paddingTop: insets.top + 240 }]} pointerEvents="box-none">
      <TouchableOpacity
        style={[styles.featureBtn, mapTheme !== "system" && styles.featureBtnActive]}
        onPress={() => {
          if (mapTheme === "system") setMapTheme("dark");
          else if (mapTheme === "dark") setMapTheme("light");
          else setMapTheme("system");
        }}
      >
        <Ionicons 
          name={mapTheme === "system" ? "contrast-outline" : mapTheme === "dark" ? "moon-outline" : "sunny-outline"} 
          size={20} 
          color={mapTheme !== "system" ? "#fff" : "#444"} 
        />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.featureBtn, showHeatmap && styles.featureBtnActive]}
        onPress={() => setShowHeatmap(!showHeatmap)}
      >
        <Ionicons name="flame-outline" size={20} color={showHeatmap ? "#fff" : "#444"} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.featureBtn, showBarangays && styles.featureBtnActive]}
        onPress={() => setShowBarangays(!showBarangays)}
        accessibilityLabel="Toggle barangay boundaries"
      >
        <Ionicons name="map-outline" size={20} color={showBarangays ? "#fff" : "#444"} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.featureBtn, is3D && styles.featureBtnActive]}
        onPress={toggle3D}
      >
        <Ionicons name="cube-outline" size={20} color={is3D ? "#fff" : "#444"} />
      </TouchableOpacity>
      {is3D && (
        <TouchableOpacity
          style={[styles.featureBtn, isRotating && styles.featureBtnActive]}
          onPress={toggleRotation}
        >
          <Ionicons name="refresh-outline" size={20} color={isRotating ? "#fff" : "#444"} />
        </TouchableOpacity>
      )}
    </View>
  ), [insets.top, showHeatmap, showBarangays, is3D, isRotating, setShowHeatmap, setShowBarangays, toggle3D, toggleRotation]);

  useEffect(() => {
    if (isLoaded) {
      registerOverlay(overlayId, controlsElement);
    }
    return () => {
      unregisterOverlay(overlayId);
    };
  }, [isLoaded, overlayId, registerOverlay, unregisterOverlay, controlsElement]);

  return null;
}
