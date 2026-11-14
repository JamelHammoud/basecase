import { CODE_FRAME_DEFAULT, CODE_FRAME_MAX, frameHeight, type CodeFrameMessage } from './codeFrameTypes';

export const FENCE_POLL_MS = 4;

export const FRAME_FPS_MIN = 1;

export interface FrameSpec {
  size: [number, number];
  fps: number;
}

export interface FrameClock {
  now: () => number;
  after: (ms: number, run: () => void) => () => void;
}

export interface FrameSurface<T> {
  target: (size: [number, number]) => T | null;
  draw: (key: string, target: T) => ImageBitmap | null;
  busy: () => boolean;
  drew: () => void;
}

export interface FramePort {
  postMessage: (message: CodeFrameMessage, transfer: Transferable[]) => void;
  addEventListener: (type: 'close', listener: () => void) => void;
  start: () => void;
  close: () => void;
}

interface Stream<T> {
  key: string;
  port: FramePort;
  target: T;
  intervalMs: number;
  openedAt: number;
  nextAt: number;
}

const clampInt = (value: number, max: number, fallback: number) =>
  Number.isFinite(value) && value >= 1 ? Math.min(Math.round(value), max) : fallback;

export function frameSpec(request: { width: number; height?: number; fps: number }): FrameSpec {
  const width = clampInt(request.width, CODE_FRAME_MAX.width, CODE_FRAME_DEFAULT.width);
  const height = clampInt(
    request.height ?? NaN,
    CODE_FRAME_MAX.height,
    Math.min(frameHeight(width), CODE_FRAME_MAX.height),
  );
  const fps = Number.isFinite(request.fps) && request.fps > 0 ? request.fps : CODE_FRAME_DEFAULT.fps;

  return { size: [width, height], fps: Math.min(Math.max(fps, FRAME_FPS_MIN), CODE_FRAME_MAX.fps) };
}

export const timerClock = (now: () => number): FrameClock => ({
  now,
  after: (ms, run) => {
    const timer = setTimeout(run, ms);

    return () => clearTimeout(timer);
  },
});

export class FrameStreams<T> {
  private readonly streams = new Map<string, Stream<T>>();

  private readonly clock: FrameClock;

  private readonly surface: FrameSurface<T>;

  private cancel: (() => void) | null = null;

  constructor(clock: FrameClock, surface: FrameSurface<T>) {
    this.clock = clock;
    this.surface = surface;
  }

  get size(): number {
    return this.streams.size;
  }

  open(id: string, request: { key: string } & FrameSpec, port: FramePort): void {
    this.close(id);

    const spec = frameSpec({ width: request.size[0], height: request.size[1], fps: request.fps });
    const target = this.surface.target(spec.size);

    if (!target) return port.close();

    const now = this.clock.now();

    this.streams.set(id, { key: request.key, port, target, intervalMs: 1000 / spec.fps, openedAt: now, nextAt: now });
    port.addEventListener('close', () => this.close(id));
    port.start();
    this.arm();
  }

  close(id: string): void {
    const stream = this.streams.get(id);

    if (!stream) return;

    this.streams.delete(id);
    stream.port.close();
    this.arm();
  }

  closeAll(): void {
    for (const id of [...this.streams.keys()]) this.close(id);
  }

  private arm(delay = this.nextDelay()): void {
    this.cancel?.();
    this.cancel = delay === null ? null : this.clock.after(delay, () => this.pump());
  }

  private nextDelay(): number | null {
    if (!this.streams.size) return null;

    const next = Math.min(...[...this.streams.values()].map((s) => s.nextAt));

    return Math.max(0, next - this.clock.now());
  }

  private pump(): void {
    this.cancel = null;

    if (this.surface.busy()) return this.arm(FENCE_POLL_MS);

    const now = this.clock.now();
    let drawn = 0;

    for (const stream of this.streams.values()) {
      if (stream.nextAt > now) continue;

      stream.nextAt += stream.intervalMs;

      if (stream.nextAt <= now) stream.nextAt = now + stream.intervalMs;

      if (this.send(stream, now)) drawn++;
    }

    if (drawn) this.surface.drew();

    this.arm();
  }

  private send(stream: Stream<T>, now: number): boolean {
    const bitmap = this.surface.draw(stream.key, stream.target);

    if (!bitmap) return false;

    stream.port.postMessage({ bitmap, time: (now - stream.openedAt) / 1000 }, [bitmap]);

    return true;
  }
}
