import type { FrameSetStore } from './frameSetStore.mjs';

export const MAX_DATASET_BYTES: number;

export class DatasetStore {
  images: FrameSetStore;
  constructor(options: { dir: string });
  saveContent(bytes: Uint8Array): string;
  content(hash: string): Uint8Array | null;
  list(): Array<Record<string, unknown>>;
  save(dataset: unknown): { ok: true };
  delete(ids: string[]): { deleted: string[] };
}
