import { migrateSceneSummaries } from './sceneSummary';

export type WebStore = 'scenes' | 'sceneSummaries' | 'models' | 'guides' | 'settings' | 'skills' | 'trained';

const STORES: WebStore[] = ['scenes', 'sceneSummaries', 'models', 'guides', 'settings', 'skills', 'trained'];
const VERSION = 4;

let opening: Promise<IDBDatabase> | null = null;

const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

function openDb(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('basecase', VERSION);

    request.onupgradeneeded = () => {
      for (const name of STORES) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
      }

      migrateSceneSummaries(request.transaction!);
    };
    request.onsuccess = () => {
      const db = request.result;

      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      resolve(db);
    };
    request.onblocked = () => {
      opening = null;
      reject(new Error('Close Basecase’s other tabs, then reload this one.'));
    };
    request.onerror = () => {
      opening = null;
      reject(request.error);
    };
  });

  return opening;
}

async function storeOf(name: WebStore, mode: IDBTransactionMode) {
  return (await openDb()).transaction(name, mode).objectStore(name);
}

export async function idbGet<T>(name: WebStore, key: string): Promise<T | undefined> {
  return done<T | undefined>((await storeOf(name, 'readonly')).get(key));
}

export async function idbAll<T>(name: WebStore, prefix?: string, count?: number): Promise<T[]> {
  const range = prefix === undefined ? undefined : IDBKeyRange.bound(prefix, `${prefix}\uffff`);

  const store = await storeOf(name, 'readonly');

  return done<T[]>(count === undefined ? store.getAll(range) : store.getAll(range, count));
}

export async function idbPut(name: WebStore, key: string, value: unknown): Promise<void> {
  await done((await storeOf(name, 'readwrite')).put(value, key));
}

export async function idbDelete(name: WebStore, key: string): Promise<void> {
  await done((await storeOf(name, 'readwrite')).delete(key));
}

type Change = { store: WebStore; key: string } & ({ kind: 'put'; value: unknown } | { kind: 'delete' });

export async function idbWrite(changes: Change[]): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction([...new Set(changes.map((change) => change.store))], 'readwrite');

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);

    try {
      for (const change of changes) {
        const store = transaction.objectStore(change.store);

        if (change.kind === 'delete') store.delete(change.key);
        else store.put(change.value, change.key);
      }
    } catch (error) {
      transaction.abort();
      reject(error);
    }
  });
}

function trimKeys(store: IDBObjectStore, range: IDBKeyRange, count: number, keep: string) {
  if (count <= 0) return;

  const request = store.openKeyCursor(range);
  let remaining = count;

  request.onsuccess = () => {
    const cursor = request.result;

    if (!cursor || remaining <= 0) return;

    if (cursor.key !== keep) {
      store.delete(cursor.key);
      remaining -= 1;
    }

    if (remaining > 0) cursor.continue();
  };
}

export async function idbPutBounded(options: {
  store: WebStore;
  key: string;
  value: unknown;
  prefix: string;
  max: number;
}): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction(options.store, 'readwrite');
  const store = transaction.objectStore(options.store);
  const range = IDBKeyRange.bound(options.prefix, `${options.prefix}\uffff`);

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    store.put(options.value, options.key);

    const count = store.count(range);

    count.onsuccess = () => trimKeys(store, range, count.result - options.max, options.key);
  });
}
