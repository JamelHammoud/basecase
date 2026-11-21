import type { MainModule } from '@mujoco/mujoco';
import { SimEngine } from '../engine';
import { captureContactReplay } from './contactReplay';
import { passiveMechanism, passiveMechanisms } from './passiveMechanisms';

export function passiveReplays(mj: MainModule) {
  return passiveMechanisms.map((spec) => {
    const { name, count, powered } = spec;
    const { model } = passiveMechanism(spec);
    const capture = captureContactReplay(mj);
    const engine = new SimEngine(capture.module, model);

    try {
      if (engine.model.nv !== count || engine.model.nu !== powered)
        throw new Error(`${name}: wrong joint or motor count`);

      if (spec.free) engine.data.qvel[0] = 1;

      engine.step(0.5);

      return capture.finish(`passive-${name}`, model);
    } finally {
      engine.dispose();
    }
  });
}
