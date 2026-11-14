import type { FrameSetStore } from './frameSetStore.mjs';

export const MAX_DATASET_BYTES: number;

export class DatasetStore {
  images: FrameSetStore;
  constructor(options: { dir: string });
  list(): Array<Record<string, unknown>>;
  save(dataset: unknown): { ok: true };
  delete(ids: string[]): { deleted: string[] };
}
