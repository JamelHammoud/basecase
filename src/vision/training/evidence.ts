import { decodeMask, encodeMask } from '../imageMasks';
import { canonicalTest } from './evaluationIdentity';
import { sha256 } from '../../cases/tries';
import type { VisionDetection, VisionResult } from '../types';
import { validatePrediction } from './metricsValidation';
import type { TrainingEvaluation, TrainingEvaluationInput } from './types';
import type { EvidencePrediction, ImageDiagnostics, PredictionEvidence } from './evidenceTypes';
import type { FrozenImageSample } from '../../datasets/snapshotImages';
import { isFrozenImageSample } from '../../datasets/snapshotTypes';

export const EVIDENCE_MAX_FRAMES = 1000;
export const EVIDENCE_MAX_BYTES = 3 * 1024 * 1024;

const evidenceSize = (evidence: PredictionEvidence) => new TextEncoder().encode(JSON.stringify(evidence)).byteLength;
const key = (sample: FrozenImageSample) => `${sample.frameSetId}:${sample.frameId}`;
const count = (value: number) => Number.isSafeInteger(value) && value >= 0;

export async function imageGroupsHash(snapshot: FrozenImageSample[]) {
  if (snapshot.length > 10_000 || !snapshot.every(isFrozenImageSample))
    throw new Error('Check the frozen image groups.');

  return sha256(JSON.stringify(snapshot));
}

export function checkEvidenceFrameCount(size: number) {
  if (size > EVIDENCE_MAX_FRAMES) throw new Error('Compare at most 1,000 frozen real test images.');
}

function checkedMask(mask: NonNullable<VisionDetection['mask']>) {
  let runs = 1;
  let previous = 0;

  for (let x = 0; x < mask.width; x++) {
    for (let y = 0; y < mask.height; y++) {
      const value = mask.values[y * mask.width + x];

      runs += Number(value !== previous);
      previous = value;

      if (runs > 131072) throw new Error('Compare masks with at most 131,072 runs.');
    }
  }

  return encodeMask(mask.values, mask.width, mask.height);
}

function encodeResult(result: VisionResult, remaining: number): EvidencePrediction {
  let bytes = 0;

  return {
    width: result.width,
    height: result.height,
    detections: result.detections.map(({ mask, ...detection }) => {
      const encoded = { ...structuredClone(detection), ...(mask ? { mask: checkedMask(mask) } : {}) };

      bytes += new TextEncoder().encode(JSON.stringify(encoded)).byteLength;

      if (bytes > remaining) throw new Error('Prediction evidence exceeds 3 MiB per model.');

      return encoded;
    }),
    ...(result.classes ? { classes: structuredClone(result.classes) } : {}),
  };
}

export function decodeEvidenceResult(prediction: EvidencePrediction): VisionResult {
  return {
    modelId: 'frozen-evaluation',
    timestamp: 0,
    width: prediction.width,
    height: prediction.height,
    detections: prediction.detections.map(({ mask, ...detection }) => ({
      ...structuredClone(detection),
      ...(mask ? { mask: { width: mask.size[1], height: mask.size[0], values: decodeMask(mask) } } : {}),
    })),
    ...(prediction.classes ? { classes: structuredClone(prediction.classes) } : {}),
  };
}

export async function buildEvidence({
  input,
  realTest,
  testHash,
  diagnostics,
}: {
  input: TrainingEvaluationInput;
  realTest: FrozenImageSample[];
  testHash: string;
  diagnostics: ImageDiagnostics[][];
}): Promise<PredictionEvidence> {
  const predictions = new Map(input.predictions.map((entry) => [`${entry.frameSetId}:${entry.frameId}`, entry.result]));
  const evidence: PredictionEvidence = {
    version: 1,
    hash: '',
    modelHash: input.modelHash,
    testHash,
    groupsHash: await imageGroupsHash(input.snapshot),
    frames: [],
  };
  let bytes = evidenceSize(evidence) + 64;

  realTest.forEach((sample, index) => {
    const frame = {
      sample: structuredClone(sample),
      prediction: encodeResult(predictions.get(key(sample))!, EVIDENCE_MAX_BYTES - bytes),
      classes: diagnostics[index],
    };

    bytes += new TextEncoder().encode(JSON.stringify(frame)).byteLength + 1;

    if (bytes > EVIDENCE_MAX_BYTES) throw new Error('Prediction evidence exceeds 3 MiB per model.');

    evidence.frames.push(frame);
  });

  evidence.hash = await sha256(JSON.stringify({ ...evidence, hash: '' }));

  return evidence;
}

