import type { MjData, MjModel } from '@mujoco/mujoco';
import type { SimModel } from './mjcf';

const PRM = 10;

export function demandedTorques(model: MjModel, data: MjData, out: Float64Array): Float64Array {
  const gain = model.actuator_gainprm;
  const bias = model.actuator_biasprm;
  const { ctrl, actuator_length: length, actuator_velocity: velocity } = data;

  for (let i = 0; i < out.length; i++)
    out[i] = gain[i * PRM] * ctrl[i] + bias[i * PRM + 1] * length[i] + bias[i * PRM + 2] * velocity[i];

  return out;
}

export function limitForces(model: MjModel, sim: SimModel, limits: Record<string, number>) {
  const range = model.actuator_forcerange;

  sim.joints.forEach((j, i) => {
    const limit = limits[j.id];

    if (limit === undefined || limit <= 0) return;

    range[i * 2] = -limit;
    range[i * 2 + 1] = limit;
  });
}
