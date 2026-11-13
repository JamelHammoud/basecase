import { THEME_COLORS } from './theme';

export type TraceTone = 'strong' | 'muted' | 'accent';

export interface Trace {
  id: string;
  values: ArrayLike<number>;
  tone: TraceTone;
}

export const TRACE_COLORS: Record<TraceTone, string> = {
  muted: 'rgba(255, 255, 255, 0.3)',
  strong: 'rgba(255, 255, 255, 0.85)',
  accent: THEME_COLORS.figmaBlue,
};

export type Span = [number, number];

export interface PlotFrame {
  x: Span;
  y: Span;
  width: number;
  height: number;
}

const HEADROOM = 0.08;

export function spanOf(series: ArrayLike<number>[]): Span {
  let lo = Infinity;
  let hi = -Infinity;

  for (const values of series)
    for (let i = 0; i < values.length; i++) {
      const v = values[i];

      if (!Number.isFinite(v)) continue;

      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }

  if (lo > hi) return [0, 1];

  if (lo === hi) return [lo - 1, hi + 1];

  const room = (hi - lo) * HEADROOM;

  return [lo - room, hi + room];
}

const scale = (v: number, [lo, hi]: Span, size: number) => ((v - lo) / (hi - lo)) * size;

const round = (v: number) => Math.round(v * 10) / 10;

export function tracePath(times: ArrayLike<number>, values: ArrayLike<number>, frame: PlotFrame): string {
  const n = Math.min(times.length, values.length);
  const out: string[] = [];
  let pen = 'M';

  for (let i = 0; i < n; i++) {
    const v = values[i];

    if (!Number.isFinite(v) || !Number.isFinite(times[i])) {
      pen = 'M';

      continue;
    }

    const x = round(scale(times[i], frame.x, frame.width));
    const y = round(frame.height - scale(v, frame.y, frame.height));

    out.push(`${pen}${x} ${y}`);
    pen = 'L';
  }

  return out.join('');
}
