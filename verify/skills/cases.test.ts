import fs from 'node:fs';
import path from 'node:path';
import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import type { Case } from '../../src/cases/schema';
import { parseCase, runCase, touchTheDots } from '../../src/cases/testing';
import { contractSignals, evaluateContract, type Contract, type Formula } from '../../src/skills/contract';
import { fixtureRobots } from '../../src/sim/fixtures/robots';

const robot = (id: string) => fixtureRobots().find((r) => r.id === id)!;

function withContract(kase: Case, contract: Contract): Case {
  return { ...kase, task: { ...kase.task, contract } } as Case;
}

function richer(kase: Case): Contract {
  const base = kase.task.contract as Contract;
  const moved: Formula = {
    eventually: {
      window: { from: 0, to: kase.task.seconds },
      state: {
        any: [
          { atom: { expr: { abs: { delta: { signal: 'dot0' } } }, cmp: '>', value: 0.005, scale: 0.01 } },
          { not: { atom: { expr: { signal: 'dot1' }, cmp: '>=', value: 1e9, scale: 1 } } },
        ],
      },
    },
  };

  return {
    version: 1,
    success: { all: [base.success, moved] },
    failures: [
      {
        label: 'never left the start',
        formula: {
          always: { window: 'whole', state: { atom: { expr: { signal: 'dot0' }, cmp: '<', value: -1, scale: 1 } } },
        },
      },
    ],
  };
}

const sources = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const file = path.join(dir, e.name);

    if (e.isDirectory()) return sources(file);

    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [file] : [];
  });

describe('Cases judge with the one contract', () => {
  it('a Case carries any contract the Rust evaluator accepts, and its verdict is exactly that evaluator’s', async () => {
    const mj = await loadMujoco();
    const arm = robot('arm-3dof');
    const authored = touchTheDots(arm);
    const kase = withContract(authored, richer(authored));

    expect(() => parseCase(kase)).not.toThrow();

    for (const controller of ['reference', 'limp'] as const) {
      const r = await runCase(mj, kase, arm, { controller });
      const verdict = await evaluateContract(r.case.task.contract as Contract, r.trace);

      expect(r.passed).toBe(controller === 'reference');
      expect(r.trace.dt).toBeGreaterThan(0);
      expect(Object.keys(r.trace.signals)).toEqual(
        expect.arrayContaining(await contractSignals(kase.task.contract as Contract)),
      );
      expect({ passed: r.passed, margin: r.margin, failed: r.failed }).toEqual({
        passed: verdict.passed,
        margin: verdict.margin,
        failed: verdict.failed,
      });
    }
  }, 120_000);

  it('a Case whose success only looks at the final state is refused, as the contract crate refuses it', async () => {
    const mj = await loadMujoco();
    const arm = robot('arm-3dof');
    const authored = touchTheDots(arm);
    const atEnd: Contract = {
      version: 1,
      success: {
        eventually: {
          window: { last: 0 },
          state: { atom: { expr: { signal: 'dot0' }, cmp: '<', value: 1e9, scale: 1 } },
        },
      },
      failures: [],
    };
    const kase = withContract(authored, atEnd);
    const outcome = await Promise.resolve()
      .then(() => runCase(mj, kase, arm, { controller: 'reference' }))
      .then(
        (r) => (r.passed ? 'passed' : 'refused'),
        () => 'refused',
      );

    expect(outcome).toBe('refused');
  }, 60_000);

  it('no TypeScript evaluator is left in Cases', () => {
    const files = sources(path.resolve('src/cases'));
    const text = files.map((f) => fs.readFileSync(f, 'utf8'));

    expect(text.some((t) => /evaluateLocally/.test(t))).toBe(false);
    expect(text.some((t) => /from '\.\.\/skills\/contract'/.test(t) && /evaluateContract/.test(t))).toBe(true);
  });
});
