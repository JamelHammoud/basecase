import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { electricalScenes } from '../../src/wiring/electricalFixtures';
import { defineBoard } from '../../src/wiring/boardDefinition';
import { electricalPackage } from '../../src/wiring/electricalPackage';
import { nativeBoardRequest } from '../../src/wiring/boardRoutingPackage';
import { ElectricalBoards } from './service.mjs';
import { runNativeBoard } from './validate.mjs';
import { checkedBoardRequest } from './inputs.mjs';
import { checkedOutput } from './outputs.mjs';
import { boardProcess } from './process.mjs';
import { boardDigest } from '../../src/wiring/boardNativeContract.mjs';
import { routeStackup } from '../../src/wiring/boardRouteContract.mjs';

let request;
let temporaryRoot;

beforeAll(async () => {
  const scene = electricalScenes().find((entry) => entry.name === 'dual-bus-arm').scene;
  const { board, part } = defineBoard(scene, 'board');
  const input = { parts: [...scene.parts, part], project: { ...scene.project, electronicsBoard: board } };
  const base = await electricalPackage(input);
  const pcb = base.files['robot.kicad_pcb'];

  base.files['current-unrouted.kicad_pcb'] = pcb;
  request = await nativeBoardRequest(base, {
    schema: 1,
    pcb,
    hash: await boardDigest(pcb),
    sourceFingerprint: base.sourceFingerprint,
    rules: null,
  });
  temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'board validation with spaces '));
});

afterAll(async () => {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
});

it.each([
  (value) => ({ ...value, pcb: ' '.repeat(8 * 1024 * 1024 + 1) }),
  (value) => ({ ...value, extra: { source: '../../secret' } }),
  (value) => ({ ...value, key: 'x'.repeat(1000) }),
  (value) => ({
    ...value,
    rules: { source: '', clearanceMm: null, trackWidthMm: null, drillMm: null, file: '../../secret' },
  }),
  (value) => ({ ...value, pcb: '(kicad_pcb (model "../../auth.json"))' }),
  (value) => ({ ...value, pcb: '(kicad_pcb (image (data "AAAA")))' }),
  (value) => ({ ...value, pcb: '(kicad_pcb (embedded_files (file "../secret")))' }),
  (value) => ({ ...value, schematic: '(kicad_sch (sheet (property "Sheetfile" "../secret")))' }),
  (value) => ({ ...value, footprints: { '../secret.kicad_mod': '(footprint "secret")' } }),
  (value) => ({
    ...value,
    footprints: { 'bad.kicad_mod': '(footprint "bad" (property "Value" "bad" (effects (font (size 99999999 1)))))' },
  }),
  (value) => ({
    ...value,
    footprints: { 'model.kicad_mod': '(footprint "model" (model "https://evil.test/a.step"))' },
  }),
])('refuses hostile board, schematic and footprint data before native execution', async (edit) => {
  const altered = edit(request);
  const cli = vi.fn();

  altered.boardHash = await boardDigest(altered.pcb);
  await expect(runNativeBoard(altered, { cli, temporaryRoot })).rejects.toThrow();
  expect(cli).not.toHaveBeenCalled();
  expect(await fs.readdir(temporaryRoot)).toEqual([]);
});

it('keeps missing KiCad unresolved and removes its isolated inputs', async () => {
  const result = await runNativeBoard(request, {
    temporaryRoot,
    cli: async () => {
      throw new Error('board-validator');
    },
  });

  expect(result.issues).toEqual(['board-validator']);
  expect(result.files).toEqual({});
  expect(await fs.readdir(temporaryRoot)).toEqual([]);
});

it('cancels an active validation and waits for cleanup before rejecting', async () => {
  const abort = new AbortController();
  let entered;
  const ready = new Promise((resolve) => {
    entered = resolve;
  });
  const cli = (_args, _cwd, signal) =>
    new Promise((_resolve, reject) => {
      entered();
      signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
    });
  const pending = runNativeBoard(request, { temporaryRoot, cli, signal: abort.signal });

  await Promise.race([ready, pending]);
  abort.abort();
  await expect(pending).rejects.toThrow();
  expect(await fs.readdir(temporaryRoot)).toEqual([]);
});

