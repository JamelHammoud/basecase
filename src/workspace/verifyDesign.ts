import { fallsSim, type FallsDeps } from '../agent/agentFalls';
import { walkSim, type PeakDeps } from '../agent/agentPeak';
import type { JointLoad, StoredFalls, StoredWalk } from '../utils/engineeringTypes';
import { runEngineeringNow, type EngineeringNowInput } from './engineeringNow';
import { freshFalls, storedFalls, storedWalk } from './storedWalk';

type Scene = Omit<EngineeringNowInput, 'withSweep' | 'walk' | 'falls'>;

export interface VerifyInput extends Scene {
  peak?: PeakDeps;
  falls?: FallsDeps;
  setAction: (action: string) => void;
  keepWalk?: (walk: StoredWalk) => void;
  keepFalls?: (falls: StoredFalls) => void;
}

async function measureFalls(input: VerifyInput, joints: JointLoad[]) {
  const { falls, parts, project } = input;

  if (!falls) return freshFalls(parts, project);

  const measured = await fallsSim(falls, joints);

  if (typeof measured === 'object') input.keepFalls?.(storedFalls(measured, parts, project));

  return measured;
}

export async function verifyDesign(input: VerifyInput) {
  const { peak, falls, setAction, keepWalk, ...scene } = input;

  if (!peak && !falls)
    return runEngineeringNow({ ...scene, withSweep: true, falls: freshFalls(scene.parts, scene.project) });

  const quick = await runEngineeringNow({ ...scene, withSweep: false });
  const fell = await measureFalls(input, quick.joints);

  if (peak) setAction('Walking the trained policy');

  const walk = peak ? await walkSim(peak, { joints: quick.joints, massG: quick.massG, parts: scene.parts }) : undefined;

  if (typeof walk === 'object') keepWalk?.(storedWalk(walk, scene.parts, scene.project));

  setAction('Checking the design');

  return runEngineeringNow({ ...scene, withSweep: true, walk, falls: fell });
}
