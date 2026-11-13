import { useEffect, useEffectEvent, useState } from 'react';

interface PlaybackOptions {
  frames: number;
  dt: number;
  seek: (frame: number) => void;
}

export function useTimelinePlayback({ frames, dt, seek }: PlaybackOptions) {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const last = Math.max(frames - 1, 0);

  const jump = (to: number, count = frames) => {
    const next = Math.max(0, Math.min(count - 1, Math.round(to)));

    setFrame(next);
    seek(next);
  };

  const advance = useEffectEvent((from: number, seconds: number) => {
    const next = Math.min(last, from + Math.floor(seconds / dt));

    if (next !== frame) jump(next);

    if (next >= last) setPlaying(false);

    return next < last;
  });

  const startFrame = useEffectEvent(() => (frame >= last ? 0 : frame));

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
  }, [playing]);

  return {
    frame: Math.min(frame, last),
    playing,
    jump: (to: number, count = frames) => {
      setPlaying(false);
      jump(to, count);
    },
    step: (by: number) => {
      setPlaying(false);
      jump(frame + by);
    },
    toggle: () => setPlaying((p) => !p && frames > 1),
    stop: () => setPlaying(false),
  };
}
