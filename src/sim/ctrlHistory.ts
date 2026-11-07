import type { MainModule, MjData, MjModel } from '@mujoco/mujoco';

export interface HeldControl {
  actuator: number;
  value: number;
}

export function primeCtrlHistory(mj: MainModule, model: MjModel, data: MjData, held: HeldControl[]) {
  const dt = model.opt.timestep;

  for (const { actuator, value } of held) {
    const samples = model.actuator_history[actuator * 2];

    if (model.actuator_historyadr[actuator] < 0 || !samples) continue;

    const times = Array.from({ length: samples }, (_, k) => data.time - (samples - k) * dt);

    mj.mj_initCtrlHistory(model, data, actuator, times, new Array<number>(samples).fill(value));
  }
}
