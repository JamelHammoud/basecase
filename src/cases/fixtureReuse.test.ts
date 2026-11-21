import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig, type V3 } from '../utils/kinematics';
import { buildCase, builderRobot, type CaseSpec } from './caseBuilder';
import { captureCaseFixture } from './fixtureAssembly';
import { fixtureScene } from './fixtureScenes.fixtures';
import { runCase } from './testing';
import { box } from '../sim/fixtures/parts';

const arm = fixtureRobots().find((robot) => robot.id === 'arm-6dof')!;
const robot = builderRobot(buildRig(arm.joints, arm.parts), arm.parts);

function made(spec: CaseSpec) {
  const result = buildCase(spec, robot);

  if (!result.ok) throw new Error(result.problem);

  return result.kase;
}

it('reuses a captured assembly through the existing Case builder with independent dimensions, placement and resistance', async () => {
  const original = made({ goal: 'lid', world: 'floor' });
  const fixture = await captureCaseFixture(fixtureScene(original, 'Lid'));
  const first = made({ goal: 'lid', world: 'floor', fixture });
  const second = made({
    goal: 'lid',
    world: 'floor',
    fixture,
    values: { fixtureWidthMm: 100, fixtureTravel: 35, fixtureFriction: 3, distanceMm: 220 },
  });
  const a = first.world.objects.find((object) => object.joint)!;
  const b = second.world.objects.find((object) => object.joint)!;

  expect(a.geometry).toBeDefined();
  expect(a.size[0]).toBe(70);
  expect(b.size[0]).toBe(100);
  expect(a.joint!.range).toEqual([0, 50]);
  expect(b.joint!.range).toEqual([0, 35]);
  expect(b.joint!.frictionloss).toBeCloseTo(0.003, 12);
  expect(a.position).not.toEqual(b.position);
  expect(fixture.joints![0].range).toEqual([0, 50]);

  const mj = await loadMujoco();

  expect((await runCase(mj, first, arm, { controller: 'reference' })).passed).toBe(true);
});

it('runs a captured chest with edited width through the complete reference', async () => {
  const fixture = await captureCaseFixture(fixtureScene(made({ goal: 'chest', world: 'floor' }), 'Chest'));
  const kase = made({ goal: 'chest', world: 'floor', fixture, values: { fixtureWidthMm: 100 } });
  const mj = await loadMujoco();

  expect((await runCase(mj, kase, arm, { controller: 'reference', record: true })).passed).toBe(true);
});

it('preserves supplied limits and small masses and rejects a fixture with the wrong motion type', async () => {
  const fixture = await captureCaseFixture(fixtureScene(made({ goal: 'lid', world: 'floor' }), 'Lid'));
  const joint = fixture.joints!.find((item) => item.type !== 'fixed')!;
  const node = fixture.nodes.find((item) => joint.child.includes(item.id))!;

  joint.range = [-175, 175];
  joint.stiffness = 15000;
  joint.springref = 12.5;
  node.part!.massG = 0.5;

  const kase = made({ goal: 'lid', world: 'floor', fixture });

  expect(kase.world.objects.find((object) => object.joint)).toMatchObject({
    massG: 0.5,
    joint: { range: [-175, 175], stiffness: 15000, springref: 12.5 },
  });
  expect(buildCase({ goal: 'drawer', world: 'floor', fixture }, robot).ok).toBe(false);
});

it('keeps estimated mass tied to edited geometry and distinguishes an explicit weight', async () => {
  const fixture = await captureCaseFixture(fixtureScene(made({ goal: 'lid', world: 'floor' }), 'Lid'));
  const joint = fixture.joints!.find((item) => item.type !== 'fixed')!;
  const node = fixture.nodes.find((item) => joint.child.includes(item.id))!;

  delete node.part!.massG;

  const estimated = made({ goal: 'lid', world: 'floor', fixture, values: { fixtureWidthMm: 100 } }).world.objects.find(
    (object) => object.joint,
  )!;
  const supplied = made({
    goal: 'lid',
    world: 'floor',
    fixture,
    values: { fixtureWidthMm: 100, fixtureMassG: 12 },
  }).world.objects.find((object) => object.joint)!;

  expect(estimated.massG).toBeCloseTo(24, 9);
  expect(estimated.massSource).toBe('estimated');
  expect(supplied.massG).toBe(12);
  expect(supplied.massSource).toBe('supplied');
  expect(node.part!.massG).toBeUndefined();
});

