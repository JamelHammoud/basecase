import { withCalibration, withRollBack } from '../reality/projectCalibrations';
import { calibrateRobot } from '../robot/calibrationSession';
import type { ProjectSettings } from '../types/robotics';

type UpdateProject = (patch: (project: ProjectSettings) => ProjectSettings) => void;

export const calibrateConnectedRobot = (updateProjectNow: UpdateProject) =>
  calibrateRobot((jointId, calibration) => updateProjectNow((p) => withCalibration(p, jointId, calibration)));

export const rollBackCalibration = (updateProjectNow: UpdateProject, jointId: string) =>
  updateProjectNow((p) => withRollBack(p, jointId));
