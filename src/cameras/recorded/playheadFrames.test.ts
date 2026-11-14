import { describe, expect, it, vi } from 'vitest';
import { PlayheadFrames } from './playheadFrames';

const settled = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('recorded camera playhead', () => {
  it('decodes only the newest queued playhead and never paints an obsolete seek', async () => {
    let finish: ((value: number) => void) | undefined;
    const decode = vi.fn(
      (time: number) =>
        new Promise<number>((resolve) => {
          finish = () => resolve(time);
        }),
    );
    const paint = vi.fn();
    const frames = new PlayheadFrames({ decode, paint, error: vi.fn() });

    frames.seek(1);
    frames.seek(2);
    frames.seek(3);
    expect(decode).toHaveBeenCalledTimes(1);
    finish?.(1);
    await settled();
    expect(paint).not.toHaveBeenCalled();
    expect(decode).toHaveBeenLastCalledWith(3);
    finish?.(3);
    await settled();
    expect(paint).toHaveBeenCalledWith(3, 3);
    frames.seek(3);
    expect(decode).toHaveBeenCalledTimes(2);
  });

  it('stops painting when closed and recovers from a refused decode', async () => {
    const paint = vi.fn();
    const error = vi.fn();
    const decode = vi.fn().mockRejectedValueOnce(new Error('decode')).mockResolvedValue(5);
    const frames = new PlayheadFrames<number>({ decode, paint, error });

    frames.seek(1);
    await settled();
    expect(error).toHaveBeenCalledOnce();
    frames.seek(5);
    frames.close();
    await settled();
    expect(paint).not.toHaveBeenCalled();
  });
});
