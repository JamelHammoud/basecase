import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DATASET_CALLS, datasetPostRoutes } from './datasetRoutes.mjs';
import { DatasetStore, MAX_DATASET_BYTES } from './datasetStore.mjs';

let dir;
let store;

const dataset = (id, extra = {}) => ({
  version: 1,
  id,
  name: 'Touch the Dots',
  task: 'Touch each dot',
  sceneId: 'scene-a',
  caseId: 'touch-the-dots',
  query: null,
  members: ['try-1', 'try-2'],
  seed: 7,
  versions: [],
  createdAt: '2026-11-14T10:00:00.000Z',
  ...extra,
});

const datasetsDir = () => path.join(dir, 'datasets');

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'datasets-'));
  store = new DatasetStore({ dir: datasetsDir() });
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('DatasetStore', () => {
  it('keeps each dataset as <id>.json and lists them back', () => {
    expect(store.list()).toEqual([]);
    expect(store.save(dataset('set-1'))).toEqual({ ok: true });
    store.save(dataset('set-2', { name: 'Reach' }));
    store.save(dataset('set-1', { members: ['try-3'] }));

    expect(fs.readdirSync(datasetsDir()).sort()).toEqual(['set-1.json', 'set-2.json']);

    const listed = Object.fromEntries(store.list().map((d) => [d.id, d]));

    expect(listed['set-1']).toEqual(dataset('set-1', { members: ['try-3'] }));
    expect(listed['set-2'].name).toBe('Reach');
  });

  it('skips files it can’t read, files that name another dataset, and anything that isn’t <id>.json', () => {
    store.save(dataset('set-1'));
    fs.writeFileSync(path.join(datasetsDir(), 'set-2.json'), '{');
    fs.writeFileSync(path.join(datasetsDir(), 'set-3.json'), JSON.stringify(dataset('set-1')));
    fs.writeFileSync(path.join(datasetsDir(), 'set-4.json'), '[1]');
    fs.writeFileSync(path.join(datasetsDir(), 'set-5.txt'), JSON.stringify(dataset('set-5')));
    fs.mkdirSync(path.join(datasetsDir(), 'set-6.json'));

    expect(store.list().map((d) => d.id)).toEqual(['set-1']);
  });

  it('refuses a dataset over 16 MB and skips one on disk', () => {
    const huge = dataset('set-1', { task: 'x'.repeat(MAX_DATASET_BYTES) });

    expect(() => store.save(huge)).toThrow('too large');
    expect(fs.existsSync(datasetsDir())).toBe(false);

    fs.mkdirSync(datasetsDir());
    fs.writeFileSync(path.join(datasetsDir(), 'set-1.json'), JSON.stringify(huge));
    expect(store.list()).toEqual([]);
  });

  it('deletes datasets and ignores ones already gone', () => {
    store.save(dataset('set-1'));
    store.save(dataset('set-2'));

    expect(store.delete(['set-1', 'gone'])).toEqual({ deleted: ['set-1', 'gone'] });
    expect(store.list().map((d) => d.id)).toEqual(['set-2']);
  });

  it('reaches each call through the bridge, which picks the first route its URL starts with', async () => {
    const routes = datasetPostRoutes(store);
    const post = (url, arg) => routes.find(([prefix]) => url.startsWith(prefix))[1]({ arg });

    expect(routes.map(([url]) => url)).toEqual(Object.keys(DATASET_CALLS).map((c) => `/${c.replace(':', '-')}`));
    expect(routes.map(([url]) => routes.find(([prefix]) => url.startsWith(prefix))[0])).toEqual(
      routes.map(([url]) => url),
    );

    await post('/datasets-save', dataset('set-1'));
    expect(await post('/datasets-list')).toEqual([dataset('set-1')]);
    await post('/datasets-delete', ['set-1']);
    expect(await post('/datasets-list')).toEqual([]);
  });

  it('never reads, writes or deletes a file outside its own folder', () => {
    const secret = path.join(dir, 'auth.json');

    fs.writeFileSync(secret, '{"token":"x"}');

    for (const id of ['..', '../auth', '..\\auth', 'a/b', 'CON', '', 'x'.repeat(200), 7, null]) {
      expect(() => store.save(dataset(id)), String(id)).toThrow('Not a valid id');
      expect(() => store.delete(['ok', id]), String(id)).toThrow('Not a valid id');
    }

    store.save(dataset('ok'));
    expect(() => store.delete(['ok', '../auth'])).toThrow('Not a valid id');
    expect(() => store.delete('../auth')).toThrow();
    expect(() => store.save(null)).toThrow();
    expect(() => store.save([dataset('ok')])).toThrow();
    expect(fs.readFileSync(secret, 'utf-8')).toBe('{"token":"x"}');
    expect(fs.readdirSync(datasetsDir())).toEqual(['ok.json']);
  });
});
