import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { guardBridge } from './bridgeGuard.mjs';
import { binaryAssetMiddleware, fileResponse } from './binaryAsset.mjs';

let folder;
let server;
let url;

beforeEach(async () => {
  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'binary-asset-'));

  const file = path.join(folder, 'clip.mp4');

  fs.writeFileSync(file, new Uint8Array([0, 1, 2, 3, 4, 5]));

  const handler = guardBridge(
    binaryAssetMiddleware((request) =>
      new URL(request.url).pathname === '/api/clip' ? fileResponse(file, request) : null,
    ),
  );

  server = http.createServer((req, res) =>
    handler(req, res, () => {
      res.statusCode = 404;
      res.end();
    }),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(folder, { recursive: true, force: true });
});

describe('guarded binary bridge', () => {
  it('serves range and HEAD requests without a JSON envelope', async () => {
    const response = await fetch(`${url}/clip`, { headers: { range: 'bytes=-2' } });

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 4-5/6');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([4, 5]);

    const head = await fetch(`${url}/clip`, { method: 'HEAD' });

    expect(head.headers.get('content-length')).toBe('6');
    expect((await head.arrayBuffer()).byteLength).toBe(0);
    expect((await fetch(`${url}/other`)).status).toBe(404);
  });

  it('refuses another website before opening its asset', async () => {
    const response = await fetch(`${url}/clip`, {
      headers: { origin: 'https://other.example', 'sec-fetch-site': 'cross-site' },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Bridge requests must come from the app on this machine' });
  });
});
