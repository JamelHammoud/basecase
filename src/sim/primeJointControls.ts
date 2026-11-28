import type { MainModule } from '@mujoco/mujoco';
import type { SimEngine } from './engine';
import { primeCtrlHistory } from './ctrlHistory';

export function primeJointControls(mj: MainModule, engine: SimEngine, addresses: number[], joints: number[]) {
  const held = joints.flatMap((i) => {
    const joint = engine.sim.joints[i];

    if (joint.actuator < 0) return [];

    return [{ actuator: joint.actuator, value: joint.drive === 'position' ? engine.data.qpos[addresses[i]] : 0 }];
  });

  primeCtrlHistory(mj, engine.model, engine.data, held);
}
