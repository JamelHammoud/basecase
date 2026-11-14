import type { Bound, IndexedTry, QueryFilters } from './types';

type Check = (entry: IndexedTry) => boolean;

const oneOf = (list: string[], read: (entry: IndexedTry) => string | null): Check | null => {
  const wanted = new Set(list.map((v) => v.toLowerCase()));

  return list.length ? (e) => wanted.has(read(e)?.toLowerCase() ?? '') : null;
};

const above = (value: number, low: Bound | null) =>
  low === null || value > low.value || (low.inclusive && value === low.value);

const below = (value: number, high: Bound | null) =>
  high === null || value < high.value || (high.inclusive && value === high.value);

const bounded = (low: Bound | null, high: Bound | null, read: (entry: IndexedTry) => number): Check | null =>
  low === null && high === null ? null : (e) => above(read(e), low) && below(read(e), high);

const from = (value: number | null): Bound | null => (value === null ? null : { value, inclusive: true });

const until = (value: number | null): Bound | null => (value === null ? null : { value, inclusive: false });

export function factFilter(f: QueryFilters): Check {
  const checks = [
    oneOf(f.verdicts, (e) => e.verdict),
    oneOf(f.sources, (e) => e.source),
    oneOf(f.inputs, (e) => e.input),
    oneOf(f.robots, (e) => e.robot),
    bounded(from(f.after), until(f.before), (e) => e.time),
    bounded(f.minSeconds, f.maxSeconds, (e) => e.seconds),
    f.faulted === null ? null : (e: IndexedTry) => e.faulted === f.faulted,
  ].filter((c): c is Check => c !== null);

  return (e) => checks.every((check) => check(e));
}

export function signatureDistance(a: number[], b: number[]): number {
  let sum = 0;

  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];

    sum += d * d;
  }

  return Math.sqrt(sum) / 127;
}
