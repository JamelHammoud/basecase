import { walkSim, type PeakDeps } from '../agent/agentPeak';
import { runEngineeringNow, type EngineeringNowInput } from './engineeringNow';

export interface VerifyInput extends Omit<EngineeringNowInput, 'withSweep' | 'walk'> {
  peak?: PeakDeps;
  setAction: (action: string) => void;
}

export async function verifyDesign({ peak, setAction, ...scene }: VerifyInput) {
  if (!peak) return runEngineeringNow({ ...scene, withSweep: true });

  const quick = await runEngineeringNow({ ...scene, withSweep: false });

  setAction('Walking the trained policy');

  const walk = await walkSim(peak, quick.joints, quick.massG);

  setAction('Checking the design');

  return runEngineeringNow({ ...scene, withSweep: true, walk });
}
