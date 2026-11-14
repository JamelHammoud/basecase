import { useEffect, useEffectEvent, useState } from 'react';

interface PlaybackOptions {
  frames: number;
  dt: number;
  seek: (frame: number) => void;
}

export type LoopRange = [number, number];

export const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 2, 4] as const;

export function playedFrame(from: number, steps: number, end: { last: number; loop: LoopRange | null }): number {
  const { last, loop } = end;

  if (!loop) return Math.min(last, from + steps);

  const [a, b] = loop;
  const start = from < a || from > b ? a : from;

  return a + ((start - a + steps) % (b - a + 1));
}

export const loopOf = (from: number, to: number): LoopRange | null =>
  Math.round(from) === Math.round(to) ? null : [Math.round(Math.min(from, to)), Math.round(Math.max(from, to))];

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
    const next = playedFrame(from, Math.floor((seconds * speed) / dt), { last, loop });

    if (next !== frame) jump(next);

    if (!loop && next >= last) setPlaying(false);

    return !!loop || next < last;
  });

  const startFrame = useEffectEvent(() => {
    if (loop) return frame;

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

  const faster = (by: number) => {
    const at = PLAYBACK_SPEEDS.indexOf(speed as (typeof PLAYBACK_SPEEDS)[number]);

    setSpeed(PLAYBACK_SPEEDS[Math.max(0, Math.min(PLAYBACK_SPEEDS.length - 1, at + by))]);
  };

  return {
    frame: Math.min(frame, last),
    playing,
    speed,
    loop,
    jump: (to: number, count = frames) => {
      setPlaying(false);
      jump(to, count);
    },
    step: (by: number) => {
      setPlaying(false);
      jump(frame + by);
    },
    toggle: () => setPlaying((p) => !p && frames > 1),
    stop: () => {
      setPlaying(false);
      setLoop(null);
    },
    faster,
    setLoop: (from: number, to: number) => setLoop(loopOf(from, to)),
  };
}
