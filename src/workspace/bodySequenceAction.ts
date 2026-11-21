import type { bodyClient } from '../reality/bodyClient';
import {
  readBodyEvidence,
  rememberBodyEvidence,
  type BodyEvidenceRef,
  type BodyEvidenceSnapshot,
} from '../reality/bodyEvidence';
import { bodyRecordingUnchanged } from '../reality/bodyRecordingIdentity';
import { BODY_SEQUENCE_LIMITS, type BodySequence } from '../reality/bodySequenceTypes';
import type { BodySequenceEvidence } from '../reality/bodyExperimentTypes';
import { encodeJson } from '../datasets/snapshotWorker';
import {
  retainSequenceObservation,
  BODY_SEQUENCE_RECORD_RESERVE,
  BODY_SEQUENCE_CHECKPOINT_RESERVE,
} from '../reality/bodySequenceRecording';

export interface BodySequenceAction {
  reference: BodyEvidenceRef;
  selected: number[];
  worker: Pick<ReturnType<typeof bodyClient>, 'prepareSequence' | 'advanceSequence' | 'dispose'>;
  current: () => boolean;
  signal: AbortSignal;
  retain: (reference: BodyEvidenceRef, evidence: BodySequenceEvidence) => void;
}

const defaults = {
  read: readBodyEvidence,
  remember: rememberBodyEvidence,
  unchanged: bodyRecordingUnchanged,
  encode: encodeJson,
  observation: retainSequenceObservation,
};

interface SequenceSession {
  action: BodySequenceAction;
  snapshot: BodyEvidenceSnapshot;
  ports: typeof defaults;
  evidence: BodySequenceEvidence;
}

async function checkpoint(session: SequenceSession, state: BodySequence) {
  const { action, snapshot, ports } = session;

  if (!action.current()) return;

  const evidence = { ...session.evidence, state };
  const count = (await ports.encode({ ...snapshot, sequence: evidence })).byteLength + 32;

  evidence.retainedBytes += count;

  if (evidence.retainedBytes > state.limits.retainedBytes)
    throw new Error('Body analysis evidence exceeds its storage limit.');

  const reference = await ports.remember({ ...snapshot, sequence: evidence });

  session.evidence = evidence;

  if (action.current()) action.retain(reference, evidence);
}

async function keepObservation(session: SequenceSession, state: BodySequence) {
  const { action, snapshot, ports, evidence } = session;
  const round = state.rounds.at(-1);
  const kept = await ports.observation({
    source: action.reference,
    snapshot,
    run: round?.run ?? state.validation,
    analysis: round?.analysis,
  });

  session.evidence = {
    ...evidence,
    recordings: [...evidence.recordings, kept.reference],
    retainedBytes: evidence.retainedBytes + kept.bytes,
  };
}

async function advance(session: SequenceSession) {
  const { action, ports, evidence, snapshot } = session;

  if (evidence.state.reason || action.signal.aborted || !action.current()) return false;

  if (!(await sequenceRecordingsCurrent(evidence, ports.unchanged))) {
    await checkpoint(session, { ...evidence.state, reason: 'provenance' });

    return false;
  }

  if (
    evidence.retainedBytes + BODY_SEQUENCE_RECORD_RESERVE + BODY_SEQUENCE_CHECKPOINT_RESERVE >
    evidence.state.limits.retainedBytes
  ) {
    await checkpoint(session, { ...evidence.state, reason: 'storage' });

    return false;
  }

  const next = await action.worker.advanceSequence({ request: snapshot.request, sequence: evidence.state });

  if (!action.current() || action.signal.aborted || !(await ports.unchanged(action.reference))) return false;

  if (next.rounds.length > evidence.state.rounds.length) await keepObservation(session, next);

  await checkpoint(session, next);

  return !next.reason;
}

async function sourceSnapshot(action: BodySequenceAction, ports: typeof defaults) {
  const snapshot = await ports.read(action.reference);

  if (!snapshot?.result || snapshot.sequence || !action.current() || action.signal.aborted) return null;

  if (!(await ports.unchanged(action.reference)) || !action.current()) return null;

  if (
    (await ports.encode(snapshot)).byteLength > 3 * 1_048_576 ||
    action.reference.joints.some((joint) => joint.length > 128)
  )
    throw new Error('Body analysis evidence exceeds its storage limit.');

  return snapshot;
}

export async function runBodySequenceEvidence(action: BodySequenceAction, ports = defaults) {
  const snapshot = await sourceSnapshot(action, ports);

  if (!snapshot?.result) return null;

  let session: SequenceSession | null = null;
  const stop = () => action.worker.dispose();

  action.signal.addEventListener('abort', stop, { once: true });

  try {
    const state = await action.worker.prepareSequence({
      request: snapshot.request,
      result: snapshot.result,
      selected: action.selected,
      limits: BODY_SEQUENCE_LIMITS,
    });

    if (!action.current() || action.signal.aborted) return null;

    session = {
      action,
      snapshot,
      ports,
      evidence: { source: action.reference, state, recordings: [], retainedBytes: 0 },
    };

    if (!state.reason) await keepObservation(session, state);

    await checkpoint(session, state);

    while (await advance(session)) continue;
  } finally {
    action.signal.removeEventListener('abort', stop);

    if (session && !session.evidence.state.reason)
      await checkpoint(session, { ...session.evidence.state, reason: 'cancelled' });
  }

  return session?.evidence ?? null;
}

export async function sequenceRecordingsCurrent(evidence: BodySequenceEvidence, unchanged = bodyRecordingUnchanged) {
  const matching = await Promise.all(
    [evidence.source, ...evidence.recordings].map((reference) => unchanged(reference)),
  );

  return matching.every(Boolean) && evidence.recordings.length === evidence.state.rounds.length + 1;
}
