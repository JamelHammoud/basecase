import { describe, expect, it } from 'vitest';
import { decide, lessonFields, measure, measuredMarkdown } from './harnessVerdict.mjs';

const runs = (task, grades, run) =>
  grades.map((grade, i) => ({ task, grade, run, seed: i + 1, at: `2026-11-1${i}T00:00:00Z`, costUsd: 0.5 }));

const byTask = (rows) => new Map(rows.map((row) => [row[0].task, row]));

const TUNE = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'];

const tuneWith = (branchGrades) => ({
  main: byTask(TUNE.map((task) => runs(task, ['fail', 'fail', 'pass'], 'main-tune'))),
  branch: byTask(TUNE.map((task) => runs(task, branchGrades, 'branch-tune'))),
});

const measureTune = (branchGrades) => measure({ ...tuneWith(branchGrades), ids: TUNE, seeds: 3 });

const HELD = ['H1', 'H2', 'H3', 'H4'];

const measureHeld = (mainGrades, branchGrades) =>
  measure({
    main: byTask(HELD.map((task) => runs(task, mainGrades, 'main-held'))),
    branch: byTask(HELD.map((task) => runs(task, branchGrades, 'branch-held'))),
    ids: HELD,
    seeds: 3,
  });

describe('measure', () => {
  it('pairs the branch against main per task, branch first', () => {
    const stats = measureTune(['pass', 'pass', 'pass']);

    expect(stats.models.map((m) => m.model)).toEqual(['branch', 'main']);
    expect(stats.paired).toHaveLength(6);
    expect(stats.meanDiff).toBeCloseTo(0.667, 3);
    expect(stats.wins).toBe(6);
  });

  it('uses only the latest seeds of each task and only the named tasks', () => {
    const main = byTask([runs('A1', ['pass', 'pass', 'fail', 'fail'], 'm'), runs('Z9', ['pass'], 'm')]);
    const branch = byTask([runs('A1', ['fail', 'fail', 'fail', 'fail'], 'b'), runs('Z9', ['fail'], 'b')]);
    const stats = measure({ main, branch, ids: ['A1'], seeds: 2 });

    expect(stats.paired).toEqual([{ task: 'A1', a: 0, b: 0, diff: 0 }]);
  });
});

describe('decide', () => {
  it('asks for the held-out set once tune clearly improves', () => {
    expect(decide({ tune: measureTune(['pass', 'pass', 'pass']) }).verdict).toBe('confirm');
  });

  it("discards a tune gap whose interval doesn't clear zero", () => {
    const decision = decide({ tune: measureTune(['fail', 'fail', 'pass']) });

    expect(decision.verdict).toBe('discard');
    expect(decision.reason).toContain("tune didn't clearly improve");
  });

  it('discards when too few tune tasks were graded on both sides', () => {
    const tune = measure({ ...tuneWith(['pass', 'pass', 'pass']), ids: ['A1', 'A2'], seeds: 3 });

    expect(decide({ tune }).reason).toContain('only 2 tune tasks');
  });

  it('keeps a change whose held-out set holds', () => {
    const tune = measureTune(['pass', 'pass', 'pass']);
    const heldout = measureHeld(['pass', 'fail', 'pass'], ['pass', 'fail', 'pass']);

    expect(decide({ tune, heldout }).verdict).toBe('keep');
  });

  it('discards a change that makes held-out tasks worse', () => {
    const tune = measureTune(['pass', 'pass', 'pass']);
    const heldout = measureHeld(['pass', 'pass', 'pass'], ['fail', 'fail', 'pass']);
    const decision = decide({ tune, heldout });

    expect(decision.verdict).toBe('discard');
    expect(decision.reason).toContain('held out regressed');
  });
});

describe('measuredMarkdown', () => {
  it('reports both sets with intervals, the model and the runs', () => {
    const text = measuredMarkdown({
      tune: measureTune(['pass', 'pass', 'pass']),
      heldout: measureHeld(['pass', 'fail', 'pass'], ['pass', 'pass', 'pass']),
      settings: { seeds: 3, served: 'claude-opus-5-5', effort: 'high' },
      harness: { main: 'aaa', branch: 'bbb' },
      runs: ['branch-tune', 'main-tune'],
    });

    expect(text).toContain('| Tune | 6 | 33% | 100% | +67 |');
    expect(text).toContain('| Held out | 4 | 67% | 100% | +33 |');
    expect(text).toContain('`claude-opus-5-5` at effort high');
    expect(text).toContain('`branch-tune`, `main-tune`');
  });

  it('marks the held-out row as not run when tune stopped the attempt', () => {
    const text = measuredMarkdown({
      tune: measureTune(['fail', 'fail', 'pass']),
      settings: { seeds: 3, served: 'x', effort: 'high' },
      harness: { main: 'a', branch: 'b' },
      runs: ['r'],
    });

    expect(text).toContain('| Held out | — |');
  });
});

describe('lessonFields', () => {
  it('records the weakness, the change, the reason and the runs', () => {
    const fields = lessonFields({
      weakness: { category: 'service', rate: 0.4 },
      change: { title: 'Ask for a service path', summary: 'The prompt asks for one.' },
      decision: { reason: "tune didn't clearly improve" },
      runs: ['r1', 'r2'],
    });

    expect(fields.title).toBe("Ask for a service path didn't help service");
    expect(fields.lesson).toContain('40% of tune runs');
    expect(fields.lesson).toContain("Not kept: tune didn't clearly improve.");
    expect(fields.evidence).toEqual(['r1', 'r2']);
    expect(fields.tags).toEqual(['harness', 'service']);
  });
});
