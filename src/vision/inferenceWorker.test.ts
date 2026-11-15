import crypto from 'node:crypto';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { build } from 'vite';
import { chromium } from 'playwright-core';
import { inputSensitiveDetectionOnnx } from './onnxFixture';
import type { VisionManifest } from './manifest';
import type { VisionResult } from './types';

async function inferenceWorkerFiles() {
  const built = await build({
    configFile: false,
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
      write: false,
      minify: false,
      assetsInlineLimit: 0,
      rolldownOptions: {
        input: resolve(import.meta.dirname, 'inference.worker.ts'),
        output: { codeSplitting: false, entryFileNames: 'worker.js' },
      },
    },
  });
  const output = Array.isArray(built) ? built[0] : built;

  if (!('output' in output)) throw new Error('Expected the compiled inference worker.');

  return new Map(
    output.output.map((item) => [
      `/${item.fileName}`,
      {
        bytes: item.type === 'chunk' ? item.code : item.source,
        type: item.fileName.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
      },
    ]),
  );
}

function manifestOf(bytes: Uint8Array): VisionManifest {
  return {
    version: 1,
    id: 'worker-pixel-detection',
    kind: 'detect',
    adapter: 'generic',
    classes: ['cup'],
    input: { width: 2, height: 2, layout: 'nchw', mean: [0, 0, 0], std: [1, 1, 1] },
    model: {
      owner: 'test',
      repo: 'tiny',
      revision: 'a'.repeat(40),
      file: 'model.onnx',
      bytes: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    },
  };
}

async function openInferenceWorker() {
  const files = await inferenceWorkerFiles();
  const server = createServer((request, response) => {
    const file = files.get(request.url ?? '/');

    response.setHeader('content-type', file?.type ?? 'text/html');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    response.end(file?.bytes ?? '<!doctype html><title>Inference worker test</title>');
  });

  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));

  const graphics =
    process.platform === 'darwin'
      ? ['--use-angle=metal', '--enable-gpu']
      : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [...graphics, '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'],
  });

  try {
    const address = server.address();

    if (!address || typeof address === 'string') throw new Error('Expected the inference test server port.');

    const page = await browser.newPage();

    await page.goto(`http://127.0.0.1:${address.port}`);

    return {
      page,
      close: async () => {
        await browser.close();
        await new Promise<void>((done) => server.close(() => done()));
      },
    };
  } catch (error) {
    await browser.close();
    await new Promise<void>((done) => server.close(() => done()));

    throw error;
  }
}

let app: Awaited<ReturnType<typeof openInferenceWorker>>;

beforeAll(async () => {
  app = await openInferenceWorker();
});

afterAll(async () => {
  await app?.close();
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

        return { gpu, dark, light };
      } finally {
        worker.terminate();
      }
    },
    { model: manifestOf(bytes), supplied: [...bytes] },
  );

  expect(results.dark.detections).toEqual([]);
  expect(results.light.detections).toHaveLength(1);
  expect(results.light.detections[0].label).toBe('cup');
  expect(results.light.backend).toBe(results.gpu ? 'webgpu' : 'wasm');
});
