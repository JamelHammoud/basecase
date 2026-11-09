import type { Expectation } from './generator';

export const ZOO_BARS = Object.freeze({
  passShare: 0.7,
  routerShare: 0.8,
  routerFactor: 2,
  budgetSteps: 180_000_000,
  budgetWallS: 75 * 60,
});

export type OutcomeKind = 'skill' | 'not-found' | 'refused' | 'unverifiable' | 'error' | 'timeout';

export interface PairResult {
  id: string;
  expect: Expectation;
  outcome: OutcomeKind;
  claimed: boolean;
  bound: boolean;
  hiddenPass: boolean | null;
  withinBudget: boolean;
  wallS: number;
  steps: number;
  method: string | null;
  routerMiss: boolean | null;
}

export const isFalseClaim = (r: PairResult) => r.claimed && !(r.expect === 'feasible' && r.bound && r.hiddenPass);

export const passedArena = (r: PairResult) =>
  r.expect === 'feasible' && r.claimed && r.bound && r.hiddenPass === true && r.withinBudget;

export interface ZooVerdict {
  problems: string[];
  metrics: Record<string, number>;
}

function shareProblem(options: { what: string; got: number; of: number; share: number }): string[] {
  const need = Math.ceil(options.share * options.of);

  if (options.of === 0) return [`${options.what}: nothing to count`];

  return options.got >= need ? [] : [`${options.what}: ${options.got} of ${options.of}, needs ${need}`];
}

export function zooVerdict(results: PairResult[], expected: number): ZooVerdict {
  const feasible = results.filter((r) => r.expect === 'feasible');
  const passed = feasible.filter(passedArena);
  const routed = passed.filter((r) => r.routerMiss === false);
  const falseClaims = results.filter(isFalseClaim);
  const mislabelled = results.filter((r) => r.expect === 'deformable' && r.outcome !== 'unverifiable');
  const problems: string[] = [];

  if (results.length !== expected) problems.push(`Ran ${results.length} of ${expected} pairs`);

  if (falseClaims.length) problems.push(`False pass claims: ${falseClaims.map((r) => r.id).join(', ')}`);

  if (mislabelled.length)
    problems.push(`Deformable tasks not labelled unverifiable: ${mislabelled.map((r) => r.id).join(', ')}`);

  problems.push(
    ...shareProblem({
      what: 'Passed Arena within budget',
      got: passed.length,
      of: feasible.length,
      share: ZOO_BARS.passShare,
    }),
  );
  problems.push(
    ...shareProblem({
      what: 'Router within 2x of the cheapest',
      got: routed.length,
      of: passed.length,
      share: ZOO_BARS.routerShare,
    }),
  );

  return {
    problems,
    metrics: {
      pairs: results.length,
      feasible: feasible.length,
      passed: passed.length,
      falseClaims: falseClaims.length,
      routerWithin2x: routed.length,
    },
  };
}
