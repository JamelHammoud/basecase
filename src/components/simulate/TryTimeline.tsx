import React, { useRef } from 'react';
import { CloseIcon, IconButton, PauseIcon, RunIcon, Slider } from '../../design-system';
import { linkParts, prettyJointName, type Rig } from '../../utils/kinematics';
import type { TryTimeline as Timeline } from '../../workspace/useTryTimeline';
import { runClock } from '../../utils/duration';
import { FlagMark } from '../tries/FlagMark';
import { flagLines } from '../tries/flagLines';
import { SegmentLane } from './SegmentLane';
import { TimelineLane } from './TimelineLane';
import { useTimelineKeys } from './useTimelineKeys';

interface TryTimelineProps {
  timeline: Timeline;
  rig: Rig;
  onSelectParts: (ids: string[]) => void;
  onKeyEdit: () => void;
}

const ic = 'w-4 h-4';

export const TryTimeline: React.FC<TryTimelineProps> = ({ timeline, rig, onSelectParts, onKeyEdit }) => {
  const root = useRef<HTMLDivElement>(null);

  useTimelineKeys(timeline, { root, onKeyEdit });

  if (!timeline.open) return null;

  const { frame, frames, dt, lanes } = timeline;
  const markers = timeline.trips.map((t) => t.frame);
  const jointName = (id: string) => prettyJointName(rig.byId.get(id)?.name ?? id);

  return (
    <div
      ref={root}
      data-testid="try-timeline"
      data-frame={frame}
      className="glass pointer-events-auto w-[min(760px,calc(100%-32px))] rounded-[12px] p-3 flex flex-col gap-2"
    >
      <SegmentLane timeline={timeline} />
      <div className="max-h-[40vh] overflow-y-auto flex flex-col gap-2">
        {lanes.map((lane) => (
          <TimelineLane
            key={lane.jointId}
            lane={lane}
            name={jointName(lane.jointId)}
            frame={frame}
            markers={markers}
            onSeek={timeline.seek}
            onSelect={() => onSelectParts(linkParts(rig, lane.jointId))}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <IconButton
          icon={timeline.playing ? <PauseIcon className={ic} /> : <RunIcon className={ic} />}
          title={timeline.playing ? 'Pause' : 'Play'}
          shortcut="Space"
          size="sm"
          onClick={timeline.toggle}
        />
        <Slider
          className="flex-1 min-w-0"
          label={runClock(frame * dt)}
          value={frame}
          min={0}
          max={Math.max(frames - 1, 1)}
          format={() => runClock((frames - 1) * dt)}
          onChange={(v) => timeline.seek(v)}
        />
        <FlagMark lines={flagLines(timeline.flags, jointName)} />
        <IconButton
          icon={<CloseIcon className={ic} />}
          title="Close"
          shortcut="Esc"
          size="sm"
          onClick={timeline.close}
        />
      </div>
    </div>
  );
};
