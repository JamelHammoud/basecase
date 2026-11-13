import type { ProjectSettings } from '../types/robotics';
import { EMPTY_HISTORY, recordCalibration, rollBack, type CalibrationHistory } from './history';
import type { ReplayLog, ServoCalibration } from './types';

function withHistory(
  project: ProjectSettings,
  jointId: string,
  change: (history: CalibrationHistory) => CalibrationHistory,
): ProjectSettings {
  const history = project.servoCalibrations?.[jointId] ?? EMPTY_HISTORY;

  return { ...project, servoCalibrations: { ...project.servoCalibrations, [jointId]: change(history) } };
}

export const withCalibration = (
  project: ProjectSettings,
  jointId: string,
  calibration: ServoCalibration,
  logs?: ReplayLog[],
) => withHistory(project, jointId, (history) => recordCalibration(history, calibration, logs));

export const withRollBack = (project: ProjectSettings, jointId: string) => withHistory(project, jointId, rollBack);
