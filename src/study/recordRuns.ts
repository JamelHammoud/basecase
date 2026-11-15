import type { CaseRuns } from '../cases/caseRuns';
import { boundedInteger, finiteValue, recordValue, stringValue } from './recordValues';

const nullableString = (value: unknown) => value === null || stringValue(value);
const labels = (value: unknown) => Array.isArray(value) && value.every(stringValue);

function numericPath(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;

  const keys = Object.keys(value);
  const values = Object.values(value);

  return (
    keys.length <= 1000000 &&
    keys.every((key, i) => key === String(i)) &&
    (!Array.isArray(value) || value.length === keys.length) &&
    values.every((sample) => finiteValue(sample) && Number.isFinite(Math.fround(sample)))
  );
}

function validTrip(value: unknown): boolean {
  return value === null || (recordValue(value) && stringValue(value.label) && boundedInteger(value.frame, 10000000));
}

function validOutcome(value: unknown): boolean {
  return (
    recordValue(value) &&
    boundedInteger(value.seed, 4294967295) &&
    typeof value.passed === 'boolean' &&
    finiteValue(value.margin) &&
    labels(value.failed) &&
    numericPath(value.path) &&
    validTrip(value.firstTrip)
  );
}

function validFailure(value: unknown): boolean {
  return recordValue(value) && stringValue(value.label) && boundedInteger(value.runs, 100);
}

function validRunLists(value: Record<string, unknown>): boolean {
  return (
    Array.isArray(value.outcomes) &&
    value.outcomes.length <= 100 &&
    value.outcomes.every(validOutcome) &&
    Array.isArray(value.failures) &&
    value.failures.length <= 10000 &&
    value.failures.every(validFailure)
  );
}

export function validSavedRuns(value: unknown): boolean {
  if (value === undefined) return true;

  if (!recordValue(value) || !boundedInteger(value.runs, 100) || !boundedInteger(value.passes, value.runs as number))
    return false;

  return (
    finiteValue(value.medianMargin) &&
    finiteValue(value.worstMargin) &&
    nullableString(value.commonFailure) &&
    nullableString(value.refusal) &&
    typeof value.misfit === 'boolean' &&
    (value.worstSeed === null || boundedInteger(value.worstSeed, 4294967295)) &&
    validRunLists(value)
  );
}

export function restoreSavedRuns(runs: CaseRuns | undefined): CaseRuns | undefined {
  if (!runs || runs.outcomes.every((outcome) => outcome.path instanceof Float32Array)) return runs;

  return {
    ...runs,
    outcomes: runs.outcomes.map((outcome) =>
      outcome.path instanceof Float32Array
        ? outcome
        : {
            ...outcome,
            path: Float32Array.from(Object.values(outcome.path)),
          },
    ),
  };
}
