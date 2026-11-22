import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelObsoleteRuns, obsoleteRun, runPullNumber } from './staleRuns.mjs';
import * as sh from './sh.mjs';

const current = 'a'.repeat(40);
const previous = 'b'.repeat(40);
const active = {
  id: 42,
  status: 'in_progress',
  head_sha: previous,
  head_branch: 'refs/pull/12/head',
  pull_requests: [],
};
const pull = () => ({
  state: 'open',
  user: { login: 'JamelHammoud' },
  head: { sha: current, ref: 'loop/repair/fix', repo: { full_name: 'example/basecase' } },
  base: { ref: 'main', repo: { full_name: 'example/basecase' } },
});

beforeEach(() => vi.restoreAllMocks());

describe('obsolete workflow selection', () => {
  it('finds dynamic CodeQL runs without pull metadata and refuses ambiguous links', () => {
    expect(runPullNumber(active)).toBe(12);
    expect(runPullNumber({ pull_requests: [{ number: 3 }] })).toBe(3);
    expect(
      runPullNumber({ pull_requests: [{ number: 3 }, { number: 4 }], head_branch: 'refs/pull/12/head' }),
    ).toBeNull();
    expect(runPullNumber({ head_branch: 'main' })).toBeNull();
  });

  it('retires obsolete heads and closed pulls while preserving the current open head', () => {
    expect(obsoleteRun(active, pull())).toBe(true);
    expect(obsoleteRun({ ...active, head_sha: current }, pull())).toBe(false);
    expect(obsoleteRun({ ...active, head_sha: current }, { ...pull(), state: 'closed' })).toBe(true);
    expect(obsoleteRun({ ...active, status: 'completed' }, pull())).toBe(false);
  });

  it('refuses missing evidence, outside authors, forks and non-loop work', () => {
    expect(obsoleteRun(active, null)).toBe(false);
    expect(obsoleteRun({ ...active, head_sha: null }, pull())).toBe(false);
    expect(obsoleteRun(active, { ...pull(), user: { login: 'someone' } })).toBe(false);
    expect(obsoleteRun(active, { ...pull(), head: { ...pull().head, ref: 'feature/work' } })).toBe(false);
    expect(obsoleteRun(active, { ...pull(), head: { ...pull().head, repo: { full_name: 'fork/basecase' } } })).toBe(
      false,
    );
    expect(obsoleteRun(active, { ...pull(), base: { ...pull().base, ref: 'release' } })).toBe(false);
  });

  it('reads fresh pull state for each run and cancels only obsolete heads across pages', () => {
    let lookups = 0;

    const read = vi.spyOn(sh, 'json').mockImplementation((_cmd, args) => {
      if (args.at(-1).endsWith('/pulls/12')) {
        lookups++;

        return { ...pull(), head: { ...pull().head, sha: lookups === 1 ? 'c'.repeat(40) : current } };
      }

      if (args.at(-1).includes('status=in_progress'))
        return [{ workflow_runs: [active] }, { workflow_runs: [{ ...active, id: 43, head_sha: current }] }];

      return [{ workflow_runs: [] }];
    });
    const cancel = vi.spyOn(sh, 'run').mockReturnValue({ ok: true });

    cancelObsoleteRuns(vi.fn());
    expect(cancel).toHaveBeenCalledExactlyOnceWith('gh', ['run', 'cancel', '42']);
    expect(read.mock.calls.filter(([, args]) => args.at(-1).endsWith('/pulls/12'))).toHaveLength(2);
  });

  it('does not infer closure when the pull lookup fails', () => {
    vi.spyOn(sh, 'json').mockImplementation((_cmd, args) => {
      if (args.at(-1).endsWith('/pulls/12')) throw new Error('unavailable');

      return [{ workflow_runs: [active] }];
    });

    const cancel = vi.spyOn(sh, 'run');

    expect(() => cancelObsoleteRuns(vi.fn())).toThrow('unavailable');
    expect(cancel).not.toHaveBeenCalled();
  });
});
