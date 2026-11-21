import type { BuildRecord } from './buildPersistence';
import type { BuildRepairRecord } from './buildRepairTypes';

export function currentBuildRepair(record: BuildRecord) {
  const repair = record.repairs?.at(-1);

  return repair?.state !== 'complete' ? repair : undefined;
}

export function canRecordRepair(record: BuildRecord, repair: BuildRepairRecord | undefined) {
  return !!repair && repair.id === currentBuildRepair(record)?.id && repair.state === 'active';
}

export function selectedRepair(record: BuildRecord, id: string) {
  const repair = currentBuildRepair(record);

  if (!repair || repair.id !== id) throw new Error('Open the current repair.');

  return repair;
}

export function changeRepair(record: BuildRecord, repair: BuildRepairRecord) {
  return { ...record, repairs: [...(record.repairs ?? []).slice(0, -1), repair] };
}

export function stepOf(repair: BuildRepairRecord, step: number) {
  if (!Number.isInteger(step) || step < 0 || step >= repair.count) throw new Error('Choose a repair step.');

  return step;
}
