import { describe, expect, it } from 'vitest';
import type { ImageAnnotation, TrainingFrame } from '../frameSet';
import { decodeMask, encodeMask } from '../imageMasks';
import type { VisionDetection } from '../types';
import { objectMetrics, type EvaluatedFrame } from './metricsObjects';
import { metricResult, metricSet, metricTask } from './metricsFixtures';
import type { TrainingTask } from './types';

function previousOverlap(
  annotation: ImageAnnotation,
  detection: VisionDetection,
  frame: TrainingFrame,
  segment: boolean,
) {
  if (!segment) {
    const a = annotation.box.map((value, index) => value / (index % 2 ? frame.height : frame.width));
    const b = detection.box;
    const intersection =
      Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0])) *
      Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
    const union = a[2] * a[3] + b[2] * b[3] - intersection;

    return union > 0 ? intersection / union : 0;
  }

  if (!detection.mask) return 0;

  const mask = detection.mask;
  const truth = decodeMask(annotation.mask);
  let intersection = 0;
  let union = 0;

  for (let index = 0; index < frame.width * frame.height; index++) {
    const x = index % frame.width;
    const y = Math.floor(index / frame.width);
    const column = Math.min(mask.width - 1, Math.floor(((x + 0.5) * mask.width) / frame.width));
    const row = Math.min(mask.height - 1, Math.floor(((y + 0.5) * mask.height) / frame.height));
    const expected = truth[index] !== 0;
    const actual = mask.values[row * mask.width + column] !== 0;

    intersection += Number(expected && actual);
    union += Number(expected || actual);
  }

  return union > 0 ? intersection / union : 0;
}

function referencePrecision(matches: number[], support: number) {
  let correct = 0;
  const curve = matches.map((match, index) => {
    correct += Number(match >= 0);

    return { recall: correct / support, precision: correct / (index + 1) };
  });
  let sum = 0;

  for (let sample = 0; sample <= 100; sample++)
    sum += Math.max(0, ...curve.filter((point) => point.recall >= sample / 100).map((point) => point.precision));

  return sum / 101;
}

function referenceReports(rows: EvaluatedFrame[], task: TrainingTask) {
  return task.classes.map((category) => {
    const support = rows.reduce(
      (sum, { frame }) => sum + frame.annotations.filter((annotation) => annotation.classId === category.id).length,
      0,
    );
    const ranked = rows
      .flatMap(({ frame, result }, row) =>
        result.detections
          .filter((detection) => detection.label === category.name)
          .map((detection) => ({
            row,
            score: detection.score,
            overlaps: frame.annotations.map((annotation) =>
              previousOverlap(annotation, detection, frame, task.kind === 'segment'),
            ),
          })),
      )
      .sort((a, b) => b.score - a.score);
    const atThreshold = (threshold: number) => {
      const used = rows.map(() => new Set<number>());

      return ranked.map((item) => {
        let match = -1;
        let best = threshold;

        for (let index = 0; index < item.overlaps.length; index++) {
          if (
            rows[item.row].frame.annotations[index].classId !== category.id ||
            used[item.row].has(index) ||
            item.overlaps[index] < best
          )
            continue;

          match = index;
          best = item.overlaps[index];
        }

        used[item.row].add(match);

        return match;
      });
    };
    const truePositive = atThreshold(0.5).filter((match) => match >= 0).length;
    const falsePositive = ranked.length - truePositive;
    const falseNegative = support - truePositive;
    const scores = Array.from({ length: 10 }, (_, index) =>
      referencePrecision(atThreshold((50 + 5 * index) / 100), support),
    );

    return {
      classId: category.id,
      name: category.name,
      support,
      truePositive,
      falsePositive,
      falseNegative,
      failureRate: (falsePositive + falseNegative) / Math.max(1, support + falsePositive),
      score: support ? scores.reduce((sum, score) => sum + score, 0) / 10 : null,
    };
  });
}

