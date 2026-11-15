import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { parseArgs } from 'node:util';
import { build } from 'vite';
import { chromium } from 'playwright-core';

const { values } = parseArgs({
  options: {
    models: { type: 'string' },
    image: { type: 'string' },
    output: { type: 'string', default: 'scratch/segmentation-acceptance.json' },
  },
});

if (!values.models || !values.image)
  throw new Error('Supply --models <pinned ONNX folder> and --image <Meta SAM 2 notebooks/images/truck.jpg>.');

const names = ['vision_encoder', 'mask_decoder', 'memory_encoder', 'memory_attention', 'pointer_tpos'];
const resources = new Map([['/image.jpg', { bytes: await fs.readFile(values.image), type: 'image/jpeg' }]]);

for (const name of names)
  resources.set(`/${name}.onnx`, {
    bytes: await fs.readFile(path.join(values.models, `${name}.onnx`)),
    type: 'application/octet-stream',
  });

for (const name of ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm'])
  resources.set(`/ort/${name}`, {
    bytes: await fs.readFile(path.join('node_modules/onnxruntime-web/dist', name)),
    type: name.endsWith('.mjs') ? 'text/javascript' : 'application/wasm',
  });

const result = await build({
  configFile: false,
  logLevel: 'silent',
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    write: false,
    minify: false,
    lib: { entry: 'src/vision/segmentationAcceptance.ts', formats: ['es'] },
    rolldownOptions: { output: { codeSplitting: false } },
  },
});
const output = Array.isArray(result) ? result[0] : result;
const chunk = output.output.find((item) => item.type === 'chunk');

if (!chunk) throw new Error('The segmentation benchmark bundle is missing.');

resources.set('/bench.js', { bytes: Buffer.from(chunk.code), type: 'text/javascript' });
resources.set('/', { bytes: Buffer.from('<!doctype html><title>Segmentation acceptance</title>'), type: 'text/html' });

const server = createServer((request, response) => {
  const resource = resources.get(request.url);

  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  response.setHeader('content-type', resource?.type ?? 'text/plain');
  response.writeHead(resource ? 200 : 404);
  response.end(resource?.bytes ?? 'Not found');
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

let browser;

try {
  browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'],
  });

  const page = await browser.newPage();

  page.on('console', (message) => process.stdout.write(`${message.text()}\n`));
  await page.goto(`http://127.0.0.1:${server.address().port}`);

  const report = await page.evaluate(async (graphs) => {
    const { runSegmentationAcceptance } = await import('/bench.js');
    const models = Object.fromEntries(
      await Promise.all(
        graphs.map(async (name) => [name, new Uint8Array(await (await fetch(`/${name}.onnx`)).arrayBuffer())]),
      ),
    );
    const jpeg = new Uint8Array(await (await fetch('/image.jpg')).arrayBuffer());

    return runSegmentationAcceptance({
      models,
      jpeg,
      onProgress: (measurement) => console.log(JSON.stringify(measurement)),
    });
  }, names);

  await fs.mkdir(path.dirname(values.output), { recursive: true });
  await fs.writeFile(values.output, JSON.stringify({ date: new Date().toISOString(), ...report }, null, 2));
  process.stdout.write(
    `Passed ${report.frames.length} real SAM 2 frames. Minimum translated-mask IoU ${Math.min(...report.frames.map((frame) => frame.iou)).toFixed(4)}.\n`,
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
