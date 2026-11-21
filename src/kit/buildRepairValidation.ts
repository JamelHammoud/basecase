import { isHash } from '../skills/hash';
import type { BuildRepairRecord } from './buildRepairTypes';

const timestamp = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));

export function validBuildRepairs(value: unknown) {
  if (value === undefined) return true;

  return (
    Array.isArray(value) &&
    value.length <= 32 &&
    value.every(validRepair) &&
    new Set(value.map((item) => item.id)).size === value.length
  );
}

function validIdentity(repair: BuildRepairRecord) {
  return (
    !!repair &&
    typeof repair.id === 'string' &&
    !!repair.id &&
    typeof repair.build === 'string' &&
    isHash(repair.source) &&
    isHash(repair.target) &&
    Array.isArray(repair.affected) &&
    repair.affected.every((id) => typeof id === 'string') &&
    timestamp(repair.createdAt)
  );
}

function validProgress(repair: BuildRepairRecord) {
  return (
    ['active', 'incomplete', 'cancelled', 'complete'].includes(repair.state) &&
    Number.isInteger(repair.count) &&
    repair.count >= 0 &&
    repair.count <= 10000 &&
    Number.isInteger(repair.index) &&
    repair.index >= 0 &&
    repair.index < Math.max(1, repair.count) &&
    !!repair.completed &&
    typeof repair.completed === 'object' &&
    !Array.isArray(repair.completed)
  );
}

function validRepair(repair: BuildRepairRecord) {
  if (!validIdentity(repair) || !validProgress(repair)) return false;

  if (
    !repair.plan ||
    repair.plan.refusal ||
    !Array.isArray(repair.plan.phases) ||
    !Array.isArray(repair.plan.declarations)
  )
    return false;

  const steps =
    repair.plan.phases.reduce((sum, phase) => sum + (phase.plan?.steps?.length ?? NaN), 0) +
    repair.plan.declarations.length;

  const complete =
    repair.state !== 'complete' || (timestamp(repair.completedAt) && isHash(repair.allocationEvidence?.signature));

  return (
    complete &&
    steps === repair.count &&
    Object.entries(repair.completed).every(
      ([index, at]) =>
        Number.isInteger(Number(index)) &&
        String(Number(index)) === index &&
        Number(index) >= 0 &&
        Number(index) < repair.count &&
        timestamp(at),
    )
  );
}
