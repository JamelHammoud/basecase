import { beforeEach, describe, expect, it, vi } from 'vitest';
import web from './web.mjs';

const mocks = vi.hoisted(() => ({ state: {}, save: vi.fn(), json: vi.fn(), run: vi.fn(), paused: false }));

vi.mock('../lib/store.mjs', () => ({ store: () => ({ get: () => mocks.state, save: mocks.save }) }));
vi.mock('../lib/sh.mjs', () => ({ json: mocks.json, run: mocks.run }));
vi.mock('../lib/github.mjs', () => ({ isPaused: () => mocks.paused }));

let runs;
let release;
let comparison;
const log = vi.fn();
const deployment = (extra = {}) => ({
  id: 42,
  run_attempt: 1,
  status: 'completed',
  conclusion: 'success',
  display_title: 'Deploy web from abc',
  html_url: 'https://github.com/example/basecase/actions/runs/42',
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  runs = [];
  comparison = 'ahead';
  release = { tag_name: 'v1.2.3', prerelease: false, draft: false };
  mocks.state = { deployedRef: null, retried: [] };
  mocks.paused = false;
  mocks.json.mockImplementation((_cmd, args) => {
    const endpoint = args[1];

    if (endpoint.endsWith('releases/latest')) return release;

    if (endpoint.includes('/commits/')) return { sha: 'abc' };

    if (endpoint.includes('/compare/')) return { status: comparison };

    return { workflow_runs: runs };
  });
});

describe('web deployment recovery', () => {
  it('dispatches the stable release exact commit when no release event reached Actions', () => {
    web({ log });
    expect(mocks.run).toHaveBeenCalledWith('gh', [
      'workflow',
      'run',
      'deploy-web.yml',
      '--ref',
      'main',
      '-f',
      'ref=abc',
    ]);
  });

  it.each(['abc', 'v1.2.3'])('records a successful deployment named by %s', (ref) => {
    runs = [deployment({ display_title: `Deploy web from ${ref}` })];
    web({ log });
    expect(mocks.save).toHaveBeenCalledWith('state', { deployedRef: 'abc', retried: [] });
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('does not roll back a verified urgent deployment newer than the stable release', () => {
    mocks.state.deployedRef = 'newer';
    web({ log });
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.json).toHaveBeenCalledWith('gh', ['api', 'repos/{owner}/{repo}/compare/abc...newer']);
  });

  it('deploys a new release ahead of the last verified deployment', () => {
    mocks.state.deployedRef = 'older';
    comparison = 'behind';
    web({ log });
    expect(mocks.run).toHaveBeenCalledOnce();
  });

  it('waits for a running deployment instead of duplicating it', () => {
    runs = [deployment({ status: 'in_progress', conclusion: null })];
    web({ log });
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('does not race an unrelated manual deployment', () => {
    runs = [deployment({ status: 'queued', display_title: 'Deploy web from newer' })];
    web({ log });
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('retries only failed jobs once and retains that attempt', () => {
    runs = [deployment({ conclusion: 'failure' })];
    web({ log });
    expect(mocks.run).toHaveBeenCalledWith('gh', ['run', 'rerun', '42', '--failed']);
    expect(mocks.save).toHaveBeenCalledWith('state', { deployedRef: null, retried: [42] });
  });

  it.each([1, 2])('surfaces persistent failures to the doctor without another retry, attempt %s', (attempt) => {
    runs = [deployment({ conclusion: 'failure', run_attempt: attempt })];
    mocks.state.retried = [42];
    expect(() => web({ log })).toThrow(
      'Web deployment failed after recovery: https://github.com/example/basecase/actions/runs/42',
    );
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('keeps a failed dispatch eligible for the next visit', () => {
    mocks.run.mockImplementationOnce(() => {
      throw new Error('offline');
    });
    expect(() => web({ log })).toThrow('offline');
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('respects the pause and refuses prerelease publication', () => {
    release.prerelease = true;
    web({ log });
    expect(mocks.run).not.toHaveBeenCalled();
    mocks.paused = true;
    mocks.json.mockClear();
    web({ log });
    expect(mocks.json).not.toHaveBeenCalled();
  });
});
