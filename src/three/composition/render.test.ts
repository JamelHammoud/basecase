import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { openOffscreenWorker, type OffscreenTestWorker } from '../../../tools/testing/offscreenWorker';
import type { compositionChecks } from './renderChecks';

let opening: Promise<OffscreenTestWorker>;
let worker: OffscreenTestWorker;
const setup = new AbortController();

beforeAll(async () => {
  opening = openOffscreenWorker(fileURLToPath(new URL('./renderChecks.ts', import.meta.url)), 'compositionChecks', {
    signal: setup.signal,
    timeout: 15000,
  });
  worker = await opening;

  const cameraBytes = Array.from(await readFile('public/parts/raspberry-pi-camera-3.glb'));

  await worker.run({ index: -4, cameraBytes });
}, 15000);

afterAll(async () => {
  setup.abort();
  await opening?.then(
    (opened) => opened.close(),
    () => undefined,
  );
});

it.each(Array.from({ length: 10 }, (_, index) => index))(
  'renders finished design %i with exact pose, material bindings, framing, alpha and repeatability',
  async (index) => {
    const { design } = await worker.run<Awaited<ReturnType<typeof compositionChecks>>>({ index, cameraBytes: [] });

    await mkdir('scratch', { recursive: true });
    await writeFile(`scratch/composition-design-${index}.json`, JSON.stringify(design));
    expect(design!.size).toEqual([96, 64]);
    expect(design!.foreground).toBeGreaterThan(10);
    expect(design!.backgroundAlpha).toBe(0);
    expect(design!.helpers).toBe(0);
    expect(design!.transforms).toBe(true);
    expect(design!.materials).toBe(true);
    expect(design!.framed).toBe(true);
    expect(design!.repeat).toBe(true);

    if (index === 3) expect(design!.partialAlpha).toBeGreaterThan(0);
  },
);

it('changes lighting and environment pixels, preserves opaque alpha and refuses missing textures', async () => {
  const { variations } = await worker.run<Awaited<ReturnType<typeof compositionChecks>>>({
    index: -1,
    cameraBytes: [],
  });

  expect(variations!.opaqueAlpha).toBe(255);
  expect(variations!.lightingDifference).toBeGreaterThan(0.02);
  expect(variations!.rotationDifference).toBeGreaterThan(0.01);
  expect(variations!.backgroundColor).toEqual([128, 128, 128]);
  expect(variations!.missingRefused).toBe(true);
});

it('renders 500 repeated modules and releases their GPU textures', async () => {
  const { large } = await worker.run<Awaited<ReturnType<typeof compositionChecks>>>({ index: -2, cameraBytes: [] });

  await mkdir('scratch', { recursive: true });
  await writeFile('scratch/composition-large.json', JSON.stringify(large));
  expect(large!.parts).toBeGreaterThanOrEqual(500);
  expect(large!.foreground).toBeGreaterThan(10);
  expect(large!.texturesAfterDisposal).toBe(0);
});

it('preserves scalar cover alpha inside the solid and excludes hidden assets and references', async () => {
  const { alpha } = await worker.run<Awaited<ReturnType<typeof compositionChecks>>>({ index: -3, cameraBytes: [] });

  await mkdir('scratch', { recursive: true });
  await writeFile('scratch/composition-alpha.json', JSON.stringify(alpha));
  expect(alpha!.center).toBeGreaterThanOrEqual(88);
  expect(alpha!.center).toBeLessThanOrEqual(90);
  expect(alpha!.corner).toBe(0);
});
