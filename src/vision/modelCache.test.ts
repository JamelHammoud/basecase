import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { modelCacheUrl, webModelFile } from './modelCache';

const kept = vi.hoisted(() => new Map<string, Uint8Array>());

vi.mock('../utils/platform/web/idb', () => ({
  idbGet: async (_store: string, key: string) => kept.get(key),
  idbPut: async (_store: string, key: string, value: Uint8Array) => {
    kept.set(key, value);
  },
}));

const bytes = new Uint8Array([8, 1, 2]);
const model = () => ({
  owner: 'test',
  repo: 'tiny',
  revision: 'a'.repeat(40),
  file: 'model.onnx',
  sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  bytes: bytes.length,
});

afterEach(() => {
  kept.clear();
  vi.unstubAllGlobals();
});

describe('web vision cache', () => {
  it('uses the shared service refusal style and keeps failed downloads out of the cache', async () => {
    vi.stubGlobal('fetch', async () => new Response(null, { status: 429 }));
    await expect(webModelFile(model())).rejects.toThrow('Hugging Face is limiting requests. Run it again in a minute.');
    expect(kept.size).toBe(0);
    vi.stubGlobal('fetch', async () => new Response(null, { status: 503 }));
    await expect(webModelFile(model())).rejects.toThrow(
      'Hugging Face couldn’t finish the request. Run it again in a minute.',
    );
    expect(kept.size).toBe(0);
  });

  it('checks downloaded and cached hashes and never downloads a verified model twice', async () => {
    const download = vi.fn(async () => new Response(bytes));

    vi.stubGlobal('fetch', download);
    expect(await webModelFile(model())).toEqual(bytes);
    expect(await webModelFile(model())).toEqual(bytes);
    expect(download).toHaveBeenCalledOnce();
    expect(download.mock.calls[0]).toEqual([
      `https://huggingface.co/test/tiny/resolve/${'a'.repeat(40)}/model.onnx`,
      expect.objectContaining({ credentials: 'omit' }),
    ]);
    kept.set(`vision:${model().sha256}`, new Uint8Array([1, 2, 3]));
    expect(await webModelFile(model())).toEqual(bytes);
    expect(download).toHaveBeenCalledTimes(2);
  });

  it('stops oversized streamed bodies and stores no tampered model', async () => {
    let canceled = false;
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(4));
      },
      cancel() {
        canceled = true;
      },
    });

    vi.stubGlobal('fetch', async () => new Response(body));
    await expect(webModelFile(model())).rejects.toThrow(/limit/);
    expect(canceled).toBe(true);
    expect(kept.size).toBe(0);
    vi.stubGlobal('fetch', async () => new Response(new Uint8Array([3, 2, 1])));
    await expect(webModelFile(model())).rejects.toThrow(/hash/);
    expect(kept.size).toBe(0);
  });

  it('keeps custom app cache URLs on the exact host despite opaque URL origins', () => {
    const hash = model().sha256;
    const own = `app://basecase/assets/worker.js`;

    expect(modelCacheUrl(`/api/vision-model/${hash}`, own, hash).href).toBe(`app://basecase/api/vision-model/${hash}`);

    for (const source of [
      `app://other/api/vision-model/${hash}`,
      `https://basecase/api/vision-model/${hash}`,
      `/api/vision-model/${hash}?x=1`,
      '/api/vision-model/../secret',
    ])
      expect(() => modelCacheUrl(source, own, hash)).toThrow(/inside/);
  });

  it('rejects traversal before fetching', async () => {
    const download = vi.fn();

    vi.stubGlobal('fetch', download);
    await expect(webModelFile({ ...model(), file: '../secret.onnx' })).rejects.toThrow();
    expect(download).not.toHaveBeenCalled();
  });
});
