import { describe, expect, it, vi } from 'vitest';
import { VisionFrameQueue } from './frameQueue';
import type { VisionFrame } from './protocol';

function frame(timestamp: number, camera = 'front'): VisionFrame {
  return { camera, timestamp, image: { close: vi.fn(), width: 2, height: 2 } as unknown as ImageBitmap };
}

describe('vision latest frame queue', () => {
  it('runs one frame at a time, replaces queued frames and closes every bitmap', async () => {
    let finish: (() => void) | undefined;
    const first = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const seen: number[] = [];
    const queue = new VisionFrameQueue(async (value) => {
      seen.push(value.timestamp);

      if (value.timestamp === 1) await first;
    });
    const frames = [frame(1), frame(2), frame(3), frame(4, 'side')];

    frames.forEach((value) => queue.push(value));
    expect(frames[1].image.close).toHaveBeenCalledOnce();
    expect(seen).toEqual([1]);
    finish?.();
    await queue.idle();
    expect(seen).toEqual([1, 3, 4]);
    frames.forEach((value) => expect(value.image.close).toHaveBeenCalledOnce());
    queue.dispose();
  });

  it('recovers from failed frames and disposes queued bitmaps without inference', async () => {
    const error = vi.fn();
    const queue = new VisionFrameQueue(async () => {
      throw new Error('failed');
    }, error);
    const value = frame(1);

    queue.push(value);
    await queue.idle();
    expect(error).toHaveBeenCalledOnce();
    expect(value.image.close).toHaveBeenCalledOnce();
    queue.dispose();

    const late = frame(2);

    queue.push(late);
    expect(late.image.close).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
  });
});
