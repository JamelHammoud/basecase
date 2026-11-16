import { useEffect, useState } from 'react';
import type { SeedReplay } from '../cases/seedReplay';
import { Button, Slider } from '../design-system';
import type { Simulation } from '../sim/useSimulation';
import { runClock } from '../utils/duration';

export function GalleryReplayControls({ replay, sim }: { replay: SeedReplay; sim: Simulation }) {
  const [frame, setFrame] = useState(replay.trips[0]?.frame ?? 0);
  const [playing, setPlaying] = useState(false);
  const { seek } = sim;
  const last = Math.max(0, replay.recording.frames - 1);

  useEffect(() => {
    seek(frame);
  }, [frame, seek]);

  useEffect(() => {
    if (!playing) return;

    const timer = setInterval(
      () => setFrame((current) => (current >= last ? 0 : current + 1)),
      replay.recording.dt * 1000,
    );

    return () => clearInterval(timer);
  }, [playing, last, replay.recording.dt]);

  return (
    <div className="flex flex-col gap-3" data-testid="gallery-replay">
      <Button onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</Button>
      <Slider
        label="Time"
        stacked
        min={0}
        max={Math.max(last, 1)}
        value={frame}
        format={(value) => runClock(value * replay.recording.dt)}
        onChange={(value) => {
          setPlaying(false);
          setFrame(value);
        }}
      />
    </div>
  );
}
