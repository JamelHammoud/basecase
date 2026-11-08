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

function scaledState(state: State, s: number): State {
  if ('all' in state) return { all: state.all.map((x) => scaledState(x, s)) };

  if ('any' in state) return { any: state.any.map((x) => scaledState(x, s)) };

  if ('not' in state) return { not: scaledState(state.not, s) };

  if (usesAngle(state.atom.expr)) return state;

  return { atom: { ...state.atom, value: state.atom.value * s, scale: state.atom.scale * s } };
}

export function scaledFormula(formula: Formula, s: number): Formula {
  if ('all' in formula) return { all: formula.all.map((f) => scaledFormula(f, s)) };

  if ('any' in formula) return { any: formula.any.map((f) => scaledFormula(f, s)) };

  if ('sequence' in formula) return { sequence: formula.sequence.map((f) => scaledFormula(f, s)) };

  if ('hold_for' in formula)
    return { hold_for: { ...formula.hold_for, state: scaledState(formula.hold_for.state, s) } };

  if ('eventually' in formula)
    return { eventually: { ...formula.eventually, state: scaledState(formula.eventually.state, s) } };

  return { always: { ...formula.always, state: scaledState(formula.always.state, s) } };
}
