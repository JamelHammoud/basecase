import type { RobotJoint, ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import { jointServos } from './mjcfEffort';
import type { SimJoint } from './mjcfTypes';
import { isWheelJoint } from './morphology';

export type JointModel = Pick<SimJoint, 'effortSource' | 'dynamics'>;

const measured = (j: RobotJoint, servos: ReturnType<typeof jointServos>) =>
  j.type === 'revolute' && servos.length > 0 && servos.every((s) => !!s.fit);

export function jointModel(j: RobotJoint, byId: Map<string, ScenePart>, rig: Rig): JointModel {
  const servos = jointServos(j, byId);

  if (!isWheelJoint(j, byId, rig) && measured(j, servos)) return { effortSource: 'servo', dynamics: 'measured' };

  if (servos.some((s) => s.stallNm > 0)) return { effortSource: 'servo', dynamics: 'estimated' };

  if (j.effortNm && j.effortNm > 0) return { effortSource: 'published', dynamics: 'estimated' };

  return { effortSource: 'estimate', dynamics: 'estimated' };
}
