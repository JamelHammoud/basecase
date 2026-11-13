import { describe, expect, it } from 'vitest';
import { applyPlan } from '../lib/leadPlan.mjs';
import { worstLine } from '../lib/stats.mjs';
import { leadPrompt, prompt } from './lead.mjs';

const label = (...names) => names.map((name) => ({ name }));

const arc = (number, title, { bigBet = false, body = `Why ${title}.` } = {}) => ({
  number,
  title,
  body,
  labels: label('loop:arc', ...(bigBet ? ['loop:big-bet'] : [])),
});

const step = (number, title, arcLine) => ({
  number,
  title,
  body: `Arc: ${arcLine}\nKind: refine\n\nDo ${title}.`,
  labels: label('loop:next', 'loop:refine'),
});

const newStep = (title, arcRef) => ({
  title,
  arc: arcRef,
  kind: 'feature',
  body: 'Build it.',
  request: null,
  promotes: null,
});

const plan = (fields) => ({
  newArcs: [],
  retireArcs: [],
  steps: [],
  dropIdeas: [],
  doneRequests: [],
  notes: '',
  ...fields,
});

function fakeGitHub(issues) {
  const byNumber = new Map(issues.map((issue) => [issue.number, { ...issue }]));
  const calls = [];
  let next = 500;

  return {
    calls,
    issue: (number) => byNumber.get(number),
    gh: {
      createIssue: ({ title, body, labels }) => {
        const number = next++;

        byNumber.set(number, { number, title, body, labels: label(...labels) });
        calls.push(['create', number, labels]);

        return `https://github.com/o/r/issues/${number}`;
      },
      closeIssue: (number, comment) => {
        calls.push(['close', number, comment]);
        byNumber.get(number).closed = true;
      },
      commentOnIssue: (number, body) => calls.push(['comment', number, body]),
      setIssueBody: (number, body) => {
        calls.push(['body', number]);
        byNumber.get(number).body = body;
      },
      editIssueLabels: (number, change) => calls.push(['labels', number, change]),
    },
  };
}

const world = (fields) => ({
  requests: [],
  tracked: [],
  arcs: [],
  ideas: [],
  steps: [],
  recentSteps: [],
  mergedTitles: '',
  copyLine: '',
  direction: null,
  comments: [],
  ...fields,
});

const fourArcs = () => [
  arc(10, 'Train in the browser'),
  arc(11, 'Prove it in a Case', { bigBet: true }),
  arc(12, 'Say less'),
  arc(13, 'Take the robot anywhere'),
];

const run = (output, w, issues = [...w.arcs, ...w.steps]) => {
  const github = fakeGitHub(issues);
  const lines = [];

  applyPlan(output, w, { log: (line) => lines.push(line), gh: github.gh });

  return { ...github, lines };
};

