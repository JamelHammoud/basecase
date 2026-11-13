import { withCalibration, withRollBack } from '../reality/projectCalibrations';
import { calibrateRobot } from '../robot/calibrationSession';
import type { ProjectSettings, RobotJoint, ScenePart } from '../types/robotics';

type UpdateProject = (patch: (project: ProjectSettings) => ProjectSettings) => void;

export interface CalibrateConnectedInput {
  joints: readonly RobotJoint[];
  parts: readonly ScenePart[];
  only?: readonly string[];
}

export const calibrateConnectedRobot = (updateProjectNow: UpdateProject, input: CalibrateConnectedInput) =>
  calibrateRobot({
    ...input,
    record: (jointId, calibration) => updateProjectNow((p) => withCalibration(p, jointId, calibration)),
  });

export const rollBackCalibration = (updateProjectNow: UpdateProject, jointId: string) =>
  updateProjectNow((p) => withRollBack(p, jointId));
