import type { Series } from '../../../cases/console/signalBus';

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export const recent = (s: Series, seconds: number): Series => {
  const end = s.t.at(-1) ?? 0;
  const from = s.t.findIndex((t) => t >= end - seconds);

  return from <= 0 ? s : { t: s.t.slice(from), v: s.v.slice(from) };
};

export const extent = (values: number[], pad = 0.08): [number, number] => {
  if (!values.length) return [0, 1];

  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || Math.max(Math.abs(hi), 1);

  return [lo - span * pad, hi + span * pad];
};

export const scaler = (from: [number, number], to: [number, number]) => (v: number) =>
  to[0] + ((v - from[0]) / (from[1] - from[0] || 1)) * (to[1] - to[0]);
