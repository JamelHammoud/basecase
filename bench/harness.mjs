import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { sseDataReader } from './run-events.mjs';

export const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(here, '..');

const APP_FILES = [
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
];

export function argOption(args, name, fallback) {
  const i = args.indexOf(`--${name}`);

  return i >= 0 ? args[i + 1] : fallback;
}

export const defaultRunName = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

export function postJson(url, body) {
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

export async function waitFor(fn, timeoutMs, label) {
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

export function snapshotApp(label) {
  const app = fs.mkdtempSync(path.join(os.tmpdir(), `studio-bench-${label}-`));

  for (const f of APP_FILES.filter((x) => fs.existsSync(path.join(root, x))))
    fs.cpSync(path.join(root, f), path.join(app, f), { recursive: true });

  fs.symlinkSync(path.join(root, 'node_modules'), path.join(app, 'node_modules'), 'dir');

  return app;
}

const PREFLIGHT = [
  "const { renderPart } = await import('./electron/cad-kernel/client.mjs');",
  "const a = await renderPart('openscad', 'include <robotics.scad>\\ncuboid(10, rounding=2);');",
  "const b = await renderPart('replicad', 'return makeBox([0,0,0],[5,5,5]);');",
  "process.stdout.write(JSON.stringify([a.ok !== false && !a.error, b.ok !== false && !b.error, a.error || b.error || '']));",
  'process.exit(0);',
].join('\n');

export async function preflightKernel(app) {
  const check = spawn(process.execPath, ['--input-type=module', '-e', PREFLIGHT], {
    cwd: app,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let outText = '';

  check.stdout.on('data', (d) => (outText += d));
  await new Promise((r) => check.on('close', r));

  try {
    const [a, b, msg] = JSON.parse(outText);

    if (!(a && b)) console.error(`CAD kernel preflight failed: ${msg}`);

    return a && b;
  } catch {
    console.error(`CAD kernel preflight failed: ${outText.slice(0, 300)}`);

    return false;
  }
}

async function startVite({ app, port, env, base }) {
  const vite = spawn(
    process.execPath,
    [path.join(app, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: app, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } },
  );
  let exited = false;
  let out = '';

  vite.on('exit', () => (exited = true));
  vite.stdout.on('data', (d) => (out += d));
  vite.stderr.on('data', (d) => (out += d));
  await waitFor(
    async () => {
      if (exited)
        throw Object.assign(new Error(`Port ${port} is taken or vite failed:\n${out.slice(-400)}`), { fatal: true });

      return /ready in|Local:/.test(out) && (await fetch(base)).ok;
    },
    60000,
    'dev server',
  );

  return vite;
}

function subscribeEvents(base, onEvent) {
  const sse = http.get(`${base}/api/events`, (res) => {
    res.setEncoding('utf8');
    res.on(
      'data',
      sseDataReader((ev) => onEvent.current?.(ev)),
    );
  });

  sse.setTimeout(0);
  sse.on('error', () => {});

  return sse;
}

function stopper({ vite, app, givenApp }) {
  return () => {
    try {
      vite?.kill();
    } catch {}

    try {
      if (!givenApp) fs.rmSync(app, { recursive: true, force: true });
    } catch {}
  };
}

export async function openStudio({ label, port, env = {}, givenApp, log = console.log, agent = true }) {
  const app = givenApp ? path.resolve(givenApp) : snapshotApp(label);
  const base = `http://127.0.0.1:${port}`;
  const ctx = { app, givenApp };
  const cleanup = stopper(ctx);

  process.on('exit', cleanup);
  process.once('SIGINT', () => process.exit(130));
  process.once('SIGTERM', () => process.exit(143));

  if (!(await preflightKernel(app))) {
    cleanup();

    throw new Error('CAD kernel preflight failed');
  }

  ctx.vite = await startVite({ app, port, env, base });
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

  const onEvent = { current: null };
  const sse = subscribeEvents(base, onEvent);

  if (agent) {
    await waitFor(
      async () => (await (await fetch(`${base}/api/bridge/acp-status`)).json()).connected,
      90000,
      'agent connection',
    );
    log('agent connected');
  }

  const call = (kind, payload = {}) => postJson(`${base}/api/bridge/agent-call`, { kind, payload });
  const close = async () => {
    sse.destroy();
    await browser.close();
    cleanup();
  };

  return { app, base, page, browser, onEvent, call, close, post: (route, body) => postJson(`${base}${route}`, body) };
}

export function writeShot(file, shot) {
  if (shot?.dataUrl) fs.writeFileSync(file, Buffer.from(shot.dataUrl.split(',')[1], 'base64'));
}

export const sceneRecordOf = (page) => page.evaluate(() => window.__studio.sceneRecord());
