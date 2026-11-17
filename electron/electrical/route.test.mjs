import { boardProcess } from './process.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { electricalScenes } from '../../src/wiring/electricalFixtures';
import { defineBoard } from '../../src/wiring/boardDefinition';
import { electricalPackage } from '../../src/wiring/electricalPackage';
import { nativeBoardRequest } from '../../src/wiring/boardRoutingPackage';
import { boardDigest } from '../../src/wiring/boardNativeContract.mjs';
import { routeNativeBoard } from './route.mjs';

let request;
let temporaryRoot;
const plan = {
  source: 'https://example.com/design',
  trackWidthMm: 0.4,
  clearanceMm: 0.25,
  viaDiameterMm: 0.8,
  viaDrillMm: 0.4,
  copperMm: 0.035,
  dielectricMaterial: 'FR4',
  epsilonR: 4.5,
  lossTangent: 0.02,
  special: '',
};
const rules = { source: 'https://example.com/process', clearanceMm: 0.2, trackWidthMm: 0.25, drillMm: 0.3 };

beforeAll(async () => {
  const scene = electricalScenes().find((entry) => entry.name === 'dual-bus-arm').scene;
  const { board, part } = defineBoard(scene, 'board');
  const prepared = await electricalPackage({
    parts: [...scene.parts, part],
    project: { ...scene.project, electronicsBoard: board },
  });
  const pcb = prepared.files['robot.kicad_pcb'];

  prepared.files['current-unrouted.kicad_pcb'] = pcb;
  request = await nativeBoardRequest(prepared, {
    schema: 1,
    pcb,
    hash: await boardDigest(pcb),
    sourceFingerprint: prepared.sourceFingerprint,
    rules,
  });
  request.mechanicalIssues = [];
  temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'board-route-test-'));
});

afterAll(async () => {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
});

it('refuses missing tools without altering input and cleans its isolated job', async () => {
  const input = { request, plan };
  const original = structuredClone(input);

  await expect(
    routeNativeBoard(input, {
      temporaryRoot,
      tools: async () => {
        throw new Error('board-router');
      },
    }),
  ).rejects.toThrow('board-router');
  expect(input).toEqual(original);
  expect(await fs.readdir(temporaryRoot)).toEqual([]);
});

it('refuses existing copper before executing a tool', async () => {
  const pcb = request.pcb.replace(/\)\s*$/u, '(segment (start 0 0) (end 1 1) (width 0.4) (layer "F.Cu") (net 1)))');
  const changed = { ...request, pcb, boardHash: await boardDigest(pcb) };
  const tools = vi.fn();

  await expect(routeNativeBoard({ request: changed, plan }, { tools, temporaryRoot })).rejects.toThrow(
    'board-route-copper',
  );
  expect(tools).not.toHaveBeenCalled();
});

it.each([
  { plan: null },
  { plan: { ...plan, special: 'differential pairs' } },
  { plan: { ...plan, trackWidthMm: 0.1 } },
  { plan: { ...plan, viaDiameterMm: 0.3 } },
  { plan, command: '/bin/sh' },
])('refuses unsafe and unsupported route requests before tool discovery', async (patch) => {
  const tools = vi.fn();

  await expect(routeNativeBoard({ request, ...patch }, { tools, temporaryRoot })).rejects.toThrow();
  expect(tools).not.toHaveBeenCalled();
});

it('refuses a cancelled route before tool discovery', async () => {
  const abort = new AbortController();
  const tools = vi.fn();

  abort.abort();
  await expect(routeNativeBoard({ request, plan }, { tools, temporaryRoot, signal: abort.signal })).rejects.toThrow();
  expect(tools).not.toHaveBeenCalled();
});

it('retains resource refusal categories while stopping and joining an actual child', async () => {
  await expect(
    boardProcess({
      command: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      cwd: temporaryRoot,
      observe: (_pid, stop) => {
        queueMicrotask(() => stop(new Error('board-route-limit')));

        return async () => undefined;
      },
    }),
  ).rejects.toThrow('board-route-limit');
});
