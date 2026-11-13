import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pull-state-'));

vi.stubEnv('BASECASE_LOOP_DIR', dir);

const { entryFor, markRefreshed, nudge, recordAttempt } = await import('./pullState.mjs');

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('nudging an untouched pull request', () => {
  it('forgets that revise and rebase tried its head, and keeps the attempt count that leads to a rebuild', () => {
    recordAttempt(7, { head: 'aaa', jamelAt: '' });
    markRefreshed(7, 'aaa');
    nudge(7, 'aaa');

    expect(entryFor(7)).toMatchObject({ heads: [], refreshed: [], attempts: 1 });
  });
});
