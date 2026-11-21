import type { MainModule } from '@mujoco/mujoco';
import type { SimEngine } from '../sim/engine';
import { seededRandom } from '../skills/arenaWorld';
import { sha256Hex } from '../skills/hash';

export function varyFixtureResistance(mj: MainModule, engine: SimEngine, seed: number): void {
  const { model } = engine;

  for (let joint = 0; joint < model.njnt; joint++) {
    const name = mj.mj_id2name(model, mj.mjtObj.mjOBJ_JOINT.value, joint);

    if (!name?.startsWith('wj_')) continue;

    const random = seededRandom(sha256Hex(`case-fixture|${seed}|${name}`));
    const dof = model.jnt_dofadr[joint];

    model.dof_damping[dof] *= 0.8 + random() * 0.4;
    model.dof_frictionloss[dof] *= 0.8 + random() * 0.4;
    model.jnt_stiffness[joint] *= 0.8 + random() * 0.4;
  }
}
