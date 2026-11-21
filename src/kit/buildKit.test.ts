import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { buildBom } from '../utils/bom';
import { hardwareKey } from '../utils/bom';
import { robotPackageFiles } from '../sim/robotPackage/buildRobotPackage';
import { fixturePackageJob } from '../sim/fixtures/robotPackage';
import { readinessOf } from '../readiness/readiness';
import { buildGuidePlan } from '../guide/guidePlan';
import { approximateScene } from '../guide/guideScene';
import { guideFingerprint } from '../guide/guideFingerprint';
import { buildKit, kitManifest } from './buildKit';
import { drawnKitFixture, withCurrentDrawings } from './drawings.fixtures';
import { kitFixtureNames } from './kit.fixtures';
import type { KitJob, KitManifest } from './types';

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

function expectPrintedOutputs(job: KitJob, manifest: KitManifest, files: Record<string, Uint8Array>) {
  for (const part of manifest.printed) {
    const copies = job.parts.find((source) => source.id === part.id)?.print?.copies ?? 1;

    expect(part.outputs).toHaveLength(copies);
    expect(sum(manifest.packing.filter((row) => row.key === part.key).map((row) => row.qty))).toBe(
      manifest.printed
        .filter((source) => source.key === part.key)
        .reduce((total, source) => total + source.outputs.length, 0),
    );

    for (const output of part.outputs) {
      const plate = unzipSync(files[`plates/${output.file}`]);

      expect(strFromU8(plate['3D/3dmodel.model'])).toContain('<mesh>');
      expect(strFromU8(plate['3D/3dmodel.model'])).toContain(part.name);
    }
  }
}

function expectWorkflow(job: KitJob, manifest: KitManifest) {
  const name = job.name;

  if (name === 'repeated limb modules') expect(manifest.guide.modules.some((module) => module.repeatOf)).toBe(true);

  if (name === 'mixed sheet-and-printed')
    expect(manifest.purchases.some((line) => line.owned > 0 && line.toBuy > 0)).toBe(true);

  if (name === 'mixed-servo arm') expect(new Set(manifest.servos.map((servo) => servo.entry.family)).size).toBe(2);

  if (name === 'multi-material chassis') expect(Object.keys(job.files).sort()).toEqual(['PETG', 'PLA']);
}

