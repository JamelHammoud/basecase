import type { RobotJoint, ScenePart } from '../types/robotics';
import { activeCalibrations, type CalibrationHistory } from './history';
import { jointServo, sameServo, servoPartOf } from './servoPart';
import type { ServoCalibration } from './types';

export function calibrationApplies(
  calibration: ServoCalibration | undefined,
  joint: RobotJoint | undefined,
  parts: readonly ScenePart[],
): calibration is ServoCalibration {
  const servo = jointServo(joint, parts);

  return (
    calibration?.verdict === 'measured' &&
    calibration.rung !== 'preset' &&
    servo !== null &&
    sameServo(servoPartOf(calibration), servo)
  );
}

export interface MeasuredJointsInput {
  joints: readonly RobotJoint[];
  parts: readonly ScenePart[];
  calibrations: Record<string, CalibrationHistory> | undefined;
}

export function measuredJoints({ joints, parts, calibrations }: MeasuredJointsInput): Set<string> {
  const active = activeCalibrations(calibrations);

  return new Set(joints.filter((j) => calibrationApplies(active[j.id], j, parts)).map((j) => j.id));
}

export const activeVersions = (calibrations: Record<string, CalibrationHistory> | undefined) =>
  Object.entries(calibrations ?? {}).map(([jointId, history]) => [jointId, history.active] as const);
