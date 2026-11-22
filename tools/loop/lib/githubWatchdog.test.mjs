import { beforeEach, expect, it, vi } from 'vitest';
import { unstickMainChecks } from './github.mjs';
import { json, run } from './sh.mjs';

vi.mock('./sh.mjs', () => ({ json: vi.fn(), run: vi.fn() }));
vi.mock('./cache.mjs', () => ({ cached: (_key, _options, read) => read() }));

const now = Date.parse('2026-11-22T21:40:00Z');
const check = { databaseId: 42, headSha: 'a'.repeat(40), status: 'in_progress', createdAt: '2026-11-22T21:00:00Z' };
let jobs;
const cancelled = () => run.mock.calls.filter(([, args]) => args.includes('POST'));

beforeEach(() => {
  vi.clearAllMocks();
  jobs = [{ started_at: '2026-11-22T21:01:00Z', steps: [] }];
  json.mockImplementation((_command, args) => (args[0] === 'run' ? [check] : [{ jobs }]));
  run.mockReturnValue({ out: 'example/studio', ok: true });
});

it('keeps a run whose Windows job started after waiting for a runner', () => {
  jobs = [{ started_at: '2026-11-22T21:21:00Z', steps: [] }];
  unstickMainChecks(vi.fn(), now);
  expect(cancelled()).toEqual([]);
});

it('keeps a run with a newly started test step in an older job', () => {
  jobs[0].steps = [{ started_at: '2026-11-22T21:26:00Z' }];
  unstickMainChecks(vi.fn(), now);
  expect(cancelled()).toEqual([]);
});

it('keeps queued dependent jobs after another job just finished', () => {
  jobs[0].completed_at = '2026-11-22T21:39:00Z';
  jobs.push({ status: 'queued', steps: [] });
  unstickMainChecks(vi.fn(), now);
  expect(cancelled()).toEqual([]);
});

it('still cancels a run without job or step progress for thirty minutes', () => {
  unstickMainChecks(vi.fn(), now);
  expect(cancelled()).toHaveLength(1);
});

it('does not cancel when current job activity cannot be read', () => {
  json.mockImplementation((_command, args) => {
    if (args[0] === 'run') return [check];

    throw new Error('GitHub unavailable');
  });

  const log = vi.fn();

  unstickMainChecks(log, now);
  expect(cancelled()).toEqual([]);
  expect(log).toHaveBeenCalledWith(expect.stringContaining('could not be read'));
});
