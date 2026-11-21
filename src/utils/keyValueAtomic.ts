export interface AtomicChanges<T, R> {
  puts: Record<string, T>;
  deletes?: string[];
  result: R;
}

export type AtomicUpdate<T> = <R>(
  keys: string[],
  change: (values: Array<T | undefined>) => AtomicChanges<T, R>,
  signal?: AbortSignal,
) => Promise<R>;

export function keyValueAtomic<T>(
  open: () => Promise<IDBDatabase> | null,
  store: string,
  options: { close?: boolean } = {},
): AtomicUpdate<T> {
  return async (keys, change, signal) => {
    signal?.throwIfAborted();

    const db = await open();

    if (!db) throw new Error('Build storage is unavailable.');

    const close = () => options.close !== false && db.close();

    if (signal?.aborted) {
      close();

      signal.throwIfAborted();
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(store, 'readwrite', { durability: 'strict' });
      const target = transaction.objectStore(store);
      const cancel = () => transaction.abort();

      signal?.addEventListener('abort', cancel, { once: true });

      const values: Array<T | undefined> = [];
      let pending = keys.length;
      let result: ReturnType<typeof change>['result'];
      let failure: unknown;
      const apply = () => {
        try {
          signal?.throwIfAborted();

          const changed = change(values);

          result = changed.result;

          for (const [key, value] of Object.entries(changed.puts)) target.put(value, key);

          for (const key of changed.deletes ?? []) target.delete(key);
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };

      transaction.oncomplete = () => {
        signal?.removeEventListener('abort', cancel);

        close();

        resolve(result);
      };
      transaction.onabort = () => {
        signal?.removeEventListener('abort', cancel);

        close();

        reject(failure ?? transaction.error);
      };

      keys.forEach((key, index) => {
        const request = target.get(key);

        request.onsuccess = () => {
          values[index] = request.result;
          pending--;

          if (!pending) apply();
        };
      });

      if (!pending) apply();
    });
  };
}
