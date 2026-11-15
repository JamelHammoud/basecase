import { afterEach, describe, expect, it, vi } from 'vitest';
import { visionInferencePort } from './visionInferencePort';
import type { VisionResult } from '../vision/types';

const result: VisionResult = {
  camera: 'run:front',
  modelId: 'yolo11n',
  timestamp: 100,
  width: 640,
  height: 480,
  detections: [],
};
const bitmap = () => ({ close: vi.fn() }) as unknown as ImageBitmap;
const port = () =>
  ({
    postMessage: vi.fn(),
    close: vi.fn(),
    start: vi.fn(),
    onmessage: null,
    onmessageerror: null,
  }) as unknown as MessagePort;
const deliver = (target: MessagePort, data: unknown) => target.onmessage?.call(target, { data } as MessageEvent);

afterEach(() => vi.useRealTimers());

describe('rendered Routine inference port', () => {
  it('transfers one frame at a time and ignores an unrelated response', async () => {
    const target = port();
    const inference = visionInferencePort(target);
    const frame = bitmap();
    const pending = inference.infer({ frame, modelId: result.modelId, camera: result.camera!, timestamp: 100 });

    deliver(target, { type: 'result', result: { ...result, timestamp: 99 } });
    await expect(
      inference.infer({ frame: bitmap(), modelId: 'yolo11n', camera: 'other', timestamp: 100 }),
    ).rejects.toThrow('pending');
    deliver(target, { type: 'result', result });
    await expect(pending).resolves.toEqual(result);
    expect(target.postMessage).toHaveBeenCalledExactlyOnceWith(
      { type: 'frame', frame, modelId: result.modelId, camera: result.camera, timestamp: 100 },
      [frame],
    );
    inference.close();
    expect(target.close).toHaveBeenCalledOnce();
    expect(target.onmessage).toBeNull();
  });

  it('times out a silent worker, closes its port, and rejects further work', async () => {
    vi.useFakeTimers();

    const target = port();
    const inference = visionInferencePort(target, 50);
    const pending = inference.infer({ frame: bitmap(), modelId: 'yolo11n', camera: 'front', timestamp: 0 });
    const rejected = expect(pending).rejects.toThrow('timed out');

    await vi.advanceTimersByTimeAsync(50);
    await rejected;
    expect(target.close).toHaveBeenCalledOnce();
    await expect(
      inference.infer({ frame: bitmap(), modelId: 'yolo11n', camera: 'front', timestamp: 1 }),
    ).rejects.toThrow('closed');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects a cancelled request and clears timeout and listeners', async () => {
    vi.useFakeTimers();

    const target = port();
    const inference = visionInferencePort(target);
    const pending = inference.infer({ frame: bitmap(), modelId: 'yolo11n', camera: 'front', timestamp: 0 });
    const rejected = expect(pending).rejects.toThrow('closed');

    inference.close();
    await rejected;
    expect(target.onmessage).toBeNull();
    expect(target.onmessageerror).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('surfaces inference and message decoding failures without leaving a waiter', async () => {
    const target = port();
    const inference = visionInferencePort(target);
    const pending = inference.infer({ frame: bitmap(), modelId: 'yolo11n', camera: 'front', timestamp: 0 });

    deliver(target, { type: 'error', camera: 'front', modelId: 'yolo11n', timestamp: 0, error: 'Model failed' });
    await expect(pending).rejects.toThrow('Model failed');

    const next = inference.infer({ frame: bitmap(), modelId: 'yolo11n', camera: 'front', timestamp: 1 });

    target.onmessageerror?.call(target, {} as MessageEvent);
    await expect(next).rejects.toThrow('decoded');
    expect(target.close).toHaveBeenCalledOnce();
  });

  it('ignores another camera and a delayed failure from an earlier frame', async () => {
    const target = port();
    const inference = visionInferencePort(target);
    const pending = inference.infer({
      frame: bitmap(),
      modelId: result.modelId,
      camera: result.camera!,
      timestamp: 100,
    });

    deliver(target, { type: 'result', result: { ...result, camera: 'another-camera' } });
    deliver(target, { type: 'error', ...result, timestamp: 99, error: 'Earlier frame failed' });
    deliver(target, { type: 'result', result });
    await expect(pending).resolves.toEqual(result);
    inference.close();
  });
});
