import Mapbox from '@rnmapbox/maps';
import { bundledRiskSquares } from '@/lib/hazard-prediction';

/** Purple: predicted risk (not a detected hazard); hazard pins use red, orange and yellow. */
const RISK_FILL = '#8B5CF6';

type RiskAreasProps = { visible: boolean };

/**
 * "Risk areas" layer: the risk map's high-risk squares (the same ones that trigger
 * "Possible hazard ahead"). Always mounted and hidden with visibility so the layer
 * keeps its place under the hazard pins.
 */
export function RiskAreas({ visible }: RiskAreasProps) {
  const squares = bundledRiskSquares();
  if (squares.features.length === 0) return null;

  return (
    <Mapbox.ShapeSource id="risk-areas-source" shape={squares}>
      <Mapbox.FillLayer
        id="risk-areas-fill"
        style={{
          visibility: visible ? 'visible' : 'none',
          fillColor: RISK_FILL,
          fillOpacity: 0.35,
          fillOutlineColor: RISK_FILL,
        }}
      />
    </Mapbox.ShapeSource>
  );
}
