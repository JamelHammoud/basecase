#!/usr/bin/env node
/**
 * Rebuilds a benchmark run's final model in a headless app by replaying the agent's CAD tool
 * calls from events.jsonl (model_part is recompiled with the kernel), then renders it — for
 * debugging visuals without re-running the agent.
 *
 *   node bench/replay.mjs <run> <robot> [--port 5197] [--views "iso az:-40,el:12"] [--keep]
 *
 * Renders land in bench/runs/<run>/<robot>/replay/. With --keep the app stays up so you can
 * call /api/bridge/agent-call yourself.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = process.argv.slice(2);
const [run, robot] = args;
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const port = Number(opt('port', 5197));
const views = opt('views', 'iso az:-40,el:12 front side').split(/\s+/);
const dir = path.join(here, 'runs', run, robot);
const out = path.join(dir, 'replay');
fs.mkdirSync(out, { recursive: true });

// Tool calls in order (the final rawInput of each call id)
const calls = new Map();
for (const line of fs.readFileSync(path.join(dir, 'events.jsonl'), 'utf8').split('\n')) {
  if (!line) continue;
  const u = JSON.parse(line).update;
  if (!u || !u.toolCallId) continue;
  const name = u._meta?.claudeCode?.toolName ?? calls.get(u.toolCallId)?.name;
  const prev = calls.get(u.toolCallId) ?? { name, order: calls.size };
  if (u.rawInput && Object.keys(u.rawInput).length) prev.input = u.rawInput;
  if (u.status) prev.status = u.status;
  if (name) prev.name = name;
  calls.set(u.toolCallId, prev);
}
const steps = [...calls.values()]
  .filter((c) => c.status === 'completed' && c.input && /model_part|add_parts|update_parts|delete_parts|mirror_parts/.test(c.name ?? ''))
  .sort((a, b) => a.order - b.order);

// App copy + dev server
const app = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-replay-'));
for (const f of ['src', 'electron', 'vendor', 'public', 'index.html', 'vite.config.ts', 'package.json', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json']) {
  fs.cpSync(path.join(root, f), path.join(app, f), { recursive: true });
}
fs.symlinkSync(path.join(root, 'node_modules'), path.join(app, 'node_modules'), 'dir');
const vite = spawn(process.execPath, [path.join(app, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: app, stdio: 'ignore' });
const done = (code) => {
  vite.kill();
  fs.rmSync(app, { recursive: true, force: true });
  process.exit(code);
};
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 240; i++) {
  try {
    if ((await fetch(base)).ok) break;
  } catch {
    /* starting */
  }
  await new Promise((r) => setTimeout(r, 500));
}
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(base);
for (let i = 0; i < 360 && !(await page.evaluate(() => !!window.__studio)); i++) await new Promise((r) => setTimeout(r, 500));
await new Promise((r) => setTimeout(r, 3000));
const call = async (kind, payload) =>
  (await fetch(`${base}/api/bridge/agent-call`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, payload }) })).json();

const { renderPart } = await import(path.join(root, 'electron/cad-kernel/client.mjs'));
let n = 0;
for (const s of steps) {
  const inp = s.input;
  if (/model_part/.test(s.name)) {
    const { id, language = 'openscad', code, position, ...rest } = inp;
    const res = await renderPart(language, code);
    if (res.ok === false || res.error) continue;
    await call('apply', { ops: [{ op: 'add', part: { id, shape: 'cad_part', position, ...rest, cad: { language, code, positions: res.positions, indices: res.indices, edges: res.edges, stats: res.stats } } }] });
  } else if (/add_parts/.test(s.name)) await call('apply', { ops: (inp.parts ?? []).map((p) => ({ op: 'add', part: p })) });
  else if (/update_parts/.test(s.name)) await call('apply', { ops: (inp.updates ?? []).map((u) => ({ op: 'update', part: u })) });
  else if (/delete_parts/.test(s.name)) await call('apply', { ops: (inp.ids ?? []).map((id) => ({ op: 'delete', id })) });
  else if (/mirror_parts/.test(s.name)) await call('apply', { ops: [{ op: 'mirror', ids: inp.ids, axis: inp.axis, rename: inp.rename ?? {} }] });
  n++;
}
await new Promise((r) => setTimeout(r, 4000));
const shots = await call('screenshot', { views });
for (const s of shots.images ?? []) fs.writeFileSync(path.join(out, `render-${s.view.replace(/[^\w-]+/g, '_')}.png`), Buffer.from(s.dataUrl.split(',')[1], 'base64'));
// --only "a,b;a,c" renders each id set on its own (bisecting visual artefacts)
for (const [k, set] of (opt('only', '') ? opt('only', '').split(';') : []).entries()) {
  const ids = set.split(',').filter(Boolean);
  const r = await call('screenshot', { views: [views[0]], ids });
  if (r.images?.[0]) fs.writeFileSync(path.join(out, `only-${k}.png`), Buffer.from(r.images[0].dataUrl.split(',')[1], 'base64'));
}
// --silhouette <image> [--view front]: measured photo-vs-model profile (what compare reports)
if (opt('silhouette', null)) {
  const file = opt('silhouette');
  const mime = /\.png$/i.test(file) ? 'image/png' : 'image/jpeg';
  const res = await call('silhouette_compare', { reference: `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`, view: opt('view', 'front') });
  fs.writeFileSync(path.join(out, 'silhouette.json'), JSON.stringify(res, null, 1));
  console.log('silhouette', JSON.stringify(res));
}
const snap = await call('snapshot', {});
fs.writeFileSync(path.join(out, 'parts.json'), JSON.stringify((snap.parts ?? []).map((p) => ({ id: p.id, kind: p.kind, name: p.name, bounds: p.bounds })), null, 1));
const fit = await call('interference', {});
fs.writeFileSync(path.join(out, 'fit.json'), JSON.stringify(fit, null, 1));
console.log(`replayed ${n} of ${steps.length} steps → ${out} (${fit.items?.length ?? 0} interferences, ${fit.coplanar?.length ?? 0} coplanar pairs)`);
if (args.includes('--keep')) {
  console.log(`app at ${base} (Ctrl-C to stop)`);
  process.on('SIGINT', () => done(0));
} else {
  await browser.close();
  done(0);
}
