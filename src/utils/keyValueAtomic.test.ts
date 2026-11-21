import { expect, it, vi } from 'vitest';
import { keyValueAtomic } from './keyValueAtomic';

function database(options: { close?: boolean } = {}) {
  const writes = vi.fn();
  const get = { result: { index: 0 }, onsuccess: null as (() => void) | null };
  const transaction = {
    objectStore: () => ({ get: () => get, put: writes, delete: vi.fn() }),
    oncomplete: null as (() => void) | null,
    onabort: null as (() => void) | null,
    abort: () => transaction.onabort?.(),
    error: new Error('Interrupted'),
  };
  const db = { close: vi.fn(), transaction: () => transaction };
  const atomic = keyValueAtomic<{ index: number }>(
    () => Promise.resolve(db as unknown as IDBDatabase),
    'builds',
    options,
  );

  return { atomic, get, transaction, writes, db };
}

it('acknowledges a progress write only when the storage transaction commits', async () => {
  const { atomic, get, transaction, writes, db } = database();
  let saved = false;
  const result = atomic(['one'], () => ({ puts: { one: { index: 2 } }, result: 2 })).then((value) => {
    saved = true;

    return value;
  });

  await Promise.resolve();
  get.onsuccess!();
  expect(writes).toHaveBeenCalledWith({ index: 2 }, 'one');
  await Promise.resolve();
  expect(saved).toBe(false);
  transaction.oncomplete!();
  expect(await result).toBe(2);
  expect(db.close).toHaveBeenCalledOnce();
});

it('acknowledges a shared purchase transaction without closing its database connection', async () => {
  const { atomic, get, transaction, db } = database({ close: false });
  const result = atomic(['purchases'], () => ({ puts: { purchases: { index: 2 } }, result: 2 }));

  await Promise.resolve();
  get.onsuccess!();
  transaction.oncomplete!();
  expect(await result).toBe(2);
  expect(db.close).not.toHaveBeenCalled();
});

it.each(['interruption', 'cancellation'] as const)('never acknowledges a write after %s', async (fault) => {
  const { atomic, get, transaction } = database();
  const abort = new AbortController();
  const result = atomic(['one'], () => ({ puts: { one: { index: 2 } }, result: 2 }), abort.signal);
  const rejected = expect(result).rejects.toThrow();

  await Promise.resolve();
  get.onsuccess!();

  if (fault === 'cancellation') abort.abort();
  else transaction.onabort!();

  await rejected;
});
