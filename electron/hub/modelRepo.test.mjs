import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startFakeHub, commitSha } from '../../e2e/fakeHub.ts';
import { HubAccount } from './index.mjs';
import { HUB_CALLS } from './routes.mjs';
import { downloadModel } from './modelRepo.mjs';

const bytes = Buffer.from([8, 9, 10]);
const model = () => ({
  owner: 'test',
  repo: 'model',
  revision: 'a'.repeat(40),
  file: 'onnx/model.onnx',
  sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  bytes: bytes.length,
});
const dirs = [];
const dir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vision-model-'));

  dirs.push(d);

  return d;
};

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('vision model download', () => {
  it('uses the guarded Hub client anonymously and returns only a binary cache URL', async () => {
    const hub = await startFakeHub({ token: 'test' });

    try {
      hub.seed('test/model', { 'onnx/model.onnx': bytes });
      hub.repos.get('test/model').kind = 'model';

      const account = new HubAccount({ libraryDir: dir(), endpoint: () => hub.url });
      const descriptor = { ...model(), revision: commitSha('test/model', 1) };
      const reply = await HUB_CALLS['hub:model-file'](account, descriptor);

      expect(reply).toEqual({ url: `/api/vision-model/${descriptor.sha256}` });
      expect(JSON.stringify(reply).length).toBeLessThan(100);
      expect(hub.requests).toEqual([
        { method: 'GET', path: `/test/model/resolve/${descriptor.revision}/onnx/model.onnx`, auth: undefined },
      ]);

      const response = await account.modelResponse(new Request(`https://app.example${reply.url}`));

      expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    } finally {
      await hub.close();
    }
  });

  it('pins the download, verifies bytes and reuses only a verified cache', async () => {
    const client = { download: vi.fn(async () => bytes) };
    const root = dir();

    expect(Buffer.from(await downloadModel(client, { libraryDir: root, model: model() }))).toEqual(bytes);
    expect(client.download).toHaveBeenCalledWith(`/test/model/resolve/${'a'.repeat(40)}/onnx/model.onnx`, {
      maxBytes: 3,
      label: 'model.onnx',
    });
    await downloadModel(client, { libraryDir: root, model: model() });
    expect(client.download).toHaveBeenCalledTimes(1);
    fs.writeFileSync(path.join(root, 'models', `${model().sha256}.onnx`), 'bad');
    await downloadModel(client, { libraryDir: root, model: model() });
    expect(client.download).toHaveBeenCalledTimes(2);
  });

  it('refuses a linked cache folder before any download', async () => {
    const root = dir();
    const target = dir();
    const client = { download: vi.fn(async () => bytes) };

    fs.symlinkSync(target, path.join(root, 'models'), 'junction');
    await expect(downloadModel(client, { libraryDir: root, model: model() })).rejects.toThrow(/local folder/);
    expect(client.download).not.toHaveBeenCalled();
  });

  it('refuses traversal before requests and leaves tampered bytes uncached', async () => {
    const root = dir();
    const client = { download: vi.fn(async () => Buffer.from('wrong')) };

    for (const file of ['../secret.onnx', '/secret.onnx', 'x\\secret.onnx', 'x/%2e%2e/a.onnx'])
      await expect(downloadModel(client, { libraryDir: root, model: { ...model(), file } })).rejects.toThrow();

    expect(client.download).not.toHaveBeenCalled();
    await expect(downloadModel(client, { libraryDir: root, model: model() })).rejects.toThrow(/match/);
    expect(fs.existsSync(path.join(root, 'models'))).toBe(false);
  });
});
