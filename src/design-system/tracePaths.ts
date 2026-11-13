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

const finiteValues = (traces: Trace[]) => traces.flatMap((t) => Array.from(t.values)).filter((v) => Number.isFinite(v));

export function traceRange(traces: Trace[]): [number, number] {
  const values = finiteValues(traces);

  if (!values.length) return [-1, 1];

  const low = values.reduce((a, b) => Math.min(a, b));
  const high = values.reduce((a, b) => Math.max(a, b));
  const pad = high > low ? 0 : Math.max(Math.abs(high), 1) * 0.1;

  return [low - pad, high + pad];
}

function pathOf(values: ArrayLike<number>, range: [number, number], box: TraceBox): string {
  const [low, high] = range;
  const last = Math.max(values.length - 1, 1);
  const tall = box.height - 2 * box.inset;
  const parts: string[] = [];
  let pen = 'M';

  for (let i = 0; i < values.length; i++) {
    const v = values[i];

    if (!Number.isFinite(v)) {
      pen = 'M';

      continue;
    }

    const x = (i / last) * box.width;
    const y = box.inset + (1 - (v - low) / (high - low)) * tall;

    parts.push(`${pen}${x.toFixed(1)} ${y.toFixed(1)}`);
    pen = 'L';
  }

  return parts.join('');
}

export function tracePaths(traces: Trace[], box: TraceBox): Array<{ id: string; tone: TraceTone; d: string }> {
  const range = traceRange(traces);

  return traces.map((t) => ({ id: t.id, tone: t.tone, d: pathOf(t.values, range, box) }));
}
