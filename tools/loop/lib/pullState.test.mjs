import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'revise-state-'));

vi.stubEnv('BASECASE_LOOP_DIR', dir);

const { entryFor, markLooked, markRebuilt, markRefreshed, recordAttempt, recordConflictFail } =
  await import('./pullState.mjs');

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('pull state', () => {
  it('starts empty for a pull request it has never seen', () => {
    expect(entryFor(1)).toEqual({
      heads: [],
      attempts: 0,
      lastJamel: '',
      lastLook: '',
      conflictFails: 0,
      refreshed: [],
      rebuilt: false,
    });
  });

  it('counts every attempt but remembers each head once', () => {
    recordAttempt(2, { head: 'aaa', jamelAt: '' });
    recordAttempt(2, { head: 'aaa', jamelAt: '2026-11-12T10:00:00Z' });
    recordAttempt(2, { head: 'bbb', jamelAt: '' });

    expect(entryFor(2)).toMatchObject({ heads: ['aaa', 'bbb'], attempts: 3, lastJamel: '2026-11-12T10:00:00Z' });
  });

  it('keeps attempts when marking a look or a rebuild', () => {
    recordAttempt(3, { head: 'ccc', jamelAt: '' });
    markLooked(3, '2026-11-12T11:00:00Z');
    markRebuilt(3);

    expect(entryFor(3)).toMatchObject({ attempts: 1, lastLook: '2026-11-12T11:00:00Z', rebuilt: true });
    expect(entryFor(2).rebuilt).toBe(false);
  });

  it('remembers refreshed heads and counts conflict failures', () => {
    markRefreshed(4, 'ddd');

    expect(recordConflictFail(4)).toBe(1);
    expect(recordConflictFail(4)).toBe(2);
    expect(entryFor(4)).toMatchObject({ refreshed: ['ddd'], conflictFails: 2 });
  });
});
