import { afterEach, describe, expect, it, vi } from 'vitest';
import { freezeVersion, newDataset, type Dataset } from '../datasetFile';
import { writeWebDataset } from './webDatasetWrite';

interface RequestFake {
  result: unknown;
  onsuccess: (() => void) | null;
}

function request(action: () => unknown) {
  const pending: RequestFake = { result: undefined, onsuccess: null };

  return {
    pending,
    run: () => {
      pending.result = action();
      pending.onsuccess?.();
    },
  };
}

function databaseFixture() {
  const state = {
    stored: new Map<string, Dataset>(),
    opened: 0,
    closed: 0,
    active: 0,
    maxActive: 0,
    holdCommit: false,
    failPut: false,
    failGet: false,
    failTransaction: false,
    commits: [] as (() => void)[],
    scopes: [] as Array<{ name: string; mode: IDBTransactionMode }>,
  };
  let lock = Promise.resolve();

  function transaction(name: string, mode: IDBTransactionMode) {
    if (state.failTransaction) throw new Error('Transaction unavailable');

    state.scopes.push({ name, mode });

    const operations: Array<() => void> = [];
    const tx = {
      oncomplete: null as (() => void) | null,
      onabort: null as (() => void) | null,
      onerror: null as (() => void) | null,
      error: null as Error | null,
      abort: () => finish(false),
      objectStore: () => ({
        get: (key: string) =>
          enqueue(() => {
            if (state.failGet) throw new Error('Read failed');

            return structuredClone(staged.get(key));
          }),
        put: (value: Dataset, key: string) =>
          enqueue(() => {
            if (state.failPut) throw new Error('Storage full');

            staged.set(key, structuredClone(value));

            return key;
          }),
      }),
    };
    let staged = new Map<string, Dataset>();
    let started = false;
    let ended = false;
    let release = () => {};
    const previous = lock;

    lock = new Promise<void>((resolve) => {
      release = resolve;
    });

    function finish(commit: boolean) {
      if (ended) return;

      ended = true;
      state.active--;

      if (commit) state.stored = staged;

      if (commit) tx.oncomplete?.();
      else tx.onabort?.();

      release();
    }

    function complete() {
      const commit = () => finish(true);

      if (state.holdCommit) {
        state.commits.push(commit);

        return;
      }

      commit();
    }

    function drain() {
      if (!started || ended) return;

      const operation = operations.shift();

      if (!operation) {
        complete();

        return;
      }

      try {
        operation();
      } catch (error) {
        tx.error = error as Error;
        tx.onerror?.();
        finish(false);

        return;
      }

      queueMicrotask(drain);
    }

    function enqueue(action: () => unknown) {
      const next = request(action);

      operations.push(next.run);

      return next.pending;
    }

    void previous.then(() => {
      state.active++;
      state.maxActive = Math.max(state.active, state.maxActive);
      staged = structuredClone(state.stored);
      started = true;
      queueMicrotask(drain);
    });

    return tx;
  }

  vi.stubGlobal('indexedDB', {
    open: () => {
      state.opened++;

      const opened = {
        result: {
          transaction,
          close: () => {
            state.closed++;
          },
        },
        onsuccess: null as (() => void) | null,
      };

      queueMicrotask(() => opened.onsuccess?.());

      return opened;
    },
  });

  return state;
}

const dataset = () => newDataset({ id: 'dataset', name: 'Grasps', task: 'Pick', members: ['try-a'], at: 'now' });
const frozen = () => freezeVersion(dataset(), 'first', 'now').dataset;

afterEach(() => vi.unstubAllGlobals());

describe('atomic browser dataset writes', () => {
  it('retains version history from separate connections competing with a stale membership edit', async () => {
    const state = databaseFixture();
    const first = frozen();
    const second = { ...dataset(), versions: [{ ...first.versions[0], n: 2, hash: 'second' }] };

    await Promise.all([
      writeWebDataset(first),
      writeWebDataset(second),
      writeWebDataset({ ...dataset(), members: ['try-b'] }),
    ]);

    expect(state.opened).toBe(3);
    expect(state.closed).toBe(3);
    expect(state.maxActive).toBe(1);
    expect(state.scopes).toEqual(Array.from({ length: 3 }, () => ({ name: 'datasets', mode: 'readwrite' })));
    expect(state.stored.get(first.id)).toEqual({
      ...second,
      members: ['try-b'],
      versions: [...first.versions, ...second.versions],
    });
  });

  it('rejects a competing immutable archive replacement and commits the first assignment', async () => {
    const state = databaseFixture();
    const first = frozen();
    const archive = (hash: string) => ({ ...first, versions: [{ ...first.versions[0], archive: hash }] });

    await writeWebDataset(first);

    const results = await Promise.allSettled([
      writeWebDataset(archive('a'.repeat(64))),
      writeWebDataset(archive('b'.repeat(64))),
    ]);

    expect(results[0].status).toBe('fulfilled');
    expect(results[1]).toMatchObject({
      status: 'rejected',
      reason: expect.objectContaining({ message: expect.stringContaining('saved version') }),
    });
    expect(state.stored.get(first.id)?.versions[0].archive).toBe('a'.repeat(64));
    expect(state.closed).toBe(3);
    await writeWebDataset({ ...first, name: 'Renamed' });
    expect(state.stored.get(first.id)?.name).toBe('Renamed');
  });

  it('resolves only after the readwrite transaction commits', async () => {
    const state = databaseFixture();
    const settled = vi.fn();

    state.holdCommit = true;

    const saving = writeWebDataset(frozen()).then(settled);

    await vi.waitFor(() => expect(state.commits).toHaveLength(1));
    expect(state.stored.size).toBe(0);
    expect(settled).not.toHaveBeenCalled();
    expect(state.closed).toBe(0);
    state.commits[0]();
    await saving;
    expect(settled).toHaveBeenCalledOnce();
    expect(state.stored.size).toBe(1);
    expect(state.closed).toBe(1);
  });

  it('aborts failed writes without resolving or changing stored history', async () => {
    const state = databaseFixture();
    const first = frozen();

    await writeWebDataset(first);
    state.failPut = true;
    await expect(writeWebDataset({ ...first, name: 'Lost' })).rejects.toThrow('Storage full');
    expect(state.stored.get(first.id)).toEqual(first);
    expect(state.closed).toBe(2);
  });

  it('rejects failed reads and transaction setup while closing each connection', async () => {
    const state = databaseFixture();
    const first = frozen();

    await writeWebDataset(first);
    state.failGet = true;
    await expect(writeWebDataset(first)).rejects.toThrow('Read failed');
    state.failGet = false;
    state.failTransaction = true;
    await expect(writeWebDataset(first)).rejects.toThrow('Transaction unavailable');
    expect(state.stored.get(first.id)).toEqual(first);
    expect(state.closed).toBe(3);
  });

  it('rejects a database open failure', async () => {
    vi.stubGlobal('indexedDB', {
      open: () => {
        const opened = { error: new Error('Open failed'), onerror: null as (() => void) | null };

        queueMicrotask(() => opened.onerror?.());

        return opened;
      },
    });

    await expect(writeWebDataset(frozen())).rejects.toThrow('Open failed');
  });

  it('refuses unavailable persistent storage', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(writeWebDataset(frozen())).rejects.toThrow('store');
  });
});
