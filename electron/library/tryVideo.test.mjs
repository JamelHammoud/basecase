import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TryStore } from './tryStore.mjs';
import { tryVideoAsset } from './tryVideo.mjs';

let folder;
let store;

beforeEach(() => {
  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'try-video-'));
  store = new TryStore({ triesDir: folder, cacheFile: path.join(folder, 'cache.json') });
  store.save({ manifest: { id: 'clip', sceneId: 'scene' } });
  store.saveVideo({ id: 'clip', bytes: new Uint8Array([0, 1, 2, 3, 4, 5]) });
});

afterEach(() => fs.rmSync(folder, { recursive: true, force: true }));

const request = (id, range) => new Request(`http://localhost/api/try-video?id=${encodeURIComponent(id)}`, {
  headers: range ? { range } : {},
});

describe('saved video streams', () => {
  it('streams only requested bytes and reports the file size', async () => {
    const response = tryVideoAsset(store, request('clip', 'bytes=2-4'));

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 2-4/6');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([2, 3, 4]);
    expect(tryVideoAsset(store, request('clip', 'bytes=8-9')).status).toBe(416);
    expect(tryVideoAsset(store, request('clip', 'bytes=0-1,3-4')).status).toBe(416);
  });

  it('refuses hostile ids before opening a file and keeps the route scoped', async () => {
    for (const id of ['../auth', '..\\auth', 'CON', '', 'x'.repeat(200)]) {
      expect(tryVideoAsset(store, request(id)).status).toBe(400);
    }

    expect(tryVideoAsset(store, request('missing')).status).toBe(404);
    expect(tryVideoAsset(store, new Request('http://localhost/api/other'))).toBeNull();
    expect([...new Uint8Array(await tryVideoAsset(store, request('clip')).arrayBuffer())]).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
