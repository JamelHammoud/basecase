import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TryLibrary } from './tryLibrary.mjs';
import { tryPostRoutes } from './tryRoutes.mjs';

let root;
let triesDir;
let cacheFile;
let library;

const joints = [{ id: 'j1', name: 'Shoulder', type: 'hinge', actuator: 'servo', drive: 'position', effort: 2 }];

const tryRecord = (id, extra = {}) => ({
  version: 1,
  id,
  sceneId: 'scene-1',
  robot: { name: 'Arm', modelHash: 'abc', joints },
  case: { id: 'case-1', name: 'Pick', hash: 'h', contractHash: 'c' },
  source: 'case',
  input: null,
  at: '2026-11-13T10:00:00.000Z',
  seconds: 2,
  rate: 50,
  outcome: { result: 'passed', margin: 0.2 },
  seed: 0,
  sourceTry: null,
  frames: 100,
  faults: [],
  ...extra,
});

const bytes = (...values) => new Uint8Array(values);

const fresh = () => new TryLibrary({ triesDir, cacheFile });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'tries-'));
  triesDir = path.join(root, 'tries');
  cacheFile = path.join(root, '.try-summaries.json');
  library = fresh();
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('TryLibrary', () => {
  it('round-trips the manifest and recording, and lists it without joints', () => {
    const record = tryRecord('t1');
    const summary = library.save({ record, recording: bytes(1, 2, 3) });
    const opened = library.open('t1');

    expect(opened.record).toEqual(record);
    expect([...opened.recording]).toEqual([1, 2, 3]);
    expect(summary.robot).toEqual({ name: 'Arm', modelHash: 'abc' });
    expect(library.list()).toEqual([summary]);
    expect(fresh().list()).toEqual([summary]);
  });

  it('keeps the recording when a manifest is saved again without one', () => {
    library.save({ record: tryRecord('t1'), recording: bytes(9) });
    library.save({ record: tryRecord('t1', { frames: 5 }) });

    expect(library.open('t1').record.frames).toBe(5);
    expect([...library.open('t1').recording]).toEqual([9]);
  });

  it('writes videos and a film', () => {
    library.save({ record: tryRecord('t1'), videos: { wrist: bytes(4, 5) } });

    expect(library.film('t1')).toBeNull();
    expect(library.saveFilm({ id: 't1', film: bytes(7) })).toEqual({ ok: true });
    expect([...library.film('t1')]).toEqual([7]);
    expect([...fs.readFileSync(path.join(triesDir, 't1', 'videos', 'wrist.webm'))]).toEqual([4, 5]);
    expect(library.open('t1').recording).toBeNull();
    expect(() => library.saveFilm({ id: 'missing', film: bytes(1) })).toThrow();
  });

  it('lists newest first, picks up tries written outside and forgets removed ones', () => {
    library.save({ record: tryRecord('old', { at: '2026-01-01T00:00:00.000Z' }) });
    fs.mkdirSync(path.join(triesDir, 'new'));
    fs.writeFileSync(path.join(triesDir, 'new', 'try.json'), JSON.stringify(tryRecord('new')));
    fs.mkdirSync(path.join(triesDir, 'empty'));

    expect(library.list().map((t) => t.id)).toEqual(['new', 'old']);

    fs.rmSync(path.join(triesDir, 'new'), { recursive: true });

    expect(library.list().map((t) => t.id)).toEqual(['old']);
    expect(Object.keys(JSON.parse(fs.readFileSync(cacheFile, 'utf-8')))).toEqual(['old']);
  });

  it('serves an unchanged list from the cache without reading manifests', () => {
    library.save({ record: tryRecord('t1') });
    library.save({ record: tryRecord('t2') });
    library.list();

    const restarted = fresh();
    const read = vi.spyOn(fs, 'readFileSync');
    const write = vi.spyOn(fs, 'writeFileSync');

    expect(restarted.list().map((t) => t.id)).toHaveLength(2);
    expect(read.mock.calls.filter(([file]) => String(file).endsWith('try.json'))).toEqual([]);
    expect(write).not.toHaveBeenCalled();
  });

  it('deletes a source try with its generated tries and leaves the rest', () => {
    library.save({ record: tryRecord('src') });
    library.save({ record: tryRecord('src-1', { source: 'generated', sourceTry: 'src', seed: 1 }) });
    library.save({ record: tryRecord('src-2', { source: 'generated', sourceTry: 'src', seed: 2 }) });
    library.save({ record: tryRecord('other-1', { source: 'generated', sourceTry: 'other' }) });
    library.save({ record: tryRecord('keep') });

    expect(library.delete(['src']).deleted.sort()).toEqual(['src', 'src-1', 'src-2']);
    expect(library.list().map((t) => t.id).sort()).toEqual(['keep', 'other-1']);
    expect(fs.readdirSync(triesDir).sort()).toEqual(['keep', 'other-1']);
  });

  it('refuses a record without a version or a safe id', () => {
    expect(() => library.save({ record: { id: 't1' } })).toThrow();
    expect(() => library.save({ record: tryRecord('t1'), videos: { '../x': bytes(1) } })).toThrow();
    expect(() => library.save({ record: tryRecord('t1'), recording: 'AAEC' })).toThrow();
    expect(fs.readdirSync(triesDir)).toEqual([]);
  });
});

describe('try routes over HTTP', () => {
  const callOf = (routes) => (route, arg) => routes.find(([p]) => p === route)[1]({ arg });

  it('round-trips base64 bytes for save, open and film', async () => {
    const call = callOf(tryPostRoutes(library));
    const record = tryRecord('t1');
    const recording = Buffer.from([1, 2, 3]).toString('base64');
    const video = Buffer.from([4]).toString('base64');

    expect((await call('/tries-save', { record, recording, videos: { top: video } })).id).toBe('t1');
    expect(await call('/tries-open', 't1')).toEqual({ record, recording });
    expect(await call('/tries-film', 't1')).toEqual({ data: null });
    expect(await call('/tries-save-film', { id: 't1', film: Buffer.from([8]).toString('base64') })).toEqual({
      ok: true,
    });
    expect(await call('/tries-film', 't1')).toEqual({ data: Buffer.from([8]).toString('base64') });
    expect(await call('/tries-open', 'missing')).toBeNull();
    expect((await call('/tries-list')).map((t) => t.id)).toEqual(['t1']);
    expect([...fs.readFileSync(path.join(triesDir, 't1', 'videos', 'top.webm'))]).toEqual([4]);
    expect(await call('/tries-delete', { ids: ['t1'] })).toEqual({ deleted: ['t1'] });
  });
});
