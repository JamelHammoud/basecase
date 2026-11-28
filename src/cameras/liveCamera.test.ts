import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { openInferenceWorker } from '../vision/inferenceWorkerFixture';
import { inputSensitiveDetectionOnnx } from '../vision/onnxFixture';
import { simulatedCameraFixture, visionManifest } from '../../e2e/visionFixtures';
import type { observeCamera } from './liveCameraAcceptance';

let app: Awaited<ReturnType<typeof openInferenceWorker>>;
const setup = new AbortController();
let opening: ReturnType<typeof openInferenceWorker>;

beforeAll(async () => {
  opening = openInferenceWorker(setup.signal, fileURLToPath(new URL('./liveCameraAcceptance.ts', import.meta.url)));
  app = await opening;
});

afterAll(async () => {
  setup.abort();
  await opening?.then(
    (opened) => opened.close(),
    () => undefined,
  );
});

it.each(['scene scope', 'simulation link'] as const)(
  'delivers rendered detections after replacing the %s with unchanged camera inputs',
  async (change) => {
    const scene = simulatedCameraFixture();
    const bytes = inputSensitiveDetectionOnnx();

    await app.page.addScriptTag({ url: '/worker.js', type: 'module' });

    const result = await app.page.evaluate(
      async (input) => {
        const module = window as unknown as { observeCamera: typeof observeCamera };

        return module.observeCamera(input);
      },
      {
        parts: scene.parts,
        cameras: scene.project.cameras,
        manifest: visionManifest(bytes, 'block'),
        bytes: [...bytes],
        change,
      },
    );

    expect(result.value.detections).toHaveLength(1);
    expect(result.value.detections[0].label).toBe('block');
    result.value.detections[0].box.forEach((value, i) => expect(value).toBeCloseTo([0.1, 0.2, 0.3, 0.4][i]));
    expect(result.signals['vision.target_camera.block']).toBe(1);
    expect(result.assignments).toEqual([
      expect.objectContaining({ camera: 'target_camera', fps: 10, continuous: true }),
    ]);
    expect(result.frames).toBeGreaterThan(0);
  },
);
