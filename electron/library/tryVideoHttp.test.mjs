import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { guardBridge } from '../bridgeGuard.mjs';
import { TryStore } from './tryStore.mjs';
import { TRY_VIDEO_PREFIX, tryVideoMiddleware } from './tryVideo.mjs';

let server;
let dir;

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('raw camera video bridge transport', () => {
  it('accepts bounded binary uploads through the guarded middleware and refuses cross-site writes', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'try-video-http-'));

    const store = new TryStore({ triesDir: path.join(dir, 'tries'), cacheFile: path.join(dir, 'cache.json') });
    const handle = guardBridge(tryVideoMiddleware(store));
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const hash = createHash('sha256').update(bytes).digest('hex');

    store.save({ manifest: { id: 'try-1', sceneId: 'scene', videos: [{ camera: 'front' }] } });
    server = http.createServer((req, res) => {
      req.url = req.url.slice(TRY_VIDEO_PREFIX.length);
      handle(req, res);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    const url = `http://127.0.0.1:${server.address().port}${TRY_VIDEO_PREFIX}try-1/front?asset=${hash}`;
    const headers = { 'X-Video-Bytes': '4' };
    const response = await fetch(url, { method: 'PUT', body: bytes, headers });

    expect(response.status).toBe(200);
    expect([...new Uint8Array(await (await fetch(url)).arrayBuffer())]).toEqual([...bytes]);
    expect((await fetch(url, { method: 'PUT', body: bytes, headers: { ...headers, Origin: 'https://elsewhere.example', 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403);
  });
});
