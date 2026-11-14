import type { Recording } from '../sim/recorder';
import type { StoredTry } from './storedTry';
import type { TryBackend } from './tryBackend';

const DB = 'basecase-tries';
const VERSION = 2;
const RECORDINGS = 'recordings';
const MANIFESTS = 'manifests';
const FILMS = 'films';
const STORES = [RECORDINGS, MANIFESTS, FILMS];

type Store = (typeof STORES)[number];

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, VERSION);

    request.onupgradeneeded = () => {
      for (const name of STORES) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      opening = null;
      reject(request.error ?? new Error('The tries store didn’t open.'));
    };
  });

  return opening;
}

const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('The tries store failed.'));
  });

async function run<T>(store: Store, mode: IDBTransactionMode, act: (s: IDBObjectStore) => IDBRequest<T>) {
  const db = await open();

  return done(act(db.transaction(store, mode).objectStore(store)));
}

export const hasIndexedDb = () => typeof indexedDB !== 'undefined';

export const legacyRecording = async (id: string): Promise<Recording | null> =>
  hasIndexedDb() ? ((await run<Recording | undefined>(RECORDINGS, 'readonly', (s) => s.get(id))) ?? null) : null;

export const dropLegacyRecording = async (id: string) => {
  if (hasIndexedDb()) await run(RECORDINGS, 'readwrite', (s) => s.delete(id));
};

export const idbTries: TryBackend = {
  list: () => run<StoredTry[]>(MANIFESTS, 'readonly', (s) => s.getAll()),
  save: async ({ manifest, recording, film }) => {
    if (recording) await run(RECORDINGS, 'readwrite', (s) => s.put(recording, manifest.id));

    if (film) await run(FILMS, 'readwrite', (s) => s.put(film, manifest.id));

    await run(MANIFESTS, 'readwrite', (s) => s.put(manifest, manifest.id));
  },
  recording: legacyRecording,
  film: async (id) => (await run<Blob | undefined>(FILMS, 'readonly', (s) => s.get(id))) ?? null,
  remove: async (ids) => {
    for (const store of STORES) await Promise.all(ids.map((id) => run(store, 'readwrite', (s) => s.delete(id))));
  },
};
