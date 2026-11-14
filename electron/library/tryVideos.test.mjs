import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TRY_VIDEO, TryStore } from './tryStore.mjs';
import { byteRange, tryVideoResponse } from './tryVideoRoute.mjs';
import { MAX_OPEN_VIDEOS, MAX_VIDEO, MAX_VIDEO_CHUNK, STAGING_DIR } from './tryVideos.mjs';

let dir;
let store;

const manifest = (id) => ({ version: 1, id, sceneId: 'scene-a', source: 'operate', seconds: 4, frames: 200 });
const open = () => new TryStore({ triesDir: path.join(dir, 'tries'), cacheFile: path.join(dir, '.try-summaries.json') });
const bytes = (...values) => new Uint8Array(values);
const staged = () => fs.readdirSync(path.join(dir, 'tries', STAGING_DIR));

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'try-videos-'));
  store = open();
});

afterEach(() => {
  store.videos.sweep();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('a take’s video written while it records', () => {
  it('writes each chunk at its position, and moves the file beside the try once it’s kept', async () => {
    expect(await store.writeVideo({ id: 'take-1', position: 3, bytes: bytes(4, 5) })).toEqual({ ok: true });
    expect(await store.writeVideo({ id: 'take-1', position: 0, bytes: bytes(1, 2, 3) })).toEqual({ ok: true });
    expect(store.videoFile('take-1')).toBeNull();

    store.save({ manifest: manifest('take-1'), recording: bytes(8) });

    expect(store.list()[0].video).toBe(false);
    expect(await store.closeVideo({ id: 'take-1', keep: true })).toEqual({ ok: true });
    expect([...fs.readFileSync(path.join(dir, 'tries', 'take-1', TRY_VIDEO))]).toEqual([1, 2, 3, 4, 5]);
    expect(store.list()[0].video).toBe(true);
    expect(staged()).toEqual([]);
  });

  it('removes the staged file when the take is dropped or has no try, and never replaces a kept video', async () => {
    await store.writeVideo({ id: 'dropped', position: 0, bytes: bytes(1) });
    expect(await store.closeVideo({ id: 'dropped', keep: false })).toEqual({ ok: false });

    await store.writeVideo({ id: 'no-try', position: 0, bytes: bytes(1) });
    expect(await store.closeVideo({ id: 'no-try', keep: true })).toEqual({ ok: false });

    store.save({ manifest: manifest('kept'), recording: null });
    await store.writeVideo({ id: 'kept', position: 0, bytes: bytes(1) });
    await store.closeVideo({ id: 'kept', keep: true });
    await store.writeVideo({ id: 'kept', position: 0, bytes: bytes(9, 9) });

    expect(await store.closeVideo({ id: 'kept', keep: true })).toEqual({ ok: false });
    expect([...fs.readFileSync(store.videoFile('kept'))]).toEqual([1]);
    expect(await store.closeVideo({ id: 'never-written', keep: true })).toEqual({ ok: false });
    expect(staged()).toEqual([]);
    expect(fs.readdirSync(path.join(dir, 'tries')).sort()).toEqual([STAGING_DIR, 'kept']);
  });

  it('refuses a chunk past the 512 MB cap, an oversized chunk, a bad position or bytes it can’t read', async () => {
    const write = (chunk) => store.writeVideo({ id: 'take-1', ...chunk });

    await expect(write({ position: MAX_VIDEO - 1, bytes: bytes(1, 2) })).rejects.toThrow('Too large to keep');
    await expect(write({ position: 0, bytes: new Uint8Array(MAX_VIDEO_CHUNK + 1) })).rejects.toThrow(
      'Too large to keep',
    );

    for (const position of [-1, 1.5, '0', null, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(write({ position, bytes: bytes(1) }), String(position)).rejects.toThrow('Expected a position');
    }

    await expect(write({ position: 0, bytes: 'AQ==' })).rejects.toThrow('Expected bytes');
    expect(await write({ position: MAX_VIDEO - 1, bytes: bytes(1) })).toEqual({ ok: true });
  });

  it('holds at most a few staged videos open, and clears what a crash left behind', async () => {
    for (let n = 0; n < MAX_OPEN_VIDEOS; n++) {
      expect(await store.writeVideo({ id: `take-${n}`, position: 0, bytes: bytes(n) })).toEqual({ ok: true });
    }

    expect(await store.writeVideo({ id: 'one-more', position: 0, bytes: bytes(1) })).toEqual({ ok: false });
    expect(staged()).toHaveLength(MAX_OPEN_VIDEOS);

    store.videos.sweep();

    expect(fs.existsSync(path.join(dir, 'tries', STAGING_DIR))).toBe(false);
  });
});

describe('a kept video served with byte ranges', () => {
  const request = (url, range) =>
    new Request(`app://basecase${url}`, { headers: range ? { range } : {}, method: 'GET' });

  const read = async (response) => [...new Uint8Array(await response.arrayBuffer())];

  beforeEach(async () => {
    store.save({ manifest: manifest('take-1'), recording: null });
    await store.writeVideo({ id: 'take-1', position: 0, bytes: bytes(0, 1, 2, 3, 4, 5, 6, 7, 8, 9) });
    await store.closeVideo({ id: 'take-1', keep: true });
  });

  it('reads a range the way a video element asks for one', () => {
    expect(byteRange('bytes=0-', 10)).toEqual({ start: 0, end: 9 });
    expect(byteRange('bytes=2-4', 10)).toEqual({ start: 2, end: 4 });
    expect(byteRange('bytes=8-99', 10)).toEqual({ start: 8, end: 9 });
    expect(byteRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 });
    expect(byteRange('bytes=10-', 10)).toBe(false);
    expect(byteRange('bytes=0-1,4-5', 10)).toBeNull();
    expect(byteRange(undefined, 10)).toBeNull();
  });

  it('streams the whole file, or one range of it, without reading it into memory first', async () => {
    const whole = tryVideoResponse(store, request('/api/try-video/take-1'));

    expect(whole.status).toBe(200);
    expect(whole.headers.get('accept-ranges')).toBe('bytes');
    expect(await read(whole)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

    const part = tryVideoResponse(store, request('/api/try-video/take-1', 'bytes=6-'));

    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 6-9/10');
    expect(await read(part)).toEqual([6, 7, 8, 9]);
    expect(tryVideoResponse(store, request('/api/try-video/take-1', 'bytes=20-')).status).toBe(416);
  });

  it('serves only a kept try’s own video', async () => {
    fs.writeFileSync(path.join(dir, 'auth.json'), '{"token":"x"}');

    for (const url of ['/api/try-video/missing', '/api/try-video/..%2F..%2Fauth.json', '/api/try-video/a%2Fb']) {
      expect(tryVideoResponse(store, request(url)).status, url).toBe(404);
    }

    expect(tryVideoResponse(store, request('/index.html'))).toBeNull();
  });
});
