#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { ROBOTS } from './robots.mjs';
import { parseStl } from './geometry.mjs';
import { scoreModels, writeOverlay } from './score.mjs';
import { scoreAgainstDrawing, writeDrawingOverlay } from './drawing.mjs';
import { judgeRun } from './judge.mjs';
import { createEventHandler, sseDataReader } from './run-events.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const args = process.argv.slice(2);
const robot = args[0];
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);

  return i >= 0 ? args[i + 1] : def;
};
const port = Number(opt('port', 5174));
const runName = opt('run', new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'));

if (!ROBOTS[robot]) {
  console.error(`Unknown robot. Choose: ${Object.keys(ROBOTS).join(', ')}`);
  process.exit(1);
}

const out = path.join(here, 'runs', runName, robot);

fs.mkdirSync(out, { recursive: true });

const logFile = fs.createWriteStream(path.join(out, 'events.jsonl'));
const started = Date.now();
const log = (...a) => console.log(`[${robot} ${((Date.now() - started) / 1000).toFixed(0)}s]`, ...a);
const base = `http://127.0.0.1:${port}`;

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body));
    const req = http.request(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } },
      (res) => {
        let text = '';

        res.on('data', (c) => (text += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(text));
          } catch {
            resolve({ error: text.slice(0, 500) });
          }
        });
      },
    );

    req.setTimeout(0);
    req.on('error', reject);
    req.end(data);
  });
}

const givenApp = opt('app', null);
const app = givenApp ? path.resolve(givenApp) : fs.mkdtempSync(path.join(os.tmpdir(), `studio-bench-${robot}-`));

if (!givenApp) {
  for (const f of [
    'src',
    'electron',
    'vendor',
    'public',
    'index.html',
    'vite.config.ts',
    'package.json',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.node.json',
    'tsconfig.e2e.json',
  ].filter((f) => fs.existsSync(path.join(root, f))))
    fs.cpSync(path.join(root, f), path.join(app, f), { recursive: true });

  fs.symlinkSync(path.join(root, 'node_modules'), path.join(app, 'node_modules'), 'dir');
}

{
  const check = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      [
        "const { renderPart } = await import('./electron/cad-kernel/client.mjs');",
        "const a = await renderPart('openscad', 'include <robotics.scad>\\ncuboid(10, rounding=2);');",
        "const b = await renderPart('replicad', 'return makeBox([0,0,0],[5,5,5]);');",
        "process.stdout.write(JSON.stringify([a.ok !== false && !a.error, b.ok !== false && !b.error, a.error || b.error || '']));",
        'process.exit(0);',
      ].join('\n'),
    ],
    { cwd: app, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let outText = '';

  check.stdout.on('data', (d) => (outText += d));
  await new Promise((r) => check.on('close', r));

  let ok = false;

  try {
    const [a, b, msg] = JSON.parse(outText);

    ok = a && b;

    if (!ok) console.error(`CAD kernel preflight failed: ${msg}`);
  } catch {
    console.error(`CAD kernel preflight failed: ${outText.slice(0, 300)}`);
  }

  if (!ok && !givenApp) fs.rmSync(app, { recursive: true, force: true });

  if (!ok) process.exit(1);
}

const vite = spawn(
  process.execPath,
  [path.join(app, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
  {
    cwd: app,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...(ROBOTS[robot].offline ? { STUDIO_AGENT_OFFLINE: '1' } : {}) },
  },
);
const cleanup = () => {
  try {
    vite.kill();
  } catch {}

  try {
    if (!givenApp) fs.rmSync(app, { recursive: true, force: true });
  } catch {}
};

process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now();

  for (;;) {
    try {
      const v = await fn();

      if (v) return v;
    } catch (err) {
      if (err?.fatal) throw err;
    }

    if (Date.now() - t0 > timeoutMs) throw new Error(`Timed out waiting for ${label}`);

    await new Promise((r) => setTimeout(r, 500));
  }
}

let viteExited = false;

vite.on('exit', () => (viteExited = true));

