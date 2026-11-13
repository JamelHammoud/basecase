import type { JointValues, RobotJoint } from '../types/robotics';
import { clampJoint } from '../utils/kinematics';

export const JOINT_SPEED_DEG_S = 270;

export interface JointFollow {
  joints: readonly string[];
  byId: ReadonlyMap<string, RobotJoint>;
  maxStep: number;
}

export function followJoints(values: JointValues, targets: JointValues, follow: JointFollow): JointValues {
  const next = { ...values };

  for (const id of follow.joints) {
    const joint = follow.byId.get(id);
    const target = targets[id];

    if (!joint || target === undefined || !Number.isFinite(target)) continue;

    const from = values[id] ?? 0;
    const step = Math.max(-follow.maxStep, Math.min(follow.maxStep, clampJoint(joint, target) - from));

    next[id] = from + step;
  }

  return next;
}
