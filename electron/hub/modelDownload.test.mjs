import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HubAccount } from './index.mjs';
import { HUB_CALLS, hubPostRoutes } from './routes.mjs';

const bytes = Buffer.from('model');
const ref = {
  owner: 'tester',
  repo: 'vision',
  revision: 'a'.repeat(40),
  path: 'onnx/model.onnx',
  sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  maxBytes: 10,
};
const dirs = [];
const servers = [];

async function account(reply, outbound) {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push({ path: req.url, authorization: req.headers.authorization });
    reply(res);
  });

  servers.push(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-model-'));

  dirs.push(dir);

  return {
    requests,
    hub: new HubAccount({
      libraryDir: dir,
      secrets: { available: () => false },
      endpoint: () => `http://127.0.0.1:${server.address().port}`,
      outbound,
    }),
  };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('guarded Hub vision model downloads', () => {
  it('shares the model cache between trusted IPC and HTTP routes', async () => {
    const { hub, requests } = await account((res) => res.end(bytes));

    expect(await HUB_CALLS['hub:model-file'](hub, ref)).toEqual({ url: `/api/vision-model/${ref.sha256}` });

    const route = hubPostRoutes(hub).find(([name]) => name === '/hub-model-file')[1];

    expect(await route({ arg: ref })).toEqual({ url: `/api/vision-model/${ref.sha256}` });
    expect(requests).toEqual([
      { path: `/tester/vision/resolve/${ref.revision}/onnx/model.onnx`, authorization: undefined },
    ]);
  });

  it('uses the public-address guard without account credentials for https redirects', async () => {
    const outbound = vi.fn(async () => new Response(bytes));
    const { hub } = await account((res) => {
      res.writeHead(302, { Location: 'https://cdn.example/model.onnx' });
      res.end();
    }, outbound);

    expect(await hub.modelFile(ref)).toEqual({ url: `/api/vision-model/${ref.sha256}` });
    expect(outbound).toHaveBeenCalledWith('https://cdn.example/model.onnx', expect.any(Object));
    expect(JSON.stringify(outbound.mock.calls)).not.toContain('Authorization');
  });

  it('refuses plain http redirects before reaching the target', async () => {
    const outbound = vi.fn();
    const { hub } = await account((res) => {
      res.writeHead(302, { Location: 'http://127.0.0.1/private' });
      res.end();
    }, outbound);

    await expect(hub.modelFile(ref)).rejects.toThrow('isn’t https');
    expect(outbound).not.toHaveBeenCalled();
  });

  it('stops a streamed download beyond its manifest cap', async () => {
    const { hub } = await account((res) => {
      res.write(new Uint8Array(11));
      res.end();
    });

    await expect(hub.modelFile(ref)).rejects.toThrow('size limit');
  });
});
