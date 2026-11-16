import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { openOffscreenWorker, type OffscreenTestWorker } from '../../tools/testing/offscreenWorker';
import { visibilityMatrixInput } from './visibilityMatrixInput';
import { VISIBILITY_WORKFLOWS } from './visibilityFixtures';
import type { visibilityMatrixChecks } from './visibilityMatrixAcceptance';

let worker: OffscreenTestWorker;
let mesh: number[];
const setup = new AbortController();
let opening: Promise<OffscreenTestWorker>;

beforeAll(async () => {
  mesh = Array.from(await readFile(new URL('../../public/parts/raspberry-pi-camera-3.glb', import.meta.url)));
  opening = openOffscreenWorker(
    fileURLToPath(new URL('./visibilityMatrixAcceptance.ts', import.meta.url)),
    'visibilityMatrixChecks',
    { signal: setup.signal },
  );
  worker = await opening;
}, 15000);

afterAll(async () => {
  await worker?.run({ close: true });
  setup.abort();
  await opening?.then(
    (opened) => opened.close(),
    () => undefined,
  );
});

it.each(VISIBILITY_WORKFLOWS)(
  'compares rendered camera placements for %s against constructed pixel regions and intervals',
  async (name) => {
    const index = VISIBILITY_WORKFLOWS.indexOf(name);
    const result = await worker.run<NonNullable<Awaited<ReturnType<typeof visibilityMatrixChecks>>>>({
      ...(await visibilityMatrixInput(index)),
      mesh,
    });

    expect(result.current.error).toBeUndefined();
    expect(result.candidate.error).toBeUndefined();
    expect(result.current.key).toBe(result.key);
    expect(result.candidate.key).toBe(result.key);

    if (index === 7) {
      expect(
        result.regions[0]!.map((value, i) => Math.abs(value - result.edge.bounds[i])).every((delta) => delta <= 2),
      ).toBe(true);
      expect(Math.abs(result.current.pairs[0].pixels[0]!.pixels - result.edge.pixels)).toBeLessThanOrEqual(
        2 * (result.edge.bounds[2] - result.edge.bounds[0] + result.edge.bounds[3] - result.edge.bounds[1]),
      );
      expect(result.current.pairs[0].pixels.every((pixels) => pixels && pixels.pixels > 0)).toBe(true);
      expect(result.candidate.pairs[0].pixels.every((pixels) => pixels?.pixels === 0)).toBe(true);
      expect(result.current.coverage).toBe(1);
      expect(result.candidate.coverage).toBe(0);
      expect(result.current.pairs[0].intervals).toEqual([]);
      expect(result.candidate.pairs[0].intervals).toEqual([{ from: 0, to: 4, state: 'outside' }]);

      return;
    }

    expect(result.current.pairs[0].pixels.map((pixels) => pixels?.pixels)).toEqual([1024, 0, 0, 512]);
    expect(result.current.pairs[0].intervals).toEqual([
      { from: 1, to: 2, state: 'outside' },
      { from: 2, to: 3, state: 'occluded' },
    ]);
    expect(result.regions.slice(0, 4)).toEqual([[144, 104, 176, 136], null, null, [144, 104, 160, 136]]);
    expect(result.candidate.pairs[0].pixels.every((pixels) => pixels?.pixels === 0)).toBe(true);
    expect(result.current.coverage).toBe(index === 6 ? 1 : 0.5);
  },
  15000,
);

it('keeps near-plane targets outside the image and accepts a bounded 256-part repeated-module scene', async () => {
  const result = await worker.run<NonNullable<Awaited<ReturnType<typeof visibilityMatrixChecks>>>>({
    ...(await visibilityMatrixInput(0, { near: true, repeat: true })),
    mesh,
  });

  expect(result.current.error).toBeUndefined();
  expect(result.current.coverage).toBe(0);
  expect(result.current.pairs[0].pixels.every((pixels) => pixels?.pixels === 0 && pixels.potential === 0)).toBe(true);
  expect(result.current.pairs[0].intervals).toEqual([{ from: 0, to: 4, state: 'outside' }]);
}, 15000);
