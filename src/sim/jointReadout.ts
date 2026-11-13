import type { MjData } from '@mujoco/mujoco';
import type { SimModel } from './mjcfTypes';

export function readJointTargets(sim: SimModel, data: MjData, jointQpos: number[], out: Float64Array): Float64Array {
  sim.joints.forEach((j, i) => {
    const commanded = j.actuator >= 0 && j.drive === 'position';

    out[i] = commanded ? data.ctrl[j.actuator] : data.qpos[jointQpos[i]];
  });

  return out;
}

export const readJointAngles = (data: MjData, jointQpos: number[]) =>
  Float64Array.from(jointQpos, (address) => data.qpos[address]);
