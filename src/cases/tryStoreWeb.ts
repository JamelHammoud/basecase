import type { Recording } from '../sim/recorder';
import { newestFirst, trySummary, withGenerated, type TryRecord } from './tries';
import type { TryBackend } from './tryStore';

const DB = 'basecase-tries';
const VERSION = 2;
const LEGACY = 'recordings';
const TRIES = 'tries';
const RECORDINGS = 'try-recordings';
const FILMS = 'films';
const STORES = [LEGACY, TRIES, RECORDINGS, FILMS];

const UNOPENED = 'The tries store didn’t open.';

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error(UNOPENED));

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
      reject(request.error ?? new Error(UNOPENED));
    };
  });

  return opening;
}

async function run<T>(store: string, mode: IDBTransactionMode, act: (s: IDBObjectStore) => IDBRequest<T>) {
  const db = await open();

  return new Promise<T>((resolve, reject) => {
    const request = act(db.transaction(store, mode).objectStore(store));

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('The tries store failed.'));
  });
}

const get = <T>(store: string, id: string) => run<T | undefined>(store, 'readonly', (s) => s.get(id));

const put = (store: string, id: string, value: unknown) => run(store, 'readwrite', (s) => s.put(value, id));

const drop = (store: string, id: string) => run(store, 'readwrite', (s) => s.delete(id));

const allTries = () => run<TryRecord[]>(TRIES, 'readonly', (s) => s.getAll());

export const legacyRecordings = {
  load: async (id: string) => (await get<Recording>(LEGACY, id).catch(() => undefined)) ?? null,
  remove: (id: string) => drop(LEGACY, id),
};

export const webTries: TryBackend = {
  list: async () => newestFirst(await allTries()).map(trySummary),
  save: async (record, recording) => {
    await put(TRIES, record.id, record);

    if (recording) await put(RECORDINGS, record.id, recording);
  },
  open: async (id) => {
    const record = await get<TryRecord>(TRIES, id);

    return record ? { record, recording: (await get<Recording>(RECORDINGS, id)) ?? null } : null;
  },
  remove: async (ids) => {
    const all = await allTries();
    const known = new Set(all.map((t) => t.id));
    const gone = [...withGenerated(all, ids)].filter((id) => known.has(id));

    for (const id of gone) await Promise.all([TRIES, RECORDINGS, FILMS].map((store) => drop(store, id)));

    return gone;
  },
  film: async (id) => (await get<Blob>(FILMS, id)) ?? null,
  saveFilm: async (id, film) => {
    await put(FILMS, id, film);
  },
};
