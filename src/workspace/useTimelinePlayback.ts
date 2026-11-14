import { useEffect, useEffectEvent, useState } from 'react';
import { loopedFrame, nextSpeed, type LoopRange } from './timelinePlayback';

interface PlaybackOptions {
  frames: number;
  dt: number;
  seek: (frame: number) => void;
}

export function useTimelinePlayback({ frames, dt, seek }: PlaybackOptions) {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState<LoopRange | null>(null);
  const last = Math.max(frames - 1, 0);

  const jump = (to: number, count = frames) => {
    const next = Math.max(0, Math.min(count - 1, Math.round(to)));

    setFrame(next);
    seek(next);
  };

  const advance = useEffectEvent((from: number, seconds: number) => {
    const moved = Math.floor((seconds * speed) / dt);
    const next = loop ? loopedFrame(loop, from, moved) : Math.min(last, from + moved);

    if (next !== frame) jump(next);

    if (!loop && next >= last) setPlaying(false);

    return !!loop || next < last;
  });

  const startFrame = useEffectEvent(() => {
    if (loop && (frame < loop[0] || frame > loop[1])) return loop[0];

    return frame >= last ? 0 : frame;
  });

  useEffect(() => {
    if (!playing) return;

    const from = startFrame();
    const started = performance.now();
    let raf = 0;

    const tick = () => {
      if (advance(from, (performance.now() - started) / 1000)) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [playing, speed, loop]);

  return {
    frame: Math.min(frame, last),
    playing,
    speed,
    loop,
    jump: (to: number, count = frames) => {
      setPlaying(false);
      jump(to, count);
    },
    reset: (to: number, count: number) => {
      setPlaying(false);
      setLoop(null);
      jump(to, count);
    },
    step: (by: number) => {
      setPlaying(false);
      jump(frame + by);
    },
    toggle: () => setPlaying((p) => !p && frames > 1),
    stop: () => setPlaying(false),
    faster: (by: 1 | -1, wrap = false) => setSpeed((s) => nextSpeed(s, by, wrap)),
    setLoop: (range: LoopRange | null) => setLoop(range && range[1] > range[0] ? range : null),
  };
}
