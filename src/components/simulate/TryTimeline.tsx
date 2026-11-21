import React, { useRef } from 'react';
import { Button, ErrorBoundary } from '../../design-system';
import { linkParts, prettyJointName, type Rig } from '../../utils/kinematics';
import type { TryTimeline as Timeline } from '../../workspace/useTryTimeline';
import { failureText } from '../../readiness/caseChecks';
import { SegmentLane } from './SegmentLane';
import { TimelineLane } from './TimelineLane';
import { useSegmentUndo } from './useSegmentUndo';
import { useTimelineKeys } from './useTimelineKeys';
import { SavedTimelinePanel } from './SavedTimelinePanel';
import { canExportTry } from '../../workspace/tryFileActions';
import { BranchTryControls } from './BranchTryControls';
import type { Cases } from '../../workspace/useCases';
import { TimelinePlayback } from './TimelinePlayback';

interface TryTimelineProps {
  timeline: Timeline;
  cases: Cases;
  onBranch: () => void;
  onExport: () => void;
  rig: Rig;
  closable: boolean;
  onSelectParts: (ids: string[]) => void;
  onAddFrames: () => void;
}

export const TryTimeline: React.FC<TryTimelineProps> = ({
  timeline,
  rig,
  closable,
  onSelectParts,
  onAddFrames,
  cases,
  onBranch,
  onExport,
}) => {
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
      {timeline.comparison.active && (
        <ErrorBoundary region="Tries">
          <SavedTimelinePanel
            key={timeline.comparison.sources.map((source) => source.hash).join(':')}
            saved={timeline.comparison}
          />
        </ErrorBoundary>
      )}
      {!timeline.comparison.active && (
        <SegmentLane
          labels={labels}
          frame={frame}
          frames={frames}
          jointName={jointName}
          onSeek={timeline.seek}
          onEdited={focus}
        />
      )}
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
      {timeline.trips[0] && <span className="text-[13px] text-red-400">{failureText(timeline.trips[0].label)}</span>}
      <TimelinePlayback timeline={timeline} closable={closable} />
      {!timeline.comparison.active && (
        <div data-testid="timeline-actions" className="flex flex-wrap items-center gap-2">
          <BranchTryControls cases={cases} onBranch={onBranch} />
          {canExportTry(timeline) && (
            <Button variant="ghost" size="xs" onClick={onExport}>
              Export Try
            </Button>
          )}
          <Button variant="ghost" size="xs" onClick={onAddFrames}>
            Add Frames
          </Button>
        </div>
      )}
    </div>
  );
};
