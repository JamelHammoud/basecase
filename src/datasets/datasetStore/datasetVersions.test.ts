import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListedStore } from '../../utils/keyValueStore';
import { mergeDatasetVersions } from '../../../electron/library/datasetVersions.mjs';
import { freezeVersion, newDataset, type Dataset } from '../datasetFile';

const state = vi.hoisted(() => ({ stores: new Map<string, Map<string, unknown>>() }));

vi.mock('../../utils/keyValueStore', () => ({
  indexedDbStore: <T>({ database }: { database: string }): ListedStore<T> => {
    const values = () => {
      let found = state.stores.get(database);

      if (!found) {
        found = new Map();
        state.stores.set(database, found);
      }

      return found;
    };

    return {
      get: async (key) => structuredClone(values().get(key)) as T | undefined,
      put: async (key, value) => values().set(key, structuredClone(value)),
      delete: async (key) => values().delete(key),
      deletePrefix: async () => {},
      values: async () => structuredClone([...values().values()]) as T[],
      keys: async () => [...values().keys()],
    };
  },
}));
vi.mock('../../utils/platform/webDemo', () => ({ IS_WEB_DEMO: true }));
vi.mock('./webDatasetWrite', () => ({
  DATASET_DATABASE: 'basecase-datasets',
  DATASET_STORE: 'datasets',
  writeWebDataset: async (dataset: Dataset) => {
    let stored = state.stores.get('basecase-datasets');

    if (!stored) {
      stored = new Map();
      state.stores.set('basecase-datasets', stored);
    }

    stored.set(dataset.id, structuredClone(mergeDatasetVersions(dataset, stored.get(dataset.id))));
  },
}));

const dataset = (): Dataset =>
  newDataset({ id: 'dataset', name: 'Grasps', task: 'Pick', members: ['try-a'], at: 'now' });
const frozen = () =>
  freezeVersion(dataset(), 'first-hash', 'now', { task: 'Pick', modelHash: '', samples: [], images: [] }).dataset;

beforeEach(() => {
  state.stores.clear();
  vi.resetModules();
});

describe('browser immutable dataset versions', () => {
  it('retains frozen versions during concurrent stale membership updates', async () => {
    const { webDatasets } = await import('./webDatasets');
    const original = frozen();

    await Promise.all([webDatasets.save(original), webDatasets.save({ ...dataset(), members: ['try-b'] })]);

    expect(await webDatasets.list()).toEqual([{ ...original, members: ['try-b'] }]);
  });

  it('preserves archives and rejects metadata or archive replacement', async () => {
    const { webDatasets } = await import('./webDatasets');
    const original = frozen();
    const archived = { ...original, versions: [{ ...original.versions[0], archive: 'a'.repeat(64) }] };

    await webDatasets.save(original);
    await webDatasets.save(archived);
    await webDatasets.save(original);
    expect(await webDatasets.list()).toEqual([archived]);
    await expect(
      webDatasets.save({ ...archived, versions: [{ ...archived.versions[0], hash: 'changed' }] }),
    ).rejects.toThrow('saved version');
    await expect(
      webDatasets.save({ ...archived, versions: [{ ...archived.versions[0], archive: 'b'.repeat(64) }] }),
    ).rejects.toThrow('saved version');
    await expect(
      webDatasets.save({
        ...archived,
        versions: [
          { ...archived.versions[0], snapshot: { ...archived.versions[0].snapshot!, task: 'Changed labels' } },
        ],
      }),
    ).rejects.toThrow('saved version');
    expect(await webDatasets.list()).toEqual([archived]);
  });

  it('serializes public saves and publishes preserved history after stale edits', async () => {
    const { loadDatasets, saveDataset } = await import('./index');
    const original = frozen();

    await Promise.all([saveDataset(original), saveDataset({ ...dataset(), members: ['try-b'] })]);
    expect(await loadDatasets()).toEqual([{ ...original, members: ['try-b'] }]);
    await expect(
      saveDataset({ ...original, versions: [{ ...original.versions[0], hash: 'changed' }] }),
    ).rejects.toThrow('saved version');
    expect(await loadDatasets()).toEqual([{ ...original, members: ['try-b'] }]);
    await saveDataset({ ...dataset(), name: 'Renamed' });
    expect((await loadDatasets())[0].versions).toEqual(original.versions);
  });
});
