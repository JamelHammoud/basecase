import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRecordedFramePump, recordedVideoTime } from './recordedFrames';

afterEach(() => vi.useRealTimers());

describe('recorded camera frames', () => {
  it('uses source offsets for imported clips and timeline placement for Operate clips', () => {
    const clip = { camera: 'front', path: 'front.mp4', from: 10, to: 14 };

    expect(recordedVideoTime(clip, 'import', 2)).toBe(12);
    expect(recordedVideoTime(clip, 'import', 5)).toBeNull();
    expect(recordedVideoTime(clip, 'operate', 12)).toBe(2);
    expect(recordedVideoTime(clip, 'operate', 2)).toBeNull();
    expect(recordedVideoTime(clip, 'operate', 15)).toBeNull();
  });

  it('discards a decode overtaken by a newer seek and caps the decode rate', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });

    let finish: ((frame: { close: () => void }) => void) | undefined;
    const stale = { close: vi.fn() };
    const latest = { close: vi.fn() };
    const decode = vi.fn(() => new Promise<{ close: () => void }>((resolve) => (finish = resolve)));
    const emit = vi.fn();
    const pump = createRecordedFramePump({ decode, emit, fps: 10, fail: vi.fn() });

    pump.seek(1, 100);
    await vi.advanceTimersByTimeAsync(0);
    pump.seek(2, 101);
    pump.seek(3, 102);
    finish?.(stale);
    await vi.advanceTimersByTimeAsync(99);
    expect(stale.close).toHaveBeenCalledOnce();
    expect(decode).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(decode).toHaveBeenLastCalledWith(3);
    finish?.(latest);
    await vi.advanceTimersByTimeAsync(0);
    expect(emit).toHaveBeenCalledExactlyOnceWith(latest, { seconds: 3, timestamp: 102 });
    pump.close();
  });

  it('closes a decoded frame when playback closes during decoding', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });

    let finish: ((frame: { close: () => void }) => void) | undefined;
    const frame = { close: vi.fn() };
    const emit = vi.fn();
    const pump = createRecordedFramePump({
      decode: () => new Promise<{ close: () => void }>((resolve) => (finish = resolve)),
      emit,
      fps: 10,
      fail: vi.fn(),
    });

    pump.seek(1, 100);
    await vi.advanceTimersByTimeAsync(0);
    pump.close();
    finish?.(frame);
    await vi.advanceTimersByTimeAsync(0);
    expect(frame.close).toHaveBeenCalledOnce();
    expect(emit).not.toHaveBeenCalled();
  });

  it('keeps only the latest seek while a decoded sample is still being emitted', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });

    let finish: () => void = () => undefined;
    const frame = { close: vi.fn() };
    const decode = vi.fn(async () => frame);
    const emit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const pump = createRecordedFramePump({ decode, emit, fps: 10, fail: vi.fn() });

    pump.seek(0, 100);
    await vi.advanceTimersByTimeAsync(0);

    for (let index = 1; index <= 20; index++) {
      pump.seek(index, 100 + index);
      await vi.advanceTimersByTimeAsync(100);
    }

    expect(decode).toHaveBeenCalledExactlyOnceWith(0);
    expect(emit).toHaveBeenCalledOnce();
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(decode).toHaveBeenCalledTimes(2);
    expect(decode).toHaveBeenLastCalledWith(20);
    expect(emit).toHaveBeenLastCalledWith(frame, { seconds: 20, timestamp: 120 });
    pump.close();
    finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(decode).toHaveBeenCalledTimes(2);
  });

  it('ignores a decode failure from an older seek and identifies a current failure', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });

    let reject: (error: Error) => void = (error) => {
      throw error;
    };
    const error = new Error('Decode failed');
    const fail = vi.fn();
    const pump = createRecordedFramePump({
      decode: () => new Promise<{ close: () => void }>((_resolve, refuse) => (reject = refuse)),
      emit: vi.fn(),
      fps: 10,
      fail,
    });

    pump.seek(1, 100);
    await vi.advanceTimersByTimeAsync(0);
    pump.seek(2, 101);
    reject(error);
    await vi.advanceTimersByTimeAsync(100);
    expect(fail).not.toHaveBeenCalled();
    reject(error);
    await vi.advanceTimersByTimeAsync(0);
    expect(fail).toHaveBeenCalledExactlyOnceWith(error, { seconds: 2, timestamp: 101 });
    pump.close();
  });
});
