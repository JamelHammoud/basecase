import { unitHistories, withCalibration, withMount, withRollBack } from '../reality/projectCalibrations';
import { calibrateRobot } from '../robot/calibrationSession';
import { selectedUnit } from '../robot/robotStore';
import type { ProjectSettings, RobotJoint, ScenePart } from '../types/robotics';

type UpdateProject = (patch: (project: ProjectSettings) => ProjectSettings) => void;

export interface CalibrateConnectedInput {
  joints: readonly RobotJoint[];
  parts: readonly ScenePart[];
  project: ProjectSettings;
  only?: readonly string[];
}

export function calibrateConnectedRobot(
  updateProjectNow: UpdateProject,
  { project, ...input }: CalibrateConnectedInput,
) {
  const unit = selectedUnit();

  return calibrateRobot({
    ...input,
    unit,
    calibrations: unitHistories(project, unit),
    cameras: project.cameras,
    record: (jointId, calibration) => updateProjectNow((p) => withCalibration(p, jointId, calibration, unit)),
    recordMount: (jointId, found) => updateProjectNow((p) => withMount(p, jointId, found, unit)),
  });
}

export const rollBackCalibration = (updateProjectNow: UpdateProject, jointId: string) => {
  const unit = selectedUnit();

  updateProjectNow((p) => withRollBack(p, jointId, unit));
};
