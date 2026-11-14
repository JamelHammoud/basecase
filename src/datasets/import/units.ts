export type SourceUnit = 'rad' | 'deg' | 'counts';

export const RADIAN_LIMIT = 2 * Math.PI * 1.05;
export const DEGREE_LIMIT = 360;
export const FEETECH_COUNTS = 4096;

const FEETECH_CENTER = FEETECH_COUNTS / 2;

export interface ColumnSpan {
  lo: number;
  hi: number;
}

export function columnSpans(state: Float64Array, width: number): ColumnSpan[] {
  const spans = Array.from({ length: width }, () => ({ lo: Infinity, hi: -Infinity }));

  for (let i = 0; i < state.length; i++) {
    const span = spans[i % width];

    span.lo = Math.min(span.lo, state[i]);
    span.hi = Math.max(span.hi, state[i]);
  }

  return spans;
}

export function mergedSpans(all: ColumnSpan[][]): ColumnSpan[] {
  const width = all[0]?.length ?? 0;

  return Array.from({ length: width }, (_, c) => ({
    lo: Math.min(...all.map((spans) => spans[c].lo)),
    hi: Math.max(...all.map((spans) => spans[c].hi)),
  }));
}

export function detectUnit(spans: ColumnSpan[]): SourceUnit | null {
  const known = spans.filter((s) => s.lo <= s.hi);

  if (!known.length) return 'rad';

  const lo = Math.min(...known.map((s) => s.lo));
  const hi = Math.max(...known.map((s) => s.hi));

  if (Math.max(-lo, hi) <= RADIAN_LIMIT) return 'rad';

  if (lo >= -DEGREE_LIMIT && hi <= DEGREE_LIMIT) return 'deg';

  return lo >= 0 && hi < FEETECH_COUNTS ? 'counts' : null;
}

const TO_RADIANS: Record<SourceUnit, (v: number) => number> = {
  rad: (v) => v,
  deg: (v) => (v * Math.PI) / 180,
  counts: (v) => ((v - FEETECH_CENTER) * 2 * Math.PI) / FEETECH_COUNTS,
};

export const toRadians = (value: number, unit: SourceUnit) => TO_RADIANS[unit](value);
