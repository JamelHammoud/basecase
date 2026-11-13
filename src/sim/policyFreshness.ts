import type { PolicyRecord } from '../types/robotics';
import { SIM_MODEL_VERSION, type SimModel } from './mjcfTypes';

export type RobotFingerprints = Record<string, string>;

export const modelFingerprints = (model: SimModel | null): RobotFingerprints =>
  Object.fromEntries((model?.robots ?? []).map((r) => [r.key, r.fingerprint]));

export function isStalePolicy(
  record: Partial<Pick<PolicyRecord, 'modelVersion' | 'fingerprint' | 'robot'>>,
  current: RobotFingerprints = {},
): boolean {
  if ((record.modelVersion ?? 0) !== SIM_MODEL_VERSION) return true;

  const now = record.robot && Object.hasOwn(current, record.robot) ? current[record.robot] : undefined;

  return !!record.fingerprint && !!now && record.fingerprint !== now;
}
