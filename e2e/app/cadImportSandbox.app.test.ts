import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  expectedImports,
  runConverterSelfTest,
  startCadImportWorld,
  UNSANDBOXED,
  type CadImportWorld,
  type ImportOutcome,
  type SelfTestReport,
} from './cadImportHarness';
import { allowedProbes } from './kernelProbes';
import { appResources, packagedBinary } from './packagedApp';

const HANG_MS = 3000;
const HANG_STOPPED_WITHIN_MS = 10000;
const MEMORY_MS = 60000;
const MEMORY_STOPPED_WITHIN_MS = 90000;
const PROBE_MS = 5000;
const RESULT_FIELDS = ['size', 'originOffset', 'triangles', 'holes', 'members'];

let world: CadImportWorld;
let report: SelfTestReport;

beforeAll(async () => {
  world = await startCadImportWorld();
  report = await runConverterSelfTest(world, { hangMs: HANG_MS, memoryMs: MEMORY_MS });
}, 900000);

afterAll(async () => {
  await world?.close();
});

const sameResult = (outcome: ImportOutcome | undefined) =>
  Object.fromEntries(RESULT_FIELDS.map((field) => [field, outcome?.result?.[field]]));

function expectSameAsBefore(name: string, outcome: ImportOutcome | undefined) {
  const expected = expectedImports()[name];

  expect(outcome?.error, name).toBe(expected.error);
  expect(outcome?.sha256, name).toBe(expected.sha256);

  if (expected.result) expect(sameResult(outcome), name).toEqual(sameResult(expected));
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 2000));

describe('cadimport sandbox', () => {
  it('cadimport sandbox converts the fixtures to the same GLB bytes as before the move', () => {
    for (const name of ['plate.step', 'plate.zip', 'tetra.stl']) expectSameAsBefore(name, report.imports[name]);

    const app = appResources(packagedBinary());

    for (const left of ['electron/cadImport/nodeHost', 'node_modules/occt-import-js']) {
      expect(fs.existsSync(path.join(app, left)), left).toBe(false);
    }

    expect(fs.existsSync(path.join(app, 'dist', 'kernel', 'convert.js'))).toBe(true);
  });

  it('cadimport sandbox opens each body of a dropped STEP, and fails closed on a broken one', () => {
    expect(report.opens['broken.step']?.error).toMatch(/couldn’t read/);
    expect(report.opens['broken.step']?.bodies).toBeUndefined();
    expect(report.opens['two-bodies-inch.step']?.bodies?.map((b) => b.name)).toEqual(['Base Plate', 'Post']);
  });

  it('cadimport sandbox denies files, writes, network, processes and the environment to converter code', async () => {
    const probes = report.reach.probes ?? {};

    expect(report.reach.ok, report.reach.error).toBe(true);
    expect(Object.keys(probes).length).toBeGreaterThan(20);
    expect(report.reach.ms).toBeLessThan(Object.keys(probes).length * PROBE_MS);
    expect(allowedProbes(probes)).toEqual([]);

    await settle();
    expect(world.hits).toEqual([]);
    expect(world.leftBehind()).toEqual([]);
  });

  it('cadimport sandbox recovers from a parse that never returns and one that eats memory', () => {
    expect(report.hang?.stopped.ok).toBe(false);
    expect(report.hang?.stopped.error).toMatch(/took too long/);
    expect(report.hang?.stopped.ms).toBeLessThan(HANG_STOPPED_WITHIN_MS);
    expectSameAsBefore('plate.step', report.hang?.next);

    expect(report.memory?.stopped.ok).toBe(false);
    expect(report.memory?.stopped.error).toMatch(/converter stopped|took too long|out of memory|allocation failed/i);
    expect(report.memory?.stopped.ms).toBeLessThan(MEMORY_STOPPED_WITHIN_MS);
    expectSameAsBefore('plate.step', report.memory?.next);
  });

  it(`cadimport sandbox canary claims denial (fails by design when BASECASE_CADIMPORT_UNSANDBOXED=1: ${UNSANDBOXED})`, async () => {
    const probes = report.reach.probes;

    if (!probes || Object.keys(probes).length < 20) return;

    await settle();
    expect({ allowed: allowedProbes(probes), hits: world.hits, written: world.leftBehind() }).toEqual({
      allowed: [],
      hits: [],
      written: [],
    });
  });
});
