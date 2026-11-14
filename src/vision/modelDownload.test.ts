import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModelRef } from '../../electron/hub/modelPolicy.mjs';
import { cachedDesktopModel, createModelStore, downloadModel } from './modelDownload';

const bytes = new TextEncoder().encode('model');
const ref: ModelRef = {
  owner: 'tester',
  repo: 'vision',
  revision: 'a'.repeat(40),
  path: 'onnx/model.onnx',
  sha256: '9372c470eeadd5ecd9c3c74c2b3cb633f8e2f2fad799250a0f70d652b6b825e4',
  maxBytes: 10,
};

const cacheOf = () => {
  const entries = new Map<string, Uint8Array>();

  return {
    entries,
    get: vi.fn(async (key: string) => entries.get(key)),
    put: vi.fn(async (key: string, value: Uint8Array) => {
      entries.set(key, new Uint8Array(value));
    }),
    delete: vi.fn(async (key: string) => {
      entries.delete(key);
    }),
  };
};

afterEach(() => vi.unstubAllGlobals());

describe('web vision model cache', () => {
  it('downloads once, checks cached bytes and returns transferable copies', async () => {
    const cache = cacheOf();
    const download = vi.fn(async () => bytes);
    const get = createModelStore({ cache, download });
    const [first, second] = await Promise.all([get(ref), get(ref)]);

    expect(first).toEqual(bytes);
    expect(first.buffer).not.toBe(second.buffer);
    expect(download).toHaveBeenCalledOnce();
    first.fill(0);
    expect(await get(ref)).toEqual(bytes);
    cache.entries.set(ref.sha256, new Uint8Array([1, 2, 3]));
    expect(await get(ref)).toEqual(bytes);
    expect(download).toHaveBeenCalledTimes(2);
    expect(cache.delete).toHaveBeenCalledWith(ref.sha256);
  });

  it('refuses hostile manifests and tampered downloads before caching', async () => {
    const cache = cacheOf();
    const download = vi.fn(async () => new Uint8Array([1]));
    const get = createModelStore({ cache, download });

    await expect(get({ ...ref, path: '../auth.json' })).rejects.toThrow('inside its repo');
    expect(download).not.toHaveBeenCalled();
    await expect(get(ref)).rejects.toThrow('checksum');
    expect(cache.put).not.toHaveBeenCalled();
  });
});

describe('web vision model downloads', () => {
  it('uses a pinned Hub URL without credentials', async () => {
    const fetcher = vi.fn(async () => new Response(bytes));

    vi.stubGlobal('fetch', fetcher);
    expect(await downloadModel(ref)).toEqual(bytes);
    expect(fetcher).toHaveBeenCalledWith(
      `https://huggingface.co/tester/vision/resolve/${ref.revision}/onnx/model.onnx`,
      expect.objectContaining({ credentials: 'omit' }),
    );
  });

  it('cancels responses larger than the declared or streamed cap', async () => {
    const declaredCancel = vi.fn();
    const declared = new ReadableStream({ cancel: declaredCancel });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(declared, { headers: { 'Content-Length': '11' } })),
    );
    await expect(downloadModel(ref)).rejects.toThrow('size limit');
    expect(declaredCancel).toHaveBeenCalledOnce();

    const streamedCancel = vi.fn();
    const streamed = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(11));
      },
      cancel: streamedCancel,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(streamed)),
    );
    await expect(downloadModel(ref)).rejects.toThrow('size limit');
    expect(streamedCancel).toHaveBeenCalledOnce();
  });
});

describe('desktop vision model streams', () => {
  it('fetches verified cached bytes directly in the worker through a scoped URL', async () => {
    const fetcher = vi.fn(async () => new Response(bytes));

    vi.stubGlobal('fetch', fetcher);
    expect(await cachedDesktopModel(ref)).toEqual(bytes);
    expect(fetcher).toHaveBeenCalledWith(`/api/vision-model/${ref.sha256}`, expect.any(Object));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))),
    );
    await expect(cachedDesktopModel(ref)).rejects.toThrow('checksum');
  });
});
