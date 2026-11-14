import { describe, expect, it } from 'vitest';
import { failureDigest, jobsOf, withTimeouts } from './failedLog.mjs';

const esc = String.fromCharCode(27);
const filler = (job, count) =>
  Array.from({ length: count }, (_, i) => `${job}\tCheck everything\t2026-11-14T10:45:00Z stdout line ${i}`);

const combined = [
  ...filler('unit (windows-latest)', 4000),
  'unit (windows-latest)\tCheck everything\t2026-11-14T10:50:08Z  FAIL  electron/backend/acpAgent.test.mjs > ACP agent failures > runs the offline agent',
  `e2e (2)\tRun\t2026-11-14T10:53:59Z ${esc}[41m${esc}[1m FAIL ${esc}[22m${esc}[49m e2e/cameras.e2e.test.ts > camera views > follow the simulation in realtime`,
  'e2e (2)\tRun\t2026-11-14T10:53:59Z AssertionError: expected 9 to be greater than 15',
  ...filler('unit (ubuntu-latest)', 4000),
  'unit (ubuntu-latest)\tCheck everything\t2026-11-14T10:46:40Z  FAIL  src/design-system/textTiers.test.ts > text tiers > writes every text in white/90',
].join('\n');

describe('failed log digest', () => {
  it('names every failed job and test, and keeps each job’s ending within the limit', () => {
    const digest = failureDigest(jobsOf(combined), 20_000);

    expect(combined.length).toBeGreaterThan(200_000);
    expect(digest.length).toBeLessThanOrEqual(20_000);
    expect(digest).toContain(
      '- unit (windows-latest): electron/backend/acpAgent.test.mjs > ACP agent failures > runs the offline agent',
    );
    expect(digest).toContain('- e2e (2): e2e/cameras.e2e.test.ts > camera views > follow the simulation in realtime');
    expect(digest).toContain('AssertionError: expected 9 to be greater than 15');
    expect(digest).toContain('## unit (ubuntu-latest)');
    expect(digest).not.toContain(esc);
  });

  it('gives a short job its whole log and splits what is left among the long ones', () => {
    const digest = failureDigest(
      [
        { name: 'check', log: 'one failed job' },
        { name: 'unit', log: 'u'.repeat(50_000) },
        { name: 'e2e', log: 'e'.repeat(50_000) },
      ],
      10_000,
    );

    expect(digest).toContain('## check\n\none failed job');
    expect(digest.match(/u/g).length).toBeGreaterThan(4500);
    expect(digest.match(/e{100}/g).length).toBeGreaterThan(40);
    expect(digest.length).toBeLessThanOrEqual(10_000);
  });

  it('says which job ran past its timeout', () => {
    const digest = failureDigest(
      [
        { name: 'e2e (1)', log: ' ✓ e2e/booleans.e2e.test.ts (2 tests) 11593ms', timedOut: true },
        { name: 'check', log: 'Process completed with exit code 1.' },
      ],
      10_000,
    );

    expect(digest).toContain('- e2e (1): ran past its timeout, so GitHub cancelled it. no failed test named');
    expect(digest).toContain('- check: no failed test named');
  });

  it('is empty when no job failed', () => {
    expect(failureDigest([], 10_000)).toBe('');
  });
});

describe('timed-out jobs', () => {
  const messages = {
    1: ['The job has exceeded the maximum execution time of 15m0s', 'The operation was canceled.'],
    2: ['The run was canceled by @someone.', 'The operation was canceled.'],
  };

  it('counts a job GitHub cancelled at its timeout as timed out, and leaves every other job as it was', () => {
    const jobs = [
      { id: 1, name: 'e2e (1)', conclusion: 'cancelled' },
      { id: 2, name: 'e2e (2)', conclusion: 'cancelled' },
      { id: 3, name: 'e2e (3)', conclusion: 'failure' },
      { id: 4, name: 'unit', conclusion: 'success' },
    ];
    const asked = [];
    const result = withTimeouts(jobs, (id) => {
      asked.push(id);

      return messages[id] ?? [];
    });

    expect(result.map(({ conclusion }) => conclusion)).toEqual(['timed_out', 'cancelled', 'failure', 'success']);
    expect(asked).toEqual([1, 2]);
  });
});
