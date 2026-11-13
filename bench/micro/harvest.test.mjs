import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { specToPart } from '../../src/agent/agentScene';
import { boltedPair } from './bolted.mjs';
import { FAULTS } from './faults.mjs';
import { gradeTask } from './grade.mjs';
import { gateFresh } from './harvest/gate.mjs';
import { harvestedTask, kindOfText } from './harvest/kinds.mjs';
import { assignSplits, coveredBy, planHarvest, reportMarkdown, splitFor, stubFor } from './harvest/plan.mjs';
import { commentCandidates, lastCheck, reviewCandidates, runCandidates } from './harvest/sources.mjs';
import { recordFromFixture } from './materialize.mjs';
import { SEED_TASKS } from './tasks/index.mjs';

const build = (fixture) => recordFromFixture(fixture, specToPart);
const SINCE = '2026-01-01T00:00:00.000Z';

const toolEvents = (tool, text) =>
  [
    { toolCallId: 't1', title: `mcp__robotics_cad__${tool}`, sessionUpdate: 'tool_call', status: 'pending' },
    {
      toolCallId: 't1',
      sessionUpdate: 'tool_call_update',
      _meta: { claudeCode: { toolName: `mcp__robotics_cad__${tool}`, toolResponse: [{ type: 'text', text }] } },
    },
  ]
    .map((update) => JSON.stringify({ type: 'acp-session-update', update }))
    .join('\n');

function writeRun(root, name, { scene, events }) {
  const dir = path.join(root, name, 'micro', 'A2', 'seed-1');

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'scene.json'), JSON.stringify(scene));
  fs.writeFileSync(path.join(dir, 'events.jsonl'), events);
}

const ctx = { studio: null, specToPart };

describe('run archives', () => {
  it("yields one candidate when the scene fails Screws but the agent's last check passed", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harvest-runs-'));
    const scene = await build(FAULTS.shortScrew(boltedPair({ layout: 'visor' })));

    writeRun(root, 'missed', { scene, events: toolEvents('get_readiness', 'READY TO BUILD. No blockers.') });
    writeRun(root, 'named', {
      scene,
      events: toolEvents('get_readiness', 'NOT READY: 1 blocker.\n- [short:visor-1] visor-1 engages 2 mm'),
    });
    writeRun(root, 'unchecked', { scene, events: '' });
    writeRun(root, '_broken', { scene, events: toolEvents('check_assembly', 'No assembly problems found.') });

    const found = runCandidates(root, SINCE);

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ source: 'run', kind: 'short', graded: true, ids: ['visor-1'] });
    expect(found[0].ref).toMatch(/missed\/micro\/A2\/seed-1$/);
    expect(runCandidates(root, '2999-01-01T00:00:00.000Z')).toEqual([]);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("reads the last check's text from the transcript", () => {
    const lines = toolEvents('check_assembly', 'No assembly problems found.')
      .split('\n')
      .map((l) => JSON.parse(l));

    expect(lastCheck(lines)).toEqual({ tool: 'check_assembly', text: 'No assembly problems found.' });
    expect(lastCheck([])).toBeNull();
  });
});

describe('text sources', () => {
  const review = (number, finding) => ({
    number,
    author: 'owner',
    createdAt: '2026-11-10T00:00:00Z',
    body: `### Review: changes needed\n\n- **blocker**: ${finding}`,
  });

  it('reads review findings on merged pull requests that touch the agent, and only design faults', () => {
    const comments = [
      review(1, 'The agent leaves screws without an insert in the head shell.'),
      review(1, '`src/x.ts:3`: rerun skips the run when the key matches.'),
      review(2, 'The agent leaves screws without an insert in the head shell.'),
    ];
    const pulls = [
      { number: 1, mergedAt: '2026-11-10', files: [{ path: 'electron/cad-agent-prompt.mjs' }] },
      { number: 2, mergedAt: '2026-11-10', files: [{ path: 'src/App.tsx' }] },
    ];
    const found = reviewCandidates({ comments, pulls, isReview: () => true });

    expect(found).toEqual([expect.objectContaining({ source: 'review', ref: '#1', kind: 'air', graded: true })]);
  });

  it("reads Jamel's comments on loop issues that name the agent's design output", () => {
    const comments = [
      { number: 7, body: 'Nice.\n\nThe agent placed the battery so its wires overlap the servo horn.' },
      { number: 8, body: 'The agent placed the battery so its wires overlap the servo horn.' },
    ];
    const found = commentCandidates({ comments, loopNumbers: new Set([7]), isOwnerNote: () => true });

    expect(found).toEqual([expect.objectContaining({ ref: '#7', kind: 'clash', graded: false })]);
  });
});

