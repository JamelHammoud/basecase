import { describe, expect, it } from 'vitest';
import { classificationMetrics } from './metricsClassification';
import { metricResult, metricSet, metricTask } from './metricsFixtures';
import type { EvaluatedFrame } from './metricsObjects';
import type { TrainingTask } from './types';

function scannedMetrics(rows: EvaluatedFrame[], task: TrainingTask) {
  const pairs = rows.map(({ frame, result }) => ({
    actual: frame.annotations[0].classId,
    predicted: [...(result.classes ?? [])].sort((a, b) => b.score - a.score)[0]?.label,
  }));

  return task.classes.map((category) => {
    const support = pairs.filter((pair) => pair.actual === category.id).length;
    const truePositive = pairs.filter((pair) => pair.actual === category.id && pair.predicted === category.name).length;
    const falsePositive = pairs.filter(
      (pair) => pair.actual !== category.id && pair.predicted === category.name,
    ).length;
    const falseNegative = support - truePositive;

    return {
      classId: category.id,
      name: category.name,
      support,
      truePositive,
      falsePositive,
      falseNegative,
      failureRate: (falsePositive + falseNegative) / Math.max(1, support + falsePositive),
      score: support ? truePositive / support : null,
    };
  });
}

function image(actual: number, classes?: { label: string; score: number }[]): EvaluatedFrame {
  const frame = metricSet().frames[0];

  return {
    frame: { ...frame, annotations: frame.annotations.map((annotation) => ({ ...annotation, classId: actual })) },
    result: metricResult({ detections: [], classes }),
  };
}

function taskWithClasses(count: number): TrainingTask {
  return {
    ...metricTask('classify'),
    classes: Array.from({ length: count }, (_, i) => ({ id: i * 7, name: `Class ${i}` })),
  };
}

function generatedRows(task: TrainingTask, seed: number) {
  return Array.from({ length: seed * 3 }, (_, index) => {
    const actual = task.classes[(index * 13 + seed) % task.classes.length].id;
    const scores = task.classes.map(({ name }, category) => ({
      label: name,
      score: ((index * 17 + category * 7 + seed) % 11) / 10,
    }));
    const row = image(actual, scores);

    if (index % 5 === 0) row.result.classes = [];

    if (index % 7 === 0) delete row.result.classes;

    if (index % 3 === 0) row.frame.annotations.push({ ...row.frame.annotations[0], instance: 'second' });

    return row;
  });
}

function freezeRows(rows: EvaluatedFrame[], task: TrainingTask) {
  rows.forEach(({ frame, result }) => {
    frame.annotations.forEach(Object.freeze);
    result.classes?.forEach(Object.freeze);
    Object.freeze(frame.annotations);
    Object.freeze(result.classes);
    Object.freeze(frame);
    Object.freeze(result);
  });
  task.classes.forEach(Object.freeze);
  Object.freeze(task.classes);
}

describe('classification confusion counts', () => {
  it('matches ordered scans over sparse ids, absent predictions, repeated labels and tied scores', () => {
    for (let seed = 0; seed < 120; seed++) {
      const task = taskWithClasses((seed % 17) + 1);
      const rows = generatedRows(task, seed);
      const expected = scannedMetrics(rows, task);

      freezeRows(rows, task);
      expect(classificationMetrics(rows, task)).toEqual(expected);
    }
  });

  it('keeps first score ties and counts misses separately from false positives for unsupported classes', () => {
    const task = taskWithClasses(3);
    const rows = [
      image(0, [
        { label: 'Class 0', score: 0.5 },
        { label: 'Class 1', score: 0.5 },
      ]),
      image(0, [{ label: 'Class 1', score: 1 }]),
      image(0),
    ];

    expect(classificationMetrics(rows, task)).toEqual([
      {
        classId: 0,
        name: 'Class 0',
        support: 3,
        truePositive: 1,
        falsePositive: 0,
        falseNegative: 2,
        failureRate: 2 / 3,
        score: 1 / 3,
      },
      {
        classId: 7,
        name: 'Class 1',
        support: 0,
        truePositive: 0,
        falsePositive: 1,
        falseNegative: 0,
        failureRate: 1,
        score: null,
      },
      {
        classId: 14,
        name: 'Class 2',
        support: 0,
        truePositive: 0,
        falsePositive: 0,
        falseNegative: 0,
        failureRate: 0,
        score: null,
      },
    ]);
  });

  it('rebuilds counts after image, prediction and task edits without changing retained reports', () => {
    const task = taskWithClasses(3);
    const rows = generatedRows(task, 11);
    const first = classificationMetrics(rows, task);
    const saved = structuredClone(first);

    rows[0].frame.annotations = [{ ...rows[0].frame.annotations[0], classId: 7 }];
    rows[0].result.classes = [{ label: 'Class 1', score: 1 }];
    rows[1].result.classes?.reverse();
    task.classes.reverse();
    task.classes[0].name = 'Renamed';
    expect(classificationMetrics(rows, task)).toEqual(scannedMetrics(rows, task));
    expect(first).toEqual(saved);
    expect(classificationMetrics([], task).every((category) => category.score === null)).toBe(true);
    expect(classificationMetrics(rows, task)).not.toBe(first);
  });

  it('refuses unlabelled or mixed-class images even after valid images', () => {
    const task = taskWithClasses(2);
    const valid = image(0);
    const empty = image(0);
    const mixed = image(0);

    empty.frame.annotations = [];
    mixed.frame.annotations.push({ ...mixed.frame.annotations[0], classId: 7 });

    for (const rejected of [empty, mixed]) {
      expect(() => classificationMetrics([valid, rejected], task)).toThrow(
        'Classification test images need one labeled class.',
      );
    }

    expect(classificationMetrics([valid], task)).toEqual(scannedMetrics([valid], task));
  });

  it.each([300, 600])('reads each declared class once for %i images and classes', (size) => {
    const task = taskWithClasses(size);
    const rows = Array.from({ length: size }, (_, i) => image(i * 7, [{ label: `Class ${i}`, score: 1 }]));
    let reads = 0;

    task.classes = task.classes.map(({ id, name }) => ({
      get id() {
        reads++;

        return id;
      },
      get name() {
        reads++;

        return name;
      },
    }));

    const expected = scannedMetrics(rows, task);

    expect(reads).toBe(4 * size * size + 2 * size);
    reads = 0;
    expect(classificationMetrics(rows, task)).toEqual(expected);
    expect(reads).toBe(2 * size);
  });
});
