import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-revise-escalation-'));
const calls = vi.hoisted(() => ({
  checkedRun: vi.fn(),
  publish: vi.fn(),
  rebuild: vi.fn(),
  close: vi.fn(),
  check: 'failure',
  review: 'success',
  comments: [],
}));

vi.stubEnv('BASECASE_LOOP_DIR', directory);
vi.mock('../lib/agent.mjs', () => ({ CHANGE_SCHEMA: { properties: {} } }));
vi.mock('../lib/branches.mjs', () => ({ fetchAll: vi.fn(), conflictsWithMain: () => false }));
vi.mock('../lib/github.mjs', () => ({
  checkRunFor: () => ({ databaseId: 42 }),
  editPullLabels: vi.fn(),
  failedLog: () => 'camera signal expected 1, received 0',
  isLoopComment: (comment) => comment.body.includes('<!-- loop -->'),
  openPulls: () => [pull],
  pullCheck: () => calls.check,
  pullComments: () => calls.comments,
  pullReview: () => calls.review,
}));
vi.mock('../lib/preflight.mjs', () => ({ checkedRun: calls.checkedRun }));
vi.mock('../lib/pull.mjs', () => ({ kindOf: () => 'repair', REVISED_FIELDS: [] }));
vi.mock('../lib/rebuild.mjs', () => ({ rebuild: calls.rebuild }));
vi.mock('../lib/revision.mjs', () => ({ publishRevision: calls.publish }));
vi.mock('../lib/gitFetch.mjs', () => ({ fetchGit: vi.fn() }));
vi.mock('../lib/worktree.mjs', () => ({ clearPath: vi.fn(), close: calls.close, linkModules: vi.fn() }));
vi.mock('../lib/sh.mjs', () => ({ run: () => ({ ok: true, out: '', err: '' }) }));

const { default: revise } = await import('./revise.mjs');
const { entryFor, saveEntry } = await import('../lib/pullState.mjs');
const { held } = await import('../lib/claim.mjs');
const { editPullLabels } = await import('../lib/github.mjs');
const pull = {
  number: 2187,
  title: 'Repair: Camera inference',
  body: 'Keep camera inference working',
  headRefName: 'loop/rebuild/camera',
  headRefOid: 'head',
  updatedAt: '2026-11-28T06:08:56Z',
};
const log = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  calls.check = 'failure';
  calls.review = 'success';
  calls.comments = [];
  calls.checkedRun.mockReturnValue({ ok: true, output: { changed: false, notes: 'Inference source unresolved' } });
  saveEntry(pull.number, { heads: [], attempts: 0, lastJamel: '', lastLook: '', rebuilt: false });
});

afterAll(() => {
  fs.rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

it.each(['check', 'review'])(
  'hands an unresolved %s to rebuild immediately with its findings and original evidence',
  (reason) => {
    calls.check = reason === 'check' ? 'failure' : 'success';
    calls.review = reason === 'review' ? 'failure' : 'success';
    calls.comments = [{ author: 'JamelHammoud', body: '### Review: signal missing <!-- loop -->' }];
    revise({ log });

    const [selected, options] = calls.rebuild.mock.calls[0];
    const handoff = options.comments.at(-1).body;

    expect(selected).toEqual(pull);
    expect(options.stuck).toBe(`completed a revision without resolving its failed ${reason}`);
    expect(options.comments[0]).toEqual(calls.comments[0]);
    expect(handoff).toContain('Inference source unresolved');
    expect(handoff).toContain(
      reason === 'check' ? 'camera signal expected 1, received 0' : '### Review: signal missing',
    );
    expect(calls.close.mock.invocationCallOrder[0]).toBeLessThan(calls.rebuild.mock.invocationCallOrder[0]);
    expect(held(`pull-${pull.number}`)).toBe(false);
    expect(entryFor(pull.number)).toMatchObject({ heads: ['head'], attempts: 1 });
    revise({ log });
    expect(calls.checkedRun).toHaveBeenCalledOnce();
    expect(calls.rebuild).toHaveBeenCalledOnce();
  },
);

it('delivers a successful source or metadata revision without rebuilding', () => {
  calls.checkedRun.mockReturnValue({ ok: true, output: { changed: true, revision: 'Preserve inference' } });
  revise({ log });
  expect(calls.publish).toHaveBeenCalledOnce();
  expect(calls.rebuild).not.toHaveBeenCalled();
  expect(calls.close).toHaveBeenCalledOnce();
});

it('does not escalate a provider failure or consume another rebuild for an already rebuilt pull', () => {
  calls.checkedRun.mockReturnValueOnce({ ok: false, error: 'provider unavailable' });
  revise({ log });
  expect(calls.rebuild).not.toHaveBeenCalled();
  saveEntry(pull.number, { heads: [], attempts: 1, rebuilt: true });
  revise({ log });
  expect(calls.checkedRun).toHaveBeenCalledTimes(2);
  expect(calls.rebuild).not.toHaveBeenCalled();
  expect(held(`pull-${pull.number}`)).toBe(false);
});

it('leaves a no-change response to a new owner comment outside failure escalation', () => {
  calls.check = 'success';
  calls.comments = [{ author: 'JamelHammoud', createdAt: '2026-11-28T06:00:00Z', body: 'Explain the fix' }];
  revise({ log });
  expect(calls.checkedRun).toHaveBeenCalledOnce();
  expect(calls.rebuild).not.toHaveBeenCalled();
});

it('releases the pull claim and revising label when escalation fails', () => {
  calls.rebuild.mockImplementationOnce(() => {
    throw new Error('rebuild unavailable');
  });

  expect(() => revise({ log })).toThrow('rebuild unavailable');
  expect(held(`pull-${pull.number}`)).toBe(false);
  expect(calls.close).toHaveBeenCalledOnce();
  expect(editPullLabels).toHaveBeenLastCalledWith(pull.number, { remove: ['loop:revising'] });
});
