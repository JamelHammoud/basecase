import type { RobotJoint, ScenePart } from '../types/robotics';
import { activeCalibrations, type CalibrationHistory } from './history';
import type { ServoCalibration, ServoFamily } from './types';

export const BENCH_SERVOS: Record<ServoFamily, { componentId: string; variant?: string }> = {
  sts3215: { componentId: 'feetech-sts3215', variant: 'c001' },
  xl330: { componentId: 'dynamixel-xl330-m288' },
};

export function servoFamilyOf(joint: RobotJoint | undefined, parts: readonly ScenePart[]): ServoFamily | null {
  const servo = joint?.actuators?.map((id) => parts.find((p) => p.id === id)).find((p) => p?.componentId);
  const match = Object.entries(BENCH_SERVOS).find(
    ([, s]) => s.componentId === servo?.componentId && (!s.variant || s.variant === servo.componentVariant),
  );

  return (match?.[0] as ServoFamily | undefined) ?? null;
}

export const calibrationApplies = (
  calibration: ServoCalibration | undefined,
  joint: RobotJoint | undefined,
  parts: readonly ScenePart[],
): calibration is ServoCalibration =>
  calibration?.verdict === 'measured' && servoFamilyOf(joint, parts) === calibration.family;

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
