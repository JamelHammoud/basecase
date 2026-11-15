import { describe, expect, it } from 'vitest';
import { evaluateTraining } from './metrics';
import { metricResult, metricSet, metricSnapshot, metricTask } from './metricsFixtures';

describe('merged keypoint evaluation', () => {
  it('indexes different class landmarks through the stable global output union', async () => {
    const set = metricSet();
    const first = set.frames[0].annotations[0];

    set.classes = [
      { id: 1, name: 'Cup', keypoints: ['tip'] },
      { id: 2, name: 'Plate', keypoints: ['grip'] },
    ];
    set.frames[0].annotations = [
      { ...first, keypoints: [{ name: 'tip', x: 1, y: 1, visible: true }] },
      { ...first, instance: 'plate', classId: 2, keypoints: [{ name: 'grip', x: 0.5, y: 0.5, visible: true }] },
    ];

    const report = await evaluateTraining({
      task: { ...metricTask('keypoints'), classes: set.classes },
      sets: [set],
      snapshot: await metricSnapshot(set),
      realSourceIds: ['try:real'],
      predictions: [
        {
          frameSetId: set.id,
          frameId: 'one',
          inferenceMs: 4,
          result: metricResult({
            detections: [
              {
                label: 'Cup',
                score: 1,
                box: [0, 0, 1, 1],
                keypoints: [
                  [0.5, 0.5],
                  [0, 0],
                ],
              },
              {
                label: 'Plate',
                score: 1,
                box: [0, 0, 1, 1],
                keypoints: [
                  [0, 0],
                  [0.25, 0.25],
                ],
              },
            ],
          }),
        },
      ],
      modelHash: 'b'.repeat(64),
      modelBytes: 1024,
    });

    expect(report.metrics.primary).toBe(1);
    expect(report.metrics.perClass.map((category) => category.keypoints)).toEqual([
      { visible: 1, correct: 1 },
      { visible: 1, correct: 1 },
    ]);
  });

  it('accepts original named-point subsets when the same class merges more landmarks', async () => {
    const set = metricSet();
    const task = metricTask('keypoints');

    task.classes[0].keypoints = ['handle', 'center'];

    const report = await evaluateTraining({
      task,
      sets: [set],
      snapshot: await metricSnapshot(set),
      realSourceIds: ['try:real'],
      predictions: [
        {
          frameSetId: set.id,
          frameId: 'one',
          inferenceMs: 4,
          result: metricResult({
            detections: [
              {
                label: 'Cup',
                score: 1,
                box: [0, 0, 1, 1],
                keypoints: [
                  [0, 0],
                  [0.5, 0.5],
                ],
              },
            ],
          }),
        },
      ],
      modelHash: 'b'.repeat(64),
      modelBytes: 1024,
    });

    expect(report.metrics.primary).toBe(1);
    expect(set.classes[0].keypoints).toEqual(['center']);
    expect(report.metrics.perClass[0].keypoints).toEqual({ visible: 1, correct: 1 });
  });

  it('refuses source landmark names omitted from the declared merged class', async () => {
    const set = metricSet();
    const task = metricTask('keypoints');

    task.classes[0].keypoints = ['handle'];

    await expect(
      evaluateTraining({
        task,
        sets: [set],
        snapshot: await metricSnapshot(set),
        realSourceIds: ['try:real'],
        predictions: [{ frameSetId: set.id, frameId: 'one', inferenceMs: 4, result: metricResult() }],
        modelHash: 'b'.repeat(64),
        modelBytes: 1024,
      }),
    ).rejects.toThrow('classes differ');
  });
});
