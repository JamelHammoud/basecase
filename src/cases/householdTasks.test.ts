import { Vector3 } from 'three';
import { halfExtents } from '../utils/selection';
import { worldItem } from './schema';
import loadMujoco from '@mujoco/mujoco';
import { beforeAll, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig, partMatrix } from '../utils/kinematics';
import { buildCase, builderRobot } from './caseBuilder';
import type { GoalKind } from './caseGoals';
import { runCase } from './testing';
import { decodeRecording, encodeRecording } from './recordingFile';
import { scoreTry } from './tries';
import { robotFacts } from './robotFit';

const robot = fixtureRobots().find((r) => r.id === 'arm-6dof')!;
const rig = buildRig(robot.joints, robot.parts);
const builder = builderRobot(rig, robot.parts);
let mj: Awaited<ReturnType<typeof loadMujoco>>;

beforeAll(async () => {
  mj = await loadMujoco();
});

function household(goal: GoalKind) {
  const made = buildCase({ goal, world: 'floor' }, builder);

  if (!made.ok) throw new Error(made.problem);

  return made.kase;
}

const goals: GoalKind[] = ['lid', 'cupboard', 'drawer', 'door', 'lever', 'knob', 'button', 'bin', 'gate', 'chest'];

for (const goal of goals) {
  it.each(['reference', 'locked', 'limp'] as const)(`${goal} keeps its contact verdict for %s`, async (mode) => {
    const kase = household(goal);

    for (const object of kase.world.objects) if (mode === 'locked' && object.joint) object.joint.locked = true;

    const result = await runCase(mj, kase, robot, {
      controller: mode === 'limp' ? 'limp' : 'reference',
      record: mode === 'reference',
    });

    if (mode === 'locked') expect(Math.max(...result.trace.signals['fixture-travel'].map(Math.abs))).toBeLessThan(1);

    if (mode !== 'reference') {
      expect(result.passed).toBe(false);

      return;
    }

    expect(
      result.passed,
      JSON.stringify({
        goal,
        failed: result.failed,
        travel: result.trace.signals['fixture-travel']?.filter((_, i) => i % 50 === 0),
      }),
    ).toBe(true);
    expect(
      (
        await scoreTry({
          kase: result.case,
          model: result.model,
          recording: decodeRecording(encodeRecording(result.recording!))!,
          rig,
          effector: robotFacts(rig, robot.parts).endEffector,
        })
      ).passed,
    ).toBe(true);
  });
}

it.each(['opening', 'drop', 'closing'] as const)('rejects a chest chore with faulty %s', async (fault) => {
  const kase = household('chest');

  if (fault === 'opening') kase.world.objects.find((o) => o.joint)!.joint!.range[1] = 10;

  if (fault === 'drop') {
    const block = kase.world.objects.find((object) => object.id === 'block')!;
    const grasp = kase.reference.timeline.find(
      (command) =>
        command.aux?.[1] === 1 &&
        command.target &&
        Math.hypot(command.target[0] - block.position[0], command.target[2] - block.position[2]) < 1,
    )!;
    const lift = kase.reference.timeline.find(
      (command) =>
        command.at > grasp.at &&
        command.aux?.[1] === 1 &&
        command.target &&
        command.target[1] > grasp.target![1] + block.size[1],
    )!;
    const next = kase.reference.timeline.find((command) => command.at > lift.at)!;
    const dropAt = (lift.at + next.at) / 2;
    const release = kase.reference.timeline.find((command) => command.at > lift.at && command.aux?.[1] === 0)!;

    kase.reference.timeline = [
      ...kase.reference.timeline.map((command) =>
        command.at >= dropAt && command.at <= release.at ? { ...command, aux: [0, 0] } : command,
      ),
      { ...lift, at: dropAt, aux: [0, 0] },
    ];
  }

  if (fault === 'closing') kase.reference.timeline = kase.reference.timeline.filter((command) => command.at < 20);

  const result = await runCase(mj, kase, robot, { controller: 'reference' });

  expect(result.passed).toBe(false);

  if (fault === 'drop') {
    expect(Math.max(...result.trace.signals['block-grip'])).toBe(1);
    expect(Math.max(...result.trace.signals['block-lift']) - result.trace.signals['block-lift'][0]).toBeGreaterThan(
      17.5,
    );
  }

  if (fault === 'closing') expect(result.trace.signals.inside.at(-1)).toBeLessThan(10);
});

it('builds distinct household mechanisms rather than aliases of one plate', () => {
  const mechanism = (goal: GoalKind) => household(goal).world.objects.filter((object) => object.joint || object.parent);
  const signature = (goal: GoalKind) =>
    JSON.stringify(mechanism(goal).map((object) => ({ kind: object.kind, size: object.size, joint: object.joint })));

  expect(new Set(goals.filter((goal) => goal !== 'chest').map(signature)).size).toBe(9);
  expect(mechanism('lever')[0].size[0]).toBeLessThan(mechanism('lid')[0].size[0]);
  expect(mechanism('knob')[0].kind).toBe('cylinder');
  expect(mechanism('button')[0].kind).toBe('cylinder');
  expect(mechanism('bin').length).toBeGreaterThan(mechanism('lid').length);
});

it('keeps rotary and button surfaces on their physical axes and the gate thin and upright', () => {
  for (const goal of ['knob', 'button'] as const) {
    const fixture = household(goal).world.objects[0];
    const part = worldItem(fixture);
    const axis = new Vector3(...fixture.joint!.axis);
    const cylinder = new Vector3(0, 1, 0).transformDirection(partMatrix(part));
    const offset = new Vector3(...fixture.position).sub(new Vector3(...fixture.joint!.origin));

    expect(cylinder.cross(axis).length()).toBeLessThan(1e-8);
    expect(offset.cross(axis).length()).toBeLessThan(1e-8);
  }

  const gate = halfExtents(worldItem(household('gate').world.objects[0]));

  expect(gate[1]).toBeGreaterThan(gate[2] * 5);
});
