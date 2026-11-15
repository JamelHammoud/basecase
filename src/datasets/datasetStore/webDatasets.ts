import { indexedDbStore } from '../../utils/keyValueStore';
import type { Dataset } from '../datasetFile';
import { DATASET_DATABASE, DATASET_STORE, writeWebDataset } from './webDatasetWrite';
import {
  checkedDatasetContentHash,
  checkedDatasetContentBytes,
  datasetContentHash,
  verifiedDatasetContent,
} from '../contentHash';
import type { DatasetBackend } from './types';

const datasets = indexedDbStore<Dataset>({ database: DATASET_DATABASE, store: DATASET_STORE });

const content = indexedDbStore<Uint8Array>({ database: 'basecase-dataset-content', store: 'content' });

export const webDatasets: DatasetBackend = {
  saveContent: async (bytes) => {
    const copy = new Uint8Array(checkedDatasetContentBytes(bytes));
    const hash = await datasetContentHash(copy);
    const existing = await content.get(hash);

    if (existing !== undefined && existing !== null) {
      await verifiedDatasetContent(existing, hash);

      return hash;
    }

    await content.put(hash, copy);

    const saved = await content.get(hash);

    if (!saved) throw new Error('Dataset content wasn’t saved');

    await verifiedDatasetContent(saved, hash);

    return hash;
  },
  content: async (hash) => {
    checkedDatasetContentHash(hash);

    const bytes = await content.get(hash);

    return bytes === undefined || bytes === null ? null : verifiedDatasetContent(bytes, hash);
  },
  list: () => datasets.values(),
  save: writeWebDataset,
  delete: async (ids) => {
    await Promise.all(ids.map((id) => datasets.delete(id)));
  },
};
