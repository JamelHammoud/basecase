import type { Dataset } from '../datasetFile';

export interface DatasetBackend {
  list: () => Promise<unknown[]>;
  save: (d: Dataset) => Promise<void>;
  delete: (ids: string[]) => Promise<void>;
}
