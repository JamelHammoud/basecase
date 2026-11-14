import type { ProjectSettings } from '../types/robotics';
import {
  EMPTY_HISTORY,
  recordCalibration,
  recordMount,
  rollBack,
  type CalibrationHistory,
  type FoundMount,
} from './history';
import type { ServoCalibration } from './types';

function withHistory(
  project: ProjectSettings,
  jointId: string,
  change: (history: CalibrationHistory) => CalibrationHistory,
): ProjectSettings {
  const history = project.servoCalibrations?.[jointId] ?? EMPTY_HISTORY;

  return { ...project, servoCalibrations: { ...project.servoCalibrations, [jointId]: change(history) } };
}

export const withCalibration = (project: ProjectSettings, jointId: string, calibration: ServoCalibration) =>
  withHistory(project, jointId, (history) => recordCalibration(history, calibration));

export const withRollBack = (project: ProjectSettings, jointId: string) => withHistory(project, jointId, rollBack);

export const withMount = (project: ProjectSettings, jointId: string, found: FoundMount) =>
  withHistory(project, jointId, (history) => recordMount(history, found));
