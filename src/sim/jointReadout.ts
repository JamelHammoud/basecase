import type { MjData, MjModel } from '@mujoco/mujoco';
import type { SimModel } from './mjcfTypes';

export function readJointStates(sim: SimModel, data: MjData, jointQpos: number[], out: Float64Array): Float64Array {
  const { ctrl, qpos, actuator_force: force } = data;

  sim.joints.forEach((j, i) => {
    const position = qpos[jointQpos[i]];

    out[i * 3] = j.actuator >= 0 && j.drive === 'position' ? ctrl[j.actuator] : position;
    out[i * 3 + 1] = position;
    out[i * 3 + 2] = j.actuator >= 0 ? force[j.actuator] : 0;
  });

  return out;
}

export const readJointAngles = (data: MjData, jointQpos: number[]) =>
  Float64Array.from(jointQpos, (address) => data.qpos[address]);

const GAIN_SLOTS = 10;
const D2R = Math.PI / 180;

export function readHoldValues(
  sim: SimModel,
  model: MjModel,
  data: MjData,
  address: { qpos: number[]; dof: number[] },
): Record<string, number> {
  return Object.fromEntries(
    sim.joints.map((j, i) => {
      const kp = j.actuator >= 0 ? model.actuator_gainprm[j.actuator * GAIN_SLOTS] : 0;
      const bias = kp > 0 ? data.qfrc_bias[address.dof[i]] / kp : 0;

      return [j.id, (data.qpos[address.qpos[i]] + bias) / (j.type === 'revolute' ? D2R : 0.001)];
    }),
  );
}
