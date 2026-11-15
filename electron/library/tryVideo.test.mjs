import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TryStore } from './tryStore.mjs';
import { videoLocation } from './tryVideoFiles.mjs';
import { tryVideoResponse } from './tryVideo.mjs';

let dir;
let store;
const camera = { camera: 'front camera', path: '../../auth.json', from: 2, to: 4 };
const request = (url, headers = {}) => new Request(`app://basecase/api/tries/video/${url}`, { headers });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'try-video-'));
  store = new TryStore({ triesDir: path.join(dir, 'tries'), cacheFile: path.join(dir, 'cache.json') });
  store.save({ manifest: { id: 'try-1', sceneId: 'scene', videos: [camera] } });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('try video files', () => {
  it('serves only a camera named in the saved manifest and ignores its declared path', async () => {
    fs.writeFileSync(path.join(dir, 'auth.json'), 'secret');
    expect(store.saveVideo({ id: 'try-1', camera: camera.camera, bytes: new Uint8Array([1, 2, 3, 4]) })).toEqual({
      ok: true,
    });

    const response = tryVideoResponse(request('try-1/front%20camera'), store);

    expect(response.status).toBe(200);
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3, 4]);
    expect(store.saveVideo({ id: 'try-1', camera: 'other', bytes: new Uint8Array([9]) })).toEqual({ ok: false });
    expect(tryVideoResponse(request('try-1/other'), store).status).toBe(404);
    expect(fs.readFileSync(path.join(dir, 'auth.json'), 'utf8')).toBe('secret');
  });

  it('refuses traversal, malformed encodings and missing manifests', () => {
    for (const url of ['..%2fauth/front', 'try-1/..%5cauth', 'try-1/%', 'try-1/front/extra']) {
      expect(tryVideoResponse(request(url), store).status).toBe(404);
    }

    expect(() => store.saveVideo({ id: '../auth', camera: 'front', bytes: new Uint8Array() })).toThrow(
      'Not a valid id',
    );
    expect(store.saveVideo({ id: 'gone', camera: 'front', bytes: new Uint8Array() })).toEqual({ ok: false });
  });

  it('refuses symbolic-link directories on every platform', () => {
    const target = path.join(dir, 'elsewhere');
    const link = path.join(dir, 'tries', 'linked');

    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'try.json'), JSON.stringify({ id: 'linked', videos: [camera] }));
    fs.symlinkSync(target, link, 'junction');
    expect(store.saveVideo({ id: 'linked', camera: camera.camera, bytes: new Uint8Array([1]) })).toEqual({ ok: false });
    expect(tryVideoResponse(request('linked/front%20camera'), store).status).toBe(404);
  });

  it.skipIf(process.platform === 'win32')('refuses symbolic-link files', () => {
    const target = path.join(dir, 'secret.mp4');
    const file = videoLocation(path.join(dir, 'tries', 'try-1'), { id: 'try-1', camera: camera.camera });

    fs.writeFileSync(target, 'secret');
    fs.symlinkSync(target, file);
    expect(tryVideoResponse(request('try-1/front%20camera'), store).status).toBe(404);
  });

  it('streams byte ranges and refuses unsatisfiable or multiple ranges', async () => {
    store.saveVideo({ id: 'try-1', camera: camera.camera, bytes: new Uint8Array([1, 2, 3, 4]) });

    const response = tryVideoResponse(request('try-1/front%20camera', { Range: 'bytes=1-2' }), store);

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 1-2/4');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([2, 3]);

    const suffix = tryVideoResponse(request('try-1/front%20camera', { Range: 'bytes=-2' }), store);

    expect([...new Uint8Array(await suffix.arrayBuffer())]).toEqual([3, 4]);

    for (const range of ['bytes=4-', 'bytes=1-0', 'bytes=0-1,2-3', 'bytes=-0']) {
      expect(tryVideoResponse(request('try-1/front%20camera', { Range: range }), store).status).toBe(416);
    }
  });

  it('keeps the existing operator filename only for the declared operator camera', async () => {
    store.save({
      manifest: {
        id: 'operate',
        sceneId: 'scene',
        source: 'operate',
        videos: [{ camera: 'operator', path: 'operator.mp4', from: 0, to: 2 }],
      },
    });
    expect(store.saveVideo({ id: 'operate', bytes: new Uint8Array([7]) })).toEqual({ ok: true });
    expect(fs.existsSync(path.join(dir, 'tries', 'operate', 'operator.mp4'))).toBe(true);
    expect([...new Uint8Array(await tryVideoResponse(request('operate/operator'), store).arrayBuffer())]).toEqual([7]);
  });
  it('refuses a symbolic-link store root when reading or saving clips', () => {
    store.saveVideo({ id: 'try-1', camera: camera.camera, bytes: new Uint8Array([1]) });
    fs.renameSync(store.triesDir, path.join(dir, 'elsewhere'));
    fs.symlinkSync(path.join(dir, 'elsewhere'), store.triesDir, 'junction');
    expect(tryVideoResponse(request('try-1/front%20camera'), store).status).toBe(404);
    expect(store.saveVideo({ id: 'try-1', camera: camera.camera, bytes: new Uint8Array([2]) })).toEqual({ ok: false });
  });
  it('caps saved manifest bytes before creating a try folder', () => {
    expect(() => store.save({ manifest: { id: 'large', sceneId: 'scene', task: '界'.repeat(100_000) } })).toThrow(
      'too large',
    );
    expect(fs.existsSync(path.join(store.triesDir, 'large'))).toBe(false);
  });
});
