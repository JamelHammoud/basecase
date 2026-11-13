import React from 'react';
import { spanOf, TRACE_COLORS, tracePath, type PlotFrame, type Trace, type TraceTone } from './tracePlotMath';

interface TracePlotProps {
  times: ArrayLike<number>;
  traces: Trace[];
  height?: number;
  className?: string;
}

const LAYER: Record<TraceTone, number> = { muted: 0, strong: 1, accent: 2 };

const WIDTH = 1000;

export const TracePlot: React.FC<TracePlotProps> = ({ times, traces, height = 96, className = '' }) => {
  const frame: PlotFrame = {
    x: spanOf([times]),
    y: spanOf(traces.map((t) => t.values)),
    width: WIDTH,
    height,
  };
  const layered = [...traces].sort((a, b) => LAYER[a.tone] - LAYER[b.tone]);

  return (
    <div className={`rounded-lg bg-[#262626] px-2 py-3 ${className}`}>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        preserveAspectRatio="none"
        className="block w-full overflow-visible"
        style={{ height }}
        aria-hidden
      >
        {layered.map((trace) => (
          <path
            key={trace.id}
            data-testid={`trace-${trace.id}`}
            d={tracePath(times, trace.values, frame)}
            fill="none"
            stroke={TRACE_COLORS[trace.tone]}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  );
};
