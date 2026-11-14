import React from 'react';
import { TracePlot, type Trace } from '../../design-system';
import type { TimelineLane as Lane } from '../../cases/timelineLanes';

interface TimelineLaneProps {
  lane: Lane;
  name: string;
  frame: number;
  markers: number[];
  onSeek: (frame: number) => void;
  onSelect?: () => void;
}

const PLOT = 28;

const reading = (v: number, digits: number, unit: string) => (Number.isFinite(v) ? `${v.toFixed(digits)}${unit}` : '');

export const TimelineLane: React.FC<TimelineLaneProps> = ({ lane, name, frame, markers, onSeek, onSelect }) => {
  const motion: Trace[] = [
    ...(lane.target ? [{ id: 'target', values: lane.target, tone: 'muted' as const }] : []),
    { id: 'position', values: lane.position, tone: 'accent' },
  ];
  const effort: Trace[] = [{ id: 'effort', values: lane.effort, tone: 'primary' }];
  const unit = lane.unit === 'mm' ? ' mm' : '°';
  const hasEffort = lane.effort.length > 0;

  return (
    <div
      data-testid="timeline-lane"
      data-joint={lane.jointId}
      className="flex items-center gap-3 cursor-default"
      onPointerDown={onSelect}
    >
      <div className="w-[112px] shrink-0 flex flex-col gap-0.5 min-w-0">
        <span className="text-[13px] text-white/85 truncate">{name}</span>
        <span className="text-[12px] text-white/50 tabular truncate">{reading(lane.position[frame], 1, unit)}</span>
        {hasEffort && (
          <span className="text-[12px] text-white/50 tabular truncate">{reading(lane.effort[frame], 2, ' N·m')}</span>
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <TracePlot traces={motion} height={PLOT} playhead={frame} markers={markers} onSeek={onSeek} />
        {hasEffort && (
          <TracePlot
            traces={effort}
            height={PLOT}
            playhead={frame}
            limit={lane.limit}
            markers={markers}
            onSeek={onSeek}
          />
        )}
      </div>
    </div>
  );
};
