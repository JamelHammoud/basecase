import { spawnSync } from 'node:child_process';
import { beforeEach, expect, it, vi } from 'vitest';
import { run } from './sh.mjs';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

it.each([
  [{ error: new Error('spawnSync codex ETIMEDOUT') }, 'spawnSync codex ETIMEDOUT'],
  [{ status: null, signal: 'SIGTERM' }, 'exit null, signal SIGTERM'],
  [{ status: 7 }, 'exit 7, signal none'],
  [{ status: 1, stderr: 'provider unavailable' }, 'provider unavailable'],
])('retains subprocess failure evidence when failure is allowed: %j', (result, error) => {
  spawnSync.mockReturnValue({ status: null, stdout: 'partial output', ...result });

  expect(run('codex', ['exec'], { allowFail: true })).toEqual({ ok: false, out: 'partial output', err: error });
});

it('keeps successful commands and throwing failures unchanged', () => {
  spawnSync.mockReturnValue({ status: 0, stdout: ' completed ', stderr: '' });
  expect(run('git', ['status'])).toEqual({ ok: true, out: 'completed', err: '' });
  spawnSync.mockReturnValue({ status: null, error: new Error('spawnSync git ETIMEDOUT') });
  expect(() => run('git', ['status'])).toThrow('spawnSync git ETIMEDOUT');
});
