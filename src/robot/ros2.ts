import { ROS2, ROS2_TOPICS } from '../../electron/robot/ros2.mjs';
import type { RobotJoint } from '../types/robotics';
import type { Ros2Ask } from './robotState';

export const ROS_NAME_LENGTH = 64;

const FALLBACK_NAME = 'joint';

function rosName(name: string): string {
  const plain = name.replace(/\W/gu, '_');

  return (/^\d/.test(plain) ? `_${plain}` : plain).slice(0, ROS_NAME_LENGTH);
}

function unusedName(base: string, used: ReadonlySet<string>): string {
  if (!used.has(base)) return base;

  for (let n = 2; ; n++) {
    const suffix = `_${n}`;
    const name = `${base.slice(0, ROS_NAME_LENGTH - suffix.length)}${suffix}`;

    if (!used.has(name)) return name;
  }
}

export function rosJointNames(movable: readonly RobotJoint[]): string[] {
  const used = new Set<string>();

  return movable.map((joint) => {
    const name = unusedName(rosName(joint.name) || rosName(joint.id) || FALLBACK_NAME, used);

    used.add(name);

    return name;
  });
}

export const ros2Ask = (movable: readonly RobotJoint[]): Ros2Ask => ({
  family: ROS2,
  emulated: true,
  controller: { kind: 'forward_position', topic: ROS2_TOPICS.forward_position },
  joints: rosJointNames(movable),
});