let viteOut = '';

vite.stdout.on('data', (d) => (viteOut += d));
vite.stderr.on('data', (d) => (viteOut += d));
await waitFor(
  async () => {
    if (viteExited)
      throw Object.assign(new Error(`Port ${port} is taken or vite failed:\n${viteOut.slice(-400)}`), { fatal: true });

    return /ready in|Local:/.test(viteOut) && (await fetch(base)).ok;
  },
  60000,
  'dev server',
).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
log('dev server up');

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on('pageerror', (e) => log('page error', e.message));
page.on('crash', () => log('PAGE CRASHED (out of memory?) — the model is lost'));
await page.goto(base);
await waitFor(() => page.evaluate(() => !!window.__studio), 180000, 'app');

const counts = { toolCalls: 0, modelPart: 0, failedTools: 0, thoughtChunks: 0, messageChunks: 0 };
const onEvent = createEventHandler({ counts, log, logFile, started });
const sse = http.get(`${base}/api/events`, (res) => {
  res.setEncoding('utf8');
  res.on('data', sseDataReader(onEvent));
});

sse.setTimeout(0);
sse.on('error', () => {});

await waitFor(
  async () => (await (await fetch(`${base}/api/bridge/acp-status`)).json()).connected,
  90000,
  'agent connection',
);
log('agent connected');

const inputsDir = path.join(here, 'data', robot, 'inputs');
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const imageDataUrls = (fs.existsSync(inputsDir) ? fs.readdirSync(inputsDir) : [])
  .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
  .sort()
  .map(
    (f) =>
      `data:${MIME[path.extname(f).toLowerCase()]};base64,${fs.readFileSync(path.join(inputsDir, f)).toString('base64')}`,
  );
const promptText = ROBOTS[robot].prompt;

log(`prompting with ${imageDataUrls.length} photos`);

const result = await postJson(`${base}/api/bridge/acp-prompt`, {
  action: 'build',
  promptText,
  imageDataUrls,
  imageName: `${robot} photos`,
});
const seconds = Math.round((Date.now() - started) / 1000);

log('agent finished', result.stopReason ?? result.error, `${seconds}s`);

await new Promise((r) => setTimeout(r, 1500));

const parts = await page.evaluate(() => window.__studio.parts());
const stl = Buffer.from(await page.evaluate(() => window.__studio.stlBase64()), 'base64');

fs.writeFileSync(path.join(out, 'agent.stl'), stl);
fs.writeFileSync(path.join(out, 'parts.json'), JSON.stringify(parts, null, 1));

const shots = await page.evaluate(() => window.__studio.capture(['iso', 'front', 'side', 'az:-40,el:12']));

for (const s of shots)
  fs.writeFileSync(
    path.join(out, `render-${s.view.replace(/[^\w-]+/g, '_')}.png`),
    Buffer.from(s.dataUrl.split(',')[1], 'base64'),
  );

const snapForGroups = await page.evaluate(() =>
  fetch('/api/bridge/agent-call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'snapshot', payload: {} }),
  }).then((r) => r.json()),
);
const boundsById = new Map((snapForGroups.parts ?? []).map((p) => [p.id, p.bounds]));
const groups = {};

for (const p of parts.filter((x) => x.group && x.kind !== 'hardware')) {
  groups[p.group] ??= [];
  groups[p.group].push(p.id);
}

const extent = (ids) => {
  const bs = ids.map((id) => boundsById.get(id)).filter(Boolean);

  if (!bs.length) return 0;

  return Math.max(...[0, 1, 2].map((k) => Math.max(...bs.map((b) => b.max[k])) - Math.min(...bs.map((b) => b.min[k]))));
};

for (const [g, ids] of Object.entries(groups)
  .sort((a, b) => extent(b[1]) - extent(a[1]))
  .slice(0, 2)) {
  const [shot] = await page.evaluate(([v, i]) => window.__studio.capture(v, i), [['az:-35,el:20'], ids]);

  if (shot)
    fs.writeFileSync(
      path.join(out, `render-detail-${g.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`),
      Buffer.from(shot.dataUrl.split(',')[1], 'base64'),
    );
}

