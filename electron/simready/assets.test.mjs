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

describe('SimReady download boundaries', () => {
  it.each(['https://other.example/next', 'http://huggingface.co/next', 'not a URL'])(
    'refuses pagination outside the Hugging Face origin: %s',
    async (next) => {
      const fetcher = vi.fn(async () =>
        Response.json([{ type: 'file', path: asset.rootPath, size: 2 }], {
          headers: { link: `<${next}>; rel="next"` },
        }),
      );

      vi.stubGlobal('fetch', fetcher);
      await expect(downloadAsset(asset, temporaryFolder(), vi.fn())).rejects.toThrow('couldn’t finish');
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it('follows pagination on the Hugging Face origin', async () => {
    const next = 'https://huggingface.co/api/next';
    const fetcher = vi.fn(async (url) => {
      if (url === next) return Response.json([{ type: 'file', path: asset.rootPath, size: 2 }]);

      if (url.includes('/tree/')) return Response.json([], { headers: { link: `<${next}>; rel="next"` } });

      return new Response('ok');
    });

    vi.stubGlobal('fetch', fetcher);
    await downloadAsset(asset, temporaryFolder(), vi.fn());
    expect(fetcher.mock.calls.map(([url]) => url)).toContain(next);
  });

  it.each([false, true])('refuses listing redirects before leaving the origin, paginated: %s', async (paginated) => {
    const dir = temporaryFolder();
    const next = 'https://huggingface.co/api/next';
    const fetcher = vi.fn(async (url) => {
      if (paginated && url !== next) {
        return Response.json([], { headers: { link: `<${next}>; rel="next"` } });
      }

      return Response.redirect('https://other.example/listing');
    });

    vi.stubGlobal('fetch', fetcher);
    await expect(downloadAsset(asset, dir, vi.fn())).rejects.toThrow('couldn’t finish');
    expect(fetcher).toHaveBeenCalledTimes(paginated ? 2 : 1);

    for (const [, options] of fetcher.mock.calls) expect(options).toEqual({ redirect: 'manual' });

    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it.each([
    null,
    {},
    { path: 12, size: 1 },
    { path: asset.rootPath },
    { path: asset.rootPath, size: -1 },
    { path: asset.rootPath, size: '2' },
    { path: asset.rootPath, size: null },
  ])('refuses malformed listing entries: %j', async (entry) => {
    const fetcher = vi.fn(async () => Response.json([entry && { type: 'file', ...entry }]));

    vi.stubGlobal('fetch', fetcher);
    await expect(downloadAsset(asset, temporaryFolder(), vi.fn())).rejects.toThrow('couldn’t finish');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(['../escape.usd', 'Pack/../../escape.usd'])('refuses escaped file paths: %s', async (file) => {
    const fetcher = vi.fn(async () => Response.json([{ type: 'file', path: file, size: 1 }]));

    vi.stubGlobal('fetch', fetcher);
    await expect(downloadAsset({ ...asset, rootPath: file }, temporaryFolder(), vi.fn())).rejects.toThrow(
      'outside its folder',
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('refuses understated response bytes before writing, content-length: %s', async (declared) => {
    const dir = temporaryFolder();

    vi.stubGlobal('fetch', async (url) => {
      if (url.includes('/tree/')) return Response.json([{ type: 'file', path: asset.rootPath, size: 1 }]);

      return new Response('too big', { headers: declared ? { 'content-length': '7' } : {} });
    });
    await expect(downloadAsset(asset, dir, vi.fn())).rejects.toThrow('larger than');
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('stops an oversized streamed file and cancels its body without writing', async () => {
    const dir = temporaryFolder();
    const chunk = new Uint8Array(8 * 1024 * 1024);
    const cancel = vi.fn();
    let pulls = 0;

    vi.stubGlobal('fetch', async (url) => {
      if (url.includes('/tree/')) {
        return Response.json([{ type: 'file', path: asset.rootPath, size: 200 * 1024 * 1024 }]);
      }

      return new Response(
        new ReadableStream({
          pull(controller) {
            pulls++;

            if (pulls > 27) {
              controller.close();

              return;
            }

            controller.enqueue(chunk);
          },
          cancel,
        }),
      );
    });
    await expect(downloadAsset(asset, dir, vi.fn())).rejects.toThrow('larger than');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(pulls).toBeLessThanOrEqual(27);
    expect(fs.readdirSync(dir)).toEqual([]);
  });
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
    [
      Array.from({ length: 4 }, (_, i) => ({
        path: i ? `Pack/${i}.usd` : asset.rootPath,
        size: 200 * 1024 * 1024,
      })),
      'larger than',
    ],
  ])('refuses an unusable listing before starting downloads', async (files, message) => {
    const fetcher = vi.fn(async () => Response.json(files.map((file) => ({ ...file, type: 'file' }))));

    vi.stubGlobal('fetch', fetcher);
    await expect(downloadAsset(asset, temporaryFolder(), vi.fn())).rejects.toThrow(message);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
