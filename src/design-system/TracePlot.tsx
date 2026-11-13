import React from 'react';
import { THEME_COLORS } from './theme';
import { tracePaths, type Trace, type TraceTone } from './tracePaths';

export type { Trace, TraceTone } from './tracePaths';

export interface TracePlotProps {
  traces: Trace[];
  height?: number;
  loading?: boolean;
  className?: string;
}

const WIDTH = 1000;
const INSET = 8;

const STROKE: Record<TraceTone, string> = {
  primary: 'rgba(255, 255, 255, 0.85)',
  muted: 'rgba(255, 255, 255, 0.35)',
  accent: THEME_COLORS.figmaBlue,
};

export const TracePlot: React.FC<TracePlotProps> = ({ traces, height = 96, loading = false, className = '' }) => {
  const paths = loading ? [] : tracePaths(traces, { width: WIDTH, height, inset: INSET });

  return (
    <div
      className={`w-full rounded-lg bg-[#262626] overflow-hidden ${loading ? 'shimmer' : ''} ${className}`}
      style={{ height }}
      data-loading={loading || undefined}
    >
      <svg
        className="block w-full h-full"
        viewBox={`0 0 ${WIDTH} ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {paths.map((p) => (
          <path
            key={p.id}
            data-testid={`trace-${p.id}`}
            d={p.d}
            fill="none"
            stroke={STROKE[p.tone]}
            strokeWidth={p.tone === 'accent' ? 2 : 1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  );
};
