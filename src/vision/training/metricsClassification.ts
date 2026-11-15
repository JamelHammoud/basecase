import type { EvaluatedFrame } from './metricsObjects';
import type { ClassEvaluation, TrainingTask } from './types';
import { classFailureRate } from './metricsFailures';

export function classificationMetrics(rows: EvaluatedFrame[], task: TrainingTask): ClassEvaluation[] {
  const counts = task.classes.map(({ id, name }) => ({ classId: id, name, support: 0, truePositive: 0 }));
  const byId = new Map(counts.map((category) => [category.classId, category]));
  const predictions = new Map<string, number>();

  for (const { frame, result } of rows) {
    const classes = [...new Set(frame.annotations.map((annotation) => annotation.classId))];

    if (classes.length !== 1) throw new Error('Classification test images need one labeled class.');

    const predicted = [...(result.classes ?? [])].sort((a, b) => b.score - a.score)[0]?.label;
    const actual = byId.get(classes[0]);

    if (actual) actual.support++;

    if (actual && predicted === actual.name) actual.truePositive++;

    if (predicted !== undefined) predictions.set(predicted, (predictions.get(predicted) ?? 0) + 1);
  }

  return counts.map(({ classId, name, support, truePositive }) => {
    const falsePositive = (predictions.get(name) ?? 0) - truePositive;
    const falseNegative = support - truePositive;

    return {
      classId,
      name,
      support,
      truePositive,
      falsePositive,
      falseNegative,
      failureRate: classFailureRate({ support, falsePositive, falseNegative }),
      score: support ? truePositive / support : null,
    };
  });
}
