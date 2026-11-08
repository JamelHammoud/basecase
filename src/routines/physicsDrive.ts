import type { DriveSetup } from '../sim/drive';
import { driveAccess } from '../sim/driveAccess';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { buildRig } from '../utils/kinematics';

export function scriptedDrive(model: SimModel, joints: RobotJoint[], parts: ScenePart[]): DriveSetup | null {
  const robot = model.robots.find((r) => r.floating);

  if (!robot) return null;

  const access = driveAccess({ rig: buildRig(joints, parts), parts, model, robotKey: robot.key });

  return access.kind === 'ready' && access.setup.kind !== 'arm' ? access.setup : null;
}
