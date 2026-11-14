import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TRY_CALLS, tryPostRoutes } from './tryRoutes.mjs';
import { TRY_MANIFEST, TRY_RECORDING, TRY_STRIP, TRY_VIDEO, TryStore } from './tryStore.mjs';

let dir;
let store;

const manifest = (id, extra = {}) => ({
  version: 1,
  id,
  sceneId: 'scene-a',
  robot: { name: 'Arm', modelHash: 'abc', joints: ['shoulder', 'elbow'] },
  case: { id: 'touch-the-dots', name: 'Touch the Dots', hash: 'def' },
  source: 'case',
  input: null,
  startedAt: '2026-11-13T10:00:00.000Z',
  seconds: 4,
  rate: 50,
  frames: 200,
  outcome: { verdict: 'passed', margin: 0.2 },
  seed: 0,
  sourceTry: null,
  faults: [],
  ...extra,
});

const open = () => new TryStore({ triesDir: path.join(dir, 'tries'), cacheFile: path.join(dir, '.try-summaries.json') });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tries-'));
  store = open();
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('TryStore', () => {
  it('keeps each try in its own folder and lists summaries without the recording', () => {
    store.save({ manifest: manifest('try-1'), recording: new Uint8Array([1, 2, 3, 4]) });
    store.save({ manifest: manifest('try-2', { source: 'generated', sourceTry: 'try-1', seed: 3 }) });

    const folder = path.join(dir, 'tries', 'try-1');

    expect(fs.readdirSync(folder).sort()).toEqual([TRY_RECORDING, TRY_MANIFEST].sort());
    expect(JSON.parse(fs.readFileSync(path.join(folder, TRY_MANIFEST), 'utf-8'))).toEqual(manifest('try-1'));

    const listed = Object.fromEntries(store.list().map((s) => [s.id, s]));

    expect(listed['try-1']).toMatchObject({
      sceneId: 'scene-a',
      robot: 'Arm',
      caseName: 'Touch the Dots',
      outcome: { verdict: 'passed', margin: 0.2 },
      recording: true,
      strip: false,
    });
    expect(listed['try-2']).toMatchObject({ source: 'generated', sourceTry: 'try-1', seed: 3, recording: false });
    expect(JSON.stringify(listed['try-1'])).not.toContain('shoulder');
    expect([...store.recording('try-1')]).toEqual([1, 2, 3, 4]);
    expect(store.recording('try-2')).toBeNull();
  });

  it('reads manifests only when they change, through its cached summary', () => {
    const file = path.join(dir, 'tries', 'try-1', TRY_MANIFEST);
    const at = new Date('2026-11-13T10:00:00.000Z');

    store.save({ manifest: manifest('try-1'), recording: new Uint8Array(8) });
    fs.utimesSync(file, at, at);
    store.list();

    const size = fs.statSync(file).size;

    fs.writeFileSync(file, JSON.stringify(manifest('try-1', { seconds: 9 })).padEnd(size, ' ').slice(0, size));
    fs.utimesSync(file, at, at);
    expect(open().list()[0].seconds).toBe(4);

    fs.utimesSync(file, at, new Date(at.getTime() + 5000));
    expect(open().list()[0].seconds).toBe(9);
  });

  it('keeps a filmstrip beside the recording and lists it', () => {
    store.save({ manifest: manifest('try-1'), recording: new Uint8Array(8) });
    store.list();

    const cache = path.join(dir, '.try-summaries.json');
    const listedOnce = fs.readFileSync(cache, 'utf-8');

    expect(store.saveStrip({ id: 'try-1', bytes: new Uint8Array([9, 9]) })).toEqual({ ok: true });
    expect(store.saveStrip({ id: 'missing', bytes: new Uint8Array([9]) })).toEqual({ ok: false });
    expect(fs.existsSync(path.join(dir, 'tries', 'try-1', TRY_STRIP))).toBe(true);
    expect(fs.readFileSync(cache, 'utf-8')).toBe(listedOnce);
    expect(open().list()[0].strip).toBe(true);
    expect(store.list()[0].strip).toBe(true);
    expect([...store.strip('try-1')]).toEqual([9, 9]);
  });

  it('deletes a try folder with everything in it', () => {
    store.save({ manifest: manifest('try-1'), recording: new Uint8Array(8) });
    store.save({ manifest: manifest('try-2'), recording: new Uint8Array(8) });
    store.saveStrip({ id: 'try-1', bytes: new Uint8Array(2) });

    expect(store.delete(['try-1', 'gone'])).toEqual({ deleted: ['try-1', 'gone'] });
    expect(store.list().map((s) => s.id)).toEqual(['try-2']);
    expect(fs.existsSync(path.join(dir, 'tries', 'try-1'))).toBe(false);
  });

  it('skips a folder whose manifest names another try or is not JSON', () => {
    store.save({ manifest: manifest('try-1'), recording: new Uint8Array(8) });
    fs.mkdirSync(path.join(dir, 'tries', 'try-2'));
    fs.writeFileSync(path.join(dir, 'tries', 'try-2', TRY_MANIFEST), JSON.stringify(manifest('try-1')));
    fs.mkdirSync(path.join(dir, 'tries', 'try-3'));
    fs.writeFileSync(path.join(dir, 'tries', 'try-3', TRY_MANIFEST), '{');

    expect(store.list().map((s) => s.id)).toEqual(['try-1']);
  });

  it('takes bytes as base64 over HTTP and as bytes over IPC', async () => {
    const recording = Buffer.from([5, 6, 7]).toString('base64');

    await TRY_CALLS['tries:save'](store, { manifest: manifest('try-1'), recording });
    expect([...(await TRY_CALLS['tries:recording'](store, 'try-1'))]).toEqual([5, 6, 7]);
    expect(() => store.save({ manifest: manifest('try-2'), recording: 'not bytes' })).toThrow('Expected bytes');
  });

  it('reaches each call through the bridge, which picks the first route its URL starts with', async () => {
    const routes = tryPostRoutes(store);
    const post = (url, arg) => routes.find(([prefix]) => url.startsWith(prefix))[1]({ arg });

    expect(routes.map(([url]) => routes.find(([prefix]) => url.startsWith(prefix))[0])).toEqual(
      routes.map(([url]) => url),
    );

    await post('/tries-save', { manifest: manifest('try-1'), recording: null });
    await post('/tries-keep-strip', { id: 'try-1', bytes: Buffer.from([9, 9]).toString('base64') });
    expect(await post('/tries-strip', 'try-1')).toEqual({ data: Buffer.from([9, 9]).toString('base64') });
    expect(await post('/tries-keep-video', { id: 'try-1', bytes: Buffer.from([4, 2]).toString('base64') })).toEqual({
      ok: true,
    });
    expect(await post('/tries-video', 'try-1')).toEqual({ data: Buffer.from([4, 2]).toString('base64') });
    expect(await post('/tries-strip', 'try-1')).toEqual({ data: Buffer.from([9, 9]).toString('base64') });
  });

  it('never reads, writes or deletes a try outside its own folder', () => {
    const triesDir = path.join(dir, 'tries');
    const secret = path.join(dir, 'auth.json');
    const manifest = (id, sceneId = 'scene') => ({ id, sceneId });

    fs.writeFileSync(secret, '{"token":"x"}');

    const store = new TryStore({ triesDir, cacheFile: path.join(dir, 'cache.json') });
    const bytes = new Uint8Array([1, 2, 3]);

    for (const id of ['..', '../auth', '..\\auth', 'a/b', 'CON', '', 'x'.repeat(200), 7, null]) {
      expect(() => store.save({ manifest: manifest(id), recording: bytes }), String(id)).toThrow('Not a valid id');
      expect(() => store.recording(id), String(id)).toThrow('Not a valid id');
      expect(() => store.strip(id), String(id)).toThrow('Not a valid id');
      expect(() => store.saveStrip({ id, bytes }), String(id)).toThrow('Not a valid id');
      expect(() => store.video(id), String(id)).toThrow('Not a valid id');
      expect(() => store.saveVideo({ id, bytes }), String(id)).toThrow('Not a valid id');
      expect(() => store.delete(['ok', id]), String(id)).toThrow('Not a valid id');
    }

    expect(() => store.save({ manifest: manifest('ok', '../auth'), recording: bytes })).toThrow('Not a valid id');
    expect(() => store.delete('../auth')).toThrow();
    expect(fs.readFileSync(secret, 'utf-8')).toBe('{"token":"x"}');
    expect(fs.existsSync(triesDir) ? fs.readdirSync(triesDir) : []).toEqual([]);
  });
});

