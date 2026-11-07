import { asId, asNumber, asRecord, listOf, oneOf, refuse, type Reader } from './validate';

export interface ContractAtom {
  expr: { signal: string };
  cmp: '<' | '>';
  value: number;
  scale: number;
}

export type ContractState = { atom: ContractAtom } | { not: ContractState };

export type ContractFormula =
  | { eventually: { window: 'whole'; state: ContractState } }
  | { always: { window: 'whole'; state: ContractState } }
  | { hold_for: { seconds: number; state: ContractState; within: 'whole' } }
  | { sequence: ContractFormula[] };

export interface Contract {
  version: 1;
  success: ContractFormula;
  failures: Array<{ label: string; formula: ContractFormula }>;
}

export interface Trace {
  dt: number;
  signals: Record<string, number[]>;
}

export interface ContractResult {
  passed: boolean;
  margin: number;
  failed: string[];
}

export type ContractEvaluator = (contract: Contract, trace: Trace) => Promise<ContractResult>;

const MAX_DEPTH = 16;
const MAX_STEPS = 64;
const CMP = oneOf(['<', '>'] as const);

function readState(value: unknown, where: string, depth = 0): ContractState {
  if (depth > MAX_DEPTH) return refuse(where, 'nests too deeply');

  const v = asRecord(value, where);

  if (v.not !== undefined) return { not: readState(v.not, `${where}.not`, depth + 1) };

  const atom = asRecord(v.atom, `${where}.atom`);
  const expr = asRecord(atom.expr, `${where}.atom.expr`);

  return {
    atom: {
      expr: { signal: asId(expr.signal, `${where}.atom.expr.signal`) },
      cmp: CMP(atom.cmp, `${where}.atom.cmp`),
      value: asNumber(atom.value, `${where}.atom.value`),
      scale: asNumber(atom.scale, `${where}.atom.scale`),
    },
  };
}

function readFormula(value: unknown, where: string, depth = 0): ContractFormula {
  if (depth > MAX_DEPTH) return refuse(where, 'nests too deeply');

  const v = asRecord(value, where);

  if (Array.isArray(v.sequence) && v.sequence.length > MAX_STEPS) return refuse(where, 'has too many steps');

  if (Array.isArray(v.sequence))
    return { sequence: v.sequence.map((s, i) => readFormula(s, `${where}.sequence[${i}]`, depth + 1)) };

  if (v.hold_for !== undefined) {
    const h = asRecord(v.hold_for, `${where}.hold_for`);

    return {
      hold_for: {
        seconds: asNumber(h.seconds, `${where}.hold_for.seconds`),
        state: readState(h.state, `${where}.hold_for.state`),
        within: 'whole',
      },
    };
  }

  if (v.eventually !== undefined)
    return {
      eventually: { window: 'whole', state: readState(asRecord(v.eventually, where).state, `${where}.eventually`) },
    };

  if (v.always !== undefined)
    return { always: { window: 'whole', state: readState(asRecord(v.always, where).state, `${where}.always`) } };

  return refuse(where, 'names no known step');
}

export const readContract: Reader<Contract> = (value, where) => {
  const v = asRecord(value, where);

  return {
    version: 1,
    success: readFormula(v.success, `${where}.success`),
    failures: listOf((f, at) => {
      const item = asRecord(f, at);

      return { label: asId(item.label, `${at}.label`), formula: readFormula(item.formula, `${at}.formula`) };
    }, 16)(v.failures ?? [], `${where}.failures`),
  };
};

function stateMargin(state: ContractState, trace: Trace, tick: number): number {
  if ('not' in state) return -stateMargin(state.not, trace, tick);

  const { expr, cmp, value, scale } = state.atom;
  const signal = trace.signals[expr.signal];

  if (!signal) throw new Error(`Unknown signal ${expr.signal}`);

  const x = signal[tick];

  if (!Number.isFinite(x)) throw new Error(`Signal ${expr.signal} is not a number at tick ${tick}`);

  return (cmp === '>' ? x - value : value - x) / scale;
}

interface Reached {
  margin: number;
  until: number;
}

interface Span {
  from: number;
  ticks: number;
}

function holdFrom(state: ContractState, seconds: number, trace: Trace, { from, ticks }: Span): Reached {
  const need = Math.max(1, Math.round(seconds / trace.dt));
  let best = -Infinity;
  let until = ticks;

  for (let start = from; start + need <= ticks; start++) {
    let worst = Infinity;

    for (let k = start; k < start + need; k++) worst = Math.min(worst, stateMargin(state, trace, k));

    if (worst > best) best = worst;

    if (worst > 0) {
      until = start + need;

      break;
    }
  }

  return { margin: best, until };
}

function evaluate(formula: ContractFormula, trace: Trace, span: Span): Reached {
  if ('sequence' in formula) return sequenceMargin(formula.sequence, trace, span);

  if ('hold_for' in formula) return holdFrom(formula.hold_for.state, formula.hold_for.seconds, trace, span);

  if ('eventually' in formula) return holdFrom(formula.eventually.state, trace.dt, trace, span);

  let worst = Infinity;

  for (let k = span.from; k < span.ticks; k++) worst = Math.min(worst, stateMargin(formula.always.state, trace, k));

  return { margin: worst, until: span.ticks };
}

function sequenceMargin(steps: ContractFormula[], trace: Trace, { from, ticks }: Span): Reached {
  let cursor = from;
  let margin = Infinity;

  for (const step of steps) {
    const reached = evaluate(step, trace, { from: cursor, ticks });

    margin = Math.min(margin, reached.margin);

    if (reached.margin <= 0) return { margin, until: ticks };

    cursor = reached.until;
  }

  return { margin, until: cursor };
}

export const evaluateLocally: ContractEvaluator = async (contract, trace) => {
  const ticks = Math.max(0, ...Object.values(trace.signals).map((s) => s.length));
  const span = { from: 0, ticks };
  const success = evaluate(contract.success, trace, span);
  const failed = contract.failures.filter((f) => evaluate(f.formula, trace, span).margin > 0).map((f) => f.label);
  const margin = Number.isFinite(success.margin) ? success.margin : -1;

  return { passed: margin > 0 && !failed.length, margin, failed };
};
