import React, { useRef } from 'react';
import { Button, CloseIcon, IconButton, PauseIcon, RunIcon, Slider } from '../../design-system';
import { allKeysFor, keyFor } from '../../app/shortcuts';
import { speedText } from '../../workspace/timelinePlayback';
import { linkParts, prettyJointName, type Rig } from '../../utils/kinematics';
import type { TryTimeline as Timeline } from '../../workspace/useTryTimeline';
import { failureText } from '../../readiness/caseChecks';
import { runClock } from '../../utils/duration';
import { SegmentLane } from './SegmentLane';
import { TimelineLane } from './TimelineLane';
import { useSegmentUndo } from './useSegmentUndo';
import { useTimelineKeys } from './useTimelineKeys';

interface TryTimelineProps {
  timeline: Timeline;
  rig: Rig;
  closable: boolean;
  onSelectParts: (ids: string[]) => void;
  onAddFrames: () => void;
}

const ic = 'w-4 h-4';

export const TryTimeline: React.FC<TryTimelineProps> = ({ timeline, rig, closable, onSelectParts, onAddFrames }) => {
  const root = useRef<HTMLDivElement | null>(null);
  const focus = () => root.current?.focus({ preventScroll: true });
  const onUndoKey = useSegmentUndo({ root, labels: timeline.labels, open: timeline.open });

  useTimelineKeys(timeline, focus);

  if (!timeline.open) return null;

  const { frame, frames, lanes, labels } = timeline;
  const markers = timeline.trips.map((t) => t.frame);
  const jointName = (id: string) => prettyJointName(rig.byId.get(id)?.name ?? id);

  return (
    <div
      ref={root}
      tabIndex={-1}
      data-testid="try-timeline"
      data-frame={frame}
      data-speed={timeline.speed}
      data-loop={timeline.loop?.join('-')}
      data-own-edits={labels.canUndo || labels.canRedo ? 'undo redo' : undefined}
      onKeyDown={onUndoKey}
      className="glass pointer-events-auto w-[min(760px,calc(100%-32px))] rounded-[12px] p-3 flex flex-col gap-2 outline-none"
    >
      <SegmentLane
        labels={labels}
        frame={frame}
        frames={frames}
        jointName={jointName}
        onSeek={timeline.seek}
        onEdited={focus}
      />
      <div className="max-h-[40vh] overflow-y-auto flex flex-col gap-2">
        {lanes.map((lane) => (
          <TimelineLane
            key={lane.jointId}
            lane={lane}
            name={jointName(lane.jointId)}
            frame={frame}
            markers={markers}
            loop={timeline.loop}
            onSeek={timeline.seek}
            onLoop={timeline.setLoop}
            onSelect={() => onSelectParts(linkParts(rig, lane.jointId))}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        {timeline.trips[0] && <span className="text-[13px] text-red-400">{failureText(timeline.trips[0].label)}</span>}
        <IconButton
          icon={timeline.playing ? <PauseIcon className={ic} /> : <RunIcon className={ic} />}
          title={timeline.playing ? 'Pause' : 'Play'}
          shortcut={keyFor('timeline:play')}
          size="sm"
          onClick={timeline.toggle}
        />
        <Slider
          className="flex-1 min-w-0"
          label={runClock(frame * timeline.dt)}
          value={frame}
          min={0}
          max={Math.max(frames - 1, 1)}
          format={() => runClock((frames - 1) * timeline.dt)}
          onChange={(v) => timeline.seek(v)}
        />
        <Button
          variant="ghost"
          size="xs"
          className="tabular min-w-[48px] justify-center"
          title="Speed"
          shortcut={allKeysFor('timeline:speed')}
          data-testid="timeline-speed"
          onClick={() => timeline.faster(1, true)}
        >
          {speedText(timeline.speed)}
        </Button>
        {closable && (
          <IconButton
            icon={<CloseIcon className={ic} />}
            title="Close"
            shortcut={keyFor('timeline:close')}
            size="sm"
            onClick={timeline.close}
          />
        )}
        <Button variant="ghost" size="xs" onClick={onAddFrames}>
          Add Frames
        </Button>
      </div>
    </div>
  );
};
