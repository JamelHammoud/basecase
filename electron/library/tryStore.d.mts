export class TryStore {
  constructor(options: { triesDir: string; cacheFile: string });
  list(): Array<Record<string, unknown>>;
  recording(id: string): Uint8Array | null;
  manifest(id: string): Record<string, unknown> | null;
  relabel(changes: Array<{ id: string; patch: Record<string, unknown> }>): { relabelled: string[] };
  strip(id: string): Uint8Array | null;
  save(payload: { manifest: unknown; recording?: Uint8Array | null }): { ok: true };
  saveStrip(payload: { id: string; bytes: Uint8Array }): { ok: boolean };
  delete(ids: string[]): { deleted: string[] };
}
