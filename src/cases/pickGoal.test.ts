import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig, type V3 } from '../utils/kinematics';
import { buildCase, builderRobot, goalOf, goalsFor, goalValues, worldsFor } from './caseBuilder';
import { robotFacts, slotRefusal } from './robotFit';
import { scaledToReach } from './scale';
import type { Case } from './schema';
import { parseCase, runCase } from './testing';

const fixture = (id: string) => fixtureRobots().find((r) => r.id === id)!;

const robotOf = (id: string) => {
  const r = fixture(id);

  return builderRobot(buildRig(r.joints, r.parts), r.parts);
};

function pickCase(): Case {
  const result = buildCase({ goal: 'pick', world: 'floor' }, robotOf('arm-6dof'));

  if (!result.ok) throw new Error(result.problem);

  return result.kase;
}

const objectOf = (kase: Case, id: string) => kase.world.objects.find((o) => o.id === id)!;

function pushOnly(kase: Case): Case {
  const [x, y, z] = objectOf(kase, 'block').position;
  const size = objectOf(kase, 'block').size[0];
  const spotZ = objectOf(kase, 'spot').position[2];
  const behind = (atZ: number, height: number): V3 => [x, height, atZ - size * 1.5];

  return {
    ...kase,
    reference: {
      timeline: [
        { at: 0.2, target: behind(z, y + size * 2), aux: [0, 0] },
        { at: 2, target: behind(z, y), aux: [0, 0] },
        { at: 3, target: behind(spotZ + size / 2, y), aux: [0, 0] },
      ],
    },
  };
}

describe('a gripper', () => {
  it('is found on the arm with two facing fingers, and its hand is the point between them', () => {
    const arm = fixture('arm-6dof');
    const facts = robotFacts(buildRig(arm.joints, arm.parts), arm.parts);

    expect(facts.capabilities).toEqual(['arm', 'gripper']);
    expect(facts.armJoints).toEqual(['arm0', 'arm1', 'arm2', 'arm3', 'arm4', 'arm5']);
    expect(facts.gripper).toMatchObject({
      palm: 'arm5',
      jaws: [
        { joint: 'finger_left', open: 0, closed: 25 },
        { joint: 'finger_right', open: 0, closed: -25 },
      ],
      openingMm: 50,
      across: [1, 0, 0],
      approach: [0, 1, 0],
    });
    expect(facts.endEffector?.point).toEqual(facts.gripper?.centre);
  });

  it('is not found on an arm without one, which is never offered Pick Up a Block and is refused its Case', () => {
    const arm = fixture('arm-3dof');
    const facts = robotFacts(buildRig(arm.joints, arm.parts), arm.parts);

    expect(facts.gripper).toBeNull();
    expect(goalsFor(robotOf('arm-3dof')).map((g) => g.kind)).toEqual(['touch']);
    expect(goalsFor(robotOf('arm-6dof')).map((g) => g.kind)).toEqual(['touch', 'pick']);
    expect(slotRefusal(pickCase().slot, facts)).toBe('This Case needs a gripper. This robot has a fixed base.');
  });
});

describe('Pick Up a Block', () => {
  it('builds a Case that parses, on the open floor only, with a block sized to the gripper', () => {
    const kase = pickCase();
    const block = objectOf(kase, 'block');

    expect(worldsFor('pick').map((w) => w.kind)).toEqual(['floor']);
    expect(parseCase(JSON.parse(JSON.stringify(kase)))).toEqual(JSON.parse(JSON.stringify(kase)));
    expect(kase).toMatchObject({ id: 'pick-up-a-block', name: 'Pick Up a Block' });
    expect(block).toMatchObject({ behavior: 'dynamic', size: [35, 35, 35], position: [0, 17.5, 178] });
    expect(objectOf(kase, 'spot').position).toEqual([0, 17.5, 289]);
    expect(kase.reference.timeline.map((c) => c.aux?.[1])).toEqual([0, 0, 1, 1, 1, 1, 0, 0]);
  });

  it('keeps the block on the floor and the grip at its height when it scales to a bigger or smaller arm', () => {
    const kase = pickCase();
    const gripHeight = kase.reference.timeline[1].target![1] / objectOf(kase, 'block').position[1];

    for (const share of [0.5, 2]) {
      const scaled = scaledToReach(kase, kase.slot.reachMm! * share, kase.slot.anchor!);
      const block = objectOf(scaled, 'block').position;
      const grip = scaled.reference.timeline[1].target!;

      for (const id of ['block', 'spot']) {
        const { position, size } = objectOf(scaled, id);

        expect(position[1]).toBeCloseTo(size[1] / 2);
        expect(size[1]).toBeCloseTo(35 * share);
      }

      expect(grip[1] / block[1]).toBeCloseTo(gripHeight);
      expect([grip[0], grip[2]]).toEqual([block[0], block[2]]);
    }
  });

  it('keeps Spacing down to 50 mm, while Follow a Path keeps 200 mm', () => {
    const tight = buildCase({ goal: 'pick', world: 'floor', values: { spacingMm: 50 } }, robotOf('arm-6dof'));

    expect(tight.ok && objectOf(tight.kase, 'spot').position[2] - objectOf(tight.kase, 'block').position[2]).toBe(50);
    expect(goalValues(goalOf('path')!, robotOf('arm-6dof'), { spacingMm: 50 }).spacingMm).toBe(200);
  });

  it('passes with its reference in MuJoCo, and a limp arm misses', async () => {
    const mj = await loadMujoco();
    const kase = pickCase();
    const reference = await runCase(mj, kase, fixture('arm-6dof'), { controller: 'reference' });
    const limp = await runCase(mj, kase, fixture('arm-6dof'), { controller: 'limp' });
    const lift = reference.trace.signals.lift;

    expect(reference.passed).toBe(true);
    expect(Math.max(...lift) - lift[0]).toBeGreaterThan(35);
    expect(limp.passed).toBe(false);
  });

  it('fails an arm that only pushes the block onto the spot', async () => {
    const mj = await loadMujoco();
    const kase = pickCase();
    const pushed = await runCase(mj, pushOnly(kase), fixture('arm-6dof'), { controller: 'reference' });
    const radius = objectOf(kase, 'spot').size[0] / 2;

    expect(pushed.trace.signals.spot.at(-1)).toBeLessThan(radius);
    expect(pushed.passed).toBe(false);
  });
});
