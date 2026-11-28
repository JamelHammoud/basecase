import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveFeed } from './liveFeed';
import type { VisionFrameConnection } from './visionSession';
import type { CameraView } from './views';

vi.mock('./liveStage', () => ({ LARGE_SIZE: [640, 480], TILE_SIZE: [320, 240] }));

const meshFiles = vi.hoisted(() => vi.fn());

vi.mock('../three/componentMeshes', () => ({ renderMeshFiles: meshFiles }));

class FeedWorker {
  static readonly instances: FeedWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    FeedWorker.instances.push(this);
  }
}

beforeEach(() => meshFiles.mockReset().mockResolvedValue({}));
afterEach(() => vi.unstubAllGlobals());

describe('camera feed inference ownership', () => {
  it('reports a render-worker crash, clears owned inference and ignores its late connection', async () => {
    vi.stubGlobal('Worker', FeedWorker);

    const report = vi.fn();
    const disconnect = vi.fn();
    const stopAssignments = vi.fn();
    const port = { close: vi.fn() } as unknown as MessagePort;
    const feed = new LiveFeed(new Map(), vi.fn(), {
      connectVisionFrames: async () => ({ port, disconnect }),
      onVisionAssignments: () => stopAssignments,
      visionAssignments: () => [],
      setCameraVisionError: report,
    });
    const worker = FeedWorker.instances.at(-1)!;

    worker.onerror?.({ message: 'WebGL context lost.' } as ErrorEvent);
    feed.views([{ key: 'front' } as CameraView], null);
    await Promise.resolve();
    expect(report).toHaveBeenCalledWith('front', 'WebGL context lost.');
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(stopAssignments).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(port.close).toHaveBeenCalledOnce();
    expect(worker.postMessage).not.toHaveBeenCalled();
    feed.dispose();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('routes a failed frame to its camera without dropping independent tiles or streams', async () => {
    vi.stubGlobal('Worker', FeedWorker);

    const report = vi.fn();
    const onFrames = vi.fn();
    const feed = new LiveFeed(new Map(), onFrames, {
      connectVisionFrames: async () => ({
        port: { close: vi.fn() } as unknown as MessagePort,
        disconnect: vi.fn(),
      }),
      onVisionAssignments: () => vi.fn(),
      visionAssignments: () => [],
      setCameraVisionError: report,
    });
    const worker = FeedWorker.instances.at(-1)!;

    worker.onmessage?.({
      data: { type: 'error', camera: 'front', message: 'Frame copy failed.' },
    } as MessageEvent);
    worker.onmessage?.({ data: { type: 'frame', frames: 1, bitmaps: {} } } as MessageEvent);
    expect(report).toHaveBeenCalledExactlyOnceWith('front', 'Frame copy failed.');
    expect(onFrames).toHaveBeenCalledExactlyOnceWith(1);
    expect(worker.terminate).not.toHaveBeenCalled();
    await Promise.resolve();
    feed.dispose();
  });

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
});

describe('camera feed preparation and disposal', () => {
  it('reports current mesh preparation failures and ignores a superseded scene failure', async () => {
    vi.stubGlobal('Worker', FeedWorker);

    const report = vi.fn();
    const feed = new LiveFeed(new Map(), vi.fn(), {
      connectVisionFrames: async () => ({
        port: { close: vi.fn() } as unknown as MessagePort,
        disconnect: vi.fn(),
      }),
      onVisionAssignments: () => vi.fn(),
      visionAssignments: () => [],
      setCameraVisionError: report,
    });
    let rejectScene: (error: Error) => void = (_error) => undefined;

    feed.views([{ key: 'front' } as CameraView], null);
    meshFiles.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectScene = reject;
        }),
    );

    const stale = feed.scene([], [], { hash: 'old' } as Parameters<LiveFeed['scene']>[2]);

    await feed.scene([], [], { hash: 'new' } as Parameters<LiveFeed['scene']>[2]);
    rejectScene(new Error('Old scene failed.'));
    await stale;
    expect(report).not.toHaveBeenCalled();
    meshFiles.mockRejectedValueOnce(new Error('Mesh preparation failed.'));
    await feed.scene([], [], { hash: 'current' } as Parameters<LiveFeed['scene']>[2]);
    expect(report).toHaveBeenCalledExactlyOnceWith('front', 'Mesh preparation failed.');
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
