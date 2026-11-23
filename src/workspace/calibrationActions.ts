import { unitHistories, withCalibration, withMount, withRollBack } from '../reality/projectCalibrations';
import { calibrateRobot } from '../robot/calibrationSession';
import { checkPowerOn, fixPowerOn, type PowerOnInput } from '../robot/powerOn';
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

function powerOnInput(
  updateProjectNow: UpdateProject,
  { project, joints, parts }: CalibrateConnectedInput,
): PowerOnInput {
  const unit = selectedUnit();

  return {
    unit,
    joints,
    parts,
    calibrations: unitHistories(project, unit),
    record: (jointId, found) => updateProjectNow((p) => withMount(p, jointId, found, unit)),
  };
}

export const checkConnectedPowerOn = (updateProjectNow: UpdateProject, input: CalibrateConnectedInput) =>
  checkPowerOn(powerOnInput(updateProjectNow, input));

export const fixConnectedPowerOn = (updateProjectNow: UpdateProject, input: CalibrateConnectedInput) =>
  fixPowerOn(powerOnInput(updateProjectNow, input));
