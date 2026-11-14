import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { registerHooks } from 'node:module';
import { ModelStore } from '../../electron/hub/modelRepo.mjs';
import { HUB_ENDPOINT, HubClient } from '../../electron/hub/hubClient.mjs';
import { publicFetch } from '../../electron/publicFetch.mjs';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith('.') || path.extname(specifier) || !context.parentURL)
      return nextResolve(specifier, context);

    const candidate = new URL(`${specifier}.ts`, context.parentURL);

    return nextResolve(fs.existsSync(candidate) ? candidate.href : specifier, context);
  },
});

const { VisionEngine } = await import('../../src/vision/engine.ts');
const { VISION_MODELS } = await import('../../src/vision/manifest.ts');
const args = process.argv.slice(2);
const fixture = args.includes('--fixture');
const ids = args.filter((argument) => argument !== '--fixture');
const cache = new ModelStore({
  dir: path.resolve('scratch/perf/vision-models'),
  client: () => new HubClient({ endpoint: HUB_ENDPOINT, kind: 'model', outbound: publicFetch }),
});

async function modelBytes(model) {
  if (fixture) return (await import('../../src/vision/testModel.ts')).testVisionModel();

  await cache.prepare(model);

  return new Uint8Array(fs.readFileSync(cache.asset(model.sha256).file));
}

function cameraFrame() {
  const width = 640;
  const height = 480;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let index = 0; index < data.length; index++) data[index] = index % 255;

  return { width, height, data };
}

async function measure(model) {
  const bytes = await modelBytes(model);
  const engine = new VisionEngine();
  const frame = cameraFrame();
  const loadStart = performance.now();

  try {
    await engine.load(model, bytes, { backend: 'wasm' });

    const loadMs = performance.now() - loadStart;
    const samplesMs = [];

    for (let index = 0; index < 4; index++) {
      const result = await engine.infer(model.id, frame, { camera: 'benchmark', timestamp: index });

      if (index) samplesMs.push(result.elapsedMs);
    }

    return {
      id: model.id,
      sha256: model.sha256,
      inputSize: model.inputSize,
      backend: 'wasm',
      loadMs,
      samplesMs,
      medianMs: [...samplesMs].sort((a, b) => a - b)[1],
    };
  } finally {
    await engine.dispose();
  }
}

const selected = fixture
  ? [(await import('../../src/vision/testModel.ts')).TEST_VISION_MANIFEST]
  : VISION_MODELS.filter((model) => !ids.length || ids.includes(model.id));

if (!selected.length || (!fixture && ids.some((id) => !VISION_MODELS.some((model) => model.id === id))))
  throw new Error('Choose a vision model id from manifest.ts.');

const report = {
  device: os.cpus()[0]?.model ?? 'Unknown CPU',
  platform: process.platform,
  arch: process.arch,
  runtime: 'onnxruntime-web 1.31.1',
  threads: 1,
  sourceSize: [640, 480],
  source: 'Synthetic RGBA ramp',
  warmup: 1,
  samples: 3,
  fixture,
  models: [],
};

for (const model of selected) {
  process.stdout.write(`Measuring ${model.name}\n`);

  const measurement = await measure(model);

  report.models.push(measurement);
  process.stdout.write(`${JSON.stringify(measurement)}\n`);
}

const output = path.resolve(`scratch/perf/vision-${fixture ? 'fixture' : 'wasm'}.json`);

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
