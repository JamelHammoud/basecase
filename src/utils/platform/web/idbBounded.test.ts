import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

it('puts, counts and trims only prefix keys in one transaction before resolving', async () => {
  vi.resetModules();

  const range = { lower: 'outcome/', upper: 'outcome/\uffff' };
  const count = { result: 3, onsuccess: null as (() => void) | null };
  const cursor = {
    result: { key: 'outcome/old', continue: vi.fn() },
    onsuccess: null as (() => void) | null,
  };
  const store = { put: vi.fn(), count: vi.fn(() => count), openKeyCursor: vi.fn(() => cursor), delete: vi.fn() };
  const transaction = {
    objectStore: vi.fn(() => store),
    oncomplete: null as (() => void) | null,
    onabort: null as (() => void) | null,
    error: null,
  };
  const db = { transaction: vi.fn(() => transaction) };
  let opened!: () => void;
  const ready = new Promise<void>((resolve) => {
    opened = resolve;
  });

  vi.stubGlobal('IDBKeyRange', { bound: vi.fn(() => range) });
  vi.stubGlobal('indexedDB', {
    open: () => {
      const request = { result: db, onsuccess: null as (() => void) | null };

      queueMicrotask(() => {
        request.onsuccess?.();
        opened();
      });

      return request;
    },
  });

  const { idbPutBounded } = await import('./idb');
  let completed = false;
  const saving = idbPutBounded({
    store: 'settings',
    key: 'outcome/new',
    value: { attempt: 1 },
    prefix: 'outcome/',
    max: 2,
  }).then(() => {
    completed = true;
  });

  await ready;
  await Promise.resolve();
  expect(db.transaction).toHaveBeenCalledExactlyOnceWith('settings', 'readwrite');
  expect(store.put).toHaveBeenCalledExactlyOnceWith({ attempt: 1 }, 'outcome/new');
  expect(store.count).toHaveBeenCalledExactlyOnceWith(range);
  count.onsuccess?.();
  expect(store.openKeyCursor).toHaveBeenCalledExactlyOnceWith(range);
  cursor.result.key = 'outcome/new';
  cursor.onsuccess?.();
  expect(store.delete).not.toHaveBeenCalled();
  expect(cursor.result.continue).toHaveBeenCalledTimes(1);
  cursor.result.key = 'outcome/old';
  cursor.onsuccess?.();
  expect(store.delete).toHaveBeenCalledExactlyOnceWith('outcome/old');
  expect(completed).toBe(false);
  transaction.oncomplete?.();
  await saving;
  expect(completed).toBe(true);
});
