import { calibratedInput } from '../reality/calibratedInput';
import { simCalibrations, type CalibrationHistory } from '../reality/history';
import { buildMjcf } from './mjcf';
import type { MjcfInput, SimModel } from './mjcfTypes';

export const calibratedModel = (
  input: MjcfInput,
  histories: Record<string, CalibrationHistory> | undefined,
): SimModel => buildMjcf(calibratedInput(input, simCalibrations(histories)));
