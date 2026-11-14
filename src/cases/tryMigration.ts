import type { Recording } from '../sim/recorder';
import { storedTryOf, type StoredTry, type TryContext } from './tryFile';
import type { TryRecord } from './tries';

export interface TryMove {
  stored: ReadonlySet<string>;
  legacy: (id: string) => Promise<Recording | null | undefined>;
  dropLegacy: (id: string) => Promise<unknown>;
  keep: (kept: Array<{ stored: StoredTry; recording: Recording | null }>) => Promise<unknown>;
}

export async function moveTries(records: TryRecord[], context: (record: TryRecord) => TryContext, move: TryMove) {
  const moved: string[] = [];

  for (const record of records) {
    if (move.stored.has(record.id)) continue;

    const recording = (await move.legacy(record.id)) ?? null;

    await move.keep([{ stored: storedTryOf(record, context(record)), recording }]);

    if (recording) await move.dropLegacy(record.id);

    moved.push(record.id);
  }

  return moved;
}

export const inStore = (records: TryRecord[], stored: ReadonlySet<string> | null, moved: boolean) =>
  moved && stored ? records.filter((r) => stored.has(r.id)) : records;
