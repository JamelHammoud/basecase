import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as github from '../lib/github.mjs';
import * as sh from '../lib/sh.mjs';
import { nightlyHarness } from '../lib/harnessNightly.mjs';
import nightly from './nightly.mjs';

vi.mock('../lib/harnessNightly.mjs', () => ({ nightlyHarness: vi.fn() }));

const releaseState = vi.hoisted(() => ({ pending: null, save: vi.fn() }));

vi.mock('../lib/store.mjs', () => ({
  store: () => ({ get: () => ({ tried: [], pending: releaseState.pending }), save: releaseState.save }),
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
  releaseState.pending = null;
  releaseState.save.mockClear();
  nightlyHarness.mockClear();
  vi.spyOn(github, 'isPaused').mockReturnValue(false);
  vi.spyOn(sh, 'json').mockImplementation((_cmd, args) => {
    if (args[0] === 'pr') return repairs;

    if (args.includes('--branch') && !args.includes('--status')) return mainRuns;

    return [];
  });
  vi.spyOn(sh, 'run').mockImplementation(() => ({ ok: true, out: head, err: '' }));
});

const RELEASE_ARTIFACTS = {
  'forge-linux-x64': ['forge-linux-x64.json', 'forge-linux-x64.json.sha256'],
  mac: ['Basecase.dmg'],
  windows: ['Basecase-Setup.exe'],
  'robot-daemon-linux-arm64': ['robot-daemon-linux-arm64', 'robot-daemon-linux-arm64.sha256'],
  'robot-daemon-linux-x64': ['robot-daemon-linux-x64', 'robot-daemon-linux-x64.sha256'],
};

function pendingRelease(failedJob) {
  releaseState.pending = { version: '0.2.1', ref: 'bbb', dispatchedAt: '2026-11-14T13:00:00Z' };
  sh.json.mockImplementation((_cmd, args) => {
    if (args.includes('check.yml')) return [{ ...failed, conclusion: 'success' }];

    if (args.includes('release.yml'))
      return [{ databaseId: 42, status: 'completed', createdAt: '2026-11-14T13:01:00Z' }];

    return {
      jobs: ['mac', 'windows', 'daemon-linux-arm64', 'daemon-linux-x64', 'forge-linux-x64'].map((name) => ({
        name,
        conclusion: name === failedJob ? 'failure' : 'success',
      })),
    };
  });
  sh.run.mockImplementation((_cmd, args) => {
    if (args[0] === 'run' && args[1] === 'download') {
      const dir = args.at(-1);

      for (const [artifact, files] of Object.entries(RELEASE_ARTIFACTS)) {
        fs.mkdirSync(path.join(dir, artifact));

        for (const file of files) fs.writeFileSync(path.join(dir, artifact, file), 'fixture');
      }
    }

    return { ok: true, out: '', err: '' };
  });
}

describe('nightly daemon releases', () => {
  it('publishes both Linux binaries and their checksums with the desktop downloads', () => {
    pendingRelease();
    nightly({ log: vi.fn() });

    const args = sh.run.mock.calls.find(([, argv]) => argv[0] === 'release')[1];
    const assets = args.slice(args.indexOf('--generate-notes') + 1).map((file) => path.basename(file));

    expect(assets.sort()).toEqual(Object.values(RELEASE_ARTIFACTS).flat().sort());
    expect(args).toContain('bbb');
    expect(nightlyHarness).toHaveBeenCalledWith(expect.objectContaining({ release: 'v0.2.1' }));
  });

  it('does not queue an experiment when creating the release fails', () => {
    pendingRelease();

    const implementation = sh.run.getMockImplementation();

    sh.run.mockImplementation((command, args) =>
      args[0] === 'release' ? { ok: false, out: '', err: 'publication failed' } : implementation(command, args),
    );
    nightly({ log: vi.fn() });
    expect(nightlyHarness).toHaveBeenCalledWith(expect.objectContaining({ release: null }));
  });

  it.each(['daemon-linux-arm64', 'daemon-linux-x64'])('refuses publication when %s fails', (job) => {
    pendingRelease(job);
    nightly({ log: vi.fn() });
    expect(sh.run.mock.calls.some(([, args]) => args[0] === 'release' || args[1] === 'download')).toBe(false);
    expect(releaseState.save).toHaveBeenCalledWith('state', { tried: [], pending: null });
    expect(nightlyHarness).toHaveBeenCalledWith(expect.objectContaining({ release: null }));
  });
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