describe('TryStore videos', () => {
  it('keeps a video only beside a saved try, within its size cap, and lists it', () => {
    class Huge extends Uint8Array {
      get byteLength() {
        return 512 * 1024 * 1024 + 1;
      }
    }

    store.save({ manifest: manifest('try-1'), recording: new Uint8Array(8) });
    store.list();

    const cache = path.join(dir, '.try-summaries.json');
    const listedOnce = fs.readFileSync(cache, 'utf-8');

    expect(store.list()[0].video).toBe(false);
    expect(store.saveVideo({ id: 'try-1', bytes: new Uint8Array([7, 7, 7]) })).toEqual({ ok: true });
    expect(store.saveVideo({ id: 'missing', bytes: new Uint8Array([7]) })).toEqual({ ok: false });
    expect(() => store.saveVideo({ id: 'try-1', bytes: new Huge(1) })).toThrow('Too large to keep');
    expect(() => store.saveVideo({ id: 'try-1', bytes: 'not bytes' })).toThrow('Expected bytes');
    expect(fs.existsSync(path.join(dir, 'tries', 'missing'))).toBe(false);
    expect(fs.readFileSync(cache, 'utf-8')).toBe(listedOnce);
    expect(store.list()[0].video).toBe(true);
    expect(open().list()[0]).toMatchObject({ video: true, strip: false });
    expect([...store.video('try-1')]).toEqual([7, 7, 7]);
    expect(fs.readdirSync(path.join(dir, 'tries', 'try-1'))).toContain(TRY_VIDEO);
  });

  it('lists a video for a summary cached before videos were kept', () => {
    store.save({ manifest: manifest('try-1'), recording: new Uint8Array(8) });
    store.list();

    const cache = path.join(dir, '.try-summaries.json');
    const cached = JSON.parse(fs.readFileSync(cache, 'utf-8'));

    delete cached['try-1'].summary.video;
    fs.writeFileSync(cache, JSON.stringify(cached));

    expect(open().list()[0].video).toBe(false);
    expect(JSON.parse(fs.readFileSync(cache, 'utf-8'))['try-1'].summary.video).toBe(false);
  });
});