describe('lead: retiring arcs', () => {
  it('moves the open steps of an arc retired into another and rewrites their Arc lines', () => {
    const w = world({ arcs: fourArcs(), steps: [step(20, 'Add a fisheye', '#13'), step(21, 'Add a lens', '#10')] });
    const { issue, calls } = run(plan({ retireArcs: [{ number: 13, reason: 'Folded in.', into: 10 }] }), w);

    expect(issue(13).closed).toBe(true);
    expect(issue(20).body).toMatch(/^Arc: #10$/m);
    expect(issue(21).body).toMatch(/^Arc: #10$/m);
    expect(issue(10).body).toMatch(/^- \[ \] #20$/m);
    expect(calls).toContainEqual(['close', 13, expect.stringContaining('#10')]);
    expect(calls).toContainEqual(['comment', 10, expect.stringContaining('#13')]);
  });

  it('refuses to leave fewer than 3 arcs open', () => {
    const w = world({ arcs: fourArcs().slice(1) });
    const { issue, lines } = run(plan({ retireArcs: [{ number: 12, reason: 'Done.', into: null }] }), w);

    expect(issue(12).closed).toBeUndefined();
    expect(lines.join('\n')).toMatch(/kept #12.*fewer than 3/);
  });

  it('refuses to retire the last big bet', () => {
    const w = world({ arcs: fourArcs() });
    const { issue, lines } = run(plan({ retireArcs: [{ number: 11, reason: 'Done.', into: 10 }] }), w);

    expect(issue(11).closed).toBeUndefined();
    expect(lines.join('\n')).toMatch(/kept #11.*big bet/);
  });
});

describe('lead: opening arcs', () => {
  it('refuses a seventh arc and files the plan’s other steps', () => {
    const arcs = [...fourArcs(), arc(14, 'Calibrate the twin'), arc(15, 'Bring your CAD in')];
    const output = plan({
      newArcs: [{ title: 'Print on a farm', body: 'Why.', bigBet: false }],
      steps: [newStep('Queue a plate', 'Print on a farm'), newStep('Add a lens', 10)],
    });
    const { calls, lines } = run(output, world({ arcs }));

    expect(calls.filter(([kind]) => kind === 'create')).toEqual([['create', 500, ['loop:next', 'loop:feature']]]);
    expect(lines.join('\n')).toMatch(/refused arc "Print on a farm".*6/);
  });

  it('counts retirements before the limit, and labels a big bet', () => {
    const arcs = [...fourArcs(), arc(14, 'Calibrate the twin'), arc(15, 'Bring your CAD in')];
    const output = plan({
      retireArcs: [{ number: 15, reason: 'Shipped.', into: null }],
      newArcs: [{ title: 'Print on a farm', body: 'Why.', bigBet: true }],
    });
    const { calls } = run(output, world({ arcs }));

    expect(calls).toContainEqual(['create', 500, ['loop:arc', 'loop:big-bet']]);
  });
});

describe('lead: linking steps to arcs', () => {
  it('gives a step the number of an arc opened in the same plan', () => {
    const output = plan({
      newArcs: [{ title: 'Print on a farm', body: 'Why.', bigBet: false }],
      steps: [newStep('Queue a plate', 'Print on a farm'), newStep('Add a lens', '#10')],
    });
    const { issue } = run(output, world({ arcs: fourArcs() }));

    expect(issue(501).body).toMatch(/^Arc: #500$/m);
    expect(issue(500).body).toMatch(/^- \[ \] #501$/m);
    expect(issue(502).body).toMatch(/^Arc: #10$/m);
    expect(issue(10).body).toMatch(/^- \[ \] #502$/m);
  });

  it('matches an old title-only step once and rewrites it to the arc number', () => {
    const w = world({ arcs: fourArcs(), steps: [step(30, 'Add a fisheye', 'say less.')] });
    const first = run(plan({}), w);

    expect(first.issue(30).body).toMatch(/^Arc: #12$/m);
    expect(first.issue(12).body).toMatch(/^- \[ \] #30$/m);

    const again = run(plan({}), world({ arcs: [first.issue(12)], steps: [first.issue(30)] }), [
      first.issue(12),
      first.issue(30),
    ]);

    expect(again.calls).toEqual([]);
  });
});

describe('lead: prompt', () => {
  it('lists each arc’s open steps and the steps that merged lately under it', () => {
    const text = prompt(
      world({
        arcs: fourArcs(),
        steps: [step(20, 'Add a fisheye', '#13'), step(21, 'Drop the old menu', 'Say less')],
        recentSteps: [step(5, 'Mirror arms from the camera', '#13'), step(6, 'Cut three labels', 'Say less')],
      }),
    );
    const section = (title) => text.slice(text.indexOf(`#${title}`)).split('\n- #')[0];

    expect(section('13 Take the robot anywhere')).toContain('#20 Add a fisheye');
    expect(section('13 Take the robot anywhere')).toContain('Mirror arms from the camera');
    expect(section('12 Say less')).toContain('#21 Drop the old menu');
    expect(section('12 Say less')).toContain('Cut three labels');
    expect(section('11 Prove it in a Case')).toContain('big bet');
  });
});

const digestWorld = {
  direction: { body: 'Make the loop better every week.' },
  comments: [],
  requests: [],
  tracked: [],
  arcs: [{ number: 224, title: 'Basecase improves its own harness every week', body: 'Measured.' }],
  ideas: [],
  steps: [],
};
const facts = { merged: 'Add a digest', copyLine: 'Copy this week: net +0 strings across 1 merged pull request' };
const worst = {
  lane: 'build',
  measure: 'revisions',
  name: 'Review rounds before pass, per pull request',
  last: 0.5,
  value: 1.25,
  score: 0.75,
};

describe('leadPrompt', () => {
  it("hands the lead the digest's worst number", () => {
    const text = leadPrompt(digestWorld, { ...facts, worst });

    expect(text).toContain("## The digest's worst number");
    expect(text).toContain(worstLine(worst));
    expect(text).toContain('`build` review rounds before pass, per pull request, 0.5 last week and 1.25 this week.');
  });

  it('leaves the section out when no digest named one', () => {
    const text = leadPrompt(digestWorld, { ...facts, worst: null });

    expect(text).not.toContain('worst number');
    expect(text).toContain('## Recently merged\n\nAdd a digest');
  });
});
