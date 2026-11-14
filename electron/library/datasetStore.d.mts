export const MAX_DATASET_BYTES: number;

export class DatasetStore {
  constructor(options: { dir: string });
  list(): Array<Record<string, unknown>>;
  save(dataset: unknown): { ok: true };
  delete(ids: string[]): { deleted: string[] };
}
