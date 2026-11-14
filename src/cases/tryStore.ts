import type { Recording } from '../sim/recorder';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { withGenerated, type StoredTry } from './storedTry';
import type { TryBackend } from './tryBackend';
import { bridgeTries } from './tryBridge';
import { idbTries } from './tryStoreIdb';

let backend: TryBackend = IS_WEB_DEMO ? idbTries : bridgeTries;
let listed: StoredTry[] | null = null;
let loading: Promise<StoredTry[]> | null = null;
const listeners = new Set<() => void>();
const deletedListeners = new Set<(ids: readonly string[]) => void>();

const publish = (next: StoredTry[]) => {
  listed = next;
  listeners.forEach((l) => l());
};

export const setTryBackend = (next: TryBackend) => {
  backend = next;
  listed = null;
  loading = null;
};

export const storedTriesNow = () => listed;

export function subscribeTries(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function onTriesDeleted(listener: (ids: readonly string[]) => void) {
  deletedListeners.add(listener);

  return () => {
    deletedListeners.delete(listener);
  };
}

export function listTries(): Promise<StoredTry[]> {
  if (listed) return Promise.resolve(listed);

  loading ??= backend.list().then(
    (reply) => {
      const all = Array.isArray(reply) ? reply : [];

      publish(all);

      return all;
    },
    () => {
      loading = null;

      return [];
    },
  );

  return loading;
}

export async function keepTry(manifest: StoredTry, recording?: Recording, film?: Blob) {
  await backend.save({ manifest, recording, film });
  await listTries();

  if (listed) publish([...listed.filter((t) => t.id !== manifest.id), manifest]);
}

export async function keepFilm(manifest: StoredTry, film: Blob) {
  await backend.save({ manifest, film });
}

export const loadRecording = (id: string) => backend.recording(id).catch(() => null);

export const loadFilm = (id: string) => backend.film(id).catch(() => null);

export async function deleteTries(ids: readonly string[]): Promise<string[]> {
  const all = await listTries();
  const gone = withGenerated(all, ids);
  const goes = new Set(gone);

  await backend.remove(gone);

  if (listed) publish(listed.filter((t) => !goes.has(t.id)));

  deletedListeners.forEach((l) => l(gone));

  return gone;
}

export async function passTries(ids: readonly string[]) {
  const picked = new Set(ids);
  const all = await listTries();

  for (const t of all.filter((s) => picked.has(s.id)))
    await keepTry({ ...t, outcome: { ...t.outcome, result: 'passed' } });
}
