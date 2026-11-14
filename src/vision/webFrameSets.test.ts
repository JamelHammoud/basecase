import { describe, expect, it, vi } from 'vitest';
import type { ListedStore } from '../utils/keyValueStore';
import type { FrameSetManifest } from './frameSetStoreTypes';

const saved = vi.hoisted(() => ({
  stores: new Map<string, Map<string, unknown>>(),
  reads: [] as string[],
  failManifestWrite: false,
}));

vi.mock('../utils/keyValueStore', () => ({
  indexedDbStore: <T>({ database }: { database: string }): ListedStore<T> => {
    const values = new Map<string, T>();

    saved.stores.set(database, values);

    return {
      get: async (key) => {
        saved.reads.push(`${database}:${key}`);

        return structuredClone(values.get(key));
      },
      put: async (key, value) => {
        if (database === 'basecase-frame-manifests' && saved.failManifestWrite) throw new Error('Storage full');

        values.set(key, structuredClone(value));
      },
      values: async () => [...values.values()],
      keys: async () => [...values.keys()],
      delete: async (key) => {
        values.delete(key);
      },
      deletePrefix: async (prefix) => {
        for (const key of values.keys()) if (key.startsWith(prefix)) values.delete(key);
      },
    };
  },
}));

const { webFrameSets } = await import('./webFrameSets');

describe('web image storage', () => {
  it('keeps JPEGs and depth in separate entries and rehomes staged frames', async () => {
    const jpeg = new Uint8Array([255, 216, 255, 217]);
    const depth = new Uint8Array(4);
    const manifest: FrameSetManifest = {
      version: 1,
      id: 'final',
      name: 'Blocks',
      caseId: null,
      sceneId: null,
      seed: 42,
      classes: [],
      createdAt: 'now',
      frames: [{ id: 'f1', seed: 1, camera: 'camera', width: 1, height: 1, annotations: [] }],
    };

    await webFrameSets.saveFrame('staging', 'f1', { jpeg, depth });
    expect(await webFrameSets.manifest('staging')).toBeNull();
    expect(await webFrameSets.jpeg('staging', 'f1')).toEqual(jpeg);
    expect(saved.reads.filter((key) => key.startsWith('basecase-image-frames'))).toEqual([
      'basecase-image-frames:staging:f1:jpeg',
    ]);
    await webFrameSets.saveManifest(manifest, 'staging');
    expect(await webFrameSets.manifest('final')).toEqual(manifest);
    expect(await webFrameSets.frame('final', 'f1')).toEqual({ jpeg, depth });
    expect(await webFrameSets.frame('staging', 'f1')).toBeNull();
    expect(await webFrameSets.list()).toEqual([{ ...manifest, frames: 1 }]);
    await expect(webFrameSets.jpeg('../auth', 'f1')).rejects.toThrow('image id');
  });

  it('retains the staged run when saving its final manifest fails, then allows a retry', async () => {
    const jpeg = new Uint8Array([255, 216, 255, 217]);
    const depth = new Uint8Array(4);
    const manifest: FrameSetManifest = {
      version: 1,
      id: 'retry-final',
      name: 'Blocks',
      caseId: null,
      sceneId: null,
      seed: 42,
      classes: [],
      createdAt: 'now',
      frames: [{ id: 'f1', seed: 1, camera: 'camera', width: 1, height: 1, annotations: [] }],
    };

    await webFrameSets.saveFrame('retry-staging', 'f1', { jpeg, depth });
    saved.failManifestWrite = true;

    await expect(webFrameSets.saveManifest(manifest, 'retry-staging')).rejects.toThrow('Storage full');

    saved.failManifestWrite = false;
    expect(await webFrameSets.manifest(manifest.id)).toBeNull();
    expect(await webFrameSets.frame('retry-staging', 'f1')).toEqual({ jpeg, depth });
    await webFrameSets.saveManifest(manifest, 'retry-staging');
    expect(await webFrameSets.manifest(manifest.id)).toEqual(manifest);
    expect(await webFrameSets.frame(manifest.id, 'f1')).toEqual({ jpeg, depth });
    expect(await webFrameSets.frame('retry-staging', 'f1')).toBeNull();
  });
});
