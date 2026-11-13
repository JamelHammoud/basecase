import { beforeAll, describe, expect, it } from 'vitest';
import { box, joint } from '../../../src/sim/fixtures/parts';
import { fixtureRobots, withoutGripper } from '../../../src/sim/fixtures/robots';
import { makeLeader } from '../../../src/leader/makeLeader';
import { renderPart } from '../../cad-kernel/nodeHost/client.mjs';

function grippedArm() {
  const link = (id, origin, axis, parentJoint) =>
    joint({
      id,
      link: [parentJoint ? `${parentJoint}_link` : 'base', `${id}_link`],
      origin,
      axis,
      effortNm: 3,
      parentJoint,
      limb: 'arm',
    });
  const joints = [
    link('pan', [0, 60, 0], [0, 1, 0]),
    link('lift', [0, 140, 0], [1, 0, 0], 'pan'),
    link('elbow', [0, 256, 0], [1, 0, 0], 'lift'),
    link('roll', [0, 330, 0], [0, 1, 0], 'elbow'),
    link('gripper', [0, 370, 0], [0, 0, 1], 'roll'),
  ];
  const parts = [
    box('base', [0, 20, 0], [100, 40, 100], 500),
    ...joints.map((j) => box(`${j.id}_link`, [0, j.origin[1] + 20, 0], [30, 40, 30], 80)),
  ];

  return { parts, joints };
}

const arm6 = withoutGripper(fixtureRobots().find((r) => r.id === 'arm-6dof'));
const LEADERS = {
  gripped: makeLeader({ ...grippedArm(), sceneId: 'a' }),
  'arm-6dof': makeLeader({ parts: arm6.parts, joints: arm6.joints, sceneId: 'b' }),
};
const printed = Object.entries(LEADERS).flatMap(([arm, leader]) =>
  leader.parts.filter((p) => p.cad).map((p) => ({ arm, id: p.id, code: p.cad.code })),
);
let compiled = [];

beforeAll(async () => {
  compiled = await Promise.all(printed.map((p) => renderPart('openscad', p.code)));
}, 240000);

describe.each(Object.keys(LEADERS))('the %s leader', (arm) => {
  it('compiles every printed part from the robotics library cleanly', () => {
    printed.forEach((p, i) => {
      if (p.arm !== arm) return;

      expect(compiled[i].error ?? '', p.id).toBe('');
      expect(compiled[i].warnings, p.id).toEqual([]);
      expect(compiled[i].stats.volume, p.id).toBeGreaterThan(1000);
    });
  });
});
