import React from 'react';
import type { CameraRegions, Point, TrackingSnapshot } from '../../vision/tracking/types';
import { tileChip } from './tileStyle';

const ACCENT = '#0d99ff';

const points = (list: readonly Point[]) => list.map(([x, y]) => `${x},${y}`).join(' ');

function arrow(from: Point, to: Point) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy) || 1;
  const middle: Point = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];

  return { middle, tip: [middle[0] - (dy / length) * 0.06, middle[1] + (dx / length) * 0.06] as Point };
}

const Label: React.FC<{ at: Point; mirrorText?: boolean; children: React.ReactNode }> = ({
  at,
  mirrorText,
  children,
}) => {
  const right = at[0] > 0.5;
  const bottom = at[1] > 0.5;

  return (
    <span
      data-testid="vision-region-label"
      className={`absolute truncate font-medium text-white/90 ${tileChip} ${mirrorText ? '-scale-x-100' : ''}`}
      style={{
        ...(right ? { right: `${(1 - at[0]) * 100}%` } : { left: `${at[0] * 100}%` }),
        ...(bottom ? { bottom: `${(1 - at[1]) * 100}%` } : { top: `${at[1] * 100}%` }),
        maxWidth: `${(right ? at[0] : 1 - at[0]) * 100}%`,
      }}
    >
      {children}
    </span>
  );
};

export const RegionShapes: React.FC<{
  regions: CameraRegions;
  tracking?: TrackingSnapshot;
  mirrorText?: boolean;
}> = ({ regions, tracking, mirrorText }) => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden">
    <svg
      data-testid="vision-regions"
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
    >
      {regions.zones.map((zone) => (
        <polygon
          key={zone.name}
          data-testid="vision-zone"
          data-name={zone.name}
          data-count={tracking?.zones.find((reading) => reading.name === zone.name)?.count ?? 0}
          points={points(zone.points)}
          fill={ACCENT}
          fillOpacity={0.18}
          stroke={ACCENT}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {regions.lines.map((line) => {
        const { middle, tip } = arrow(line.from, line.to);

        return (
          <g
            key={line.name}
            data-testid="vision-line"
            data-name={line.name}
            data-in={tracking?.lines.find((reading) => reading.name === line.name)?.in ?? 0}
            data-out={tracking?.lines.find((reading) => reading.name === line.name)?.out ?? 0}
            stroke={ACCENT}
            strokeWidth={2}
          >
            <line
              x1={line.from[0]}
              y1={line.from[1]}
              x2={line.to[0]}
              y2={line.to[1]}
              vectorEffect="non-scaling-stroke"
            />
            <line x1={middle[0]} y1={middle[1]} x2={tip[0]} y2={tip[1]} vectorEffect="non-scaling-stroke" />
          </g>
        );
      })}
    </svg>
    {regions.zones.map((zone) => (
      <Label key={`zone:${zone.name}`} at={zone.points[0]} mirrorText={mirrorText}>
        {zone.name} {tracking?.zones.find((reading) => reading.name === zone.name)?.count ?? 0}
      </Label>
    ))}
    {regions.lines.map((line) => {
      const reading = tracking?.lines.find((candidate) => candidate.name === line.name);

      return (
        <Label key={`line:${line.name}`} at={line.from} mirrorText={mirrorText}>
          {line.name} {reading?.in ?? 0} in {reading?.out ?? 0} out
        </Label>
      );
    })}
  </div>
);
