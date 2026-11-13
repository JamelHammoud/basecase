export type WebStore = 'scenes' | 'models' | 'guides' | 'settings' | 'skills' | 'trained';

const STORES: WebStore[] = ['scenes', 'models', 'guides', 'settings', 'skills', 'trained'];
const VERSION = 3;

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

export async function idbAll<T>(name: WebStore): Promise<T[]> {
  return done<T[]>((await storeOf(name, 'readonly')).getAll());
}

export async function idbPut(name: WebStore, key: string, value: unknown): Promise<void> {
  await done((await storeOf(name, 'readwrite')).put(value, key));
}

export async function idbDelete(name: WebStore, key: string): Promise<void> {
  await done((await storeOf(name, 'readwrite')).delete(key));
}
