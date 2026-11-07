import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAppUrl, isExternalWebUrl, trustedIpc } from './appOrigin.mjs';
import { AgentBridge } from './backend/agentBridge.mjs';
import { EventHub } from './backend/eventHub.mjs';
import { serveKernel } from './backend/kernelRoutes.mjs';
import { renderPart } from './cad-kernel/client.mjs';
import { bundleFile, isKernelUrl, KERNEL_ORIGIN, PAGE_CSP, WORKER_CSP } from './cad-kernel/sandbox/policy.mjs';
import { SceneLibrary } from './library/sceneLibrary.mjs';
import { assertPublicUrl, isPublicAddress, publicFetch, readCapped } from './publicFetch.mjs';

afterEach(() => vi.unstubAllGlobals());

describe('app origin', () => {
  const app = 'http://localhost:5173';

  it('trusts only the exact app origin', () => {
    expect(isAppUrl('http://localhost:5173/scene?id=1', app)).toBe(true);
    expect(isAppUrl('http://localhost:5173.evil.example/', app)).toBe(false);
    expect(isAppUrl('http://localhost:5174/', app)).toBe(false);
    expect(isAppUrl('https://localhost:5173/', app)).toBe(false);
    expect(isAppUrl('file:///etc/passwd', app)).toBe(false);
    expect(isAppUrl('not a url', app)).toBe(false);
  });

  it('opens only web links externally', () => {
    expect(isExternalWebUrl('https://example.com')).toBe(true);
    expect(isExternalWebUrl('file:///Applications/Calculator.app')).toBe(false);
    expect(isExternalWebUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('public fetch', () => {
  it('refuses private, loopback and mapped addresses', async () => {
    const v4 = (...octets) => octets.join('.');
    const v6 = (...groups) => groups.join(':');
    const privateAddresses = [
      v4(127, 0, 0, 1),
      v4(10, 1, 2, 3),
      v4(192, 168, 1, 1),
      v4(100, 100, 1, 1),
      v4(169, 254, 169, 254),
      v6('', '', '1'),
      v6('fd00', '', '1'),
      v6('', '', 'ffff', v4(127, 0, 0, 1)),
    ];

    for (const ip of privateAddresses) expect(isPublicAddress(ip)).toBe(false);

    expect(isPublicAddress(v4(93, 184, 215, 14))).toBe(true);
    await expect(assertPublicUrl('http://2130706433/')).rejects.toThrow('public');
    await expect(assertPublicUrl('http://[::1]:5173/')).rejects.toThrow('public');
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow('public');
  });

  it('checks every redirect hop', async () => {
    const fetch = vi.fn(
      async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:5173/' } }),
    );

    vi.stubGlobal('fetch', fetch);

    await expect(publicFetch('http://93.184.215.14/robot.urdf')).rejects.toThrow('public');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('stops reading a body past its cap', async () => {
    const big = new Response(new Uint8Array(2048));

    await expect(readCapped(big, 1024, 'The file')).rejects.toThrow('larger than');
    expect((await readCapped(new Response('ok'), 1024)).toString()).toBe('ok');
  });
});

describe('scene library ids', () => {
  let dir;

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('never reads, writes or deletes outside the scenes folder', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scenes-'));

    const scenesDir = path.join(dir, 'scenes');
    const secret = path.join(dir, 'auth.json');

    fs.mkdirSync(scenesDir);
    fs.writeFileSync(secret, '{"token":"x"}');

    const library = new SceneLibrary({ scenesDir, cacheFile: path.join(dir, 'cache.json') });

    expect(library.get('../auth')).toBeNull();
    expect(() => library.save({ id: '../auth', name: 'x', parts: [] })).toThrow('Not a valid id');
    library.delete('../auth');

    expect(fs.readFileSync(secret, 'utf-8')).toBe('{"token":"x"}');
  });
});

describe('CAD kernel sandbox', () => {
  const bundleDir = path.resolve('dist', 'kernel');

  it('serves only bundle files from its own scheme', () => {
    expect(bundleFile(bundleDir, 'basecase-kernel://kernel/worker.js')).toBe(path.join(bundleDir, 'worker.js'));

    for (const url of [
      'basecase-kernel://kernel/../package.json',
      'basecase-kernel://kernel/..%2f..%2fpackage.json',
      'basecase-kernel://kernel/%2e%2e/%2e%2e/electron/main.mjs',
      'basecase-kernel://kernel/assets/..%5c..%5cmain.js',
      'basecase-kernel://kernel/assets/secret.json',
      'basecase-kernel://evil/worker.js',
      'basecase-kernel://user:pass@kernel/worker.js',
      'app://basecase/worker.js',
      'file:///etc/passwd',
    ]) {
      expect(bundleFile(bundleDir, url), url).toBeNull();
    }

    expect(isKernelUrl('basecase-kernel://kernel.evil.example/x.js')).toBe(false);
    expect(isKernelUrl('http://kernel/x.js')).toBe(false);
  });

  it('lets only the worker evaluate code, and lets it connect nowhere', () => {
    expect(WORKER_CSP).toContain("'unsafe-eval'");
    expect(WORKER_CSP).toContain("connect-src 'none'");
    expect(WORKER_CSP).toContain("worker-src 'none'");
    expect(PAGE_CSP).not.toContain("'unsafe-eval'");

    for (const policy of [WORKER_CSP, PAGE_CSP]) {
      expect(policy).toContain("default-src 'none'");
      expect(policy).not.toMatch(/https?:|\*/);
    }
  });

  it('keeps the kernel page and the app on their own IPC channels', () => {
    const handlers = new Map();
    const ipcMain = {
      handle: (channel, fn) => handlers.set(channel, fn),
      on: (channel, fn) => handlers.set(channel, fn),
    };
    const event = (url) => ({ senderFrame: { parent: null, url } });
    const heard = [];

    trustedIpc(ipcMain, 'app://basecase').handle('acp:prompt', () => 'ran');
    expect(() => handlers.get('acp:prompt')(event(`${KERNEL_ORIGIN}/index.html`))).toThrow('Refused');

    trustedIpc(ipcMain, KERNEL_ORIGIN).on('kernel:result', (_e, id) => heard.push(id));
    handlers.get('kernel:result')(event('app://basecase/'), 1);
    handlers.get('kernel:result')(event(`${KERNEL_ORIGIN}/index.html`), 2);
    expect(heard).toEqual([2]);
  });

  it('refuses agent bridge requests from another host or site', async () => {
    const bridge = new AgentBridge({ events: new EventHub(), onError: () => {} });

    serveKernel(bridge, { render: () => ({ ok: true }), audit: () => ({ ok: true }), warm: () => {} });

    const url = new URL(await bridge.start());
    const post = (headers) =>
      new Promise((resolve) => {
        const req = http.request(
          { host: url.hostname, port: url.port, path: `${url.pathname}/agent/kernel_render`, method: 'POST', headers },
          (res) => resolve(res.statusCode),
        );

        req.end('{"code":"cube(1);"}');
      });

    expect(await post({ host: 'evil.example' })).toBe(403);
    expect(await post({ host: url.host, origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' })).toBe(403);
    expect(await post({ host: url.host })).toBe(200);
    bridge.server.close();
  });

  it('answers with an error when the app is not there, and never compiles in this process', async () => {
    const res = await renderPart('replicad', 'return makeBox([0, 0, 0], [1, 1, 1]);');
    const client = fs.readFileSync(path.join('electron', 'cad-kernel', 'client.mjs'), 'utf8');

    expect(res).toEqual({ ok: false, error: expect.stringContaining('CAD_BRIDGE_URL') });
    expect(client).not.toMatch(/nodeHost|child_process|kernelCore|new Function/);
  });

  it('refuses to compile on a backend with no sandbox', async () => {
    const bridge = new AgentBridge({ events: new EventHub(), onError: () => {} });

    serveKernel(bridge);

    const url = await bridge.start();
    const res = await fetch(`${url}/agent/kernel_render`, { method: 'POST', body: '{"code":"cube(1);"}' });

    expect(await res.json()).toEqual({ ok: false, error: expect.stringMatching(/runs in the desktop app/) });
    bridge.server.close();
  });
});
