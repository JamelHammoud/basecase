import { indexedDbStore } from '../../utils/keyValueStore';
import type { Dataset } from '../datasetFile';
import type { DatasetBackend } from './types';

const datasets = indexedDbStore<Dataset>({ database: 'basecase-datasets', store: 'datasets' });

export const webDatasets: DatasetBackend = {
  list: () => datasets.values(),
  save: async (dataset) => {
    await datasets.put(dataset.id, dataset);
  },
  delete: async (ids) => {
    await Promise.all(ids.map((id) => datasets.delete(id)));
  },
};