async function renderInternals() {
  const shells = /shell|cover|hood|housing|skin|panel|visor|fairing|bumper|lid|cap|case/i;
  const inner = parts
    .filter((p) => p.visible && p.role === 'solid' && !shells.test(`${p.id} ${p.name}`))
    .map((p) => p.id);

  if (!inner.length) return;

  const [shot] = await page.evaluate(([v, i]) => window.__studio.capture(v, i), [['iso'], inner]);

  if (shot)
    fs.writeFileSync(path.join(out, 'render-internals-iso.png'), Buffer.from(shot.dataUrl.split(',')[1], 'base64'));
}

if (ROBOTS[robot].concept) await renderInternals();

if (ROBOTS[robot].build) {
  fs.writeFileSync(
    path.join(out, 'scene.json'),
    JSON.stringify(await page.evaluate(() => window.__studio.sceneRecord())),
  );

  const ask = (kind) =>
    page.evaluate(
      (k) =>
        fetch('/api/bridge/agent-call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: k, payload: {} }),
        }).then((r) => r.json()),
      kind,
    );

  for (const [kind, file] of [
    ['bom', 'build-bom.txt'],
    ['printability', 'build-print.txt'],
    ['verify', 'build-verify.txt'],
  ]) {
    try {
      fs.writeFileSync(path.join(out, file), (await ask(kind))?.text ?? '');
    } catch (err) {
      fs.writeFileSync(path.join(out, file), `failed: ${err}`);
    }
  }
}

const { interferences: interference, coplanar } = await page.evaluate(() => window.__studio.interference());
const finished = new Set(['cad_part', 'component', 'hardware', 'image_plane']);

const summary = {
  robot,
  seconds,
  stopReason: result.stopReason,
  ...counts,
  parts: parts.length,
  cadParts: parts.filter((p) => p.kind === 'cad_part').length,
  catalogParts: parts.filter((p) => p.kind === 'component' || p.kind === 'hardware').length,
  primitives: parts.filter((p) => p.role === 'solid' && !finished.has(p.kind)).length,
  interferences: interference.length,
  worstInterferenceMm: interference[0]?.depthMm ?? 0,
  coplanar: coplanar.length,
};
const refFile = path.join(here, 'data', robot, 'reference.stl');
const placedCatalogParts = () =>
  ROBOTS[robot].modelItYourself ? { placedCatalogParts: parts.filter((p) => p.kind === 'component').length } : {};

if (fs.existsSync(refFile) && stl.length > 84) {
  const refMeta = JSON.parse(fs.readFileSync(path.join(here, 'data', robot, 'reference.json'), 'utf8'));
  const solidParts = parts.filter((p) => p.role === 'solid' && p.visible).length;
  const s = scoreModels(parseStl(fs.readFileSync(refFile)), parseStl(stl), {
    agentParts: solidParts,
    refParts: refMeta.parts,
    allOrientations: !!ROBOTS[robot].allOrientations,
  });

  Object.assign(summary, placedCatalogParts());

  writeOverlay(path.join(out, 'overlay.png'), s.views);

  const { views, ...score } = s;

  void views;
  summary.score = score;
}

const drawing = ROBOTS[robot].frontDrawing && path.join(here, 'data', robot, ROBOTS[robot].frontDrawing);

if (drawing && stl.length > 84) {
  const d = scoreAgainstDrawing(parseStl(stl), drawing);

  writeDrawingOverlay(path.join(out, 'drawing-overlay.png'), d.view);

  const { view, ...rest } = d;

  void view;
  summary.drawing = rest;
}

if (!args.includes('--no-judge') && stl.length > 84) {
  try {
    summary.judge = await judgeRun(out, robot);
  } catch (err) {
    log('judge failed', err.message);
  }
}

fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 1));
log('summary', JSON.stringify(summary));

sse.destroy();
await browser.close();
cleanup();
process.exit(0);
