import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { fixtureModel } from '../skills/fixtureModels';
import { SimEngine } from './engine';
import { pushRequest } from './push';
import { rootPositions } from './rootPositions';

it('measures a shove toward spawn after the rover has already moved away', async () => {
  const mj = await loadMujoco();
  const model = fixtureModel('rover-diff');
  const engine = new SimEngine(mj, model);
  const robot = model.robots[0];

  try {
    const [root] = engine.rootAddresses();

    engine.data.qpos[root] += 1;
    engine.setController({ kind: 'hold' });
    engine.step(1);

    const from = rootPositions(model, engine.poses())[robot.key];
    const before = engine.stats().robots[0].travelled;
    const push = pushRequest(model, robot.key, Math.PI)!;
    const body = mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_BODY.value, robot.root);

    expect(from).toEqual(Array.from(engine.data.xpos.subarray(body * 3, body * 3 + 3)));

    engine.pushRobot(push.robot, push.force);
    engine.step(1.5);

    const to = rootPositions(model, engine.poses())[robot.key];

    expect(Math.hypot(to[0] - from[0], to[1] - from[1])).toBeGreaterThan(0.1);
    expect(engine.stats().robots[0].travelled - before).toBeLessThan(0);
    expect(rootPositions(null, engine.poses())).toEqual({});
    expect(rootPositions(model, null)).toEqual({});
    expect(rootPositions(model, new Float64Array())).toEqual({});
  } finally {
    engine.dispose();
  }
});
