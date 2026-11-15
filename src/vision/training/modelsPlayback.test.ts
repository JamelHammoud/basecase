import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { VisionManifest } from '../manifest';
import type { StoredTry } from '../../cases/tryFile';
import type { RecordedCameraRequest } from '../../cameras/recordedProtocol';

const state = vi.hoisted(() => ({
  saved: new Map<string, unknown>(),
  load: vi.fn(async () => undefined),
  decode: vi.fn(),
}));

vi.mock('../../utils/platform/web/idb', () => ({
  idbAll: async () => [...state.saved.values()],
  idbPut: async (_store: string, key: string, value: unknown) => state.saved.set(key, value),
}));
vi.mock('../runtime', () => ({
  visionRuntime: () => ({ load: state.load, subscribe: vi.fn(), onError: vi.fn(), connect: () => () => undefined }),
}));
vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  UrlSource: class {},
  Input: class {
    getPrimaryVideoTrack = async () => ({ canDecode: async () => true });
    dispose = vi.fn();
  },
  VideoSampleSink: class {
    getSample = state.decode;
  },
}));

const manifest: VisionManifest = {
  version: 1,
  id: 'retained-cup-model',
  kind: 'detect',
  adapter: 'generic',
  classes: ['cup'],
  input: { width: 2, height: 2, layout: 'nchw', mean: [0, 0, 0], std: [1, 1, 1] },
  model: { source: 'local', sha256: 'a'.repeat(64), bytes: 128 },
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  state.saved.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function appliedScope() {
  const { createVisionScope } = await import('../../cameras/visionScope');
  const models = await import('./models');
  const scope = createVisionScope('saved-kitchen');
  const other = createVisionScope('saved-bedroom');
  const releases = [scope.simulated, scope.recorded, other.recorded].map((vision) =>
    vision.registerVisionCameras({}, ['wrist']),
  );

  await models.registerRetainedVisionModel(manifest);
  await models.applyRetainedVisionModel(manifest, {
    scene: scope.scene,
    camera: 'wrist',
    node: 'object-detection',
  });

  return { scope, other, models, release: () => releases.forEach((release) => release()) };
}

it('applies the same retained artifact to live and recorded cameras and restores playback after restart', async () => {
  const { scope, other, release } = await appliedScope();

  expect(scope.simulated.visionAssignments()).toEqual([
    expect.objectContaining({ modelId: manifest.id, source: scope.simulated.source, camera: 'wrist' }),
  ]);
  expect(scope.recorded.visionAssignments()).toEqual([
    expect.objectContaining({ modelId: manifest.id, source: scope.recorded.source, camera: 'wrist' }),
  ]);
  expect(other.recorded.visionAssignments()).toEqual([]);
  release();
  vi.resetModules();

  const { createVisionScope } = await import('../../cameras/visionScope');
  const reopened = createVisionScope('saved-kitchen');
  const stop = reopened.recorded.registerVisionCameras({}, ['wrist']);
  const restarted = await import('./models');

  await restarted.restoreRetainedCameraModels(reopened.recorded.source, ['wrist'], () => true);
  expect(reopened.recorded.visionAssignments()).toEqual([
    expect.objectContaining({ modelId: manifest.id, source: reopened.recorded.source, continuous: false }),
  ]);
  expect(state.load).toHaveBeenCalledWith(manifest, undefined);
  stop();
});

it('sends decoded recorded frames to the retained model without publishing them to live watchers', async () => {
  const { scope, release } = await appliedScope();
  const { subscribeLiveSceneVision } = await import('../../cameras/sceneVision');
  const live = vi.fn();
  const unsubscribe = subscribeLiveSceneVision(scope, live);
  const frame = { close: vi.fn() } as unknown as VideoFrame;
  const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
  const port = { postMessage: vi.fn(), close: vi.fn() } as unknown as MessagePort;
  const worker = { onmessage: (_event: MessageEvent<RecordedCameraRequest>) => undefined, postMessage: vi.fn() };
  const sample = { close: vi.fn(), toCanvasImageSource: () => ({}), toVideoFrame: () => frame };

  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  vi.stubGlobal('self', worker);
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap),
  );
  state.decode.mockResolvedValue(sample);
  await import('../../cameras/recordedCamera.worker');

  const send = (data: RecordedCameraRequest) => worker.onmessage({ data } as MessageEvent<RecordedCameraRequest>);

  send({ type: 'vision', port });
  send({ type: 'assignments', assignments: scope.recorded.visionAssignments() });
  send({
    type: 'open',
    stored: { id: 'recorded', source: 'import', videos: [{ camera: 'wrist', from: 0, to: 5 }] } as StoredTry,
  });
  send({ type: 'seek', seconds: 1, timestamp: 100 });
  await vi.advanceTimersByTimeAsync(0);
  expect(port.postMessage).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      type: 'frame',
      modelId: manifest.id,
      frame,
      camera: 'wrist',
      source: scope.recorded.source,
    }),
    [frame],
  );

  const result = { modelId: manifest.id, camera: 'wrist', width: 2, height: 2, timestamp: 100, detections: [] };

  scope.recorded.publishCameraVision(result);
  expect(live).not.toHaveBeenCalled();
  expect(scope.simulated.cameraVision('wrist')).toBeNull();
  expect(scope.recorded.cameraVision('wrist')?.modelId).toBe(manifest.id);
  scope.simulated.publishCameraVision({ ...result, timestamp: 101 });
  expect(live).toHaveBeenCalledOnce();
  expect(scope.recorded.cameraVision('wrist')?.timestamp).toBe(100);
  send({ type: 'close' });
  unsubscribe();
  release();
});

