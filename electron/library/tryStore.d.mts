export class TryStore {
  constructor(options: { triesDir: string; cacheFile: string });
  list(): Array<Record<string, unknown>>;
  recording(id: string): Uint8Array | null;
  strip(id: string): Uint8Array | null;
  save(payload: { manifest: unknown; recording?: Uint8Array | null }): { ok: true };
  saveStrip(payload: { id: string; bytes: Uint8Array }): { ok: boolean };
  videoFile(id: string): string | null;
  writeVideo(chunk: { id: string; position: number; bytes: Uint8Array }): Promise<{ ok: boolean }>;
  closeVideo(ending: { id: string; keep: boolean }): Promise<{ ok: boolean }>;
  readonly videos: { sweep(): void };
  delete(ids: string[]): { deleted: string[] };
}
