import { describe, expect, it } from 'vitest';
import type { ArenaEvidence, ArenaVariantResult } from './artifacts';
import { arenaLine, refusedLine, worstEvidence, worstVariant } from './skillRecords';

const variant = (passes: number, trials = 32): ArenaVariantResult => ({
  variant: 'held-out',
  passes,
  trials,
  lowerBound: 0.75,
  diverged: 0,
  failures: {},
});

const evidence = (variants: ArenaVariantResult[]): ArenaEvidence => ({
  arenaVersion: 1,
  binding: { contract: 'c', physics: 'p', actuators: 'a', environment: 'e' },
  confidence: 0.95,
  bar: 0.75,
  variants,
  lowerBound: 0.75,
  passed: true,
  conditions: [],
  summary: '',
  saltCommitment: 's',
});

const share = (result: ArenaVariantResult) => result.passes / result.trials;
const sortedVariant = (run: ArenaEvidence) => [...run.variants].sort((a, b) => share(a) - share(b))[0];
const sortedShare = (run: ArenaEvidence) => {
  const worst = sortedVariant(run);

  return worst ? share(worst) : Infinity;
};
const sortedEvidence = (runs: readonly ArenaEvidence[]) => [...runs].sort((a, b) => sortedShare(a) - sortedShare(b))[0];

describe('Arena evidence selection', () => {
  it('ranks pass shares rather than counts or confidence bounds and retains the first tie', () => {
    const first = variant(16);
    const tied = variant(32, 64);
    const run = evidence([variant(12, 16), first, tied]);
    const tie = evidence([tied]);
    const better = evidence([variant(20)]);

    run.variants[0].lowerBound = 0;
    expect(worstVariant(run)).toBe(first);
    expect(worstEvidence([better, run, tie])).toBe(run);
    expect(worstEvidence([better, tie, run])).toBe(tie);
    expect(arenaLine(run)).toBe('16 of 32 tries, at least 75%');
    expect(refusedLine(run)).toBe('Refused in Arena: 16 of 32 tries');
  });

  it('keeps empty results and reads later edits without changing inputs or earlier results', () => {
    const empty = evidence([]);
    const a = evidence([variant(20), variant(30)]);
    const b = evidence([variant(25)]);
    const runs = [empty, a, b];
    const before = structuredClone(runs);
    const selected = worstVariant(a);

    expect(worstVariant(empty)).toBeUndefined();
    expect(worstEvidence([])).toBeUndefined();
    expect(worstEvidence([empty])).toBe(empty);
    expect(worstEvidence([empty, evidence([])])).toBe(empty);
    expect(worstEvidence(runs)).toBe(a);
    expect(runs).toEqual(before);
    expect(arenaLine(empty)).toBe('at least 75%');
    expect(refusedLine(empty)).toBe('Refused in Arena');
    a.variants[1].passes = 5;
    expect(worstVariant(a)).toBe(a.variants[1]);
    expect(selected).toBe(a.variants[0]);
    expect(selected?.passes).toBe(20);
    a.variants.splice(0, 2, variant(32));
    expect(worstEvidence(runs)).toBe(b);
  });

  it('matches full sorting across unequal trial counts, ties, empty runs and zero-trial imports', () => {
    for (let seed = 0; seed < 120; seed++) {
      const runs = Array.from({ length: seed % 17 }, (_, run) =>
        evidence(
          Array.from({ length: (seed + run) % 5 }, (_, index) => {
            const trials = (seed + run + index) % 4 === 0 ? 0 : 16 * (1 + (index % 3));
            const passes = (seed * 13 + run * 7 + index * 3) % (trials + 1);

            return variant(passes, trials);
          }),
        ),
      );
      const before = structuredClone(runs);

      for (const run of runs) {
        expect(worstVariant(run)).toBe(sortedVariant(run));
      }

      expect(worstEvidence(runs)).toBe(sortedEvidence(runs));
      expect(runs).toEqual(before);
    }
  });

  it('preserves ordering for infinite and unreadable imported pass shares', () => {
    const variants = [variant(1, 0), variant(0, 0), variant(12), variant(-1, 0), variant(8)];

    for (let offset = 0; offset < variants.length; offset++) {
      const rotated = [...variants.slice(offset), ...variants.slice(0, offset)];
      const runs = rotated.map((result) => evidence([result]));

      expect(worstVariant(evidence(rotated))).toBe(sortedVariant(evidence(rotated)));
      expect(worstEvidence(runs)).toBe(sortedEvidence(runs));
    }

    const infinite = evidence([variant(1, 0), variant(2, 0)]);

    expect(worstVariant(infinite)).toBe(infinite.variants[0]);
    expect(worstEvidence([evidence([]), infinite])?.variants).toEqual([]);
  });

  it('returns a sole candidate without reading its counts', () => {
    let reads = 0;
    const single = {
      ...variant(0),
      get passes() {
        reads++;

        return 0;
      },
    };
    const run = evidence([single]);

    expect(worstVariant(run)).toBe(single);
    expect(worstEvidence([run])).toBe(run);
    expect(reads).toBe(0);
  });

  it.each([300, 600])('bounds pass-count reads while selecting among %i runs', (count) => {
    let reads = 0;
    const runs = Array.from({ length: count }, (_, run) =>
      evidence(
        Array.from({ length: 3 }, (_, index) => ({
          ...variant(0),
          get passes() {
            reads++;

            return (run * 13 + index * 7) % 33;
          },
        })),
      ),
    );
    const expected = sortedEvidence(runs);

    reads = 0;
    expect(worstEvidence(runs)).toBe(expected);
    expect(reads).toBeLessThanOrEqual(count * 4);
  });
});
