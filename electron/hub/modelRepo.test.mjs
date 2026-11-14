import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelStore } from './modelRepo.mjs';
import { MODEL_FILE_BYTES } from './modelPolicy.mjs';

const bytes = new TextEncoder().encode('a small ONNX model fixture');
const manifest = {
  owner: 'tester',
  repo: 'vision',
  revision: 'a'.repeat(40),
  path: 'onnx/model.onnx',
  sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  maxBytes: 100,
};
const dirs = [];

async function store(download = vi.fn(async () => new Response(bytes))) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vision-model-'));

  dirs.push(dir);

  return { dir, download, models: new ModelStore({ dir, client: () => ({ downloadResponse: download }) }) };
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('vision model downloads', () => {
  it('refuses manifest paths and unbounded models before a request or cache read', async () => {
    const { download, models, dir } = await store();
    const attacks = [
      { owner: '..' },
      { owner: 'tester\n' },
      { repo: 'vision\n' },
      { revision: `${manifest.revision}\n` },
      { path: 'onnx/model.onnx\n' },
      { sha256: `${manifest.sha256}\n` },
      { repo: '../../api' },
      { revision: 'main' },
      { path: '../auth.json' },
      { path: 'onnx/../../auth.json' },
      { path: 'onnx\\model.onnx' },
      { path: '/model.onnx' },
      { path: '%2e%2e/model.onnx' },
      { path: 'https://evil.example/model.onnx' },
      { sha256: '../auth' },
      { maxBytes: MODEL_FILE_BYTES + 1 },
      { maxBytes: 0 },
      { maxBytes: NaN },
    ];

    for (const attack of attacks) await expect(models.prepare({ ...manifest, ...attack })).rejects.toThrow();

    expect(download).not.toHaveBeenCalled();
    expect(await fs.readdir(dir)).toEqual([]);
    expect(models.asset(manifest.sha256)).toBeNull();
    expect(() => models.asset('../auth')).toThrow();
  });

  it('checks SHA-256 before caching and after reading the cache', async () => {
    const { download, models, dir } = await store();
    const first = await models.prepare(manifest);

    expect(first).toEqual({ url: `/api/vision-model/${manifest.sha256}` });
    expect(new Uint8Array(await fs.readFile(models.asset(manifest.sha256).file))).toEqual(bytes);
    expect(download).toHaveBeenCalledWith(`/tester/vision/resolve/${manifest.revision}/onnx/model.onnx`);
    await expect(models.prepare(manifest)).resolves.toEqual(first);
    expect(download).toHaveBeenCalledOnce();

    await fs.writeFile(path.join(dir, `${manifest.sha256}.onnx`), 'tampered');
    await expect(models.prepare(manifest)).resolves.toEqual(first);
    expect(download).toHaveBeenCalledTimes(2);
    expect(await models.prepare(manifest)).toEqual({ url: `/api/vision-model/${manifest.sha256}` });
    expect(models.asset(manifest.sha256)).toEqual({
      file: path.join(dir, `${manifest.sha256}.onnx`),
      maxBytes: manifest.maxBytes,
    });
  });

  it('refuses tampered downloads and leaves no cache file', async () => {
    const { models, dir } = await store(vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))));

    await expect(models.prepare(manifest)).rejects.toThrow('checksum');
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it('caps downloaded and cached bytes and shares concurrent downloads', async () => {
    const { models, download, dir } = await store();

    await Promise.all([models.prepare(manifest), models.prepare(manifest)]);
    expect(download).toHaveBeenCalledOnce();
    await fs.writeFile(path.join(dir, `${manifest.sha256}.onnx`), new Uint8Array(101));
    await models.prepare(manifest);
    expect(download).toHaveBeenCalledTimes(2);

    const oversized = await store(vi.fn(async () => new Response(new Uint8Array(101))));

    await expect(oversized.models.prepare(manifest)).rejects.toThrow('size');
    expect(await fs.readdir(oversized.dir)).toEqual([]);
  });
});
