import type { MainModule } from '@mujoco/mujoco';
import { SimEngine } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import type { ServoLog } from './types';

const D2R = Math.PI / 180;

export function replayLog(mj: MainModule, model: SimModel, log: ServoLog, jointId: string): Float64Array {
  const engine = new SimEngine(mj, model);
  const joint = model.joints.find((j) => j.id === jointId);
  const out = new Float64Array(log.goalRad.length);

  try {
    if (!joint) throw new Error(`The model has no joint ${jointId}`);

    const id = mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_JOINT.value, joint.name);
    const at = engine.model.jnt_qposadr[id];

    engine.setController({ kind: 'hold', values: { [joint.id]: log.positionRad[0] / D2R } });
    engine.data.qpos[at] = log.positionRad[0];
    engine.refreshKinematics();
    log.goalRad.forEach((goal, i) => {
      out[i] = engine.data.qpos[at];
      engine.setController({ kind: 'hold', values: { [joint.id]: goal / D2R } });
      engine.step(log.dt);
    });
  } finally {
    engine.dispose();
  }

  return out;
}

export function rmsError(predicted: ArrayLike<number>, measured: ArrayLike<number>): number {
  const n = Math.min(predicted.length, measured.length);
  let sum = 0;

  for (let i = 0; i < n; i++) sum += (predicted[i] - measured[i]) ** 2;

  return Math.sqrt(sum / Math.max(n, 1));
}

export function spread(values: ArrayLike<number>): number {
  const n = values.length;
  let mean = 0;

  for (let i = 0; i < n; i++) mean += values[i] / n;

  let sum = 0;

  for (let i = 0; i < n; i++) sum += (values[i] - mean) ** 2;

  return Math.sqrt(sum / Math.max(n, 1));
}
