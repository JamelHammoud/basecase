import { afterEach, describe, expect, it, vi } from 'vitest';
import { testManifest } from '../manifest.test';
import type { VisionManifest } from '../manifest';
import { applyRetainedVisionModel, registerRetainedVisionModel, retainedVisionTargets } from './models';
import { boundVisionModel, registerVisionModelSource } from './modelBindings';
import { idbAll } from '../../utils/platform/web/idb';

const state = vi.hoisted(() => ({
  load: vi.fn(async () => undefined),
  configure: vi.fn(),
  stop: vi.fn(),
  cameras: [] as string[],
  saved: new Map<string, unknown>(),
}));

vi.mock('../../cameras/visionSession', () => ({
  availableVisionCameras: () => state.cameras,
  stopVisionCamera: state.stop,
  configureVisionCamera: state.configure,
  loadVisionManifest: state.load,
}));
vi.mock('../../utils/platform/web/idb', () => ({
  idbAll: vi.fn(async () => [...state.saved.values()]),
  idbPut: async (_store: string, key: string, value: unknown) => state.saved.set(key, value),
}));

function model(id = crypto.randomUUID(), kind: VisionManifest['kind'] = 'detect'): VisionManifest {
  return {
    ...testManifest(),
    id,
    kind,
    model: { source: 'local', sha256: 'a'.repeat(64), bytes: 128 },
  } as VisionManifest;
}

afterEach(() => {
  state.saved.clear();
  state.cameras.length = 0;
  state.stop.mockReset();
  state.load.mockReset().mockResolvedValue(undefined);
  state.configure.mockReset();
});

describe('retained model application', () => {
  it('restores a persisted selection only after its retained model is registered', async () => {
    const manifest = model();
    const target = { scene: crypto.randomUUID(), camera: 'wrist', node: 'object-detection' };

    state.saved.set('prior-session', { ...target, modelId: manifest.id, type: 'vision-binding' });
    expect(boundVisionModel(target.node, target.camera, target.scene)).toBeUndefined();
    await registerRetainedVisionModel(manifest);
    expect(idbAll).toHaveBeenLastCalledWith('trained', 'vision-binding:');
    expect(boundVisionModel(target.node, target.camera, target.scene)).toBe(manifest.id);
  });

  it('restores the model and binding after all module memory is discarded', async () => {
    const manifest = await registerRetainedVisionModel(model());
    const target = { scene: crypto.randomUUID(), camera: 'wrist', node: 'object-detection' };

    await applyRetainedVisionModel(manifest, target);
    vi.resetModules();

    const restarted = await import('./modelBindings');

    expect(restarted.boundVisionModel(target.node, target.camera, target.scene)).toBeUndefined();
    expect(restarted.retainedVisionModel(manifest.id)).toBeUndefined();
    await restarted.restoreVisionBindings(target.scene);
    expect(idbAll).toHaveBeenLastCalledWith('trained', `vision-binding:[${JSON.stringify(target.scene)},`);
    expect(restarted.boundVisionModel(target.node, target.camera, target.scene)).toBe(manifest.id);
    expect(restarted.retainedVisionModel(manifest.id)).toEqual(manifest);
  });

  it('loads before binding and preserves the selected camera and node across registration', async () => {
    const manifest = await registerRetainedVisionModel(model());
    const target = { scene: crypto.randomUUID(), camera: 'wrist', node: 'object-detection' };

    expect(boundVisionModel(target.node, target.camera, target.scene)).toBeUndefined();
    expect(await applyRetainedVisionModel(manifest, target)).toBe(true);
    expect(state.load).toHaveBeenCalledExactlyOnceWith(manifest);
    expect(boundVisionModel(target.node, target.camera, target.scene)).toBe(manifest.id);
    expect(boundVisionModel(target.node, 'other', target.scene)).toBeUndefined();
    expect(boundVisionModel('person-detection', target.camera, target.scene)).toBeUndefined();
    expect(boundVisionModel(target.node, target.camera, 'other-scene')).toBeUndefined();
    await registerRetainedVisionModel(manifest);
    expect(boundVisionModel(target.node, target.camera, target.scene)).toBe(manifest.id);
  });

  it('keeps activation unchanged for cancellation, load failure and unretained models', async () => {
    const manifest = await registerRetainedVisionModel(model());
    const target = { scene: crypto.randomUUID(), camera: 'wrist', node: 'object-detection' };

    expect(await applyRetainedVisionModel(manifest, target, () => false)).toBe(false);
    expect(state.saved.size).toBe(0);
    state.load.mockRejectedValueOnce(new Error('bad onnx'));
    await expect(applyRetainedVisionModel(manifest, target)).rejects.toThrow('bad onnx');
    await expect(applyRetainedVisionModel(model(), target)).rejects.toThrow('Keep');
    expect(boundVisionModel(target.node, target.camera, target.scene)).toBeUndefined();
    expect(state.configure).not.toHaveBeenCalled();
  });

  it('stops an earlier selection on the live camera when a replacement is applied', async () => {
    const scene = crypto.randomUUID();
    const target = { scene, camera: 'wrist', node: 'object-detection' };
    const first = await registerRetainedVisionModel(model());
    const second = await registerRetainedVisionModel(model());

    registerVisionModelSource({ scene, kind: 'simulated', id: 'source' });
    state.cameras.push('source/wrist');
    await applyRetainedVisionModel(first, target);
    await applyRetainedVisionModel(second, target);
    expect(state.configure).toHaveBeenNthCalledWith(1, 'source/wrist', {
      modelId: first.id,
      replaceModelId: 'rfdetr-nano',
    });
    expect(state.configure).toHaveBeenLastCalledWith('source/wrist', { modelId: second.id, replaceModelId: first.id });
  });

  it('applies all four image tasks and refuses a person node without its class', async () => {
    const target = { scene: crypto.randomUUID(), camera: 'wrist', node: 'object-detection' };

    for (const kind of ['detect', 'segment', 'keypoints', 'classify'] as const) {
      const manifest = await registerRetainedVisionModel(model(undefined, kind));

      expect(await applyRetainedVisionModel(manifest, target)).toBe(true);
    }

    const manifest = await registerRetainedVisionModel({ ...model(), classes: ['cup'] });

    await expect(applyRetainedVisionModel(manifest, { ...target, node: 'person-detection' })).rejects.toThrow('person');
    expect(retainedVisionTargets(target.scene, [{ id: 'wrist', name: 'Wrist' }], { classes: ['cup'] })).toHaveLength(1);
  });
});
