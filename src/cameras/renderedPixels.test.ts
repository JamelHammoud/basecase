import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { openOffscreenWorker, type OffscreenTestWorker } from '../../tools/testing/offscreenWorker';
import { simulatedCameraFixture, visionManifest } from '../../e2e/visionFixtures';
import { inputSensitiveDetectionOnnx } from '../vision/onnxFixture';
import type { renderedPixels } from './renderedPixelsAcceptance';

let worker: OffscreenTestWorker;
const setup = new AbortController();
let opening: Promise<OffscreenTestWorker>;

beforeAll(async () => {
  opening = openOffscreenWorker(
    fileURLToPath(new URL('./renderedPixelsAcceptance.ts', import.meta.url)),
    'renderedPixels',
    { signal: setup.signal },
  );
  worker = await opening;
});

afterAll(async () => {
  setup.abort();
  await opening?.then(
    (opened) => opened.close(),
    () => undefined,
  );
});

it('preserves rendered stationary-camera pixels for inference when the visible tile transfers', async () => {
  const scene = simulatedCameraFixture();
  const model = visionManifest(inputSensitiveDetectionOnnx()).input;
  const result = await worker.run<Awaited<ReturnType<typeof renderedPixels>>>({
    parts: scene.parts,
    cameras: scene.project.cameras,
    model,
  });

  expect([result.width, result.height]).toEqual([320, 240]);
  expect(result.samples).toHaveLength(12);
  expect(result.samples.every((value) => Number.isFinite(value) && value > 0.0625)).toBe(true);
});
