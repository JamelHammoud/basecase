import type { BridgeClock } from './codeSignals';

export const FRAME_WIDTH = { min: 16, max: 640, initial: 320 };
export const FRAME_FPS = { min: 1, max: 15, initial: 10 };
export const MAX_STREAMS = 4;

const BURST_FRAMES = 1.5;
const EPSILON_MS = 1e-6;

export interface FrameSize {
  width: number;
  height: number;
  fps: number;
}

export type FrameSource = (
  camera: string,
  size: FrameSize,
  onFrame: (bitmap: ImageBitmap) => void,
) => (() => void) | string;

export interface StreamRequest {
  id: number;
  camera: string;
  width?: number;
  fps?: number;
}

interface StreamOptions {
  source: FrameSource;
  clock: BridgeClock;
  post: (id: number, bitmap: ImageBitmap) => void;
  note: (error: string) => void;
}

export interface FrameStreams {
  open: (request: StreamRequest) => void;
  stop: (id: number) => void;
  close: () => void;
}

const clamp = (value: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, value));

export function frameSize(width?: number, fps?: number): FrameSize {
  const w = Math.round(clamp(width ?? FRAME_WIDTH.initial, FRAME_WIDTH));

  return { width: w, height: Math.round((w * 3) / 4), fps: clamp(fps ?? FRAME_FPS.initial, FRAME_FPS) };
}

export const dropFrame = (bitmap: ImageBitmap) => (bitmap as Partial<ImageBitmap>).close?.();

function pacer(clock: BridgeClock, fps: number) {
  const interval = 1000 / fps;
  let last: number | null = null;
  let credit = 0;

  return () => {
    const now = clock.now();

    credit = last === null ? interval : Math.min(interval * BURST_FRAMES, credit + now - last);
    last = now;

    if (credit < interval - EPSILON_MS) return false;

    credit -= interval;

    return true;
  };
}

export function frameStreams({ source, clock, post, note }: StreamOptions): FrameStreams {
  const streams = new Map<number, () => void>();
  let closed = false;

  const stop = (id: number) => {
    streams.get(id)?.();
    streams.delete(id);
  };

  return {
    open(request) {
      if (closed) return;

      stop(request.id);

      if (streams.size >= MAX_STREAMS) {
        note(`frames refused: holds ${MAX_STREAMS} streams already`);

        return;
      }

      const size = frameSize(request.width, request.fps);
      const due = pacer(clock, size.fps);
      let live = true;

      const onFrame = (bitmap: ImageBitmap) => {
        if (live && !closed && due()) post(request.id, bitmap);
        else dropFrame(bitmap);
      };

      const stopSource = source(request.camera, size, onFrame);

      if (typeof stopSource === 'string') {
        live = false;
        note(`frames refused: ${stopSource}`);

        return;
      }

      streams.set(request.id, () => {
        live = false;
        stopSource();
      });
    },
    stop,
    close() {
      closed = true;
      streams.forEach((end) => end());
      streams.clear();
    },
  };
}
