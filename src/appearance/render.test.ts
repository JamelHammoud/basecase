import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { openOffscreenWorker, type OffscreenTestWorker } from '../../tools/testing/offscreenWorker';
import type { appearanceRenderChecks } from './renderChecks';

let worker: OffscreenTestWorker;
let opening: Promise<OffscreenTestWorker>;
const setup = new AbortController();

beforeAll(async () => {
  opening = openOffscreenWorker(
    fileURLToPath(new URL('./renderChecks.ts', import.meta.url)),
    'appearanceRenderChecks',
    { signal: setup.signal, timeout: 15000 },
  );
  worker = await opening;
}, 15000);

afterAll(async () => {
  setup.abort();
  await opening?.then(
    (opened) => opened.close(),
    () => undefined,
  );
});

const pixel = (pixels: number[], x: number, y: number) => pixels.slice((y * 64 + x) * 4, (y * 64 + x) * 4 + 3);
const difference = (a: number[], b: number[]) =>
  a.reduce((sum, value, index) => sum + (Math.abs(value - b[index]) > 40 ? 1 : 0), 0) / a.length;

it('applies local color textures, preserves UV orientation and changes scale and projection reproducibly', async () => {
  const result = await worker.run<Awaited<ReturnType<typeof appearanceRenderChecks>>>(null);

  console.info(
    JSON.stringify({
      maximum: result.maximum,
      programReuse: result.programReuse,
      texturePreparationMs: result.preparationMs,
      encodedBytes: result.bytes,
      drawCalls: result.drawCalls,
      retainedPixels: result.resources.pixels,
      finishGpuTextures: result.gpuTextures,
    }),
  );

  await mkdir('scratch', { recursive: true });
  await writeFile(
    'scratch/appearance-render-metrics.json',
    JSON.stringify({
      maximum: result.maximum,
      programReuse: result.programReuse,
      texturePreparationMs: result.preparationMs,
      encodedBytes: result.bytes,
      drawCalls: result.drawCalls,
      retainedPixels: result.resources.pixels,
      finishGpuTextures: result.gpuTextures,
    }),
  );

  const bottomLeft = pixel(result.uv, 12, 12);
  const topLeft = pixel(result.uv, 12, 52);
  const topRight = pixel(result.uv, 52, 52);

  expect(bottomLeft[2] - bottomLeft[0]).toBeGreaterThan(80);
  expect(topLeft[0] - topLeft[2]).toBeGreaterThan(80);
  expect(topRight[1] - topRight[0]).toBeGreaterThan(80);
  expect(difference(result.uv, result.scaled)).toBeGreaterThan(0.15);
  expect(difference(result.uv, result.rotated)).toBeGreaterThan(0.15);
  expect(difference(result.uv, result.planar)).toBeGreaterThan(0.15);
  expect(result.malformedRefused).toBe(true);
  expect(result.drawCalls).toBe(1);
  expect(result.sharedUploads).toBe(1);
  expect(result.programReuse.initial.length).toBeGreaterThan(0);

  for (const programs of result.programReuse.results) expect(programs).toEqual(result.programReuse.initial);

  expect(result.programReuse.mappedPrograms).toEqual(result.programReuse.texturedPrograms);
  expect(result.programReuse.sharedHandle).toBe(true);
  expect(result.resources.textures).toBe(0);
  expect(result.gpuTextures).toBe(0);
  expect(result.bytes).toBeLessThan(1024);
  expect(result.maximum.decodedPixels).toBeGreaterThanOrEqual(8_388_608);
  expect(result.maximum.decodedPixels).toBeLessThanOrEqual(8_388_624);
  expect(result.maximum.reservedPixels).toBe(0);
});
