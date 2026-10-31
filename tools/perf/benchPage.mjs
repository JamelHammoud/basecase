import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';

const TYPES = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.png': 'image/png',
};

const LISTS = {
  scenes: [],
  models: [],
  images: [],
  chats: [],
  purchases: {},
  'acp-status': { connected: true, sessionId: null, agentName: 'Claude Code', models: [] },
  'train-status': { uv: false, ready: false, running: [] },
};

export async function serveStatic(root) {
  const server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const found = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(root, 'index.html');

    res.writeHead(200, { 'content-type': TYPES[path.extname(found)] ?? 'application/octet-stream' });
    fs.createReadStream(found).pipe(res);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() };
}

function installProbes(sceneId) {
  localStorage.setItem('open-scenes', JSON.stringify({ ids: [sceneId], tabIds: ['main'], active: 0 }));

  class FakeSource {
    constructor() {
      window.__benchSource = this;
    }

    close() {}
  }

  window.EventSource = FakeSource;
  window.__benchEmit = (events) =>
    events.forEach((e) => window.__benchSource?.onmessage?.({ data: JSON.stringify(e) }));
  window.__benchLong = [];
  window.__benchFrames = [];
  new PerformanceObserver((list) =>
    list.getEntries().forEach((e) => window.__benchLong.push([e.startTime, e.duration])),
  ).observe({ type: 'longtask', buffered: true });

  let last = performance.now();

  const tick = (t) => {
    window.__benchFrames.push([t, t - last]);
    last = t;
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}

async function stubBackend(page, { sceneText, responses }) {
  await page.route('**/api/bridge/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();

    if (name === 'scene') return route.fulfill({ status: 200, contentType: 'application/json', body: sceneText });

    if (name === 'agent-respond') {
      const body = route.request().postDataJSON();

      responses.set(body.requestId, { at: Date.now(), error: body.error });
    }

    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LISTS[name] ?? {}) });
  });
}

const GPU_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
const CPU_ARGS = ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'];

export async function openBenchPage({ url, scene, gpu, probes }) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: gpu ? GPU_ARGS : CPU_ARGS });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const responses = new Map();

  page.on('pageerror', (e) => errors.push(e.message));
  await stubBackend(page, { sceneText: JSON.stringify(scene), responses });
  await page.addInitScript(installProbes, scene.id);

  if (probes) await page.addInitScript(probes);

  await page.goto(url);
  await page.waitForSelector('nav[aria-label="Sidebar views"]', { timeout: 60000 });

  return { browser, page, errors, responses };
}

export async function waitQuiet(page, { quietMs = 4000, maxMs = 180000 } = {}) {
  const start = Date.now();

  for (;;) {
    await page.waitForTimeout(1000);

    const quiet = await page.evaluate(
      (ms) => !window.__benchLong.some(([s, d]) => s + d > performance.now() - ms),
      quietMs,
    );

    if ((quiet && Date.now() - start > quietMs) || Date.now() - start > maxMs) return Date.now() - start;
  }
}

export function benchClient({ page, responses }) {
  let n = 0;

  const emit = (events) => page.evaluate((ev) => window.__benchEmit(ev), events);

  const request = async (kind, payload) => {
    const requestId = `bench-${++n}`;
    const sent = Date.now();

    await emit([{ type: 'agent-request', workspaceId: 'main', requestId, kind, payload }]);

    while (!responses.has(requestId)) await new Promise((r) => setTimeout(r, 10));

    const { at, error } = responses.get(requestId);

    return { ms: at - sent, ...(error ? { error } : {}) };
  };

  const measure = async (fn) => {
    const t0 = await page.evaluate(() => performance.now());
    const result = await fn();

    await page.waitForTimeout(300);

    const stats = await page.evaluate((start) => {
      const long = window.__benchLong.filter(([s]) => s >= start);
      const frames = window.__benchFrames.filter(([t]) => t >= start);

      return {
        longMax: Math.round(Math.max(0, ...long.map((l) => l[1]))),
        longTotal: Math.round(long.reduce((s, l) => s + l[1], 0)),
        frameMax: Math.round(Math.max(0, ...frames.map((f) => f[1]))),
      };
    }, t0);

    return { ...stats, result };
  };

  return { emit, request, measure };
}
