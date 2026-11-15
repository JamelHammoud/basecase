import type { ImageAnnotation, TrainingFrame } from '../frameSet';
import type { VisionDetection, VisionResult } from '../types';
import type { ClassEvaluation, TrainingTask } from './types';
import { annotationBox, boxOverlap, maskOverlap } from './metricsGeometry';
import { classFailureRate } from './metricsFailures';
import { averagePrecision } from './metricsPrecision';

export interface EvaluatedFrame {
  frame: TrainingFrame;
  result: VisionResult;
}

interface RankedDetection {
  detection: VisionDetection;
  row: number;
  overlaps: number[];
}

interface MatchedDetection extends RankedDetection {
  match: number;
}

const thresholds = Array.from({ length: 10 }, (_, i) => (50 + 5 * i) / 100);
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

function rankedDetections(rows: EvaluatedFrame[], task: TrainingTask, name: string): RankedDetection[] {
  return rows
    .flatMap(({ frame, result }, row) =>
      result.detections
        .filter((detection) => detection.label === name)
        .map((detection) => ({
          detection,
          row,
          overlaps: frame.annotations.map((annotation) => {
            if (task.kind === 'segment') return maskOverlap(annotation, detection, frame);

            return boxOverlap(annotationBox(annotation, frame), detection.box);
          }),
        })),
    )
    .sort((a, b) => b.detection.score - a.detection.score);
}

function matchDetections(ranked: RankedDetection[], rows: EvaluatedFrame[], classId: number, threshold: number) {
  const used = new Set<string>();

  return ranked.map((item): MatchedDetection => {
    const annotations = rows[item.row].frame.annotations;
    let match = -1;
    let overlap = threshold;

    item.overlaps.forEach((value, index) => {
      if (annotations[index].classId !== classId || used.has(`${item.row}:${index}`) || value < overlap) return;

      match = index;
      overlap = value;
    });

    if (match >= 0) used.add(`${item.row}:${match}`);

    return { ...item, match };
  });
}

function keypointScorer(task: TrainingTask) {
  const names = [...new Set(task.classes.flatMap((category) => category.keypoints ?? []))];
  const indices = new Map(names.map((name, index) => [name, index]));
  const tolerance = task.keypointTolerance ?? 0.1;

  return (annotation: ImageAnnotation, detection: VisionDetection | undefined, frame: TrainingFrame) => {
    const distance = tolerance * Math.hypot(annotation.box[2], annotation.box[3]);
    let visible = 0;
    let correct = 0;

    for (const point of annotation.keypoints) {
      if (!point.visible) continue;

      const predicted = detection?.keypoints?.[indices.get(point.name) ?? -1];

      visible++;
      correct += Number(
        !!predicted &&
          Math.hypot(predicted[0] * frame.width - point.x, predicted[1] * frame.height - point.y) <= distance,
      );
    }

    return { visible, correct };
  };
}

function classKeypoints(
  rows: EvaluatedFrame[],
  matches: MatchedDetection[],
  score: ReturnType<typeof keypointScorer>,
  classId: number,
) {
  const predictions = new Map(
    matches.filter((match) => match.match >= 0).map((item) => [`${item.row}:${item.match}`, item.detection]),
  );
  const counts = rows.flatMap(({ frame }, row) =>
    frame.annotations.flatMap((annotation, index) => {
      if (annotation.classId !== classId) return [];

      return [score(annotation, predictions.get(`${row}:${index}`), frame)];
    }),
  );

  return counts.reduce(
    (sum, count) => ({ visible: sum.visible + count.visible, correct: sum.correct + count.correct }),
    { visible: 0, correct: 0 },
  );
}

export function objectMetrics(rows: EvaluatedFrame[], task: TrainingTask): ClassEvaluation[] {
  const scoreKeypoints = task.kind === 'keypoints' ? keypointScorer(task) : null;

  return task.classes.map((category) => {
    const support = rows.reduce(
      (sum, { frame }) => sum + frame.annotations.filter((annotation) => annotation.classId === category.id).length,
      0,
    );
    const ranked = rankedDetections(rows, task, category.name);
    const matches = matchDetections(ranked, rows, category.id, 0.5);
    const truePositive = matches.filter((item) => item.match >= 0).length;
    const falsePositive = ranked.length - truePositive;
    const falseNegative = support - truePositive;
    const keypoints = scoreKeypoints ? classKeypoints(rows, matches, scoreKeypoints, category.id) : undefined;
    const failureRate = classFailureRate(
      { support, falsePositive, falseNegative, keypoints },
      category.keypoints?.length ?? 0,
    );
    const score = support
      ? mean(
          thresholds.map((threshold) =>
            averagePrecision(matchDetections(ranked, rows, category.id, threshold), support),
          ),
        )
      : null;

    return {
      classId: category.id,
      name: category.name,
      support,
      truePositive,
      falsePositive,
      falseNegative,
      failureRate,
      score: keypoints ? keypointScore(keypoints) : score,
      ...(keypoints ? { keypoints } : {}),
    };
  });
}

function keypointScore(keypoints: { correct: number; visible: number }): number | null {
  return keypoints.visible ? keypoints.correct / keypoints.visible : null;
}

export function objectPrimary(classes: ClassEvaluation[], task: TrainingTask): number | null {
  if (!classes.some((category) => category.support > 0)) return null;

  if (task.kind !== 'keypoints')
    return mean(classes.filter((category) => category.support > 0).map((category) => category.score ?? 0));

  const visible = classes.reduce((sum, category) => sum + (category.keypoints?.visible ?? 0), 0);
  const correct = classes.reduce((sum, category) => sum + (category.keypoints?.correct ?? 0), 0);

  return visible ? correct / visible : null;
}
