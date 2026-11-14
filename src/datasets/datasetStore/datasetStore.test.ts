import { describe, expect, it, vi } from 'vitest';
import { newDataset, type Dataset } from '../datasetFile';
import type { DatasetBackend } from './types';

const backend = vi.hoisted(() => ({ stored: [] as unknown[], deleted: [] as string[] }));

vi.mock('./desktopDatasets', () => ({
  desktopDatasets: {
    list: async () => backend.stored,
    save: async (dataset) => {
      backend.stored.push(dataset);
    },
    delete: async (ids) => {
      backend.deleted.push(...ids);
    },
  } as DatasetBackend,
}));

const { deleteDatasets, loadDatasets, saveDataset } = await import('./index');

const made = (id: string, at: string): Dataset =>
  newDataset({ id, name: id, task: 'Touch each dot', members: ['try-1'], at });

describe('the datasets list', () => {
  it('drops files that don’t read as datasets, lists newest first and replaces a saved one by id', async () => {
    backend.stored.push(
      made('older', '2026-11-01T00:00:00.000Z'),
      { id: '../x' },
      made('newer', '2026-11-10T00:00:00.000Z'),
    );

    expect((await loadDatasets()).map((d) => d.id)).toEqual(['newer', 'older']);

    await saveDataset({ ...made('older', '2026-11-01T00:00:00.000Z'), name: 'Renamed' });
    await saveDataset(made('newest', '2026-11-12T00:00:00.000Z'));

    const listed = await loadDatasets();

    expect(listed.map((d) => d.id)).toEqual(['newest', 'newer', 'older']);
    expect(listed.find((d) => d.id === 'older')?.name).toBe('Renamed');

    await deleteDatasets(['newer']);
    expect(backend.deleted).toEqual(['newer']);
    expect((await loadDatasets()).map((d) => d.id)).toEqual(['newest', 'older']);
  });
});
