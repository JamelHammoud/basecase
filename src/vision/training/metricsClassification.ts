import type { EvaluatedFrame } from './metricsObjects';
import type { ClassEvaluation, TrainingTask } from './types';
import { classFailureRate } from './metricsFailures';
import type { ImageDiagnostics } from './evidenceTypes';

export function classificationMetrics(
  rows: EvaluatedFrame[],
  task: TrainingTask,
  diagnostics?: ImageDiagnostics[][],
): ClassEvaluation[] {
  const counts = task.classes.map(({ id, name }) => ({ classId: id, name, support: 0, truePositive: 0 }));
  const byId = new Map(counts.map((category) => [category.classId, category]));
  const predictions = new Map<string, number>();

  for (const [index, { frame, result }] of rows.entries()) {
    const classes = [...new Set(frame.annotations.map((annotation) => annotation.classId))];

    if (classes.length !== 1) throw new Error('Classification test images need one labeled class.');

    const predicted = [...(result.classes ?? [])].sort((a, b) => b.score - a.score)[0]?.label;
    const actual = byId.get(classes[0]);

    if (actual) actual.support++;

    if (actual && predicted === actual.name) actual.truePositive++;

    diagnostics?.[index].push(
      ...task.classes.map((category) => ({
        classId: category.id,
        support: Number(category.id === classes[0]),
        truePositive: Number(category.id === classes[0] && predicted === category.name),
        falseNegative: Number(category.id === classes[0] && predicted !== category.name),
        falsePositive: Number(category.id !== classes[0] && predicted === category.name),
      })),
    );

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
