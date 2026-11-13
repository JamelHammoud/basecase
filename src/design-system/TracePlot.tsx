import React from 'react';
import { THEME_COLORS } from './theme';
import {
  sampleAt,
  sampleCount,
  sampleX,
  traceRange,
  tracePaths,
  valueY,
  type Trace,
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

function seekHandlers(count: number, onSeek: TracePlotProps['onSeek']) {
  if (!onSeek || count < 1) return {};

  const seek = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();

    onSeek(sampleAt((e.clientX - box.left) / Math.max(box.width, 1), count));
  };

  return {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      seek(e);
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) seek(e);
    },
  };
}

export const TracePlot: React.FC<TracePlotProps> = (props) => {
  const { traces, height = 96, loading = false, className = '', playhead, limit, markers = [], onSeek } = props;
  const box = { width: WIDTH, height, inset: INSET };
  const range = traceRange(traces, limit === undefined ? [] : [limit]);
  const paths = loading ? [] : tracePaths(traces, box, range);
  const count = sampleCount(traces);
  const x = (sample: number) => sampleX(sample, count, box);
  const shown = !loading && count > 0;

  return (
    <div
      className={`w-full rounded-lg bg-[#262626] overflow-hidden ${loading ? 'shimmer' : ''} ${className}`}
      style={{ height }}
      data-loading={loading || undefined}
      {...seekHandlers(count, onSeek)}
    >
      <svg className="block w-full h-full" viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none" aria-hidden>
        {shown && limit !== undefined && (
          <path
            data-testid="trace-limit"
            d={`M0 ${valueY(limit, range, box).toFixed(1)}H${WIDTH}`}
            stroke={STROKE.muted}
            strokeWidth={1}
            strokeDasharray="4 4"
            {...line}
          />
        )}
        {paths.map((p) => (
          <path
            key={p.id}
            data-testid={`trace-${p.id}`}
            d={p.d}
            stroke={STROKE[p.tone]}
            strokeWidth={p.tone === 'accent' ? 2 : 1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            {...line}
          />
        ))}
        {shown &&
          markers.map((m) => (
            <path
              key={`marker-${m}`}
              data-testid="trace-marker"
              d={`M${x(m).toFixed(1)} 0V${height}`}
              stroke={FAILED}
              strokeWidth={1.5}
              {...line}
            />
          ))}
        {shown && playhead !== undefined && (
          <path
            data-testid="trace-playhead"
            d={`M${x(playhead).toFixed(1)} 0V${height}`}
            stroke="rgba(255, 255, 255, 0.85)"
            strokeWidth={1}
            {...line}
          />
        )}
      </svg>
    </div>
  );
};
