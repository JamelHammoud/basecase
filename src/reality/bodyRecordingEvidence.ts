import type { StoredTry } from '../cases/tryFile';
import type { SimModel } from '../sim/mjcfTypes';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { activeBodyCalibration, activeMounts, simCalibrations } from './history';
import { unitHistories } from './projectCalibrations';
import { bodyFitForCalibration } from './bodyLayout';
import { applyBodyFit } from './bodyModel';
import { emptyBodyFit } from './bodyParameters';
import { bodySourceKey, rememberBodyEvidence, BODY_EVIDENCE_COUNT, type BodyEvidenceSnapshot } from './bodyEvidence';
import { bodyClient } from './bodyClient';
import { sha256 } from '../cases/tries';
import { encodeJson } from '../datasets/snapshotWorker';
import { datasetContentHash } from '../datasets/contentHash';

export interface BodyRecordingContext {
  snapshot: BodyEvidenceSnapshot;
  modelHash: string;
}

export async function bodyRecordingContext(input: {
  model: SimModel;
  project: ProjectSettings;
  parts: ScenePart[];
  unit: string;
  scene: string;
  joints: string[];
}): Promise<BodyRecordingContext | null> {
  const { model, project, parts, unit, scene, joints } = input;
  const robot = model.robots.find(
    (candidate) => candidate.joints.length === joints.length && candidate.joints.every((id) => joints.includes(id)),
  );

  if (!robot) return null;

  const active = activeBodyCalibration(project.bodyCalibrations?.[robot.key]);
  const nominal = (active && bodyFitForCalibration(active, model.bodies, robot.key)) || emptyBodyFit();
  const effective = applyBodyFit(model, robot.key, nominal);
  const histories = unitHistories(project, unit);
  const calibration = { servos: simCalibrations(histories), mounts: activeMounts(histories) };
  const calibrationFingerprint = await datasetContentHash(await encodeJson(calibration));
  const modelHash = await sha256(effective.xml);

  return {
    modelHash,
    snapshot: {
      sourceKey: await bodySourceKey(parts, project),
      calibration,
      request: {
        model,
        nominal,
        robot: robot.key,
        run: { joints, statuses: [], intents: [], faultJoint: null, faultAt: 0, message: '' },
        units: joints.map(() => 'rad'),
        source: {
          recording: 'pending',
          unit,
          scene,
          modelHash,
          modelFingerprint: effective.robots.find((r) => r.key === robot.key)!.fingerprint,
          calibrationFingerprint,
        },
      },
    },
  };
}

export async function retainBodyRecording(input: {
  context: BodyRecordingContext | null;
  stored: StoredTry;
  session: string;
  project: ProjectSettings;
}) {
  const { context, stored, session, project } = input;
  const existing = project.bodyEvidence ?? [];

  if (!context || existing.length >= BODY_EVIDENCE_COUNT || session.length > 1_048_576) return null;

  if (
    stored.source !== 'operate' ||
    stored.sceneId !== context.snapshot.request.source.scene ||
    stored.robot.modelHash !== context.modelHash
  )
    return null;

  if (stored.robot.joints.join('\0') !== context.snapshot.request.run.joints.join('\0')) return null;

  const client = bodyClient();
  let run;

  try {
    run = await client.readRecording({ session, id: stored.id, joints: stored.robot.joints });
  } finally {
    client.dispose();
  }

  if (!run) return null;

  return rememberBodyEvidence({
    ...context.snapshot,
    sessionHash: await sha256(session),
    request: { ...context.snapshot.request, run, source: { ...context.snapshot.request.source, recording: stored.id } },
  });
}
