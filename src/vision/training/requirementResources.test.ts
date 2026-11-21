import { expect, it } from 'vitest';
import { metricResult, metricSet, metricTask, metricSnapshot } from './metricsFixtures';
import { evaluateTraining, evaluatedRows } from './metrics';
import { requirementMeasurements } from './requirementEvaluation';
import type { TrainingEvaluationInput } from './types';

it.each([4, 1000])(
  'measures %s images with shared rows, bounded retained indices and no content reads',
  async (count) => {
    const set = metricSet();

    set.conditions = ['night', 'glare'];
    set.frames = Array.from({ length: count }, (_, index) => ({
      ...structuredClone(set.frames[0]),
      id: `frame-${index}`,
      conditions: ['night', 'glare'],
    }));

    const task = {
      ...metricTask(),
      requirements: ['night', 'glare'].map((name) => ({
        group: { kind: 'condition' as const, name },
        metric: 'box-map' as const,
        minScore: 1,
        minRealTest: count,
        maxRegression: 0,
      })),
    };
    const input: TrainingEvaluationInput = {
      task,
      sets: [set],
      snapshot: await metricSnapshot(set),
      realSourceIds: ['try:real'],
      predictions: set.frames.map((frame) => ({
        frameSetId: set.id,
        frameId: frame.id,
        result: metricResult(),
        inferenceMs: 1,
      })),
      modelHash: 'b'.repeat(64),
      modelBytes: 100,
    };
    const baseline = await evaluateTraining({ ...input, task: metricTask() });
    const measured = await evaluateTraining(input);
    const retainedBytes = Buffer.byteLength(JSON.stringify(measured)) - Buffer.byteLength(JSON.stringify(baseline));

    expect(measured.metrics).toEqual(baseline.metrics);
    expect(measured.evidence?.requirements?.every((row) => row.support === count && row.score === 1)).toBe(true);
    expect(retainedBytes).toBeLessThan(24 * 1024);
    expect(measured.evidence?.requirements?.map((row) => row.indices)).toEqual([
      Array.from({ length: count }, (_, index) => index),
      Array.from({ length: count }, (_, index) => index),
    ]);

    const rows = await evaluatedRows(input, baseline.realTest);

    rows[0].frame.width = 4096;
    rows[0].frame.height = 4096;

    expect(
      requirementMeasurements({ task, rows, realTest: baseline.realTest, snapshot: measured.snapshot }).every(
        (row) => row.reason === 'resources' && row.score === null,
      ),
    ).toBe(true);
  },
);
