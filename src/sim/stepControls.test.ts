import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { SimEngine } from './engine';
import { fixtureModel } from '../skills/fixtureModels';

it('keeps batched substeps identical with controller and fault changes inside step hooks', async () => {
  const mj = await loadMujoco();
  const model = fixtureModel('arm-3dof');
  const batched = new SimEngine(mj, model);
  const individual = new SimEngine(mj, model);
  const configure = (engine: SimEngine) => {
    let steps = 0;

    engine.setController({ kind: 'hold', values: { arm0: 30 } });
    engine.stepHook = () => {
      steps++;

      if (steps === 3) engine.setController({ kind: 'hold', values: { arm0: -25, arm1: 40 } });

      if (steps === 5) engine.setFault('arm1', 'laggy');
    };
  };

  try {
    configure(batched);
    configure(individual);
    batched.step(0.1);

    for (let i = 0; i < 50; i++) individual.step(individual.dt);

    expect(Array.from(batched.data.qpos)).toEqual(Array.from(individual.data.qpos));
    expect(Array.from(batched.data.qvel)).toEqual(Array.from(individual.data.qvel));
    expect(Array.from(batched.data.actuator_force)).toEqual(Array.from(individual.data.actuator_force));
    expect(batched.stats()).toEqual(individual.stats());
  } finally {
    batched.dispose();
    individual.dispose();
  }
});
