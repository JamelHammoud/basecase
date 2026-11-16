import { describe, expect, it, vi } from 'vitest';
import type { RobotJoint } from '../types/robotics';
import { goalTargets, type PointOf } from './animationGoals';
import { moveGaitTargets, prepareGaitTargets } from './gaitTargets';
import { buildRig, type V3 } from './kinematics';

function fixture() {
  const joint: RobotJoint = {
    id: 'ankle',
    name: 'Ankle',
    type: 'revolute',
    parent: ['shin'],
    child: ['foot', 'toe'],
    origin: [10, 20, 30],
    axis: [1, 0, 0],
  };
  const rig = buildRig([joint], []);
  const points: V3[] = [
    [-0, 1e6, -37.25],
    [120, -15, 23.75],
  ];
  const feet = ['foot', 'ankle'];
  const pointOf: PointOf = () => null;

  return { rig, points, feet, pointOf };
}

describe('gait target preparation', () => {
  it.each([false, true])('matches fresh goals throughout both passes with orientation %s', (keepOrientation) => {
    const { rig, points, feet, pointOf } = fixture();
    const before = structuredClone(points);
    const prepared = prepareGaitTargets(rig, { feet, points, pointOf, keepOrientation });
    const records = [...prepared.all];
    const destinations = prepared.all.map((target) => target.target);

    for (let sample = 0; sample < 120; sample++) {
      for (let i = 0; i < feet.length; i++) {
        const point = points[i];
        const desired: V3 = [point[0] + Math.sin(sample) * 40, point[1] + (sample % 7), point[2] - sample / 3];

        moveGaitTargets(prepared.feet[i], desired);
        expect(prepared.feet[i]).toEqual(
          goalTargets(rig, { part: feet[i], point, target: desired, keepOrientation }, pointOf),
        );
      }
    }

    moveGaitTargets(prepared.feet[0], [-0, 0, -0]);
    expect(prepared.feet[0]).toEqual(
      goalTargets(rig, { part: feet[0], point: points[0], target: [-0, 0, -0], keepOrientation }, pointOf),
    );
    prepared.all.forEach((target, i) => {
      expect(target).toBe(records[i]);
      expect(target.target).toBe(destinations[i]);
    });
    expect(points).toEqual(before);
  });

  it('does no ownership lookup during updates and rebuilds after ownership edits', () => {
    const { rig, points, feet, pointOf } = fixture();
    const prepared = prepareGaitTargets(rig, { feet, points, pointOf, keepOrientation: true });
    const has = vi.spyOn(rig.ownerOf, 'has');

    for (let sample = 0; sample < 600; sample++) moveGaitTargets(prepared.feet[1], [sample, 0, -sample]);

    expect(has).not.toHaveBeenCalled();
    has.mockRestore();
    rig.ownerOf.delete('foot');

    const next = prepareGaitTargets(rig, { feet, points, pointOf, keepOrientation: true });

    expect(next.feet[0]).toEqual([]);
    expect(next.feet[1][0].partId).toBe('toe');
    expect(prepared.feet[1][0].partId).toBe('foot');
    expect(next.all[0]).not.toBe(prepared.all[0]);
    expect(() => moveGaitTargets(next.feet[0], [1, 2, 3])).not.toThrow();
  });
});
