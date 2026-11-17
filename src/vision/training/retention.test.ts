import { describe, expect, it } from 'vitest';
import { metricReport, metricResult, metricSet, metricSnapshot, metricTask } from './metricsFixtures';
import { evaluateTraining } from './metrics';
import { compareTraining } from './retention';

const identity = { id: 'attempt-1', at: '2026-11-15T00:00:00Z', history: [] };

describe('retaining a vision candidate', () => {
  it('retains only strict improvement on the exact same frozen real test', async () => {
    const candidate = await metricReport();
    const incumbent = await metricReport('detect', metricResult({ detections: [] }));
    const comparison = compareTraining({ ...identity, candidate, incumbent });

    expect(comparison).toMatchObject({ status: 'retained', reason: 'improved' });
    expect(comparison.attempt).toMatchObject({ candidateScore: 1, incumbentScore: 0, previousAttempts: 0 });
    expect(compareTraining({ ...identity, candidate, incumbent: candidate })).toMatchObject({
      status: 'checkpoint',
      reason: 'no-improvement',
    });
  });

  it('refuses a changed test image even when the report hash is copied', async () => {
    const candidate = await metricReport();
    const incumbent = await metricReport('detect', metricResult({ detections: [] }));

    incumbent.realTest[0].content = 'f'.repeat(64);
    incumbent.snapshot[0].content = 'f'.repeat(64);
    expect(compareTraining({ ...identity, candidate, incumbent })).toMatchObject({
      status: 'checkpoint',
      reason: 'different-test',
    });
  });

  it('keeps a checkpoint without an evaluated incumbent or eligible real test', async () => {
    const candidate = await metricReport();

    expect(compareTraining({ ...identity, candidate })).toMatchObject({ status: 'checkpoint', reason: 'no-incumbent' });

    const set = metricSet();
    const checkpoint = await evaluateTraining({
      task: metricTask(),
      sets: [set],
      snapshot: await metricSnapshot(set),
      realSourceIds: [],
      predictions: [],
      modelHash: 'b'.repeat(64),
      modelBytes: 1,
    });

    expect(compareTraining({ ...identity, candidate: checkpoint, incumbent: candidate })).toMatchObject({
      status: 'checkpoint',
      reason: 'no-real-test',
    });
  });

  it.each(['maxInferenceMs', 'maxModelBytes', 'maxClassFailureRate'] as const)(
    'enforces the recorded %s limit',
    async (limit) => {
      const candidate = await metricReport(
        'detect',
        metricResult({
          detections: [
            { label: 'Cup', score: 1, box: [0, 0, 1, 1] },
            { label: 'Cup', score: 0.8, box: [0, 0, 1, 1] },
          ],
        }),
      );
      const incumbent = await metricReport('detect', metricResult({ detections: [] }));

      candidate.task.limits = { [limit]: limit === 'maxModelBytes' ? 512 : 0 };
      incumbent.task = structuredClone(candidate.task);

      expect(compareTraining({ ...identity, candidate, incumbent })).toMatchObject({
        status: 'checkpoint',
        reason: 'limits',
      });
    },
  );

  it('refuses metric changes and relaxed limits', async () => {
    const candidate = await metricReport();
    const incumbent = structuredClone(candidate);

    incumbent.task.limits = { maxModelBytes: 512 };
    expect(compareTraining({ ...identity, candidate, incumbent })).toMatchObject({
      status: 'checkpoint',
      reason: 'different-task',
    });
  });

  it('appends every attempt and exposes repeated tuning against the same test', async () => {
    const candidate = await metricReport();
    const first = compareTraining({ ...identity, candidate });
    const second = compareTraining({ ...identity, id: 'attempt-2', candidate, history: first.attempts });

    expect(first.attempts).toHaveLength(1);
    expect(second.attempts).toHaveLength(2);
    expect(second.attempt.previousAttempts).toBe(1);
    expect(second.attempts[0]).toEqual(first.attempt);
    expect(() => compareTraining({ ...identity, candidate, history: first.attempts })).toThrow('attempt');
  });

  it('rejects non-finite report scores and costs', async () => {
    const candidate = await metricReport();
    const incumbent = await metricReport();

    candidate.metrics.primary = NaN;
    expect(() => compareTraining({ ...identity, candidate, incumbent })).toThrow('evaluation');
  });

  it('rejects fabricated aggregate scores and test membership', async () => {
    const candidate = await metricReport();
    const inflated = structuredClone(candidate);

    inflated.metrics.primary = 0.8;
    expect(() => compareTraining({ ...identity, candidate: inflated })).toThrow('evaluation');

    const altered = structuredClone(candidate);

    altered.realTest[0].hash = 'd'.repeat(64);
    expect(() => compareTraining({ ...identity, candidate: altered })).toThrow('evaluation');

    const wrongCount = structuredClone(candidate);

    wrongCount.metrics.inference.samples = 2;
    expect(() => compareTraining({ ...identity, candidate: wrongCount })).toThrow('evaluation');
  });
});

describe('saved condition membership', () => {
  it.each(['snapshot', 'realTest'] as const)('rejects malformed saved %s group membership', async (inventory) => {
    const candidate = await metricReport();
    const groups = candidate.snapshot[0].groups!;
    const malformed = [
      { ...groups, declared: Array.from({ length: 33 }, (_, index) => `condition-${index}`) },
      { ...groups, declared: ['night'], labels: ['day'] },
      { ...groups, camera: '' },
      { ...groups, declared: ['x'.repeat(65)] },
      { ...groups, declared: ['night'], labels: ['night', 'night'] },
      {
        ...groups,
        declared: Array.from({ length: 9 }, (_, index) => `condition-${index}`),
        labels: Array.from({ length: 9 }, (_, index) => `condition-${index}`),
      },
    ];

    for (const membership of malformed) {
      const report = structuredClone(candidate);

      report[inventory][0].groups = membership;
      expect(() => compareTraining({ ...identity, candidate: report })).toThrow('evaluation');
    }
  });

  it('bounds the complete inventory when saved evidence binds image groups', async () => {
    const candidate = await metricReport();

    candidate.snapshot.push(
      ...Array.from({ length: 10_000 }, (_, index) => ({
        ...candidate.snapshot[0],
        frameId: `training-${index}`,
        split: 'train' as const,
      })),
    );
    expect(() => compareTraining({ ...identity, candidate })).toThrow('evaluation');
  });
});
