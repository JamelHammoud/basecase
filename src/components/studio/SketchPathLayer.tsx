import React from 'react';
import { linkageFrames, tracedPath, type LinkageFrame } from '../../linkage/linkageFrames';
import type { LinkageSolution, Vec2 } from '../../utils/linkage';
import type { Sketch } from '../../utils/sketch/types';
import { toSvg, type SketchView } from './sketchView';

export const PATH_ACCENT = '#0d99ff';
export const PATH_MUTED = '#a3a3a3';

const thin = { vectorEffect: 'non-scaling-stroke' as const };
const STEPS = 48;
const PERIOD = '3s';

const pointList = (pts: Vec2[]) => pts.map((p) => toSvg(p).join(',')).join(' ');

const curve = (pts: Vec2[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${toSvg(p).join(' ')}`).join(' ');

const Animated: React.FC<{ frames: LinkageFrame[]; color: string; dot: number }> = ({ frames, color, dot }) => {
  const values = (pick: (f: LinkageFrame) => string) => frames.map(pick).join(';');

  return (
    <g stroke={color} fill="none" strokeLinejoin="round">
      <polyline points={pointList(frames[0].bars)} strokeWidth={2} style={thin}>
        <animate
          attributeName="points"
          values={values((f) => pointList(f.bars))}
          dur={PERIOD}
          repeatCount="indefinite"
        />
      </polyline>
      <polyline points={pointList(frames[0].plate)} strokeWidth={2} style={thin} fill={color} fillOpacity={0.15}>
        <animate
          attributeName="points"
          values={values((f) => pointList(f.plate))}
          dur={PERIOD}
          repeatCount="indefinite"
        />
      </polyline>
      <circle r={dot} fill={color} stroke="none" cx={toSvg(frames[0].point)[0]} cy={toSvg(frames[0].point)[1]}>
        <animate
          attributeName="cx"
          values={values((f) => String(toSvg(f.point)[0]))}
          dur={PERIOD}
          repeatCount="indefinite"
        />
        <animate
          attributeName="cy"
          values={values((f) => String(toSvg(f.point)[1]))}
          dur={PERIOD}
          repeatCount="indefinite"
        />
      </circle>
    </g>
  );
};

const Solution: React.FC<{ solution: LinkageSolution; highlighted: boolean; dot: number }> = ({
  solution,
  highlighted,
  dot,
}) => {
  const frames = linkageFrames(solution, STEPS);
  const color = highlighted ? PATH_ACCENT : PATH_MUTED;

  return (
    <g opacity={highlighted ? 1 : 0.5} data-testid="linkage-solution">
      <path d={curve(tracedPath(solution, STEPS * 2))} stroke={color} strokeWidth={1.5} fill="none" style={thin} />
      {frames.length > 0 && <Animated frames={frames} color={color} dot={dot} />}
    </g>
  );
};

export function pathExtent(points: Vec2[], solutions: LinkageSolution[]): Sketch {
  const all = [...points, ...solutions.flatMap((s) => tracedPath(s, STEPS))];

  return { points: all.map(([x, y], i) => ({ id: String(i), x, y })), entities: [], constraints: [] };
}

interface SketchPathLayerProps {
  points: Vec2[];
  solutions: LinkageSolution[];
  highlighted: number;
  view: SketchView;
}

export const SketchPathLayer: React.FC<SketchPathLayerProps> = ({ points, solutions, highlighted, view }) => {
  const dot = view.span * 0.008;
  const order = solutions
    .map((s, i) => ({ s, i }))
    .sort((a, b) => Number(a.i === highlighted) - Number(b.i === highlighted));

  return (
    <g>
      {order.map(({ s, i }) => (
        <Solution key={i} solution={s} highlighted={i === highlighted} dot={dot} />
      ))}
      {points.length > 1 && (
        <polyline
          points={pointList(points)}
          stroke="#ffffff"
          strokeOpacity={0.35}
          strokeDasharray="4 4"
          fill="none"
          style={thin}
        />
      )}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={toSvg(p)[0]}
          cy={toSvg(p)[1]}
          r={dot * 1.4}
          fill="#ffffff"
          stroke="#1e1e1e"
          strokeWidth={1.5}
          style={thin}
        />
      ))}
    </g>
  );
};
