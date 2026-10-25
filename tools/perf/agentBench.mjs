#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { benchClient, openBenchPage, serveStatic, waitQuiet } from './benchPage.mjs';
import { transcriptUpdates } from './benchTranscript.mjs';
import { cadParts, cadSpec, fixtureScene } from './fixtureScene.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => (flag(name) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const outDir = path.resolve(option('dist', path.join(root, 'node_modules/.cache/perf-agent/dist')));
const budget = Number(option('budget', 0));
const only = option('only', '')?.split(',').filter(Boolean);
const gpu = !flag('cpu') && process.platform === 'darwin';

function buildApp() {
  if ((flag('no-build') || flag('dist')) && fs.existsSync(outDir)) return;

  const built = spawnSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn'], {
    cwd: root,
    stdio: 'inherit',
  });

  if (built.status !== 0) process.exit(built.status ?? 1);
}

buildApp();

const scene = fixtureScene();
const { joints, ...record } = scene;
const triangles = record.parts.reduce((n, p) => n + p.cad.indices.length / 3, 0);
const server = await serveStatic(outDir);
const app = await openBenchPage({ url: server.url, scene: record, gpu });
const client = benchClient(app);
const loadMs = await waitQuiet(app.page);

await client.request('define_joints', { joints, replace: true });
await waitQuiet(app.page, { quietMs: 2000 });
await app.page.getByRole('tab', { name: 'Agent' }).first().click();
await app.page.waitForTimeout(1000);

const updates = transcriptUpdates();

async function stream(ms) {
  const end = Date.now() + ms;
  let sent = 0;

  while (Date.now() < end) {
    await client.emit([{ type: 'acp-session-update', workspaceId: 'main', update: updates.next().value }]);
    sent++;
    await new Promise((r) => setTimeout(r, 25));
  }

  return { ms: Date.now() - end + ms, updates: sent };
}

const shells = cadParts(record);
let copies = 0;

async function modelPart() {
  const part = cadSpec(shells[copies % shells.length], `bench-copy-${++copies}`);
  const placed = await client.request('apply', { ops: [{ op: 'add', part }] });
  const clash = await client.request('interference', { ids: [part.id] });

  return { ms: placed.ms + clash.ms };
}

const PHASES = [
  ['idle', () => app.page.waitForTimeout(2000).then(() => ({ ms: 2000 }))],
  ['stream', () => stream(8000)],
  ['snapshot', () => client.request('snapshot', {})],
  ['model_part', modelPart],
  ['look', () => client.request('screenshot', { views: ['front', 'side', 'top', 'iso'] })],
  [
    'look_ids',
    () => client.request('screenshot', { views: ['iso', 'front'], ids: shells.slice(0, 4).map((p) => p.id) }),
  ],
  ['check_scene', () => client.request('interference', {})],
  ['get_bom', () => client.request('bom', {})],
  ['check_printability', () => client.request('printability', {})],
  ['verify_design', () => client.request('verify', {})],
];

const rows = [];
const profiled = option('profile', '');
const cdp = profiled ? await app.page.context().newCDPSession(app.page) : null;

async function profile(name, run) {
  if (name !== profiled) return client.measure(run);

  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');

  const measured = await client.measure(run);
  const file = path.join(path.dirname(outDir), `${name}.cpuprofile`);

  fs.writeFileSync(file, JSON.stringify((await cdp.send('Profiler.stop')).profile));
  console.log(`Profile: ${file}`);

  return measured;
}

for (const [name, run] of PHASES.filter(([n]) => !only.length || only.includes(n))) {
  const { result, ...stats } = await profile(name, run);

  rows.push({ phase: name, toolMs: result.ms, ...stats, ...(result.error ? { error: result.error } : {}) });
}

console.log(
  `Fixture: ${record.parts.length} parts, ${Math.round(triangles / 1000)}k triangles, ${joints.length} joints.` +
    ` Loaded in ${loadMs} ms (${gpu ? 'GPU' : 'SwiftShader'}).`,
);
console.table(rows);

if (app.errors.length) console.log('Page errors:', app.errors);

if (flag('json')) fs.writeFileSync(option('json'), JSON.stringify(rows, null, 1));

await app.browser.close();
server.close();

const over = rows.filter((r) => budget && r.longMax > budget);

if (over.length) {
  console.log(`Over the ${budget} ms budget: ${over.map((r) => `${r.phase} (${r.longMax} ms)`).join(', ')}`);
  process.exit(1);
}
