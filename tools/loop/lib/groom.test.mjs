import { describe, expect, it } from 'vitest';
import { applyGroom, dueSteps, keepMetadata, stepHead } from './groom.mjs';

const label = (...names) => names.map((name) => ({ name }));

const META = 'Request: #480\nIdea: #300\nArc: #224\nKind: feature';

const step = (number, { body = `${META}\n\nDepends on #19. If #19 has landed, use its view.`, labels = [] } = {}) => ({
  number,
  title: `Step ${number}`,
  body,
  createdAt: '2026-11-10T00:00:00Z',
  labels: label('loop:next', ...labels),
});

const decision = (number, action, fields = {}) => ({
  number,
  action,
  reason: 'Main moved.',
  body: '',
  pull: null,
  into: null,
  append: '',
  ...fields,
});

function fakeGitHub(steps, { held = [], merged = [] } = {}) {
  const issues = new Map(steps.map((s) => [s.number, { ...s, state: 'OPEN' }]));
  const calls = [];

  return {
    calls,
    issue: (number) => issues.get(number),
    gh: {
      claim: (key) => (held.includes(key) ? null : () => {}),
      issueNow: (number) => issues.get(number),
      mergedPull: (number) =>
        merged.includes(number) ? { number, url: `https://github.com/o/r/pull/${number}`, title: 'Done' } : null,
      setIssueBody: (number, body) => {
        calls.push(['body', number]);
        issues.get(number).body = body;
      },
      commentOnIssue: (number, body) => calls.push(['comment', number, body]),
      closeIssue: (number, comment, reason) => {
        calls.push(['close', number, comment, reason]);
        issues.get(number).state = 'CLOSED';
      },
    },
  };
}

function groom(decisions, steps, { held, merged, openRequests = [] } = {}) {
  const github = fakeGitHub(steps, { held, merged });
  const saved = new Map();
  const context = {
    steps: new Map(steps.map((s) => [s.number, s])),
    sent: new Set(steps.map((s) => s.number)),
    openRequests: new Set(openRequests),
    now: 1000,
    save: (number, entry) => saved.set(number, entry),
  };
  const outcomes = applyGroom(decisions, context, { gh: github.gh, log: () => {} });

  return { ...github, saved, outcomes };
}

describe('groom: rewrite', () => {
  it('rewrites a step whose dependency merged, keeping its metadata lines byte for byte', () => {
    const s = step(29);
    const body =
      'Kind: refine\n\nThe Calibrate view (`src/reality/CalibrateView.tsx`, #53) exists. Add the fit report to it.';
    const { issue, calls, saved } = groom([decision(29, 'rewrite', { body })], [s]);

    expect(issue(29).body.split('\n').slice(0, 4).join('\n')).toBe(META);
    expect(issue(29).body).toContain('The Calibrate view');
    expect(issue(29).body).not.toContain('Depends on #19');
    expect(issue(29).body).not.toContain('Kind: refine');
    expect(calls).toContainEqual(['comment', 29, 'Groomed against main: Main moved.']);
    expect(saved.get(29).head).toBe(stepHead(issue(29)));
  });

  it('keeps the metadata a new body leaves out', () => {
    expect(keepMetadata('Arc: #1\nKind: refine\n\nOld.', 'New.')).toBe('Arc: #1\nKind: refine\n\nNew.');
    expect(keepMetadata('Old.', 'New.')).toBe('New.');
  });
});

describe('groom: close', () => {
  it('closes a step whose work merged, linking the pull request', () => {
    const { issue, calls } = groom([decision(28, 'close', { pull: 53 })], [step(28)], { merged: [53] });

    expect(issue(28).state).toBe('CLOSED');
    expect(calls).toContainEqual(['close', 28, expect.stringContaining('https://github.com/o/r/pull/53'), undefined]);
  });

  it('never closes a loop:priority step without a merged pull request', () => {
    const priority = step(40, { labels: ['loop:priority'] });
    const { issue, outcomes } = groom(
      [decision(40, 'close', { pull: null }), decision(40, 'close', { pull: 99 })],
      [priority],
    );

    expect(issue(40).state).toBe('OPEN');
    expect(outcomes.map((o) => o.outcome)).toEqual([expect.stringMatching(/^kept/), expect.stringMatching(/^kept/)]);
  });
});

describe('groom: fold', () => {
  it('appends to the target and closes the source', () => {
    const target = step(60, { body: 'Arc: #224\nKind: feature\n\nOpen STEP files.' });
    const { issue, calls } = groom(
      [decision(59, 'fold', { into: 60, append: '- Also open IGES.' })],
      [step(59), target],
    );

    expect(issue(60).body).toBe(
      'Arc: #224\nKind: feature\n\nOpen STEP files.\n\n**Folded from #59.**\n\n- Also open IGES.',
    );
    expect(issue(59).state).toBe('CLOSED');
    expect(calls).toContainEqual(['close', 59, 'Folded into #60: Main moved.', 'not planned']);
  });

  it('never folds away a step that serves an open request', () => {
    const { issue } = groom(
      [decision(59, 'fold', { into: 60, append: '- More.' })],
      [step(59), step(60, { body: 'Kind: feature' })],
      { openRequests: [480] },
    );

    expect(issue(59).state).toBe('OPEN');
    expect(issue(60).body).toBe('Kind: feature');
  });
});

describe('groom: steps a builder holds', () => {
  it('skips a step whose claim a builder holds', () => {
    const { calls, saved, outcomes } = groom([decision(29, 'close', { pull: 53 })], [step(29)], {
      held: ['step-29'],
      merged: [53],
    });

    expect(calls).toEqual([]);
    expect(saved.size).toBe(0);
    expect(outcomes[0].outcome).toMatch(/builder holds it/);
  });

  it('skips a step a builder labelled after it was sent', () => {
    const sent = step(29);
    const github = fakeGitHub([{ ...sent, labels: label('loop:building') }], { merged: [53] });
    const context = { steps: new Map([[29, sent]]), sent: new Set([29]), openRequests: new Set(), now: 1, save() {} };
    const [outcome] = applyGroom([decision(29, 'close', { pull: 53 })], context, { gh: github.gh, log: () => {} });

    expect(outcome.outcome).toMatch(/builder took it/);
    expect(github.calls).toEqual([]);
  });
});

describe('groom: what is sent', () => {
  const s = step(29);
  const merged = [{ number: 53, title: 'Calibrate', mergedAt: '2026-11-12T00:00:00Z' }];

  it('sends a step never groomed', () => {
    expect(dueSteps([s], { entryOf: () => ({ head: '', groomedAt: 0 }), merged })).toEqual([s]);
  });

  it('never sends an unchanged step again while nothing new has merged', () => {
    const entryOf = () => ({ head: stepHead(s), groomedAt: Date.parse('2026-11-13T00:00:00Z') });

    expect(dueSteps([s], { entryOf, merged })).toEqual([]);
    expect(dueSteps([{ ...s, body: `${s.body} More.` }], { entryOf, merged })).toHaveLength(1);
    expect(
      dueSteps([s], { entryOf, merged: [...merged, { number: 60, title: 'STEP', mergedAt: '2026-11-13T05:00:00Z' }] }),
    ).toHaveLength(1);
  });
});
