import { afterEach, expect, it, vi } from 'vitest';
import { LiveFeed } from './liveFeed';
import type { FeedEvent } from './feedProtocol';

afterEach(() => vi.unstubAllGlobals());

it('reports a refused inference connection on its cameras while display frames keep arriving', async () => {
  const workers: CameraWorker[] = [];

  class CameraWorker {
    onmessage: ((event: MessageEvent<FeedEvent>) => void) | null = null;
    postMessage = vi.fn();
    terminate = vi.fn();

    constructor() {
      workers.push(this);
    }
  }

  vi.stubGlobal('Worker', CameraWorker);

  const fail = vi.fn();
  const stop = vi.fn();
  const onFrames = vi.fn();
  const feed = new LiveFeed(new Map(), onFrames, {
    connectVisionFrames: async () => {
      throw new Error('The vision runtime is closed.');
    },
    onVisionAssignments: () => stop,
    visionAssignments: () => [],
    availableVisionCameras: () => ['front', 'wrist'],
    setCameraVisionError: fail,
  });

  await vi.waitFor(() => expect(fail).toHaveBeenCalledTimes(2));
  expect(fail.mock.calls).toEqual([
    ['front', 'The vision runtime is closed.'],
    ['wrist', 'The vision runtime is closed.'],
  ]);
  workers[0].onmessage?.({ data: { type: 'frame', bitmaps: {}, frames: 1 } } as MessageEvent<FeedEvent>);
  expect(onFrames).toHaveBeenCalledExactlyOnceWith(1);
  feed.dispose();
  expect(stop).toHaveBeenCalledOnce();
  expect(workers[0].terminate).toHaveBeenCalledOnce();
});