it('stops restoring the remaining node bindings when its camera closes during a load', async () => {
  const scene = 'closed-kitchen';
  const camera = 'wrist';

  for (const [index, node] of ['object-detection', 'person-detection'].entries()) {
    const saved = { ...manifest, id: `restored-${index}`, classes: ['person'] };

    state.saved.set(node, { scene, camera, node, modelId: saved.id, manifest: saved, type: 'vision-binding' });
  }

  let finish: () => void = () => undefined;
  let began: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    began = resolve;
  });

  state.load.mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => {
      finish = resolve;
      began();
    });
  });

  const { createVisionScope } = await import('../../cameras/visionScope');
  const scope = createVisionScope(scene);
  const close = scope.recorded.registerVisionCameras({}, [camera]);
  const ready = scope.recorded.ensureVisionCamera(camera);

  await started;
  close();
  finish();
  await ready;
  expect(state.load).toHaveBeenCalledOnce();
  expect(scope.recorded.visionAssignments()).toEqual([]);
});

it.each([false, true])(
  'waits for retained model startup before default fallback, closed: %s',
  async (closeBeforeReady) => {
    const { release } = await appliedScope();

    release();
    vi.resetModules();
    state.load.mockClear();

    const { createVisionScope } = await import('../../cameras/visionScope');
    const scope = createVisionScope('saved-kitchen');
    let finish: () => void = () => undefined;
    let began: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      began = resolve;
    });
    const loading = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const messages: RecordedCameraRequest[] = [];

    state.load.mockImplementationOnce(async () => {
      began();
      await loading;
    });
    vi.stubGlobal(
      'MessageChannel',
      class {
        port1 = { close: vi.fn() };
        port2 = { close: vi.fn() };
      },
    );
    vi.stubGlobal(
      'Worker',
      class {
        onmessage = null;
        onerror = null;
        terminate = vi.fn();
        postMessage(message: RecordedCameraRequest) {
          messages.push(message);
        }
      },
    );
    scope.playback.openRecordedCameras({
      id: 'recorded',
      source: 'import',
      videos: [{ camera: 'wrist', from: 0, to: 5 }],
    } as StoredTry);

    const ready = scope.recorded.ensureVisionCamera('wrist');

    await started;
    expect(state.load).toHaveBeenCalledExactlyOnceWith(manifest, undefined);
    expect(scope.recorded.visionAssignments()).toEqual([]);

    if (closeBeforeReady) scope.playback.closeRecordedCameras();

    finish();
    await ready;
    expect(state.load).toHaveBeenCalledExactlyOnceWith(manifest, undefined);

    if (closeBeforeReady) {
      expect(scope.recorded.visionAssignments()).toEqual([]);

      return;
    }

    expect(scope.recorded.visionAssignments()).toEqual([
      expect.objectContaining({ camera: 'wrist', modelId: manifest.id, source: scope.recorded.source }),
    ]);
    expect(messages.filter((message) => message.type === 'assignments').at(-1)).toEqual({
      type: 'assignments',
      assignments: scope.recorded.visionAssignments(),
    });
    scope.playback.closeRecordedCameras();
  },
);
