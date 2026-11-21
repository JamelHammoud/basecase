import type { BodyAnalysisOutcome, BodyAnalysisRequest } from '../reality/bodyAnalysisTypes';
import { readBodyEvidence, rememberBodyEvidence, type BodyEvidenceRef } from '../reality/bodyEvidence';
import { bodyRecordingUnchanged } from '../reality/bodyRecordingIdentity';

interface AnalysisAction {
  reference: BodyEvidenceRef;
  analyze: (request: BodyAnalysisRequest) => Promise<BodyAnalysisOutcome>;
  current: () => boolean;
  retain: (ref: BodyEvidenceRef) => void;
}

export async function analyzeBodyEvidence(
  action: AnalysisAction,
  ports = { read: readBodyEvidence, remember: rememberBodyEvidence, unchanged: bodyRecordingUnchanged },
): Promise<BodyAnalysisOutcome | null> {
  const saved = await ports.read(action.reference);

  if (!action.current()) return null;

  if (!saved) return { kind: 'refused', reason: 'provenance', replays: 0 };

  if (!(await ports.unchanged(action.reference))) return null;

  if (!action.current()) return null;

  const outcome = await action.analyze(saved.request);

  if (!action.current()) return null;

  if (outcome.kind !== 'analyzed' && !saved.experiment) return outcome;

  if (!(await ports.unchanged(action.reference)) || !action.current()) return null;

  const next = await ports.remember({
    ...saved,
    result: outcome.kind === 'analyzed' ? outcome : undefined,
    refusal: outcome.kind === 'refused' ? outcome.reason : undefined,
  });

  if (!action.current()) return null;

  action.retain(next);

  return outcome;
}

interface BodyAnalysisSourceState {
  generation: number;
  unit: string;
  parts: object;
  project: object;
}

export function bodyAnalysisCurrent(before: BodyAnalysisSourceState, now: BodyAnalysisSourceState): boolean {
  return (
    before.generation === now.generation &&
    before.unit === now.unit &&
    before.parts === now.parts &&
    before.project === now.project
  );
}
