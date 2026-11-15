import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import { applyMeasurements, benchmarkDevice } from './measurements.mjs';
import { createServer } from 'vite';
import sharp from 'sharp';
import * as ort from 'onnxruntime-web/wasm';

const { values } = parseArgs({
  options: {
    device: { type: 'string' },
    image: { type: 'string' },
    models: { type: 'string' },
    output: { type: 'string', default: 'scratch/vision-benchmark.json' },
    write: { type: 'boolean', default: false },
  },
});

benchmarkDevice(values.device);

if (!values.image || !values.models) {
  throw new Error('Supply --device mac|pi5 --image <image> --models <folder with model IDs as ONNX filenames>.');
}

ort.env.wasm.numThreads = 1;

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  const { VisionEngine } = await server.ssrLoadModule('/src/vision/engine.ts');
  const { VISION_MODELS } = await server.ssrLoadModule('/src/vision/catalogue.ts');
  const image = await sharp(values.image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = { data: new Uint8ClampedArray(image.data), width: image.info.width, height: image.info.height };
  const engine = new VisionEngine((bytes) => ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] }));
  const measurements = [];

  try {
    for (const manifest of VISION_MODELS) {
      const bytes = await fs.readFile(path.join(values.models, `${manifest.id}.onnx`));

      await engine.load(manifest, new Uint8Array(bytes));
      await engine.infer(manifest.id, pixels);

      const samplesMs = await measure(engine, manifest.id, pixels);

      const medianMs = [...samplesMs].sort((a, b) => a - b)[1];
      const measured = { modelId: manifest.id, sha256: manifest.model.sha256, samplesMs, medianMs };

      measurements.push(measured);
      process.stdout.write(`${manifest.id} ${medianMs.toFixed(2)} ms\n`);
      await engine.remove(manifest.id);
    }
  } finally {
    await engine.close();
  }

  const result = {
    device: values.device,
    date: new Date().toISOString(),
    platform: `${os.platform()} ${os.arch()}`,
    cpu: os.cpus()[0]?.model,
    backend: 'onnxruntime-web WASM, one thread',
    image: { width: pixels.width, height: pixels.height },
    measurements,
  };

  await fs.mkdir(path.dirname(values.output), { recursive: true });
  await fs.writeFile(values.output, `${JSON.stringify(result, null, 2)}\n`);

  if (values.write) {
    const file = fileURLToPath(new URL('../../src/routines/nodes.ts', import.meta.url));
    const source = await fs.readFile(file, 'utf8');
    const options = await prettier.resolveConfig(file);
    const updated = applyMeasurements(source, result);

    await fs.writeFile(file, await prettier.format(updated, { ...options, parser: 'typescript' }));
  }
} finally {
  await server.close();
}

async function measure(engine, model, pixels) {
  const samples = [];

  for (let index = 0; index < 3; index++) {
    const start = performance.now();

    await engine.infer(model, pixels);
    samples.push(performance.now() - start);
  }

  return samples;
}
