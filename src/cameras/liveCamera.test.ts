import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { openInferenceWorker } from '../vision/inferenceWorkerFixture';
import { inputSensitiveDetectionOnnx } from '../vision/onnxFixture';
import { simulatedCameraFixture, visionManifest } from '../../e2e/visionFixtures';
import type { mountCamera } from './liveCameraFixture';

let app: Awaited<ReturnType<typeof openInferenceWorker>>;
const setup = new AbortController();
let opening: ReturnType<typeof openInferenceWorker>;

type Mounted = Awaited<ReturnType<typeof mountCamera>>;

type BrowserFixture = { mountCamera: typeof mountCamera; camera: Mounted };

beforeAll(async () => {
  opening = openInferenceWorker(setup.signal, fileURLToPath(new URL('./liveCameraFixture.ts', import.meta.url)));
  app = await opening;
  await app.page.addScriptTag({ url: '/worker.js', type: 'module' });
});

afterEach(async () => {
  await app?.page.evaluate(() => (window as unknown as BrowserFixture).camera?.close());
});

afterAll(async () => {
  setup.abort();
  await opening?.then(
    (opened) => opened.close(),
    () => undefined,
  );
});

async function mountFixture() {
  const scene = simulatedCameraFixture();
  const bytes = inputSensitiveDetectionOnnx();

  await app.page.evaluate(
    async (input) => {
      const fixture = window as unknown as BrowserFixture;

      fixture.camera = await fixture.mountCamera(input);
      await fixture.camera.configure();
    },
    {
      parts: scene.parts,
      cameras: scene.project.cameras,
      manifest: visionManifest(bytes, 'block'),
      bytes: [...bytes],
    },
  );
}

it.each(['scene scope', 'simulation link'] as const)(
  'keeps pixel-sensitive inference after replacing the %s with identical inputs',
  async (kind) => {
    await mountFixture();

    const state = () => app.page.evaluate(() => (window as unknown as BrowserFixture).camera.state());

    await app.page.evaluate(() => (window as unknown as BrowserFixture).camera.wait());
    expect((await state()).signals['vision.target_camera.block']).toBe(1);
    await app.page.evaluate(async (change) => {
      const { camera } = window as unknown as BrowserFixture;

      camera.replace(change);
      await camera.configure();
    }, kind);
    await app.page.evaluate(() => (window as unknown as BrowserFixture).camera.wait());
    expect((await state()).signals['vision.target_camera.block']).toBe(1);

    const result = await state();

    expect(result.frames).toBeGreaterThan(0);
    expect(result.connected).toBe(true);
    expect(result.error).toBeNull();
    expect(result.assignments).toEqual([expect.objectContaining({ fps: 10, continuous: true })]);
    expect(result.result!.backend).toBe('wasm');
    expect(result.result!.width).toBeGreaterThan(0);
    expect(result.result!.height).toBeGreaterThan(0);
    expect(result.result!.detections).toHaveLength(1);
    expect(result.result!.detections[0].label).toBe('block');
    expect(result.result!.detections[0].score).toBeGreaterThan(0.25);
    expect(result.result!.detections[0].score).toBeLessThanOrEqual(1);
    result.result!.detections[0].box.forEach((value, i) => expect(value).toBeCloseTo([0.1, 0.2, 0.3, 0.4][i]));
  },
);

it('continues pixel-sensitive inference through the hidden consumer after the visible tile unmounts', async () => {
  await mountFixture();
  await app.page.evaluate(() => (window as unknown as BrowserFixture).camera.wait());
  await app.page.evaluate(() => (window as unknown as BrowserFixture).camera.hideTile());
  await app.page.evaluate(() => (window as unknown as BrowserFixture).camera.wait());

  const state = await app.page.evaluate(() => (window as unknown as BrowserFixture).camera.state());

  expect(state.frames).toBe(0);
  expect(state.connected).toBe(true);
  expect(state.error).toBeNull();
  expect(state.result!.backend).toBe('wasm');
  expect(state.result!.detections).toEqual([expect.objectContaining({ label: 'block', score: expect.any(Number) })]);
  expect(state.signals['vision.target_camera.block']).toBe(1);
  expect(state.assignments).toEqual([expect.objectContaining({ fps: 10, continuous: true })]);
  await app.page.evaluate(() => (window as unknown as BrowserFixture).camera.showTile());
  await app.page.evaluate(() => (window as unknown as BrowserFixture).camera.wait());

  const resumed = await app.page.evaluate(() => (window as unknown as BrowserFixture).camera.state());

  expect(resumed.connected).toBe(true);
  expect(resumed.frames).toBeGreaterThan(0);
  expect(resumed.signals['vision.target_camera.block']).toBe(1);
});
