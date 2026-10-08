import { memo, useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { simplifyRoute, type RoutePoint } from '@/lib/route-utils';

type RouteThumbnailProps = {
  points: RoutePoint[];
  size: number;
  color: string;
  background: string;
};

const PADDING = 8;
const START_COLOR = '#22C55E';
const END_COLOR = '#EF4444';

/**
 * Small drawing of a ride's shape (like Strava's list cards): no map tiles, so a long list stays
 * fast. Longitude is scaled by cos(latitude) so the shape isn't stretched.
 */
function RouteThumbnailInner({ points, size, color, background }: RouteThumbnailProps) {
  const drawn = useMemo(() => {
    const pts = simplifyRoute(points, 10);
    if (pts.length === 0) return null;

    const midLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
    const kx = Math.cos((midLat * Math.PI) / 180);
    const xs = pts.map((p) => p.lng * kx);
    const ys = pts.map((p) => p.lat);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const span = Math.max(maxX - minX, maxY - minY) || 1;
    const inner = size - PADDING * 2;
    // Centre the shape in the square box.
    const offX = PADDING + (inner - ((maxX - minX) / span) * inner) / 2;
    const offY = PADDING + (inner - ((maxY - minY) / span) * inner) / 2;
    const toXY = (i: number): [number, number] => [
      offX + ((xs[i] - minX) / span) * inner,
      // Screen y grows downward, latitude upward.
      offY + ((maxY - ys[i]) / span) * inner,
    ];

    const coords = pts.map((_, i) => toXY(i));
    return {
      line: coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '),
      start: coords[0],
      end: coords[coords.length - 1],
      single: coords.length === 1,
    };
  }, [points, size]);

  return (
    <View style={{ width: size, height: size, borderRadius: 10, backgroundColor: background, overflow: 'hidden' }}>
      {drawn && (
        <Svg width={size} height={size}>
          {!drawn.single && (
            <Polyline points={drawn.line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          )}
          <Circle cx={drawn.start[0]} cy={drawn.start[1]} r={4} fill={START_COLOR} stroke="#fff" strokeWidth={1.5} />
          {!drawn.single && (
            <Circle cx={drawn.end[0]} cy={drawn.end[1]} r={4} fill={END_COLOR} stroke="#fff" strokeWidth={1.5} />
          )}
        </Svg>
      )}
    </View>
  );
}

export const RouteThumbnail = memo(RouteThumbnailInner);
