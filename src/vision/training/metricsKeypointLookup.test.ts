import { describe, expect, it } from 'vitest';
import type { ImageClass } from '../frameSet';
import { objectMetrics, type EvaluatedFrame } from './metricsObjects';
import { metricResult, metricSet, metricTask } from './metricsFixtures';
import type { TrainingTask } from './types';

function fixture(seed: number, count = 24) {
  const classes: ImageClass[] = Array.from({ length: 2 + (seed % 5) }, (_, id) => ({
    id,
    name: `Class ${id}`,
    keypoints: Array.from({ length: 1 + ((seed + id) % 7) }, (_, index) => `point-${(index + id) % 5}`),
  }));
  const task: TrainingTask = { ...metricTask('keypoints'), classes, keypointTolerance: (seed % 4) / 10 };
  const rows: EvaluatedFrame[] = Array.from({ length: count }, (_, index) => {
    const frame = metricSet().frames[0];
    const category = classes[index % classes.length];
    const keypoints = Array.from({ length: 6 }, (_, point) => ({
      name: `point-${point}`,
      x: ((seed + point) % 4) / 2,
      y: ((seed + index) % 4) / 2,
      visible: (index + point) % 4 !== 0,
    }));
    const predicted = Array.from({ length: (index + seed) % 7 }, (_, point): [number, number] => [
      ((index + point) % 4) / 4,
      ((seed + point) % 4) / 4,
    ]);

    frame.annotations[0] = { ...frame.annotations[0], classId: category.id, keypoints };

    return {
      frame,
      result: metricResult({
        detections:
          index % 7 === 0 ? [] : [{ label: category.name, box: [0, 0, 1, 1], score: 0.9, keypoints: predicted }],
      }),
    };
  });

  return { rows, task };
}

function referenceCounts(rows: EvaluatedFrame[], task: TrainingTask, classId: number) {
  let visible = 0;
  let correct = 0;

  for (const { frame, result } of rows) {
    const annotation = frame.annotations[0];

    if (annotation.classId !== classId) continue;

    const names = [...new Set(task.classes.flatMap((category) => category.keypoints ?? []))];
    const tolerance = (task.keypointTolerance ?? 0.1) * Math.hypot(annotation.box[2], annotation.box[3]);

    for (const point of annotation.keypoints.filter((item) => item.visible)) {
      const predicted = result.detections[0]?.keypoints?.[names.indexOf(point.name)];

      visible++;
      correct += Number(
        !!predicted &&
          Math.hypot(predicted[0] * frame.width - point.x, predicted[1] * frame.height - point.y) <= tolerance,
      );
    }
  }

  return { visible, correct };
}

function expectCounts(rows: EvaluatedFrame[], task: TrainingTask) {
  const reports = objectMetrics(rows, task);

  for (const report of reports) {
    const counts = referenceCounts(rows, task, report.classId);

    expect(report.keypoints).toEqual(counts);
    expect(report.score).toBe(counts.visible ? counts.correct / counts.visible : null);
  }

  return reports;
}

describe('keypoint evaluation lookup', () => {
  it('preserves first-name order across classes, duplicates, invisible points and missing predictions', () => {
    for (let seed = 0; seed < 80; seed++) {
      const { rows, task } = fixture(seed);
      const before = structuredClone({ rows, task });

      expectCounts(rows, task);
      expect({ rows, task }).toEqual(before);
    }
  });

  it('rebuilds after name-order, tolerance and prediction edits without sharing reports', () => {
    const { rows, task } = fixture(9);
    const first = expectCounts(rows, task);
    const before = structuredClone(first);

    task.classes.reverse();
    task.classes[0].keypoints = ['point-4', 'point-1', 'point-4'];
    task.keypointTolerance = 0.5;
    rows[1].result.detections[0].keypoints = [[0, 0]];
    expectCounts(rows, task);
    expect(first).toEqual(before);
    expectCounts(rows, { ...task, classes: [{ id: 0, name: 'Class 0' }] });
    expect(objectMetrics([], task).every((report) => report.score === null)).toBe(true);
  });

  it('includes the tolerance boundary and excludes a point just beyond it', () => {
    const { rows, task } = fixture(0, 1);
    const row = rows[0];

    task.classes = [{ id: 0, name: 'Class 0', keypoints: ['a', 'b', 'hidden'] }];
    task.keypointTolerance = 0.1;
    row.frame.annotations[0].box = [0, 0, 3, 4];
    row.frame.annotations[0].keypoints = [
      { name: 'a', x: 0, y: 0, visible: true },
      { name: 'b', x: 0, y: 0, visible: true },
      { name: 'hidden', x: 0, y: 0, visible: false },
    ];
    row.result.detections = [
      {
        label: 'Class 0',
        score: 1,
        box: [0, 0, 1.5, 2],
        keypoints: [
          [0.25, 0],
          [0.250001, 0],
        ],
      },
    ];
    expect(objectMetrics(rows, task)[0].keypoints).toEqual({ visible: 2, correct: 1 });
    delete task.keypointTolerance;
    expect(objectMetrics(rows, task)[0].keypoints).toEqual({ visible: 2, correct: 1 });
  });

  it.each([300, 600])('bounds class name-list reads while scoring %i objects', (count) => {
    const { rows, task } = fixture(1, count);
    let reads = 0;

    for (const category of task.classes) {
      const names = category.keypoints;

      Object.defineProperty(category, 'keypoints', {
        get: () => {
          reads++;

          return names;
        },
      });
    }

    objectMetrics(rows, task);
    expect(reads).toBe(task.classes.length * 2);
  });
});
