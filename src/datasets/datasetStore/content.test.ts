import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListedStore } from '../../utils/keyValueStore';
import { datasetContentHash } from '../contentHash';

const stored = vi.hoisted(() => new Map<string, Map<string, unknown>>());

vi.mock('../../utils/keyValueStore', () => ({
  indexedDbStore: <T>({ database }: { database: string }): ListedStore<T> => {
    const values = () => {
      let found = stored.get(database);

      if (!found) {
        found = new Map();
        stored.set(database, found);
      }

      return found;
    };

    return {
      get: async (key) => structuredClone(values().get(key)) as T | undefined,
      put: async (key, value) => values().set(key, structuredClone(value)),
      delete: async (key) => values().delete(key),
      deletePrefix: async () => {},
      values: async () => [...values().values()] as T[],
      keys: async () => [...values().keys()],
    };
  },
}));
vi.mock('../../utils/platform/webDemo', () => ({ IS_WEB_DEMO: true }));

const { webRequest } = await import('../../utils/platform/web/webBackend');
const { webDatasets } = await import('./webDatasets');
const { loadDatasetContent, saveDatasetContent } = await import('./content');
const HASH = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const bytes = () => new TextEncoder().encode('abc');

beforeEach(() => stored.clear());

describe('browser dataset content', () => {
  it('uses the standard SHA-256 key for byte views and keeps blobs through dataset deletion', async () => {
    const padded = new TextEncoder().encode('xabcx');

    expect(await datasetContentHash(padded.subarray(1, 4))).toBe(HASH);
    expect(await saveDatasetContent(bytes())).toBe(HASH);
    expect(await saveDatasetContent(bytes())).toBe(HASH);
    expect(await loadDatasetContent(HASH)).toEqual(bytes());
    await webDatasets.delete(['dataset']);
    expect(await loadDatasetContent(HASH)).toEqual(bytes());
    expect(stored.get('basecase-dataset-content')?.size).toBe(1);
    expect(await loadDatasetContent('0'.repeat(64))).toBeNull();
  });

  it('rejects malformed keys and corrupt bytes on reads and repeated saves', async () => {
    for (const hash of ['../auth', '', HASH.toUpperCase(), HASH.slice(1)]) {
      await expect(loadDatasetContent(hash)).rejects.toThrow('hash');
    }

    expect(stored.size).toBe(0);
    await saveDatasetContent(bytes());
    stored.get('basecase-dataset-content')?.set(HASH, new Uint8Array([1, 2, 3]));
    await expect(loadDatasetContent(HASH)).rejects.toThrow('match');
    await expect(saveDatasetContent(bytes())).rejects.toThrow('match');
    expect(stored.get('basecase-dataset-content')?.get(HASH)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('exposes browser content routes without falling through to desktop-only behavior', async () => {
    const saved = await webRequest('/datasets-content-save', { body: JSON.stringify({ arg: 'YWJj' }) });
    const loaded = await webRequest('/datasets-content-load', { body: JSON.stringify({ arg: HASH }) });
    const refused = await webRequest('/datasets-content-load', { body: JSON.stringify({ arg: '../auth' }) });

    expect(saved.status).toBe(200);
    expect(await saved.json()).toBe(HASH);
    expect(await loaded.json()).toEqual({ data: 'YWJj' });
    expect(refused.status).toBe(500);
  });

  it('takes a byte snapshot before asynchronous hashing or storage', async () => {
    const original = bytes();
    const saved = saveDatasetContent(original);

    original.fill(0);
    expect(await saved).toBe(HASH);
    expect(await loadDatasetContent(HASH)).toEqual(bytes());
  });
});
