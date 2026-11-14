export class TryStore {
  constructor(options: { triesDir: string; cacheFile: string });
  list(): Array<Record<string, unknown>>;
  recording(id: string): Uint8Array | null;
  strip(id: string): Uint8Array | null;
  session(id: string): Uint8Array | null;
  appendSession(id: string, text: string): { ok: boolean };
  saveVideo(payload: { id: string; bytes: Uint8Array }): { ok: boolean };
  save(payload: { manifest: unknown; recording?: Uint8Array | null; session?: Uint8Array | null }): { ok: true };
  saveStrip(payload: { id: string; bytes: Uint8Array }): { ok: boolean };
  delete(ids: string[]): { deleted: string[] };
}

export interface SessionSink {
  append(id: string, text: string): void;
  keep(manifest: Record<string, unknown>): void;
  drop(id: string): void;
}

export function sessionSink(store: TryStore): SessionSink;
