import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CodeFrameMessage } from './codeFrameTypes';
import { FENCE_POLL_MS, frameSpec, FrameStreams, timerClock, type FramePort } from './frameStreams';

interface FakeTarget {
  width: number;
  height: number;
}

interface FakePort extends FramePort {
  received: { width: number; height: number; time: number }[];
  closed: boolean;
  hangUp: () => void;
}

function fakePort(): FakePort {
  const onClose: (() => void)[] = [];
  const port: FakePort = {
    received: [],
    closed: false,
    postMessage: (message: CodeFrameMessage, transfer: Transferable[]) => {
      expect(transfer).toEqual([message.bitmap]);
      port.received.push({ width: message.bitmap.width, height: message.bitmap.height, time: message.time });
    },
    addEventListener: (_type, listener) => {
      onClose.push(listener);
    },
    start: () => undefined,
    close: () => {
      port.closed = true;
    },
    hangUp: () => onClose.forEach((listener) => listener()),
  };

  return port;
}

function setup(views = ['scene']) {
  const gpu = { busy: false, marks: 0 };
  const streams = new FrameStreams<FakeTarget>(
    timerClock(() => Date.now()),
    {
      target: ([width, height]) => ({ width, height }),
      draw: (key, target) => (views.includes(key) ? ({ ...target, close: () => undefined } as ImageBitmap) : null),
      busy: () => gpu.busy,
      drew: () => gpu.marks++,
    },
  );

  return { streams, gpu };
}

describe('frame streams to code', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends frames at the requested size and rate', () => {
    const { streams, gpu } = setup();
    const port = fakePort();

    streams.open('a', { key: 'scene', size: [320, 240], fps: 15 }, port);
    vi.advanceTimersByTime(2000);

    expect(port.received.length).toBeGreaterThanOrEqual(29);
    expect(port.received.length).toBeLessThanOrEqual(31);
    expect(port.received.every((f) => f.width === 320 && f.height === 240)).toBe(true);
    expect(port.received.at(-1)!.time).toBeCloseTo((port.received.length - 1) / 15, 1);
    expect(gpu.marks).toBe(port.received.length);
  });

  it('clamps sizes and rates above the caps', () => {
    const { streams } = setup();
    const port = fakePort();

    streams.open('a', { key: 'scene', size: [1920, 1080], fps: 60 }, port);
    vi.advanceTimersByTime(2000);

    expect(port.received.length).toBeGreaterThanOrEqual(29);
    expect(port.received.length).toBeLessThanOrEqual(31);
    expect(port.received.every((f) => f.width === 640 && f.height === 480)).toBe(true);
    expect(frameSpec({ width: Number.NaN, fps: 0 })).toEqual({ size: [160, 120], fps: 10 });
    expect(frameSpec({ width: 0.2, height: -5, fps: 0.01 })).toEqual({ size: [160, 120], fps: 1 });
  });

  it('keeps two streams at their own rates', () => {
    const { streams } = setup(['scene', 'wrist']);
    const fast = fakePort();
    const slow = fakePort();

    streams.open('a', { key: 'scene', size: [160, 120], fps: 10 }, fast);
    streams.open('b', { key: 'wrist', size: [320, 240], fps: 2 }, slow);
    vi.advanceTimersByTime(3000);

    expect(fast.received.length).toBeGreaterThanOrEqual(29);
    expect(fast.received.length).toBeLessThanOrEqual(31);
    expect(slow.received.length).toBeGreaterThanOrEqual(6);
    expect(slow.received.length).toBeLessThanOrEqual(7);
  });

  it('sends nothing after the stream closes, its port closes or the Case stops', () => {
    const { streams } = setup();
    const ports = [fakePort(), fakePort(), fakePort()];

    ports.forEach((port, i) => streams.open(`s${i}`, { key: 'scene', size: [160, 120], fps: 15 }, port));
    vi.advanceTimersByTime(500);

    const counts = ports.map((p) => p.received.length);

    streams.close('s0');
    ports[1].hangUp();
    vi.advanceTimersByTime(1000);

    expect(ports[0].received).toHaveLength(counts[0]);
    expect(ports[1].received).toHaveLength(counts[1]);
    expect(ports[2].received.length).toBeGreaterThan(counts[2]);
    expect(ports[0].closed).toBe(true);

    streams.closeAll();

    const last = ports[2].received.length;

    vi.advanceTimersByTime(1000);

    expect(ports[2].received).toHaveLength(last);
    expect(streams.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for the GPU instead of queueing behind it, and skips a view it doesn’t have', () => {
    const { streams, gpu } = setup();
    const port = fakePort();
    const missing = fakePort();

    gpu.busy = true;
    streams.open('a', { key: 'scene', size: [160, 120], fps: 15 }, port);
    streams.open('b', { key: 'garage', size: [160, 120], fps: 15 }, missing);
    vi.advanceTimersByTime(500);

    expect(port.received).toEqual([]);

    gpu.busy = false;
    vi.advanceTimersByTime(FENCE_POLL_MS);

    expect(port.received).toHaveLength(1);
    expect(missing.received).toEqual([]);
  });
});
