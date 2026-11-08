import type { MainModule } from '@mujoco/mujoco';
import { SimEngine } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import { KIT_BARS } from './kitEnvironment';
import { kitRobot, offsetPose } from './kitModel';
import type { KitStart } from './kitJob';

const COLLAPSE_S = 2;

export function collapsedStart(mj: MainModule, model: SimModel): KitStart {
  const engine = new SimEngine(mj, model);
  const JOINT = mj.mjtObj.mjOBJ_JOINT.value;
  const qposOf = (name: string) => engine.model.jnt_qposadr[mj.mj_name2id(engine.model, JOINT, name)];

  try {
    engine.setController({ kind: 'limp' });
    engine.reset(offsetPose(model, KIT_BARS.crouchOffsetDeg));
    engine.step(COLLAPSE_S);

    const joints = Object.fromEntries(model.joints.map((j) => [j.name, engine.data.qpos[qposOf(j.name)]]));
    const z = qposOf(kitRobot(model).root) + 2;

    return { joints, liftM: engine.data.qpos[z] - engine.model.qpos0[z] };
  } finally {
    engine.dispose();
  }
}
