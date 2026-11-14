import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VisionReply, VisionRequest, VisionResult } from './protocol';

const operator = vi.hoisted(() => ({ ensure: vi.fn(), release: vi.fn() }));

vi.mock('../cameras/operator/operatorCamera', () => ({ ensureOperatorPoseVision: operator.ensure }));

vi.mock('./modelStore', () => ({ getVisionModel: async () => new Uint8Array([1, 2, 3]) }));

class TestWorker {
  static readonly instances: TestWorker[] = [];

  onmessage: ((event: MessageEvent<VisionReply>) => void) | null = null;

  onerror: ((event: ErrorEvent) => void) | null = null;

  messages: VisionRequest[] = [];

  constructor() {
    TestWorker.instances.push(this);
  }

  postMessage(message: VisionRequest): void {
    this.messages.push(message);

    if (!('id' in message)) return;

    queueMicrotask(() => this.emit({ id: message.id, ok: true, result: { backend: 'wasm' } }));
  }

  emit(reply: VisionReply): void {
    this.onmessage?.({ data: reply } as MessageEvent<VisionReply>);
  }
}

beforeEach(() => {
  vi.resetModules();
  operator.ensure.mockReset().mockResolvedValue(operator.release);
  operator.release.mockClear();
  TestWorker.instances.length = 0;
  vi.stubGlobal('Worker', TestWorker);
});

afterEach(() => {
  for (const worker of TestWorker.instances) {
    for (const message of worker.messages) if (message.type === 'port') message.port.close();
  }

  vi.unstubAllGlobals();
});

const detection = (timestamp: number): VisionResult => ({
  camera: 'wrist',
  modelId: 'object-detection',
  kind: 'detect',
  timestamp,
  elapsedMs: 1,
  width: 320,
  height: 240,
  detections: [{ classId: 0, label: 'cup', score: 0.9, box: [0.1, 0.2, 0.3, 0.4] }],
});

describe('vision subscriptions', () => {
  it('shares a loaded model, closes a disconnected source, and clears late results after the last subscriber leaves', async () => {
    const client = await import('./client');
    const store = await import('./resultStore');
    const disconnect = client.connectVisionSource((port) => port.close());
    const first = await client.startVision('wrist', 'object-detection');
    const second = await client.startVision('wrist', 'object-detection');
    const worker = TestWorker.instances[0];

    expect(worker.messages.filter((message) => message.type === 'load')).toHaveLength(1);
    worker.emit({ type: 'result', result: detection(performance.timeOrigin + performance.now()) });
    expect(store.latestVision('wrist')?.detections?.[0].label).toBe('cup');
    first();
    expect(worker.messages.filter((message) => message.type === 'dispose')).toHaveLength(0);
    second();
    expect(worker.messages.filter((message) => message.type === 'dispose')).toHaveLength(1);
    expect(store.latestVision('wrist')).toBeNull();
    worker.emit({ type: 'result', result: detection(performance.timeOrigin + performance.now()) });
    expect(store.latestVision('wrist')).toBeNull();
    disconnect();
    expect(worker.messages.at(-1)?.type).toBe('disconnect');
    expect(client.visionCameras()).toEqual([]);
  });
});

describe('recorded video source priority', () => {
  it('suspends live producers for the recorded camera and rejects their queued results', async () => {
    const client = await import('./client');
    const store = await import('./resultStore');
    const live = vi.fn((port: MessagePort, _cameras: string[]) => port.close());
    const recorded = vi.fn((port: MessagePort, _cameras: string[]) => port.close());
    const disconnectLive = client.connectVisionSource(live);
    const stop = await client.startVision('wrist', 'object-detection');
    const old = detection(performance.timeOrigin + performance.now());
    const worker = TestWorker.instances[0];

    worker.emit({ type: 'result', result: old });
    expect(store.latestVision('wrist')).not.toBeNull();

    const disconnectRecorded = client.connectVisionSource(recorded, { exclusive: ['wrist'] });

    expect(live.mock.lastCall?.[1]).toEqual([]);
    expect(recorded.mock.lastCall?.[1]).toEqual(['wrist']);
    expect(store.latestVision('wrist')).toBeNull();
    worker.emit({ type: 'result', result: old });
    expect(store.latestVision('wrist')).toBeNull();
    disconnectRecorded();
    expect(live.mock.lastCall?.[1]).toEqual(['wrist']);
    disconnectLive();
    stop();
  });
});

describe('operator pose video source', () => {
  it('uses recorded frames during playback and restores the shared live landmarker afterward', async () => {
    const client = await import('./client');
    const stop = await client.startVision('operator', 'pose');

    expect(operator.ensure).toHaveBeenCalledOnce();
    expect(TestWorker.instances).toHaveLength(0);

    const disconnect = client.connectVisionSource((port) => port.close(), { exclusive: ['operator'] });

    await vi.waitFor(() =>
      expect(TestWorker.instances[0]?.messages).toContainEqual({
        type: 'configure',
        cameras: { operator: ['pose'] },
      }),
    );
    expect(operator.release).toHaveBeenCalledOnce();
    expect(client.hasExclusiveVisionSource('operator')).toBe(true);
    disconnect();
    await vi.waitFor(() => expect(operator.ensure).toHaveBeenCalledTimes(2));
    expect(client.hasExclusiveVisionSource('operator')).toBe(false);
    stop();
    expect(operator.release).toHaveBeenCalledTimes(2);
  });
});

it('reloads an explicitly supplied model after its last camera closes', async () => {
  const client = await import('./client');
  const { TEST_VISION_MANIFEST, testVisionModel } = await import('./testModel');
  const bytes = testVisionModel();
  const model = { ...TEST_VISION_MANIFEST, id: 'object-detection', classes: ['block'] };

  await client.loadVisionBytes(model, bytes.buffer as ArrayBuffer);

  const first = await client.startVision('wrist', model.id);

  first();

  const second = await client.startVision('wrist', model.id);
  const loads = TestWorker.instances[0].messages.filter((message) => message.type === 'load');

  expect(loads).toHaveLength(2);
  expect(loads.map((message) => message.model.classes)).toEqual([['block'], ['block']]);
  second();
});
