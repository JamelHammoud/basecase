import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pull-state-'));

vi.stubEnv('BASECASE_LOOP_DIR', dir);

const { entryFor, judgedAt, markJudged, markRefreshed, nudge, recordAttempt } = await import('./pullState.mjs');

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('nudging an untouched pull request', () => {
  it('forgets that revise and rebase tried its head, and keeps the attempt count that leads to a rebuild', () => {
    recordAttempt(7, { head: 'aaa', jamelAt: '' });
    markRefreshed(7, 'aaa');
    nudge(7, 'aaa');

    expect(entryFor(7)).toMatchObject({ heads: [], refreshed: [], attempts: 1 });
  });
});

describe('a review that passed while the bench was busy', () => {
  it('keeps its verdict for that head only, so a new head is reviewed again', () => {
    const output = { verdict: 'pass', summary: 'Holds.', findings: [] };

    markJudged(9, 'bbb', output);

    expect(judgedAt(9, 'bbb')).toEqual(output);
    expect(judgedAt(9, 'ccc')).toBeNull();
  });
});
