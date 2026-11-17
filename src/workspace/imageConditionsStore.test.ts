import { beforeEach, describe, expect, it, vi } from 'vitest';
import { frameSetHash } from '../vision/frameSet';
import type { FrameBytes, FrameSetBackend, FrameSetManifest } from '../vision/frameSetStoreTypes';
import { loadFrameSet, saveFrameSet } from '../vision/frameSetStore';
import { metricSet } from '../vision/training/metricsFixtures';
import { freezeVersion, newDataset, type Dataset } from '../datasets/datasetFile';
import { editImageConditions } from './imageConditions';

const saved = vi.hoisted(() => ({
  manifests: new Map<string, FrameSetManifest>(),
  frames: new Map<string, FrameBytes>(),
  datasets: new Map<string, Dataset>(),
}));

vi.mock('../vision/desktopFrameSets', () => ({
  desktopFrameSets: {
    list: async () =>
      [...saved.manifests.values()].map((manifest) => ({ ...manifest, frames: manifest.frames.length })),
    manifest: async (id) => structuredClone(saved.manifests.get(id) ?? null),
    frame: async (id, frameId) => structuredClone(saved.frames.get(`${id}:${frameId}`) ?? null),
    jpeg: async (id, frameId) => saved.frames.get(`${id}:${frameId}`)?.jpeg ?? null,
    saveFrame: async (id, frameId, bytes) => {
      saved.frames.set(`${id}:${frameId}`, structuredClone(bytes));
    },
    saveManifest: async (manifest) => {
      saved.manifests.set(manifest.id, structuredClone(manifest));
    },
  } satisfies FrameSetBackend,
}));
vi.mock('../datasets/datasetStore', () => ({
  loadDatasets: async () => structuredClone([...saved.datasets.values()]),
  saveDataset: async (dataset: Dataset) => {
    saved.datasets.set(dataset.id, structuredClone(dataset));
  },
}));

beforeEach(() => {
  saved.manifests.clear();
  saved.frames.clear();
  saved.datasets.clear();
});

describe('condition dataset persistence', () => {
  it('serializes concurrent cross-set edits, checks the global cap before writes and preserves saved versions', async () => {
    const sets = ['front', 'wrist'].map((id) => ({
      ...metricSet(),
      id,
      conditions: Array.from({ length: 31 }, (_, index) => `condition-${index}`),
    }));
    const members = await Promise.all(
      sets.map(async (set) => ({ frameSetId: set.id, frameIds: ['one'], hash: await frameSetHash(set) })),
    );
    const original = newDataset({
      id: 'dataset',
      name: 'Conditions',
      task: '',
      members: [],
      imageMembers: members,
      at: 'now',
    });
    const dataset = freezeVersion(original, 'a'.repeat(64), 'now').dataset;
    const versions = structuredClone(dataset.versions);

    await Promise.all(sets.map((set) => saveFrameSet(set)));
    saved.datasets.set(dataset.id, dataset);

    const results = await Promise.allSettled(
      ['night', 'glare'].map((name, index) =>
        editImageConditions({
          members,
          selected: [{ frameSetId: sets[index].id, frameId: 'one' }],
          name,
          remove: false,
        }),
      ),
    );
    const reopened = structuredClone(saved.datasets.get(dataset.id)!);
    const updated = (await Promise.all(sets.map((set) => loadFrameSet(set.id)))).filter((set) => set !== null);

    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    expect(new Set(updated.flatMap((set) => set.conditions!)).size).toBe(32);
    expect(reopened.versions).toEqual(versions);
    expect(reopened.imageMembers![0].hash).toBe(await frameSetHash(updated[0]));
    expect(reopened.imageMembers![0].hash).not.toBe(members[0].hash);
    expect(updated[0].frames[0].conditions).toEqual(['night']);
    expect(updated[1].frames[0].conditions).toBeUndefined();
  });
});
