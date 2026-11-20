import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { webOnnxAssets } from './webOnnxAssets.ts';

const root = path.resolve(import.meta.dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8')).packages[
  'node_modules/onnxruntime-web'
].version;
let fixture;

beforeEach(() => {
  fs.mkdirSync(path.join(root, 'scratch'), { recursive: true });
  fixture = fs.mkdtempSync(path.join(root, 'scratch/web-onnx-'));
  fs.writeFileSync(
    path.join(fixture, 'main.js'),
    "new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });",
  );
  fs.writeFileSync(
    path.join(fixture, 'worker.js'),
    [
      "import { env } from 'onnxruntime-web/webgpu';",
      "import wasm from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';",
      "import mjs from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';",
      'env.wasm.wasmPaths = { wasm, mjs };',
      'postMessage({ wasm, mjs });',
    ].join('\n'),
  );
});

afterEach(() => fs.rmSync(fixture, { recursive: true, force: true }));

async function bundle(web) {
  const plugins = () => (web ? [webOnnxAssets()] : []);
  const result = await build({
    root: fixture,
    configFile: false,
    logLevel: 'silent',
    plugins: plugins(),
    worker: { plugins },
    build: {
      write: false,
      assetsInlineLimit: 0,
      rollupOptions: { input: path.join(fixture, 'main.js') },
    },
  });

  return result.output;
}

describe('ONNX assets in real Vite worker builds', () => {
  it('uses the matching CDN binary on web and keeps the module local', async () => {
    const files = await bundle(true);
    const worker = files.find((file) => /worker-[^.]+\.js$/.test(file.fileName));

    expect(String(worker.source)).toContain(
      `https://cdn.jsdelivr.net/npm/onnxruntime-web@${version}/dist/ort-wasm-simd-threaded.asyncify.wasm`,
    );
    expect(String(worker.source)).not.toMatch(/\/assets\/ort-wasm-simd-threaded\.asyncify-[\w-]+\.wasm/);
    expect(files.some((file) => file.fileName.endsWith('.wasm'))).toBe(false);
    expect(files.some((file) => /ort-wasm-simd-threaded\.asyncify-.+\.mjs$/.test(file.fileName))).toBe(true);
  });

  it('keeps both runtime files local in desktop builds', async () => {
    const files = await bundle(false);
    const worker = files.find((file) => /worker-[^.]+\.js$/.test(file.fileName));
    const binary = files.find((file) => file.fileName.endsWith('.wasm'));

    expect(String(worker.source)).not.toContain('cdn.jsdelivr.net');
    expect(binary.source.byteLength).toBeGreaterThan(25 * 1024 * 1024);
    expect(files.some((file) => /ort-wasm-simd-threaded\.asyncify-.+\.mjs$/.test(file.fileName))).toBe(true);
  });
});
