import { Button, CloseIcon, IconButton, PauseIcon, RunIcon, Slider } from '../../design-system';
import { allKeysFor, keyFor } from '../../app/shortcuts';
import { speedText } from '../../workspace/timelinePlayback';
import type { TryTimeline } from '../../workspace/useTryTimeline';
import { runClock } from '../../utils/duration';
import { negative } from '../../../electron/minus.mjs';

interface Props {
  timeline: TryTimeline;
  closable: boolean;
}

export function TimelinePlayback({ timeline, closable }: Props) {
  const { frame, frames } = timeline;
  const ic = 'w-4 h-4';

  return (
    <div data-testid="timeline-playback" className="flex flex-wrap items-center gap-2">
      <div className="shrink-0">
        <IconButton
          icon={timeline.playing ? <PauseIcon className={ic} /> : <RunIcon className={ic} />}
          title={timeline.playing ? 'Pause' : 'Play'}
          shortcut={keyFor('timeline:play')}
          size="sm"
          onClick={timeline.toggle}
        />
      </div>
      <Slider
        className="flex-1 min-w-[200px]"
        stacked
        label={negative(timeline.origin + frame * timeline.dt, (seconds) => runClock(seconds))}
        value={frame}
        min={0}
        max={Math.max(frames - 1, 1)}
        format={() => negative(timeline.origin + (frames - 1) * timeline.dt, (seconds) => runClock(seconds))}
        onChange={(v) => timeline.seek(v)}
      />
      <div className="flex shrink-0 items-center gap-2">
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
      </div>
    </div>
  );
}
