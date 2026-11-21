import type { RobotRun } from '../robot/runBuffer';
import type { StoredTry } from '../cases/tryFile';
import { keepSession } from '../cases/tryStore';
import { sha256 } from '../cases/tries';
import { rememberBodyEvidence, type BodyEvidenceRef, type BodyEvidenceSnapshot } from './bodyEvidence';
import { encodeJson } from '../datasets/snapshotWorker';
import type { BodyAnalysisResult } from './bodyAnalysisTypes';

export const BODY_SEQUENCE_RECORD_RESERVE = 20 * 1_048_576;
export const BODY_SEQUENCE_CHECKPOINT_RESERVE = 8 * 1_048_576;

export function bodySequenceSession(run: RobotRun) {
  return (
    [
      ...run.statuses.map((sample) => ({ t: sample.at / 1000, k: 'status', q: sample.positions })),
      ...run.intents.map((sample) => ({ t: sample.at / 1000, k: 'intent', q: sample.joints })),
    ]
      .sort((left, right) => left.t - right.t)
      .map((sample) => JSON.stringify(sample))
      .join('\n') + '\n'
  );
}

export async function retainSequenceObservation(
  input: {
    source: BodyEvidenceRef;
    snapshot: BodyEvidenceSnapshot;
    run: RobotRun;
    analysis?: BodyAnalysisResult;
  },
  ports = { keep: keepSession, remember: rememberBodyEvidence, encode: encodeJson },
) {
  const { source, snapshot, run, analysis } = input;
  const id = `body-${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`;
  const session = bodySequenceSession(run);
  const stored: StoredTry = {
    version: 1,
    id,
    sceneId: source.scene,
    robot: { name: snapshot.request.robot, modelHash: source.modelHash, joints: [...run.joints] },
    case: null,
    source: 'generated',
    input: null,
    startedAt: new Date().toISOString(),
    seconds: (run.statuses.at(-1)!.at - run.statuses[0].at) / 1000,
    rate: 32,
    frames: run.statuses.length,
    outcome: { verdict: 'unjudged', margin: null },
    seed: 0,
    sourceTry: source.recording,
    faults: [],
    split: analysis ? 'train' : 'validation',
  };
  const next: BodyEvidenceSnapshot = {
    request: { ...snapshot.request, run, source: { ...snapshot.request.source, recording: id } },
    calibration: snapshot.calibration,
    sourceKey: snapshot.sourceKey,
    generated: true,
    sessionHash: await sha256(session),
    result: analysis ? { ...analysis, source: { ...analysis.source, recording: id } } : undefined,
  };
  const encoded = await ports.encode(next);
  const bytes =
    encoded.byteLength +
    new TextEncoder().encode(session).byteLength +
    new TextEncoder().encode(JSON.stringify(stored, null, 2)).byteLength +
    1;

  if (session.length > 1_048_576 || encoded.byteLength > BODY_SEQUENCE_CHECKPOINT_RESERVE)
    throw new Error('Body analysis evidence exceeds its storage limit.');

  await ports.keep(stored, session);

  return { reference: await ports.remember(next), bytes };
}
