import crypto from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { openInferenceWorker } from './inferenceWorkerFixture';
import { inputSensitiveDetectionOnnx } from './onnxFixture';
import type { VisionManifest } from './manifest';
import type { VisionResult } from './types';

function manifestOf(bytes: Uint8Array): VisionManifest {
  return {
    version: 1,
    id: 'worker-pixel-detection',
    kind: 'detect',
    adapter: 'generic',
    classes: ['cup'],
    input: { width: 2, height: 2, layout: 'nchw', mean: [0, 0, 0], std: [1, 1, 1] },
    model: {
      source: 'local',
      bytes: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    },
  };
}

let app: Awaited<ReturnType<typeof openInferenceWorker>>;
const setup = new AbortController();
let opening: ReturnType<typeof openInferenceWorker>;

beforeAll(async () => {
  opening = openInferenceWorker(setup.signal);
  app = await opening;
});

afterAll(async () => {
  setup.abort();
  await opening?.then(
    (opened) => opened.close(),
    () => undefined,
  );
});

it('runs pixel-sensitive detection in the compiled production inference worker', async () => {
  const bytes = inputSensitiveDetectionOnnx();
  const results = await app.page.evaluate(
    async ({ model, supplied }) => {
      const gpu = Boolean(await navigator.gpu?.requestAdapter());
      const worker = new Worker('/worker.js', { type: 'module' });
      let sequence = 0;
      const request = <T>(message: object): Promise<T> =>
        new Promise((done, refuse) => {
          const id = ++sequence;

          worker.onmessage = ({ data }) => {
            if (data.id !== id) return;

            if (data.error) refuse(new Error(data.error));
            else done(data.result);
          };
          worker.onerror = (event) => refuse(new Error(event.message));
          worker.postMessage({ ...message, id });
        });

      try {
        await request({ type: 'load', manifest: model, bytes: Uint8Array.from(supplied) });

        const frame = { width: 2, height: 2, data: new Uint8ClampedArray(16) };
        const dark = await request<VisionResult>({ type: 'infer', modelId: model.id, frame });
        const light = await request<VisionResult>({
          type: 'infer',
          modelId: model.id,
          frame: { ...frame, data: new Uint8ClampedArray(16).fill(255) },
        });

        const canvas = new OffscreenCanvas(2, 2);
        const context = canvas.getContext('2d')!;

        context.fillStyle = 'white';
        context.fillRect(0, 0, 2, 2);

        const jpeg = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg' })).arrayBuffer());
        const encoded = await request<{ result: VisionResult; inferenceMs: number }>({
          type: 'infer-encoded',
          modelId: model.id,
          jpeg,
          options: { camera: 'wrist', timestamp: 42 },
        });
        let refusedCorrupt = false;

        try {
          await request({ type: 'infer-encoded', modelId: model.id, jpeg: new Uint8Array([1, 2, 3]) });
        } catch {
          refusedCorrupt = true;
        }

        return { gpu, dark, light, encoded, refusedCorrupt };
      } finally {
        worker.terminate();
      }
    },
    { model: manifestOf(bytes), supplied: [...bytes] },
  );

  expect(results.dark.detections).toEqual([]);
  expect(results.light.detections).toHaveLength(1);
  expect(results.light.detections[0].label).toBe('cup');
  expect(results.encoded.result.detections).toEqual(results.light.detections);
  expect(results.encoded.result.camera).toBe('wrist');
  expect(results.encoded.result.timestamp).toBe(42);
  expect(results.encoded.inferenceMs).toBeGreaterThanOrEqual(0);
  expect(results.refusedCorrupt).toBe(true);
  expect(results.light.backend).toBe(results.gpu ? 'webgpu' : 'wasm');
});
