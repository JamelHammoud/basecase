import { describe, expect, it } from 'vitest';
import { evaluateTraining } from './metrics';
import { metricReport, metricResult, metricSet, metricSnapshot, metricTask } from './metricsFixtures';
import type { TrainingEvaluationInput } from './types';

async function evaluationInput(): Promise<TrainingEvaluationInput> {
  const set = metricSet();

  return {
    task: metricTask(),
    sets: [set],
    snapshot: await metricSnapshot(set),
    realSourceIds: ['try:real'],
    predictions: [{ frameSetId: set.id, frameId: 'one', result: metricResult(), inferenceMs: 4 }],
    modelHash: 'b'.repeat(64),
    modelBytes: 1024,
  };
}

describe('ranked vision evaluation boundaries', () => {
  it('penalizes a higher-scored false positive before a correct detection', async () => {
    const report = await metricReport(
      'detect',
      metricResult({
        detections: [
          { label: 'Cup', score: 1, box: [0, 0, 0.1, 0.1] },
          { label: 'Cup', score: 0.8, box: [0, 0, 1, 1] },
        ],
      }),
    );

    expect(report.metrics.primary).toBeCloseTo(0.5);
  });

  it('uses class names to remap local annotation IDs without changing frozen labels', async () => {
    const input = await evaluationInput();

    input.task.classes = [{ id: 9, name: 'Cup', keypoints: ['center'] }];

    const report = await evaluateTraining(input);

    expect(report.metrics.primary).toBe(1);
    expect(report.metrics.perClass[0].classId).toBe(9);
    expect(input.sets[0].frames[0].annotations[0].classId).toBe(1);
  });

  it('keeps visible keypoint error within each class failure rate', async () => {
    const report = await metricReport(
      'keypoints',
      metricResult({
        detections: [
          {
            label: 'Cup',
            score: 1,
            box: [0, 0, 1, 1],
            keypoints: [[0, 0]],
          },
        ],
      }),
    );

    expect(report.metrics.primary).toBe(0);
    expect(report.metrics.perClass[0].failureRate).toBe(1);
  });

  it('uses declared PCK tolerance and excludes invisible keypoints', async () => {
    const input = await evaluationInput();

    input.task = { ...metricTask('keypoints'), keypointTolerance: 0.01 };
    input.predictions[0].result.detections[0].keypoints = [[0.55, 0.5]];

    expect((await evaluateTraining(input)).metrics.primary).toBe(0);
    input.task.keypointTolerance = 0.1;
    expect((await evaluateTraining(input)).metrics.primary).toBe(1);
    input.sets[0].frames[0].annotations[0].keypoints[0].visible = false;
    input.snapshot = await metricSnapshot(input.sets[0]);

    const invisible = await evaluateTraining(input);

    expect(invisible.metrics.primary).toBeNull();
    expect(invisible.metrics.perClass[0].score).toBeNull();
  });

  it('reports no task metric for background-only detection test images', async () => {
    const input = await evaluationInput();

    input.sets[0].frames[0].annotations = [];
    input.snapshot = await metricSnapshot(input.sets[0]);
    input.predictions[0].result.detections = [];

    expect((await evaluateTraining(input)).metrics.primary).toBeNull();
  });

  it('refuses same-source leakage across frozen splits', async () => {
    const input = await evaluationInput();

    input.snapshot.push({ ...input.snapshot[0], frameId: 'another', split: 'train' });
    await expect(evaluateTraining(input)).rejects.toThrow('one frozen split');
  });

  it('refuses repeated and additional prediction rows', async () => {
    const input = await evaluationInput();

    input.predictions.push(input.predictions[0]);
    await expect(evaluateTraining(input)).rejects.toThrow('one frozen sample');
    input.predictions[1] = { ...input.predictions[0], frameId: 'another' };
    await expect(evaluateTraining(input)).rejects.toThrow('only for');
  });

  it('refuses suggested test labels and ambiguous classification targets', async () => {
    const input = await evaluationInput();

    input.sets[0].frames[0].annotations[0].review = 'suggested';
    input.snapshot = await metricSnapshot(input.sets[0]);
    await expect(evaluateTraining(input)).rejects.toThrow('Review suggested');
    input.sets[0].frames[0].annotations = [];
    input.snapshot = await metricSnapshot(input.sets[0]);
    input.task = metricTask('classify');
    await expect(evaluateTraining(input)).rejects.toThrow('one labeled class');
  });

  it('refuses non-finite geometry and mismatched image dimensions', async () => {
    const input = await evaluationInput();

    input.predictions[0].result.detections[0].box[0] = NaN;
    await expect(evaluateTraining(input)).rejects.toThrow('geometry');
    input.predictions[0].result = metricResult({ width: 4 });
    await expect(evaluateTraining(input)).rejects.toThrow('matching prediction');
  });

  it('records nearest-rank p95 and mean inference cost for the complete test', async () => {
    const input = await evaluationInput();
    const first = input.sets[0].frames[0];

    input.sets[0].frames = Array.from({ length: 20 }, (_, index) => ({ ...first, id: `frame-${index}` }));
    input.snapshot = await metricSnapshot(input.sets[0]);
    input.predictions = input.sets[0].frames.map((frame, index) => ({
      frameSetId: 'images',
      frameId: frame.id,
      result: metricResult(),
      inferenceMs: index + 1,
    }));

    expect((await evaluateTraining(input)).metrics.inference).toEqual({
      samples: 20,
      meanMs: 10.5,
      p95Ms: 19,
      modelBytes: 1024,
    });
  });
});
