import type { TrySource, TryVideo } from '../../cases/tryFile';

export function videoTime(video: TryVideo, source: TrySource, time: number): number | null {
  if (!Number.isFinite(time) || time < 0) return null;

  const position = source === 'operate' ? time - video.from : time;
  const duration = video.to - video.from;

  if (position < 0 || position >= duration) return null;

  return source === 'operate' ? position : video.from + position;
}
