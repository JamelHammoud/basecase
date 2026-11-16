import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { buildBom } from '../utils/bom';
import { hardwareKey } from '../utils/bom';
import { robotPackageFiles } from '../sim/robotPackage/buildRobotPackage';
import { fixturePackageJob } from '../sim/fixtures/robotPackage';
import { readinessOf } from '../readiness/readiness';
import { buildKit, kitManifest } from './buildKit';
import { kitFixture, kitFixtureNames } from './kit.fixtures';

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe('manufacturing kit reconciliation', () => {
  it.each(kitFixtureNames)('reconciles %s through the real producers', (name) => {
    const job = kitFixture(name);
    const screw = job.parts.find((p) => p.hardware)!;

    job.purchases = { [hardwareKey(screw.hardware!)]: { onHand: name === 'partly owned hardware' ? 1 : 0 } };

    const bom = buildBom(job);
    const manifest = kitManifest(job);
    const files = unzipSync(buildKit(job));

    expect(manifest.purchases).toEqual(bom.lines);

    for (const line of bom.lines.filter((line) => line.category !== 'Printed parts')) {
      expect(sum(manifest.packing.filter((row) => row.key === line.key).map((row) => row.qty))).toBe(line.qty);
    }

    expect(manifest.printed.map((p) => p.id).sort()).toEqual(bom.printed.map((p) => p.id).sort());

    for (const part of manifest.printed) {
      expect(part.outputs.length).toBeGreaterThan(0);

      for (const output of part.outputs) {
        const plate = unzipSync(files[`plates/${output.file}`]);

        expect(strFromU8(plate['3D/3dmodel.model'])).toContain('<mesh>');
        expect(strFromU8(plate['3D/3dmodel.model'])).toContain(part.name);
      }
    }

    const packageJob = fixturePackageJob({ id: name, parts: job.parts, joints: job.project.joints ?? [] }).job;
    const map = JSON.parse(strFromU8(robotPackageFiles(packageJob)['joint_map.json']));

    if (name === 'repeated limb modules') expect(manifest.guide.modules.some((module) => module.repeatOf)).toBe(true);

    if (name === 'partly owned hardware')
      expect(manifest.purchases.some((line) => line.owned > 0 && line.toBuy > 0)).toBe(true);

    if (name === 'mixed-servo arm') expect(new Set(manifest.servos.map((servo) => servo.entry.family)).size).toBe(2);

    if (name === 'multi-material chassis') expect(Object.keys(job.files).sort()).toEqual(['PETG', 'PLA']);

    expect(manifest.packing.flatMap((row) => row.partIds)).toHaveLength(job.parts.length);
    expect(new Set(manifest.packing.flatMap((row) => row.partIds)).size).toBe(job.parts.length);

    expect(manifest.servos.map((servo) => servo.entry)).toEqual(map.joints);
    expect(JSON.parse(strFromU8(files['joint_map.json']))).toEqual(map);
    expect(manifest.packing.some((row) => row.step && row.module)).toBe(true);
    expect(manifest.packing.some((row) => row.step === null)).toBe(true);
    expect(files['build-guide.html']).toBeDefined();
    expect(files['packing.csv']).toBeDefined();
    expect(files['servos.csv']).toBeDefined();
  });

  it('records Checks freshness and retains the measured verdict', () => {
    const job = kitFixture();

    job.checks = readinessOf([], { parts: job.parts, fingerprint: 'previous', rows: [] });
    job.checksFingerprint = 'current';
    expect(kitManifest(job).checks).toEqual({ freshness: 'stale', result: job.checks });
    job.checksFingerprint = 'previous';
    expect(kitManifest(job).checks.freshness).toBe('current');
  });

  it('keeps owned hardware in its assembly bag', () => {
    const job = kitFixture();
    const key = hardwareKey(job.parts.find((p) => p.hardware)!.hardware!);

    job.purchases = { [key]: { onHand: 10 } };

    const manifest = kitManifest(job);

    expect(manifest.purchases.find((line) => line.key === key)?.toBuy).toBe(0);
    expect(sum(manifest.packing.filter((line) => line.key === key).map((line) => line.qty))).toBe(1);
  });

  it.each([
    'guide',
    'geometry',
    'plate',
    'identity',
    'sheet',
    'duplicate file',
    'extra identity',
    'step coverage',
  ] as const)('refuses missing or unsupported %s', (fault) => {
    const job = kitFixture();

    if (fault === 'guide') job.guide.fingerprint = 'stale';

    if (fault === 'geometry') delete job.measures[job.parts[0].id];

    if (fault === 'plate') job.files = {};

    if (fault === 'identity') job.parts.find((p) => p.componentId)!.componentVariant = 'missing';

    if (fault === 'sheet') job.parts[0].sheet = { material: 'aluminum-6061', thicknessMm: 3.18 };

    if (fault === 'duplicate file') job.spec.files.push(job.spec.files[0]);

    if (fault === 'extra identity') job.project.extras = [{ key: 'supply:missing', qty: 1 }];

    if (fault === 'step coverage') job.guide.plan.steps = [];

    expect(() => buildKit(job)).toThrow();
  });

  it('preserves unproven steps without conferring readiness', () => {
    const job = kitFixture();

    job.guide.plan.steps[0].unproven = true;

    const manifest = kitManifest(job);

    expect(manifest.guide.steps[0].unproven).toBe(true);
    expect(manifest.checks.freshness).toBe('not run');
    expect(manifest).not.toHaveProperty('ready');
  });
});
