import React from 'react';
import { CloseIcon, IconButton, PauseIcon, RunIcon, Slider } from '../../design-system';
import { linkParts, prettyJointName, type Rig } from '../../utils/kinematics';
import type { TryTimeline as Timeline } from '../../workspace/useTryTimeline';
import { fmtTime } from './format';
import { TimelineLane } from './TimelineLane';
import { useTimelineKeys } from './useTimelineKeys';

interface TryTimelineProps {
  timeline: Timeline;
  rig: Rig;
  onSelectParts: (ids: string[]) => void;
}

const ic = 'w-4 h-4';

export const TryTimeline: React.FC<TryTimelineProps> = ({ timeline, rig, onSelectParts }) => {
  useTimelineKeys(timeline);

  if (!timeline.open) return null;

  const { frame, frames, dt, lanes } = timeline;
  const markers = timeline.trips.map((t) => t.frame);

  return (
    <div
      data-testid="try-timeline"
      data-frame={frame}
      className="glass pointer-events-auto w-[min(760px,calc(100%-32px))] rounded-[12px] p-3 flex flex-col gap-2"
    >
      <div className="max-h-[40vh] overflow-y-auto flex flex-col gap-2">
        {lanes.map((lane) => (
          <TimelineLane
            key={lane.jointId}
            lane={lane}
            name={prettyJointName(rig.byId.get(lane.jointId)?.name ?? lane.jointId)}
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
          label={fmtTime(frame * dt)}
          value={frame}
          min={0}
          max={Math.max(frames - 1, 1)}
          format={() => fmtTime((frames - 1) * dt)}
          onChange={(v) => timeline.seek(v)}
        />
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
