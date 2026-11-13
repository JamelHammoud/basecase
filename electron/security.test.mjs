import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAppUrl, isExternalWebUrl, trustedIpc } from './appOrigin.mjs';
import { AgentBridge } from './backend/agentBridge.mjs';
import { EventHub } from './backend/eventHub.mjs';
import { tuneCadPart } from './backend/cadTune.mjs';
import { serveKernel } from './backend/kernelRoutes.mjs';
import { renderPart } from './cad-kernel/client.mjs';
import { bundleFile, cspFor, isKernelUrl, KERNEL_ORIGIN, PAGE_CSP, WORKER_CSP } from './cad-kernel/sandbox/policy.mjs';
import { NO_CONVERTER_ERROR } from './cadImport/convertClient.mjs';
import { checkedConversion, checkedConvertJob } from './cadImport/convertPolicy.mjs';
import { importMakerCad } from './cadImport/importMakerCad.mjs';
import { openCadFile } from './cadImport/openCadFile.mjs';
import { encodeReply, decodeReply } from './cadImport/reply.mjs';
import { SceneLibrary } from './library/sceneLibrary.mjs';
import { assertPublicUrl, isPublicAddress, publicFetch, readCapped } from './publicFetch.mjs';
import { RobotLink } from './robot/robotLink.mjs';
import { registerRobotHandlers } from './robot/robotRoutes.mjs';
import { checkedRobotSpec } from './robot/robotSpec.mjs';

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

