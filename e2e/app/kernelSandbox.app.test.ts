import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  connectMcp,
  isAlive,
  kernelRender,
  kernelWindows,
  launchKernelApp,
  sessionFetch,
  type KernelApp,
} from './kernelHarness';
import { allowedProbes, pageProbeSource, parseProbes, probeCode } from './kernelProbes';
import { startProbeWorld, type ProbeWorld } from './probeServer';

let kapp: KernelApp;
let mcp: Client;
let world: ProbeWorld;

const BOX = 'return makeBox([0, 0, 0], [10, 20, 30]);';
const toolText = (result: unknown) =>
  ((result as { content?: { type: string; text?: string }[] }).content ?? []).map((c) => c.text ?? '').join('\n');

beforeAll(async () => {
  kapp = await launchKernelApp();
  mcp = await connectMcp(kapp.mcpServer);
  world = await startProbeWorld(`${kapp.bridgeUrl}/agent/kernel_warm`);
});

afterAll(async () => {
  await mcp?.close();
  await world?.close();
  await kapp?.close();
});

const modelPart = async (id: string, language: string, code: string) =>
  toolText(
    await mcp.callTool({ name: 'model_part', arguments: { id, language, code, name: id } }, undefined, {
      timeout: 120000,
    }),
  );

describe('kernel sandbox', () => {
  it('kernel sandbox renders OpenSCAD and replicad parts through model_part', async () => {
    const scad = await modelPart('scad_box', 'openscad', 'cube([10, 20, 30]);');
    const brep = await modelPart('brep_box', 'replicad', BOX);

    expect(scad).toMatch(/^Placed scad_box .*size \[10,20,30\] mm, volume 6000 mm³/);
    expect(brep).toMatch(/^Placed brep_box .*size \[10,20,30\] mm, volume 6000 mm³/);

    const library = await kernelRender(kapp.bridgeUrl, {
      language: 'openscad',
      code: 'include <robotics.scad>\ncuboid([20, 20, 10], rounding = 2, edges = "Z");',
    });

    expect(library.ok, library.error).toBe(true);

    const windows = await kernelWindows(kapp.run.app);

    expect(windows.length).toBeGreaterThan(0);

    for (const w of windows) {
      expect(w.preferences).toMatchObject({ sandbox: true, nodeIntegration: false, contextIsolation: true });

      if (process.platform !== 'linux') expect(w.sandboxed).toBe(true);
    }
  });

  it('kernel sandbox denies files, network, Node and other origins to agent code', async () => {
    const res = await kernelRender(kapp.bridgeUrl, { language: 'replicad', code: probeCode(world.targets) });
    const report = parseProbes(res.error);

    expect(report, res.error).not.toBeNull();
    expect(Object.keys(report ?? {}).length).toBeGreaterThan(20);
    expect(allowedProbes(report ?? {})).toEqual([]);

    const included = await kernelRender(kapp.bridgeUrl, {
      language: 'openscad',
      code: `include <${world.targets.secretPath}>\nimport("${world.targets.secretPath}");`,
    });

    expect(included.stats?.volume ?? 0).not.toBe(77 ** 3);

    const page = kapp.run.app.windows().find((p) => p.url().startsWith('basecase-kernel:'));
    const pageReport = (await page?.evaluate(pageProbeSource(world.targets))) as Record<string, string>;

    expect(Object.keys(pageReport ?? {}).length).toBeGreaterThan(20);
    expect(allowedProbes(pageReport)).toEqual([]);

    for (const url of [world.targets.localUrl, world.targets.externalUrl, world.targets.secretUrl, kapp.bridgeUrl]) {
      expect(await sessionFetch(kapp.run.app, url)).toMatch(/^denied/);
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(world.hits).toEqual([]);
  });

  it('kernel sandbox recovers: a hung part is killed in time and the next part renders', async () => {
    const before = (await kernelWindows(kapp.run.app)).map((w) => w.pid);
    const started = Date.now();
    const hung = await kernelRender(kapp.bridgeUrl, { language: 'replicad', code: 'while (true) {}', timeoutMs: 3000 });

    expect(hung.ok).toBe(false);
    expect(hung.error).toMatch(/took longer than 3 s/);
    expect(Date.now() - started).toBeLessThan(10000);

    const scadHung = await kernelRender(kapp.bridgeUrl, {
      language: 'openscad',
      code: 'echo(len([for (i = [0 : 99999]) for (j = [0 : 99999]) if (i < 0) j]));',
      timeoutMs: 3000,
    });

    expect(scadHung.error).toMatch(/took longer than 3 s/);

    const next = await kernelRender(kapp.bridgeUrl, { language: 'replicad', code: BOX });

    expect(next.ok, next.error).toBe(true);
    expect(next.stats?.volume).toBe(6000);

    const after = (await kernelWindows(kapp.run.app)).map((w) => w.pid);

    expect(before.filter((pid) => !after.includes(pid)).some((pid) => isAlive(pid))).toBe(false);
  });

  it('kernel sandbox recovers from a part that eats memory', async () => {
    const bomb = await kernelRender(kapp.bridgeUrl, {
      language: 'replicad',
      code: 'const kept = []; while (true) { const b = new Uint8Array(256 * 1024 * 1024); b.fill(1); kept.push(b); }',
      timeoutMs: 60000,
    });

    expect(bomb.ok).toBe(false);
    expect(bomb.error).toMatch(/time or memory limit|allocation failed|out of memory/i);

    const next = await kernelRender(kapp.bridgeUrl, { language: 'openscad', code: 'cube(10);' });

    expect(next.ok, next.error).toBe(true);
  });
});
