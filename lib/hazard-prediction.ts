import predictionFile from '@/assets/data/aviso_prediction.json';
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
type PredictionModel = { version?: string; flag_top_pct?: number; cells?: RiskCell[] };

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
