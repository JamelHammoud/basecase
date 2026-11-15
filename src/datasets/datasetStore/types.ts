import type { Dataset } from '../datasetFile';

export interface DatasetBackend {
  saveContent: (bytes: Uint8Array) => Promise<string>;
  content: (hash: string) => Promise<Uint8Array | null>;
  list: () => Promise<unknown[]>;
  save: (d: Dataset) => Promise<Dataset>;
  delete: (ids: string[]) => Promise<void>;
}