export async function verifyEvidence(report: TrainingEvaluation) {
  validateEvidence(report);

  const evidence = report.evidence;

  if (report.testHash !== (await sha256(canonicalTest(report.realTest))))
    throw new Error('The frozen test identity changed.');

  if (evidence && evidence.hash !== (await sha256(JSON.stringify({ ...evidence, hash: '' }))))
    throw new Error('The saved prediction evidence changed.');

  if (evidence?.groupsHash !== undefined && evidence.groupsHash !== (await imageGroupsHash(report.snapshot)))
    throw new Error('The frozen image groups changed.');
}

function validDiagnostics(actual: ImageDiagnostics, expected: ImageDiagnostics): boolean {
  const fields = ['classId', 'support', 'truePositive', 'falsePositive', 'falseNegative'] as const;

  return (
    fields.every((field) => count(actual[field])) &&
    actual.classId === expected.classId &&
    actual.truePositive + actual.falseNegative === actual.support &&
    (!actual.overlapMatches ||
      (actual.overlapMatches.length === 10 &&
        actual.overlapMatches[0] === actual.truePositive &&
        actual.overlapMatches.every(
          (value) => count(value) && value <= actual.support && value <= actual.truePositive + actual.falsePositive,
        ))) &&
    (!actual.keypoints ||
      (count(actual.keypoints.visible) &&
        count(actual.keypoints.correct) &&
        actual.keypoints.correct <= actual.keypoints.visible))
  );
}

function validateTotals(report: TrainingEvaluation, frames: PredictionEvidence['frames']) {
  for (const [index, category] of report.metrics.perClass.entries()) {
    const entries = frames.map((frame) => frame.classes[index]);
    const fields = ['support', 'truePositive', 'falsePositive', 'falseNegative'] as const;
    const match = fields.every((field) => entries.reduce((sum, row) => sum + row[field], 0) === category[field]);
    const points = ['visible', 'correct'] as const;
    const pointsMatch = points.every(
      (field) =>
        entries.reduce((sum, row) => sum + (row.keypoints?.[field] ?? 0), 0) === (category.keypoints?.[field] ?? 0),
    );

    if (!match || !pointsMatch) throw new Error('The saved image diagnostics changed.');
  }
}

function validateFrames(report: TrainingEvaluation, evidence: PredictionEvidence) {
  const samples = new Map(report.realTest.map((sample) => [key(sample), sample]));
  const seen = new Set<string>();

  for (const frame of evidence.frames) {
    const sample = samples.get(key(frame.sample));
    const fields = ['frameSetId', 'frameId', 'source', 'hash', 'content', 'split', 'explicit'] as const;

    if (!sample || seen.has(key(sample)) || !fields.every((field) => sample[field] === frame.sample[field]))
      throw new Error('The saved prediction image changed.');

    seen.add(key(sample));

    const result: VisionResult = {
      ...frame.prediction,
      modelId: 'frozen-evaluation',
      timestamp: 0,
      detections: frame.prediction.detections.map(({ mask, ...detection }) => {
        if (mask && !validEncodedMask(mask)) throw new Error('Check the saved prediction mask.');

        return detection;
      }),
    };

    if (!count(result.width) || !count(result.height) || !result.width || !result.height)
      throw new Error('Check the saved prediction dimensions.');

    validatePrediction(result, report.task);

    if (
      frame.classes.length !== report.task.classes.length ||
      !frame.classes.every((category, index) => validDiagnostics(category, report.metrics.perClass[index])) ||
      frame.classes.some((category) => (category.keypoints !== undefined) !== (report.task.kind === 'keypoints')) ||
      frame.classes.some(
        (category) => (category.overlapMatches !== undefined) !== ['detect', 'segment'].includes(report.task.kind),
      )
    )
      throw new Error('Check the saved image diagnostics.');
  }
}

export function validateEvidence(report: TrainingEvaluation): void {
  const evidence = report.evidence;

  if (evidence === undefined) return;

  if (
    !evidence ||
    !/^[a-f0-9]{64}$/.test(evidence.hash) ||
    evidence.version !== 1 ||
    evidence.modelHash !== report.modelHash ||
    evidence.testHash !== report.testHash ||
    (evidence.groupsHash !== undefined && !/^[a-f0-9]{64}$/.test(evidence.groupsHash)) ||
    !Array.isArray(evidence.frames) ||
    evidence.frames.length !== report.realTest.length ||
    evidence.frames.length > EVIDENCE_MAX_FRAMES ||
    evidenceSize(evidence) > EVIDENCE_MAX_BYTES
  )
    throw new Error('Check the saved prediction evidence.');

  validateFrames(report, evidence);
  validateTotals(report, evidence.frames);
}

function validEncodedMask(mask: NonNullable<EvidencePrediction['detections'][number]['mask']>) {
  const [height, width] = mask.size;

  return (
    count(width) &&
    count(height) &&
    width > 0 &&
    height > 0 &&
    width * height <= 16_777_216 &&
    Array.isArray(mask.counts) &&
    mask.counts.every(count) &&
    mask.counts.reduce((sum, run) => sum + run, 0) === width * height
  );
}
