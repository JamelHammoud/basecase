import loadMujoco from '@mujoco/mujoco';
import { beforeAll, expect, it } from 'vitest';
import { compareBodySequences } from './bodySequenceComparison.fixtures';
import { BODY_ANALYSIS_SCENARIOS } from './bodyAnalysisMatrix.fixtures';

let mj: Awaited<ReturnType<typeof loadMujoco>>;
const expected: Record<string, { rounds: number; reason: string; verdict: string }> = {
  'coupled wrist': { rounds: 0, reason: 'no-improvement', verdict: 'cant-tell' },
  'horizontal arm': { rounds: 1, reason: 'no-improvement', verdict: 'measured' },
  'stationary rover': { rounds: 3, reason: 'duration', verdict: 'measured' },
  'unexcited pan-tilt': { rounds: 1, reason: 'no-improvement', verdict: 'cant-tell' },
};

beforeAll(async () => {
  mj = await loadMujoco();
});

it.each(BODY_ANALYSIS_SCENARIOS)('retains and independently checks the planted %s workload', async (name) => {
  const [record] = await compareBodySequences(
    mj,
    [name],
    `scratch/body-sequence-validation-${name.replaceAll(' ', '-')}.json`,
    ['accumulated'],
  );

  expect({ rounds: record.rounds, reason: record.reason, verdict: record.verdict }).toEqual(
    expected[name] ?? { rounds: 0, reason: 'resolved', verdict: 'cant-tell' },
  );
  expect(record.heldOutRms).not.toBeNull();
  expect(Number.isFinite(record.heldOutRms)).toBe(true);
  expect(record.physicsSteps).toBeLessThanOrEqual(record.limits.physicsSteps);
  expect(record.retainedBytes).toBeGreaterThan(0);
  expect(record.retainedBytes).toBeLessThanOrEqual(record.limits.retainedBytes);

  if (record.verdict === 'measured') expect(record.heldOutRms).toBeLessThan(1e-6);

  if (name === 'coupled wrist') expect(record.unresolvedDirections).toBeGreaterThan(0);

  if (name === 'unchanged control') expect(record.verdict).toBe('cant-tell');
});

it('compares equal declared budgets through actual recording storage and independent validation', async () => {
  const records = await compareBodySequences(mj, ['horizontal arm'], 'scratch/body-sequence-comparison-test.json');
  const [accumulated, fixed, single] = records;

  expect(records.map((record) => record.limits)).toEqual([accumulated.limits, accumulated.limits, accumulated.limits]);
  expect(accumulated.rounds).toBeGreaterThan(0);
  expect(accumulated.heldOutRms).not.toBeNull();
  expect(fixed.heldOutRms).not.toBeNull();
  expect(accumulated.heldOutRms).toBeLessThan(1e-6);
  expect(fixed.heldOutRms).toBeLessThan(1e-6);
  expect(single.verdict).toBe('cant-tell');
  expect(records.every((record) => record.retainedBytes > 0)).toBe(true);
  expect(records.every((record) => record.physicsSteps <= record.limits.physicsSteps)).toBe(true);
  expect(
    records.every((record) => record.preparationPhysicsSteps > 0 && record.completeMs >= record.preparationMs),
  ).toBe(true);
});
