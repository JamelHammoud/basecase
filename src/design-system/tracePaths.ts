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

function extendRange(range: Range, values: ArrayLike<number>) {
  for (let i = 0; i < values.length; i++) {
    const value = values[i];

    if (!Number.isFinite(value)) continue;

    range[0] = Math.min(range[0], value);
    range[1] = Math.max(range[1], value);
  }
}

function rangeOf(traces: Trace[], field: 'values' | 'x', extra: number[]): Range {
  const range: Range = [Infinity, -Infinity];

  for (const trace of traces) {
    const values = trace[field];

    if (values) extendRange(range, values);
  }

  extendRange(range, extra);

  if (range[0] === Infinity) return [-1, 1];

  const [low, high] = range;
  const pad = high > low ? 0 : Math.max(Math.abs(high), 1) * 0.1;

  return [low - pad, high + pad];
}

export const traceRange = (traces: Trace[], extra: number[] = []): Range => rangeOf(traces, 'values', extra);

export const hasX = (traces: Trace[]) => traces.some((t) => t.x);

export const xRange = (traces: Trace[], extra: number[] = []): Range => rangeOf(traces, 'x', extra);

export const valueX = (value: number, range: Range, box: TraceBox) =>
  ((value - range[0]) / (range[1] - range[0])) * box.width;

export const sampleCount = (traces: Trace[]) => traces.reduce((n, t) => Math.max(n, t.values.length), 0);

export const sampleX = (index: number, count: number, box: TraceBox) => (index / Math.max(count - 1, 1)) * box.width;

export const valueY = (value: number, range: Range, box: TraceBox) =>
  box.inset + (1 - (value - range[0]) / (range[1] - range[0])) * (box.height - 2 * box.inset);

export const sampleAt = (fraction: number, count: number) =>
  Math.max(0, Math.min(count - 1, Math.round(fraction * (count - 1))));

type AppendPoint = (index: number, value: number) => void;

function appendBucket(values: ArrayLike<number>, from: number, to: number, append: AppendPoint) {
  let low = -1;
  let high = -1;
  let lowValue = Number.NaN;
  let highValue = Number.NaN;

  for (let i = from; i < to; i++) {
    const value = values[i];

    if (!Number.isFinite(value)) continue;

    if (low < 0 || value < lowValue) {
      low = i;
      lowValue = value;
    }

    if (high < 0 || value > highValue) {
      high = i;
      highValue = value;
    }
  }

  if (low < 0) {
    append(from, Number.NaN);

    return;
  }

  const lowFirst = low <= high;

  append(lowFirst ? low : high, lowFirst ? lowValue : highValue);

  if (low !== high) append(lowFirst ? high : low, lowFirst ? highValue : lowValue);
}

function appendSamples(values: ArrayLike<number>, columns: number, append: AppendPoint) {
  if (values.length <= columns * 2) {
    for (let i = 0; i < values.length; i++) append(i, values[i]);

    return;
  }

  const per = values.length / columns;

  for (let c = 0; c < Math.floor(columns); c++) {
    appendBucket(values, Math.floor(c * per), Math.floor((c + 1) * per), append);
  }
}

function pathOf(values: ArrayLike<number>, range: Range, box: TraceBox): string {
  const parts: string[] = [];
  let pen = 'M';

  appendSamples(values, box.width, (i, v) => {
    if (!Number.isFinite(v)) {
      pen = 'M';

      return;
    }

    parts.push(`${pen}${sampleX(i, values.length, box).toFixed(1)} ${valueY(v, range, box).toFixed(1)}`);
    pen = 'L';
  });

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
