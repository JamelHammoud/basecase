import { stateSignals } from './anythingApproval';
import type { SpecFormula, SpecState, TaskSpec } from './anythingTypes';

const WINDOW_SHARE = 0.8;
const LEVEL_RAD = 0.3;

function stepFor(sig: string): number {
  if (sig === 'time') return 0;

  if (sig === 'tilt') return 0.015;

  if (sig.startsWith('q:')) return 0.5;

  return sig.includes('.') ? 3 : 0.005;
}

function state(s: SpecState, sign: number): SpecState {
  if ('atom' in s) {
    const { atom } = s;
    const up = atom.cmp.startsWith('>') ? 1 : -1;

    return { atom: { ...atom, value: atom.value + sign * up * stepFor(atom.sig) } };
  }

  if ('within' in s) {
    const share = sign > 0 ? WINDOW_SHARE : 1 / WINDOW_SHARE;

    return { within: { ...s.within, tol: s.within.tol * share } };
  }

  if ('near' in s) {
    const share = sign > 0 ? WINDOW_SHARE : 1 / WINDOW_SHARE;

    return { near: { ...s.near, tol: s.near.tol * share } };
  }

  if ('not' in s) return { not: state(s.not, -sign) };

  return 'all' in s ? { all: s.all.map((x) => state(x, sign)) } : { any: s.any.map((x) => state(x, sign)) };
}

function formula(f: SpecFormula, sign: number): SpecFormula {
  if ('always' in f) return { always: { ...f.always, state: state(f.always.state, sign) } };

  if ('eventually' in f) return { eventually: { ...f.eventually, state: state(f.eventually.state, sign) } };

  if ('hold_for' in f) return { hold_for: { ...f.hold_for, state: state(f.hold_for.state, sign) } };

  if ('sequence' in f) return { sequence: f.sequence.map((x) => formula(x, sign)) };

  return 'all' in f ? { all: f.all.map((x) => formula(x, sign)) } : { any: f.any.map((x) => formula(x, sign)) };
}

export function tightenedSpec(spec: TaskSpec): TaskSpec {
  return {
    ...spec,
    success: formula(spec.success, 1),
    failures: spec.failures.map((f) => ({ ...f, formula: formula(f.formula, -1) })),
  };
}

const levelState = (s: SpecState, bound: number): SpecState => ({
  all: [s, { atom: { sig: 'tilt', cmp: '<', value: bound } }],
});

function levelHeld<T extends { state: SpecState }>(held: T, bound: number): T {
  const posture = stateSignals(held.state).includes('height');

  return posture ? { ...held, state: levelState(held.state, bound) } : held;
}

function levelled(f: SpecFormula, bound: number): SpecFormula {
  if ('hold_for' in f) return { hold_for: levelHeld(f.hold_for, bound) };

  if ('always' in f) return { always: levelHeld(f.always, bound) };

  if ('eventually' in f) return f;

  if ('sequence' in f) return { sequence: f.sequence.map((x) => levelled(x, bound)) };

  return 'all' in f ? { all: f.all.map((x) => levelled(x, bound)) } : { any: f.any.map((x) => levelled(x, bound)) };
}

export function levelSpec(spec: TaskSpec): TaskSpec {
  const sketched = Math.max(0, ...spec.intent.map((k) => Math.abs(k.base?.tilt ?? 0)));

  return { ...spec, success: levelled(spec.success, sketched + LEVEL_RAD) };
}

export function claimSpec(spec: TaskSpec, options: { level: boolean }): TaskSpec {
  return tightenedSpec(options.level ? levelSpec(spec) : spec);
}
