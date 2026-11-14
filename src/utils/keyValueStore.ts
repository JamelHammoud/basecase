export interface KeyValueStore<T> {
  get: (key: string) => Promise<T | undefined | null>;
  put: (key: string, value: T) => Promise<unknown>;
  delete: (key: string) => Promise<unknown>;
}

export function indexedDbStore<T>(database: string, store: string): KeyValueStore<T> {
  const open = (): Promise<IDBDatabase> | null => {
    if (typeof indexedDB === 'undefined') return null;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(database, 1);

      request.onupgradeneeded = () => request.result.createObjectStore(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error(`The ${database} store didn’t open.`));
    });
  };

  const run = async <R>(mode: IDBTransactionMode, act: (s: IDBObjectStore) => IDBRequest<R>): Promise<R | null> => {
    const db = await open();

    if (!db) return null;

    return new Promise((resolve, reject) => {
      const request = act(db.transaction(store, mode).objectStore(store));

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error(`The ${database} store failed.`));
    });
  };

  return {
    get: (key) => run<T | undefined>('readonly', (s) => s.get(key)),
    put: (key, value) => run('readwrite', (s) => s.put(value, key)),
    delete: (key) => run('readwrite', (s) => s.delete(key)),
  };
}
