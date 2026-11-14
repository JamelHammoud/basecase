import type { FrameSetBackend, StoredManifest } from './frameSetBackends';
import { readFrameSetManifest } from './frameSet';
import type { FrameSetSummary } from './frameSetPersistence';

const requestValue = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
const completed = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('The image storage write stopped.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('The image storage write failed.'));
  });

export function createWebFrameSets(): FrameSetBackend {
  let opening: Promise<IDBDatabase> | null = null;
  const open = () => {
    opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('Image storage is unavailable.'));

        return;
      }

      const request = indexedDB.open('basecase-vision', 1);

      request.onupgradeneeded = () => {
        for (const name of ['frames', 'manifests', 'summaries']) request.result.createObjectStore(name);
      };
      request.onerror = () => {
        opening = null;
        reject(request.error);
      };
      request.onblocked = () => {
        opening = null;
        reject(new Error('Close Basecase’s other tabs, then reload this one.'));
      };
      request.onsuccess = () => {
        const db = request.result;

        db.onversionchange = () => {
          db.close();
          opening = null;
        };
        resolve(db);
      };
    });

    return opening;
  };
  const get = async <T>(store: string, id: string): Promise<T | null> => {
    const transaction = (await open()).transaction(store, 'readonly');

    return (await requestValue<T | undefined>(transaction.objectStore(store).get(id))) ?? null;
  };

  return {
    list: async () =>
      requestValue<FrameSetSummary[]>(
        (await open()).transaction('summaries', 'readonly').objectStore('summaries').getAll(),
      ),
    read: (id) => get<StoredManifest>('manifests', id),
    frame: (id) => get<string>('frames', id),
    saveFrame: async (id, data) => {
      const transaction = (await open()).transaction('frames', 'readwrite');
      const done = completed(transaction);

      transaction.objectStore('frames').put(data, id);
      await done;
    },
    save: async (data) => {
      const manifest = readFrameSetManifest(data);

      if (!manifest) throw new Error('Couldn’t read the frame set.');

      const db = await open();
      const existing = await get<StoredManifest>('manifests', manifest.id);
      const keys = await requestValue(db.transaction('frames', 'readonly').objectStore('frames').getAllKeys());
      const stored = new Set(keys);

      if (manifest.frames.some((id) => !stored.has(id))) throw new Error('The frame set has a missing frame.');

      const createdAt = existing?.createdAt ?? new Date().toISOString();
      const transaction = db.transaction(['manifests', 'summaries'], 'readwrite');
      const done = completed(transaction);

      transaction.objectStore('manifests').put({ manifest: data, createdAt }, manifest.id);
      transaction.objectStore('summaries').put(
        {
          id: manifest.id,
          name: manifest.name,
          caseId: manifest.caseId,
          frames: manifest.frames.length,
          classCount: manifest.classes.length,
          createdAt,
        },
        manifest.id,
      );
      await done;
    },
  };
}
