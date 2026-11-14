import React, { useEffect, useRef } from 'react';

interface TryVideoProps {
  src: string;
  seconds: number;
  playing: boolean;
}

const DRIFT_S = 0.25;

export const TryVideo: React.FC<TryVideoProps> = ({ src, seconds, playing }) => {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;

    if (!video) return;

    if (playing) void video.play().catch(() => undefined);
    else video.pause();
  }, [playing, src]);

  useEffect(() => {
    const video = ref.current;

    if (!video || (playing && Math.abs(video.currentTime - seconds) < DRIFT_S)) return;

    video.currentTime = seconds;
  }, [seconds, playing, src]);

  return (
    <video
      ref={ref}
      data-testid="try-video"
      src={src}
      muted
      playsInline
      preload="auto"
      className="w-[240px] shrink-0 self-start aspect-video rounded-[8px] bg-black object-contain"
    />
  );
};
