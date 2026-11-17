import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { routeNativeBoard } from './route.mjs';
import { boardProcess } from './process.mjs';
import { electricalScenes } from '../../src/wiring/electricalFixtures';
import { defineBoard } from '../../src/wiring/boardDefinition';
import { electricalPackage } from '../../src/wiring/electricalPackage';
import { nativeBoardRequest } from '../../src/wiring/boardRoutingPackage';
import { boardDigest } from '../../src/wiring/boardNativeContract.mjs';

vi.mock('./routeTools.mjs', async (original) => ({
  ...(await original()),
  verifyRoutingRuntime: async () => undefined,
}));

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
const tools = async () => ({ java: 'router', python: 'converter', jar: 'pinned.jar' });
const dsn =
  '(pcb robot.dsn (parser (host_version "9.0.6")) (resolution um 10) (unit um) (structure (layer F.Cu (type signal)) (layer B.Cu (type signal))) (library) (network) (wiring))';
const ses = '(session robot (base_design robot) (routes (resolution um 10) (network_out)))';
let request;
let temporaryRoot;

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
  temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'routing-faults-'));
});

afterAll(async () => {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
});

async function stage(options, mode) {
  const { cwd, command, args } = options;

  if (command === 'router') return routeStage(options, mode);

  if (args[1] === 'dsn') return dsnStage(options, mode);

  const pcb = await fs.readFile(path.join(cwd, 'robot.kicad_pcb'), 'utf8');

  await fs.writeFile(
    path.join(cwd, 'candidate.kicad_pcb'),
    mode === 'incompatible' ? pcb.replace('BasecaseSource', 'OtherSource') : pcb,
  );

  return '';
}

async function dsnStage({ cwd, signal }, mode) {
  if (mode === 'directory-limit') {
    await Promise.all(Array.from({ length: 65 }, (_, i) => fs.writeFile(path.join(cwd, `extra-${i}`), 'x')));
    signal.throwIfAborted();
    await new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
    );
  }

  const text = mode === 'malicious-dsn' ? dsn.replace('(wiring)', '(wiring (include "../../secret"))') : dsn;

  await fs.writeFile(path.join(cwd, 'robot.dsn'), mode === 'output-limit' ? ' '.repeat(8 * 1024 * 1024 + 1) : text);

  return '';
}

async function routeStage(options, mode) {
  if (mode === 'process-failure') throw new Error('board-validation');

  if (mode === 'malformed') return '';

  const text = mode === 'malicious-ses' ? '(session robot (file "../../secret"))' : ses;

  await fs.writeFile(path.join(options.cwd, 'robot.ses'), text);

  return '';
}

it.each([
  'malicious-dsn',
  'malicious-ses',
  'incompatible',
  'malformed',
  'output-limit',
  'directory-limit',
  'process-failure',
])('preserves source and removes all job files after %s', async (mode) => {
  const input = { request, plan };
  const original = structuredClone(input);
  const execute = vi.fn((options) => stage(options, mode));
  const reason = {
    'malicious-dsn': 'board-format',
    'malicious-ses': 'board-format',
    incompatible: 'board-source',
    malformed: 'board-route-failed',
    'output-limit': 'board-route-limit',
    'directory-limit': 'board-route-limit',
    'process-failure': 'board-route-failed',
  }[mode];

  await expect(routeNativeBoard(input, { temporaryRoot, tools, execute })).rejects.toThrow(reason);
  expect(input).toEqual(original);
  expect(await fs.readdir(temporaryRoot)).toEqual([]);

  if (mode === 'malicious-dsn')
    expect(execute.mock.calls.some(([options]) => options.command === 'router')).toBe(false);

  if (mode === 'malicious-ses') expect(execute.mock.calls.some(([options]) => options.args[1] === 'ses')).toBe(false);
});

it('bounds the whole routing operation and cleans a deadline refusal', async () => {
  const nativeTimeout = globalThis.setTimeout;
  let expire;
  const timer = vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay, ...args) => {
    if (delay === 40_000) expire = callback;

    return nativeTimeout(callback, delay, ...args);
  });
  const execute = async (options) => {
    if (options.command !== 'router') return stage(options, 'normal');

    expire();
    options.signal.throwIfAborted();
  };

  try {
    await expect(routeNativeBoard({ request, plan }, { temporaryRoot, tools, execute })).rejects.toThrow(
      'board-route-limit',
    );
    expect(await fs.readdir(temporaryRoot)).toEqual([]);
  } finally {
    timer.mockRestore();
  }
});

it('cancels and joins a running child before removing the isolated routing job', async () => {
  const abort = new AbortController();
  let entered;
  const ready = new Promise((resolve) => {
    entered = resolve;
  });
  const execute = (options) => {
    if (options.command !== 'router') return stage(options, 'normal');

    const running = boardProcess({
      command: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      cwd: options.cwd,
      signal: options.signal,
    });

    entered();

    return running;
  };
  const running = routeNativeBoard({ request, plan }, { temporaryRoot, tools, execute, signal: abort.signal });

  await ready;
  abort.abort();
  await expect(running).rejects.toThrow();
  expect(await fs.readdir(temporaryRoot)).toEqual([]);
});
