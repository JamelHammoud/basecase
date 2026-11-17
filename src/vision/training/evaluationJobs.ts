import { inspectionSourceIdentity, restoreInspectionSource } from './inspectionSource';
import { recordingTransfer } from '../../sim/recorder';
import { frameHash, type TrainingFrame } from '../frameSet';
import type { StoredTry } from '../../cases/tryFile';
import { reply } from '../../utils/workerRpc';
import { evaluateTraining } from './metrics';
import { preparationTransfer } from './prepareData';
import type { TrainingEvaluation, TrainingEvaluationInput } from './types';
import { comparisonImages } from './inspection';
import { verifyEvidence } from './evidence';
import { inspectionImage, type InspectionImageInput } from './inspectionImage';

export const evaluationJobs = {
  sourceIdentity: async ({ bytes, stored }: { bytes: Uint8Array; stored: StoredTry }) =>
    reply(await inspectionSourceIdentity(bytes, stored)),
  sourceRecording: async (input: Parameters<typeof restoreInspectionSource>[0]) => {
    const recording = await restoreInspectionSource(input);

    return reply(recording, recordingTransfer(recording));
  },
  frameHash: async (frame: TrainingFrame) => reply(await frameHash(frame)),
  inspectionIndex: async (input: { candidate: TrainingEvaluation; incumbent: TrainingEvaluation }) => {
    await verifyEvidence(input.candidate);
    await verifyEvidence(input.incumbent);

    const candidate = new Map(input.candidate.evidence?.frames.map((frame, index) => [frame, index]));
    const incumbent = new Map(input.incumbent.evidence?.frames.map((frame, index) => [frame, index]));
    const indices = comparisonImages(input.candidate, input.incumbent).map(
      (image) => [candidate.get(image.candidate)!, incumbent.get(image.incumbent)!] as const,
    );

    return reply(indices);
  },
  inspectionImage: async (input: InspectionImageInput) => {
    const result = await inspectionImage(input);

    return reply(result, preparationTransfer([result.set]));
  },
  evaluate: async (input: TrainingEvaluationInput) =>
    reply({ report: await evaluateTraining(input), sets: input.sets }, preparationTransfer(input.sets)),
};
