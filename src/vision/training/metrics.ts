import { canonicalTest, sampleKey } from './evaluationIdentity';
import { sha256 } from '../../cases/tries';
import { frameHash, type FrameSet, type TrainingFrame } from '../frameSet';
import type { FrozenImageSample } from '../../datasets/snapshotImages';
import type { TrainingEvaluation, TrainingEvaluationInput, TrainingKind, TrainingTask } from './types';
import { classificationMetrics } from './metricsClassification';
import { buildEvidence, checkEvidenceFrameCount } from './evidence';
import type { ImageDiagnostics } from './evidenceTypes';
import { objectMetrics, objectPrimary, type EvaluatedFrame } from './metricsObjects';
import { trainingMetrics, validateEvaluationInput, validatePrediction } from './metricsValidation';
import { evaluationImageGroups } from '../conditions';

export const defaultTrainingMetric = (kind: TrainingKind) => trainingMetrics[kind];

export { canonicalTest } from './evaluationIdentity';

function testSamples(input: TrainingEvaluationInput): FrozenImageSample[] {
  const realSources = new Set(input.realSourceIds);
  const test = input.snapshot.filter((sample) => sample.split === 'test' && realSources.has(sample.source));
  const sources = new Set(test.map((sample) => sample.source));

  if (input.snapshot.some((sample) => sample.split !== 'test' && sources.has(sample.source)))
    throw new Error('Keep each real source in one frozen split.');

  return JSON.parse(canonicalTest(test));
}

async function checkedFrame(set: FrameSet | undefined, sample: FrozenImageSample): Promise<TrainingFrame> {
  const frame = set?.frames.find((item) => item.id === sample.frameId);

  if (!set || !frame || (await frameHash(frame)) !== sample.hash)
    throw new Error('The frozen test image content changed.');

  if (frame.origin && sample.source !== `try:${frame.origin.tryId}`)
    throw new Error('The frozen test image source changed.');

  return frame;
}

function remapFrame(frame: TrainingFrame, set: FrameSet, input: TrainingEvaluationInput): TrainingFrame {
  const annotations = frame.annotations.map((annotation) => {
    const original = set.classes.find((category) => category.id === annotation.classId);
    const category = input.task.classes.find((item) => item.name === original?.name);

    if (!category || !(original?.keypoints ?? []).every((name) => category.keypoints?.includes(name)))
      throw new Error('The frozen test classes differ from the training task.');

    if (annotation.review === 'suggested') throw new Error('Review suggested labels before test evaluation.');

    return { ...annotation, classId: category.id };
  });

  return { ...frame, annotations };
}

export async function evaluatedRows(
  input: TrainingEvaluationInput,
  test: FrozenImageSample[],
): Promise<EvaluatedFrame[]> {
  const predictions = new Map(input.predictions.map((prediction) => [sampleKey(prediction), prediction]));

  const rows = await Promise.all(
    test.map(async (sample) => {
      const set = input.sets.find((item) => item.id === sample.frameSetId);
      const frame = await checkedFrame(set, sample);
      const prediction = predictions.get(sampleKey(sample));

      if (!prediction || prediction.result.width !== frame.width || prediction.result.height !== frame.height)
        throw new Error('Return one matching prediction for every real test image.');

      validatePrediction(prediction.result, input.task);

      return { frame: remapFrame(frame, set!, input), result: prediction.result };
    }),
  );

  if (predictions.size !== test.length) throw new Error('Return predictions only for the frozen real test images.');

  return rows;
}

function inferenceCost(input: TrainingEvaluationInput) {
  const costs = input.predictions.map((prediction) => prediction.inferenceMs).sort((a, b) => a - b);

  return {
    samples: costs.length,
    meanMs: costs.reduce((sum, value) => sum + value, 0) / Math.max(1, costs.length),
    p95Ms: costs[Math.max(0, Math.ceil(costs.length * 0.95) - 1)] ?? 0,
    modelBytes: input.modelBytes,
  };
}

export function scoreTrainingRows(rows: EvaluatedFrame[], task: TrainingTask, diagnostics?: ImageDiagnostics[][]) {
  const perClass =
    task.kind === 'classify' ? classificationMetrics(rows, task, diagnostics) : objectMetrics(rows, task, diagnostics);
  const correct = perClass.reduce((sum, category) => sum + category.truePositive, 0);
  const score = task.kind === 'classify' ? correct / Math.max(1, rows.length) : objectPrimary(perClass, task);

  return { primary: rows.length ? score : null, perClass };
}

export async function evaluateTraining(input: TrainingEvaluationInput): Promise<TrainingEvaluation> {
  validateEvaluationInput(input);

  const realTest = testSamples(input);

  checkEvidenceFrameCount(realTest.length);

  const rows = await evaluatedRows(input, realTest);
  const diagnostics: ImageDiagnostics[][] = rows.map(() => []);
  const scores = scoreTrainingRows(rows, input.task, diagnostics);
  const snapshot = evaluationImageGroups(input.snapshot, input.sets);

  const testHash = await sha256(canonicalTest(realTest));

  return {
    version: 1,
    protocol: 'vision-eval-v1',
    task: structuredClone(input.task),
    modelHash: input.modelHash,
    snapshot: structuredClone(snapshot),
    realTest,
    testHash,
    evidence: await buildEvidence({ input: { ...input, snapshot }, realTest, testHash, diagnostics }),
    metrics: { ...scores, inference: inferenceCost(input) },
  };
}
