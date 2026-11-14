import React from 'react';
import { TracePlot, type Trace } from '../../design-system';
import type { TimelineLane as Lane } from '../../cases/timelineLanes';
import { angleReading } from '../../utils/angle';
import { torque } from '../../utils/torque';

interface TimelineLaneProps {
  lane: Lane;
  name: string;
  frame: number;
  markers: number[];
  loop: [number, number] | null;
  onSeek: (frame: number) => void;
  onLoop: (from: number, to: number) => void;
  onSelect: () => void;
}

const PLOT = 28;

const reading = (v: number, format: (v: number) => string) => (Number.isFinite(v) ? format(v) : '');
const millimeters = (v: number) => `${v.toFixed(1)} mm`;

function effortText(lane: Lane, v: number): string {
  if (!Number.isFinite(v)) return '';

  return lane.unit === 'mm' ? `${v.toFixed(2)} N` : torque(v);
}

export const TimelineLane: React.FC<TimelineLaneProps> = (props) => {
  const { lane, name, frame, onSelect } = props;
  const scrub = {
    playhead: frame,
    markers: props.markers,
    loop: props.loop,
    onSeek: props.onSeek,
    onLoop: props.onLoop,
  };
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
        <TracePlot traces={motion} height={PLOT} {...scrub} />
        <TracePlot traces={effort} height={PLOT} limit={lane.limit} {...scrub} />
      </div>
    </div>
  );
};
