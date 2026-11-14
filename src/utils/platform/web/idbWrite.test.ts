import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function transactionFixture() {
  let start!: () => void;
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  const records = { put: vi.fn(), delete: vi.fn() };
  const summaries = { put: vi.fn(), delete: vi.fn() };
  const stores = { scenes: records, sceneSummaries: summaries };
  const transaction = {
    objectStore: vi.fn((name: keyof typeof stores) => stores[name]),
    oncomplete: null as (() => void) | null,
    onabort: null as (() => void) | null,
    error: null as Error | null,
    abort: vi.fn(),
  };
  const db = {
    transaction: vi.fn(() => {
      start();

      return transaction;
    }),
  };

  vi.stubGlobal('indexedDB', {
    open: () => {
      const request = { result: db, onsuccess: null as (() => void) | null };

      queueMicrotask(() => request.onsuccess?.());

      return request;
    },
  });

  return { transaction, db, records, summaries, started };
}

const changes = [
  { kind: 'put' as const, store: 'scenes' as const, key: 'arm', value: { parts: [1, 2, 3] } },
  { kind: 'put' as const, store: 'sceneSummaries' as const, key: 'arm', value: { partCount: 3 } },
];

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe('atomic web database writes', () => {
  it('writes both stores in one transaction and resolves only after commit', async () => {
    const { transaction, db, records, summaries, started } = transactionFixture();
    const { idbWrite } = await import('./idb');
    let committed = false;
    const write = idbWrite(changes).then(() => {
      committed = true;
    });

    await started;
    expect(records.put).toHaveBeenCalledWith(changes[0].value, 'arm');
    expect(db.transaction).toHaveBeenCalledExactlyOnceWith(['scenes', 'sceneSummaries'], 'readwrite');
    expect(summaries.put).toHaveBeenCalledWith(changes[1].value, 'arm');
    expect(committed).toBe(false);
    transaction.oncomplete?.();
    await write;
    expect(committed).toBe(true);
  });

  it('rejects a transaction aborted after its requests have been submitted', async () => {
    const { transaction, records, started } = transactionFixture();
    const { idbWrite } = await import('./idb');
    const write = idbWrite(changes);
    const rejected = expect(write).rejects.toThrow('disk full');

    await started;
    expect(records.put).toHaveBeenCalled();
    transaction.error = new Error('disk full');
    transaction.onabort?.();
    await rejected;
  });

  it('aborts earlier writes if a later value cannot be cloned', async () => {
    const { transaction, records, summaries } = transactionFixture();
    const { idbWrite } = await import('./idb');

    summaries.put.mockImplementation(() => {
      throw new Error('cannot clone');
    });

    await expect(idbWrite(changes)).rejects.toThrow('cannot clone');
    expect(records.put).toHaveBeenCalledOnce();
    expect(transaction.abort).toHaveBeenCalledOnce();
  });

  it('deletes both stores in one transaction', async () => {
    const { transaction, records, summaries, started } = transactionFixture();
    const { idbWrite } = await import('./idb');
    const write = idbWrite(changes.map(({ store, key }) => ({ kind: 'delete', store, key })));

    await started;
    expect(records.delete).toHaveBeenCalledWith('arm');
    expect(summaries.delete).toHaveBeenCalledWith('arm');
    transaction.oncomplete?.();
    await write;
  });
});
