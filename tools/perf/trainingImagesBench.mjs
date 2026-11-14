#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBenchPage, serveStatic, waitQuiet } from './benchPage.mjs';
import { assertTrainingImagesBudget } from './trainingImagesBudget.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => (flag(name) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const outDir = path.resolve(option('dist', path.join(root, 'node_modules/.cache/perf-training-images/dist')));
const gpu = !flag('cpu') && process.platform === 'darwin';

function buildApp() {
  if ((flag('no-build') || flag('dist')) && fs.existsSync(outDir)) return;

  const built = spawnSync(
    process.execPath,
    [
      path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
      'build',
      '--outDir',
      outDir,
      '--emptyOutDir',
      '--logLevel',
      'warn',
    ],
    { cwd: root, stdio: 'inherit' },
  );

  if (built.status !== 0) process.exit(built.status ?? 1);
}

async function runBenchmark(page) {
  let timer;

  try {
    return await Promise.race([
      page.evaluate(() => window.__studio.trainingLabelBenchmark()),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Training image benchmark exceeded 150 seconds.')), 150000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

buildApp();

const scene = {
  id: 'training-images-bench',
  name: 'Training images',
  globalGoal: '',
  updatedAt: new Date(0).toISOString(),
  parts: [],
  annotations: [],
};
const server = await serveStatic(outDir);
let app;

try {
  app = await openBenchPage({
    url: server.url,
    scene,
    gpu,
    probes: () => {
      window.__basecaseTestHooks = true;
    },
  });
  await app.page.waitForFunction(() => typeof window.__studio?.trainingLabelBenchmark === 'function');
  await waitQuiet(app.page);

  const result = await runBenchmark(app.page);

  assertTrainingImagesBudget(result);
  assert.deepEqual(app.errors, []);
  console.log(
    `${result.frames} labelled ${result.width} × ${result.height} frames in ${(result.milliseconds / 1000).toFixed(2)} s ` +
      `(${gpu ? 'Metal' : 'SwiftShader'}), 500 boxes within one pixel.`,
  );
} finally {
  await app?.browser.close();
  server.close();
}
