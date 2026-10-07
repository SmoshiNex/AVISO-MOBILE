import Svg, { Circle, Ellipse, G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import type { DetectionResult } from '@/types';

type SignIconProps = {
  detection: DetectionResult;
  size?: number;
};

const RED = '#DC2626';
const YELLOW = '#FACC15';
const BLACK = '#111827';
const WHITE = '#FFFFFF';

/** Regulatory sign: white disc with a red ring (speed limit, no turn, no parking). */
function RingSign({ children }: { children?: React.ReactNode }) {
  return (
    <G>
      <Circle cx={50} cy={50} r={46} fill={WHITE} stroke={RED} strokeWidth={9} />
      {children}
    </G>
  );
}

/** Warning sign: yellow diamond with a black border. */
function DiamondSign({ children }: { children?: React.ReactNode }) {
  return (
    <G>
      <Polygon points="50,3 97,50 50,97 3,50" fill={YELLOW} stroke={BLACK} strokeWidth={4} strokeLinejoin="round" />
      {children}
    </G>
  );
}

/** Hazard warning: red-bordered triangle. */
function HazardTriangle({ children }: { children?: React.ReactNode }) {
  return (
    <G>
      <Polygon points="50,6 96,90 4,90" fill={WHITE} stroke={RED} strokeWidth={8} strokeLinejoin="round" />
      {children}
    </G>
  );
}

function TrafficLight({ lit }: { lit: 'red' | 'yellow' | 'green' }) {
  const lamp = (color: 'red' | 'yellow' | 'green', cy: number, on: string) => (
    <Circle cx={50} cy={cy} r={11} fill={lit === color ? on : '#374151'} />
  );
  return (
    <G>
      <Rect x={30} y={6} width={40} height={88} rx={10} fill={BLACK} stroke="#4B5563" strokeWidth={3} />
      {lamp('red', 26, '#EF4444')}
      {lamp('yellow', 50, '#FACC15')}
      {lamp('green', 74, '#22C55E')}
    </G>
  );
}

function Child({ x, scale }: { x: number; scale: number }) {
  return (
    <G transform={`translate(${x} 0) scale(${scale})`}>
      <Circle cx={0} cy={30} r={6} fill={BLACK} />
      <Path d="M-6 40 L6 40 L5 58 L9 74 L3 74 L0 62 L-3 74 L-9 74 L-5 58 Z" fill={BLACK} />
    </G>
  );
}

/** Icon for the alert card, chosen from the detected class. */
export function SignIcon({ detection, size = 56 }: SignIconProps) {
  const content = (() => {
    switch (detection.signKey) {
      case 'speed_limit_20':
        return (
          <RingSign>
            <SvgText x={50} y={64} fontSize={40} fontWeight="bold" fill={BLACK} textAnchor="middle">20</SvgText>
          </RingSign>
        );
      case 'no_left_turn':
        return (
          <RingSign>
            <Path d="M62 74 L62 46 Q62 36 52 36 L38 36" stroke={BLACK} strokeWidth={8} fill="none" />
            <Polygon points="26,36 40,25 40,47" fill={BLACK} />
            <Line x1={20} y1={20} x2={80} y2={80} stroke={RED} strokeWidth={8} />
          </RingSign>
        );
      case 'no_parking':
        return (
          <RingSign>
            <SvgText x={50} y={66} fontSize={44} fontWeight="bold" fill={BLACK} textAnchor="middle">P</SvgText>
            <Line x1={20} y1={20} x2={80} y2={80} stroke={RED} strokeWidth={8} />
          </RingSign>
        );
      case 'children_crossing':
        return (
          <DiamondSign>
            <Child x={40} scale={1} />
            <Child x={60} scale={0.8} />
          </DiamondSign>
        );
      case 'slow_down':
        return (
          <DiamondSign>
            <SvgText x={50} y={58} fontSize={22} fontWeight="bold" fill={BLACK} textAnchor="middle">SLOW</SvgText>
          </DiamondSign>
        );
      case 'other':
        return (
          <DiamondSign>
            <SvgText x={50} y={66} fontSize={44} fontWeight="bold" fill={BLACK} textAnchor="middle">!</SvgText>
          </DiamondSign>
        );
    }

    switch (detection.type) {
      case 'Traffic Light Red':
        return <TrafficLight lit="red" />;
      case 'Traffic Light Yellow':
        return <TrafficLight lit="yellow" />;
      case 'Traffic Light Green':
        return <TrafficLight lit="green" />;
      case 'Pothole':
        return (
          <HazardTriangle>
            <Ellipse cx={50} cy={70} rx={22} ry={8} fill={BLACK} />
            <Path d="M30 62 Q50 52 70 62" stroke={BLACK} strokeWidth={3} fill="none" />
          </HazardTriangle>
        );
      case 'Road Barrier':
        return (
          <HazardTriangle>
            <Rect x={26} y={56} width={48} height={14} fill={WHITE} stroke={BLACK} strokeWidth={2} />
            <Path d="M30 56 L38 70 M44 56 L52 70 M58 56 L66 70" stroke={RED} strokeWidth={5} />
            <Line x1={32} y1={70} x2={32} y2={80} stroke={BLACK} strokeWidth={3} />
            <Line x1={68} y1={70} x2={68} y2={80} stroke={BLACK} strokeWidth={3} />
          </HazardTriangle>
        );
      case 'Road Excavation':
        return (
          <HazardTriangle>
            <Circle cx={42} cy={44} r={5} fill={BLACK} />
            <Path d="M40 50 L36 68 L44 80 M38 60 L52 54 L62 70" stroke={BLACK} strokeWidth={4} fill="none" strokeLinecap="round" />
            <Path d="M58 76 L76 80 L66 70 Z" fill={BLACK} />
          </HazardTriangle>
        );
      default:
        return (
          <HazardTriangle>
            <SvgText x={50} y={80} fontSize={40} fontWeight="bold" fill={BLACK} textAnchor="middle">!</SvgText>
          </HazardTriangle>
        );
    }
  })();

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {content}
    </Svg>
  );
}
