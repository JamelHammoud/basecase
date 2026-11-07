import type { Recording } from '../sim/recorder';

const DB = 'basecase-tries';
const STORE = 'recordings';

function open(): Promise<IDBDatabase> | null {
  if (typeof indexedDB === 'undefined') return null;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);

    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('The tries store didn’t open.'));
  });
}

async function run<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await open();

  if (!db) return null;

  return new Promise((resolve, reject) => {
    const request = act(db.transaction(STORE, mode).objectStore(STORE));

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('The tries store failed.'));
  });
}

export const saveRecording = (id: string, recording: Recording) => run('readwrite', (s) => s.put(recording, id));

export const loadRecording = (id: string) => run<Recording | undefined>('readonly', (s) => s.get(id));

export const deleteRecording = (id: string) => run('readwrite', (s) => s.delete(id));