it('refuses oversized and symbolic-link outputs before reading them', async () => {
  const folder = await fs.mkdtemp(path.join(temporaryRoot, 'outputs '));

  try {
    await fs.writeFile(path.join(folder, 'drc.json'), Buffer.alloc(16 * 1024 * 1024 + 1));
    await expect(checkedOutput(folder, 'drc.json')).rejects.toThrow('board-validation');
    await fs.mkdir(path.join(folder, 'target'));
    await fs.symlink(path.join(folder, 'target'), path.join(folder, 'linked.json'), 'junction');
    expect((await fs.lstat(path.join(folder, 'linked.json'))).isSymbolicLink()).toBe(true);
    await expect(checkedOutput(folder, 'linked.json')).rejects.toThrow('board-validation');
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
  }
});

it('stops an actual child and releases its working directory on cancellation', async () => {
  const abort = new AbortController();
  const cwd = await fs.mkdtemp(path.join(temporaryRoot, 'child '));
  const pending = boardProcess({
    command: process.execPath,
    args: ['-e', 'setInterval(() => {}, 1000)'],
    cwd,
    signal: abort.signal,
  });

  abort.abort();
  await expect(pending).rejects.toThrow();
  await fs.rm(cwd, { recursive: true });
});

it('bounds native stdout without accepting an incomplete process result', async () => {
  await expect(
    boardProcess({
      command: process.execPath,
      args: ['-e', 'process.stdout.write(Buffer.alloc(1048577))'],
      cwd: temporaryRoot,
    }),
  ).rejects.toThrow();
});

it('requires a coherent footprint library and a source-bound schematic', async () => {
  await expect(checkedBoardRequest({ ...request, footprints: null })).rejects.toThrow('board-format');
});

it('inspects clean routing candidates without generating fabrication outputs', async () => {
  const stackup = routeStackup({ copperMm: 0.035, dielectricMaterial: 'FR4', epsilonR: 4.5, lossTangent: 0.02 }, 1.6);
  const pcb = request.pcb.replace('(setup', `(setup ${stackup}`);
  const candidate = {
    ...request,
    pcb,
    boardHash: await boardDigest(pcb),
    mechanicalIssues: [],
    rules: { source: 'https://example.com/process', clearanceMm: 0.2, trackWidthMm: 0.25, drillMm: 0.3 },
  };
  const cli = vi.fn(async (args, cwd) => {
    if (args[0] === 'version') return '9.0.6';

    await fs.writeFile(
      path.join(cwd, 'drc.json'),
      JSON.stringify({ kicad_version: '9.0.6', violations: [], unconnected_items: [], schematic_parity: [] }),
    );

    return '';
  });
  const result = await runNativeBoard(candidate, { temporaryRoot, cli, exportFabrication: false });

  expect(result.issues).toEqual([]);
  expect(result.files).toEqual({});
  expect(cli.mock.calls.map(([args]) => args[1]).filter(Boolean)).toEqual(['drc']);
  expect(await fs.readdir(temporaryRoot)).toEqual([]);
});

it('releases native worker jobs on missing executables and cancellation', async () => {
  vi.stubEnv('BASECASE_KICAD_CLI', path.join(temporaryRoot, 'missing executable'));

  try {
    const service = new ElectricalBoards();
    const result = await service.validate({ ...request, id: 'missing-cli-worker' });

    expect(result.issues).toEqual(['board-validator']);
    expect(service.jobs.size).toBe(0);
    service.cancel('cancel-before-start');
    await expect(service.validate({ ...request, id: 'cancel-before-start' })).rejects.toThrow('board-validation');
    expect(service.jobs.size).toBe(0);

    const running = service.validate({ ...request, id: 'cancel-during-start' });

    service.cancel('cancel-during-start');
    await expect(running).rejects.toThrow();
    expect(service.jobs.size).toBe(0);
  } finally {
    vi.unstubAllEnvs();
  }
});
