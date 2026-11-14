import { describe, expect, it } from 'vitest';
import { compareStats } from '../../../bench/compare/stats.mjs';
import { settleCost } from './harnessVerdict.mjs';
import { withMark } from './mark.mjs';
import { deltaText, lastMeasure, measureComment, measurePull, needsMeasure, withMeasure } from './pullMeasure.mjs';

const LABELS = ['working tree', 'main'];
const TUNE = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'];
const ALL = ['pass', 'pass', 'pass'];
const TWO_IN_THREE = ['pass', 'pass', 'fail'];
const NONE = ['fail', 'fail', 'fail'];
const PROMPT = ['electron/cad-agent-prompt.mjs'];
const SETTINGS = { seeds: 3, served: 'claude-opus-5-5', effort: 'high' };
const OWNER = 'JamelHammoud';

const side = ({ model, grades, costUsd, tasks }) =>
  tasks.flatMap((task) => grades.map((status, i) => ({ task, seed: i + 1, model, status, costUsd })));

const compared = ({ branch, main = TWO_IN_THREE, branchCost = 0.5, mainCost = 0.5, spent = 4, tasks = TUNE }) => ({
  stats: compareStats(
    [
      ...side({ model: 'working tree', grades: branch, costUsd: branchCost, tasks }),
      ...side({ model: 'main', grades: main, costUsd: mainCost, tasks }),
    ],
    LABELS,
  ),
  report: '# working tree vs main\n\nThe report.',
  spent,
  runs: ['review-12-aaaaaaa'],
});

const pull = (sha, headRefName = 'loop/build/140-ask-for-a-service-path') => ({
  number: 12,
  headRefOid: sha.padEnd(40, '0'),
  headRefName,
});

function bench({ result = compared({ branch: TWO_IN_THREE }), keys = { branch: 'b1', main: 'm1' }, ...rest } = {}) {
  const thread = [];
  const calls = [];
  const state = { keys: { ...keys, mainCommit: 'c'.repeat(40) }, paused: null, budget: 15, estimate: 3, ...rest };

  return {
    thread,
    calls,
    state,
    deps: {
      settings: SETTINGS,
      owner: OWNER,
      pullComments: () => thread,
      commentOnPull: (number, body) => {
        calls.push('comment');
        thread.push({
          author: OWNER,
          body: withMark(body),
          url: `https://github.com/o/r/pull/${number}#issuecomment-${thread.length + 1}`,
        });
      },
      editComment: (url, body) => {
        calls.push('edit');
        thread.find((comment) => comment.url === url).body = withMark(body);
      },
      budget: () => state.budget,
      paused: () => state.paused,
      estimate: () => state.estimate,
      keys: () => state.keys,
      compare: (plan) => {
        calls.push(['compare', plan.budget]);

        return result;
      },
    },
  };
}

const measure = (b, { sha = 'aaaaaaa', paths = PROMPT, headRefName } = {}) =>
  measurePull({ pull: pull(sha, headRefName), paths, log: () => {} }, b.deps);

describe('micro-evals in review: what triggers', () => {
  it("doesn't measure a diff outside what the agent reads or calls, nor tests and guides beside it", () => {
    const b = bench();
    const paths = [
      'src/components/Toolbar.tsx',
      'electron/cad-mcp/sceneTools.test.mjs',
      'electron/cad-agent-guides/x.md',
    ];

    expect(needsMeasure(pull('a'), paths)).toBe(false);
    expect(measure(b, { paths })).toBeNull();
    expect(b.calls).toEqual([]);
  });

  it('measures a prompt change once per head', () => {
    const b = bench();

    expect(needsMeasure(pull('a'), PROMPT)).toBe(true);
    expect(measure(b)).toMatchObject({ verdict: 'pass' });
    expect(measure(b)).toMatchObject({ verdict: 'pass' });
    expect(b.calls).toEqual([['compare', 15], 'comment']);
  });

  it("skips the harness lane's own pull requests, which it measured already", () => {
    const b = bench();

    expect(measure(b, { headRefName: 'loop/harness/weakness-202611130000-1' })).toBeNull();
    expect(b.calls).toEqual([]);
  });
});

