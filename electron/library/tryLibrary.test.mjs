import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TryLibrary } from './tryLibrary.mjs';
import { TRY_CALLS, tryPostRoutes } from './tryRoutes.mjs';

let dir;
let triesDir;
let cacheFile;

const manifest = (id, at = '2026-11-13T10:00:00.000Z') => ({ version: 1, id, sceneId: 'scene', at, frames: 3 });
const bytes = (...values) => new Uint8Array(values);
const open = () => new TryLibrary({ triesDir, cacheFile });
const filesUnder = (root) => fs.readdirSync(root, { recursive: true }).sort();

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tries-'));
  triesDir = path.join(dir, 'tries');
  cacheFile = path.join(dir, '.try-summaries.json');
  fs.mkdirSync(triesDir);
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('TryLibrary', () => {
  it('lists a saved try and reads its recording and film back byte for byte', () => {
    const tries = open();

    expect(tries.save({ manifest: manifest('t1'), recording: bytes(1, 2, 3), film: bytes(9, 8) })).toEqual({ ok: true });
    expect(tries.list()).toEqual([manifest('t1')]);
    expect([...tries.recording('t1')]).toEqual([1, 2, 3]);
    expect([...tries.film('t1')]).toEqual([9, 8]);
    expect(open().list()).toEqual([manifest('t1')]);
  });

  it('keeps the recording when only the manifest is saved again', () => {
    const tries = open();

    tries.save({ manifest: manifest('t1'), recording: bytes(4, 5) });
    tries.save({ manifest: { ...manifest('t1'), frames: 7 } });

    expect(tries.list()[0].frames).toBe(7);
    expect([...tries.recording('t1')]).toEqual([4, 5]);
    expect(tries.film('t1')).toBeNull();
    expect(tries.recording('missing')).toBeNull();
  });

  it('lists newest first', () => {
    const tries = open();

    tries.save({ manifest: manifest('old', '2026-01-01T00:00:00.000Z') });
    tries.save({ manifest: manifest('new', '2026-06-01T00:00:00.000Z') });

    expect(tries.list().map((t) => t.id)).toEqual(['new', 'old']);
  });

  it('deletes the folder and the list entry', () => {
    const tries = open();

    tries.save({ manifest: manifest('t1'), recording: bytes(1) });
    tries.save({ manifest: manifest('t2'), recording: bytes(2) });

    expect(tries.delete(['t1'])).toEqual({ deleted: ['t1'] });
    expect(fs.existsSync(path.join(triesDir, 't1'))).toBe(false);
    expect(tries.list().map((t) => t.id)).toEqual(['t2']);
    expect(open().list().map((t) => t.id)).toEqual(['t2']);
  });

  it('skips garbled manifests, mismatched ids and stray folders', () => {
    const tries = open();

    tries.save({ manifest: manifest('good') });
    fs.mkdirSync(path.join(triesDir, 'garbled'));
    fs.writeFileSync(path.join(triesDir, 'garbled', 'try.json'), '{not json');
    fs.mkdirSync(path.join(triesDir, 'other'));
    fs.writeFileSync(path.join(triesDir, 'other', 'try.json'), JSON.stringify(manifest('elsewhere')));
    fs.mkdirSync(path.join(triesDir, 'not an id'));
    fs.writeFileSync(path.join(triesDir, 'not an id', 'try.json'), JSON.stringify(manifest('not an id')));
    fs.mkdirSync(path.join(triesDir, 'empty'));
    fs.writeFileSync(path.join(triesDir, 'loose'), 'x');

    expect(open().list().map((t) => t.id)).toEqual(['good']);
  });

  it('writes the cache file on list, never on save or delete', () => {
    const tries = open();

    tries.save({ manifest: manifest('t1') });
    tries.save({ manifest: manifest('t2') });
    tries.delete(['t2']);

    expect(fs.existsSync(cacheFile)).toBe(false);
    expect(tries.list().map((t) => t.id)).toEqual(['t1']);
    expect(Object.keys(JSON.parse(fs.readFileSync(cacheFile, 'utf-8')))).toEqual(['t1']);
  });

  it('finds tries saved or deleted after the cache file was last written', () => {
    const before = open();

    before.save({ manifest: manifest('listed') });
    before.save({ manifest: manifest('dropped') });
    before.list();
    before.save({ manifest: manifest('unlisted') });
    before.delete(['dropped']);

    expect(open().list().map((t) => t.id).sort()).toEqual(['listed', 'unlisted']);
  });

  it('lists from the cache without reading manifests again, and drops folders that are gone', () => {
    const tries = open();

    tries.save({ manifest: manifest('t1') });
    tries.save({ manifest: manifest('t2') });
    tries.list();
    fs.writeFileSync(path.join(triesDir, 't1', 'try.json'), '{garbled');
    fs.rmSync(path.join(triesDir, 't2'), { recursive: true });

    expect(open().list().map((t) => t.id)).toEqual(['t1']);
    expect(Object.keys(JSON.parse(fs.readFileSync(cacheFile, 'utf-8')))).toEqual(['t1']);
  });

  it('refuses manifests that are not objects or too large', () => {
    const tries = open();

    expect(() => tries.save({})).toThrow('manifest');
    expect(() => tries.save({ manifest: [manifest('t1')] })).toThrow('manifest');
    expect(() => tries.save({ manifest: { ...manifest('t1'), pad: 'x'.repeat(300_000) } })).toThrow('too large');
    expect(() => tries.save({ manifest: manifest('t1'), recording: 'abc' })).toThrow('bytes');
    expect(fs.readdirSync(triesDir)).toEqual([]);
  });
});

describe('TryLibrary ids', () => {
  const crafted = ['../escape', 'a/b', '..', 'CON', 'x'.repeat(200), '../../x', '', 42];

  it('never reads, writes or deletes outside the tries folder', () => {
    const tries = open();
    const secret = path.join(dir, 'escape');

    fs.mkdirSync(secret);
    fs.writeFileSync(path.join(secret, 'recording.bin'), 'secret');
    tries.save({ manifest: manifest('kept'), recording: bytes(1) });

    const before = filesUnder(dir);

    for (const id of crafted) {
      expect(() => tries.save({ manifest: manifest(id), recording: bytes(1), film: bytes(2) })).toThrow();
      expect(() => tries.recording(id)).toThrow('Not a valid id');
      expect(() => tries.film(id)).toThrow('Not a valid id');
      expect(() => tries.delete(['kept', id])).toThrow('Not a valid id');
    }

    expect(filesUnder(dir)).toEqual(before);
    expect(tries.list().map((t) => t.id)).toEqual(['kept']);
  });
});

describe('try routes', () => {
  it('sends bytes as base64 over HTTP and as bytes over IPC', async () => {
    const tries = open();
    const routes = Object.fromEntries(tryPostRoutes(tries));

    expect(Object.keys(routes)).toEqual(['/tries-list', '/tries-save', '/tries-recording', '/tries-film', '/tries-delete']);

    const recording = Buffer.from([7, 8, 9]).toString('base64');

    await routes['/tries-save']({ arg: { manifest: manifest('t1'), recording } });

    expect(await routes['/tries-recording']({ arg: 't1' })).toBe(recording);
    expect(await routes['/tries-film']({ arg: 't1' })).toBeNull();
    expect([...TRY_CALLS['tries:recording'](tries, 't1')]).toEqual([7, 8, 9]);
    expect(await routes['/tries-delete']({ arg: ['t1'] })).toEqual({ deleted: ['t1'] });
  });
});
