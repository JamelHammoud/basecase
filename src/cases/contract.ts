import type { Contract, Expr, Formula, State } from '../skills/contract';
import { asRecord, asString, listOf, refuse, type Reader } from './validate';

export type { Contract, ContractResult, Trace } from '../skills/contract';

const MAX_DEPTH = 64;
const MAX_NODES = 4096;
const MAX_FAILURES = 16;

interface Budget {
  nodes: number;
}

function plainJson(value: unknown, where: string, depth: number, budget: Budget): void {
  budget.nodes += 1;

  if (depth > MAX_DEPTH) refuse(where, 'nests too deeply');

  if (budget.nodes > MAX_NODES) refuse(where, 'is too large');

  if (typeof value === 'number' && !Number.isFinite(value)) refuse(where, 'holds a number that isn’t finite');

  if (Array.isArray(value)) {
    value.forEach((item, i) => plainJson(item, `${where}[${i}]`, depth + 1, budget));

    return;
  }

  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => plainJson(item, `${where}.${key}`, depth + 1, budget));

    return;
  }

  if (!['string', 'number', 'boolean'].includes(typeof value)) refuse(where, 'holds a value a contract can’t carry');
}

export const readContract: Reader<Contract> = (value, where) => {
  const v = asRecord(value, where);

  if (v.version !== 1) return refuse(`${where}.version`, 'must be 1');

  plainJson(v, where, 0, { nodes: 0 });

  return {
    version: 1,
    success: asRecord(v.success, `${where}.success`) as Formula,
    failures: listOf((f, at) => {
      const item = asRecord(f, at);

      return {
        label: asString(item.label, `${at}.label`),
        formula: asRecord(item.formula, `${at}.formula`) as Formula,
      };
    }, MAX_FAILURES)(v.failures ?? [], `${where}.failures`),
  };
};

const usesAngle = (expr: Expr): boolean => {
  if ('angle' in expr) return true;

  if ('abs' in expr) return usesAngle(expr.abs);

  return 'delta' in expr ? usesAngle(expr.delta) : false;
};

const readsUnitless = (expr: Expr, unitless: ReadonlySet<string>): boolean => {
  if ('signal' in expr) return unitless.has(expr.signal);

  if ('abs' in expr) return readsUnitless(expr.abs, unitless);

  return 'delta' in expr ? readsUnitless(expr.delta, unitless) : false;
};

const NOTHING_UNITLESS: ReadonlySet<string> = new Set();

function scaledState(state: State, s: number, unitless: ReadonlySet<string>): State {
  if ('all' in state) return { all: state.all.map((x) => scaledState(x, s, unitless)) };

  if ('any' in state) return { any: state.any.map((x) => scaledState(x, s, unitless)) };

  if ('not' in state) return { not: scaledState(state.not, s, unitless) };

  if (usesAngle(state.atom.expr) || readsUnitless(state.atom.expr, unitless)) return state;

  return { atom: { ...state.atom, value: state.atom.value * s, scale: state.atom.scale * s } };
}

export function scaledFormula(formula: Formula, s: number, unitless = NOTHING_UNITLESS): Formula {
  const formulas = (list: Formula[]) => list.map((f) => scaledFormula(f, s, unitless));
  const state = (st: State) => scaledState(st, s, unitless);

  if ('all' in formula) return { all: formulas(formula.all) };

  if ('any' in formula) return { any: formulas(formula.any) };

  if ('sequence' in formula) return { sequence: formulas(formula.sequence) };

  if ('hold_for' in formula) return { hold_for: { ...formula.hold_for, state: state(formula.hold_for.state) } };

  if ('eventually' in formula) return { eventually: { ...formula.eventually, state: state(formula.eventually.state) } };

  return { always: { ...formula.always, state: state(formula.always.state) } };
}
