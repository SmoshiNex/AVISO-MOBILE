import { useEffect, useId, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MapMarker, useMap } from '@/components/ui/map';
import { formatCoordinates, parseCoordinates } from '@/lib/coordinates';
import { searchPlaces, type PlaceResult } from '@/lib/place-search';

type CoordinateSearchProps = {
  open: boolean;
  onClose: () => void;
  /** Distance from the top of the screen (below the status bar and stat cards). */
  top: number;
};

type Pin = { latitude: number; longitude: number; label: string };

/**
 * Map search: a place name ("Pasonanca", limited to Zamboanga City) shows suggestions,
 * or coordinates such as "6.92314, 122.08251" (from My Detections or Google Maps) go there
 * directly. Either way the map flies there and drops a pin. Render inside <Map>.
 */
export function CoordinateSearch({ open, onClose, top }: CoordinateSearchProps) {
  const { cameraRef, isLoaded, registerOverlay, unregisterOverlay } = useMap();
  const overlayId = useId();
  const [query, setQuery] = useState('');
  const [pin, setPin] = useState<Pin | null>(null);
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  // The text of a place just picked, so picking it doesn't search again.
  const [picked, setPicked] = useState<string | null>(null);

  const parsed = useMemo(() => parseCoordinates(query), [query]);

  // Place names: ask Mapbox after the rider stops typing for a moment.
  useEffect(() => {
    if (!open || parsed.kind !== 'not-coordinates' || query.trim().length < 2 || query === picked) {
      setPlaces([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      searchPlaces(query, controller.signal)
        .then(setPlaces)
        .catch(() => setPlaces([]))
        .finally(() => setSearching(false));
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, parsed.kind, picked]);

  const message =
    !query.trim() || query === picked ? null
    : parsed.kind === 'coordinates'
      ? parsed.outsideCity ? 'Outside Zamboanga City' : null
    : parsed.kind === 'invalid'
      ? 'Not valid coordinates. Example: 6.92314, 122.08251'
    : searching ? 'Searching…'
    : places.length === 0 && query.trim().length >= 2 ? 'No places found in Zamboanga City'
    : null;

  const panel = useMemo(() => {
    if (!open) return null;

    const flyTo = (latitude: number, longitude: number, zoom: number, label: string) => {
      setPin({ latitude, longitude, label });
      cameraRef.current?.flyTo({ center: [longitude, latitude], zoom, duration: 1500 });
    };

    const goToPlace = (place: PlaceResult) => {
      setPicked(place.name);
      setQuery(place.name);
      setPlaces([]);
      flyTo(place.latitude, place.longitude, 15, place.name);
    };

    const go = () => {
      if (parsed.kind === 'coordinates') {
        const label = formatCoordinates(parsed.latitude, parsed.longitude);
        setQuery(label);
        flyTo(parsed.latitude, parsed.longitude, 17, label);
      } else if (places.length > 0) {
        goToPlace(places[0]);
      }
    };

    const close = () => {
      setPin(null);
      setQuery('');
      setPicked(null);
      setPlaces([]);
      onClose();
    };

    const canGo = parsed.kind === 'coordinates' || places.length > 0;

    return (
      <View style={[styles.panel, { top }]}>
        <View style={styles.row}>
          <Ionicons name="search-outline" size={18} color="#444" />
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Search a place or 6.92314, 122.08251"
            placeholderTextColor="#9CA3AF"
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={go}
            accessibilityLabel="Search a place or coordinates"
          />
          <TouchableOpacity
            style={[styles.goBtn, !canGo && styles.goBtnDisabled]}
            onPress={go}
            disabled={!canGo}
            accessibilityLabel="Go"
          >
            <Text style={styles.goText}>Go</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={close} hitSlop={8} accessibilityLabel="Close search">
            <Ionicons name="close" size={20} color="#444" />
          </TouchableOpacity>
        </View>
        {message && (
          <Text style={[styles.message, parsed.kind === 'invalid' && styles.error]}>{message}</Text>
        )}
        {places.length > 0 && (
          <View style={styles.results}>
            {places.map((place) => (
              <TouchableOpacity
                key={place.id}
                style={styles.resultRow}
                onPress={() => goToPlace(place)}
                accessibilityLabel={`Go to ${place.placeName}`}
              >
                <Ionicons name="location-outline" size={16} color="#6B7280" style={styles.resultIcon} />
                <View style={styles.resultTextBox}>
                  <Text style={styles.resultName} numberOfLines={1}>{place.name}</Text>
                  <Text style={styles.resultAddress} numberOfLines={1}>{place.placeName}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  }, [open, query, parsed, places, message, top, cameraRef, onClose]);

  useEffect(() => {
    if (isLoaded && panel) registerOverlay(overlayId, panel);
    else unregisterOverlay(overlayId);
    return () => unregisterOverlay(overlayId);
  }, [isLoaded, panel, overlayId, registerOverlay, unregisterOverlay]);

  if (!pin) return null;
  return (
    <MapMarker
      latitude={pin.latitude}
      longitude={pin.longitude}
      label={pin.label}
      anchor={{ x: 0.5, y: 1 }}
      allowOverlap
    >
      <Ionicons name="location" size={36} color="#2563EB" />
    </MapMarker>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    zIndex: 20,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, fontSize: 14, color: '#111827', paddingVertical: 6 },
  goBtn: { backgroundColor: '#2563EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  goBtnDisabled: { opacity: 0.4 },
  goText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  message: { fontSize: 12, color: '#6B7280', marginTop: 4, marginLeft: 26 },
  error: { color: '#DC2626' },
  results: { marginTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB' },
  resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  resultIcon: { marginRight: 10 },
  resultTextBox: { flex: 1 },
  resultName: { fontSize: 14, color: '#111827', fontWeight: '500' },
  resultAddress: { fontSize: 12, color: '#6B7280', marginTop: 1 },
});
