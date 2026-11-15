import crypto from 'node:crypto';
import { tinyDetectionOnnx } from './onnxFixture';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { visionModel } from './catalogue';
import { createVisionRuntime } from './runtime';

const bridge = vi.hoisted(() => ({ modelFile: vi.fn(), content: vi.fn(), messages: [] as unknown[] }));

vi.mock('../datasets/datasetStore/content', () => ({ loadDatasetContent: bridge.content }));
vi.mock('../hub/hubBridge', () => ({ hubBridge: bridge }));
vi.mock('../utils/platform/webDemo', () => ({ IS_WEB_DEMO: false }));

const workers: RuntimeWorker[] = [];
const currentWorker = () => workers.at(-1)!;

class RuntimeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  replies = true;
  terminate = vi.fn();

  constructor() {
    workers.push(this);
  }

  postMessage(message: { id?: number }) {
    bridge.messages.push(message);

    if (this.replies) queueMicrotask(() => this.onmessage?.({ data: { type: 'reply', id: message.id } }));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  bridge.messages.length = 0;
  bridge.modelFile.mockReset();
  workers.length = 0;
});

describe('desktop vision download boundary', () => {
  it('loads retained local content without entering the Hub download path', async () => {
    vi.stubGlobal('Worker', RuntimeWorker);

    const bytes = tinyDetectionOnnx();
    const manifest = {
      ...visionModel('yolo11n')!,
      model: { source: 'local' as const, sha256: 'a'.repeat(64), bytes: bytes.length },
    };

    bridge.content.mockResolvedValueOnce(bytes);

    const runtime = createVisionRuntime();

    await runtime.load(manifest);
    expect(bridge.content).toHaveBeenCalledWith(manifest.model.sha256);
    expect(bridge.modelFile).not.toHaveBeenCalled();
    expect(bridge.messages).toEqual([expect.objectContaining({ type: 'load', bytes, source: undefined })]);
    bridge.content.mockResolvedValueOnce(null);
    await expect(runtime.load(manifest)).rejects.toThrow('missing');
    expect(bridge.modelFile).not.toHaveBeenCalled();
    runtime.close();
  });

  it('refuses a missing cache URL without falling back to an unguarded worker download', async () => {
    vi.stubGlobal('Worker', RuntimeWorker);
    bridge.modelFile.mockResolvedValue({});

    const runtime = createVisionRuntime();

    await expect(runtime.load(visionModel('yolo11n')!)).rejects.toThrow(/cache address/);
    expect(bridge.messages).toEqual([]);
    runtime.close();
  });

  it('passes a guarded cache URL to the worker without binary model bytes in the renderer', async () => {
    vi.stubGlobal('Worker', RuntimeWorker);

    const manifest = visionModel('yolo11n')!;
    const url = `/api/vision-model/${manifest.model.sha256}`;

    bridge.modelFile.mockResolvedValue({ url });

    const runtime = createVisionRuntime();

    await runtime.load(manifest);
    expect(bridge.messages).toEqual([expect.objectContaining({ type: 'load', source: url, bytes: undefined })]);
    runtime.close();
  });
  it('keeps an inline replacement when an older catalogue download finishes later', async () => {
    vi.stubGlobal('Worker', RuntimeWorker);

    let finish: ((value: { url: string }) => void) | undefined;
    const original = visionModel('yolo11n')!;
    const bytes = tinyDetectionOnnx();
    const replacement = {
      ...original,
      adapter: 'generic' as const,
      classes: ['person'],
      input: { ...original.input, width: 2, height: 2 },
      model: {
        ...original.model,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.length,
      },
    };

    bridge.modelFile.mockImplementationOnce(
      () =>
        new Promise<{ url: string }>((resolve) => {
          finish = resolve;
        }),
    );

    const runtime = createVisionRuntime();
    const earlier = runtime.load(original);

    await runtime.load(replacement, bytes);
    finish!({ url: `/api/vision-model/${original.model.sha256}` });
    await earlier;
    expect(bridge.messages).toEqual([expect.objectContaining({ type: 'load', manifest: replacement })]);
    runtime.close();
  });
});

