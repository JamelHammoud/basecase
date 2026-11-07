import type { MjData, MjModel } from '@mujoco/mujoco';
import type { SimModel } from './mjcf';

const PRM = 10;

export function demandedTorques(
  model: MjModel,
  data: MjData,
  joints: SimModel['joints'],
  out: Float64Array,
): Float64Array {
  const gain = model.actuator_gainprm;
  const bias = model.actuator_biasprm;
  const { ctrl, actuator_length: length, actuator_velocity: velocity } = data;

  joints.forEach((j, i) => {
    const a = j.actuator;

    out[i] = a < 0 ? 0 : gain[a * PRM] * ctrl[a] + bias[a * PRM + 1] * length[a] + bias[a * PRM + 2] * velocity[a];
  });

  return out;
}

export function jointForces(data: MjData, joints: SimModel['joints'], out: Float64Array): Float64Array {
  joints.forEach((j, i) => {
    out[i] = j.actuator < 0 ? 0 : data.actuator_force[j.actuator];
  });

  return out;
}

export function limitForces(model: MjModel, sim: SimModel, limits: Record<string, number>) {
  const range = model.actuator_forcerange;

  for (const j of sim.joints) {
    const limit = limits[j.id];

    if (limit === undefined || limit <= 0 || j.actuator < 0) continue;

    range[j.actuator * 2] = -limit;
    range[j.actuator * 2 + 1] = limit;
  }
}
