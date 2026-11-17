import { conditionImages } from './conditionImages';
import { loadDatasetContent } from '../../datasets/datasetStore/content';
import type { FrozenImageSample } from '../../datasets/snapshotImages';
import { MAX_CONDITIONS } from '../conditions';
import { decodeEvidenceResult, verifyEvidence } from './evidence';
import { canonicalTest, sampleKey } from './evaluationIdentity';
import { evaluatedRows, scoreTrainingRows } from './metrics';
import { validateEvaluationInput } from './metricsValidation';
import { validateTrainingEvaluation } from './retentionValidation';
import type { TrainingEvaluation, TrainingPrediction } from './types';

export interface ImageGroup {
  kind: 'condition' | 'camera' | 'source';
  name: string;
}

export interface ImageGroupSupport extends ImageGroup {
  members: number;
  realTest: number;
  otherTest: number;
  otherSplits: number;
  unlabeled: number;
  overlapping: number;
  keys: string[];
}

export function matchesImageGroup(sample: FrozenImageSample, group: ImageGroup): boolean {
  if (group.kind === 'source') return sample.source === group.name;

  if (group.kind === 'camera') return sample.groups?.camera === group.name;

  return sample.groups?.labels.includes(group.name) ?? false;
}

function groupDefinitions(report: TrainingEvaluation): ImageGroup[] {
  const conditions = new Set<string>();
  const cameras = new Set<string>();
  const sources = new Set<string>();

  for (const sample of report.snapshot) {
    sample.groups?.declared.forEach((name) => conditions.add(name));
    sources.add(sample.source);

    if (sample.groups) cameras.add(sample.groups.camera);

    if (conditions.size > MAX_CONDITIONS || cameras.size > 64 || sources.size > 256)
      throw new Error('Compare at most 32 conditions, 64 cameras and 256 sources.');
  }

  return [
    ...[...conditions].map((name): ImageGroup => ({ kind: 'condition', name })),
    ...[...cameras].map((name): ImageGroup => ({ kind: 'camera', name })),
    ...[...sources].map((name): ImageGroup => ({ kind: 'source', name })),
  ];
}

export function frozenImageGroups(report: TrainingEvaluation): ImageGroupSupport[] {
  if (!report.evidence?.groupsHash || report.snapshot.length > 10_000) return [];

  const real = new Set(report.realTest.map(sampleKey));

  return groupDefinitions(report).map((group) => {
    const members = report.snapshot.filter((sample) => matchesImageGroup(sample, group));
    const realTest = members.filter((sample) => real.has(sampleKey(sample)));

    return {
      ...group,
      members: members.length,
      realTest: realTest.length,
      otherTest: members.filter((sample) => sample.split === 'test' && !real.has(sampleKey(sample))).length,
      otherSplits: members.filter((sample) => sample.split !== 'test').length,
      unlabeled: members.filter((sample) => !sample.groups?.labels.length).length,
      overlapping: members.filter((sample) => (sample.groups?.labels.length ?? 0) > 1).length,
      keys: realTest.map(sampleKey),
    };
  });
}

function checkComparison(candidate: TrainingEvaluation, incumbent: TrainingEvaluation) {
  validateTrainingEvaluation(candidate);
  validateTrainingEvaluation(incumbent);

  if (
    !candidate.evidence?.groupsHash ||
    candidate.evidence.groupsHash !== incumbent.evidence?.groupsHash ||
    canonicalTest(candidate.realTest) !== canonicalTest(incumbent.realTest) ||
    JSON.stringify(candidate.task) !== JSON.stringify(incumbent.task)
  )
    throw new Error('Condition comparison is unavailable for this saved evidence.');
}

function checkGroupWork(candidate: TrainingEvaluation, keys: Set<string>, incumbent: TrainingEvaluation) {
  let pixels = 0;
  let pairs = 0;
  let annotations = 0;

  for (const report of [candidate, incumbent]) {
    for (const frame of report.evidence!.frames) {
      if (!keys.has(sampleKey(frame.sample))) continue;

      const support = frame.classes.reduce((sum, category) => sum + category.support, 0);

      annotations += support;
      pixels += frame.prediction.width * frame.prediction.height * (1 + support);
      pixels += frame.prediction.detections.reduce(
        (sum, detection) => sum + (detection.mask ? detection.mask.size[0] * detection.mask.size[1] : 0),
        0,
      );
      pairs += frame.prediction.detections.length * support;

      if (pixels > 32_000_000) throw new Error('Inspect groups with at most 32 million evaluated pixels.');

      if (pairs > 2_000_000) throw new Error('Inspect groups with at most 2 million annotation and prediction pairs.');

      if (annotations > 40_000) throw new Error('Inspect groups with at most 20,000 reviewed objects.');
    }
  }
}

export async function evaluateImageGroup(
  input: { candidate: TrainingEvaluation; incumbent: TrainingEvaluation; group: ImageGroup },
  load = loadDatasetContent,
  signal?: AbortSignal,
) {
  const { candidate, incumbent, group } = input;

  signal?.throwIfAborted();
  await verifyEvidence(candidate);
  await verifyEvidence(incumbent);
  signal?.throwIfAborted();
  checkComparison(candidate, incumbent);

  const support = frozenImageGroups(candidate).find((item) => item.kind === group.kind && item.name === group.name);

  if (!support) throw new Error('Choose a frozen image group.');

  const keys = new Set(support.keys);

  checkGroupWork(candidate, keys, incumbent);

  const samples = candidate.snapshot.filter((sample) => keys.has(sampleKey(sample)));
  const sets = await conditionImages(samples, { candidate, load, signal });

  const score = async (report: TrainingEvaluation) => {
    signal?.throwIfAborted();

    const predictions: TrainingPrediction[] = report
      .evidence!.frames.filter((frame) => keys.has(sampleKey(frame.sample)))
      .map((frame) => ({
        frameSetId: frame.sample.frameSetId,
        frameId: frame.sample.frameId,
        result: decodeEvidenceResult(frame.prediction),
        inferenceMs: 0,
      }));
    const evaluation = {
      task: report.task,
      sets,
      snapshot: samples,
      realSourceIds: [...new Set(samples.map((sample) => sample.source))],
      predictions,
      modelHash: report.modelHash,
      modelBytes: report.metrics.inference.modelBytes,
    };

    validateEvaluationInput(evaluation);

    return scoreTrainingRows(await evaluatedRows(evaluation, samples), report.task);
  };

  return { support, candidate: await score(candidate), incumbent: await score(incumbent) };
}
