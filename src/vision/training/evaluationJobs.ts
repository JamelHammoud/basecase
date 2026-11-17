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
import { frozenImageGroups, type ImageGroup, type ImageGroupSupport } from './conditionEvaluation';
import { conditionGroupJob } from './conditionGroupJob';
import { inspectionContext } from './inspectionContext';
import { errorMessage } from '../../utils/errorMessage';

const inspection = inspectionContext();

export const evaluationJobs = {
  sourceIdentity: async ({ bytes, stored }: { bytes: Uint8Array; stored: StoredTry }) =>
    reply(await inspectionSourceIdentity(bytes, stored)),
  sourceRecording: async (input: Parameters<typeof restoreInspectionSource>[0]) => {
    const recording = await restoreInspectionSource(input);

    return reply(recording, recordingTransfer(recording));
  },
  frameHash: async (frame: TrainingFrame) => reply(await frameHash(frame)),
  inspectionIndex: async (input: { candidate: TrainingEvaluation; incumbent: TrainingEvaluation }) => {
    const token = inspection.begin(input);

    await verifyEvidence(input.candidate);
    await verifyEvidence(input.incumbent);

    const candidate = new Map(input.candidate.evidence?.frames.map((frame, index) => [frame, index]));
    const incumbent = new Map(input.incumbent.evidence?.frames.map((frame, index) => [frame, index]));
    const indices = comparisonImages(input.candidate, input.incumbent).map(
      (image) => [candidate.get(image.candidate)!, incumbent.get(image.incumbent)!] as const,
    );

    const groups = inspectionGroups(input.candidate);

    inspection.remember(token, input);

    return reply({
      indices,
      ...groups,
      unlabeled: input.candidate.snapshot.filter((sample) => !sample.groups?.labels.length).length,
    });
  },
  inspectionGroup: async (input: { context: string; group: ImageGroup; port: MessagePort }) => {
    try {
      return reply(
        await conditionGroupJob({ ...inspection.read(input.context), group: input.group, port: input.port }),
      );
    } finally {
      input.port.close();
    }
  },
  releaseInspection: (context: string) => {
    inspection.release(context);

    return reply(true);
  },
  inspectionImage: async (input: InspectionImageInput) => {
    const result = await inspectionImage(input);

    return reply(result, preparationTransfer([result.set]));
  },
  evaluate: async (input: TrainingEvaluationInput) =>
    reply({ report: await evaluateTraining(input), sets: input.sets }, preparationTransfer(input.sets)),
};

function inspectionGroups(report: TrainingEvaluation): { groups: ImageGroupSupport[]; groupProblem: string } {
  try {
    return { groups: frozenImageGroups(report), groupProblem: '' };
  } catch (error) {
    return { groups: [], groupProblem: errorMessage(error) };
  }
}
