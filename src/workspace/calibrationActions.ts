import { withCalibration, withMount, withRollBack } from '../reality/projectCalibrations';
import { calibrateRobot } from '../robot/calibrationSession';
import type { ProjectSettings, RobotJoint, ScenePart } from '../types/robotics';

type UpdateProject = (patch: (project: ProjectSettings) => ProjectSettings) => void;

export interface CalibrateConnectedInput {
  joints: readonly RobotJoint[];
  parts: readonly ScenePart[];
  project: ProjectSettings;
  only?: readonly string[];
}

export const calibrateConnectedRobot = (
  updateProjectNow: UpdateProject,
  { project, ...input }: CalibrateConnectedInput,
) =>
  calibrateRobot({
    ...input,
    calibrations: project.servoCalibrations,
    cameras: project.cameras,
    record: (jointId, calibration) => updateProjectNow((p) => withCalibration(p, jointId, calibration)),
    recordMount: (jointId, found) => updateProjectNow((p) => withMount(p, jointId, found)),
  });

export const rollBackCalibration = (updateProjectNow: UpdateProject, jointId: string) =>
  updateProjectNow((p) => withRollBack(p, jointId));
