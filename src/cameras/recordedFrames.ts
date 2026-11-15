import type { TrySource, TryVideo } from '../cases/tryFile';

export function recordedVideoTime(video: TryVideo, source: TrySource, seconds: number): number | null {
  const time = source === 'operate' ? seconds - video.from : seconds;
  const duration = video.to - video.from;

  if (!Number.isFinite(time) || time < 0 || time > duration) return null;

  return source === 'operate' ? time : video.from + time;
}

export interface RecordedSeek {
  seconds: number;
  timestamp: number;
}

interface FramePumpOptions<T> {
  decode: (seconds: number) => Promise<T | null>;
  emit: (frame: T, seek: RecordedSeek) => void | Promise<void>;
  fail: (error: unknown, seek: RecordedSeek) => void;
  fps: number;
}

export function createRecordedFramePump<T extends { close: () => void }>(options: FramePumpOptions<T>) {
  let latest: RecordedSeek | null = null;
  let closed = false;
  let busy = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let started = -Infinity;
  const interval = 1000 / Math.max(1, Math.min(30, options.fps));

  const schedule = () => {
    if (closed || busy || timer !== null || !latest) return;

    timer = setTimeout(() => void decode(), Math.max(0, started + interval - performance.now()));
  };
  const decode = async () => {
    timer = null;

    const seek = latest;

    if (closed || !seek) return;

    busy = true;
    started = performance.now();

    try {
      const frame = await options.decode(seek.seconds);

      if (frame && (closed || latest !== seek)) frame.close();
      else if (frame) await options.emit(frame, seek);
    } catch (error) {
      if (!closed && latest === seek) options.fail(error, seek);
    } finally {
      if (latest === seek) latest = null;

      busy = false;
      schedule();
    }
  };

  return {
    seek: (seconds: number, timestamp: number) => {
      if (closed) return;

      latest = { seconds, timestamp };
      schedule();
    },
    close: () => {
      closed = true;
      latest = null;

      if (timer !== null) clearTimeout(timer);

      timer = null;
    },
  };
}
