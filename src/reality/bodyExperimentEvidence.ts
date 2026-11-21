import type { StoredTry } from '../cases/tryFile';
import { sha256 } from '../cases/tries';
import { readBodyEvidence, rememberBodyEvidence, type BodyEvidenceRef } from './bodyEvidence';
import { bodyClient } from './bodyClient';

export async function retainBodyExperiment(
  input: {
    recommendation: BodyEvidenceRef;
    stored: StoredTry;
    session: string;
  },
  ports = { read: readBodyEvidence, remember: rememberBodyEvidence, client: bodyClient },
) {
  const { recommendation, stored, session } = input;
  const motion = stored.bodyMotion;

  if (!motion || motion.recommendation !== recommendation.content || motion.sourceKey !== recommendation.sourceKey)
    return null;

  const original = await ports.read(recommendation);

  if (!original || original.motion?.kind !== 'recommended' || stored.robot.modelHash !== recommendation.modelHash)
    return null;

  const client = ports.client();

  try {
    const run = await client.readRecording({ session, id: stored.id, joints: stored.robot.joints, motion });

    if (!run || stored.sceneId !== recommendation.scene || run.joints.join('\0') !== recommendation.joints.join('\0'))
      return null;

    const request = {
      ...original.request,
      run,
      observations: motion.backend,
      source: { ...original.request.source, recording: stored.id },
    };
    const analysis = await client.analyze(request);

    return ports.remember({
      request,
      sourceKey: original.sourceKey,
      calibration: original.calibration,
      sessionHash: await sha256(session),
      experiment: { recommendation, recording: motion },
      result: analysis.kind === 'analyzed' ? analysis : undefined,
      refusal: analysis.kind === 'refused' ? analysis.reason : undefined,
    });
  } finally {
    client.dispose();
  }
}