describe('the harvest plan', () => {
  it('skips a candidate an existing task already covers by grader and fault kind', async () => {
    const task = SEED_TASKS.find((t) => t.id === 'A2');
    const start = await build(task.fixture());
    const covered = coveredBy({ task, start, grade: await gradeTask(task, { before: start, after: start }) });
    const plan = planHarvest({ candidates: [{ source: 'run', ref: 'r', kind: 'short', graded: true }], covered });

    expect(covered).toContainEqual(['Thread engagement ≥ 1.5 × D or the insert length:short', 'A2']);
    expect(plan.fresh).toEqual([]);
    expect(plan.duplicates).toEqual([expect.objectContaining({ of: 'A2' })]);
  });

  it('lists a fault no adapter grades as no grader, and never makes it a task', () => {
    const text = kindOfText('Two printed parts overlap by 3 mm');
    const plan = planHarvest({ candidates: [{ source: 'comment', ref: '#9', text: 'x', ...text }], covered: [] });

    expect(text).toEqual({ kind: 'clash', graded: false });
    expect(plan.noGrader).toHaveLength(1);
    expect(plan.fresh).toEqual([]);
  });

  it('keeps one task per new fault kind and drops a kind with no planted fault', () => {
    const plan = planHarvest({
      candidates: [
        { source: 'run', ref: 'a', kind: 'orphan', graded: true },
        { source: 'run', ref: 'b', kind: 'orphan', graded: true },
        { source: 'run', ref: 'c', kind: 'stuck-screw', graded: true },
      ],
      covered: [],
    });

    expect(plan.fresh.map((f) => f.kind)).toEqual(['orphan']);
    expect(plan.duplicates).toEqual([expect.objectContaining({ of: 'new orphan task' })]);
    expect(plan.dropped).toEqual([expect.objectContaining({ reason: expect.stringMatching(/no planted fault/) })]);
  });

  it('builds tasks that pass the dry-run gate for every planted fault no seed task covers', async () => {
    const fresh = ['orphan', 'unseated'].map((kind) => ({ kind, layout: 'torso', candidate: { source: 'run' } }));
    const gated = await gateFresh(fresh, ctx);

    expect(gated.dropped).toEqual([]);
    expect(gated.passed).toHaveLength(2);
  }, 30000);
});

describe('the hold-out split', () => {
  it('holds new tasks out until the split is a third, then alternates', () => {
    const run = (state, n) =>
      Array.from({ length: n }, () => {
        const split = splitFor(state);

        Object.assign(state, {
          heldOut: state.heldOut + (split === 'heldout' ? 1 : 0),
          total: state.total + 1,
          last: split,
        });

        return split;
      });

    expect(run({ heldOut: 3, total: 12, last: null }, 4)).toEqual(['heldout', 'heldout', 'tune', 'heldout']);
    expect(run({ heldOut: 14, total: 43, last: null }, 4)).toEqual(['heldout', 'tune', 'heldout', 'tune']);
  });

  it('numbers new tasks after the last harvested one and records the split in the stub', () => {
    const tasks = [
      ...Array.from({ length: 6 }, (_, i) => ({ id: `S${i}`, heldOut: i < 2 })),
      { id: 'H3', heldOut: true, harvested: true },
    ];
    const made = assignSplits(
      [{ kind: 'orphan', layout: 'arm', candidate: { source: 'run', ref: 'x', text: 't' } }],
      tasks,
    );
    const stub = stubFor(made[0]);
    const task = harvestedTask(stub);

    expect(made[0]).toMatchObject({ id: 'H4', heldOut: false });
    expect(stub).toMatchObject({ id: 'H4', fault: { kind: 'orphan', layout: 'arm' }, heldOut: false });
    expect(task).toMatchObject({
      id: 'H4',
      category: 'assembly',
      instruction: 'Check the upper arm to shoulder fastening',
    });
    expect(
      reportMarkdown({
        since: SINCE,
        counts: { runs: 1 },
        created: made,
        plan: planHarvest({ candidates: [], covered: [] }),
      }),
    ).toMatch(/1 new task from 1 from runs/);
  });
});
