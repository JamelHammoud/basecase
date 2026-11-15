import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadAsset, parseAssetUrl } from './assets.mjs';

const asset = parseAssetUrl(`https://huggingface.co/datasets/maker/assets/resolve/${'a'.repeat(40)}/Pack/root.usd`);
const folders = [];

function temporaryFolder() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-assets-'));

  folders.push(dir);

  return dir;
}

afterEach(() => {
  vi.unstubAllGlobals();
  folders.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
});

describe('SimReady file batches', () => {
  it('downloads each uncached file once with six active requests and complete progress', async () => {
    const dir = temporaryFolder();
    const files = Array.from({ length: 9 }, (_, i) => ({ path: i ? `Pack/${i}.usd` : asset.rootPath, size: 2 }));
    const gates = files.map(() => Promise.withResolvers());
    const firstBatch = Promise.withResolvers();
    const seventh = Promise.withResolvers();
    const requested = [];
    let active = 0;
    let peak = 0;

    fs.mkdirSync(path.join(dir, 'Pack'));
    fs.writeFileSync(path.join(dir, files[8].path), 'ok');
    vi.stubGlobal('fetch', async (url) => {
      if (url.includes('/tree/')) return Response.json(files.map((file) => ({ ...file, type: 'file' })));

      const index = files.findIndex((file) => url.endsWith(`/${file.path}`));

      expect(index).toBeGreaterThanOrEqual(0);
      requested.push(index);
      active++;
      peak = Math.max(peak, active);

      if (requested.length === 6) firstBatch.resolve();

      if (requested.length === 7) seventh.resolve();

      await gates[index].promise;
      active--;

      return new Response('ok');
    });

    const say = vi.fn();
    const pending = downloadAsset(asset, dir, say);

    await firstBatch.promise;
    expect(requested).toEqual([0, 1, 2, 3, 4, 5]);
    gates[5].resolve();
    await seventh.promise;
    gates.forEach((gate) => gate.resolve());
    expect(await pending).toBe(path.join(dir, asset.rootPath));
    expect(requested).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBe(6);
    expect(active).toBe(0);
    expect(files.map((file) => fs.readFileSync(path.join(dir, file.path), 'utf8'))).toEqual(files.map(() => 'ok'));
    expect(say.mock.calls.slice(1).map(([, progress]) => progress)).toEqual(
      files.map((_, i) => ({ done: i + 1, total: files.length })),
    );
    expect(say).toHaveBeenLastCalledWith('Downloading 100%', { done: 9, total: 9 });
  });

  it.each([
    [[{ path: 'Pack/other.usd', size: 1 }], 'main file is missing'],
    [Array.from({ length: 4 }, () => ({ path: asset.rootPath, size: 200 * 1024 * 1024 })), 'larger than'],
  ])('refuses an unusable listing before starting downloads', async (files, message) => {
    const fetcher = vi.fn(async () => Response.json(files.map((file) => ({ ...file, type: 'file' }))));

    vi.stubGlobal('fetch', fetcher);
    await expect(downloadAsset(asset, temporaryFolder(), vi.fn())).rejects.toThrow(message);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
