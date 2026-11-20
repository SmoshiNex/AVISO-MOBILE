import predictionFile from '@/assets/data/aviso_prediction.json';
import roadCellsFile from '@/assets/data/aviso_risk_road_cells.json';
import { distanceMeters, roundedDistance, type KnownHazard } from '@/lib/known-hazards';

/**
 * Possible hazard ahead: the team's risk map (assets/data/aviso_prediction.json,
 * trained in Kaggle) scores 25 m squares by how many saved hazards are near them.
 * Only the highest-scoring squares (the file's flag_top_pct, 10%) warn.
 *
 * To update the model: replace the JSON file and publish with EAS Update.
 * Pure functions only — hooks/use-hazard-prediction-ahead.ts runs them on the live GPS fix.
 */

/**
 * No prediction warning for a square this close (m) to a saved hazard: "Known hazard ahead"
 * covers that exact spot. Replay of the real rides: 50 m left the warning almost silent
 * (high-risk squares sit around saved hazards by design); 20 m gives about 1 per 5 km.
 */
export const KNOWN_HAZARD_NEARBY_M = 20;
/** After a warning, squares this close (m) to it count as the same risky spot and stay quiet. */
export const SAME_SPOT_M = 120;

type RiskCell = { lat: number; lon: number; risk: number };
type PredictionModel = { version?: string; flag_top_pct?: number; cell_m?: number; cells?: RiskCell[] };

/** Squares get KnownHazard shape so the known-hazard "ahead" rules can be reused. Key = negative index. */
export type RiskZone = KnownHazard;

export const PREDICTION_TYPE = 'Possible hazard';

function isCell(c: unknown): c is RiskCell {
  if (typeof c !== 'object' || c === null) return false;
  const { lat, lon, risk } = c as Record<string, unknown>;
  return [lat, lon, risk].every((v) => typeof v === 'number' && Number.isFinite(v));
}

/** The high-risk squares (top flag_top_pct of the scores) from a risk-map file. */
export function highRiskZones(model: PredictionModel): RiskZone[] {
  const cells = Array.isArray(model.cells) ? model.cells.filter(isCell) : [];
  if (cells.length === 0) return [];

  const pct = typeof model.flag_top_pct === 'number' && model.flag_top_pct > 0 ? model.flag_top_pct : 10;
  const sorted = [...cells].sort((a, b) => b.risk - a.risk);
  const count = Math.max(1, Math.floor((sorted.length * pct) / 100));
  const cutoff = sorted[count - 1].risk;

  return cells
    .filter((c) => c.risk >= cutoff)
    .map((c, i) => ({ key: -(i + 1), type: PREDICTION_TYPE, latitude: c.lat, longitude: c.lon, heading: null }));
}

let cachedZones: RiskZone[] | null = null;

/** The bundled model's high-risk squares, computed once. */
export function bundledRiskZones(): RiskZone[] {
  if (cachedZones === null) cachedZones = highRiskZones(predictionFile as PredictionModel);
  return cachedZones;
}

/** Drops squares within KNOWN_HAZARD_NEARBY_M of a saved hazard. */
export function withoutKnownHazards(zones: RiskZone[], known: KnownHazard[]): RiskZone[] {
  if (known.length === 0) return zones;
  return zones.filter(
    (z) => !known.some((k) => distanceMeters(z.latitude, z.longitude, k.latitude, k.longitude) <= KNOWN_HAZARD_NEARBY_M),
  );
}

/** Drops squares within SAME_SPOT_M of a spot already warned about. */
export function withoutWarnedSpots(zones: RiskZone[], warned: { latitude: number; longitude: number }[]): RiskZone[] {
  if (warned.length === 0) return zones;
  return zones.filter(
    (z) => !warned.some((w) => distanceMeters(z.latitude, z.longitude, w.latitude, w.longitude) <= SAME_SPOT_M),
  );
}

/** e.g. "Possible hazard ahead, about 50 meters." */
export function possibleHazardVoice(distance: number): string {
  return `Possible hazard ahead, about ${roundedDistance(distance)} meters.`;
}

type RiskSquareFeature = {
  type: 'Feature';
  properties: Record<string, never>;
  geometry: { type: 'Polygon'; coordinates: number[][][] };
};
export type RiskSquares = { type: 'FeatureCollection'; features: RiskSquareFeature[] };

const METERS_PER_DEGREE_LAT = 111_320;

/**
 * The high-risk squares as map polygons (the "Risk areas" layer on the Map tab).
 * Same squares that trigger "Possible hazard ahead", drawn at the file's cell size.
 */
export function riskSquaresGeoJson(zones: RiskZone[], cellMeters: number): RiskSquares {
  const half = cellMeters / 2;
  return {
    type: 'FeatureCollection',
    features: zones.map((z) => {
      const dLat = half / METERS_PER_DEGREE_LAT;
      const dLon = half / (METERS_PER_DEGREE_LAT * Math.cos((z.latitude * Math.PI) / 180));
      const [s, n, w, e] = [z.latitude - dLat, z.latitude + dLat, z.longitude - dLon, z.longitude + dLon];
      return {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
      };
    }),
  };
}

let cachedSquares: RiskSquares | null = null;

type RoadCellsFile = { model_version?: string; cells?: unknown[] };

const cellKey = (lat: number, lon: number) => `${lat.toFixed(6)},${lon.toFixed(6)}`;

/**
 * Keeps only the squares on the road (assets/data/aviso_risk_road_cells.json: squares
 * a recorded ride path or a saved hazard passes through). The risk map's spread into
 * buildings and water is not drawn; no rider can be there and those squares never warn.
 * If the list was built for another risk-map version, every square is kept.
 */
export function onRoadZones(zones: RiskZone[], roadFile: RoadCellsFile, modelVersion: string | undefined): RiskZone[] {
  if (!Array.isArray(roadFile.cells) || roadFile.model_version !== modelVersion) return zones;
  const road = new Set(
    roadFile.cells
      .filter((c): c is [number, number] => Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number')
      .map(([lat, lon]) => cellKey(lat, lon)),
  );
  return zones.filter((z) => road.has(cellKey(z.latitude, z.longitude)));
}

/** The bundled model's high-risk squares on the road, as polygons, built once. */
export function bundledRiskSquares(): RiskSquares {
  if (cachedSquares === null) {
    const model = predictionFile as PredictionModel;
    const cellMeters = typeof model.cell_m === 'number' && model.cell_m > 0 ? model.cell_m : 25;
    const zones = onRoadZones(bundledRiskZones(), roadCellsFile as RoadCellsFile, model.version);
    cachedSquares = riskSquaresGeoJson(zones, cellMeters);
  }
  return cachedSquares;
}

/** The bundled model's date (e.g. "2026-11-19"), shown with the Risk areas layer. */
export function bundledRiskMapVersion(): string | null {
  const version = (predictionFile as PredictionModel).version;
  return typeof version === 'string' ? version : null;
}
