import React from 'react';
import { linkParts, prettyJointName, type Rig } from '../../utils/kinematics';
import type { TryTimeline as Timeline } from '../../workspace/useTryTimeline';
import { TimelinePanel } from './TimelinePanel';
import { useTimelineKeys } from './useTimelineKeys';

interface TryTimelineProps {
  timeline: Timeline;
  rig: Rig;
  onSelectParts: (ids: string[]) => void;
}

export const TryTimeline: React.FC<TryTimelineProps> = ({ timeline, rig, onSelectParts }) => {
  useTimelineKeys(timeline);

  if (!timeline.open) return null;

  return (
    <TimelinePanel
      rows={timeline.lanes.map((lane) => ({
        lane,
        name: prettyJointName(rig.byId.get(lane.jointId)?.name ?? lane.jointId),
      }))}
      frame={timeline.frame}
      frames={timeline.frames}
      dt={timeline.dt}
      playing={timeline.playing}
      markers={timeline.trips.map((t) => t.frame)}
      onSeek={timeline.seek}
      onToggle={timeline.toggle}
      onSelectLane={(jointId) => onSelectParts(linkParts(rig, jointId))}
      onClose={timeline.close}
    />
  );
};
