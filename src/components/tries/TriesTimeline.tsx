import React from 'react';
import type { StoredTry } from '../../cases/storedTry';
import { TimelinePanel } from '../simulate/TimelinePanel';
import { useTimelineKeys } from '../simulate/useTimelineKeys';
import { useTriesTimeline } from './useTriesTimeline';

const NO_MARKERS: number[] = [];

export const TriesTimeline: React.FC<{ stored: StoredTry; active: boolean; onClose: () => void }> = ({
  stored,
  active,
  onClose,
}) => {
  const timeline = useTriesTimeline(stored);

  useTimelineKeys({ ...timeline, open: active && timeline.open, close: onClose });

  if (!timeline.open) return null;

  return (
    <div className="shrink-0 flex justify-center pt-2 pb-5">
      <TimelinePanel
        rows={timeline.rows}
        frame={timeline.frame}
        frames={timeline.frames}
        dt={timeline.dt}
        playing={timeline.playing}
        markers={NO_MARKERS}
        onSeek={timeline.seek}
        onToggle={timeline.toggle}
      />
    </div>
  );
};
