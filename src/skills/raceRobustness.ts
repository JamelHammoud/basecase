import type { Atom, Expr, Formula, State, TimeWindow } from './contract';
import type { Environment, SignalSource } from './environment';

const num = (x: number) => (Number.isFinite(x) ? x.toPrecision(8) : '0.0');

type Lowering = (atom: Atom, end: number) => string | null;

function sourceOf(env: Environment, expr: Expr): SignalSource | null {
  return 'signal' in expr ? (env.signals[expr.signal] ?? null) : null;
}

function plainMargin(atom: Atom, x: string, scale: number): string {
  const raw = `(${x} - ${num(atom.value)})`;

  return atom.cmp.startsWith('>') ? `${raw} / ${num(scale)}` : `-${raw} / ${num(scale)}`;
}

function signalMargin(env: Environment, atom: Atom): string | null {
  const kind = sourceOf(env, atom.expr)?.kind;

  if (kind === 'base-height') return plainMargin(atom, 'state.z', atom.scale);

  if (kind !== 'base-tilt') return null;

  const flip = {
    ...atom,
    cmp: atom.cmp.startsWith('<') ? ('>' as const) : ('<' as const),
    value: Math.cos(atom.value),
  };

  return plainMargin(flip, '(-state.gravity[2])', atom.scale * Math.max(Math.sin(atom.value), 0.05));
}

function travelMargin(env: Environment, atom: Atom, end: number): string | null {
  const inner = 'abs' in atom.expr ? atom.expr.abs : atom.expr;
  const absolute = 'abs' in atom.expr;
  const forward = 'delta' in inner && sourceOf(env, inner.delta)?.kind === 'base-forward';

  if (!forward || end <= 0) return null;

  const speed = absolute ? 'abs(-state.linvel[1])' : '(-state.linvel[1])';

  return plainMargin({ ...atom, value: atom.value / end }, speed, atom.scale / end);
}

const lowerAtom =
  (env: Environment): Lowering =>
  (atom, end) =>
    signalMargin(env, atom) ?? travelMargin(env, atom, end);

function windowEnd(window: TimeWindow, horizon: number): number {
  if (window === 'whole' || 'last' in window) return horizon;

  return window.to;
}

function stateTerms(state: State, options: { lower: Lowering; end: number }): Array<string | null> {
  if ('all' in state) return state.all.flatMap((s) => stateTerms(s, options));

  if ('any' in state) return state.any.flatMap((s) => stateTerms(s, options));

  if ('not' in state) return [null];

  return [options.lower(state.atom, options.end)];
}

function formulaTerms(formula: Formula, options: { lower: Lowering; horizon: number }): Array<string | null> {
  const { lower, horizon } = options;

  if ('all' in formula) return formula.all.flatMap((f) => formulaTerms(f, options));

  if ('any' in formula) return formula.any.flatMap((f) => formulaTerms(f, options));

  if ('sequence' in formula) return formula.sequence.flatMap((f) => formulaTerms(f, options));

  if ('hold_for' in formula) return stateTerms(formula.hold_for.state, { lower, end: horizon });

  const body = 'always' in formula ? formula.always : formula.eventually;

  return stateTerms(body.state, { lower, end: windowEnd(body.window, horizon) });
}

export function robustnessReward(env: Environment): string | null {
  const terms = formulaTerms(env.contract.success, { lower: lowerAtom(env), horizon: env.horizonS });

  if (!terms.length || terms.some((t) => t === null)) return null;

  const body = terms.map((t, i) => `term("atom${i}", clamp(${t}, -1.0, 1.0) * scale)`).join('\n        + ');

  return `
def fell(state):
    return -state.gravity[2] < 0.5 or state.z < 0.45 * state.z0

def reward(state):
    scale = state.control_dt * 10
    return (
        ${body}
        - term("fall", 2.0 if fell(state) else 0.0)
    )
`;
}
