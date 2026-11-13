import { withCalibration, withRollBack } from '../reality/projectCalibrations';
import { calibrateRobot } from '../robot/calibrationSession';
import type { ProjectSettings, RobotJoint } from '../types/robotics';

type UpdateProject = (patch: (project: ProjectSettings) => ProjectSettings) => void;

export const calibrateConnectedRobot = (
  updateProjectNow: UpdateProject,
  joints: readonly RobotJoint[],
  only?: string,
) =>
  calibrateRobot(
    joints,
    (jointId, calibration) => updateProjectNow((p) => withCalibration(p, jointId, calibration)),
    only,
  );

export const rollBackCalibration = (updateProjectNow: UpdateProject, jointId: string) =>
  updateProjectNow((p) => withRollBack(p, jointId));
