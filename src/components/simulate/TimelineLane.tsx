import React from 'react';
import { TracePlot, type Trace } from '../../design-system';
import type { TimelineLane as Lane } from '../../cases/timelineLanes';
import { angleReading } from '../../utils/angle';
import { torque } from '../../utils/torque';
import { negative } from '../../../electron/minus.mjs';

interface TimelineLaneProps {
  lane: Lane;
  name: string;
  frame: number;
  markers: number[];
  onSeek: (frame: number) => void;
  onSelect: () => void;
}

const PLOT = 28;

const reading = (v: number, format: (v: number) => string) => (Number.isFinite(v) ? format(v) : '');
const tenths = (v: number) => v.toFixed(1);
const hundredths = (v: number) => v.toFixed(2);
const millimeters = (v: number) => `${negative(v, tenths)} mm`;

function effortText(lane: Lane, v: number): string {
  if (!Number.isFinite(v)) return '';

  return lane.unit === 'mm' ? `${negative(v, hundredths)} N` : torque(v);
}

export const TimelineLane: React.FC<TimelineLaneProps> = ({ lane, name, frame, markers, onSeek, onSelect }) => {
  const motion: Trace[] = [
    ...(lane.target ? [{ id: 'target', values: lane.target, tone: 'muted' as const }] : []),
    { id: 'position', values: lane.position, tone: 'accent' },
  ];
  const effort: Trace[] = [{ id: 'effort', values: lane.effort, tone: 'primary' }];
  const position = lane.unit === 'mm' ? millimeters : angleReading;

  return (
    <div
      data-testid="timeline-lane"
      data-joint={lane.jointId}
      className="flex items-center gap-3 cursor-default"
      onPointerDown={onSelect}
    >
      <div className="w-[112px] shrink-0 flex flex-col gap-0.5 min-w-0">
        <span className="text-[13px] text-white/85 truncate">{name}</span>
        <span className="text-[12px] text-white/50 tabular truncate">{reading(lane.position[frame], position)}</span>
        <span className="text-[12px] text-white/50 tabular truncate">{effortText(lane, lane.effort[frame])}</span>
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <TracePlot traces={motion} height={PLOT} playhead={frame} markers={markers} onSeek={onSeek} />
        <TracePlot
          traces={effort}
          height={PLOT}
          playhead={frame}
          limit={lane.limit}
          markers={markers}
          onSeek={onSeek}
        />
      </div>
    </div>
  );
};
