import type { Simulation } from '../sim/useSimulation';
import { CANT_TIP, fallPlan, fallSim, NO_LEGS } from '../utils/engineeringFalls';
import { peakJoints } from '../utils/engineeringPeak';
import type { FallSim, JointLoad } from '../utils/engineeringTypes';
import { errorMessage } from '../utils/errorMessage';
import { peakLimits } from './agentPeak';

export interface FallsDeps {
  sim: Pick<Simulation, 'falls'>;
}

export async function fallsSim(deps: FallsDeps, loads: JointLoad[]): Promise<FallSim | string> {
  if (!peakJoints(loads).length) return NO_LEGS;

  try {
    const { model, runs } = await deps.sim.falls((m, robot) => fallPlan(m, robot, peakLimits(loads, m)));

    return model.robots.some((r) => r.floating) ? fallSim(model, runs) : CANT_TIP;
  } catch (e) {
    return `The falls didn’t run: ${errorMessage(e)}`;
  }
}
