import type { V3 } from '../../utils/kinematics';

export interface OneEuroOptions {
  minCutoff: number;
  beta: number;
  dCutoff: number;
}

export type ScalarFilter = (x: number, tSeconds: number) => number;

export const BODY_ONE_EURO: OneEuroOptions = { minCutoff: 1, beta: 3, dCutoff: 1 };

const alpha = (cutoff: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

export function createOneEuro(options: OneEuroOptions = BODY_ONE_EURO): ScalarFilter {
  const { minCutoff, beta, dCutoff } = options;
  let last: { x: number; dx: number; t: number } | null = null;

  return (x, tSeconds) => {
    if (!last) {
      last = { x, dx: 0, t: tSeconds };

      return x;
    }

    const dt = tSeconds - last.t;

    if (dt <= 0 || !Number.isFinite(dt)) return last.x;

    const dx = last.dx + alpha(dCutoff, dt) * ((x - last.x) / dt - last.dx);
    const cutoff = minCutoff + beta * Math.abs(dx);
    const filtered = last.x + alpha(cutoff, dt) * (x - last.x);

    last = { x: filtered, dx, t: tSeconds };

    return filtered;
  };
}

export interface KeypointSmoother {
  filter: (frame: Readonly<Partial<Record<string, V3>>>, tSeconds: number) => Record<string, V3>;
}

export function createKeypointSmoother(options: OneEuroOptions = BODY_ONE_EURO): KeypointSmoother {
  const filters = new Map<string, [ScalarFilter, ScalarFilter, ScalarFilter]>();
  const filtersOf = (key: string) => {
    const known = filters.get(key);

    if (known) return known;

    const made: [ScalarFilter, ScalarFilter, ScalarFilter] = [
      createOneEuro(options),
      createOneEuro(options),
      createOneEuro(options),
    ];

    filters.set(key, made);

    return made;
  };

  return {
    filter: (frame, tSeconds) => {
      const out: Record<string, V3> = {};

      for (const [key, p] of Object.entries(frame)) {
        if (!p) continue;

        const [fx, fy, fz] = filtersOf(key);

        out[key] = [fx(p[0], tSeconds), fy(p[1], tSeconds), fz(p[2], tSeconds)];
      }

      return out;
    },
  };
}
