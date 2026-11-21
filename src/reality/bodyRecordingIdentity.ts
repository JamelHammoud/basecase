import { loadManifests, loadSession } from '../cases/tryStore';
import { sha256 } from '../cases/tries';
import type { BodyEvidenceRef } from './bodyEvidence';

export async function bodyRecordingUnchanged(
  ref: BodyEvidenceRef,
  ports = { manifests: loadManifests, session: loadSession },
): Promise<boolean> {
  const [stored] = await ports.manifests([ref.recording]);
  const session = await ports.session(ref.recording);

  return (
    !!stored &&
    !!session &&
    session.length <= 1_048_576 &&
    stored.id === ref.recording &&
    stored.source === 'operate' &&
    stored.sceneId === ref.scene &&
    Array.isArray(ref.joints) &&
    stored.robot.joints.join('\0') === ref.joints.join('\0') &&
    stored.robot.modelHash === ref.modelHash &&
    (await sha256(session)) === ref.sessionHash
  );
}
