import { withCurrentDrawings } from './drawings.fixtures';
import { expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { kitFixture } from './kit.fixtures';
import { buildKit, kitManifest } from './buildKit';
import { component } from '../wiring/fixtures';
import { editableNets, routeIdentity, updateRoute } from '../wiring/routeEditing';
import { analyzeWiring } from '../wiring/routeAnalysis';
import { fixtureMeasures } from '../sim/fixtures/parts';
import { approximateScene } from '../guide/guideScene';
import { buildGuidePlan } from '../guide/guidePlan';
import { guideFingerprint } from '../guide/guideFingerprint';
import { buildAlongSteps } from '../guide/buildAlong';

it('reconciles authored cable stock and retained rest points through Kit bytes, BOM and Build Along', async () => {
  let job = kitFixture('SO-101-style arm');
  const adapter = {
    ...component('adapter', 'waveshare-bus-servo-adapter-a'),
    position: [-60, 400, 0] as [number, number, number],
  };

  job.parts = [...job.parts, adapter];
  job.project = { ...job.project, joints: job.project.joints!.map((entry) => ({ ...entry, range: [0, 0] })) };

  const identity = routeIdentity(editableNets(job)[0])!;

  job.project = updateRoute(job, identity, {
    supplyId: 'waveshare-servo-cable-5264-900',
    anchors: [{ partId: adapter.id, position: [0, 80, 0] }],
  });
  job.measures = { ...job.measures, ...fixtureMeasures([adapter]) };
  job.mapInput = { ...job.mapInput, parts: job.parts, project: job.project };
  job.guide = {
    ...job.guide,
    plan: buildGuidePlan(approximateScene(job.name, job.parts, job.project.joints ?? []), job.project.material),
    fingerprint: guideFingerprint(job.name, job.parts, job.project),
  };
  job.wiring = analyzeWiring(job, []);
  job = await withCurrentDrawings(job);

  const manifest = kitManifest(job);
  const bytes = await buildKit(job);
  const files = unzipSync(bytes);
  const stored = JSON.parse(strFromU8(files['kit.json']));
  const cable = manifest.purchases.find((line) => line.key === 'supply:waveshare-servo-cable-5264-900');
  const nets = [...job.wiring!.buses.flatMap((bus) => bus.nets), ...job.wiring!.power.nets];
  const steps = buildAlongSteps(job.guide.plan, job.project.joints ?? [], nets);
  const connection = steps.flatMap((step) => step.routes).find((net) => net.from.id === 'adapter')!;

  expect(cable).toMatchObject({ qty: 1, packs: 1 });
  expect(manifest.packing.filter((row) => row.key === cable!.key).reduce((sum, row) => sum + row.qty, 0)).toBe(1);
  expect(stored.wiring).toEqual(job.wiring);
  expect(stored.purchases.find((line: { key: string }) => line.key === cable!.key)).toEqual(cable);
  expect(connection.route).toMatchObject({
    cableSupplyId: 'waveshare-servo-cable-5264-900',
    points: expect.arrayContaining([[-60, 480, 0]]),
  });
  expect(stored.servos).toEqual(manifest.servos);
});
