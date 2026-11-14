export class TryStore {
  constructor(options: { triesDir: string; cacheFile: string; indexFile?: string });
  list(): Array<Record<string, unknown>>;
  recording(id: string): Uint8Array | null;
  strip(id: string): Uint8Array | null;
  save(payload: { manifest: unknown; recording?: Uint8Array | null }): { ok: true };
  saveStrip(payload: { id: string; bytes: Uint8Array }): { ok: boolean };
  manifests(ids: string[]): Array<Record<string, unknown>>;
  index(): Uint8Array | null;
  saveIndex(bytes: Uint8Array): { ok: true };
  delete(ids: string[]): { deleted: string[] };
}
