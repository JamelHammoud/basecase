import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VisionFrame, VisionReply, VisionRequest, VisionResult } from './protocol';
import { TEST_VISION_MANIFEST } from './testModel';

const mocks = vi.hoisted(() => ({ load: vi.fn(), infer: vi.fn(), dispose: vi.fn() }));

vi.mock('./engine', () => ({
  VisionEngine: class {
    load = mocks.load;
    infer = mocks.infer;
    dispose = mocks.dispose;
  },
}));
vi.mock('./poseInference', () => ({ loadPoseVision: vi.fn(), inferPoseVision: vi.fn(), disposePoseVision: vi.fn() }));

const post = vi.fn();
const read = vi.fn(() => ({ width: 2, height: 2, data: new Uint8ClampedArray(16) }));
const draw = vi.fn();

function send(message: VisionRequest): void {
  const scope = globalThis as unknown as { onmessage: (event: MessageEvent<VisionRequest>) => void };

  scope.onmessage({ data: message } as MessageEvent<VisionRequest>);
}

function image(): ImageBitmap {
  return { width: 2, height: 2, close: vi.fn() } as unknown as ImageBitmap;
}

function port(): MessagePort {
  return { onmessage: null, onmessageerror: null, close: vi.fn(), start: vi.fn() } as unknown as MessagePort;
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal('postMessage', post);
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      width = 1;
      height = 1;
      getContext() {
        return { drawImage: draw, getImageData: read };
      }
    },
  );
  mocks.load.mockResolvedValue({ backend: 'wasm' });
  mocks.dispose.mockResolvedValue(undefined);
  mocks.infer.mockImplementation(
    async (
      modelId: string,
      _pixels: unknown,
      metadata: { camera: string; timestamp: number },
    ): Promise<VisionResult> => ({
      modelId,
      kind: 'depth',
      ...metadata,
      elapsedMs: 1,
      width: 2,
      height: 2,
      depth: { width: 32, height: 32, values: new Float32Array(1024).fill(2), units: 'meters' },
    }),
  );
  await import('./vision.worker');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('vision worker transport', () => {
  it('loads a model, preserves frame metadata and transfers compact depth buffers', async () => {
    send({ id: 1, type: 'load', model: TEST_VISION_MANIFEST, bytes: new ArrayBuffer(1) });
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith({ id: 1, ok: true, result: { backend: 'wasm' } }, []));

    const source = port();
    const bitmap = image();

    send({ type: 'configure', cameras: { front: ['depth'] } });
    send({ type: 'port', source: 'feed', port: source });
    source.onmessage?.({
      data: { camera: 'front', timestamp: 50, mediaTime: 1.5, mediaSource: 'try-one', image: bitmap },
    } as MessageEvent<VisionFrame>);
    await vi.waitFor(() => expect(bitmap.close).toHaveBeenCalledOnce());

    const call = post.mock.calls.find((args) => {
      const reply = args[0] as VisionReply;

      return 'type' in reply && reply.type === 'result';
    });
    const reply = call?.[0] as Extract<VisionReply, { type: 'result' }>;

    expect(reply.result.mediaTime).toBe(1.5);
    expect(reply.result.mediaSource).toBe('try-one');
    expect(reply.result.timestamp).toBe(50);
    expect(reply.result.depth).toMatchObject({ width: 16, height: 16, centerMeters: 2 });
    expect(call?.[1]).toEqual([reply.result.depth?.values.buffer]);
  });

  it('closes replaced source ports and releases disconnected sources', () => {
    const old = port();
    const next = port();

    send({ type: 'port', source: 'feed', port: old });
    send({ type: 'port', source: 'feed', port: next });
    expect(old.close).toHaveBeenCalledOnce();
    send({ type: 'disconnect', source: 'feed' });
    expect(next.close).toHaveBeenCalledOnce();
    send({ type: 'disconnect', source: 'feed' });
    expect(next.close).toHaveBeenCalledOnce();
  });

  it('drops an inference that completes after its source disconnects', async () => {
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });

    mocks.infer.mockImplementationOnce(async (): Promise<VisionResult> => {
      await blocked;

      return { modelId: 'depth', kind: 'detect', camera: 'front', timestamp: 50, elapsedMs: 1, width: 2, height: 2 };
    });

    const source = port();
    const bitmap = image();

    send({ type: 'configure', cameras: { front: ['depth'] } });
    send({ type: 'port', source: 'old-scene', port: source });
    source.onmessage?.({ data: { camera: 'front', timestamp: 50, image: bitmap } } as MessageEvent<VisionFrame>);
    await vi.waitFor(() => expect(mocks.infer).toHaveBeenCalledOnce());
    send({ type: 'disconnect', source: 'old-scene' });
    release?.();
    await vi.waitFor(() => expect(bitmap.close).toHaveBeenCalledOnce());
    expect(post).not.toHaveBeenCalled();
  });

  it('releases an image after failed one-off inference and returns the failure', async () => {
    mocks.infer.mockRejectedValueOnce(new Error('Model stopped'));

    const bitmap = image();

    send({ id: 2, type: 'infer', modelId: 'depth', camera: 'front', image: bitmap, timestamp: 80 });
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith({ id: 2, ok: false, error: 'Model stopped' }));
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});