describe('fatal vision worker failure', () => {
  it('rejects pending inference and downloads, emits once and refuses all future work', async () => {
    vi.stubGlobal('Worker', RuntimeWorker);
    bridge.modelFile.mockImplementation(() => new Promise(() => undefined));

    const runtime = createVisionRuntime();
    const errors = vi.fn();
    const manifest = visionModel('yolo11n')!;

    runtime.onError(errors);
    currentWorker().replies = false;

    const inferred = runtime.infer(manifest.id, { width: 1, height: 1, data: new Uint8ClampedArray(4) });
    const downloaded = runtime.load(manifest);
    const inferenceRejected = expect(inferred).rejects.toThrow('worker failed');
    const downloadRejected = expect(downloaded).rejects.toThrow('worker failed');

    currentWorker().onerror!({ message: 'worker failed' });
    currentWorker().onerror!({ message: 'second failure' });
    await inferenceRejected;
    await downloadRejected;
    expect(errors).toHaveBeenCalledExactlyOnceWith({ error: 'worker failed' });
    expect(currentWorker().terminate).toHaveBeenCalledOnce();

    const requests = bridge.modelFile.mock.calls.length;
    const messages = bridge.messages.length;
    const port = {} as MessagePort;

    await expect(runtime.load(manifest)).rejects.toThrow('The vision runtime is closed.');
    await expect(runtime.infer(manifest.id, { width: 1, height: 1, data: new Uint8ClampedArray(4) })).rejects.toThrow(
      'The vision runtime is closed.',
    );
    expect(() => runtime.attach(port)).toThrow('The vision runtime is closed.');
    expect(bridge.modelFile).toHaveBeenCalledTimes(requests);
    expect(bridge.messages).toHaveLength(messages);
    runtime.close();
    expect(currentWorker().terminate).toHaveBeenCalledOnce();
  });

  it('forwards a frame failure timestamp and ignores results after a fatal error', () => {
    vi.stubGlobal('Worker', RuntimeWorker);

    const runtime = createVisionRuntime();
    const errors = vi.fn();
    const results = vi.fn();
    const failure = { type: 'error', camera: 'scene', modelId: 'test', timestamp: 123, error: 'frame failed' };

    runtime.onError(errors);
    runtime.subscribe(results);
    currentWorker().onmessage!({ data: failure });
    expect(errors).toHaveBeenCalledExactlyOnceWith(failure);
    currentWorker().onerror!({ message: '' });
    expect(errors).toHaveBeenLastCalledWith({ error: 'The vision worker stopped.' });
    currentWorker().onmessage!({ data: { type: 'result', result: {} } });
    expect(results).not.toHaveBeenCalled();
    runtime.close();
  });
});

describe('vision producer ownership', () => {
  it('copies encoded image input for transfer and refuses excessive image allocations', async () => {
    vi.stubGlobal('Worker', RuntimeWorker);

    const runtime = createVisionRuntime();
    const jpeg = new Uint8Array([255, 216, 255]);

    await runtime.inferEncoded('local-cups', jpeg, { camera: 'wrist' });

    const message = bridge.messages.at(-1) as { jpeg: Uint8Array };

    expect(message).toMatchObject({ type: 'infer-encoded', modelId: 'local-cups', jpeg, options: { camera: 'wrist' } });
    expect(message.jpeg).not.toBe(jpeg);
    await expect(runtime.inferEncoded('local-cups', new Uint8Array(0))).rejects.toThrow('64 MB');
    expect(bridge.messages).toHaveLength(1);
    runtime.close();
  });

  it('disconnects a producer through the runtime after its source worker has stopped', () => {
    vi.stubGlobal('Worker', RuntimeWorker);

    const runtime = createVisionRuntime();
    const port = {} as MessagePort;
    const disconnect = runtime.connect(port);
    const attached = bridge.messages.at(-1) as { type: string; producerId: number; port: MessagePort };

    expect(attached).toMatchObject({ type: 'attach', port, producerId: expect.any(Number) });
    expect(disconnect).toBeTypeOf('function');
    disconnect();
    disconnect();
    expect(bridge.messages).toEqual([attached, { type: 'detach', producerId: attached.producerId }]);
    runtime.close();
    disconnect();
    expect(bridge.messages).toHaveLength(2);
  });
});
