import { describe, expect, it } from 'vitest';
import { compareStats } from '../../../bench/compare/stats.mjs';
import {
  budgetFrom,
  costRise,
  decide,
  DEFAULT_BUDGET,
  experimentFields,
  measuredMarkdown,
  skipReason,
} from './harnessVerdict.mjs';

const LABELS = ['working tree', 'main'];

const side = (model, tasks, grades, costUsd) =>
  tasks.flatMap((task) => grades.map((status, i) => ({ task, seed: i + 1, model, status, costUsd })));

const measure = ({ tasks, branch, main, branchCost = 0.5, mainCost = 0.5 }) =>
  compareStats([...side('working tree', tasks, branch, branchCost), ...side('main', tasks, main, mainCost)], LABELS);

const TUNE = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'];
const HELD = ['H1', 'H2', 'H3', 'H4'];
const ONE_IN_THREE = ['fail', 'fail', 'pass'];
const ALL = ['pass', 'pass', 'pass'];

const tuneWin = measure({ tasks: TUNE, branch: ALL, main: ONE_IN_THREE });

describe('decide', () => {
  it('asks for the held-out set once tune clearly improves', () => {
    expect(decide({ tune: tuneWin }).verdict).toBe('confirm');
  });

  it("discards a tune gap whose interval doesn't clear zero", () => {
    const decision = decide({ tune: measure({ tasks: TUNE, branch: ONE_IN_THREE, main: ONE_IN_THREE }) });

    expect(decision.verdict).toBe('discard');
    expect(decision.reason).toContain("tune didn't clearly improve");
  });

  it('records nothing when too few tasks were graded, as when runs errored or the budget ran out', () => {
    const tune = measure({ tasks: ['A1', 'A2'], branch: ALL, main: ONE_IN_THREE });

    expect(decide({ tune })).toMatchObject({
      verdict: 'inconclusive',
      reason: 'only 2 tune tasks were graded on both harnesses',
    });
    expect(decide({ tune: null }).verdict).toBe('inconclusive');
  });

  it('keeps a change only when held out clearly improves and cost per pass rises less than 20%', () => {
    const heldout = measure({ tasks: HELD, branch: ALL, main: ONE_IN_THREE, branchCost: 0.6 });

    expect(decide({ tune: tuneWin, heldout }).verdict).toBe('keep');
  });

  it('discards a change that only holds on held out, where it once was kept', () => {
    const heldout = measure({ tasks: HELD, branch: ONE_IN_THREE, main: ONE_IN_THREE });
    const decision = decide({ tune: tuneWin, heldout });

    expect(decision.verdict).toBe('discard');
    expect(decision.reason).toContain("held out didn't clearly improve");
  });

  it('discards a held-out win that costs 20% more per pass', () => {
    const heldout = measure({ tasks: HELD, branch: ALL, main: ONE_IN_THREE, branchCost: 6 });
    const decision = decide({ tune: tuneWin, heldout });

    expect(decision).toMatchObject({ verdict: 'discard' });
    expect(decision.reason).toMatch(/^cost per pass rose \d+%$/);
  });
});

describe('costRise', () => {
  it('compares cost per pass over both sets, this branch against main', () => {
    const heldout = measure({ tasks: HELD, branch: ALL, main: ONE_IN_THREE, branchCost: 0.5 });

    expect(costRise([tuneWin, heldout])).toBeCloseTo(1 / 3 - 1, 3);
  });

  it('counts a branch that passes where main never did as cheaper', () => {
    const tune = measure({ tasks: TUNE, branch: ALL, main: ['fail', 'fail', 'fail'] });

    expect(costRise([tune])).toBe(-1);
  });
});

describe('skipReason', () => {
  const pull = (number, headRefName) => ({ number, headRefName });

  it('skips while the usage pause holds, and runs once it has passed', () => {
    expect(skipReason({ paused: { until: 2000 }, pulls: [], now: 1000 })).toBe('usage is paused');
    expect(skipReason({ paused: { until: 2000 }, pulls: [], now: 3000 })).toBeNull();
  });

  it('skips while an experiment pull request is open', () => {
    const pulls = [pull(7, 'loop/build/12-x'), pull(9, 'loop/harness/weakness-202611130000-1')];

    expect(skipReason({ paused: null, pulls })).toBe('#9 is already open');
    expect(skipReason({ paused: null, pulls: pulls.slice(0, 1) })).toBeNull();
  });
});

describe('budgetFrom', () => {
  it('reads the repository variable, falling back to the default', () => {
    expect(budgetFrom('25')).toBe(25);
    expect(budgetFrom('')).toBe(DEFAULT_BUDGET);
    expect(budgetFrom('lots')).toBe(DEFAULT_BUDGET);
    expect(DEFAULT_BUDGET).toBe(40);
  });
});

describe('measuredMarkdown', () => {
  const settings = { seeds: 3, served: 'claude-opus-5-5', effort: 'high' };

  it('reports both sets, cost per pass, the runs and each compare report', () => {
    const text = measuredMarkdown({
      tune: { stats: tuneWin, report: '# working tree vs main\n\nTune body.' },
      heldout: { stats: measure({ tasks: HELD, branch: ALL, main: ONE_IN_THREE }), report: '# x\n\nHeld body.' },
      settings,
      harness: { main: 'aaa', branch: 'bbb' },
      runs: ['harness-1-tune', 'harness-1-main-tune'],
    });

    expect(text).toContain('| Tune | 6 | 33% | 100% | +67 |');
    expect(text).toContain('| Held out | 4 | 33% | 100% | +67 |');
    expect(text).toContain('Cost per pass: $1.50 on `main`, $0.50 here (−67%).');
    expect(text).toContain('`harness-1-tune`, `harness-1-main-tune`');
    expect(text).toContain('<summary>Tune: <code>report.md</code></summary>\n\nTune body.');
    expect(text).not.toContain('# working tree vs main');
  });

  it('marks the held-out row as not run when tune stopped the attempt', () => {
    const text = measuredMarkdown({
      tune: { stats: tuneWin, report: null },
      settings,
      harness: { main: 'a', branch: 'b' },
      runs: ['r'],
    });

    expect(text).toContain('| Held out | — |');
  });
});

describe('experimentFields', () => {
  const weakness = { category: 'service', rate: 0.4 };
  const change = { title: 'Ask for a service path', summary: 'The prompt asks for one.' };

  it('records the weakness, the change, the result and the runs', () => {
    const fields = experimentFields({
      weakness,
      change,
      decision: { verdict: 'discard', reason: "tune didn't clearly improve" },
      runs: ['r1', 'r2'],
    });

    expect(fields.title).toBe('Ask for a service path');
    expect(fields.lesson).toContain('40% of tune runs');
    expect(fields.lesson).toContain("Not kept: tune didn't clearly improve.");
    expect(fields.evidence).toEqual(['r1', 'r2']);
    expect(fields.tags).toEqual(['service', 'not kept']);
  });

  it('tags a kept change as kept', () => {
    const fields = experimentFields({ weakness, change, decision: { verdict: 'keep', reason: 'won' }, runs: ['r'] });

    expect(fields.tags).toEqual(['service', 'kept']);
    expect(fields.lesson).toContain('Kept: won.');
  });
});
