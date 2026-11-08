import type { Cmp, Contract, Expr, Formula, State, TimeWindow } from './contract';

const CMP: Record<Cmp, string> = { '<': 'below', '<=': 'at most', '>': 'above', '>=': 'at least' };

const num = (x: number) => String(Number(x.toPrecision(4)));

function exprWords(expr: Expr): string {
  if ('signal' in expr) return expr.signal;

  if ('abs' in expr) return `|${exprWords(expr.abs)}|`;

  if ('delta' in expr) return `change in ${exprWords(expr.delta)}`;

  if ('dist' in expr) return `distance from (${expr.dist[0].join(', ')}) to (${expr.dist[1].join(', ')})`;

  return `angle between (${expr.angle[0].join(', ')}) and (${expr.angle[1].join(', ')})`;
}

function stateWords(state: State): string {
  if ('atom' in state) return `${exprWords(state.atom.expr)} ${CMP[state.atom.cmp]} ${num(state.atom.value)}`;

  if ('not' in state) return `not (${stateWords(state.not)})`;

  if ('all' in state) return state.all.map(stateWords).join(' and ');

  return state.any.map(stateWords).join(' or ');
}

function windowWords(window: TimeWindow): string {
  if (window === 'whole') return 'the whole try';

  if ('last' in window) return `the last ${num(window.last)} s`;

  return `${num(window.from)} s to ${num(window.to)} s`;
}

export function formulaWords(formula: Formula): string {
  if ('always' in formula)
    return `${stateWords(formula.always.state)}, throughout ${windowWords(formula.always.window)}`;

  if ('eventually' in formula)
    return `${stateWords(formula.eventually.state)}, at some point in ${windowWords(formula.eventually.window)}`;

  if ('hold_for' in formula) {
    const { seconds, state, within } = formula.hold_for;

    return `${stateWords(state)}, held ${num(seconds)} s within ${windowWords(within)}`;
  }

  if ('sequence' in formula) return formula.sequence.map(formulaWords).join('; then ');

  if ('all' in formula) return formula.all.map(formulaWords).join('; and ');

  return formula.any.map(formulaWords).join('; or ');
}

export function contractWords(contract: Contract): string[] {
  return [
    `Passes when: ${formulaWords(contract.success)}.`,
    ...contract.failures.map((f) => `Fails as “${f.label}” if: ${formulaWords(f.formula)}.`),
  ];
}
