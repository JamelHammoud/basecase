import { walkSim, type PeakDeps } from '../agent/agentPeak';
import type { StoredWalk } from '../utils/engineeringTypes';
import { runEngineeringNow, type EngineeringNowInput } from './engineeringNow';
import { storedWalk } from './storedWalk';

export interface VerifyInput extends Omit<EngineeringNowInput, 'withSweep' | 'walk'> {
  peak?: PeakDeps;
  setAction: (action: string) => void;
  keepWalk?: (walk: StoredWalk) => void;
}

export async function verifyDesign({ peak, setAction, keepWalk, ...scene }: VerifyInput) {
  if (!peak) return runEngineeringNow({ ...scene, withSweep: true });

  const quick = await runEngineeringNow({ ...scene, withSweep: false });

  setAction('Walking the trained policy');

  const walk = await walkSim(peak, { joints: quick.joints, massG: quick.massG, parts: scene.parts });

  if (typeof walk === 'object') keepWalk?.(storedWalk(walk, scene.parts, scene.project));

  setAction('Checking the design');

  return runEngineeringNow({ ...scene, withSweep: true, walk });
}
