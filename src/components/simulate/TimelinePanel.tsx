import React from 'react';
import { CloseIcon, IconButton, PauseIcon, RunIcon, Slider } from '../../design-system';
import type { TimelineLane as Lane } from '../../cases/timelineLanes';
import { runClock } from '../../utils/duration';
import { TimelineLane } from './TimelineLane';

export interface TimelineRow {
  lane: Lane;
  name: string;
}

export interface TimelinePanelProps {
  rows: TimelineRow[];
  frame: number;
  frames: number;
  dt: number;
  playing: boolean;
  markers: number[];
  onSeek: (frame: number) => void;
  onToggle: () => void;
  onSelectLane?: (jointId: string) => void;
  onClose?: () => void;
}

const ic = 'w-4 h-4';

export const TimelinePanel: React.FC<TimelinePanelProps> = (props) => {
  const { rows, frame, frames, dt, playing, markers, onSeek, onToggle, onSelectLane, onClose } = props;

  return (
    <div
      data-testid="try-timeline"
      data-frame={frame}
      className="glass pointer-events-auto w-[min(760px,calc(100%-32px))] rounded-[12px] p-3 flex flex-col gap-2"
    >
      <div className="max-h-[40vh] overflow-y-auto flex flex-col gap-2">
        {rows.map(({ lane, name }) => (
          <TimelineLane
            key={lane.jointId}
            lane={lane}
            name={name}
            frame={frame}
            markers={markers}
            onSeek={onSeek}
            onSelect={onSelectLane && (() => onSelectLane(lane.jointId))}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <IconButton
          icon={playing ? <PauseIcon className={ic} /> : <RunIcon className={ic} />}
          title={playing ? 'Pause' : 'Play'}
          shortcut="Space"
          size="sm"
          onClick={onToggle}
        />
        <Slider
          className="flex-1 min-w-0"
          label={runClock(frame * dt)}
          value={frame}
          min={0}
          max={Math.max(frames - 1, 1)}
          format={() => runClock((frames - 1) * dt)}
          onChange={(v) => onSeek(v)}
        />
        {onClose && (
          <IconButton icon={<CloseIcon className={ic} />} title="Close" shortcut="Esc" size="sm" onClick={onClose} />
        )}
      </div>
    </div>
  );
};
