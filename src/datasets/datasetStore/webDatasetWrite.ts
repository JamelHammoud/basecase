import { mergeDatasetVersions } from '../../../electron/library/datasetVersions.mjs';
import { readDataset, type Dataset } from '../datasetFile';

export const DATASET_DATABASE = 'basecase-datasets';
export const DATASET_STORE = 'datasets';

function openDatasetDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('The dataset store is unavailable.'));

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATASET_DATABASE, 1);

    request.onupgradeneeded = () => request.result.createObjectStore(DATASET_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('The dataset store didn’t open.'));
  });
}

function updateDataset(db: IDBDatabase, incoming: Dataset): Promise<Dataset> {
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction;

    try {
      transaction = db.transaction(DATASET_STORE, 'readwrite');
    } catch (error) {
      db.close();
      reject(error);

      return;
    }

    let failure: unknown;
    let saved: Dataset;
    const fail = (error: unknown) => {
      failure = error;

      try {
        transaction.abort();
      } catch {
        db.close();
        reject(error);
      }
    };

    transaction.oncomplete = () => {
      db.close();
      resolve(saved);
    };
    transaction.onerror = () => {
      failure ??= transaction.error;
    };
    transaction.onabort = () => {
      db.close();
      reject(failure ?? transaction.error ?? new Error('The dataset wasn’t saved.'));
    };

    try {
      const store = transaction.objectStore(DATASET_STORE);
      const request = store.get(incoming.id);

      request.onsuccess = () => {
        try {
          const merged = mergeDatasetVersions(incoming, request.result);

          store.put(merged, incoming.id);
          saved = merged;
        } catch (error) {
          fail(error);
        }
      };
    } catch (error) {
      fail(error);
    }
  });
}

export async function writeWebDataset(dataset: Dataset): Promise<Dataset> {
  const incoming = readDataset(structuredClone(dataset));

  if (!incoming) throw new Error('The dataset file is damaged.');

  const db = await openDatasetDatabase();

  return updateDataset(db, incoming);
}
