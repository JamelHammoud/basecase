import type { RobotPoseState } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import { isZeroRoot, robotRootOffset } from '../utils/kinematicsMotion';

export function assertWorkspacePose(rig: Rig, pose: RobotPoseState | undefined) {
  const displaced = rig.robots.some((robot) => !isZeroRoot(robotRootOffset(rig, pose, robot.key)));

  if (displaced) throw new Error('Apply Rest Pose to each robot before inspecting the workspace.');
}
