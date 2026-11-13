#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBenchApp, openBenchPage, serveStatic, waitQuiet } from './benchPage.mjs';
import { threadTasks } from './benchTrace.mjs';
import { ellipsoid } from './fixtureMeshes.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => (flag(name) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const outDir = path.resolve(option('dist', path.join(root, 'node_modules/.cache/perf-boolean/dist')));
const runs = Number(option('runs', 4));
const budget = Number(option('budget', 16));
const gpu = !flag('cpu') && process.platform === 'darwin';
const DETAIL = 113;
const RADIUS = 30;

function sphere(id, x) {
  const { positions, indices } = ellipsoid([0, 0, 0], [RADIUS, RADIUS, RADIUS], DETAIL);
  const size = RADIUS * 2;

  return {
    id,
    name: id,
    kind: 'mesh',
    category: 'custom_models',
    role: 'solid',
    position: [x, RADIUS, 0],
    rotation: [0, 0, 0],
    dimensions: { width: size, height: size, depth: size },
    color: '#888888',
    note: '',
    visible: true,
    locked: false,
    mesh: { positions, indices, baseSize: [size, size, size] },
  };
}

const scene = {
  id: 'perf-boolean',
  name: 'Boolean bench',
  globalGoal: '',
  updatedAt: new Date(0).toISOString(),
  parts: [],
  annotations: [],
};

const hasResult = () =>
  window.__studio.sceneRecord().parts.some((p) => p.kind === 'boolean' && p.mesh?.positions.length > 0);

async function subtract(app, run) {
  const { page, browser } = app;
  const parts = [sphere('a', 0), sphere('b', 25 + run)];

  await page.evaluate((record) => window.__studio.load(record), { name: scene.name, parts });
  await waitQuiet(page, { quietMs: 1500 });
  await page.evaluate(() => window.__studio.select(['a', 'b']));
  await page.keyboard.press('Meta+k');
  await page.keyboard.type('Subtract');
  await page.waitForTimeout(500);
  await browser.startTracing(page, { categories: ['toplevel', '__metadata'] });

  const start = Date.now();

  await page.keyboard.press('Enter');
  await page.waitForFunction(hasResult, null, { polling: 20, timeout: 60000 });

  const resultMs = Date.now() - start;

  await page.waitForTimeout(500);

  const trace = await browser.stopTracing();
  const main = threadTasks(trace, { process: /Renderer/, thread: /CrRendererMain/ });
  const worker = threadTasks(trace, { process: /Renderer/, thread: /DedicatedWorker/ });

  return {
    triangles: parts[0].mesh.indices.length / 3,
    resultMs,
    mainLongest: Math.round(Math.max(0, ...main) * 10) / 10,
    mainOverBudget: main.filter((ms) => ms >= budget).length,
    workerLongest: Math.round(Math.max(0, ...worker)),
  };
}

buildBenchApp({ root, outDir, reuse: flag('no-build') || flag('dist') });

const server = await serveStatic(outDir);
const app = await openBenchPage({ url: server.url, scene, gpu, testHooks: true });

await waitQuiet(app.page);

const rows = [];

for (let run = 0; run < runs; run++) rows.push(await subtract(app, run));

const best = Math.min(...rows.map((r) => r.mainLongest));

console.log(`Subtract 2 × ${rows[0].triangles} triangles, ${runs} runs (${gpu ? 'Metal' : 'SwiftShader'}).`);
console.table(rows);

if (app.errors.length) console.log('Page errors:', app.errors);

await app.browser.close();
server.close();

if (best >= budget) {
  console.log(`The main thread held a task of ${best} ms in every run, over the ${budget} ms budget.`);
  process.exit(1);
}
