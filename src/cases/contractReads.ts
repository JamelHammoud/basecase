import type { Contract, Expr, Formula, State } from '../skills/contract';

function exprSignals(expr: Expr): string[] {
  if ('signal' in expr) return [expr.signal];

  if ('abs' in expr) return exprSignals(expr.abs);

  if ('delta' in expr) return exprSignals(expr.delta);

  const [a, b] = 'dist' in expr ? expr.dist : expr.angle;

  return [...a, ...b];
}

export function stateSignals(state: State): string[] {
  if ('atom' in state) return exprSignals(state.atom.expr);

  if ('not' in state) return stateSignals(state.not);

  return ('all' in state ? state.all : state.any).flatMap(stateSignals);
}

function formulaSignals(formula: Formula): string[] {
  if ('all' in formula) return formula.all.flatMap(formulaSignals);

  if ('any' in formula) return formula.any.flatMap(formulaSignals);

  if ('sequence' in formula) return formula.sequence.flatMap(formulaSignals);

  if ('always' in formula) return stateSignals(formula.always.state);

  if ('eventually' in formula) return stateSignals(formula.eventually.state);

  return stateSignals(formula.hold_for.state);
}

export const contractReads = (contract: Contract) =>
  new Set([...formulaSignals(contract.success), ...contract.failures.flatMap((f) => formulaSignals(f.formula))]);
