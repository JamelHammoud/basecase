import type { FrozenImageSample } from '../../datasets/snapshotImages';
import { canonicalTest } from './metrics';
import { validateTrainingTask } from './metricsValidation';
import { classFailureRate } from './metricsFailures';
import type { ClassEvaluation, TrainingEvaluation } from './types';
import { validImageGroups } from '../conditions';

const unit = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1;
const count = (value: number) => Number.isSafeInteger(value) && value >= 0;
const cost = (value: number) => Number.isFinite(value) && value >= 0;
const hash = (value: string) => /^[a-f0-9]{64}$/.test(value);
const sampleKey = (sample: FrozenImageSample) => `${sample.frameSetId}:${sample.frameId}`;

function validSample(sample: FrozenImageSample): boolean {
  return (
    /^[\w-]{1,128}$/.test(sample.frameSetId) &&
    /^[\w-]{1,128}$/.test(sample.frameId) &&
    typeof sample.source === 'string' &&
    sample.source.length > 0 &&
    sample.source.length <= 512 &&
    hash(sample.hash) &&
    hash(sample.content) &&
    ['train', 'validation', 'test'].includes(sample.split) &&
    (sample.explicit === undefined || ['train', 'validation', 'test'].includes(sample.explicit)) &&
    (sample.groups === undefined || validImageGroups(sample.groups))
  );
}

function validTest(report: TrainingEvaluation): boolean {
  const snapshot = new Map(report.snapshot.map((sample) => [sampleKey(sample), sample]));
  const ids = new Set(report.realTest.map(sampleKey));

  return (
    (!report.evidence?.groupsHash || report.snapshot.length <= 10_000) &&
    report.snapshot.every(validSample) &&
    report.realTest.every(validSample) &&
    snapshot.size === report.snapshot.length &&
    ids.size === report.realTest.length &&
    report.realTest.every(
      (sample) =>
        sample.split === 'test' &&
        canonicalTest([sample]) === canonicalTest([snapshot.get(sampleKey(sample))!].filter(Boolean)),
    )
  );
}

function validClass(category: ClassEvaluation, report: TrainingEvaluation, index: number) {
  const declared = report.task.classes[index];

  return (
    category.classId === declared.id &&
    category.name === declared.name &&
    count(category.support) &&
    count(category.truePositive) &&
    count(category.falsePositive) &&
    count(category.falseNegative) &&
    category.truePositive + category.falseNegative === category.support &&
    unit(category.failureRate) &&
    (category.score === null || unit(category.score)) &&
    validKeypoints(category, report.task.kind === 'keypoints') &&
    matchingFailureRate(category, declared.keypoints?.length ?? 0)
  );
}

function matchingFailureRate(category: ClassEvaluation, pointCount: number): boolean {
  const expected = classFailureRate(category, pointCount);

  return Math.abs(expected - category.failureRate) <= 1e-12;
}

function validKeypoints(category: ClassEvaluation, required: boolean): boolean {
  const points = category.keypoints;

  if (!required) return points === undefined;

  return (
    !!points &&
    count(points.visible) &&
    count(points.correct) &&
    points.correct <= points.visible &&
    (points.visible > 0 || category.score === null)
  );
}

function primaryScore(report: TrainingEvaluation): number | null {
  const classes = report.metrics.perClass;

  if (!report.realTest.length) return null;

  if (report.task.kind === 'classify')
    return classes.reduce((sum, category) => sum + category.truePositive, 0) / report.realTest.length;

  if (report.task.kind === 'keypoints') {
    const visible = classes.reduce((sum, category) => sum + category.keypoints!.visible, 0);
    const correct = classes.reduce((sum, category) => sum + category.keypoints!.correct, 0);

    return visible ? correct / visible : null;
  }

  const supported = classes.filter((category) => category.support > 0);

  return supported.length
    ? supported.reduce((sum, category) => sum + (category.score ?? 0), 0) / supported.length
    : null;
}

function matchingPrimary(report: TrainingEvaluation): boolean {
  const expected = primaryScore(report);
  const actual = report.metrics.primary;

  if (expected === null || actual === null) return expected === null && actual === null;

  return Math.abs(expected - actual) <= 1e-12;
}

export function validateTrainingEvaluation(report: TrainingEvaluation): void {
  validateTrainingTask(report.task);

  const { primary, perClass } = report.metrics;

  if (
    report.version !== 1 ||
    report.protocol !== 'vision-eval-v1' ||
    !hash(report.modelHash) ||
    !hash(report.testHash) ||
    !validTest(report) ||
    (primary !== null && !unit(primary)) ||
    perClass.length !== report.task.classes.length ||
    !perClass.every((category, index) => validClass(category, report, index)) ||
    !validInference(report) ||
    !matchingPrimary(report)
  )
    throw new Error('Check the saved vision evaluation.');
}

function validInference(report: TrainingEvaluation): boolean {
  const { inference } = report.metrics;

  return (
    count(inference.samples) &&
    inference.samples === report.realTest.length &&
    cost(inference.meanMs) &&
    cost(inference.p95Ms) &&
    count(inference.modelBytes) &&
    inference.modelBytes > 0
  );
}
