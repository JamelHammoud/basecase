export type TraceTone = 'primary' | 'muted' | 'accent';

export interface Trace {
  id: string;
  values: ArrayLike<number>;
  tone: TraceTone;
}

export interface TraceBox {
  width: number;
  height: number;
  inset: number;
}

type Range = [number, number];

const finiteValues = (traces: Trace[], extra: number[]) =>
  [...traces.flatMap((t) => Array.from(t.values)), ...extra].filter((v) => Number.isFinite(v));

export function traceRange(traces: Trace[], extra: number[] = []): Range {
  const values = finiteValues(traces, extra);

  if (!values.length) return [-1, 1];

  const low = values.reduce((a, b) => Math.min(a, b));
  const high = values.reduce((a, b) => Math.max(a, b));
  const pad = high > low ? 0 : Math.max(Math.abs(high), 1) * 0.1;

  return [low - pad, high + pad];
}

export const sampleCount = (traces: Trace[]) => traces.reduce((n, t) => Math.max(n, t.values.length), 0);

export const sampleX = (index: number, count: number, box: TraceBox) => (index / Math.max(count - 1, 1)) * box.width;

export const valueY = (value: number, range: Range, box: TraceBox) =>
  box.inset + (1 - (value - range[0]) / (range[1] - range[0])) * (box.height - 2 * box.inset);

export const sampleAt = (fraction: number, count: number) =>
  Math.max(0, Math.min(count - 1, Math.round(fraction * (count - 1))));

function bucketPoints(values: ArrayLike<number>, from: number, to: number): Array<[number, number]> {
  let low = -1;
  let high = -1;

  for (let i = from; i < to; i++) {
    if (!Number.isFinite(values[i])) continue;

    if (low < 0 || values[i] < values[low]) low = i;

    if (high < 0 || values[i] > values[high]) high = i;
  }

  if (low < 0) return [[from, Number.NaN]];

  return [...new Set([Math.min(low, high), Math.max(low, high)])].map((i) => [i, values[i]]);
}

function samplePoints(values: ArrayLike<number>, columns: number): Array<[number, number]> {
  if (values.length <= columns * 2) return Array.from(values, (v, i) => [i, v]);

  const per = values.length / columns;

  return Array.from({ length: columns }, (_, c) =>
    bucketPoints(values, Math.floor(c * per), Math.floor((c + 1) * per)),
  ).flat();
}

function pathOf(values: ArrayLike<number>, range: Range, box: TraceBox): string {
  const parts: string[] = [];
  let pen = 'M';

  for (const [i, v] of samplePoints(values, box.width)) {
    if (!Number.isFinite(v)) {
      pen = 'M';

      continue;
    }

    parts.push(`${pen}${sampleX(i, values.length, box).toFixed(1)} ${valueY(v, range, box).toFixed(1)}`);
    pen = 'L';
  }

  return parts.join('');
}

export function tracePaths(
  traces: Trace[],
  box: TraceBox,
  range: Range = traceRange(traces),
): Array<{ id: string; tone: TraceTone; d: string }> {
  return traces.map((t) => ({ id: t.id, tone: t.tone, d: pathOf(t.values, range, box) }));
}
