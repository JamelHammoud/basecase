import { stateSignals } from './contractReads';
import { evaluateContract, type Expr, type Formula, type NamedFailure, type State } from '../skills/contract';

export const OPERATE_FACT_MAX_AGE_MS = 500;

export interface ConditionSample {
  at: number;
  now: number;
  signals: Record<string, number>;
}

const usesDelta = (expr: Expr): boolean => 'delta' in expr || ('abs' in expr && usesDelta(expr.abs));

function stateUsesDelta(state: State): boolean {
  if ('atom' in state) return usesDelta(state.atom.expr);

  if ('not' in state) return stateUsesDelta(state.not);

  return ('all' in state ? state.all : state.any).some(stateUsesDelta);
}

export function operatePredicate(formula: Formula): { state: State; seconds: number } | null {
  if (
    'hold_for' in formula &&
    formula.hold_for.within === 'whole' &&
    Number.isFinite(formula.hold_for.seconds) &&
    formula.hold_for.seconds > 0
  )
    return { state: formula.hold_for.state, seconds: formula.hold_for.seconds };

  if ('eventually' in formula && formula.eventually.window === 'whole')
    return { state: formula.eventually.state, seconds: 0 };

  if ('always' in formula && formula.always.window === 'whole') return { state: formula.always.state, seconds: 0 };

  return null;
}

export class OperateConditions {
  private readonly since = new Map<number, number>();
  private last = -Infinity;

  private readonly failures: NamedFailure[];

  constructor(failures: NamedFailure[]) {
    this.failures = failures;
  }

  async sample(sample: ConditionSample): Promise<Array<boolean | null>> {
    if (sample.at <= this.last) return this.failures.map(() => null);

    if (sample.at - this.last > OPERATE_FACT_MAX_AGE_MS || sample.now - sample.at > OPERATE_FACT_MAX_AGE_MS)
      this.since.clear();

    this.last = sample.at;

    if (sample.now < sample.at || sample.now - sample.at > OPERATE_FACT_MAX_AGE_MS)
      return this.failures.map(() => null);

    return Promise.all(
      this.failures.map((f, i) =>
        this.test(f, i, sample).catch(() => {
          this.since.delete(i);

          return null;
        }),
      ),
    );
  }

  private async test(failure: NamedFailure, index: number, sample: ConditionSample): Promise<boolean | null> {
    const predicate = operatePredicate(failure.formula);

    if (
      !predicate ||
      stateUsesDelta(predicate.state) ||
      !stateSignals(predicate.state).every((name) => Number.isFinite(sample.signals[name]))
    ) {
      this.since.delete(index);

      return null;
    }

    const signals = Object.fromEntries(Object.entries(sample.signals).map(([name, value]) => [name, [value, value]]));
    const verdict = await evaluateContract(
      {
        version: 1,
        success: { always: { window: 'whole', state: predicate.state } },
        failures: [],
      },
      { dt: 1, signals },
    ).catch(() => null);

    if (!verdict || !Number.isFinite(verdict.margin)) {
      this.since.delete(index);

      return null;
    }

    if (!verdict.passed) {
      this.since.delete(index);

      return false;
    }

    const start = this.since.get(index) ?? sample.at;

    this.since.set(index, start);

    return sample.at - start >= predicate.seconds * 1000 ? true : null;
  }
}