it('preserves moving-body dimensions and mass when selection order differs from joint ownership', async () => {
  const source = fixtureScene(made({ goal: 'chest', world: 'floor' }), 'Chest');
  const fixture = await captureCaseFixture({ ...source, parts: [...source.parts].reverse() });
  const kase = made({ goal: 'chest', world: 'floor', fixture });
  const lid = kase.world.objects.find((object) => object.joint)!;

  expect(lid.size).toEqual([90, 6, 140]);
  expect(lid.massG).toBe(5);
});

it.each([{ axis: [1, 0, 0] as V3 }, { axis: [0, 0, -1] as V3 }, { axis: [Math.SQRT1_2, 0, -Math.SQRT1_2] as V3 }])(
  'scales saved slider stops and rest coordinates along the axis $axis',
  async ({ axis }) => {
    const assembly = fixtureScene(made({ goal: 'drawer', world: 'floor' }), 'Drawer');

    assembly.joints[0] = { ...assembly.joints[0], axis, range: [-10, 50], stiffness: 2, springref: 5 };

    const fixture = await captureCaseFixture(assembly);
    const values = { fixtureWidthMm: 105, fixtureDepthMm: 160 };
    const scaled = made({ goal: 'drawer', world: 'floor', fixture, values });
    const joint = scaled.world.objects.find((object) => object.joint)!.joint!;
    const factor = Math.hypot(axis[0] * 1.5, axis[1], axis[2] * 2);

    expect(joint.range[0]).toBeCloseTo(-10 * factor, 12);
    expect(joint.range[1]).toBeCloseTo(50 * factor, 12);
    expect(joint.springref).toBeCloseTo(5 * factor, 12);
    expect(joint.stiffness).toBe(2);

    const edited = made({
      goal: 'drawer',
      world: 'floor',
      fixture,
      values: { ...values, fixtureLowerStop: -4, fixtureTravel: 30, fixtureSpringref: 3 },
    });

    expect(edited.world.objects.find((object) => object.joint)!.joint).toMatchObject({
      range: [-4, 30],
      springref: 3,
    });
    expect(fixture.joints![0]).toMatchObject({ range: [-10, 50], springref: 5 });
  },
);

it.each([false, true])(
  'keeps the parent slider primary when child parts come first and joint order is reversed: %s',
  async (reverse) => {
    const assembly = fixtureScene(made({ goal: 'drawer', world: 'floor' }), 'Drawer with a lid');

    assembly.parts.push({ ...box('extra-lid', [0, 150, 300], [70, 6, 80], 5), group: assembly.parts[0].group });
    assembly.joints.push({
      id: 'extra-hinge',
      name: 'Extra hinge',
      type: 'revolute',
      parent: ['fixture'],
      child: ['extra-lid'],
      origin: [0, 150, 340],
      axis: [1, 0, 0],
      range: [0, 80],
      actuation: 'passive',
      damping: 0.01,
      stiffness: 0.2,
      springref: 10,
    });
    assembly.parts.reverse();

    if (reverse) assembly.joints.reverse();

    const fixture = await captureCaseFixture(assembly);
    const kase = made({ goal: 'drawer', world: 'floor', fixture, values: { fixtureTravel: 35 } });
    const primary = kase.world.objects.find((object) => object.id === 'fixture')!;
    const child = kase.world.objects.find((object) => object.name === 'extra-lid')!;

    expect(primary.joint).toMatchObject({ type: 'prismatic', range: [0, 35] });
    expect(child.parent).toBe('fixture');
    expect(child.joint).toMatchObject({
      type: 'revolute',
      range: [0, 80],
      damping: 0.01,
      stiffness: 0.2,
      springref: 10,
    });
    expect(buildCase({ goal: 'lid', world: 'floor', fixture }, robot).ok).toBe(false);
    expect(fixture.joints!.find((joint) => joint.id === 'extra-hinge')!.range).toEqual([0, 80]);
  },
);
