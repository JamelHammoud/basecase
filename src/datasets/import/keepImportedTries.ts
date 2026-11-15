import type { StoredTry } from '../../cases/tryFile';
import type { TryVideoUpload } from '../../cases/tryStore/videoUploadTypes';
import type { ImportedTry } from './importedTries';
import { DataImportError } from './types';

interface ImportStore {
  manifests: (ids: string[]) => Promise<StoredTry[]>;
  keep: (tries: ImportedTry[]) => Promise<void>;
  update: (stored: StoredTry[]) => Promise<StoredTry[]>;
  videos: (videos: TryVideoUpload[]) => Promise<void>;
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

function importVideos(incoming: ImportedTry[], targets: Map<string, StoredTry>): TryVideoUpload[] {
  const uploads = new Map<string, TryVideoUpload>();

  for (const { stored, videos } of incoming) {
    const saved = targets.get(stored.id);

    for (const video of videos ?? []) {
      const source = stored.videos?.find((entry) => entry.camera === video.camera);
      const matching = saved?.videos?.some(
        (entry) =>
          entry.camera === video.camera &&
          entry.path === source?.path &&
          entry.from === source?.from &&
          entry.to === source?.to,
      );

      if (matching) uploads.set(JSON.stringify([stored.id, video.camera]), { ...video, id: stored.id });
    }
  }

  return [...uploads.values()];
}

export async function keepImportedTries(incoming: ImportedTry[], store: ImportStore): Promise<number> {
  const existing = await existingImports(incoming, store.manifests);
  const { fresh, updated } = importPlan(incoming, existing);
  const targets = new Map(existing);

  for (const { stored } of fresh) targets.set(stored.id, stored);

  const videos = importVideos(incoming, targets);

  await updateSplits(updated, store);

  if (fresh.length) await store.keep(fresh.map(({ stored, recording }) => ({ stored, recording })));

  if (videos.length) await store.videos(videos);

  return fresh.length;
}
