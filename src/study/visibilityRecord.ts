import { boundedInteger, finiteValue, optionalString, recordValue, stringValue } from './recordValues';
import { validVisibilityRequest, VISIBILITY_WIDTH, VISIBILITY_HEIGHT } from './visibilityPlan';

const seconds = (value: unknown) => finiteValue(value) && value >= 0;
const fraction = (value: unknown) => value === undefined || (finiteValue(value) && value >= 0 && value <= 1);
const pixels = (value: unknown) =>
  value === null ||
  (recordValue(value) && boundedInteger(value.pixels, 76800) && boundedInteger(value.potential, 76800));

function validPair(value: unknown, samples: number): boolean {
  if (!recordValue(value) || !Array.isArray(value.pixels) || !Array.isArray(value.intervals)) return false;

  return (
    stringValue(value.camera) &&
    stringValue(value.target) &&
    boundedInteger(value.minPixels, 76800) &&
    (value.minPixels as number) > 0 &&
    value.pixels.length === samples &&
    value.pixels.every(pixels) &&
    seconds(value.seconds) &&
    seconds(value.unavailableSeconds) &&
    value.intervals.length <= samples &&
    value.intervals.every(
      (interval) =>
        recordValue(interval) &&
        seconds(interval.from) &&
        seconds(interval.to) &&
        (interval.to as number) > (interval.from as number) &&
        ['occluded', 'outside', 'below', 'unavailable'].includes(String(interval.state)),
    )
  );
}

function validResultHeader(value: Record<string, unknown>, times: unknown[]): boolean {
  return (
    stringValue(value.key) &&
    value.width === VISIBILITY_WIDTH &&
    value.height === VISIBILITY_HEIGHT &&
    times.length >= 2 &&
    times.length <= 32 &&
    times.every((time, i) => seconds(time) && (i === 0 || (time as number) > (times[i - 1] as number))) &&
    seconds(value.end) &&
    (value.end as number) > (times.at(-1) as number) &&
    fraction(value.coverage) &&
    optionalString(value.error)
  );
}

export function validVisibilityResult(value: unknown): boolean {
  if (value === undefined) return true;

  if (
    !recordValue(value) ||
    !Array.isArray(value.times) ||
    !Array.isArray(value.pairs) ||
    !Array.isArray(value.targets)
  )
    return false;

  return (
    validResultHeader(value, value.times) &&
    value.pairs.length > 0 &&
    value.pairs.length <= 128 &&
    value.pairs.every((pair) => validPair(pair, (value.times as unknown[]).length)) &&
    value.targets.length > 0 &&
    value.targets.length <= 16 &&
    value.targets.every(
      (target) =>
        recordValue(target) && stringValue(target.id) && seconds(target.seconds) && seconds(target.unavailableSeconds),
    )
  );
}

export function validVisibilityRecord(record: Record<string, unknown>): boolean {
  if (record.visibility === undefined) return true;

  if (
    !validVisibilityRequest(record.visibility) ||
    !recordValue(record.current) ||
    !recordValue(record.current.visibility)
  )
    return false;

  const key = record.current.visibility.key;
  const rows = record.rows as Array<Record<string, unknown>>;

  return rows.every((row) => row.error || (recordValue(row.visibility) && row.visibility.key === key));
}
