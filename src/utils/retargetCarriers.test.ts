import { describe, expect, it, vi } from 'vitest';
import type { RobotJoint } from '../types/robotics';
import { buildRig, type V3 } from './kinematics';
import { autoMapBones, parseBvh } from './mocap';
import { humanoid, walkBvh } from './mocap.fixtures';
import { createRetargeter } from './retargeter';
import { robotLandmarks, type KeyMap } from './retargetRobot';

function fixture() {
  const parents = [
    ['torso', undefined],
    ['neck', 'torso'],
    ['head', 'neck'],
    ['shoulder', 'torso'],
    ['elbow', 'shoulder'],
    ['wrist', 'elbow'],
    ['wrist-tie', 'elbow'],
    ['ankle', 'torso'],
    ['toe', 'ankle'],
  ] as const;
  const joints: RobotJoint[] = parents.map(([id, parentJoint], i) => ({
    id,
    name: id,
    type: 'revolute',
    parentJoint,
    parent: [parentJoint ? `${parentJoint}-part` : 'base'],
    child: [`${id}-part`, `${id}-second`],
    origin: [i * 10, i * 20, 0],
    axis: [1, 0, 0],
  }));
  const rig = buildRig(joints, []);
  const pointOf = (id: string): V3 => [...rig.byId.get(id)!.origin];
  const mapping: KeyMap = {
    neck: 'neck',
    leftShoulder: 'shoulder',
    rightShoulder: 'shoulder',
    leftElbow: 'elbow',
    leftWrist: 'wrist',
    leftAnkle: 'ankle',
  };

  return { rig, pointOf, joints: mapping };
}

describe('prepared retargeting carriers', () => {
  it('keeps mapped parents, torso and head ends, inferred toes and first-part order', () => {
    const source = fixture();
    const before = structuredClone(source.rig.joints);
    const owners = [...source.rig.ownerOf];
    const robot = robotLandmarks(source);

    expect([...robot.carriers].map(([key, carrier]) => [key, carrier.partId])).toEqual([
      ['chest', 'torso-part'],
      ['neck', 'head-part'],
      ['head', 'head-part'],
      ['leftShoulder', 'torso-part'],
      ['leftElbow', 'shoulder-part'],
      ['leftWrist', 'elbow-part'],
      ['rightShoulder', 'torso-part'],
      ['leftAnkle', 'torso-part'],
      ['leftToe', 'toe-part'],
    ]);
    expect(robot.carriers.get('head')!.point).toEqual([20, 40, 0]);
    expect(robot.carriers.get('leftWrist')!.point).toEqual([50, 100, 0]);
    expect(robot.carriers.has('hips')).toBe(false);
    expect(source.rig.joints).toEqual(before);
    expect([...source.rig.ownerOf]).toEqual(owners);

    robot.rp.get('head')!.set(1, 2, 3);

    expect(robot.carriers.get('head')!.point).toEqual([20, 40, 0]);
  });

  it('keeps first-depth ties for inferred wrists and rebuilds after mapping and ownership edits', () => {
    const source = fixture();
    const mapped = robotLandmarks(source);
    const inferred = robotLandmarks({ ...source, joints: { ...source.joints, leftWrist: undefined } });

    expect(inferred.carriers.get('leftWrist')!.partId).toBe('wrist-part');
    expect(mapped.carriers.get('leftWrist')!.partId).toBe('elbow-part');

    source.rig.ownerOf.delete('elbow-part');
    source.rig.byId.get('wrist')!.origin = [70, 80, 90];

    const edited = robotLandmarks(source);

    expect(edited.carriers.get('leftWrist')).toEqual({ partId: 'elbow-second', point: [70, 80, 90] });
    expect(mapped.carriers.get('leftWrist')).toEqual({ partId: 'elbow-part', point: [50, 100, 0] });
    expect(edited.carriers.get('leftElbow')!.point).not.toBe(mapped.carriers.get('leftElbow')!.point);
  });

  it('omits carriers without a landmark or owned part, including empty robots', () => {
    const source = fixture();

    source.rig.ownerOf.clear();

    expect(robotLandmarks(source).carriers.size).toBe(0);
    expect(robotLandmarks({ rig: buildRig([], []), pointOf: () => null, joints: {} }).carriers.size).toBe(0);
  });

  it.each([false, true])('reuses carriers throughout moving frames with upperBody=%s', (upperBody) => {
    const { rig, pointOf } = humanoid();
    const motion = parseBvh(walkBvh(), 'Walk');
    const plain = (positions: ReturnType<typeof motion.sample>) =>
      Object.fromEntries([...positions].map(([key, p]) => [key, p.toArray() as V3]));
    const retargeter = createRetargeter({
      rig,
      pointOf,
      bones: autoMapBones(motion),
      rest: plain(motion.rest),
      upperBody,
      joints: { leftWrist: undefined, rightWrist: undefined },
    });
    const before = structuredClone([...retargeter.robot.carriers]);
    const scans = vi.spyOn(rig.ownerOf, Symbol.iterator);
    const steps = Array.from({ length: 12 }, (_, f) => {
      const frame = plain(motion.sample(f / 30));

      if (f === 6) delete frame.RightHand;

      return retargeter.step(frame, f / 30, motion.rootQuaternion(f / 30))!;
    });

    expect(scans).not.toHaveBeenCalled();
    expect(steps.every((step) => Number.isFinite(step.values.left_elbow_joint))).toBe(true);
    expect(new Set(steps.map((step) => step.keyframe.values.left_elbow_joint)).size).toBeGreaterThan(5);
    expect([...retargeter.robot.carriers]).toEqual(before);
    scans.mockRestore();
  });
});
