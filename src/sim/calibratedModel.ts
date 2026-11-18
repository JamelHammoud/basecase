import { calibratedInput } from '../reality/calibratedInput';
import { simCalibrations, type CalibrationHistory } from '../reality/history';
import { buildMjcf } from './mjcf';
import type { MjcfInput, SimModel } from './mjcfTypes';
import { prepareContactModel } from './contactPreparationClient';

export const calibratedModel = (
  input: MjcfInput,
  histories: Record<string, CalibrationHistory> | undefined,
): SimModel => buildMjcf(calibratedInput(input, simCalibrations(histories)));

export async function preparedCalibratedModel(
  input: MjcfInput,
  histories: Record<string, CalibrationHistory> | undefined,
  options: Parameters<typeof prepareContactModel>[1] = {},
): Promise<SimModel> {
  const calibrated = calibratedInput(input, simCalibrations(histories));

  if (input.rig.robots.some((robot) => input.project.selfContact?.[robot.key]?.enabled))
    return prepareContactModel(calibrated, options);

  return buildMjcf(calibrated);
}
