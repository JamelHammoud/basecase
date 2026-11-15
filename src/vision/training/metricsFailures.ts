import type { ClassEvaluation } from './types';

type FailureCounts = Pick<ClassEvaluation, 'support' | 'falsePositive' | 'falseNegative' | 'keypoints'>;

export function classFailureRate(category: FailureCounts, pointCount = 0): number {
  const { keypoints, falsePositive, falseNegative, support } = category;

  if (!keypoints) return (falsePositive + falseNegative) / Math.max(1, support + falsePositive);

  const extraPoints = falsePositive * pointCount;

  return (keypoints.visible - keypoints.correct + extraPoints) / Math.max(1, keypoints.visible + extraPoints);
}
