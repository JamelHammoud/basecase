import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { FeedRequest } from './feedProtocol';
import type { LiveJob } from './liveStage';
import type { CameraView } from './views';

const stage = vi.hoisted(() => ({ draw: vi.fn(), finish: vi.fn() }));

vi.mock('./liveStage', () => ({
  LiveStage: class {
    renderer = { getContext: () => ({ finish: stage.finish }) };
    setViews = vi.fn();
    draw = stage.draw;
  },
}));

class Canvas {
  width: number;
  height: number;
  pixels = false;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext() {
    return {
      drawImage: (source: Canvas) => {
        this.pixels = source.pixels;
      },
    };
  }

  transferToImageBitmap() {
    const bitmap = { pixels: this.pixels, close: vi.fn() };

    this.pixels = false;

    return bitmap;
  }
}

const scope = {
  onmessage: (_event: MessageEvent<FeedRequest>) => undefined,
  postMessage: vi.fn(),
};
const send = (data: FeedRequest) => scope.onmessage({ data } as MessageEvent<FeedRequest>);

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  vi.stubGlobal('self', scope);
  vi.stubGlobal('OffscreenCanvas', Canvas);
  stage.draw.mockImplementation(async (_poses: unknown, jobs: LiveJob[]) => {
    for (const job of jobs) (job.target.canvas as unknown as Canvas).pixels = true;

    return jobs;
  });
  await import('./feed.worker');
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('delivers rendered pixels to inference before transferring the visible tile and keeps hidden inference active', async () => {
  const port = { postMessage: vi.fn(), close: vi.fn() } as unknown as MessagePort;
  const views = [{ key: 'wrist' } as CameraView];
  const source = { id: 'fixture-feed', scene: 'kitchen', kind: 'simulated' as const };

  send({ type: 'vision-port', port, timeOrigin: performance.timeOrigin });
  send({ type: 'vision', assignments: [{ camera: 'wrist', modelId: 'objects', fps: 5, continuous: true, source }] });
  send({ type: 'views', views, sizes: { wrist: [320, 240] } });
  await vi.advanceTimersByTimeAsync(0);
  expect(port.postMessage).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      type: 'frame',
      camera: 'wrist',
      source,
      frame: expect.objectContaining({ pixels: true }),
    }),
    [expect.objectContaining({ pixels: true })],
  );
  expect(scope.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'frame', bitmaps: { wrist: expect.objectContaining({ pixels: true }) } }),
    [expect.objectContaining({ pixels: true })],
  );
  port.onmessage?.call(port, {
    data: { type: 'result', result: { camera: 'wrist', modelId: 'objects' } },
  } as MessageEvent);
  send({ type: 'views', views, sizes: {} });
  await vi.advanceTimersByTimeAsync(200);
  expect(port.postMessage).toHaveBeenCalledTimes(2);
  expect(port.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({ frame: expect.objectContaining({ pixels: true }) }),
    [expect.objectContaining({ pixels: true })],
  );
  expect(stage.finish).toHaveBeenCalled();
});
