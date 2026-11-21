import { indexedDbStore } from '../utils/keyValueStore';
import { keyValueAtomic } from '../utils/keyValueAtomic';

const database = 'basecase-builds';
const store = 'builds';

function openBuildStorage(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Build storage is unavailable.'));

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);

    request.onupgradeneeded = () => request.result.createObjectStore(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const buildStorage = {
  ...indexedDbStore<unknown>({ database, store }),
  update: keyValueAtomic<unknown>(openBuildStorage, store),
};
