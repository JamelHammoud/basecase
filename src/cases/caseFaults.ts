import type { SimEngine } from '../sim/engine';
import { FAULT_KINDS, type FaultKind } from '../sim/faults';
import type { SimModel } from '../sim/mjcfTypes';
import { asId, asRecord, listOf, oneOf, refuse, type Reader } from './validate';

export const MAX_CASE_FAULTS = 32;

export interface CaseFault {
  joint: string;
  kind: FaultKind;
}

export const readCaseFault: Reader<CaseFault> = (value, where) => {
  const v = asRecord(value, where);

  return { joint: asId(v.joint, `${where}.joint`), kind: oneOf(FAULT_KINDS)(v.kind, `${where}.kind`) };
};

export function readCaseFaults(value: unknown, where: string): CaseFault[] {
  const faults = listOf(readCaseFault, MAX_CASE_FAULTS)(value, where);

  if (new Set(faults.map(faultKey)).size !== faults.length) refuse(where, 'repeats a fault');

  return faults;
}

export const faultKey = (fault: CaseFault) => `${fault.joint}|${fault.kind}`;

export const sameFault = (a: CaseFault, b: CaseFault) => a.joint === b.joint && a.kind === b.kind;

export const faultsOf = (kase: { faults?: CaseFault[] }): CaseFault[] => kase.faults ?? [];

export const withoutFaults = <T extends { faults?: CaseFault[] }>(kase: T): T =>
  Object.fromEntries(Object.entries(kase).filter(([key]) => key !== 'faults')) as T;

export function withFault<T extends { faults?: CaseFault[] }>(kase: T, fault: CaseFault): T {
  const rest = faultsOf(kase).filter((f) => !sameFault(f, fault));

  return { ...kase, faults: [...rest, fault] };
}

export function withoutFault<T extends { faults?: CaseFault[] }>(kase: T, fault: CaseFault): T {
  const rest = faultsOf(kase).filter((f) => !sameFault(f, fault));

  return rest.length ? { ...kase, faults: rest } : withoutFaults(kase);
}

export const faultRefusal = (joint: string) => `${joint} isn’t a servo on this robot.`;

export function missingFault(
  joints: ReadonlyArray<{ id: string; type: string; actuation?: string }>,
  fault: CaseFault,
) {
  const found = joints.some((j) => j.id === fault.joint && j.type !== 'fixed' && j.actuation !== 'passive');

  return found ? null : faultRefusal(fault.joint);
}

export function limpen(engine: SimEngine, model: SimModel, keys: Set<string>) {
  const range = engine.model.actuator_forcerange;

  for (const j of model.joints)
    if (keys.has(j.robot) && j.actuator >= 0) range.fill(0, j.actuator * 2, j.actuator * 2 + 2);
}
