import type { Cmp, Contract, Expr, Formula, NamedFailure, State, TimeWindow } from '../../src/skills/contract';
import type { SignalSource } from '../../src/skills/environment';

export type V3 = [number, number, number];

export const sig = (name: string): Expr => ({ signal: name });
export const travel = (name: string): Expr => ({ delta: sig(name) });
export const abs = (expr: Expr): Expr => ({ abs: expr });

export const atom = (expr: Expr, cmp: Cmp, value: number, scale = 0.02): State => ({
  atom: { expr, cmp, value, scale },
});

export const all = (...states: State[]): State => ({ all: states });
export const any = (...states: State[]): State => ({ any: states });

export const within = (expr: Expr, center: number, tol: number, scale = 0.02): State =>
  all(atom(expr, '>', center - tol, scale), atom(expr, '<', center + tol, scale));

export const always = (state: State, window: TimeWindow = 'whole'): Formula => ({ always: { window, state } });
export const eventually = (state: State, window: TimeWindow = 'whole'): Formula => ({ eventually: { window, state } });
export const holdFor = (seconds: number, state: State, window: TimeWindow = 'whole'): Formula => ({
  hold_for: { seconds, state, within: window },
});
export const sequence = (...steps: Formula[]): Formula => ({ sequence: steps });
export const both = (...formulas: Formula[]): Formula => ({ all: formulas });

export const near = (prefix: string, point: V3, tol: number): State =>
  all(...(['x', 'y', 'z'] as const).map((axis, i) => within(sig(`${prefix}_${axis}`), point[i], tol, 0.01)));

export const contract = (success: Formula, failures: NamedFailure[] = []): Contract => ({
  version: 1,
  success,
  failures,
});

export function fellFailure(heightM: number): NamedFailure {
  return {
    label: 'fell',
    formula: eventually(any(atom(sig('tilt'), '>', 1, 0.1), atom(sig('height'), '<', 0.45 * heightM, 0.02))),
  };
}

export const baseSignals = (bodyPart: string): Record<string, SignalSource> => ({
  forward: { kind: 'base-forward' },
  height: { kind: 'base-height' },
  tilt: { kind: 'base-tilt' },
  side: { kind: 'part-position', part: bodyPart, axis: 'x' },
});

export const pointSignals = (prefix: string, part: string): Record<string, SignalSource> =>
  Object.fromEntries(
    (['x', 'y', 'z'] as const).map((axis) => [
      `${prefix}_${axis}`,
      { kind: 'part-position', part, axis } as SignalSource,
    ]),
  );
