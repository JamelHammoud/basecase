import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { box } from '../sim/fixtures/parts';
import { DEFAULT_PROJECT } from '../types/robotics';
import { approximateScene } from './guideScene';
import type { DrawGuideOptions } from './render/guideDrawings';
import { renderGuide } from './renderGuide';

const calls = vi.hoisted(() => ({
  draw: vi.fn(),
  encode: vi.fn(),
  dispose: vi.fn(),
  bitmap: vi.fn(),
  close: vi.fn(),
}));

vi.mock('./render/guideRenderer', () => ({
  GuideRenderer: class {
    sync = async () => undefined;
    dispose = calls.dispose;
  },
}));
vi.mock('./render/guideMeasure', () => ({ measureGuideScene: async () => approximateScene('Kit', parts, []) }));
vi.mock('./render/guideDrawings', () => ({ drawGuide: calls.draw }));
vi.mock('./render/guideStage', () => ({ blobDataUrl: async () => 'data:image/webp;base64,thumbnail' }));
vi.mock('./doc/guideDocument', () => ({ guideHtml: () => ({ html: '<html>Kit</html>', pages: 1 }) }));

const parts = [box('bracket', [0, 0, 0], [10, 10, 10], 1)];
const job = {
  guideId: 'thumbnail',
  title: 'Kit',
  parts,
  partKeys: { bracket: 'shape' },
  project: DEFAULT_PROJECT,
  date: '2026-11-17',
  mark: '',
};
const cover = { dataUrl: 'data:image/png;base64,cover', width: 1700, height: 850, arrows: [], points: [] };
const drawings = { cover, items: {}, modules: {}, steps: [] };
const events = () => ({ onCover: vi.fn(), onProgress: vi.fn(), isCancelled: () => false });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  calls.encode.mockResolvedValue(new Blob());
  calls.bitmap.mockResolvedValue({ width: 1700, height: 850, close: calls.close });
  calls.draw.mockImplementation(async (_context, options: DrawGuideOptions) => {
    options.onCover?.(cover);

    return drawings;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ blob: async () => new Blob() })),
  );
  vi.stubGlobal('createImageBitmap', calls.bitmap);
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext = () => ({ drawImage: vi.fn() });
      convertToBlob = calls.encode;
    },
  );
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it('shares each early cover conversion with the completed guide and prepares changed covers afresh', async () => {
  for (const dataUrl of [cover.dataUrl, 'data:image/png;base64,edited']) {
    const output = events();

    calls.draw.mockImplementation(async (_context, options: DrawGuideOptions) => {
      options.onCover?.({ ...cover, dataUrl });

      return { ...drawings, cover: { ...cover, dataUrl } };
    });

    const result = await renderGuide(job, output);

    expect(result).toMatchObject({ html: '<html>Kit</html>', pages: 1 });
    expect(output.onCover).toHaveBeenCalledExactlyOnceWith(result?.coverDataUrl);
  }

  expect(calls.bitmap).toHaveBeenCalledTimes(2);
  expect(calls.close).toHaveBeenCalledTimes(2);
  expect(calls.encode).toHaveBeenCalledTimes(2);
  expect(calls.encode).toHaveBeenCalledWith({ type: 'image/webp', quality: 0.85 });
});

it('publishes the early cover before step drawing finishes', async () => {
  const output = events();
  const pending = deferred<typeof drawings>();
  const preview = deferred<string>();

  output.onCover.mockImplementation(preview.resolve);

  calls.draw.mockImplementation(async (_context, options: DrawGuideOptions) => {
    options.onCover?.(cover);

    return pending.promise;
  });

  const result = renderGuide(job, output);

  await preview.promise;
  pending.resolve(drawings);
  expect((await result)?.coverDataUrl).toBe(output.onCover.mock.calls[0][0]);
  expect(calls.encode).toHaveBeenCalledOnce();
});

it('propagates conversion failure without starting a second conversion', async () => {
  const output = events();

  calls.encode.mockRejectedValue(new Error('encoding failed'));

  await expect(renderGuide(job, output)).rejects.toThrow('encoding failed');
  expect(output.onCover).not.toHaveBeenCalled();
  expect(calls.encode).toHaveBeenCalledOnce();
  expect(calls.dispose).toHaveBeenCalledOnce();
});