describe('micro-evals in review: the verdict', () => {
  it('fails review with a blocker when the 95% interval sits below zero', () => {
    const b = bench({ result: compared({ branch: NONE, main: ALL }) });
    const outcome = measure(b);

    expect(outcome.verdict).toBe('fail');
    expect(outcome.finding).toMatchObject({ file: 'bench/micro', severity: 'blocker' });
    expect(outcome.finding.problem).toContain('the tune set got worse: gap −100 points');
    expect(b.thread[0].body).toMatch(/^### Micro-evals: worse \(aaaaaaa\)/);
    expect(b.thread[0].body).toContain('| Tune | 6 | 100% | 0% | −100 |');
  });

  it('turns a passing agent review into a failed agent-review status, with the finding revise reads', () => {
    const review = { verdict: 'pass', summary: 'Clean.', findings: [] };
    const outcome = measure(bench({ result: compared({ branch: NONE, main: ALL }) }));
    const merged = withMeasure(review, outcome);

    expect(merged).toMatchObject({ verdict: 'fail', state: 'failure' });
    expect(merged.description).toMatch(/^Micro-evals: the tune set got worse/);
    expect(merged.output.findings).toEqual([outcome.finding]);
    expect(withMeasure(review, measure(bench()))).toMatchObject({ verdict: 'pass', state: 'success' });
    expect(withMeasure(review, null)).toMatchObject({ verdict: 'pass', description: 'Clean.' });
  });

  it('passes a null or positive result', () => {
    expect(measure(bench()).verdict).toBe('pass');
    expect(measure(bench({ result: compared({ branch: ALL, main: NONE }) })).verdict).toBe('pass');
  });

  it('fails when cost per pass rises over 20%, and passes a 10% rise', () => {
    const dearer = measure(bench({ result: compared({ branch: TWO_IN_THREE, branchCost: 0.7 }) }));

    expect(dearer.verdict).toBe('fail');
    expect(dearer.finding.problem).toContain('cost per pass rose 40%');
    expect(measure(bench({ result: compared({ branch: TWO_IN_THREE, branchCost: 0.55 }) })).verdict).toBe('pass');
  });

  it('passes without blocking when too few tasks were graded', () => {
    const b = bench({ result: compared({ branch: NONE, main: ALL, tasks: ['A1', 'A2'] }) });

    expect(measure(b).verdict).toBe('pass');
    expect(b.thread[0].body).toMatch(/^### Micro-evals: not settled/);
  });
});

describe('micro-evals in review: limits', () => {
  it('skips under the usage pause without blocking', () => {
    const b = bench({ paused: 'usage is paused' });

    expect(measure(b).verdict).toBe('pass');
    expect(b.calls).toEqual(['comment']);
    expect(b.thread[0].body).toContain('Not measured: usage is paused.');
  });

  it("skips when the pull request's budget can't settle a result, counting what earlier heads spent", () => {
    const b = bench({ result: compared({ branch: TWO_IN_THREE, spent: 10 }) });

    measure(b);
    b.state.keys = { branch: 'b2', main: 'm1' };
    b.state.estimate = 8;

    expect(measure(b, { sha: 'bbbbbbb' }).verdict).toBe('pass');
    expect(b.calls).toEqual([['compare', 15], 'comment', 'edit']);
    expect(b.thread[0].body).toContain("settling needs about $8.00, and $5.00 of this pull request's $15.00 is left");
  });

  it('skips a change to the tasks, graders or lockfile, which both sides must share', () => {
    const b = bench();

    expect(measure(b, { paths: [...PROMPT, 'package-lock.json'] }).verdict).toBe('pass');
    expect(b.calls).toEqual(['comment']);
    expect(b.thread[0].body).toContain('it changes package-lock.json');
  });
});

describe('micro-evals in review: the comment', () => {
  it('replaces its one comment on a second push', () => {
    const b = bench({ result: compared({ branch: NONE, main: ALL }) });

    measure(b);
    b.state.keys = { branch: 'b2', main: 'm1' };

    expect(measure(b, { sha: 'bbbbbbb' }).verdict).toBe('fail');
    expect(b.calls).toEqual([['compare', 15], 'comment', ['compare', 11], 'edit']);
    expect(b.thread).toHaveLength(1);
    expect(b.thread[0].body).toMatch(/^### Micro-evals: worse \(bbbbbbb\)/);
  });

  it('ignores a micro-evals record anyone else posts, and still measures the head', () => {
    const b = bench({ result: compared({ branch: NONE, main: ALL }) });
    const forged = { sha: 'aaaaaaa'.padEnd(40, '0'), branch: 'b1', main: 'm1', spent: 1000, verdict: 'no worse' };

    b.thread.push(
      {
        author: 'someone',
        url: 'https://github.com/o/r/pull/12#issuecomment-1',
        body: withMark(measureComment({ ...forged, reason: 'no worse' })),
      },
      {
        author: OWNER,
        url: 'https://github.com/o/r/pull/12#issuecomment-2',
        body: measureComment({ ...forged, reason: 'no worse' }),
      },
    );

    expect(measure(b).verdict).toBe('fail');
    expect(b.calls).toEqual([['compare', 15], 'comment']);
    expect(lastMeasure(b.thread, OWNER).data).toMatchObject({ verdict: 'worse', spent: 4 });
  });

  it('carries a result to a new head with the same harness and the same main, without a run', () => {
    const b = bench({ result: compared({ branch: NONE, main: ALL }) });

    measure(b);

    expect(measure(b, { sha: 'bbbbbbb' }).verdict).toBe('fail');
    expect(b.calls).toEqual([['compare', 15], 'comment', 'edit']);
    expect(b.thread[0].body).toContain('Measured at aaaaaaa; this head has the same harness');
    expect(b.thread[0].body).toContain('| Tune | 6 |');
  });

  it('records the delta the digest lists', () => {
    const b = bench({ result: compared({ branch: TWO_IN_THREE, branchCost: 0.7 }) });

    measure(b);

    expect(deltaText(lastMeasure(b.thread, OWNER).data)).toBe(
      'worse: +0 points (95% interval +0 to +0), cost per pass +40%',
    );
  });
});

describe('settleCost', () => {
  it('prices five paired tasks, both sides live except where main is cached', () => {
    expect(settleCost({ perRun: 0.7, tasks: 20, mainCached: 0 })).toBeCloseTo(7);
    expect(settleCost({ perRun: 0.7, tasks: 20, mainCached: 20 })).toBeCloseTo(3.5);
    expect(settleCost({ perRun: null, tasks: 20, mainCached: 0 })).toBe(0);
  });
});