describe('CAD import sandbox', () => {
  const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 20, 0, 0, 0, 0]);
  const header = {
    ok: true,
    size: [1, 2, 3],
    originOffset: [0, 0, 0],
    triangles: 12,
    holes: [{ position: [0, 0, 0], axis: [0, 1, 0], diameterMm: 3.2 }],
    members: ['source.cad'],
  };
  const reply = (head, bytes = glb) => decodeReply(encodeReply(head, bytes));

  it('never parses a CAD file outside the sandbox, and refuses before downloading it', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-import-'));
    const fetchSpy = vi.fn();

    vi.stubGlobal('fetch', fetchSpy);
    await expect(importMakerCad(dir, { id: 'servo', url: 'https://example.com/servo.step' }, null)).rejects.toThrow(
      NO_CONVERTER_ERROR,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('drops a converter reply that is malformed, and keeps only the fields it knows', () => {
    expect(checkedConversion(reply({ ...header, evil: 1 })).result).toEqual({
      size: [1, 2, 3],
      originOffset: [0, 0, 0],
      triangles: 12,
      holes: header.holes,
      members: ['source.cad'],
    });

    for (const bad of [
      { ...header, size: [Number.NaN, 1, 1] },
      { ...header, triangles: '12' },
      { ...header, holes: Array.from({ length: 501 }, () => header.holes[0]) },
      { ...header, holes: [{ position: [0, 0], axis: [0, 1, 0], diameterMm: 3 }] },
      { ...header, members: [{ toString: 'x' }] },
    ]) {
      expect(() => checkedConversion(reply(bad))).toThrow('malformed');
    }

    expect(() => checkedConversion(reply(header, new Uint8Array(40)))).toThrow('malformed');
    expect(() => checkedConversion(reply({ ok: false, error: 'It broke.' }))).toThrow('It broke.');
    expect(() => checkedConversion(decodeReply(new TextEncoder().encode('{not json')))).toThrow('unreadable');
  });

  it('checks every converter job field, and never forwards a probe', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const job = { id: 'servo', url: 'https://example.com/s.step', name: 'source.cad', ext: '.STEP', bytes };
    const huge = new Uint8Array(1);

    Object.defineProperty(huge, 'length', { value: 300_000_000 });
    expect(checkedConvertJob({ ...job, probe: { kind: 'reach' }, rotate: [['x', 90]] })).toEqual({
      convert: true,
      partId: 'servo',
      url: job.url,
      name: 'source.cad',
      ext: '.step',
      member: undefined,
      rotate: [['x', 90]],
      bytes,
    });

    for (const bad of [
      { ...job, bytes: 'source.cad' },
      { ...job, bytes: huge },
      { ...job, rotate: [['w', 90]] },
      { ...job, rotate: [['x', Number.POSITIVE_INFINITY]] },
      { ...job, rotate: Array.from({ length: 5 }, () => ['x', 90]) },
      { ...job, member: { endsWith: () => true } },
      { ...job, id: 'x'.repeat(5000) },
    ]) {
      expect(() => checkedConvertJob(bad)).toThrow();
    }
  });

  it('hands a dropped CAD file only to the converter, and drops a forged reply', async () => {
    const bytes = new TextEncoder().encode('ISO-10303-21;');
    const jobs = [];
    const body = { name: 'Plate', color: '#cc3333', center: [0, 0, 0], size: [1, 1, 1], vertices: 3, triangles: 1 };
    const mesh = (positions, indices) =>
      new Uint8Array([
        ...new Uint8Array(new Float32Array(positions).buffer),
        ...new Uint8Array(new Uint32Array(indices).buffer),
      ]);
    const replying = (head, data) => ({
      convert: async (job) => {
        jobs.push(job);

        return encodeReply(head, data);
      },
    });
    const ok = { ok: true, bodies: [body] };
    const good = mesh([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);

    await expect(openCadFile(replying(ok, good), { name: 'plate.step', bytes })).resolves.toMatchObject({
      bodies: [body],
    });
    expect(jobs[0]).toMatchObject({ bodies: true, ext: '.step', name: 'plate.step' });
    expect(jobs[0].bytes).toBe(bytes);

    for (const [head, data] of [
      [ok, mesh([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 9])],
      [ok, mesh([0, 0, Number.NaN, 1, 0, 0, 0, 1, 0], [0, 1, 2])],
      [ok, good.subarray(0, 40)],
      [{ ok: true, bodies: [{ ...body, color: 'red; url(x)' }] }, good],
      [{ ok: true, bodies: [{ ...body, vertices: -3 }] }, good],
      [{ ok: true, bodies: Array.from({ length: 1001 }, () => body) }, good],
      [{ ok: true, bodies: [] }, new Uint8Array(0)],
    ]) {
      await expect(openCadFile(replying(head, data), { name: 'plate.step', bytes })).rejects.toThrow('malformed');
    }

    await expect(openCadFile(replying(ok, good), { name: '../../etc/passwd', bytes })).rejects.toThrow(/STEP/);
    expect(jobs).toHaveLength(8);
  });

  it('runs the converter under the worker policy: no network, no nested workers', () => {
    expect(cspFor('/convert.js')).toBe(WORKER_CSP);
    expect(cspFor('/host.js')).toBe(PAGE_CSP);
  });
});

describe('tuning a part’s dimensions', () => {
  const CODE = 'wall = 2; // [1:6]\ncube([20, 10, wall]);';
  const tune = async (payload) => {
    const kernel = { render: vi.fn(async () => ({ ok: true })) };
    const source = vi.fn(async () => ({ language: 'openscad', code: CODE, expect: null }));

    try {
      return { ...(await tuneCadPart({ kernel, source }, payload)), kernel };
    } catch (err) {
      return { refused: String(err.message), kernel };
    }
  };

  it('takes a part id and numbers, and writes only digits into the stored code', async () => {
    const { code, kernel } = await tune({ id: 'bracket', values: { wall: 3 } });

    expect(code).toBe(CODE.replace('wall = 2;', 'wall = 3;'));
    expect(kernel.render).toHaveBeenCalledWith({ language: 'openscad', code, expect: undefined });
  });

  it('refuses a value or a name that tries to inject OpenSCAD, and compiles nothing', async () => {
    const asks = [
      { id: 'bracket', values: { wall: '3; import("/etc/passwd");' } },
      { id: 'bracket', values: { wall: [3] } },
      { id: 'bracket', values: { wall: Number.NaN } },
      { id: 'bracket', values: { wall: Infinity } },
      { id: 'bracket', values: { wall: 1e300 } },
      { id: 'bracket', values: { 'wall = 3; import("x"); y': 3 } },
      { id: 'bracket', values: { $fn: 3 } },
      { id: 'bracket', values: { cube: 3 } },
      { id: 'bracket', values: JSON.parse('{"__proto__": 3}') },
      { id: 'bracket', values: {} },
      { id: 'bracket', code: 'import("/etc/passwd");', values: { wall: 3 } },
      { id: '../scenes/x', values: { wall: 3 } },
      { id: 'bracket', workspaceId: 'tab/../../x', values: { wall: 3 } },
      { id: 'bracket', values: Object.assign(Object.create({ wall: 3 }), {}) },
      null,
    ];

    for (const ask of asks) {
      const { refused, kernel } = await tune(ask);

      expect(refused, JSON.stringify(ask)).toBeTruthy();
      expect(kernel.render, JSON.stringify(ask)).not.toHaveBeenCalled();
    }
  });
});

