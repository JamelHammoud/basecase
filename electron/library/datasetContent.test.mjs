import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetStore } from './datasetStore.mjs';
import { DATASET_CALLS, datasetPostRoutes } from './datasetRoutes.mjs';

const HASH = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const bytes = () => new TextEncoder().encode('abc');
let dir;
let store;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dataset-content-'));
  store = new DatasetStore({ dir });
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('dataset content', () => {
  it('deduplicates immutable SHA-256 content and retains it when datasets are deleted', () => {
    expect(store.saveContent(bytes())).toBe(HASH);
    expect(store.saveContent(bytes())).toBe(HASH);
    expect(fs.readdirSync(path.join(dir, 'content'))).toEqual([HASH]);
    expect(store.content(HASH)).toEqual(bytes());
    store.delete(['dataset']);
    expect(store.content(HASH)).toEqual(bytes());
    expect(store.content('0'.repeat(64))).toBeNull();
  });

  it('refuses every malformed hash before any path is read', () => {
    const read = vi.spyOn(fs, 'readFileSync');

    for (const hash of ['../auth', 'a/b', 'a\\b', '', HASH.toUpperCase(), HASH.slice(1), `${HASH}a`, 7, null]) {
      expect(() => store.content(hash)).toThrow('hash');
    }

    expect(read).not.toHaveBeenCalled();
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('rejects corrupted content on read and never overwrites an existing blob', () => {
    store.saveContent(bytes());
    fs.writeFileSync(path.join(dir, 'content', HASH), 'xyz');
    expect(() => store.content(HASH)).toThrow('match');
    expect(() => store.saveContent(bytes())).toThrow('match');
    expect(fs.readFileSync(path.join(dir, 'content', HASH), 'utf8')).toBe('xyz');
    expect(() => store.saveContent('abc')).toThrow('bytes');
  });

  it('refuses oversized input before hashing or writing', () => {
    const oversized = new Proxy(new Uint8Array(), { get: () => 1024 * 1024 * 1024 + 1 });

    expect(() => store.saveContent(oversized)).toThrow('large');
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('refuses oversized blobs on disk before reading their bytes', () => {
    store.saveContent(bytes());
    fs.truncateSync(path.join(dir, 'content', HASH), 1024 * 1024 * 1024 + 1);
    expect(() => store.content(HASH)).toThrow('large');
  });

  it('carries bounded base64 through the same HTTP and IPC calls', async () => {
    const routes = datasetPostRoutes(store);
    const post = (url, arg) => routes.find(([prefix]) => url.startsWith(prefix))[1]({ arg });

    expect(await post('/datasets-content-save', 'YWJj')).toBe(HASH);
    expect(await post('/datasets-content-load', HASH)).toEqual({ data: 'YWJj' });
    expect(DATASET_CALLS['datasets:content-save'](store, bytes())).toBe(HASH);
    expect(DATASET_CALLS['datasets:content-load'](store, HASH)).toEqual(bytes());
    await expect(post('/datasets-content-save', 'YW Jj')).rejects.toThrow('base64');
    await expect(post('/datasets-content-save', '!!!=')).rejects.toThrow('base64');
    expect(await post('/datasets-content-load', '0'.repeat(64))).toBeNull();
  });
});
