import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { writePartGlb } from './glb.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

const SNAPSHOT = [
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

export const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

export function cliArgs() {
  const args = process.argv.slice(2);
  const portAt = args.indexOf('--port');
  const port = (portAt >= 0 && Number(args[portAt + 1])) || 5300 + Math.floor(Math.random() * 600);
  const ids = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--port');

  return { port, ids };
}

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

function snapshotApp() {
  const app = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-parts-'));

  for (const f of SNAPSHOT) {
    if (fs.existsSync(path.join(root, f))) fs.cpSync(path.join(root, f), path.join(app, f), { recursive: true });
  }

  fs.symlinkSync(path.join(root, 'node_modules'), path.join(app, 'node_modules'), 'dir');

  return app;
}

async function startVite(app, port, base) {
  const vite = spawn(
    process.execPath,
    [path.join(app, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: app, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let out = '';
  let exited = false;

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

function followReplies(base, reply) {
  const sse = http.get(`${base}/api/events`, (res) => {
    let buf = '';

    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      buf += chunk;

      let i;

      while ((i = buf.indexOf('\n\n')) >= 0) {
        const line = buf
          .slice(0, i)
          .split('\n')
          .find((l) => l.startsWith('data: '));

        buf = buf.slice(i + 2);

        if (line) readEvent(line.slice(6), reply);
      }
    });
  });

  sse.setTimeout(0);
  sse.on('error', () => {});

  return sse;
}

function readEvent(data, reply) {
  try {
    const ev = JSON.parse(data);
    const u = ev.update;

    if (ev.type !== 'acp-session-update') return;

    if (u?.sessionUpdate === 'agent_message_chunk' && u.content?.type === 'text') reply.text += u.content.text;
    else if (u?.sessionUpdate === 'tool_call') reply.text = '';
  } catch {}
}

export async function startStudio({ port, log }) {
  const base = `http://127.0.0.1:${port}`;
  const app = snapshotApp();
  let vite = null;
  const cleanup = () => {
    try {
      vite?.kill();
    } catch {}

    fs.rmSync(app, { recursive: true, force: true });
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => process.exit(130));
  vite = await startVite(app, port, base);
  log('dev server up');

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('pageerror', (e) => log('page error', e.message));
  await page.goto(base);
  await waitFor(() => page.evaluate(() => !!window.__studio), 180000, 'app');
  page.on('framenavigated', (frame) => frame === page.mainFrame() && log('page reloaded: the scene was lost'));
  page.on('crash', () => log('page crashed'));
  page.on('console', (m) => m.type() === 'error' && log('console error', m.text().slice(0, 300)));
  await waitFor(
    async () => (await (await fetch(`${base}/api/bridge/acp-status`)).json()).connected,
    90000,
    'agent connection',
  );
  log('agent connected');

  const reply = { text: '' };
  const sse = followReplies(base, reply);

  return {
    page,
    reply,
    async newConversation() {
      await page.evaluate(() => window.__studio.clear());
      await postJson(`${base}/api/bridge/acp-new-conversation`, {});
    },
    saveEvidence: (payload) => postJson(`${base}/api/bridge/save-evidence-file`, payload),
    prompt: (promptText, evidenceFolders) =>
      postJson(`${base}/api/bridge/acp-prompt`, { action: 'build', promptText, evidenceFolders }),
    async exportGlb(id, opts) {
      await new Promise((r) => setTimeout(r, 1500));

      const byColor = await page.evaluate(() => window.__studio.meshByColor());
      const groups = Object.entries(byColor).map(([hex, soup]) => ({
        color: [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255),
        soup,
      }));

      return groups.length ? writePartGlb(id, groups, opts) : null;
    },
    parts: () => page.evaluate(() => window.__studio.parts()),
    async saveRecord(out, views) {
      const sources = await page.evaluate(() => window.__studio.cadSources());
      const shots = await page.evaluate((v) => window.__studio.capture(v), views);

      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, 'parts.json'), JSON.stringify(sources, null, 1));

      for (const s of shots)
        fs.writeFileSync(path.join(out, `render-${s.view}.png`), Buffer.from(s.dataUrl.split(',')[1], 'base64'));
    },
    async close() {
      sse.destroy();
      await browser.close();
      cleanup();
    },
  };
}
