import type { StoredTry } from '../../cases/tryFile';
import type { ImportedTry } from './importedTries';
import { DataImportError } from './types';

interface ImportStore {
  manifests: (ids: string[]) => Promise<StoredTry[]>;
  keep: (tries: ImportedTry[]) => Promise<void>;
  update: (stored: StoredTry[]) => Promise<StoredTry[]>;
}

async function existingImports(incoming: ImportedTry[], load: ImportStore['manifests']) {
  const ids = [...new Set(incoming.map(({ stored }) => stored.id))];
  const found: StoredTry[] = [];

  for (let at = 0; at < ids.length; at += 500) found.push(...(await load(ids.slice(at, at + 500))));

  return new Map(found.map((stored) => [stored.id, stored]));
}

function mergedSplit(previous: StoredTry | undefined, incoming: StoredTry): StoredTry {
  if (!previous) return incoming;

  if (previous.split && incoming.split && previous.split !== incoming.split)
    throw new DataImportError('The same source has conflicting dataset splits.');

  return previous.split || !incoming.split ? previous : { ...previous, split: incoming.split };
}

function importPlan(incoming: ImportedTry[], existing: Map<string, StoredTry>) {
  const fresh = new Map<string, ImportedTry>();
  const updated = new Map<string, StoredTry>();

  for (const candidate of incoming) {
    const id = candidate.stored.id;
    const current = updated.get(id) ?? existing.get(id);
    const repeated = fresh.get(id);
    const stored = mergedSplit(current ?? repeated?.stored, candidate.stored);

    if (current && stored !== current) updated.set(id, stored);

    if (current) continue;

    fresh.set(id, { ...(repeated ?? candidate), stored });
  }

  return { fresh: [...fresh.values()], updated: [...updated.values()] };
}

async function updateSplits(updated: StoredTry[], store: ImportStore) {
  if (!updated.length) return;

  const saved = await store.update(updated);

  if (saved.length !== updated.length) throw new DataImportError('Import the files again.');
}

export async function keepImportedTries(incoming: ImportedTry[], store: ImportStore): Promise<number> {
  const existing = await existingImports(incoming, store.manifests);
  const { fresh, updated } = importPlan(incoming, existing);

  await updateSplits(updated, store);

  if (fresh.length) await store.keep(fresh);

  return fresh.length;
}
