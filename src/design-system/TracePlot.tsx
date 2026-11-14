import React, { useRef } from 'react';
import { THEME_COLORS } from './theme';
import { negative } from '../../electron/minus.mjs';
import {
  hasX,
  sampleAt,
  sampleCount,
  sampleX,
  traceRange,
  tracePaths,
  valueY,
  xRange,
  type Range,
  type Trace,
  type TracePath,
  type TraceTone,
} from './tracePaths';

export type { Trace, TraceTone } from './tracePaths';

export interface TracePlotProps {
  traces: Trace[];
  height?: number;
  loading?: boolean;
  className?: string;
  playhead?: number;
  limit?: number;
  markers?: number[];
  onSeek?: (sample: number) => void;
  loop?: Range | null;
  onLoop?: (range: Range | null) => void;
  fromZero?: boolean;
  units?: { x: string; y: string };
}

const WIDTH = 1000;
const INSET = 8;
const FAILED = '#f87171';

const STROKE: Record<TraceTone, string> = {
  primary: 'rgba(255, 255, 255, 0.85)',
  muted: 'rgba(255, 255, 255, 0.35)',
  accent: THEME_COLORS.figmaBlue,
};

const line = { fill: 'none', vectorEffect: 'non-scaling-stroke' } as const;

const strokeWidth = (p: TracePath) => {
  if (p.points) return 4;

  return p.tone === 'accent' ? 2 : 1.5;
};

const figure = (v: number) => negative(v, (magnitude) => String(Number(magnitude.toPrecision(2))));

const AxisLabels: React.FC<{ units?: TracePlotProps['units']; x?: Range; y: Range }> = ({ units, x, y }) =>
  units && x ? (
    <>
      <span className="absolute top-1 left-2 text-[12px] leading-4 text-white/50 tabular">
        {figure(y[1])} {units.y}
      </span>
      <span className="absolute bottom-1 right-2 text-[12px] leading-4 text-white/50 tabular">
        {figure(x[1])} {units.x}
      </span>
    </>
  ) : null;

const LimitLine: React.FC<{ y?: number }> = ({ y }) =>
  y === undefined ? null : (
    <path
      data-testid="trace-limit"
      d={`M0 ${y.toFixed(1)}H${WIDTH}`}
      stroke={STROKE.muted}
      strokeWidth={1}
      strokeDasharray="4 4"
      {...line}
    />
  );

function plotRanges(traces: Trace[], { limit, fromZero }: Pick<TracePlotProps, 'limit' | 'fromZero'>) {
  const zero = fromZero ? [0] : [];

  return {
    y: traceRange(traces, [...(limit === undefined ? [] : [limit]), ...zero]),
    x: hasX(traces) ? xRange(traces, zero) : undefined,
  };
}

function usePlotPointer(count: number, { onSeek, onLoop }: Pick<TracePlotProps, 'onSeek' | 'onLoop'>) {
  const anchor = useRef<number | null>(null);

  if (!onSeek || count < 1) return {};

  const at = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();

    return sampleAt((e.clientX - box.left) / Math.max(box.width, 1), count);
  };

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const sample = at(e);
    const from = anchor.current;

    if (from === null) onSeek(sample);
    else onLoop?.([Math.min(from, sample), Math.max(from, sample)]);
  };

  return {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      anchor.current = e.shiftKey && onLoop ? at(e) : null;
      move(e);
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) move(e);
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      if (anchor.current !== null && anchor.current === at(e)) onLoop?.(null);

      anchor.current = null;
    },
  };
}

interface LinesProps {
  markers: number[];
  playhead: number | undefined;
  x: (sample: number) => number;
  height: number;
}

const Lines: React.FC<LinesProps> = ({ markers, playhead, x, height }) => (
  <>
    {markers.map((m) => (
      <path
        key={`marker-${m}`}
        data-testid="trace-marker"
        d={`M${x(m).toFixed(1)} 0V${height}`}
        stroke={FAILED}
        strokeWidth={1.5}
        {...line}
      />
    ))}
    {playhead !== undefined && (
      <path
        data-testid="trace-playhead"
        d={`M${x(playhead).toFixed(1)} 0V${height}`}
        stroke="rgba(255, 255, 255, 0.85)"
        strokeWidth={1}
        {...line}
      />
    )}
  </>
);

const LoopBand: React.FC<{ from: number; to: number; height: number }> = ({ from, to, height }) => (
  <rect
    data-testid="trace-loop"
    x={from.toFixed(1)}
    y={0}
    width={Math.max(to - from, 1).toFixed(1)}
    height={height}
    fill="rgba(13, 153, 255, 0.16)"
  />
);

export const TracePlot: React.FC<TracePlotProps> = (props) => {
  const { traces, height = 96, loading = false, className = '', playhead, limit, markers = [], units } = props;
  const box = { width: WIDTH, height, inset: INSET };
  const ranges = plotRanges(traces, props);
  const range = ranges.y;
  const paths = loading ? [] : tracePaths(traces, box, range, ranges.x);
  const count = sampleCount(traces);
  const x = (sample: number) => sampleX(sample, count, box);
  const shown = !loading && count > 0;
  const pointer = usePlotPointer(count, props);

  return (
    <div
      className={`relative w-full rounded-lg bg-[#262626] overflow-hidden ${loading ? 'shimmer' : ''} ${className}`}
      style={{ height }}
      data-loading={loading || undefined}
      {...pointer}
    >
      <svg className="block w-full h-full" viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none" aria-hidden>
        {shown && props.loop && <LoopBand from={x(props.loop[0])} to={x(props.loop[1])} height={height} />}
        {shown && <LimitLine y={limit === undefined ? undefined : valueY(limit, range, box)} />}
        {paths.map((p) => (
          <path
            key={p.id}
            data-testid={`trace-${p.id}`}
            d={p.d}
            stroke={STROKE[p.tone]}
            strokeWidth={strokeWidth(p)}
            strokeLinejoin="round"
            strokeLinecap="round"
            {...line}
          />
        ))}
        {shown && <Lines markers={markers} playhead={playhead} x={x} height={height} />}
      </svg>
      {shown && <AxisLabels units={units} x={ranges.x} y={range} />}
    </div>
  );
};
