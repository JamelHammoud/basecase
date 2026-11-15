import { afterEach, expect, it, vi } from 'vitest';
import type { FeedRequest } from './feedProtocol';
import type { LiveJob } from './liveStage';

const stage = vi.hoisted(() => ({
  draw: vi.fn(),
  setScene: vi.fn(async () => true),
  setViews: vi.fn(),
  finish: vi.fn(),
  send: vi.fn(async () => undefined),
  configure: vi.fn(),
}));

vi.mock('./liveStage', () => ({
  LiveStage: class {
    renderer = { getContext: () => ({ finish: stage.finish }) };
    draw = stage.draw;
    setScene = stage.setScene;
    setViews = stage.setViews;
  },
}));
vi.mock('./visionFrames', () => ({
  visionBitmapCopier: () => vi.fn(),
  visionFrameSender: () => ({ send: stage.send, configure: stage.configure }),
}));

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('finishes asynchronous draws before sending pixels and keeps hidden continuous vision serialized', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });

  const pending: { jobs: LiveJob[]; resolve: (jobs: LiveJob[]) => void }[] = [];
  const bitmap = { close: vi.fn() };
  const transfer = vi.fn(() => bitmap);
  const scope = {
    onmessage: (_event: MessageEvent<FeedRequest>) => {},
    postMessage: vi.fn(),
  };
  const request = (data: FeedRequest) => scope.onmessage({ data } as MessageEvent<FeedRequest>);

  vi.stubGlobal('self', scope);
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext = () => ({});
      transferToImageBitmap = transfer;
    },
  );
  stage.draw.mockImplementation(
    (_poses, jobs: LiveJob[]) => new Promise<LiveJob[]>((resolve) => pending.push({ jobs, resolve })),
  );
  await import('./feed.worker');

  const views = [{ key: 'scene', label: 'Scene', position: [0, 0, 1], target: [0, 0, 0] }] as Extract<
    FeedRequest,
    { type: 'views' }
  >['views'];
  const assignments = [{ camera: 'scene', modelId: 'objects', fps: 10, continuous: true }];

  request({ type: 'scene', parts: [], world: [], meshes: {}, imported: null });
  request({ type: 'views', views, sizes: { scene: [320, 240] } });
  request({ type: 'vision', assignments });
  await vi.advanceTimersByTimeAsync(0);
  expect(stage.draw).toHaveBeenCalledOnce();
  expect(stage.setScene).toHaveBeenCalledWith([], [], {}, null);
  expect(stage.send).not.toHaveBeenCalled();
  expect(transfer).not.toHaveBeenCalled();

  request({ type: 'views', views, sizes: {} });
  await vi.advanceTimersByTimeAsync(200);
  expect(stage.draw).toHaveBeenCalledOnce();
  pending[0].resolve(pending[0].jobs);
  await vi.advanceTimersByTimeAsync(0);
  expect(stage.finish).toHaveBeenCalledOnce();
  expect(stage.send).toHaveBeenCalledWith('scene', 0);
  expect(scope.postMessage).toHaveBeenCalledWith({ type: 'frame', bitmaps: { scene: bitmap }, frames: 1 }, [bitmap]);
  expect(stage.draw).toHaveBeenCalledTimes(2);
  expect(pending[1].jobs.map((job) => job.key)).toEqual(['scene']);

  pending[1].resolve(pending[1].jobs);
  await vi.advanceTimersByTimeAsync(100);
  expect(stage.send).toHaveBeenCalledTimes(2);
  expect(scope.postMessage).toHaveBeenCalledOnce();
  expect(stage.draw).toHaveBeenCalledTimes(3);
  request({ type: 'vision', assignments: [] });
  pending[2].resolve(pending[2].jobs);
  await vi.advanceTimersByTimeAsync(0);
});
