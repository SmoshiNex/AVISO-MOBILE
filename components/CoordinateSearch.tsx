import { useEffect, useId, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MapMarker, useMap } from '@/components/ui/map';
import { formatCoordinates, parseCoordinates } from '@/lib/coordinates';

type CoordinateSearchProps = {
  open: boolean;
  onClose: () => void;
  /** Distance from the top of the screen (below the status bar and stat cards). */
  top: number;
};

type Pin = { latitude: number; longitude: number };

/**
 * Coordinate search for the map: type "6.92314, 122.08251" (from My Detections or Google Maps),
 * tap Go, and the map flies there and drops a pin. Render inside <Map>.
 */
export function CoordinateSearch({ open, onClose, top }: CoordinateSearchProps) {
  const { cameraRef, isLoaded, registerOverlay, unregisterOverlay } = useMap();
  const overlayId = useId();
  const [query, setQuery] = useState('');
  const [pin, setPin] = useState<Pin | null>(null);

  const parsed = useMemo(() => parseCoordinates(query), [query]);

  const message =
    !query.trim() ? null
    : parsed.kind === 'coordinates'
      ? parsed.outsideCity ? 'Outside Zamboanga City' : null
      : 'Not valid coordinates. Example: 6.92314, 122.08251';

  const panel = useMemo(() => {
    if (!open) return null;

    const go = () => {
      if (parsed.kind !== 'coordinates') return;
      setPin({ latitude: parsed.latitude, longitude: parsed.longitude });
      setQuery(formatCoordinates(parsed.latitude, parsed.longitude));
      cameraRef.current?.flyTo({ center: [parsed.longitude, parsed.latitude], zoom: 17, duration: 1500 });
    };

    const close = () => {
      setPin(null);
      setQuery('');
      onClose();
    };

    return (
      <View style={[styles.panel, { top }]}>
        <View style={styles.row}>
          <Ionicons name="locate-outline" size={18} color="#444" />
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Coordinates, e.g. 6.92314, 122.08251"
            placeholderTextColor="#9CA3AF"
            keyboardType="numbers-and-punctuation"
            autoFocus
            returnKeyType="go"
            onSubmitEditing={go}
            accessibilityLabel="Coordinates to go to"
          />
          <TouchableOpacity
            style={[styles.goBtn, parsed.kind !== 'coordinates' && styles.goBtnDisabled]}
            onPress={go}
            disabled={parsed.kind !== 'coordinates'}
            accessibilityLabel="Go to these coordinates"
          >
            <Text style={styles.goText}>Go</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={close} hitSlop={8} accessibilityLabel="Close coordinate search">
            <Ionicons name="close" size={20} color="#444" />
          </TouchableOpacity>
        </View>
        {message && (
          <Text style={[styles.message, parsed.kind !== 'coordinates' && styles.error]}>{message}</Text>
        )}
      </View>
    );
  }, [open, query, parsed, message, top, cameraRef, onClose]);

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
      label={formatCoordinates(pin.latitude, pin.longitude)}
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
});
