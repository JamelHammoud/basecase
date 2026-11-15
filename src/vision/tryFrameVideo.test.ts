import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { openOffscreenWorker, type OffscreenTestWorker } from '../../tools/testing/offscreenWorker';
import type { tryFrameVideoAcceptance } from './tryFrameVideoAcceptance';

let worker: OffscreenTestWorker;

beforeAll(async () => {
  worker = await openOffscreenWorker(
    fileURLToPath(new URL('./tryFrameVideoAcceptance.ts', import.meta.url)),
    'tryFrameVideoAcceptance',
  );
}, 15000);

afterAll(async () => {
  await worker?.close();
});

it('decodes real JPEG pixels from imported and Operate videos using their stored clip offsets', async () => {
  const result = await worker.run<Awaited<ReturnType<typeof tryFrameVideoAcceptance>>>(null);

  expect(result.frames).toHaveLength(6);
  expect(result.frames.map((frame) => frame.mean)).toEqual([
    expect.closeTo(96, -1),
    expect.closeTo(160, -1),
    expect.closeTo(224, -1),
    expect.closeTo(0, -1),
    expect.closeTo(32, -1),
    expect.closeTo(96, -1),
  ]);
  expect(result.frames.every((frame) => frame.width === 64 && frame.height === 48 && frame.jpegBytes > 100)).toBe(true);
  expect(new Set(result.requests.map((url) => new URL(url).pathname))).toEqual(
    new Set(['/api/tries/video/import-video/front', '/api/tries/video/operate-video/front']),
  );
});
