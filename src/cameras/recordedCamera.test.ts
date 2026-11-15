import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { StoredTry } from '../cases/tryFile';
import type { RecordedCameraRequest } from './recordedProtocol';

const state = vi.hoisted(() => ({ decode: vi.fn(), dispose: vi.fn(), sources: [] as string[] }));

vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  UrlSource: class {
    constructor(url: string) {
      state.sources.push(url);
    }
  },
  Input: class {
    getPrimaryVideoTrack = async () => ({ canDecode: async () => true });
    dispose = state.dispose;
  },
  VideoSampleSink: class {
    getSample = state.decode;
  },
}));

interface WorkerScope {
  onmessage: (event: MessageEvent<RecordedCameraRequest>) => void;
  postMessage: ReturnType<typeof vi.fn>;
}

let scope: WorkerScope;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  state.sources.length = 0;
  scope = { onmessage: () => undefined, postMessage: vi.fn() };
  vi.stubGlobal('self', scope);
  await import('./recordedCamera.worker');
});

afterEach(() => {
  scope.onmessage({ data: { type: 'close' } } as MessageEvent<RecordedCameraRequest>);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const send = (data: RecordedCameraRequest) => scope.onmessage({ data } as MessageEvent<RecordedCameraRequest>);

it('decodes the imported playhead and transfers its real decoded frame directly to vision', async () => {
  const frame = { close: vi.fn() } as unknown as VideoFrame;
  const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
  const streamed = { close: vi.fn() } as unknown as ImageBitmap;
  const pixels = {};
  const sample = { close: vi.fn(), toCanvasImageSource: () => pixels, toVideoFrame: () => frame };
  const copy = vi.fn().mockResolvedValueOnce(bitmap).mockResolvedValueOnce(streamed);
  const port = { postMessage: vi.fn(), close: vi.fn() } as unknown as MessagePort;

  state.decode.mockResolvedValue(sample);
  vi.stubGlobal('createImageBitmap', copy);
  send({ type: 'vision', port });
  send({ type: 'assignments', assignments: [{ camera: 'wrist', modelId: 'faces', fps: 5 }] });
  send({ type: 'stream', id: 1, camera: 'wrist', width: 320, height: 240, fps: 5 });
  send({
    type: 'open',
    stored: {
      id: 'recorded',
      source: 'import',
      videos: [{ camera: 'wrist', path: 'source.mp4', from: 12, to: 16 }],
    } as StoredTry,
  });
  send({ type: 'seek', seconds: 2, timestamp: 123 });
  await vi.advanceTimersByTimeAsync(0);

  expect(state.sources).toEqual(['/api/tries/video/recorded/wrist']);
  expect(state.decode).toHaveBeenCalledExactlyOnceWith(14);
  expect(copy).toHaveBeenCalledWith(pixels);
  expect(copy).toHaveBeenCalledWith(pixels, { resizeWidth: 320, resizeHeight: 240 });
  expect(port.postMessage).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ type: 'frame', modelId: 'faces', frame, camera: 'wrist', timestamp: 123 }),
    [frame],
  );
  expect(scope.postMessage).toHaveBeenCalledWith({ type: 'frame', camera: 'wrist', bitmap, timestamp: 123 }, [bitmap]);
  expect(scope.postMessage).toHaveBeenCalledWith({ type: 'stream', id: 1, bitmap: streamed, timestamp: 123 }, [
    streamed,
  ]);
  expect(sample.close).toHaveBeenCalledOnce();
});

it('retries the final paused Operate seek after its model rate limit', async () => {
  const frame = { close: vi.fn() } as unknown as VideoFrame;
  const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
  const sample = { close: vi.fn(), toCanvasImageSource: () => ({}), toVideoFrame: () => frame };
  const port = { postMessage: vi.fn(), close: vi.fn() } as unknown as MessagePort;

  state.decode.mockResolvedValue(sample);
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap),
  );
  send({ type: 'vision', port });
  send({ type: 'assignments', assignments: [{ camera: 'operator', modelId: 'faces', fps: 1 }] });
  send({
    type: 'open',
    stored: {
      id: 'recorded',
      source: 'operate',
      videos: [{ camera: 'operator', path: 'operator.mp4', from: 10, to: 14 }],
    } as StoredTry,
  });
  send({ type: 'seek', seconds: 12, timestamp: 100 });
  await vi.advanceTimersByTimeAsync(0);
  expect(state.decode).toHaveBeenLastCalledWith(2);
  expect(port.postMessage).toHaveBeenCalledOnce();
  port.onmessage?.call(port, {
    data: { type: 'result', result: { camera: 'operator', modelId: 'faces' } },
  } as MessageEvent);
  await vi.advanceTimersByTimeAsync(100);
  send({ type: 'seek', seconds: 13, timestamp: 101 });
  await vi.advanceTimersByTimeAsync(0);
  expect(state.decode).toHaveBeenLastCalledWith(3);
  expect(port.postMessage).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(900);
  await vi.advanceTimersByTimeAsync(1);
  expect(port.postMessage).toHaveBeenCalledTimes(2);
  expect(port.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ timestamp: 101 }), [frame]);
});

it('bounds decoded surfaces while inference is blocked and acknowledges only the latest sought frame', async () => {
  const frames: Array<{ close: ReturnType<typeof vi.fn> }> = [];
  const samples: Array<{ close: ReturnType<typeof vi.fn> }> = [];
  const port = { postMessage: vi.fn(), close: vi.fn() } as unknown as MessagePort;

  state.decode.mockImplementation(async () => {
    const sample = {
      close: vi.fn(),
      toCanvasImageSource: () => ({}),
      toVideoFrame: () => {
        const frame = { close: vi.fn() };

        frames.push(frame);

        return frame;
      },
    };

    samples.push(sample);

    return sample;
  });
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ close: vi.fn() })),
  );
  send({ type: 'vision', port });
  send({ type: 'assignments', assignments: [{ camera: 'front', modelId: 'faces', fps: 5 }] });
  send({
    type: 'open',
    stored: {
      id: 'recorded',
      source: 'import',
      videos: [{ camera: 'front', path: 'front.mp4', from: 0, to: 30 }],
    } as StoredTry,
  });

  for (let index = 0; index < 20; index++) {
    if (index) await vi.advanceTimersByTimeAsync(200);

    send({ type: 'seek', seconds: index, timestamp: 1000 + index / 1000 });
    await vi.advanceTimersByTimeAsync(0);
  }

  expect(port.postMessage).toHaveBeenCalledOnce();
  expect(frames).toHaveLength(20);

  for (const frame of frames.slice(1, -1)) expect(frame.close).toHaveBeenCalledOnce();

  for (const sample of samples) expect(sample.close).toHaveBeenCalledOnce();

  expect(frames[19].close).not.toHaveBeenCalled();
  port.onmessage?.call(port, {
    data: { type: 'result', result: { camera: 'front', modelId: 'faces' } },
  } as MessageEvent);
  expect(port.postMessage).toHaveBeenCalledTimes(2);
  expect(port.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({ frame: frames[19], timestamp: 1000.019 }),
    [frames[19]],
  );
  await vi.advanceTimersByTimeAsync(5000);
  expect(frames).toHaveLength(20);
});
