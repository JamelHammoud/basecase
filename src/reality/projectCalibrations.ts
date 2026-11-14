import { DEFAULT_UNIT } from '../../electron/robot/units.mjs';
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

type Histories = Record<string, CalibrationHistory>;

export const unitHistories = (project: ProjectSettings, unit: string = DEFAULT_UNIT): Histories =>
  unit === DEFAULT_UNIT ? (project.servoCalibrations ?? {}) : (project.unitCalibrations?.[unit] ?? {});

function withUnitHistories(project: ProjectSettings, unit: string, histories: Histories): ProjectSettings {
  if (unit === DEFAULT_UNIT) return { ...project, servoCalibrations: histories };

  return { ...project, unitCalibrations: { ...project.unitCalibrations, [unit]: histories } };
}

function withHistory(
  project: ProjectSettings,
  change: { jointId: string; unit: string; next: (history: CalibrationHistory) => CalibrationHistory },
): ProjectSettings {
  const histories = unitHistories(project, change.unit);
  const history = histories[change.jointId] ?? EMPTY_HISTORY;

  return withUnitHistories(project, change.unit, { ...histories, [change.jointId]: change.next(history) });
}

export const withCalibration = (
  project: ProjectSettings,
  jointId: string,
  calibration: ServoCalibration,
  unit: string = DEFAULT_UNIT,
) => withHistory(project, { jointId, unit, next: (history) => recordCalibration(history, calibration) });

export const withRollBack = (project: ProjectSettings, jointId: string, unit: string = DEFAULT_UNIT) =>
  withHistory(project, { jointId, unit, next: rollBack });

export const withMount = (project: ProjectSettings, jointId: string, found: FoundMount, unit: string = DEFAULT_UNIT) =>
  withHistory(project, { jointId, unit, next: (history) => recordMount(history, found) });
