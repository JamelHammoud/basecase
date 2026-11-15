import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./agent.mjs', () => ({ runAgent: vi.fn(() => ({ ok: false, error: 'no changes' })) }));
vi.mock('./claim.mjs', () => ({ claim: () => () => {}, held: () => false }));
vi.mock('./github.mjs', () => ({
  closeIssue: vi.fn(() => ({ ok: true })),
  commentOnIssue: vi.fn(),
  setIssueBody: vi.fn(),
  editPullLabels: vi.fn(),
  issueIsOpen: () => true,
  pullComments: () => [],
  repo: () => 'example/basecase',
  hasLabel: (issue, name) => issue.labels.some((label) => label.name === name),
  issues: vi.fn(() => []),
}));
vi.mock('./sh.mjs', () => ({ json: () => [] }));
vi.mock('./store.mjs', () => ({ store: () => ({ get: () => ({ head: '', groomedAt: 0 }), save: vi.fn() }) }));
vi.mock('./worktree.mjs', () => ({ openBranch: () => ({ dir: 'scratch/groom' }), close: vi.fn() }));
vi.mock('./stepPulls.mjs', async (original) => ({ ...(await original()), stepPullIndex: vi.fn() }));

import { groomQueue } from '../lanes/groom.mjs';
import { runAgent } from './agent.mjs';
import { closeIssue, editPullLabels, issues } from './github.mjs';
import { indexByStep, stepPullIndex } from './stepPulls.mjs';

const step = (number, label = 'loop:next') => ({
  number,
  title: `Step ${number}`,
  body: 'Kind: refine',
  createdAt: '2026-11-13T00:00:00Z',
  author: { login: 'JamelHammoud' },
  labels: [{ name: label }],
});
const pull = (number, step, state) => ({
  number,
  state,
  headRefName: 'loop/rebuild/work',
  body: '',
  labels: [{ name: `loop:step:${step}` }],
});

beforeEach(() => {
  vi.clearAllMocks();
  issues.mockImplementation((label) => (label === 'loop:next' ? [step(605), step(606)] : [step(410, 'loop:building')]));
  stepPullIndex.mockReturnValue(
    indexByStep([pull(719, 605, 'MERGED'), pull(686, 410, 'MERGED'), pull(709, 606, 'CLOSED')]),
  );
});

describe('groom queue entry point', () => {
  it('sweeps merged waiting and building steps before asking the session about unfinished work', () => {
    groomQueue({ log: vi.fn() });

    expect(closeIssue.mock.calls).toEqual([
      [605, 'Built in #719.'],
      [410, 'Built in #686.'],
    ]);
    expect(runAgent).toHaveBeenCalledOnce();

    const prompt = runAgent.mock.calls[0][0].prompt;

    expect(prompt).toContain('### #606');
    expect(prompt).not.toContain('### #605');
    expect(prompt).not.toContain('### #410');
  });

  it('prints the sweep in a dry run without closing issues or changing labels', () => {
    const log = vi.fn();

    groomQueue({ log, dry: true });

    expect(log).toHaveBeenCalledWith('would close step #605, built in #719');
    expect(closeIssue).not.toHaveBeenCalled();
    expect(editPullLabels).not.toHaveBeenCalled();
  });
});