describe('robot daemon', () => {
  const ARM = { family: 'feetech', ids: [1, 2], class: 'arm', emulated: true };
  const ROS2_ARM = {
    family: 'ros2',
    emulated: true,
    controller: { kind: 'forward_position', topic: '/forward_position_controller/commands' },
    joints: ['shoulder', 'elbow'],
  };

  it('refuses any port, real robot or smuggled argument, and starts nothing', () => {
    const spawnFn = vi.fn();
    const link = new RobotLink({ binary: fileURLToPath(import.meta.url), emit: () => {}, spawnFn });
    const asks = [
      { ...ARM, port: '/dev/cu.usbserial-0001' },
      { ...ARM, emulated: false },
      { ...ARM, emulated: 'true' },
      { family: 'feetech', ids: [1], class: 'arm' },
      { ...ARM, args: ['--port', '/dev/ttyUSB0'] },
      { ...ARM, family: 'feetech --port /dev/ttyUSB0' },
      { ...ARM, class: 'arm --port COM3' },
      { ...ARM, ids: [0, 254] },
      { ...ARM, ids: ['1 --port /dev/null'] },
      { ...ARM, ids: Array.from({ length: 33 }, (_, i) => i + 1) },
      Object.assign(Object.create({ port: '/dev/ttyUSB0' }), ARM),
      { ...ROS2_ARM, controller: { kind: 'forward_position', topic: '/x/../commands' } },
      { ...ROS2_ARM, controller: { kind: 'forward_position', topic: '/x;rm -rf/commands' } },
      { ...ROS2_ARM, joints: ['--port', '/dev/ttyUSB0'] },
      { ...ROS2_ARM, joints: ['a,b'] },
      { ...ROS2_ARM, interface: 'en0' },
      { ...ROS2_ARM, emulated: false },
      null,
      '--port /dev/ttyUSB0',
    ];

    for (const ask of asks) {
      const reply = link.connect(ask);

      expect(reply.ok, JSON.stringify(ask)).toBe(false);
      expect(reply.message).toMatch(/\w+ \w+/);
    }

    expect(spawnFn).not.toHaveBeenCalled();
    expect(checkedRobotSpec(ARM)).toEqual({ ok: true, spec: ARM });
  });

  it('answers robot channels only from the app frame', () => {
    const handlers = new Map();
    const ipcMain = { handle: (channel, fn) => handlers.set(channel, fn), on: () => {} };
    const link = { connect: vi.fn(), command: vi.fn(), disconnect: vi.fn(), state: vi.fn() };

    registerRobotHandlers(trustedIpc(ipcMain, 'app://basecase'), link);

    for (const channel of ['robot:connect', 'robot:command', 'robot:disconnect', 'robot:state']) {
      const evil = { senderFrame: { parent: null, url: 'https://example.com/' } };

      expect(() => handlers.get(channel)(evil, ARM), channel).toThrow('Refused');
    }

    expect(link.connect).not.toHaveBeenCalled();
  });
});
