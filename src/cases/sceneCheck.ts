import type { MainModule } from '@mujoco/mujoco';
import { headlessParts } from '../three/headlessParts';
import type { MeshFiles } from '../three/componentMeshes';
import type { SharedScene } from '../utils/sceneFile';
import { runCase, type CaseResult, type CaseRobot } from './runCase';
import { parseCase, type Case } from './schema';

export interface CaseCheck {
  id: string;
  name: string;
  runs: number;
  passes: number;
  margin: number;
  failed: string | null;
}

export const MISSED = 'Missed';

export const sceneCases = (scene: SharedScene): Case[] => (scene.project?.cases ?? []).map((c) => parseCase(c));

export async function sceneRobot(scene: SharedScene, meshes: MeshFiles): Promise<CaseRobot> {
  const loaded = await headlessParts(scene.parts, scene.project?.joints ?? [], meshes);

  return { id: scene.name, parts: scene.parts, ...loaded };
}

function failedLabel(result: CaseResult): string | null {
  if (result.passed) return null;

  return result.refusal ?? result.failed[0] ?? MISSED;
}

export async function checkCase(mj: MainModule, kase: Case, robot: CaseRobot): Promise<CaseCheck> {
  const result = await runCase(mj, kase, robot, { controller: 'reference' });

  return {
    id: kase.id,
    name: kase.name,
    runs: 1,
    passes: result.passed ? 1 : 0,
    margin: result.margin,
    failed: failedLabel(result),
  };
}

export const underBar = (check: CaseCheck) => check.passes < check.runs;
