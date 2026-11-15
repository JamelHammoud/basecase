import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSegmentationRuntime } from './segmentationRuntime';
import { SEGMENTATION_MODELS } from './segmentationModels';

const bridge = vi.hoisted(() => ({ modelFile: vi.fn() }));

vi.mock('../hub/hubBridge', () => ({ hubBridge: bridge }));
vi.mock('../utils/platform/webDemo', () => ({ IS_WEB_DEMO: false }));

const workers: TestWorker[] = [];

class TestWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  terminate = vi.fn();
  messages: Record<string, unknown>[] = [];
  reply = true;

  constructor() {
    workers.push(this);
  }

  postMessage(message: Record<string, unknown>) {
    this.messages.push(message);

    if (this.reply)
      queueMicrotask(() => this.onmessage?.({ data: { id: message.id, result: { size: [1, 1], counts: [0, 1] } } }));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  bridge.modelFile.mockReset();
  workers.length = 0;
});

describe('segmentation worker ownership', () => {
  it('loads every graph through the guarded desktop cache', async () => {
    vi.stubGlobal('Worker', TestWorker);
    bridge.modelFile.mockImplementation(async (model) => ({ url: `/api/vision-model/${model.sha256}` }));

    const runtime = createSegmentationRuntime();

    await runtime.load();
    expect(bridge.modelFile).toHaveBeenCalledTimes(Object.keys(SEGMENTATION_MODELS).length);
    expect(workers[0].messages[0].type).toBe('load');
    expect(workers[0].messages[0].sources).toEqual(
      Object.fromEntries(
        Object.entries(SEGMENTATION_MODELS).map(([name, model]) => [name, `/api/vision-model/${model.sha256}`]),
      ),
    );
    runtime.close();
  });

  it('refuses a missing cache address before posting any model command', async () => {
    vi.stubGlobal('Worker', TestWorker);
    bridge.modelFile.mockResolvedValue({});

    const runtime = createSegmentationRuntime();

    await expect(runtime.load()).rejects.toThrow(/cache address/);
    expect(workers[0].messages).toEqual([]);
    runtime.close();
  });

  it('rejects a model load immediately when closed during cache preparation', async () => {
    vi.stubGlobal('Worker', TestWorker);
    bridge.modelFile.mockReturnValue(new Promise(() => undefined));

    const runtime = createSegmentationRuntime();
    const pending = runtime.load();

    runtime.close();
    await expect(pending).rejects.toThrow(/closed/);
    expect(workers[0].terminate).toHaveBeenCalledOnce();
  });

  it('rejects pending work and later calls when its worker fails', async () => {
    vi.stubGlobal('Worker', TestWorker);

    const runtime = createSegmentationRuntime();
    const worker = workers[0];

    worker.reply = false;

    const pending = runtime.segment({ width: 1, height: 1, data: new Uint8ClampedArray(4) }, [
      { x: 0, y: 0, label: 1 },
    ]);

    worker.onerror?.({ message: 'Worker stopped' });
    await expect(pending).rejects.toThrow('Worker stopped');
    await expect(runtime.reset()).rejects.toThrow(/closed/);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
