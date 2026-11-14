import type { MjData, MjModel } from '@mujoco/mujoco';
import type { SimModel } from './mjcfTypes';

const D2R = Math.PI / 180;
const GAIN_SLOTS = 10;

export interface HoldSource {
  sim: SimModel;
  model: MjModel;
  data: MjData;
  jointQpos: number[];
  jointDof: number[];
}

export function holdValues({ sim, model, data, jointQpos, jointDof }: HoldSource): Record<string, number> {
  return Object.fromEntries(
    sim.joints.map((j, i) => {
      const kp = j.actuator >= 0 ? model.actuator_gainprm[j.actuator * GAIN_SLOTS] : 0;
      const bias = kp > 0 ? data.qfrc_bias[jointDof[i]] / kp : 0;

      return [j.id, (data.qpos[jointQpos[i]] + bias) / (j.type === 'revolute' ? D2R : 0.001)];
    }),
  );
}
