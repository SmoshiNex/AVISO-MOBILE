import { useMemo } from 'react';
import Mapbox from '@rnmapbox/maps';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { useMap } from '@/components/ui/map';
import barangayData from '@/assets/data/zamboanga-city-barangays.json';

type BarangayProperties = { psgc_code: string; name: string; hazard_count?: number };

// Simplified PSA/NAMRIA barangay outlines (PSGC 2023), bundled so they show
// offline. The server resolves hazards to the same barangay codes.
const BARANGAYS = barangayData as FeatureCollection<Polygon | MultiPolygon, BarangayProperties>;

type BarangayBoundariesProps = {
  visible: boolean;
  /** Active hazards (community map list); each barangay's label shows how many it has. */
  hazards?: readonly { barangay_code?: string | null }[];
};

/** Barangay outlines + names. Render inside <Map>, before hazard layers so they draw on top. */
export function BarangayBoundaries({ visible, hazards = [] }: BarangayBoundariesProps) {
  const { theme } = useMap();
  const isDark = theme === 'dark';
  const visibility = visible ? 'visible' : 'none';

  // Outlines with each barangay's active-hazard count attached, so the label can show it.
  const shape = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of hazards) {
      if (h.barangay_code) counts.set(h.barangay_code, (counts.get(h.barangay_code) ?? 0) + 1);
    }
    return {
      ...BARANGAYS,
      features: BARANGAYS.features.map((f) => ({
        ...f,
        properties: { ...f.properties, hazard_count: counts.get(f.properties.psgc_code) ?? 0 },
      })),
    };
  }, [hazards]);

  return (
    <Mapbox.ShapeSource id="barangay-boundaries-source" shape={shape}>
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
          // Name, plus "3 active hazards" in red underneath when there are any.
          textField: [
            'case',
            ['>', ['get', 'hazard_count'], 0],
            [
              'format',
              ['get', 'name'], {},
              '\n', {},
              ['concat', ['to-string', ['get', 'hazard_count']],
                ['case', ['==', ['get', 'hazard_count'], 1], ' active hazard', ' active hazards']],
              { 'text-color': isDark ? '#F87171' : '#DC2626', 'font-scale': 0.9 },
            ],
            ['get', 'name'],
          ],
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
