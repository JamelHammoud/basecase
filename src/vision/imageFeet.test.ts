import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { footPoints } from '../sim/driveLegs';
import { anchorJoint, buildRig, type V3 } from '../utils/kinematics';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { imageClasses, resolveImageScene } from './imageScene';

const robot = fixtureRobots().find((r) => r.id === 'hexapod')!;
const scene = (parts: ScenePart[], joints: RobotJoint[]) => resolveImageScene({ parts, joints, views: [], seed: 42 });

describe('robot foot-tip image keypoints', () => {
  it('labels the established six hexapod foot tips on their own terminal links', () => {
    const before = JSON.stringify(robot);
    const feet = footPoints(buildRig(robot.joints, robot.parts), robot.parts);
    const resolved = scene(robot.parts, robot.joints);
    const tips = resolved.instances.filter((instance) => instance.keypoints.tip);

    expect(feet).toHaveLength(6);
    expect(tips).toHaveLength(6);

    for (const foot of feet) {
      const instance = tips.find((entry) => entry.partIds?.includes(foot.part))!;
      const cls = resolved.classes.find((entry) => entry.id === instance.classId)!;
      const joint = robot.joints.find((entry) => entry.child.includes(foot.part))!;

      expect(instance.keypoints.tip).toEqual(foot.point);
      expect(instance.keypoints[joint.name]).toEqual(joint.origin);
      expect(cls.keypoints).toContain('tip');
    }

    expect(imageClasses(robot)).toEqual(resolved.classes);
    expect(JSON.stringify(robot)).toBe(before);
  });

  it('keeps tip and joint-frame points in the same scaled and translated scene coordinates', () => {
    const factor = 3;
    const offset: V3 = [15, 50, -20];
    const placed = (point: V3): V3 => point.map((value, axis) => value * factor + offset[axis]) as V3;
    const parts = robot.parts.map((part) => ({
      ...part,
      position: placed(part.position),
      dimensions: {
        width: part.dimensions.width * factor,
        height: part.dimensions.height * factor,
        depth: part.dimensions.depth * factor,
      },
    }));
    const joints = robot.joints.map((joint) => {
      const anchored = anchorJoint(joint, robot.parts);

      return {
        ...anchored,
        frame: { ...anchored.frame!, origin: anchored.frame!.origin.map((value) => value * factor) as V3 },
      };
    });
    const feet = footPoints(buildRig(robot.joints, robot.parts), robot.parts);
    const resolved = scene(parts, joints);

    for (const foot of feet) {
      const instance = resolved.instances.find((entry) => entry.partIds?.includes(foot.part))!;
      const joint = robot.joints.find((entry) => entry.child.includes(foot.part))!;

      expect(instance.keypoints.tip).toEqual(placed(foot.point));
      expect(instance.keypoints[joint.name]).toEqual(placed(joint.origin));
    }
  });
});
