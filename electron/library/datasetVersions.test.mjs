import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatasetStore } from './datasetStore.mjs';

let dir;
let store;

const version = () => ({ n: 1, hash: 'frozen', at: 'now', members: ['try-a'], snapshot: { task: 'Original', samples: [] } });
const dataset = (versions = []) => ({ id: 'dataset', members: ['try-a'], versions });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dataset-versions-'));
  store = new DatasetStore({ dir });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('stored immutable dataset versions', () => {
  it('preserves versions omitted by stale membership edits', () => {
    store.save(dataset([version()]));
    store.save({ ...dataset(), members: ['try-b'] });

    expect(store.list()).toEqual([{ ...dataset([version()]), members: ['try-b'] }]);
  });

  it('allows the first archive assignment and retains it through stale saves', () => {
    const original = version();
    const archived = { ...original, archive: 'a'.repeat(64) };

    store.save(dataset([original]));
    store.save(dataset([archived]));
    store.save(dataset([original]));
    expect(store.list()[0].versions).toEqual([archived]);
    expect(() => store.save(dataset([{ ...archived, archive: 'b'.repeat(64) }]))).toThrow('saved version');
    expect(store.list()[0].versions).toEqual([archived]);
  });

  it('refuses changed hashes, labels, membership or timestamps under a saved version number', () => {
    const original = version();

    store.save(dataset([original]));

    for (const changed of [
      { ...original, hash: 'different' },
      { ...original, snapshot: { ...original.snapshot, task: 'Changed' } },
      { ...original, members: ['try-b'] },
      { ...original, at: 'later' },
    ]) {
      expect(() => store.save(dataset([changed]))).toThrow('saved version');
      expect(store.list()[0].versions).toEqual([original]);
    }
  });

  it('rejects malformed or duplicate versions before replacing the file', () => {
    store.save(dataset([version()]));

    for (const versions of [null, {}, [null], [{ ...version(), n: -1 }], [version(), version()]]) {
      expect(() => store.save(dataset(versions))).toThrow('version');
      expect(store.list()[0].versions).toEqual([version()]);
    }
  });

  it('retains more than 100 saved versions through a stale save', () => {
    const versions = Array.from({ length: 101 }, (_, index) => ({ ...version(), n: index + 1, hash: `hash-${index}` }));

    store.save(dataset(versions));
    store.save(dataset());
    expect(store.list()[0].versions).toEqual(versions);
  });

  it('compares nested snapshot metadata independently of object key order', () => {
    const original = version();
    const reordered = { ...original, snapshot: { samples: [], task: 'Original' } };

    store.save(dataset([original]));
    expect(() => store.save(dataset([reordered]))).not.toThrow();
    expect(store.list()[0].versions).toEqual([original]);
  });
});
