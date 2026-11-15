import type { EvaluatedFrame } from './metricsObjects';
import type { ClassEvaluation, TrainingTask } from './types';
import { classFailureRate } from './metricsFailures';

export function classificationMetrics(rows: EvaluatedFrame[], task: TrainingTask): ClassEvaluation[] {
  const pairs = rows.map(({ frame, result }) => {
    const classes = [...new Set(frame.annotations.map((annotation) => annotation.classId))];

    if (classes.length !== 1) throw new Error('Classification test images need one labeled class.');

    const predicted = [...(result.classes ?? [])].sort((a, b) => b.score - a.score)[0]?.label;

    return { actual: classes[0], predicted };
  });

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
      failureRate: classFailureRate({ support, falsePositive, falseNegative }),
      score: support ? truePositive / support : null,
    };
  });
}
