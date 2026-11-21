import type { SharedScene } from '../../src/utils/sceneFile';
import type { Case } from '../../src/cases/schema';

export function invokeEvaluation(...args: string[]): Promise<{ code: number | string; stdout: string; stderr: string }>;
export function evaluationFixture(dir: string): Promise<{
  baseline: string;
  candidate: string;
  package: string;
  output: string;
  weakScene: SharedScene;
  kase: Case;
}>;