function fixture(seed: number, kind: 'detect' | 'segment') {
  const task = metricTask(kind);
  const rows: EvaluatedFrame[] = Array.from({ length: 1 + (seed % 3) }, (_, row) => {
    const frame = metricSet().frames[0];
    const width = 1 + ((seed + row) % 9);
    const height = 1 + ((seed * 3 + row) % 7);
    const annotations = Array.from({ length: (seed + row) % 7 }, (_, index): ImageAnnotation => ({
      ...frame.annotations[0],
      instance: `object-${index}`,
      classId: 1 + (index % 2),
      box: [0, 0, width * (0.5 + (index % 6) / 10), height],
      mask: encodeMask(
        Uint8Array.from({ length: width * height }, (_, pixel) => Number((pixel + index) % 4 !== 0)),
        width,
        height,
      ),
    }));
    const detections = Array.from({ length: (seed * 5 + row) % 13 }, (_, index): VisionDetection => {
      const size = 1 + ((seed + index) % 5);
      const storage = new Uint8Array(size * size + 4);
      const values = storage.subarray(2, size * size + 2);

      values.set(Uint8Array.from(values, (_, pixel) => Number((pixel + index + seed) % 3 !== 0)));

      return {
        label: task.classes[index % 2].name,
        score: (index % 3) / 2,
        box: [0, 0, 0.5 + (index % 6) / 10, 1],
        ...(index % 5 ? { mask: { width: size, height: size, values } } : {}),
      };
    });

    return {
      frame: { ...frame, width, height, annotations },
      result: metricResult({ width, height, detections }),
    };
  });

  return { rows, task };
}

function freezeRows(rows: EvaluatedFrame[], task: TrainingTask) {
  for (const { frame, result } of rows) {
    for (const annotation of frame.annotations) {
      Object.freeze(annotation.box);
      Object.freeze(annotation.mask.counts);
      Object.freeze(annotation.mask.size);
      Object.freeze(annotation.mask);
      Object.freeze(annotation);
    }

    result.detections.forEach(Object.freeze);
    Object.freeze(frame.annotations);
    Object.freeze(result.detections);
    Object.freeze(frame);
    Object.freeze(result);
  }

  task.classes.forEach(Object.freeze);
  Object.freeze(task.classes);
}

describe('prepared annotation overlaps', () => {
  it.each(['detect', 'segment'] as const)(
    'preserves complete %s reports across mixed frames and score ties',
    (kind) => {
      for (let seed = 0; seed < 100; seed++) {
        const { rows, task } = fixture(seed, kind);
        const before = structuredClone({ rows, task });

        freezeRows(rows, task);
        expect(objectMetrics(rows, task)).toEqual(referenceReports(rows, task));
        expect({ rows, task }).toEqual(before);
      }
    },
  );

  it.each(['detect', 'segment'] as const)('reads current %s geometry on later evaluations', (kind) => {
    const { rows, task } = fixture(19, kind);
    const first = objectMetrics(rows, task);
    const saved = structuredClone(first);
    const annotation = rows[0].frame.annotations[0];

    annotation.box = [1, 1, 0, 0];
    annotation.mask = encodeMask(
      new Uint8Array(rows[0].frame.width * rows[0].frame.height),
      rows[0].frame.width,
      rows[0].frame.height,
    );
    rows[0].result.detections.reverse();
    rows[1].result.detections[1].mask?.values.fill(0);
    task.classes.reverse();
    expect(objectMetrics(rows, task)).toEqual(referenceReports(rows, task));
    expect(first).toEqual(saved);
    expect(objectMetrics([], task)).toEqual(referenceReports([], task));
  });

  it('leaves missing prediction masks unscored and still refuses malformed masks when used', () => {
    const { rows, task } = fixture(1, 'segment');

    rows[0].frame.annotations[0].mask.counts = [];
    rows[0].result.detections = [{ label: 'Cup', score: 1, box: [0, 0, 1, 1] }];
    expect(() => objectMetrics(rows, task)).not.toThrow();
    rows[0].result.detections[0].mask = { width: 1, height: 1, values: new Uint8Array([1]) };
    expect(() => objectMetrics(rows, task)).toThrow('mask runs');
  });

  it.each([300, 600])('prepares geometry per class instead of per prediction for %i detections', (count) => {
    for (const kind of ['detect', 'segment'] as const) {
      const { rows, task } = fixture(3, kind);
      const row = rows[0];
      let reads = 0;

      row.result.detections = Array.from({ length: count }, (_, index) => ({
        label: task.classes[index % 2].name,
        score: 1,
        box: [0, 0, 1, 1],
        mask: { width: 1, height: 1, values: new Uint8Array([1]) },
      }));

      for (const annotation of row.frame.annotations) {
        const property = kind === 'detect' ? 'box' : 'mask';
        const value = annotation[property];

        Object.defineProperty(annotation, property, {
          get: () => {
            reads++;

            return value;
          },
        });
      }

      const expected = referenceReports(rows, task);

      expect(reads).toBe(count * row.frame.annotations.length);
      reads = 0;
      expect(objectMetrics(rows, task)).toEqual(expected);
      expect(reads).toBe(task.classes.length * row.frame.annotations.length);
    }
  });
});
