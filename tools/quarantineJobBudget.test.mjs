import { expect, it } from 'vitest';
import { hasObservationHeadroom, jobRemainingMs } from './quarantineJobBudget.mjs';

const env = {
  GITHUB_ACTIONS: 'true',
  GITHUB_TOKEN: 'token',
  GITHUB_API_URL: 'https://api.example.test',
  GITHUB_REPOSITORY: 'owner/repo',
  GITHUB_RUN_ID: '7',
  GITHUB_RUN_ATTEMPT: '1',
  RUNNER_NAME: 'runner-2',
  QUARANTINE_JOB_MINUTES: '15',
};
const startedAt = '2026-11-22T21:09:47Z';
const jobs = [
  { runner_name: 'runner-1', status: 'in_progress', started_at: '2026-11-22T21:00:00Z' },
  { runner_name: 'runner-2', status: 'completed', started_at: '2026-11-22T20:00:00Z' },
  { runner_name: 'runner-2', status: 'in_progress', started_at: startedAt },
];

it('measures the time left in the job that owns this runner', async () => {
  const urls = [];
  const remaining = await jobRemainingMs({
    env,
    fetchJson: async (url) => {
      urls.push(url);

      return { jobs };
    },
    now: () => Date.parse('2026-11-22T21:24:09Z'),
  });

  expect(remaining).toBe(38000);
  expect(urls).toEqual([
    'https://api.example.test/repos/owner/repo/actions/runs/7/attempts/1/jobs?per_page=100&page=1',
  ]);
  expect(hasObservationHeadroom(remaining)).toBe(false);
  expect(hasObservationHeadroom(Date.parse('2026-11-22T21:24:54Z') - Date.parse('2026-11-22T21:24:09Z') + 120000)).toBe(
    true,
  );
});

it('finds the job on a later page', async () => {
  const full = Array.from({ length: 100 }, () => ({
    runner_name: 'other',
    status: 'in_progress',
    started_at: startedAt,
  }));
  const pages = [{ jobs: full }, { jobs }];
  const remaining = await jobRemainingMs({
    env,
    fetchJson: async () => pages.shift(),
    now: () => Date.parse(startedAt),
  });

  expect(remaining).toBe(15 * 60000);
});

it('observes as before when the budget cannot be measured', async () => {
  const failing = async () => {
    throw new Error('offline');
  };

  expect(await jobRemainingMs({ env, fetchJson: failing })).toBe(Infinity);
  expect(await jobRemainingMs({ env, fetchJson: async () => ({ jobs: [] }) })).toBe(Infinity);
  expect(await jobRemainingMs({ env: { ...env, GITHUB_ACTIONS: '' }, fetchJson: failing })).toBe(Infinity);
  expect(await jobRemainingMs({ env: { ...env, QUARANTINE_JOB_MINUTES: '' }, fetchJson: failing })).toBe(Infinity);
  expect(await jobRemainingMs({ env: { ...env, GITHUB_TOKEN: '' }, fetchJson: failing })).toBe(Infinity);
});
