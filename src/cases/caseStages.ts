import type { Cmp, Contract, Expr, Formula, State, Trace } from '../skills/contract';

type Signals = Trace['signals'];

const COMPARE: Record<Cmp, (a: number, b: number) => boolean> = {
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
};

const sampleOf = (signals: Signals, name: string, f: number) => signals[name]?.[f] ?? NaN;

function valueAt(expr: Expr, signals: Signals, f: number): number {
  if ('signal' in expr) return sampleOf(signals, expr.signal, f);

  if ('abs' in expr) return Math.abs(valueAt(expr.abs, signals, f));

  if ('delta' in expr) return valueAt(expr.delta, signals, f) - valueAt(expr.delta, signals, 0);

  if ('dist' in expr) {
    const [a, b] = expr.dist;

    return Math.hypot(...a.map((name, k) => sampleOf(signals, name, f) - sampleOf(signals, b[k], f)));
  }

  return NaN;
}

function holds(state: State, signals: Signals, f: number): boolean {
  if ('atom' in state) return COMPARE[state.atom.cmp](valueAt(state.atom.expr, signals, f), state.atom.value);

  if ('all' in state) return state.all.every((s) => holds(s, signals, f));

  if ('any' in state) return state.any.some((s) => holds(s, signals, f));

  return !holds(state.not, signals, f);
}

function stateOf(step: Formula): State | null {
  if ('eventually' in step) return step.eventually.state;

  if ('always' in step) return step.always.state;

  if ('hold_for' in step) return step.hold_for.state;

  return null;
}

function sequencesIn(formula: Formula): Formula[][] {
  if ('sequence' in formula) return [formula.sequence, ...formula.sequence.flatMap(sequencesIn)];

  if ('all' in formula) return formula.all.flatMap(sequencesIn);

  if ('any' in formula) return formula.any.flatMap(sequencesIn);

  return [];
}

function firstHolding(state: State, signals: Signals, range: { from: number; frames: number }): number {
  for (let f = range.from; f < range.frames; f++) if (holds(state, signals, f)) return f;

  return -1;
}

function sequenceStages(steps: Formula[], signals: Signals, frames: number): number[] {
  const stages: number[] = [];
  let from = 0;

  for (const step of steps.slice(0, -1)) {
    const state = stateOf(step);
    const at = state ? firstHolding(state, signals, { from, frames }) : -1;

    if (at < 0) break;

    stages.push(at);
    from = at;
  }

  return stages;
}

export function caseStages(contract: Contract, trace: Trace): number[] {
  const frames = Math.max(0, ...Object.values(trace.signals).map((s) => s.length));
  const stages = sequencesIn(contract.success).flatMap((steps) => sequenceStages(steps, trace.signals, frames));

  return [...new Set(stages)].filter((f) => f > 0).sort((a, b) => a - b);
}
