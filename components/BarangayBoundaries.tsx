import Mapbox from '@rnmapbox/maps';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { useMap } from '@/components/ui/map';
import barangayData from '@/assets/data/zamboanga-city-barangays.json';

// Simplified PSA/NAMRIA barangay outlines (PSGC 2023), bundled so they show
// offline. The server resolves hazards to the same barangay codes.
const BARANGAYS = barangayData as FeatureCollection<
  Polygon | MultiPolygon,
  { psgc_code: string; name: string }
>;

type BarangayBoundariesProps = {
  visible: boolean;
};

/** Barangay outlines + names. Render inside <Map>, before hazard layers so they draw on top. */
export function BarangayBoundaries({ visible }: BarangayBoundariesProps) {
  const { theme } = useMap();
  const isDark = theme === 'dark';
  const visibility = visible ? 'visible' : 'none';

  return (
    <Mapbox.ShapeSource id="barangay-boundaries-source" shape={BARANGAYS}>
      <Mapbox.FillLayer
        id="barangay-boundaries-fill"
        style={{
          visibility,
          fillColor: isDark ? '#94A3B8' : '#64748B',
          fillOpacity: 0.12,
        }}
      />
      <Mapbox.LineLayer
        id="barangay-boundaries-line"
        style={{
          visibility,
          lineColor: isDark ? '#CBD5E1' : '#334155',
          lineWidth: ['interpolate', ['linear'], ['zoom'], 10, 0.8, 15, 2],
          lineOpacity: 0.85,
          lineJoin: 'round',
        }}
      />
      <Mapbox.SymbolLayer
        id="barangay-boundaries-label"
        minZoomLevel={12.5}
        style={{
          visibility,
          textField: ['get', 'name'],
          textSize: ['interpolate', ['linear'], ['zoom'], 12.5, 11, 16, 14],
          textColor: isDark ? '#F1F5F9' : '#1E293B',
          textHaloColor: isDark ? '#0F172A' : '#FFFFFF',
          textHaloWidth: 1.5,
          textMaxWidth: 8,
        }}
      />
    </Mapbox.ShapeSource>
  );
}
