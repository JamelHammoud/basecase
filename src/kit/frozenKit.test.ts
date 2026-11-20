import { expect, it } from 'vitest';
import { buildAlongSteps } from '../guide/buildAlong';
import { guideFingerprint } from '../guide/guideFingerprint';
import { buildGuidePlan } from '../guide/guidePlan';
import { approximateScene } from '../guide/guideScene';
import { fixtureMeasures, fixtureTriangles } from '../sim/fixtures/parts';
import { weld } from '../print/threeMf';
import { component } from '../wiring/fixtures';
import { wiringNetlist } from '../wiring/netlist';
import { kitManifest } from './buildKit';
import { freezeBuildKit, readFrozenKit, frozenViewParts, frozenKitContent } from './frozenKit';
import { kitFixture } from './kit.fixtures';

const designs = [
  'differential rover',
  'SO-101-style arm',
  'quadruped',
  'hexapod',
  'biped',
  'pan-tilt camera',
  'gripper',
  'conveyor mechanism',
  'mixed-servo arm',
  'repeated limb modules',
];

function jobFor(name: string) {
  const job = kitFixture(name);
  const adapters = [
    component('feetech-adapter', 'waveshare-bus-servo-adapter-a'),
    ...(name === 'mixed-servo arm' ? [component('dynamixel-adapter', 'robotis-u2d2')] : []),
  ];

  job.parts = [...job.parts, ...adapters];
  job.measures = { ...job.measures, ...fixtureMeasures(adapters) };
  job.mapInput = { ...job.mapInput, parts: job.parts };
  job.wiring = wiringNetlist(job);
  job.guide = {
    ...job.guide,
    plan: buildGuidePlan(approximateScene(name, job.parts, job.project.joints ?? []), job.project.material),
    fingerprint: guideFingerprint(name, job.parts, job.project),
  };

  return job;
}

it.each(designs)(
  'retains %s quantities, geometry, guide order, servo IDs and cable endpoints through Kit and Build Along',
  async (name) => {
    const job = jobFor(name);
    const triangles = fixtureTriangles(job.parts);
    const meshes = Object.fromEntries(job.parts.map((part) => [part.id, weld(triangles(part.id)!)]));
    const prepared = await freezeBuildKit({ job, meshes });
    const frozen = readFrozenKit(prepared);
    const manifest = kitManifest(job);
    const nets = [...job.wiring!.buses.flatMap((bus) => bus.nets), ...job.wiring!.power.nets];
    const steps = buildAlongSteps(frozen.manifest.guide, frozen.project.joints ?? [], nets);

    expect(JSON.stringify(frozen.manifest)).toBe(JSON.stringify(manifest));
    expect(frozen.manifest.guide.partIds.sort()).toEqual(job.parts.map((part) => part.id).sort());
    expect(frozen.parts).toEqual(job.parts);

    for (const part of job.parts) {
      expect(frozen.geometry[part.id].positions).toEqual(Array.from(meshes[part.id].vertices));
      expect(frozen.geometry[part.id].indices).toEqual(Array.from(meshes[part.id].indices));
    }

    for (const line of manifest.purchases.filter((line) => line.category !== 'Printed parts')) {
      const quantity = frozen.manifest.packing.filter((row) => row.key === line.key).reduce((n, row) => n + row.qty, 0);

      expect(quantity).toBe(line.qty);
    }

    expect(
      steps
        .flatMap((step) => step.servos)
        .map(({ partId, id }) => [partId, id])
        .sort(),
    ).toEqual(manifest.servos.map(({ partId, entry }) => [partId, entry.id]).sort());
    expect(
      steps
        .flatMap((step) => step.routes)
        .map((net) => [net.from.id, net.to.id])
        .sort(),
    ).toEqual(
      nets
        .filter((net) => net.from.id || net.to.id)
        .map((net) => [net.from.id, net.to.id])
        .sort(),
    );
    expect(steps.at(-1)!.shown.sort()).toEqual(job.parts.map((part) => part.id).sort());
    expect(frozenViewParts(frozen).map((part) => part.id)).toEqual(job.parts.map((part) => part.id));
  },
);

it('refuses absent geometry and incomplete output references even with a matching content hash', async () => {
  const job = kitFixture();
  const triangles = fixtureTriangles(job.parts);
  const meshes = Object.fromEntries(job.parts.map((part) => [part.id, weld(triangles(part.id)!)]));
  const frozen = readFrozenKit(await freezeBuildKit({ job, meshes }));

  delete frozen.geometry[job.parts[0].id];
  expect(() => readFrozenKit(frozenKitContent(frozen))).toThrow('geometry');
  frozen.geometry[job.parts[0].id] = {
    positions: Array.from(meshes[job.parts[0].id].vertices),
    indices: Array.from(meshes[job.parts[0].id].indices),
  };
  frozen.outputs = {};
  expect(() => readFrozenKit(frozenKitContent(frozen))).toThrow('damaged');
});
