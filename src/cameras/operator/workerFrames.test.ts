import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Picture } from './runners';
import { createFrameQueue } from './workerFrames';

const picture = () => ({ close: vi.fn() }) as unknown as Picture;

afterEach(() => vi.useRealTimers());

describe('operator frame ownership', () => {
  it('closes replaced frames and the detected frame even when detection fails', async () => {
    vi.useFakeTimers();

    const error = new Error('Detector stopped');
    const detect = vi.fn(() => {
      throw error;
    });
    const fail = vi.fn();
    const queue = createFrameQueue({ wanted: () => true, detect, fail });
    const first = picture();
    const latest = picture();

    queue.take(first);
    queue.take(latest);
    expect(first.close).toHaveBeenCalledOnce();
    expect(latest.close).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(detect).toHaveBeenCalledExactlyOnceWith(latest, expect.any(Number));
    expect(latest.close).toHaveBeenCalledOnce();
    expect(fail).toHaveBeenCalledExactlyOnceWith(error);
    await queue.stop();
  });

  it('closes the retained frame before cancellation finishes and rejects late frames', async () => {
    vi.useFakeTimers();

    let finishCancellation = () => {};
    const cancellation = new Promise<void>((resolve) => {
      finishCancellation = resolve;
    });
    const cancelled = vi.fn(() => cancellation);
    const frame = picture();
    const late = picture();
    const detect = vi.fn();
    const stream = new ReadableStream<VideoFrame>({
      start: (controller) => controller.enqueue(frame as VideoFrame),
      cancel: cancelled,
    });
    const queue = createFrameQueue({ wanted: () => true, detect, fail: vi.fn() });
    const pumping = queue.pump(stream);

    await Promise.resolve();

    let stopped = false;
    const stopping = queue.stop().then(() => {
      stopped = true;
    });

    expect(frame.close).toHaveBeenCalledOnce();
    expect(cancelled).toHaveBeenCalledOnce();
    expect(stopped).toBe(false);
    queue.take(late);
    expect(late.close).toHaveBeenCalledOnce();
    finishCancellation();
    await Promise.all([pumping, stopping]);
    await vi.runAllTimersAsync();
    expect(stopped).toBe(true);
    expect(stream.locked).toBe(false);
    expect(detect).not.toHaveBeenCalled();
    expect(frame.close).toHaveBeenCalledOnce();
  });

  it('closes unwanted frames and releases a reader when the stream ends', async () => {
    const frame = picture();
    const detect = vi.fn();
    const stream = new ReadableStream<VideoFrame>({
      start(controller) {
        controller.enqueue(frame as VideoFrame);
        controller.close();
      },
    });
    const queue = createFrameQueue({ wanted: () => false, detect, fail: vi.fn() });

    await queue.pump(stream);
    expect(frame.close).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
    expect(detect).not.toHaveBeenCalled();
  });
});
