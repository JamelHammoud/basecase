import { afterEach, expect, it, vi } from 'vitest';
import { LiveFeed } from './liveFeed';

afterEach(() => vi.unstubAllGlobals());

it('keeps displaying camera frames and reports a failed inference connection', async () => {
  const worker = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: (_event: unknown) => undefined };

  vi.stubGlobal(
    'Worker',
    class {
      constructor() {
        return worker;
      }
    },
  );

  const failure = new Error('The vision worker stopped.');
  const setCameraVisionError = vi.fn();
  const onFrames = vi.fn();
  const feed = new LiveFeed(new Map(), onFrames, {
    connectVisionFrames: () => Promise.reject(failure),
    onVisionAssignments: () => () => undefined,
    visionAssignments: () => [{ camera: 'wrist', modelId: 'rfdetr-nano', fps: 5 }],
    setCameraVisionError,
  });

  await vi.waitFor(() => expect(setCameraVisionError).toHaveBeenCalledWith('wrist', failure.message));
  worker.onmessage({ data: { type: 'frame', bitmaps: {}, frames: 7 } });
  expect(onFrames).toHaveBeenCalledWith(7);
  feed.dispose();
});
