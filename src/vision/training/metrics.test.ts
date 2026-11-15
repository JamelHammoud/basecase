import { describe, expect, it } from 'vitest';
import { evaluateTraining } from './metrics';
import { metricReport, metricResult as result, metricSet, metricSnapshot, metricTask } from './metricsFixtures';

describe('known vision predictions', () => {
  it('scores ranked detection AP with duplicate and missing detections per class', async () => {
    const report = await metricReport();

    expect(report.metrics.primary).toBe(1);
    expect(report.metrics.perClass[0]).toMatchObject({
      support: 1,
      truePositive: 1,
      falsePositive: 0,
      falseNegative: 0,
      score: 1,
    });
    expect(report.metrics.inference).toEqual({ samples: 1, meanMs: 4, p95Ms: 4, modelBytes: 1024 });

    const missed = await metricReport(
      'detect',
      result({ detections: [{ label: 'Plate', score: 1, box: [0, 0, 1, 1] }] }),
    );

    expect(missed.metrics.primary).toBe(0);
    expect(missed.metrics.perClass[0]).toMatchObject({ falseNegative: 1, failureRate: 1 });
    expect(missed.metrics.perClass[1]).toMatchObject({ falsePositive: 1, failureRate: 1 });

    const duplicate = await metricReport(
      'detect',
      result({
        detections: [
          { label: 'Cup', score: 1, box: [0, 0, 1, 1] },
          { label: 'Cup', score: 0.8, box: [0, 0, 1, 1] },
        ],
      }),
    );

    expect(duplicate.metrics.primary).toBe(1);
    expect(duplicate.metrics.perClass[0]).toMatchObject({ falsePositive: 1, failureRate: 0.5 });
  });

  it('averages box AP across IoU .50 through .95', async () => {
    const report = await metricReport(
      'detect',
      result({ detections: [{ label: 'Cup', score: 1, box: [0, 0, 0.75, 1] }] }),
    );

    expect(report.metrics.primary).toBeCloseTo(0.6);
  });

  it('uses instance mask IoU rather than box IoU', async () => {
    const report = await metricReport(
      'segment',
      result({
        detections: [
          {
            label: 'Cup',
            score: 1,
            box: [0, 0, 1, 1],
            mask: { width: 2, height: 2, values: new Uint8Array([1, 0, 0, 0]) },
          },
        ],
      }),
    );

    expect(report.metrics.primary).toBe(0);

    const perfect = await metricReport(
      'segment',
      result({
        detections: [
          {
            label: 'Cup',
            score: 1,
            box: [0, 0, 1, 1],
            mask: { width: 1, height: 1, values: new Uint8Array([1]) },
          },
        ],
      }),
    );

    expect(perfect.metrics.primary).toBe(1);
  });

  it('measures visible named keypoints, including misses, with declared PCK tolerance', async () => {
    const report = await metricReport(
      'keypoints',
      result({ detections: [{ label: 'Cup', score: 1, box: [0, 0, 1, 1], keypoints: [[0.5, 0.5]] }] }),
    );

    expect(report.metrics.primary).toBe(1);

    const missed = await metricReport('keypoints', result({ detections: [] }));

    expect(missed.metrics.primary).toBe(0);
    expect(missed.metrics.perClass[0].keypoints).toEqual({ visible: 1, correct: 0 });
  });

  it('measures top-one classification and per-class confusion', async () => {
    const report = await metricReport(
      'classify',
      result({
        detections: [],
        classes: [
          { label: 'Plate', score: 0.8 },
          { label: 'Cup', score: 0.2 },
        ],
      }),
    );

    expect(report.metrics.primary).toBe(0);
    expect(report.metrics.perClass[0]).toMatchObject({ falseNegative: 1, failureRate: 1 });
    expect(report.metrics.perClass[1]).toMatchObject({ falsePositive: 1, failureRate: 1 });
  });
});

describe('frozen real test evaluation', () => {
  it('produces a checkpoint report without eligible real test images', async () => {
    const set = metricSet();
    const report = await evaluateTraining({
      task: metricTask(),
      sets: [set],
      snapshot: await metricSnapshot(set),
      realSourceIds: [],
      predictions: [],
      modelHash: 'b'.repeat(64),
      modelBytes: 1,
    });

    expect(report.realTest).toEqual([]);
    expect(report.metrics.primary).toBeNull();
  });

  it('refuses changed frozen labels and incomplete or repeated prediction coverage', async () => {
    const set = metricSet();
    const input = {
      task: metricTask(),
      sets: [set],
      snapshot: await metricSnapshot(set),
      realSourceIds: ['try:real'],
      predictions: [],
      modelHash: 'b'.repeat(64),
      modelBytes: 1,
    };

    await expect(evaluateTraining(input)).rejects.toThrow('prediction');
    set.frames[0].annotations[0].classId = 2;
    await expect(evaluateTraining(input)).rejects.toThrow('frozen');
  });

  it('refuses malformed costs and task-inappropriate metrics', async () => {
    const set = metricSet();
    const input = {
      task: metricTask(),
      sets: [set],
      snapshot: await metricSnapshot(set),
      realSourceIds: ['try:real'],
      predictions: [{ frameSetId: set.id, frameId: 'one', result: result(), inferenceMs: NaN }],
      modelHash: 'b'.repeat(64),
      modelBytes: 1,
    };

    await expect(evaluateTraining(input)).rejects.toThrow('cost');
    await expect(evaluateTraining({ ...input, task: { ...input.task, metric: 'accuracy' } })).rejects.toThrow('metric');
  });
});
