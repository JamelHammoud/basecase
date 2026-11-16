import type { KeyValueStore } from '../utils/keyValueStore';
import type { RecoveryEntry } from './skillRecovery';

const DATABASE = 'basecase-remote-training';
const STORE = 'workflows';
const MAX_BYTES = 64 * 1024 * 1024;

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(DATABASE, 1);

    opening.onupgradeneeded = () => opening.result.createObjectStore(STORE);
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error);
  });
}

async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openStore();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));

    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error('The training recovery record could not be saved.'));
    };
    tx.onerror = () => reject(tx.error);
  });
}

export const recoveryStore: KeyValueStore<RecoveryEntry> = {
  get: (key) => transaction('readonly', (store) => store.get(key)),
  put: (key, value) => {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_BYTES)
      return Promise.reject(new Error('The training recovery record exceeds 64 MB.'));

    return transaction('readwrite', (store) => store.put(value, key));
  },
  delete: (key) => transaction('readwrite', (store) => store.delete(key)),
  deletePrefix: (prefix) => transaction('readwrite', (store) => store.delete(IDBKeyRange.bound(prefix, `${prefix}￿`))),
};
