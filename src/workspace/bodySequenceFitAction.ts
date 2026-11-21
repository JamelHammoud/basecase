import type { bodyClient, BodyFitRequest } from '../reality/bodyClient';
import type { BodySequence } from '../reality/bodySequenceTypes';
import {
  rememberBodyEvidence,
  withBodyEvidence,
  type BodyEvidenceSnapshot,
  type BodyProjectUpdate,
} from '../reality/bodyEvidence';
import { sequenceRecordingsCurrent } from './bodySequenceAction';
import { encodeJson } from '../datasets/snapshotWorker';
import { BODY_SEQUENCE_CHECKPOINT_RESERVE } from '../reality/bodySequenceRecording';

export async function sequenceSourceCurrent(saved: BodyEvidenceSnapshot | null) {
  return !saved?.sequence || sequenceRecordingsCurrent(saved.sequence);
}

export async function boundBodyFit(input: {
  saved: BodyEvidenceSnapshot | null;
  worker: ReturnType<typeof bodyClient>;
  request: BodyFitRequest;
}) {
  const { saved, worker, request } = input;

  if (!saved?.sequence) return { result: await worker.fit(request), sequence: undefined };

  const evidence = saved.sequence;

  if (evidence.retainedBytes + BODY_SEQUENCE_CHECKPOINT_RESERVE > evidence.state.limits.retainedBytes)
    throw new Error('Body analysis evidence exceeds its storage limit.');

  const sequence = await worker.validateSequence({
    request: saved.request,
    sequence: { ...evidence.state, reason: evidence.state.reason ?? 'cancelled' },
  });
  const result = sequence.validationResult;

  return { result, sequence };
}

export async function rememberSequenceFit(input: {
  saved: BodyEvidenceSnapshot | null;
  sequence: BodySequence | undefined;
  current: () => Promise<boolean>;
  update: BodyProjectUpdate;
}) {
  const { saved, sequence, current, update } = input;

  if (!sequence || !saved?.sequence) return;

  if (!(await sequenceSourceCurrent(saved)) || !(await current())) throw new Error('The source changed.');

  const next = { ...saved, sequence: { ...saved.sequence, state: sequence } };

  next.sequence.retainedBytes += (await encodeJson(next)).byteLength + 32;

  if (next.sequence.retainedBytes > sequence.limits.retainedBytes)
    throw new Error('Body analysis evidence exceeds its storage limit.');

  const retained = await rememberBodyEvidence(next);

  if (!(await current())) throw new Error('The source changed.');

  update((project) => withBodyEvidence(project, retained));
}
