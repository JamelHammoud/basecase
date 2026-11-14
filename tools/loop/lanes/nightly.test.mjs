import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as github from '../lib/github.mjs';
import * as sh from '../lib/sh.mjs';
import nightly from './nightly.mjs';

vi.mock('../lib/store.mjs', () => ({
  store: () => ({ get: () => ({ tried: [], pending: null }) }),
}));

const failed = {
  status: 'completed',
  conclusion: 'failure',
  headSha: 'aaa',
  createdAt: '2026-11-14T12:40:11Z',
};

let mainRuns;
let repairs;
let head;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-14T13:10:00Z'));
  mainRuns = [failed];
  repairs = [{ mergedAt: '2026-11-14T12:51:54Z' }];
  head = 'bbb';
  vi.spyOn(github, 'isPaused').mockReturnValue(false);
  vi.spyOn(sh, 'json').mockImplementation((_cmd, args) => {
    if (args[0] === 'pr') return repairs;

    if (args.includes('--branch') && !args.includes('--status')) return mainRuns;

    return [];
  });
  vi.spyOn(sh, 'run').mockImplementation(() => ({ ok: true, out: head, err: '' }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const dispatches = () => sh.run.mock.calls.filter(([, args]) => args[0] === 'workflow');

describe('nightly suite dispatch', () => {
  it('starts a suite on current main for a repair merged since the failed suite began', () => {
    nightly({ log: vi.fn() });

    expect(sh.json).toHaveBeenCalledWith('gh', [
      'pr',
      'list',
      '--state',
      'merged',
      '--base',
      'main',
      '--label',
      'loop:repair',
      '--search',
      'merged:>2026-11-14T12:40:11Z',
      '--limit',
      '1',
      '--json',
      'mergedAt',
    ]);
    expect(dispatches()).toEqual([['gh', ['workflow', 'run', 'check.yml', '--ref', 'main'], { allowFail: true }]]);
  });

  it('keeps the hourly fallback for unrelated commits', () => {
    repairs = [];
    nightly({ log: vi.fn() });
    expect(dispatches()).toEqual([]);
    vi.setSystemTime(new Date('2026-11-14T13:41:00Z'));
    nightly({ log: vi.fn() });
    expect(dispatches()).toHaveLength(1);
  });

  it('leaves a running suite alone and does not look for repairs', () => {
    mainRuns = [{ ...failed, status: 'in_progress', conclusion: '' }, failed];
    nightly({ log: vi.fn() });
    expect(dispatches()).toEqual([]);
    expect(sh.json.mock.calls.some(([, args]) => args[0] === 'pr')).toBe(false);
  });

  it('does not repeat a suite whose commit already includes the repair', () => {
    head = 'aaa';
    nightly({ log: vi.fn() });
    expect(dispatches()).toEqual([]);
  });

  it('does not use a repair already covered by a newer failed suite to bypass the hourly wait', () => {
    mainRuns = [{ ...failed, headSha: 'bbb', createdAt: '2026-11-14T13:05:00Z' }];
    head = 'ccc';
    repairs = [];
    nightly({ log: vi.fn() });
    expect(dispatches()).toEqual([]);
    expect(sh.json.mock.calls.find(([, args]) => args[0] === 'pr')[1]).toContain('merged:>2026-11-14T13:05:00Z');
  });
});
