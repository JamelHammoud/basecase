import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveFeed } from './liveFeed';
import type { VisionFrameConnection } from './visionSession';
import type { CameraView } from './views';

vi.mock('./liveStage', () => ({ LARGE_SIZE: [640, 480], TILE_SIZE: [320, 240] }));

class FeedWorker {
  static readonly instances: FeedWorker[] = [];
  onmessage = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    FeedWorker.instances.push(this);
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('camera feed inference ownership', () => {
  it('shows a failed inference connection on its camera without an unhandled rejection', async () => {
    vi.stubGlobal('Worker', FeedWorker);

    const report = vi.fn();
    const feed = new LiveFeed(new Map(), vi.fn(), {
      connectVisionFrames: async () => {
        throw new Error('The vision worker stopped.');
      },
      onVisionAssignments: () => vi.fn(),
      visionAssignments: () => [],
      setCameraVisionError: report,
    });

    feed.views([{ key: 'front' } as CameraView], null);
    await vi.waitFor(() => expect(report).toHaveBeenCalledExactlyOnceWith('front', 'The vision worker stopped.'));
    feed.dispose();
  });

  it('disconnects inference before immediately terminating its camera worker', async () => {
    vi.stubGlobal('Worker', FeedWorker);

    const disconnect = vi.fn();
    const port = { close: vi.fn() } as unknown as MessagePort;
    const stopAssignments = vi.fn();
    const feed = new LiveFeed(new Map(), vi.fn(), {
      connectVisionFrames: async () => ({ port, disconnect }),
      onVisionAssignments: () => stopAssignments,
      visionAssignments: () => [],
      setCameraVisionError: vi.fn(),
    });

    await Promise.resolve();

    const worker = FeedWorker.instances.at(-1)!;

    worker.terminate.mockImplementation(() => expect(disconnect).toHaveBeenCalledOnce());
    feed.dispose();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(stopAssignments).toHaveBeenCalledOnce();
  });

  it('disconnects a connection that finishes after the camera worker closes', async () => {
    vi.stubGlobal('Worker', FeedWorker);

    let finish: (connection: VisionFrameConnection) => void = (connection) => connection.port.close();
    const pending = new Promise<VisionFrameConnection>((resolve) => {
      finish = resolve;
    });
    const disconnect = vi.fn();
    const port = { close: vi.fn() } as unknown as MessagePort;
    const feed = new LiveFeed(new Map(), vi.fn(), {
      connectVisionFrames: () => pending,
      onVisionAssignments: () => vi.fn(),
      visionAssignments: () => [],
      setCameraVisionError: vi.fn(),
    });

    feed.dispose();
    finish({ port, disconnect });
    await pending;
    expect(disconnect).toHaveBeenCalledOnce();
    expect(port.close).toHaveBeenCalledOnce();
    expect(FeedWorker.instances.at(-1)!.postMessage).not.toHaveBeenCalled();
  });
});
