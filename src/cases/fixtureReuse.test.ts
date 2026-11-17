import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import { buildCase, builderRobot, type CaseSpec } from './caseBuilder';
import { captureCaseFixture } from './fixtureAssembly';
import { fixtureScene } from './fixtureScenes.fixtures';
import { runCase } from './testing';

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
