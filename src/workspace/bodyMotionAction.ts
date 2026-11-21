import { readBodyEvidence, rememberBodyEvidence, type BodyEvidenceRef } from '../reality/bodyEvidence';
import { bodyRecordingUnchanged } from '../reality/bodyRecordingIdentity';
import type { BodyMotionOutcome, BodyMotionRequest } from '../reality/bodyMotionTypes';

interface MotionAction {
  reference: BodyEvidenceRef;
  selected: number[];
  recommend: (input: BodyMotionRequest) => Promise<BodyMotionOutcome>;
  current: () => boolean;
  retain: (ref: BodyEvidenceRef) => void;
}

export async function recommendBodyEvidence(
  action: MotionAction,
  ports = { read: readBodyEvidence, remember: rememberBodyEvidence, unchanged: bodyRecordingUnchanged },
): Promise<BodyMotionOutcome | null> {
  const saved = await ports.read(action.reference);

  if (!saved?.result || !action.current()) return null;

  if (!(await ports.unchanged(action.reference)) || !action.current()) return null;

  const motion = await action.recommend({ request: saved.request, result: saved.result, selected: action.selected });

  if (!action.current()) return null;

  if (motion.kind === 'refused') return motion;

  if (!(await ports.unchanged(action.reference)) || !action.current()) return null;

  const next = await ports.remember({ ...saved, motion });

  if (!action.current()) return null;

  action.retain(next);

  return motion;
}
