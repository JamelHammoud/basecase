export type TraceTone = 'primary' | 'muted' | 'accent';

export interface Trace {
  id: string;
  values: ArrayLike<number>;
  tone: TraceTone;
  x?: ArrayLike<number>;
  points?: boolean;
}

export interface TraceBox {
  width: number;
  height: number;
  inset: number;
}

export type Range = [number, number];

function rangeOf(values: number[]): Range {
  if (!values.length) return [-1, 1];

  const low = values.reduce((a, b) => Math.min(a, b));
  const high = values.reduce((a, b) => Math.max(a, b));
  const pad = high > low ? 0 : Math.max(Math.abs(high), 1) * 0.1;

  return [low - pad, high + pad];
}

const finite = (values: number[]) => values.filter((v) => Number.isFinite(v));

export const traceRange = (traces: Trace[], extra: number[] = []): Range =>
  rangeOf(finite([...traces.flatMap((t) => Array.from(t.values)), ...extra]));

export const hasX = (traces: Trace[]) => traces.some((t) => t.x);

export const xRange = (traces: Trace[], extra: number[] = []): Range =>
  rangeOf(finite([...traces.flatMap((t) => (t.x ? Array.from(t.x) : [])), ...extra]));

export const valueX = (value: number, range: Range, box: TraceBox) =>
  ((value - range[0]) / (range[1] - range[0])) * box.width;

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

function placedPath(t: Trace, ranges: { x: Range; y: Range }, box: TraceBox): string {
  const parts: string[] = [];
  let pen = 'M';

  for (let i = 0; i < t.values.length; i++) {
    const v = t.values[i];
    const x = t.x?.[i] ?? Number.NaN;

    if (!Number.isFinite(v) || !Number.isFinite(x)) {
      pen = 'M';

      continue;
    }

    const at = `${valueX(x, ranges.x, box).toFixed(1)} ${valueY(v, ranges.y, box).toFixed(1)}`;

    parts.push(t.points ? `M${at}h0` : `${pen}${at}`);
    pen = 'L';
  }

  return parts.join('');
}

export interface TracePath {
  id: string;
  tone: TraceTone;
  d: string;
  points?: boolean;
}

export function tracePaths(traces: Trace[], box: TraceBox, range: Range = traceRange(traces), x?: Range): TracePath[] {
  return traces.map((t) => ({
    id: t.id,
    tone: t.tone,
    d: t.x && x ? placedPath(t, { x, y: range }, box) : pathOf(t.values, range, box),
    ...(t.points ? { points: true } : {}),
  }));
}
