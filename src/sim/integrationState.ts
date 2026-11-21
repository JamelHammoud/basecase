import type { MainModule, MjData, MjModel } from '@mujoco/mujoco';

interface Physics {
  mj: MainModule;
  model: MjModel;
  data: MjData;
}

export function integrationState(mj: MainModule, model: MjModel, data: MjData): Float64Array {
  const signature = mj.mjtState.mjSTATE_INTEGRATION.value;
  const buffer = new mj.DoubleBuffer(mj.mj_stateSize(model, signature));

  try {
    mj.mj_getState(model, data, buffer, signature);

    return Float64Array.from(buffer.GetView() as Float64Array);
  } finally {
    buffer.delete();
  }
}

export function restoreIntegrationState({ mj, model, data }: Physics, state: Float64Array): boolean {
  const signature = mj.mjtState.mjSTATE_INTEGRATION.value;

  if (state.length !== mj.mj_stateSize(model, signature) || !state.every(Number.isFinite)) return false;

  mj.mj_setState(model, data, Array.from(state), signature);

  return true;
}