describe('manufacturing kit reconciliation', () => {
  it.each(kitFixtureNames)('reconciles %s through the real producers', async (name) => {
    const job = await drawnKitFixture(name);
    const screw = job.parts.find((p) => p.hardware)!;

    job.purchases = { [hardwareKey(screw.hardware!)]: { onHand: 1 } };

    const bom = buildBom(job);
    const manifest = kitManifest(job);
    const files = unzipSync(await buildKit(job));

    expect(manifest.purchases).toEqual(bom.lines);
    expect(manifest.purchases.find((line) => line.key === hardwareKey(screw.hardware!))).toMatchObject({
      qty: 2,
      owned: 1,
      toBuy: 1,
    });

    for (const line of bom.lines.filter((line) => line.category !== 'Printed parts')) {
      expect(sum(manifest.packing.filter((row) => row.key === line.key).map((row) => row.qty))).toBe(line.qty);
    }

    expect(manifest.printed.map((p) => p.id).sort()).toEqual(bom.printed.map((p) => p.id).sort());

    expectPrintedOutputs(job, manifest, files);

    const packageJob = fixturePackageJob({ id: name, parts: job.parts, joints: job.project.joints ?? [] }).job;
    const map = JSON.parse(strFromU8(robotPackageFiles(packageJob)['joint_map.json']));

    expectWorkflow(job, manifest);

    expect(manifest.packing.flatMap((row) => row.partIds)).toHaveLength(job.parts.length);
    expect(new Set(manifest.packing.flatMap((row) => row.partIds)).size).toBe(job.parts.length);

    expect(manifest.wiring).toEqual(job.wiring);
    expect(manifest.wiring?.buses.flatMap((bus) => bus.servos.map((servo) => servo.id)).sort()).toEqual(
      manifest.servos.map((servo) => servo.partId).sort(),
    );

    for (const bus of manifest.wiring?.buses ?? []) {
      expect(bus.nets.map((net) => net.to.id)).toEqual(bus.servos.map((servo) => servo.id));
    }

    expect(manifest.servos.map((servo) => servo.entry)).toEqual(map.joints);
    expect(JSON.parse(strFromU8(files['joint_map.json']))).toEqual(map);
    expect(manifest.packing.some((row) => row.step && row.module)).toBe(true);
    expect(manifest.packing.some((row) => row.step === null)).toBe(true);

    const provenance = JSON.parse(strFromU8(files['provenance.json']));

    expect(provenance.parts).toEqual(job.parts);
    expect(JSON.stringify(provenance.printPlan)).toBe(JSON.stringify(job.print.plan));
    expect(JSON.stringify(provenance.printSpec)).toBe(JSON.stringify(job.spec));

    if (name === 'repeated limb modules')
      expect(manifest.printed.every((part) => part.outputs.length === 2)).toBe(true);

    if (name === 'mixed sheet-and-printed') {
      expect(manifest.sheets).toHaveLength(1);
      expect(strFromU8(files[manifest.sheets[0].file])).toContain('$INSUNITS\n70\n4');
    }

    expect(files['build-guide.html']).toBeDefined();
    expect(files['packing.csv']).toBeDefined();
    expect(files['servos.csv']).toBeDefined();
  });

  it('records Checks freshness and retains the measured verdict', async () => {
    const job = await drawnKitFixture();

    job.checks = readinessOf([], { parts: job.parts, fingerprint: 'previous', rows: [] });
    job.checksFingerprint = 'current';
    expect(kitManifest(job).checks).toEqual({ freshness: 'stale', result: job.checks });
    job.checksFingerprint = 'previous';
    expect(kitManifest(job).checks.freshness).toBe('current');
  });

  it('keeps owned hardware in its assembly bag', async () => {
    const job = await drawnKitFixture();
    const key = hardwareKey(job.parts.find((p) => p.hardware)!.hardware!);

    job.purchases = { [key]: { onHand: 10 } };

    const manifest = kitManifest(job);

    expect(manifest.purchases.find((line) => line.key === key)?.toBuy).toBe(0);
    expect(sum(manifest.packing.filter((line) => line.key === key).map((line) => line.qty))).toBe(2);
  });

  it('packs an exact extra catalog version as unassigned demand', async () => {
    const job = await drawnKitFixture();
    const key = 'component:feetech-sts3215|c018';

    job.project.extras = [{ key, qty: 2 }];

    const manifest = kitManifest(await withCurrentDrawings(job));

    expect(manifest.packing.find((row) => row.key === key)).toMatchObject({ qty: 2, partIds: [], step: null });
    expect(manifest.purchases.find((row) => row.key === key)?.qty).toBe(2);
  });

  it('refuses a driven actuator absent from physical assembly demand', async () => {
    const job = await drawnKitFixture();
    const part = job.parts.find((part) => part.id === job.project.joints?.[0].actuators?.[0])!;

    part.role = 'cutout';
    job.guide.plan = buildGuidePlan(
      approximateScene(job.name, job.parts, job.project.joints ?? []),
      job.project.material,
    );
    job.guide.fingerprint = guideFingerprint(job.name, job.parts, job.project);

    await expect(buildKit(job)).rejects.toThrow('one exact actuator identity');
  });

  it.each([
    'guide',
    'geometry',
    'plate',
    'identity',
    'sheet',
    'duplicate file',
    'extra identity',
    'extra version',
    'step coverage',
  ] as const)('refuses missing or unsupported %s', async (fault) => {
    const job = await drawnKitFixture();

    if (fault === 'guide') job.guide.fingerprint = 'stale';

    if (fault === 'geometry') delete job.measures[job.parts[0].id];

    if (fault === 'plate') job.files = {};

    if (fault === 'identity') job.parts.find((p) => p.componentId)!.componentVariant = 'missing';

    if (fault === 'sheet') job.parts[0].sheet = { material: 'aluminum-6061', thicknessMm: 3.18 };

    if (fault === 'duplicate file') job.spec.files.push(job.spec.files[0]);

    if (fault === 'extra identity') job.project.extras = [{ key: 'supply:missing', qty: 1 }];

    if (fault === 'extra version') job.project.extras = [{ key: 'component:feetech-sts3215', qty: 1 }];

    if (fault === 'step coverage') job.guide.plan.steps = [];

    await expect(buildKit(job)).rejects.toThrow();
  });

  it('preserves unproven steps without conferring readiness', async () => {
    const job = await drawnKitFixture();

    job.guide.plan.steps[0].unproven = true;

    const manifest = kitManifest(job);

    expect(manifest.guide.steps[0].unproven).toBe(true);
    expect(manifest.checks.freshness).toBe('not run');
    expect(manifest).not.toHaveProperty('ready');
  });
});
