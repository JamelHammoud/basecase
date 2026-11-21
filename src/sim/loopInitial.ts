import type { RobotPoseState } from '../types/robotics';
import { clampJoint } from '../utils/kinematics';
import { checkedLoopValue } from './mjcfLoops';
import type { SimModel } from './mjcfTypes';

export function loopInitial(model: SimModel, pose: RobotPoseState): RobotPoseState {
  const loops = model.joints.filter((joint) => joint.loop);

  if (!loops.length) return pose;

  const values = { ...pose.values };
  const joints = new Map(model.joints.map((j) => [j.id, j]));

  for (const joint of loops) {
    const driver = joints.get(joint.loop!.driver)!;
    const value = clampJoint(driver, values[driver.id] ?? 0);

    values[driver.id] = value;
    values[joint.id] = checkedLoopValue(joint, value);
  }

  return { ...pose, values };
}
