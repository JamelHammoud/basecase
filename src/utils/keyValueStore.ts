export interface KeyValueStore<T> {
  get: (key: string) => Promise<T | undefined | null>;
  put: (key: string, value: T) => Promise<unknown>;
  delete: (key: string) => Promise<unknown>;
  deletePrefix: (prefix: string) => Promise<unknown>;
}

interface IndexedDbStoreOptions {
  database: string;
  store: string;
  label?: string;
}

export interface ListedStore<T> extends KeyValueStore<T> {
  values: () => Promise<T[]>;
  keys: () => Promise<string[]>;
}

export function indexedDbStore<T>({ database, store, label = database }: IndexedDbStoreOptions): ListedStore<T> {
  const open = (): Promise<IDBDatabase> | null => {
    if (typeof indexedDB === 'undefined') return null;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(database, 1);

      request.onupgradeneeded = () => request.result.createObjectStore(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error(`The ${label} store didn’t open.`));
    });
  };

  const run = async <R>(mode: IDBTransactionMode, act: (s: IDBObjectStore) => IDBRequest<R>): Promise<R | null> => {
    const db = await open();

    if (!db) return null;

    return new Promise((resolve, reject) => {
      const request = act(db.transaction(store, mode).objectStore(store));

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error(`The ${label} store failed.`));
    });
  };

  return {
    get: (key) => run<T | undefined>('readonly', (s) => s.get(key)),
    put: (key, value) => run('readwrite', (s) => s.put(value, key)),
    delete: (key) => run('readwrite', (s) => s.delete(key)),
    deletePrefix: (prefix) => run('readwrite', (s) => s.delete(IDBKeyRange.bound(prefix, `${prefix}￿`))),
    values: async () => (await run<T[]>('readonly', (s) => s.getAll())) ?? [],
    keys: async () => ((await run<IDBValidKey[]>('readonly', (s) => s.getAllKeys())) ?? []).map(String),
  };
}
