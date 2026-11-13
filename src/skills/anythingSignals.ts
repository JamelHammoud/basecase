import type { Contract, Expr, Formula, State, TimeWindow } from './contract';
import type { SignalSource } from './environment';
import type { BodyFacts } from './anythingBody';
import type { Cmp, SpecFormula, SpecState, SpecWindow, TaskSpec } from './anythingTypes';

const D2R = Math.PI / 180;

interface Lowered {
  name: string;
  source: SignalSource;
  delta: boolean;
  gain: number;
  offset: number;
  scale: number;
}

const FLIP: Record<Cmp, Cmp> = { '<': '>', '<=': '>=', '>': '<', '>=': '<=' };

const PART_AXES = ['right', 'forward', 'up', 'height'] as const;

function baseSignal(name: string, facts: BodyFacts): Lowered | null {
  const plain = (source: SignalSource, scale: number, delta = false): Lowered => ({
    name,
    source,
    delta,
    gain: 1,
    offset: 0,
    scale,
  });

  if (name === 'time') return plain({ kind: 'time' }, 0.1);

  if (!facts.floating) return null;

  if (name === 'forward') return plain({ kind: 'base-forward' }, 0.02, true);

  if (name === 'left') return plain({ kind: 'part-position', part: facts.rootPart, axis: 'x' }, 0.02, true);

  if (name === 'height') return plain({ kind: 'base-height' }, 0.02);

  return name === 'tilt' ? plain({ kind: 'base-tilt' }, 0.05) : null;
}

function jointSignal(name: string, facts: BodyFacts): Lowered | null {
  const id = name.slice(2);
  const joint = facts.joints.find((j) => j.id === id);

  if (!name.startsWith('q:') || !joint) return null;

  return {
    name: `q_${id}`,
    source: { kind: 'joint-position', joint: id },
    delta: false,
    gain: D2R,
    offset: 0,
    scale: 0.02,
  };
}

function partSignal(name: string, facts: BodyFacts): Lowered | null {
  const dot = name.lastIndexOf('.');
  const part = facts.parts.find((p) => p.id === name.slice(0, dot));
  const axis = name.slice(dot + 1) as (typeof PART_AXES)[number];

  if (dot < 0 || !part || !PART_AXES.includes(axis)) return null;

  const [bx, by, bz] = facts.base;
  const world = { right: 'x', forward: 'y', up: 'z', height: 'z' } as const;
  const gain = { right: -0.001, forward: -0.001, up: 0.001, height: 0.001 }[axis];
  const offset = { right: bx, forward: by, up: bz, height: 0 }[axis];

  return {
    name: `p_${part.id}_${world[axis]}`,
    source: { kind: 'part-position', part: part.id, axis: world[axis] },
    delta: false,
    gain,
    offset,
    scale: 0.01,
  };
}

export function lowerSignal(name: string, facts: BodyFacts): Lowered {
  const found = baseSignal(name, facts) ?? jointSignal(name, facts) ?? partSignal(name, facts);

  if (!found) throw new Error(`Unknown signal ${name}.`);

  return found;
}

class Lowering {
  readonly signals: Record<string, SignalSource> = {};
  private readonly facts: BodyFacts;

  constructor(facts: BodyFacts) {
    this.facts = facts;
  }

  private exprOf(l: Lowered): Expr {
    this.signals[l.name] = l.source;

    return l.delta ? { delta: { signal: l.name } } : { signal: l.name };
  }

  atom(sig: string, cmp: Cmp, value: number): State {
    const l = lowerSignal(sig, this.facts);
    const real = l.offset + l.gain * value;

    return {
      atom: { expr: this.exprOf(l), cmp: l.gain < 0 ? FLIP[cmp] : cmp, value: real, scale: l.scale },
    };
  }

  absAtom(sig: string, cmp: Cmp, value: number): State {
    const upper = cmp === '<' || cmp === '<=';
    const pair = [this.atom(sig, cmp, value), this.atom(sig, FLIP[cmp], -value)];

    return upper ? { all: pair } : { any: pair };
  }

  state(s: SpecState): State {
    if ('atom' in s) {
      const { sig, cmp, value } = s.atom;

      return s.atom.abs ? this.absAtom(sig, cmp, value) : this.atom(sig, cmp, value);
    }

    if ('within' in s) {
      const { sig, center, tol } = s.within;

      return { all: [this.atom(sig, '>', center - tol), this.atom(sig, '<', center + tol)] };
    }

    if ('near' in s) return this.near(s.near);

    if ('not' in s) return { not: this.state(s.not) };

    return 'all' in s ? { all: s.all.map((x) => this.state(x)) } : { any: s.any.map((x) => this.state(x)) };
  }

  private near(n: Extract<SpecState, { near: unknown }>['near']): State {
    const axes = [
      ['right', n.right],
      ['forward', n.forward],
      ['up', n.up],
    ] as const;

    return {
      all: axes.map(([axis, v]) => this.state({ within: { sig: `${n.part}.${axis}`, center: v, tol: n.tol } })),
    };
  }

  formula(f: SpecFormula): Formula {
    if ('always' in f) return { always: { window: windowOf(f.always.window), state: this.state(f.always.state) } };

    if ('eventually' in f)
      return { eventually: { window: windowOf(f.eventually.window), state: this.state(f.eventually.state) } };

    if ('hold_for' in f) {
      const h = f.hold_for;

      return { hold_for: { seconds: h.seconds, state: this.state(h.state), within: windowOf(h.within ?? 'whole') } };
    }

    if ('sequence' in f) return { sequence: f.sequence.map((x) => this.formula(x)) };

    return 'all' in f ? { all: f.all.map((x) => this.formula(x)) } : { any: f.any.map((x) => this.formula(x)) };
  }
}

function windowOf(w: SpecWindow | undefined): TimeWindow {
  if (!w || w === 'whole') return 'whole';

  return 'last' in w ? { last: w.last } : { from: w.from, to: w.to };
}

export interface LoweredContract {
  contract: Contract;
  signals: Record<string, SignalSource>;
}

export function lowerSpec(spec: Pick<TaskSpec, 'success' | 'failures'>, facts: BodyFacts): LoweredContract {
  const lowering = new Lowering(facts);
  const success = lowering.formula(spec.success);
  const failures = spec.failures.map((f) => ({ label: f.label, formula: lowering.formula(f.formula) }));

  return { contract: { version: 1, success, failures }, signals: lowering.signals };
}
