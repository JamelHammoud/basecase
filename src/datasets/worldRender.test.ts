import { fileURLToPath } from 'node:url';
import { ALL_FORMATS, BufferSource, EncodedPacketSink, Input } from 'mediabunny';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { openOffscreenWorker, type OffscreenTestWorker } from '../../tools/testing/offscreenWorker';
import type { worldRenderPixels, worldRenderVideos } from './worldRenderAcceptance';

let worker: OffscreenTestWorker;
let opening: Promise<OffscreenTestWorker>;
const setup = new AbortController();

beforeAll(async () => {
  opening = openOffscreenWorker(
    fileURLToPath(new URL('./worldRenderAcceptance.ts', import.meta.url)),
    'worldRenderChecks',
    { signal: setup.signal, timeout: 15000 },
  );
  worker = await opening;
  await worker.run('init');
}, 15000);

afterAll(async () => {
  setup.abort();
  await opening?.then(
    (opened) => opened.close(),
    () => undefined,
  );
});

async function packets(bytes: Uint8Array) {
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });

  try {
    const track = (await input.getPrimaryVideoTrack())!;
    let count = 0;

    for await (const packet of new EncodedPacketSink(track).packets()) if (packet) count++;

    return count;
  } finally {
    input.dispose();
  }
}

it('renders repeatable captured pixels and mesh fallback without changing Open Floor or box worlds', async () => {
  const result = await worker.run<Awaited<ReturnType<typeof worldRenderPixels>>>('pixels');

  expect(result.floorSame).toBe(true);
  expect(result.difference).toBeGreaterThan(0.05);
  expect(result.meshDifference).toBeGreaterThan(0.05);
  expect(result.first).toBe(result.repeated);
}, 15000);

it('renders the captured world through the existing fisheye lens', async () => {
  const difference = await worker.run<number>('fisheye');

  expect(difference).toBeGreaterThan(0.05);
}, 15000);

it('renders the table depth from the collider within ten millimeters', async () => {
  const depth = await worker.run<number>('depth');

  expect(Math.abs(depth - 1000)).toBeLessThanOrEqual(10);
}, 15000);

it('exports the expected frame count for every kitchen camera', async () => {
  const files = await worker.run<Awaited<ReturnType<typeof worldRenderVideos>>>('videos');
  const videos = Object.entries(files).filter(([key]) => key.endsWith('.mp4'));

  expect(videos).toHaveLength(4);

  for (const [, bytes] of videos) expect(await packets(Uint8Array.from(Object.values(bytes)))).toBe(3);
}, 15000);
