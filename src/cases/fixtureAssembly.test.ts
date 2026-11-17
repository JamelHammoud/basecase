import { expect, it } from 'vitest';
import { fixtureModelValues } from './reusedFixture';
import { captureCaseFixture, placeCaseFixture } from './fixtureAssembly';
import { box } from '../sim/fixtures/parts';
import type { RobotJoint } from '../types/robotics';
import { parseCase, worldItem } from './schema';
import { buildCase, builderRobot } from './caseBuilder';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import { DEFAULT_PROJECT } from '../types/robotics';
import { sharedScene, encodeSceneFile, decodeSceneFile } from '../utils/sceneFile';
import { galleryBundleOf } from '../gallery/buildBundle';
import { galleryBundleBytes, readGalleryBundleBytes } from '../gallery/galleryBundle';

function source() {
  const base = box('base', [0, 10, 0], [100, 20, 80], 60);
  const lid = {
    ...box('lid', [0, 25, 0], [100, 10, 80], 20),
    cad: {
      language: 'replicad' as const,
      code: 'return r.makeBox(100, 10, 80);',
      positions: [0, 0, 0, 10, 0, 0, 0, 10, 0],
      indices: [0, 1, 2],
      originOffset: [0, 0, 0] as [number, number, number],
      baseSize: [100, 10, 80] as [number, number, number],
    },
  };
  const joint: RobotJoint = {
    id: 'hinge',
    name: 'Hinge',
    type: 'revolute',
    parent: ['base'],
    child: ['lid'],
    origin: [0, 25, 40],
    axis: [1, 0, 0],
    range: [0, 85],
    actuation: 'passive',
    damping: 0.001,
    frictionloss: 0.002,
  };

  return { parts: [base, lid], joints: [joint] };
}

it('captures an assembly into Library and isolates Case placement and physics while retaining printable geometry', async () => {
  const assembly = source();
  const model = await captureCaseFixture({ ...assembly, name: 'Chest' });
  const first = placeCaseFixture(model, { position: [100, 0, 200] });
  const second = placeCaseFixture(model, { position: [300, 0, 200] });

  expect(model.caseFixture).toBe(true);
  expect(first.find((o) => o.joint)?.joint).toMatchObject({ range: [0, 85], damping: 0.001, frictionloss: 0.002 });
  expect(worldItem(first[1]).cad).toEqual(assembly.parts[1].cad);
  expect(first[1].massSource).toBe('supplied');
  first[1].joint!.range[1] = 45;
  first[1].position[0] = 999;
  expect(second[1].joint!.range).toEqual([0, 85]);
  expect(second[1].position[0]).toBe(300);
  expect(model.joints![0].range).toEqual([0, 85]);
});

it('retains captured geometry, provenance and topology through compressed scenes and shared bundles', async () => {
  const model = await captureCaseFixture({ ...source(), name: 'Chest' });
  const robot = fixtureRobots().find((r) => r.id === 'arm-6dof')!;
  const made = buildCase(
    { goal: 'lid', world: 'floor' },
    builderRobot(buildRig(robot.joints, robot.parts), robot.parts),
  );

  if (!made.ok) throw new Error(made.problem);

  const kase = parseCase({
    ...made.kase,
    world: { objects: placeCaseFixture(model, { position: [100, 0, 200] }) },
    reference: { timeline: [] },
    task: {
      ...made.kase.task,
      probes: [],
      contract: {
        version: 1,
        success: {
          eventually: {
            window: 'whole',
            state: { atom: { expr: { signal: 'fixture-1-travel' }, cmp: '>', value: 40, scale: 85 } },
          },
        },
        failures: [],
      },
    },
  });
  const scene = sharedScene({
    name: 'Chest',
    globalGoal: '',
    parts: robot.parts,
    project: { ...DEFAULT_PROJECT, joints: robot.joints, cases: [kase] },
  });
  const restored = await decodeSceneFile(await encodeSceneFile(scene));
  const shared = readGalleryBundleBytes(
    galleryBundleBytes(
      galleryBundleOf({
        slug: 'chest',
        title: 'Chest',
        robotName: robot.id,
        parts: robot.parts,
        joints: robot.joints,
        kase,
      }),
    ),
  );

  expect(parseCase(restored.project!.cases![0]).world.objects).toEqual(kase.world.objects);
  expect(shared.case.world.objects).toEqual(kase.world.objects);
});

it('identifies estimated masses and refuses an incomplete or powered assembly', async () => {
  const assembly = source();

  delete assembly.parts[1].massG;

  const model = await captureCaseFixture({ ...assembly, name: 'Chest' });

  expect(placeCaseFixture(model, { position: [0, 0, 0] })[1].massSource).toBe('estimated');
  await expect(captureCaseFixture({ ...assembly, parts: assembly.parts.slice(1), name: 'Lid' })).rejects.toThrow();
  assembly.joints[0].actuation = 'powered';
  await expect(captureCaseFixture({ ...assembly, name: 'Chest' })).rejects.toThrow();
});

it('resolves mounted local frames before resizing and translating an assembly', async () => {
  const assembly = source();

  assembly.joints[0].frame = { part: 'base', origin: [20, 15, 40], axis: [1, 0, 0] };

  const model = await captureCaseFixture({ ...assembly, name: 'Mounted lid' });
  const objects = placeCaseFixture(model, { position: [300, 20, 100], size: [160, 30, 160] });

  expect(objects.find((object) => object.joint)!.joint!.origin).toEqual([332, 30, 180]);
  expect(model.joints![0].frame!.origin).toEqual([20, 15, 40]);
});

it('refuses unbounded passive stops and contradictory actuator references', async () => {
  const assembly = source();

  delete assembly.joints[0].range;
  await expect(captureCaseFixture({ ...assembly, name: 'Lid' })).rejects.toThrow(/limits/);
  assembly.joints[0].range = [0, 85];
  assembly.joints[0].actuators = ['base'];
  await expect(captureCaseFixture({ ...assembly, name: 'Lid' })).rejects.toThrow(/passive/);
});

it('refuses joint declarations whose motion would be lost through overlapping child ownership', async () => {
  const assembly = source();

  assembly.joints.push({ ...assembly.joints[0], id: 'second-hinge' });
  await expect(captureCaseFixture({ ...assembly, name: 'Broken assembly' })).rejects.toThrow(/joint/);
});

it('uses the resolved mounted frame for source height rather than its stale world pivot', async () => {
  const assembly = source();

  assembly.joints[0].frame = { part: 'base', origin: [20, 40, 40], axis: [1, 0, 0] };

  const model = await captureCaseFixture({ ...assembly, name: 'Mounted lid' });

  expect(fixtureModelValues(model).heightMm).toBe(50);
});
