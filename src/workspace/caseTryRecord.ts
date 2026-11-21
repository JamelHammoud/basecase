import { stageCase, stagedEffectors } from '../cases/caseCast';
import type { Case } from '../cases/schema';
import type { SlotRobot } from '../cases/slots';
import { scoreTry, tryManifest, type TryRecord, type TryScoring } from '../cases/tries';
import type { TryBranch } from '../cases/tryBranch';
import type { SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';
import type { ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';

interface Input {
  kase: Case;
  model: SimModel;
  recording: Recording;
  scene: { rig: Rig; parts: ScenePart[]; partners: SlotRobot[] };
  branch: { source: TryRecord; scoring: Omit<TryScoring, 'recording'>; provenance: TryBranch } | null;
}

function scoringFor({ kase, model, scene }: Input) {
  const staged = stageCase(kase, scene, scene.partners);

  return { kase: staged.kase, model, ...stagedEffectors(staged, scene) };
}

export async function caseTryRecord(input: Input): Promise<TryRecord> {
  const { recording, branch, scene } = input;
  const scoring = branch?.scoring ?? scoringFor(input);
  const verdict = await scoreTry({ ...scoring, recording });
  const manifest = await tryManifest(scoring.kase, scoring.model, recording);

  return {
    id: `try-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    caseId: scoring.kase.id,
    robot: branch?.source.robot ?? scene.rig.robots[0]?.name ?? 'Robot',
    at: new Date().toISOString(),
    passed: verdict.passed,
    margin: verdict.margin,
    seconds: recording.frames * recording.dt,
    manifest: branch ? { ...manifest, source: branch.source.id, branch: branch.provenance } : manifest,
  };
}
