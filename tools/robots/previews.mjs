#!/usr/bin/env node
/**
 * Renders the Robots view's preview of every preset (or the ids given) into public/robots/<id>.webp.
 * It runs the app's own import (src/utils/robotImport.ts) and preview (src/utils/robotPreview.ts) in
 * headless Chrome, so a preview shows exactly what inserting the robot gives you.
 *
 *   node tools/robots/previews.mjs [id …] [--port 5381]
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const out = path.join(root, 'public/robots');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
// A random high port: a stale tab on a familiar port can't attach to this run
const port = Number(opt('port', 0)) || 5300 + Math.floor(Math.random() * 600);
const only = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--port');
const base = `http://127.0.0.1:${port}`;
const started = Date.now();
const log = (...a) => console.log(`[${((Date.now() - started) / 1000).toFixed(0)}s]`, ...a);

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

// 1. A snapshot of the app on its own dev server, so edits elsewhere can't reload it mid-run
const app = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-robots-'));
for (const f of ['src', 'electron', 'vendor', 'public', 'index.html', 'vite.config.ts', 'package.json', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json']) {
  if (fs.existsSync(path.join(root, f))) fs.cpSync(path.join(root, f), path.join(app, f), { recursive: true });
}
fs.symlinkSync(path.join(root, 'node_modules'), path.join(app, 'node_modules'), 'dir');
const vite = spawn(process.execPath, [path.join(app, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
  cwd: app,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const cleanup = () => {
  try {
    vite.kill();
  } catch {
    /* gone */
  }
  fs.rmSync(app, { recursive: true, force: true });
};
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));
let viteOut = '';
let viteExited = false;
vite.on('exit', () => (viteExited = true));
vite.stdout.on('data', (d) => (viteOut += d));
vite.stderr.on('data', (d) => (viteOut += d));
await waitFor(async () => {
  if (viteExited) throw Object.assign(new Error(`Port ${port} is taken or vite failed:\n${viteOut.slice(-400)}`), { fatal: true });
  return /ready in|Local:/.test(viteOut) && (await fetch(base)).ok;
}, 60000, 'dev server');
log('dev server up');

// 2. The app in headless Chrome (software WebGL)
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => log('page error', e.message));
await page.goto(base);
await waitFor(() => page.evaluate(() => !!window.__studio?.robotPreview), 180000, 'app');

// 3. Each preset: import, render, save
const presets = await page.evaluate(async () => (await import('/src/utils/robotImport.ts')).ROBOT_PRESETS.map(({ id, url }) => ({ id, url })));
const todo = only.length ? presets.filter((p) => only.includes(p.id)) : presets;
const unknown = only.filter((id) => !presets.some((p) => p.id === id));
if (unknown.length) console.error(`No presets named ${unknown.join(', ')}`);
fs.mkdirSync(out, { recursive: true });
let failed = 0;
for (const p of todo) {
  try {
    const url = await page.evaluate(({ url }) => window.__studio.robotPreview(url, 480), p);
    const m = /^data:image\/webp;base64,(.+)$/.exec(url ?? '');
    if (!m) throw new Error('nothing rendered');
    const file = path.join(out, `${p.id}.webp`);
    fs.writeFileSync(file, Buffer.from(m[1], 'base64'));
    log(`${p.id}: ${Math.round(fs.statSync(file).size / 1024)} KB`);
  } catch (err) {
    failed++;
    log(`${p.id}: FAILED ${err.message}`);
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
