import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWebFrameSets } from './frameSetWebStore';
import { manifestOf, serializeFrameSetManifest } from './frameSet';
import { visionFixture } from './fixtures';

function fakeDatabase() {
  const stores = new Map(['frames', 'manifests', 'summaries'].map((name) => [name, new Map<IDBValidKey, unknown>()]));
  const transactions: { oncomplete?: () => void; onabort?: () => void; error?: Error }[] = [];
  const pending: (() => void)[] = [];
  const request = (result: unknown) => {
    const next = { result, onsuccess: undefined as (() => void) | undefined };

    queueMicrotask(() => next.onsuccess?.());

    return next;
  };
  const db = {
    close: vi.fn(),
    transaction: (_name: string | string[], mode: string) => {
      const transaction = {
        oncomplete: undefined as (() => void) | undefined,
        onabort: undefined as (() => void) | undefined,
        objectStore: (store: string) => ({
          get: (id: IDBValidKey) => request(stores.get(store)?.get(id)),
          getAll: () => request([...stores.get(store)!.values()]),
          getAllKeys: () => request([...stores.get(store)!.keys()]),
          put: (value: unknown, id: IDBValidKey) => {
            pending.push(() => stores.get(store)?.set(id, value));
          },
        }),
      };

      if (mode === 'readwrite') transactions.push(transaction);

      return transaction;
    },
  };

  vi.stubGlobal('indexedDB', {
    open: () => {
      const opened = { result: db, onsuccess: undefined as (() => void) | undefined };

      queueMicrotask(() => opened.onsuccess?.());

      return opened;
    },
  });

  return {
    stores,
    transactions,
    commit: () => {
      pending.splice(0).forEach((write) => write());
      transactions.at(-1)?.oncomplete?.();
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('web FrameSet persistence', () => {
  it('waits for a frame write transaction to complete before resolving', async () => {
    const db = fakeDatabase();
    const store = createWebFrameSets();
    let complete = false;
    const write = store.saveFrame('frame', 'bytes').then(() => {
      complete = true;
    });

    await vi.waitFor(() => expect(db.transactions).toHaveLength(1));
    expect(complete).toBe(false);
    db.commit();
    await write;
    expect(await store.frame('frame')).toBe('bytes');
  });
  it('rejects transaction aborts and never publishes a set with missing frames', async () => {
    const db = fakeDatabase();
    const store = createWebFrameSets();
    const write = store.saveFrame('frame', 'bytes');
    const rejected = expect(write).rejects.toThrow('stopped');

    await vi.waitFor(() => expect(db.transactions).toHaveLength(1));
    db.transactions[0].onabort?.();
    await rejected;
    await expect(store.save(serializeFrameSetManifest(manifestOf(visionFixture())))).rejects.toThrow('missing frame');
    expect(await store.list()).toEqual([]);
  });
  it('commits manifest and summary together after frames exist', async () => {
    const db = fakeDatabase();
    const set = visionFixture();
    const store = createWebFrameSets();

    db.stores.get('frames')?.set(set.frames[0].id, 'frame');

    const save = store.save(serializeFrameSetManifest(manifestOf(set)));

    await vi.waitFor(() => expect(db.transactions).toHaveLength(1));
    expect(await store.read(set.id)).toBeNull();
    expect(await store.list()).toEqual([]);
    db.commit();
    await save;
    expect(await store.read(set.id)).toMatchObject({ manifest: serializeFrameSetManifest(manifestOf(set)) });
    expect(await store.list()).toMatchObject([{ id: set.id, frames: 1, classCount: set.classes.length }]);
  });
});
