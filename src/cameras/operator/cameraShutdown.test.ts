import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaseMat } from '../../cases/mat/matLayout';
import type { TagsRequest } from '../mat/tagsProtocol';
import type { PoseRequest } from './poseProtocol';

vi.mock('./liveVision', () => ({
  createOperatorVision: () => ({ wanted: () => true, take: vi.fn(), close: vi.fn() }),
}));
vi.mock('../mat/matTracker', () => ({ trackMat: vi.fn(), createMatTracker: vi.fn() }));
vi.mock('../mat/tagDetector', () => ({
  loadTagDetector: async () => ({ detect: vi.fn(), dispose: vi.fn() }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('camera worker shutdown', () => {
  it.each(['operator', 'mat'])('lets the %s worker cancel its frame stream before closing', async (kind) => {
    vi.useFakeTimers();

    let finishCancellation = () => {};
    const cancellation = new Promise<void>((resolve) => {
      finishCancellation = resolve;
    });
    const cancelled = vi.fn(() => cancellation);
    const frame = { close: vi.fn() } as unknown as VideoFrame;
    let enqueueFrame = () => {};
    const frames = new ReadableStream<VideoFrame>({
      start: (controller) => {
        enqueueFrame = () => controller.enqueue(frame);
      },
      cancel: cancelled,
    });
    const scope = {
      onmessage: null as ((event: MessageEvent<PoseRequest | TagsRequest>) => void) | null,
      postMessage: vi.fn(),
      close: vi.fn(),
    };

    vi.stubGlobal('self', scope);

    if (kind === 'operator') await import('./pose.worker');
    else await import('../mat/tags.worker');

    const send = (data: PoseRequest | TagsRequest) => scope.onmessage!({ data } as MessageEvent<typeof data>);

    send({ type: 'open', mat: {} as CaseMat, frames });
    await Promise.resolve();
    scope.postMessage.mockClear();
    enqueueFrame();
    await Promise.resolve();
    expect(frame.close).not.toHaveBeenCalled();
    send({ type: 'close' });
    expect(frame.close).toHaveBeenCalledOnce();
    expect(cancelled).toHaveBeenCalledOnce();
    expect(scope.close).not.toHaveBeenCalled();
    finishCancellation();
    await vi.runAllTimersAsync();
    expect(scope.close).toHaveBeenCalledOnce();
    expect(frame.close).toHaveBeenCalledOnce();
    expect(scope.postMessage).not.toHaveBeenCalled();
  });
});
