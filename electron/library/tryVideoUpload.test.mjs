import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TryStore } from './tryStore.mjs';
import { cleanVideoAssets } from './tryVideoUploads.mjs';
import { tryVideoRequest } from './tryVideo.mjs';

let dir;
let store;
const bytes = new Uint8Array([1, 2, 3, 4]);
const hash = createHash('sha256').update(bytes).digest('hex');
const target = (id, camera = 'front', asset = hash) => `app://basecase/api/tries/video/${id}/${camera}?asset=${asset}`;
const upload = (id, body = bytes, asset = hash) => new Request(target(id, 'front', asset), {
  method: 'PUT', body, duplex: 'half', headers: { 'X-Video-Bytes': String(body.byteLength ?? 4) },
});

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'try-upload-'));
  store = new TryStore({ triesDir: path.join(dir, 'tries'), cacheFile: path.join(dir, 'cache.json') });

  for (const id of ['try-1', 'try-2']) store.save({ manifest: { id, sceneId: 'scene', videos: [{ camera: 'front', path: 'outside.mp4' }] } });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('streamed camera clip uploads', () => {
  it('uploads once and binds a shared clip to two tries without copying its bytes', async () => {
    expect((await tryVideoRequest(upload('try-1'), store)).status).toBe(200);
    expect((await tryVideoRequest(new Request(target('try-2'), { method: 'POST' }), store)).status).toBe(200);

    const one = store.videoFile({ id: 'try-1', camera: 'front' });
    const two = store.videoFile({ id: 'try-2', camera: 'front' });

    expect(fs.statSync(one.file).ino).toBe(fs.statSync(two.file).ino);
    expect(fs.readdirSync(path.join(dir, 'tries', '.videos'))).toEqual([`${hash}.mp4`]);
    expect([...new Uint8Array(await (await tryVideoRequest(new Request(target('try-2')), store)).arrayBuffer())]).toEqual([...bytes]);
  });

  it('preserves a shared asset until both episode tries are deleted', async () => {
    await tryVideoRequest(upload('try-1'), store);
    await tryVideoRequest(new Request(target('try-2'), { method: 'POST' }), store);
    store.delete(['try-1']);
    await cleanVideoAssets(store.triesDir);
    expect(store.videoFile({ id: 'try-2', camera: 'front' }).size).toBe(4);
    expect(fs.readdirSync(path.join(dir, 'tries', '.videos'))).toEqual([`${hash}.mp4`]);
    store.delete(['try-2']);
    await cleanVideoAssets(store.triesDir);
    expect(fs.readdirSync(path.join(dir, 'tries', '.videos'))).toEqual([]);
  });

  it('replaces corrupt cached bytes with the verified upload', async () => {
    const assets = path.join(store.triesDir, '.videos');

    fs.mkdirSync(assets);
    fs.writeFileSync(path.join(assets, `${hash}.mp4`), new Uint8Array([9]));
    expect((await tryVideoRequest(upload('try-1'), store)).status).toBe(200);
    expect([...new Uint8Array(await (await tryVideoRequest(new Request(target('try-1')), store)).arrayBuffer())]).toEqual([...bytes]);
  });

  it('reads a replacement direct video after a shared asset was bound', async () => {
    await tryVideoRequest(upload('try-1'), store);
    expect(store.saveVideo({ id: 'try-1', camera: 'front', bytes: new Uint8Array([7]) })).toEqual({ ok: true });
    expect([...new Uint8Array(await (await tryVideoRequest(new Request(target('try-1')), store)).arrayBuffer())]).toEqual([7]);
    await cleanVideoAssets(store.triesDir);
    expect(fs.readdirSync(path.join(store.triesDir, '.videos'))).toEqual([]);
  });

  it('rejects traversal, wrong cameras, unknown assets and hash mismatches without keeping an upload', async () => {
    for (const url of [target('..%2fsecret'), target('try-1', 'other'), target('gone'), target('try-1', 'front', '../secret')]) {
      const request = new Request(url, { method: 'PUT', body: bytes, headers: { 'X-Video-Bytes': '4' } });

      expect((await tryVideoRequest(request, store)).status).toBe(404);
    }

    expect((await tryVideoRequest(new Request(target('try-1'), { method: 'POST' }), store)).status).toBe(404);
    expect((await tryVideoRequest(upload('try-1', bytes, 'a'.repeat(64)), store)).status).toBe(400);
    expect(store.videoFile({ id: 'try-1', camera: 'front' })).toBeNull();
    expect(fs.readdirSync(path.join(dir, 'tries', '.videos'))).toEqual([]);
  });

  it('caps declared and streamed bodies without buffering the whole upload', async () => {
    const tooBig = upload('try-1');

    tooBig.headers.set('X-Video-Bytes', String(2 * 1024 * 1024 * 1024 + 1));
    expect((await tryVideoRequest(tooBig, store)).status).toBe(413);

    const truncated = upload('try-1');

    truncated.headers.set('X-Video-Bytes', '2');
    expect((await tryVideoRequest(truncated, store)).status).toBe(413);
    expect(store.videoFile({ id: 'try-1', camera: 'front' })).toBeNull();
  });

  it('discards a stream that ends before its declared byte count', async () => {
    const request = upload('try-1');

    request.headers.set('X-Video-Bytes', '5');
    expect((await tryVideoRequest(request, store)).status).toBe(400);
    expect(store.videoFile({ id: 'try-1', camera: 'front' })).toBeNull();
    expect(fs.readdirSync(path.join(store.triesDir, '.videos'))).toEqual([]);
  });

  it('stops an overflowing stream and cancels its producer', async () => {
    let cancelled = false;
    let pulls = 0;
    const body = new ReadableStream({
      pull(controller) {
        pulls++;
        controller.enqueue(new Uint8Array(8));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request(target('try-1'), { method: 'PUT', body, duplex: 'half', headers: { 'X-Video-Bytes': '4' } });

    expect((await tryVideoRequest(request, store)).status).toBe(413);
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThan(10);
    expect(fs.readdirSync(path.join(dir, 'tries', '.videos'))).toEqual([]);
  });

  it('refuses an asset directory junction without writing or cleaning files outside the store', async () => {
    const elsewhere = path.join(dir, 'elsewhere');
    const outsideAsset = path.join(elsewhere, `${hash}.mp4`);

    fs.mkdirSync(elsewhere);
    fs.writeFileSync(outsideAsset, bytes);
    fs.symlinkSync(elsewhere, path.join(store.triesDir, '.videos'), 'junction');
    expect((await tryVideoRequest(upload('try-1'), store)).status).toBe(404);
    store.delete(['try-1']);
    await cleanVideoAssets(store.triesDir);
    expect([...fs.readFileSync(outsideAsset)]).toEqual([...bytes]);
  });

});
