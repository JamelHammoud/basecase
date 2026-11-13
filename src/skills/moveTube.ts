import type { MoveReference } from './environment';

export const MOVE_LAG_S = 0.2;

const MIN_WINDOW_S = 0.1;
const NODE_BUDGET = 3600;

export interface TubeWindow {
  from: number;
  to: number;
  bands: Array<[number, number]>;
}

export function referenceAt(reference: MoveReference, step: number): number[] {
  const n = reference.frames.length;
  const k = reference.loop ? ((step % n) + n) % n : Math.min(Math.max(step, 0), n - 1);

  return reference.frames[k];
}

export function windowSeconds(reference: MoveReference, horizonS: number): number {
  const windows = Math.max(1, Math.floor(NODE_BUDGET / (2 + 4 * reference.joints.length)));

  return Math.max(MIN_WINDOW_S, horizonS / windows);
}

function bands(reference: MoveReference, span: { from: number; to: number; toleranceRad: number }) {
  const dt = reference.controlDt;
  const first = Math.max(0, Math.floor((span.from - MOVE_LAG_S) / dt));
  const last = Math.ceil((span.to + MOVE_LAG_S) / dt);
  const lo = reference.joints.map(() => Infinity);
  const hi = reference.joints.map(() => -Infinity);

  for (let k = first; k <= last; k++) {
    const frame = referenceAt(reference, k);

    reference.joints.forEach((_, j) => {
      lo[j] = Math.min(lo[j], frame[j]);
      hi[j] = Math.max(hi[j], frame[j]);
    });
  }

  return lo.map((l, j): [number, number] => [l - span.toleranceRad, hi[j] + span.toleranceRad]);
}

export function moveTube(reference: MoveReference, options: { horizonS: number; toleranceRad: number }): TubeWindow[] {
  const step = windowSeconds(reference, options.horizonS);
  const count = Math.ceil(options.horizonS / step - 1e-9);

  return Array.from({ length: count }, (_, i) => {
    const from = i * step;
    const to = Math.min(options.horizonS, (i + 1) * step);

    return { from, to, bands: bands(reference, { from, to, toleranceRad: options.toleranceRad }) };
  });
}

export function outsideTube(tube: TubeWindow[], values: number[]): number {
  return Math.max(...tube.flatMap((w) => w.bands.map(([lo, hi], j) => Math.max(lo - values[j], values[j] - hi))));
}
