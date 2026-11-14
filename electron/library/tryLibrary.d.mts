export type TrySummary = Record<string, unknown> & { id: string; at?: string };

export interface TryOpened {
  record: Record<string, unknown> & { id: string };
  recording: Uint8Array | null;
}

export interface TrySave {
  record: Record<string, unknown> & { id: string; version: number };
  recording?: Uint8Array | null;
  videos?: Record<string, Uint8Array>;
}

export function summarize(record: Record<string, unknown>): TrySummary;

export class TryLibrary {
  constructor(options: { triesDir: string; cacheFile: string });
  triesDir: string;
  cacheFile: string;
  list(): TrySummary[];
  save(payload: TrySave): TrySummary;
  open(id: string): TryOpened | null;
  film(id: string): Uint8Array | null;
  saveFilm(payload: { id: string; film: Uint8Array }): { ok: true };
  delete(ids: string[]): { deleted: string[] };
}
